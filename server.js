require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ───────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'shopmanager.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    firstName TEXT, lastName TEXT, email TEXT,
    phone TEXT, city TEXT, address TEXT,
    status TEXT DEFAULT 'Active', notes TEXT, joined TEXT
  );
  CREATE TABLE IF NOT EXISTS customers_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    city TEXT DEFAULT '',
    assigned_to TEXT DEFAULT '',
    status TEXT DEFAULT 'Lead',
    source TEXT DEFAULT '',
    requirement TEXT DEFAULT '',
    followup_action TEXT DEFAULT '',
    next_followup TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS discussions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    author TEXT DEFAULT '',
    type TEXT DEFAULT 'note',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customer_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    interest TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customerName TEXT, product TEXT,
    qty INTEGER DEFAULT 1, amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    payment TEXT DEFAULT 'COD', notes TEXT, date TEXT
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT, category TEXT, name TEXT,
    price TEXT, new_price TEXT,
    availability TEXT DEFAULT 'yes',
    unit TEXT, min_quantity INTEGER DEFAULT 1,
    dimensions TEXT, details TEXT,
    specs TEXT DEFAULT '{}',
    applications TEXT,
    images TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Idempotent data migrations ────────────────────────────────
try {
  db.exec([
    "UPDATE customers_v2 SET status='Contacted' WHERE status='Chasing'",
    "UPDATE customers_v2 SET status='Contacted but No Response' WHERE status='No Response'",
    "UPDATE customers_v2 SET status='Onboarded' WHERE status IN ('Settled','Active')",
    "UPDATE customers_v2 SET status='Lead' WHERE status NOT IN ('Lead','Contacted','Contacted but No Response','Onboarded')",
    "UPDATE customers_v2 SET assigned_to='Rohan' WHERE LOWER(COALESCE(assigned_to,'')) LIKE '%rohan%'",
    "UPDATE customers_v2 SET assigned_to='Saurabh' WHERE LOWER(COALESCE(assigned_to,'')) LIKE '%saurabh%'",
    "UPDATE customers_v2 SET assigned_to='Unassigned' WHERE assigned_to NOT IN ('Rohan','Saurabh','Unassigned') OR assigned_to IS NULL OR assigned_to=''"
  ].join(';'));
} catch(e) { console.log('Migration note:', e.message); }

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Image upload setup ────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '-')),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function genId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// ── Customers ─────────────────────────────────────────────────
app.get('/api/customers', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM customers ORDER BY rowid DESC').all() });
});
app.post('/api/customers', (req, res) => {
  const c = req.body, id = genId();
  db.prepare(`INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, c.firstName, c.lastName, c.email, c.phone, c.city, c.address, c.status || 'Active', c.notes, c.joined || new Date().toLocaleDateString('en-IN'));
  res.json({ success: true, id });
});
app.put('/api/customers/:id', (req, res) => {
  const c = req.body;
  db.prepare(`UPDATE customers SET firstName=?,lastName=?,email=?,phone=?,city=?,address=?,status=?,notes=? WHERE id=?`)
    .run(c.firstName, c.lastName, c.email, c.phone, c.city, c.address, c.status, c.notes, req.params.id);
  res.json({ success: true });
});
app.delete('/api/customers/:id', (req, res) => {
  db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Orders ────────────────────────────────────────────────────
app.get('/api/orders', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM orders ORDER BY rowid DESC').all() });
});
app.post('/api/orders', (req, res) => {
  const o = req.body, id = genId();
  db.prepare(`INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, o.customerName, o.product, o.qty || 1, o.amount || 0, o.status || 'Pending', o.payment || 'COD', o.notes, o.date || new Date().toLocaleDateString('en-IN'));
  res.json({ success: true, id });
});
app.put('/api/orders/:id', (req, res) => {
  const o = req.body;
  db.prepare(`UPDATE orders SET customerName=?,product=?,qty=?,amount=?,status=?,payment=?,notes=? WHERE id=?`)
    .run(o.customerName, o.product, o.qty, o.amount, o.status, o.payment, o.notes, req.params.id);
  res.json({ success: true });
});
app.delete('/api/orders/:id', (req, res) => {
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Customers V2 (CRM) ───────────────────────────────────────
app.get('/api/crm/customers', (req, res) => {
  const { assigned_to, status, search } = req.query;
  let sql = 'SELECT * FROM customers_v2';
  const params = [], conds = [];
  if (assigned_to) { conds.push('assigned_to = ?'); params.push(assigned_to); }
  if (status) { conds.push('status = ?'); params.push(status); }
  if (search) { conds.push('(name LIKE ? OR company LIKE ? OR phone LIKE ?)'); params.push(...Array(3).fill(`%${search}%`)); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY updated_at DESC';
  res.json({ data: db.prepare(sql).all(...params) });
});

app.get('/api/crm/customers/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers_v2 WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const discussions = db.prepare('SELECT * FROM discussions WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
  const interests = db.prepare('SELECT id, interest FROM customer_interests WHERE customer_id=?').all(req.params.id);
  res.json({ ...c, discussions, interests });
});

app.post('/api/crm/customers', (req, res) => {
  const c = req.body;
  const r = db.prepare(`INSERT INTO customers_v2 (name,company,phone,email,city,assigned_to,status,source,requirement,followup_action,next_followup,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(c.name, c.company||'', c.phone||'', c.email||'', c.city||'', c.assigned_to||'', c.status||'Lead', c.source||'', c.requirement||'', c.followup_action||'', c.next_followup||'', c.remark||'');
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/crm/customers/:id', (req, res) => {
  const c = req.body;
  db.prepare(`UPDATE customers_v2 SET name=?,company=?,phone=?,email=?,city=?,assigned_to=?,status=?,requirement=?,followup_action=?,next_followup=?,remark=?,updated_at=datetime('now') WHERE id=?`)
    .run(c.name, c.company||'', c.phone||'', c.email||'', c.city||'', c.assigned_to||'', c.status||'Lead', c.requirement||'', c.followup_action||'', c.next_followup||'', c.remark||'', req.params.id);
  res.json({ success: true });
});

app.delete('/api/crm/customers/:id', (req, res) => {
  db.prepare('DELETE FROM discussions WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM customer_interests WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM customers_v2 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Discussions
app.get('/api/crm/customers/:id/discussions', (req, res) => {
  const rows = db.prepare('SELECT * FROM discussions WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json({ data: rows });
});

app.post('/api/crm/customers/:id/discussions', (req, res) => {
  const { note, author, type } = req.body;
  const r = db.prepare('INSERT INTO discussions (customer_id,note,author,type) VALUES (?,?,?,?)').run(req.params.id, note, author||'', type||'note');
  db.prepare("UPDATE customers_v2 SET updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ success: true, id: r.lastInsertRowid });
});

app.delete('/api/crm/discussions/:id', (req, res) => {
  db.prepare('DELETE FROM discussions WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Interests
app.post('/api/crm/customers/:id/interests', (req, res) => {
  const { interest } = req.body;
  db.prepare('INSERT INTO customer_interests (customer_id,interest) VALUES (?,?)').run(req.params.id, interest);
  res.json({ success: true });
});

app.delete('/api/crm/interests/:id', (req, res) => {
  db.prepare('DELETE FROM customer_interests WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Products ──────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  const { category, search } = req.query;
  let sql = 'SELECT * FROM products';
  const params = [], conds = [];
  if (category) { conds.push('category = ?'); params.push(category); }
  if (search) { conds.push('(name LIKE ? OR sku LIKE ? OR category LIKE ? OR details LIKE ?)'); params.push(...Array(4).fill(`%${search}%`)); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY category, CAST(sku AS INTEGER)';
  res.json({ data: db.prepare(sql).all(...params) });
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

app.post('/api/products', (req, res) => {
  const p = req.body;
  const r = db.prepare(`INSERT INTO products (sku,category,name,price,new_price,availability,unit,min_quantity,dimensions,details,specs,applications,images) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.sku, p.category, p.name, p.price, p.new_price || '', p.availability || 'yes', p.unit, p.min_quantity || 1, p.dimensions || '', p.details || '', JSON.stringify(p.specs || {}), p.applications || '', '[]');
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/products/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE products SET sku=?,category=?,name=?,price=?,new_price=?,availability=?,unit=?,min_quantity=?,dimensions=?,details=?,specs=?,applications=?,updated_at=datetime('now') WHERE id=?`)
    .run(p.sku, p.category, p.name, p.price, p.new_price || '', p.availability, p.unit, p.min_quantity, p.dimensions || '', p.details || '', JSON.stringify(p.specs || {}), p.applications || '', req.params.id);
  res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT images FROM products WHERE id=?').get(req.params.id);
  if (p) {
    JSON.parse(p.images || '[]').forEach(f => {
      const fp = path.join(uploadsDir, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
  }
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Image upload
app.post('/api/products/:id/images', upload.array('images', 10), (req, res) => {
  const p = db.prepare('SELECT images FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const existing = JSON.parse(p.images || '[]');
  const newFiles = req.files.map(f => f.filename);
  const all = [...existing, ...newFiles];
  db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(all), req.params.id);
  res.json({ success: true, images: all });
});

app.delete('/api/products/:id/images/:filename', (req, res) => {
  const p = db.prepare('SELECT images FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const images = JSON.parse(p.images || '[]').filter(f => f !== req.params.filename);
  db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(images), req.params.id);
  const fp = path.join(uploadsDir, req.params.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ success: true });
});

// ── AI Analysis ───────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { question } = req.body;
    const customers = db.prepare('SELECT * FROM customers').all();
    const orders = db.prepare('SELECT * FROM orders').all();
    const products = db.prepare('SELECT id,sku,category,name,price,availability FROM products').all();
    const totalRevenue = orders.reduce((s, o) => s + (o.amount || 0), 0);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: 'You are a smart ecommerce business analyst. Answer questions about the business data clearly and concisely with specific numbers. Keep answers under 150 words.',
      messages: [{
        role: 'user',
        content: `Question: ${question}

Business Data:
- Customers: ${customers.length}
- Orders: ${orders.length}, Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
- Products: ${products.length} across ${[...new Set(products.map(p => p.category))].join(', ')}
- Pending orders: ${orders.filter(o => o.status === 'Pending').length}

Customers: ${JSON.stringify(customers.slice(0, 20))}
Orders: ${JSON.stringify(orders.slice(0, 30))}
Products: ${JSON.stringify(products)}`
      }]
    });
    res.json({ answer: message.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI: extract customer fields from voice transcript ─────────
app.post('/api/ai/extract-customer', async (req, res) => {
  try {
    const { transcript } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 512,
      system: 'Extract customer info from a sales call transcript. Return ONLY valid JSON, no markdown or explanation.',
      messages: [{ role: 'user', content: `Transcript: "${transcript}"\n\nReturn JSON with these keys (use empty string if not found): name, company, phone, email, city, requirement, next_followup (YYYY-MM-DD if a date is mentioned, else ""), remark, status ("Lead"|"Contacted"|"Contacted but No Response"|"Onboarded")` }]
    });
    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    res.json(match ? JSON.parse(match[0]) : {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: convert voice transcript into a clean CRM note ────────
app.post('/api/ai/extract-note', async (req, res) => {
  try {
    const { transcript, customerName } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 200,
      system: 'Convert a raw voice note into a concise, professional CRM note. 1-3 sentences. Past tense. Capture key points: customer interest, objections, next steps.',
      messages: [{ role: 'user', content: `Customer: ${customerName || 'unknown'}\nVoice note: "${transcript}"\n\nWrite the CRM note:` }]
    });
    res.json({ note: msg.content[0].text.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard Stats ───────────────────────────────────────────
function buildCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\r\n');
}

app.get('/api/dashboard/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const customers = db.prepare('SELECT assigned_to, status, next_followup FROM customers_v2').all();
  const byAssignee = { Rohan: 0, Saurabh: 0, Unassigned: 0 };
  const byStatus = { Lead: 0, Contacted: 0, 'Contacted but No Response': 0, Onboarded: 0 };
  let overdue = 0, dueToday = 0;
  customers.forEach(c => {
    byAssignee[c.assigned_to] = (byAssignee[c.assigned_to] || 0) + 1;
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (c.next_followup) {
      if (c.next_followup < today) overdue++;
      else if (c.next_followup === today) dueToday++;
    }
  });
  const recentActivity = db.prepare(`SELECT d.id,d.note,d.author,d.type,d.created_at,c.name as customer_name,c.assigned_to FROM discussions d JOIN customers_v2 c ON c.id=d.customer_id ORDER BY d.created_at DESC LIMIT 12`).all();
  const todayFollowups = db.prepare(`SELECT id,name,company,phone,assigned_to,status,next_followup,requirement FROM customers_v2 WHERE next_followup=? ORDER BY assigned_to`).all(today);
  const overdueList = db.prepare(`SELECT id,name,company,phone,assigned_to,status,next_followup FROM customers_v2 WHERE next_followup<? AND next_followup!='' ORDER BY next_followup LIMIT 20`).all(today);
  res.json({ total: customers.length, byAssignee, byStatus, overdue, dueToday, recentActivity, todayFollowups, overdueList });
});

// ── Download CSV ──────────────────────────────────────────────
app.get('/api/download/customers.csv', (req, res) => {
  const rows = db.prepare('SELECT id,name,company,phone,email,city,assigned_to,status,requirement,next_followup,remark,created_at FROM customers_v2 ORDER BY id').all();
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.send(buildCSV(rows));
});

app.get('/api/download/products.csv', (req, res) => {
  const rows = db.prepare('SELECT id,sku,category,name,price,new_price,availability,unit,min_quantity,dimensions,details,applications FROM products ORDER BY category, CAST(sku AS INTEGER)').all();
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="products_sku.csv"');
  res.send(buildCSV(rows));
});

app.get('/api/download/query/:name', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const queries = {
    'due-today': () => db.prepare("SELECT id,name,company,phone,assigned_to,status,next_followup,requirement FROM customers_v2 WHERE next_followup=? ORDER BY assigned_to").all(today),
    'overdue': () => db.prepare("SELECT id,name,company,phone,assigned_to,status,next_followup,requirement FROM customers_v2 WHERE next_followup<? AND next_followup!='' ORDER BY next_followup").all(today),
    'unassigned': () => db.prepare("SELECT id,name,company,phone,status,requirement,created_at FROM customers_v2 WHERE assigned_to='Unassigned' ORDER BY created_at DESC").all(),
    'no-response': () => db.prepare("SELECT id,name,company,phone,assigned_to,next_followup,requirement FROM customers_v2 WHERE status='Contacted but No Response' ORDER BY next_followup").all(),
    'onboarded': () => db.prepare("SELECT id,name,company,phone,email,city,assigned_to,requirement FROM customers_v2 WHERE status='Onboarded' ORDER BY name").all(),
    'leads': () => db.prepare("SELECT id,name,company,phone,assigned_to,created_at,requirement FROM customers_v2 WHERE status='Lead' ORDER BY created_at DESC").all(),
  };
  const fn = queries[req.params.name];
  if (!fn) return res.status(404).json({ error: 'Unknown query' });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.csv"`);
  res.send(buildCSV(fn()));
});

// ── Table Viewer ──────────────────────────────────────────────
const ALLOWED_TABLES = ['customers_v2', 'discussions', 'customer_interests', 'orders', 'products'];

app.get('/api/tables', (req, res) => {
  const result = ALLOWED_TABLES.map(t => ({
    name: t,
    count: db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c,
    columns: db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name),
  }));
  res.json({ data: result });
});

app.get('/api/tables/:name', (req, res) => {
  if (!ALLOWED_TABLES.includes(req.params.name)) return res.status(403).json({ error: 'Not allowed' });
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const total = db.prepare(`SELECT COUNT(*) as c FROM ${req.params.name}`).get().c;
  const rows = db.prepare(`SELECT * FROM ${req.params.name} LIMIT ? OFFSET ?`).all(limit, offset);
  res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
});

// ── AI: suggest product interests from notes ──────────────────
app.post('/api/ai/suggest-interests', async (req, res) => {
  try {
    const { customerId } = req.body;
    const discussions = db.prepare('SELECT note FROM discussions WHERE customer_id=? ORDER BY created_at DESC LIMIT 20').all(customerId);
    if (!discussions.length) return res.json({ suggestions: [] });
    const products = db.prepare('SELECT id,sku,name,category,details FROM products').all();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 400,
      system: 'You are a sales assistant. Read discussion notes and identify products the customer is interested in. Return ONLY valid JSON, no markdown.',
      messages: [{ role: 'user', content: `Discussion notes:\n${discussions.map(d => '- ' + d.note).join('\n')}\n\nProduct catalog:\n${products.map(p => `[ID:${p.id}] SKU:${p.sku} - ${p.name} (${p.category}): ${(p.details||'').slice(0,80)}`).join('\n')}\n\nReturn JSON array (max 5) of products the customer seems interested in based on the notes. Format: [{"id":1,"name":"Product Name","sku":"123","reason":"why they want it"}]` }]
    });
    const match = msg.content[0].text.match(/\[[\s\S]*\]/);
    res.json({ suggestions: match ? JSON.parse(match[0]) : [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Image rename to sku_productname ───────────────────────────
app.post('/api/products/:id/rename-images', (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const images = JSON.parse(p.images || '[]');
    const safeSku = (p.sku || 'sku').replace(/[^a-zA-Z0-9]/g, '_');
    const safeName = (p.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const newImages = images.map((oldFile, i) => {
      const ext = path.extname(oldFile) || '.jpg';
      const suffix = i > 0 ? `_${i + 1}` : '';
      const newFile = `${safeSku}_${safeName}${suffix}${ext}`;
      const oldPath = path.join(uploadsDir, oldFile);
      const newPath = path.join(uploadsDir, newFile);
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
      return fs.existsSync(newPath) ? newFile : oldFile;
    });
    db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(newImages), req.params.id);
    res.json({ success: true, images: newImages });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Arambhika Enablers running on http://localhost:${PORT}`));

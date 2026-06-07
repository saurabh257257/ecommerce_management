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
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1'
  );
  CREATE TABLE IF NOT EXISTS customer_tags (
    customer_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (customer_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#4f46e5',
    role TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS customer_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#0ea5e9',
    sort_order INTEGER DEFAULT 0
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
  CREATE TABLE IF NOT EXISTS wa_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER DEFAULT NULL,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL,
    body TEXT DEFAULT '',
    msg_type TEXT DEFAULT 'text',
    wa_msg_id TEXT DEFAULT '',
    status TEXT DEFAULT '',
    author TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Idempotent schema migrations ─────────────────────────────
try { db.exec("ALTER TABLE customer_interests ADD COLUMN quantity TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN photo TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN state TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN gst_number TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE products ADD COLUMN flag_available INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE customers_v2 ADD COLUMN customer_type TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE products ADD COLUMN flag_out_of_stock INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE products ADD COLUMN flag_for_internal INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE team_members ADD COLUMN password TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_phone ON wa_messages(phone)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_customer ON wa_messages(customer_id)"); } catch(e) {}

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

// Seed initial team members
try { db.exec("INSERT OR IGNORE INTO team_members (name,color,role) VALUES ('Rohan','#1d4ed8','Sales'),('Saurabh','#15803d','Sales')"); } catch(e) {}
// Seed default statuses
try { db.exec("INSERT OR IGNORE INTO statuses (name,color,sort_order) VALUES ('Lead','#f59e0b',1),('Contacted','#3b82f6',2),('Contacted but No Response','#f97316',3),('Onboarded','#22c55e',4)"); } catch(e) {}
// Seed default customer types
try { db.exec("INSERT OR IGNORE INTO customer_types (name,color,sort_order) VALUES ('EV Battery','#22c55e',1),('Supplier','#f97316',2),('Retailer','#3b82f6',3),('Distributor','#8b5cf6',4)"); } catch(e) {}

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname)));

// ── Image upload setup ────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '-')),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

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

// ── Tags ──────────────────────────────────────────────────────
app.get('/api/tags', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM tags ORDER BY name').all() });
});
app.post('/api/tags', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = db.prepare('INSERT INTO tags (name, color) VALUES (?,?)').run(name.trim(), color || '#6366f1');
    res.json({ success: true, id: r.lastInsertRowid, name: name.trim(), color: color || '#6366f1' });
  } catch(e) { res.status(400).json({ error: 'Tag already exists' }); }
});
app.delete('/api/tags/:id', (req, res) => {
  db.prepare('DELETE FROM customer_tags WHERE tag_id=?').run(req.params.id);
  db.prepare('DELETE FROM tags WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Statuses ─────────────────────────────────────────────────
app.get('/api/statuses', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM statuses ORDER BY sort_order, name').all() });
});
app.post('/api/statuses', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM statuses').get().m || 0;
    const r = db.prepare('INSERT INTO statuses (name, color, sort_order) VALUES (?,?,?)').run(name.trim(), color || '#6366f1', maxOrder + 1);
    res.json({ success: true, id: r.lastInsertRowid, name: name.trim(), color: color || '#6366f1' });
  } catch(e) { res.status(400).json({ error: 'Status already exists' }); }
});
app.delete('/api/statuses/:id', (req, res) => {
  const s = db.prepare('SELECT name FROM statuses WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM statuses WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Customer Types ────────────────────────────────────────────
app.get('/api/customer-types', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM customer_types ORDER BY sort_order, name').all() });
});
app.post('/api/customer-types', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM customer_types').get().m || 0;
    const r = db.prepare('INSERT INTO customer_types (name, color, sort_order) VALUES (?,?,?)').run(name.trim(), color || '#0ea5e9', maxOrder + 1);
    res.json({ success: true, id: r.lastInsertRowid, name: name.trim(), color: color || '#0ea5e9' });
  } catch(e) { res.status(400).json({ error: 'Type already exists' }); }
});
app.delete('/api/customer-types/:id', (req, res) => {
  db.prepare('DELETE FROM customer_types WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Team Members ─────────────────────────────────────────────
app.get('/api/team-members', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM team_members ORDER BY id').all() });
});
app.post('/api/team-members', (req, res) => {
  const { name, color, role, password } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = db.prepare('INSERT INTO team_members (name,color,role,password) VALUES (?,?,?,?)').run(name.trim(), color||'#4f46e5', role||'', password||'');
    res.json({ success:true, id:r.lastInsertRowid, name:name.trim(), color:color||'#4f46e5', role:role||'', password:password||'' });
  } catch(e) { res.status(400).json({ error:'Name already exists' }); }
});
app.put('/api/team-members/:id', (req, res) => {
  const { color, role, password } = req.body;
  if (password !== undefined) {
    db.prepare('UPDATE team_members SET color=?,role=?,password=? WHERE id=?').run(color||'#4f46e5', role||'', password||'', req.params.id);
  } else {
    db.prepare('UPDATE team_members SET color=?,role=? WHERE id=?').run(color||'#4f46e5', role||'', req.params.id);
  }
  res.json({ success:true });
});
app.delete('/api/team-members/:id', (req, res) => {
  db.prepare('DELETE FROM team_members WHERE id=?').run(req.params.id);
  res.json({ success:true });
});

// ── Auth: single-password login → resolves to admin or team member ──
const ADMIN_PASSWORD = 'admin';
app.post('/api/auth/login', (req, res) => {
  const password = (req.body && req.body.password || '').trim();
  if (!password) return res.status(400).json({ success:false, error:'Password required' });
  if (password === ADMIN_PASSWORD) {
    return res.json({ success:true, role:'admin', name:'Admin' });
  }
  const m = db.prepare("SELECT id,name FROM team_members WHERE password=? AND password!=''").get(password);
  if (m) return res.json({ success:true, role:'member', name:m.name, id:m.id });
  res.status(401).json({ success:false, error:'Incorrect password' });
});

// ── Customer tags ─────────────────────────────────────────────
app.post('/api/crm/customers/:id/tags', (req, res) => {
  const { tag_id } = req.body;
  db.prepare('INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?,?)').run(req.params.id, tag_id);
  res.json({ success: true });
});
app.delete('/api/crm/customers/:id/tags/:tagId', (req, res) => {
  db.prepare('DELETE FROM customer_tags WHERE customer_id=? AND tag_id=?').run(req.params.id, req.params.tagId);
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
  const customers = db.prepare(sql).all(...params);
  if (customers.length) {
    const ids = customers.map(c => c.id);
    const tagRows = db.prepare(`SELECT ct.customer_id, t.id, t.name, t.color FROM customer_tags ct JOIN tags t ON ct.tag_id=t.id WHERE ct.customer_id IN (${ids.map(()=>'?').join(',')})`).all(...ids);
    const byC = {};
    tagRows.forEach(t => { if (!byC[t.customer_id]) byC[t.customer_id]=[]; byC[t.customer_id].push({id:t.id,name:t.name,color:t.color}); });
    customers.forEach(c => { c.tags = byC[c.id] || []; });
  }
  res.json({ data: customers });
});

app.get('/api/crm/customers/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers_v2 WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const discussions = db.prepare('SELECT * FROM discussions WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
  const interests = db.prepare('SELECT id, interest, quantity FROM customer_interests WHERE customer_id=?').all(req.params.id);
  const tags = db.prepare('SELECT t.id, t.name, t.color FROM customer_tags ct JOIN tags t ON ct.tag_id=t.id WHERE ct.customer_id=? ORDER BY t.name').all(req.params.id);
  res.json({ ...c, discussions, interests, tags });
});

app.post('/api/crm/customers', (req, res) => {
  const c = req.body;
  const r = db.prepare(`INSERT INTO customers_v2 (name,company,phone,email,city,state,gst_number,assigned_to,status,source,requirement,followup_action,next_followup,remark,customer_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(c.name, c.company||'', c.phone||'', c.email||'', c.city||'', c.state||'', c.gst_number||'', c.assigned_to||'', c.status||'Lead', c.source||'', c.requirement||'', c.followup_action||'', c.next_followup||'', c.remark||'', c.customer_type||'');
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/crm/customers/:id', (req, res) => {
  const c = req.body;
  db.prepare(`UPDATE customers_v2 SET name=?,company=?,phone=?,email=?,city=?,state=?,gst_number=?,assigned_to=?,status=?,source=?,requirement=?,followup_action=?,next_followup=?,remark=?,customer_type=?,updated_at=datetime('now') WHERE id=?`)
    .run(c.name, c.company||'', c.phone||'', c.email||'', c.city||'', c.state||'', c.gst_number||'', c.assigned_to||'', c.status||'Lead', c.source||'', c.requirement||'', c.followup_action||'', c.next_followup||'', c.remark||'', c.customer_type||'', req.params.id);
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

// Customer photo upload
app.post('/api/crm/customers/:id/photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const row = db.prepare('SELECT photo FROM customers_v2 WHERE id=?').get(req.params.id);
  if (row?.photo) {
    const fp = path.join(uploadsDir, row.photo);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch(e) {}
  }
  db.prepare("UPDATE customers_v2 SET photo=?,updated_at=datetime('now') WHERE id=?").run(req.file.filename, req.params.id);
  res.json({ success: true, photo: req.file.filename });
});

// Interests
app.post('/api/crm/customers/:id/interests', (req, res) => {
  const { interest, quantity, sku } = req.body;
  const label = sku ? `[${sku}] ${interest}` : interest;
  const r = db.prepare('INSERT INTO customer_interests (customer_id,interest,quantity) VALUES (?,?,?)').run(req.params.id, label, quantity||'');
  res.json({ success: true, id: r.lastInsertRowid });
});

app.patch('/api/crm/interests/:id', (req, res) => {
  const { quantity } = req.body;
  db.prepare('UPDATE customer_interests SET quantity=? WHERE id=?').run(quantity||'', req.params.id);
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
  const r = db.prepare(`INSERT INTO products (sku,category,name,price,new_price,availability,unit,min_quantity,dimensions,details,specs,applications,images,flag_available,flag_out_of_stock,flag_for_internal) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.sku, p.category, p.name, p.price, p.new_price || '', p.availability || 'yes', p.unit, p.min_quantity || 1, p.dimensions || '', p.details || '', JSON.stringify(p.specs || {}), p.applications || '', '[]', p.flag_available?1:0, p.flag_out_of_stock?1:0, p.flag_for_internal?1:0);
  res.json({ success: true, id: r.lastInsertRowid });
});

app.put('/api/products/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE products SET sku=?,category=?,name=?,price=?,new_price=?,availability=?,unit=?,min_quantity=?,dimensions=?,details=?,specs=?,applications=?,flag_available=?,flag_out_of_stock=?,flag_for_internal=?,updated_at=datetime('now') WHERE id=?`)
    .run(p.sku, p.category, p.name, p.price, p.new_price || '', p.availability, p.unit, p.min_quantity, p.dimensions || '', p.details || '', JSON.stringify(p.specs || {}), p.applications || '', p.flag_available?1:0, p.flag_out_of_stock?1:0, p.flag_for_internal?1:0, req.params.id);
  res.json({ success: true });
});

app.patch('/api/products/:id/flags', (req, res) => {
  const { flag_available, flag_out_of_stock, flag_for_internal } = req.body;
  db.prepare(`UPDATE products SET flag_available=?,flag_out_of_stock=?,flag_for_internal=?,updated_at=datetime('now') WHERE id=?`)
    .run(flag_available?1:0, flag_out_of_stock?1:0, flag_for_internal?1:0, req.params.id);
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
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const existing = JSON.parse(p.images || '[]');
  const safeId = String(p.id);
  const safeSku = (p.sku || 'sku').replace(/[^a-zA-Z0-9]/g, '_');
  const safeCat = (p.category || 'cat').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const safeName = (p.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const newFiles = req.files.map((f, i) => {
    const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
    const idx = existing.length + i + 1;
    const newName = `${safeId}_${safeSku}_${safeCat}_${safeName}_${idx}${ext}`;
    try {
      fs.renameSync(path.join(uploadsDir, f.filename), path.join(uploadsDir, newName));
      return newName;
    } catch(e) {
      console.error('Image rename failed:', e.message);
      return f.filename;
    }
  });
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

// ── AI: customer summary ──────────────────────────────────────
app.post('/api/ai/customer-summary', async (req, res) => {
  try {
    const { customerId } = req.body;
    const c = db.prepare('SELECT * FROM customers_v2 WHERE id=?').get(customerId);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const discs = db.prepare("SELECT note,type,created_at FROM discussions WHERE customer_id=? AND type!='activity' ORDER BY created_at DESC LIMIT 20").all(customerId);
    const ints = db.prepare('SELECT interest,quantity FROM customer_interests WHERE customer_id=?').all(customerId);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 350,
      system: 'Write a concise CRM customer summary (max 120 words). Cover: who they are, what they need, their current status, product interests, and one clear recommended next action. Be professional and actionable.',
      messages: [{ role: 'user', content: `Name: ${c.name} | Company: ${c.company||'—'} | City: ${c.city||'—'} | Source: ${c.source||'—'}
Status: ${c.status} | Assigned: ${c.assigned_to} | Follow-up: ${c.next_followup||'not set'}
Requirement: ${c.requirement||'not specified'}
Products interested: ${ints.map(i=>i.interest+(i.quantity?' × '+i.quantity:'')).join('; ')||'none'}
Discussion notes (${discs.length}):
${discs.slice(0,8).map(d=>`• [${d.type}] ${d.note}`).join('\n')||'No notes yet'}

Write the summary:` }]
    });
    res.json({ summary: msg.content[0].text.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: quick update from voice transcript ────────────────────
app.post('/api/ai/quick-update', async (req, res) => {
  try {
    const { transcript, customer, products } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 700,
      system: 'You are a CRM assistant. Based on a voice note about a customer call, suggest updates. Return ONLY valid JSON, no markdown.',
      messages: [{ role: 'user', content: `Customer record: ${JSON.stringify({name:customer.name,status:customer.status,assigned_to:customer.assigned_to,requirement:customer.requirement,next_followup:customer.next_followup})}

Voice note: "${transcript}"

Available products (for product_interests): ${JSON.stringify((products||[]).slice(0,40).map(p=>({id:p.id,sku:p.sku,name:p.name,category:p.category})))}

Extract from the voice note and return JSON with ONLY the fields clearly mentioned:
{
  "status": "Lead|Contacted|Contacted but No Response|Onboarded",
  "next_followup": "YYYY-MM-DD",
  "requirement": "full requirement text",
  "note": "discussion note to add",
  "note_type": "call|note|meeting|message",
  "product_interests": [{"id": 1, "sku": "123", "name": "Product Name", "quantity": "100 pcs"}]
}
Omit any field not clearly mentioned in the transcript. Today is ${new Date().toISOString().slice(0,10)}.` }]
    });
    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    res.json(match ? JSON.parse(match[0]) : {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: daily brief for team member ──────────────────────────────────
app.post('/api/ai/daily-brief', async (req, res) => {
  try {
    const { person } = req.body;
    if (!person) return res.status(400).json({ error: 'person required' });
    const today = new Date().toISOString().split('T')[0];
    const customers = db.prepare(`
      SELECT c.id, c.name, c.company, c.phone, c.status, c.next_followup, c.requirement,
        (SELECT note FROM discussions WHERE customer_id=c.id AND type!='activity' ORDER BY created_at DESC LIMIT 1) as last_note,
        (SELECT created_at FROM discussions WHERE customer_id=c.id AND type!='activity' ORDER BY created_at DESC LIMIT 1) as last_contact
      FROM customers_v2 c WHERE c.assigned_to=? ORDER BY c.next_followup ASC NULLS LAST
    `).all(person);
    const overdue   = customers.filter(c => c.next_followup && c.next_followup < today);
    const dueToday  = customers.filter(c => c.next_followup === today);
    const upcoming  = customers.filter(c => c.next_followup && c.next_followup > today);
    const noDate    = customers.filter(c => !c.next_followup && c.status !== 'Onboarded');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 900,
      system: `You are a sales coach writing a sharp daily briefing for ${person}. Be direct, specific, no fluff. Use short paragraphs. Today is ${today}.`,
      messages: [{ role: 'user', content: `Generate today's briefing for ${person}.

OVERDUE (${overdue.length}): ${overdue.slice(0,6).map(c=>`${c.name} [${c.status}, due ${c.next_followup}${c.last_note?', last note: '+c.last_note.slice(0,40):''}]`).join(' | ')}
DUE TODAY (${dueToday.length}): ${dueToday.map(c=>`${c.name} [${c.status}${c.requirement?', needs: '+c.requirement.slice(0,40):''}]`).join(' | ')}
UPCOMING THIS WEEK (${upcoming.filter(c=>c.next_followup<=(new Date(Date.now()+7*86400000).toISOString().slice(0,10))).length}): ${upcoming.slice(0,4).map(c=>`${c.name} [${c.next_followup}]`).join(' | ')}
NO FOLLOW-UP DATE (${noDate.length}): ${noDate.slice(0,5).map(c=>c.name).join(', ')}
TOTAL MANAGED: ${customers.length}

Write:
1. One opening line (today's overview, 1 sentence)
2. "TODAY'S PRIORITIES" — bullet list of specific actions (overdue first, then due today)
3. "THIS WEEK" — 2-3 lines about upcoming customers
4. "ATTENTION NEEDED" — flag customers with no follow-up date set (if any)
Keep it under 250 words. Be specific — use customer names.` }]
    });
    res.json({ brief: msg.content[0].text.trim(), stats: { total: customers.length, overdue: overdue.length, dueToday: dueToday.length, noDate: noDate.length } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── AI: Extract visiting card info ───────────────────────────────────
app.post('/api/ai/extract-card', async (req, res) => {
  try {
    const { imageBase64, mimeType, audioText } = req.body;
    if (!imageBase64 && !audioText) return res.status(400).json({ success: false, error: 'Provide image or audio text' });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const content = [];
    if (imageBase64) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } });
    }
    let prompt = `Extract contact/customer details from this visiting card image.
Return ONLY a JSON object with these exact fields (use empty string "" if not found):
name, company, phone, email, city, state, gst_number, designation, website
No explanation, no markdown — just the raw JSON object.`;
    if (audioText) {
      prompt += `\n\nAdditional spoken notes from the user: "${audioText}"\nUse these to supplement missing fields. Put any extra context in a "notes" field.`;
    }
    if (!imageBase64 && audioText) {
      prompt = `Extract customer details from these spoken notes: "${audioText}"
Return ONLY a JSON object with: name, company, phone, email, city, state, gst_number, designation, website, notes
No explanation — just raw JSON.`;
    }
    content.push({ type: 'text', text: prompt });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 400,
      messages: [{ role: 'user', content }]
    });
    const text = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : {};
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// WhatsApp Cloud API integration
// ══════════════════════════════════════════════════════════════════
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WA_API = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;

// Normalize phone to last-10-digits for matching across formats (+91-..., 91..., 0..., spaces, dashes)
function waNorm(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-10);
}
function findCustomerByPhone(phone) {
  const norm = waNorm(phone);
  if (!norm) return null;
  const rows = db.prepare("SELECT id, name, phone FROM customers_v2").all();
  return rows.find(r => waNorm(r.phone) === norm) || null;
}
function waToE164(phone) {
  // Build a "to" number for the Graph API: digits only, prefixed with 91 if it's a bare 10-digit Indian number
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits;
}

async function waApiCall(body) {
  const r = await fetch(WA_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'WhatsApp API error');
  return j;
}

// Send a free-form text message (only works inside the 24-hour customer-service window)
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { customerId, phone, text, author } = req.body;
    if (!phone || !text) return res.status(400).json({ error: 'phone and text required' });
    const to = waToE164(phone);
    const result = await waApiCall({
      messaging_product: 'whatsapp', to, type: 'text', text: { body: text }
    });
    const waId = result.messages?.[0]?.id || '';
    db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
      .run(customerId || null, phone, 'out', text, 'text', waId, 'sent', author || '');
    res.json({ success: true, wa_msg_id: waId });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Send a pre-approved template message (required for first contact / outside 24h window)
app.post('/api/whatsapp/send-template', async (req, res) => {
  try {
    const { customerId, phone, template, language, params, author } = req.body;
    if (!phone || !template) return res.status(400).json({ error: 'phone and template required' });
    const to = waToE164(phone);
    const components = (params && params.length) ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }] : [];
    const result = await waApiCall({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: template, language: { code: language || 'en_US' }, components }
    });
    const waId = result.messages?.[0]?.id || '';
    db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
      .run(customerId || null, phone, 'out', `[template: ${template}]`, 'template', waId, 'sent', author || '');
    res.json({ success: true, wa_msg_id: waId });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Broadcast a template message to multiple customers
app.post('/api/whatsapp/broadcast', async (req, res) => {
  try {
    const { customerIds, template, language, paramsFn, author } = req.body;
    if (!Array.isArray(customerIds) || !customerIds.length || !template) {
      return res.status(400).json({ error: 'customerIds[] and template required' });
    }
    const results = [];
    for (const cid of customerIds) {
      const c = db.prepare('SELECT id,name,phone FROM customers_v2 WHERE id=?').get(cid);
      if (!c || !c.phone) { results.push({ id: cid, ok: false, error: 'no phone' }); continue; }
      try {
        const to = waToE164(c.phone);
        const params = paramsFn === 'name' ? [{ type: 'text', text: c.name }] : [];
        const result = await waApiCall({
          messaging_product: 'whatsapp', to, type: 'template',
          template: { name: template, language: { code: language || 'en_US' }, components: params.length ? [{ type: 'body', parameters: params }] : [] }
        });
        const waId = result.messages?.[0]?.id || '';
        db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
          .run(c.id, c.phone, 'out', `[broadcast template: ${template}]`, 'template', waId, 'sent', author || '');
        results.push({ id: cid, ok: true });
      } catch(e) { results.push({ id: cid, ok: false, error: e.message }); }
      await new Promise(r => setTimeout(r, 250)); // light rate limiting
    }
    res.json({ success: true, results });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Get chat history for a customer
app.get('/api/whatsapp/messages/:customerId', (req, res) => {
  const rows = db.prepare('SELECT * FROM wa_messages WHERE customer_id=? ORDER BY id ASC').all(req.params.customerId);
  res.json(rows);
});

// Get all conversations grouped by phone (for an inbox view)
app.get('/api/whatsapp/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT phone, customer_id, MAX(id) as last_id, COUNT(*) as msg_count
    FROM wa_messages GROUP BY phone ORDER BY last_id DESC
  `).all();
  const withLast = rows.map(r => {
    const last = db.prepare('SELECT * FROM wa_messages WHERE id=?').get(r.last_id);
    const cust = r.customer_id ? db.prepare('SELECT id,name,company FROM customers_v2 WHERE id=?').get(r.customer_id) : null;
    return { ...r, last_message: last, customer: cust };
  });
  res.json(withLast);
});

// Webhook verification (Meta calls this with GET when you set up the webhook URL)
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Webhook receiver (Meta POSTs incoming messages + status updates here)
app.post('/api/whatsapp/webhook', (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    if (value?.messages) {
      for (const m of value.messages) {
        const fromPhone = m.from; // e.g. "918886772827"
        const body = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || `[${m.type}]`;
        const cust = findCustomerByPhone(fromPhone);
        db.prepare(`INSERT INTO wa_messages (customer_id, phone, direction, body, msg_type, wa_msg_id, status, author) VALUES (?,?,?,?,?,?,?,?)`)
          .run(cust ? cust.id : null, fromPhone, 'in', body, m.type || 'text', m.id || '', 'received', '');
      }
    }
    if (value?.statuses) {
      for (const s of value.statuses) {
        db.prepare(`UPDATE wa_messages SET status=? WHERE wa_msg_id=?`).run(s.status, s.id);
      }
    }
    res.sendStatus(200);
  } catch(e) {
    console.log('WA webhook error:', e.message);
    res.sendStatus(200); // always 200 so Meta doesn't retry-storm
  }
});

// ── Image rename to id_sku_category_name_N ───────────────────────────
app.post('/api/products/:id/rename-images', (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const images = JSON.parse(p.images || '[]');
    const safeId = String(p.id);
    const safeSku = (p.sku || 'sku').replace(/[^a-zA-Z0-9]/g, '_');
    const safeCat = (p.category || 'cat').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    const safeName = (p.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const newImages = images.map((oldFile, i) => {
      const ext = path.extname(oldFile).toLowerCase() || '.jpg';
      const newFile = `${safeId}_${safeSku}_${safeCat}_${safeName}_${i + 1}${ext}`;
      const oldPath = path.join(uploadsDir, oldFile);
      const newPath = path.join(uploadsDir, newFile);
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
      return fs.existsSync(newPath) ? newFile : oldFile;
    });
    db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(newImages), req.params.id);
    res.json({ success: true, images: newImages });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Download all product images as ZIP ───────────────────────
app.get('/api/download/images.zip', (req, res) => {
  try {
    const products = db.prepare('SELECT id, sku, category, name, images FROM products').all();
    const finalFiles = [];

    for (const p of products) {
      const imgs = JSON.parse(p.images || '[]');
      if (!imgs.length) continue;
      const safeId = String(p.id);
      const safeSku = (p.sku || 'sku').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCat = (p.category || 'cat').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
      const safeName = (p.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      const renamed = [];
      imgs.forEach((oldFile, i) => {
        const ext = path.extname(oldFile).toLowerCase() || '.jpg';
        const newFile = `${safeId}_${safeSku}_${safeCat}_${safeName}_${i + 1}${ext}`;
        const oldPath = path.join(uploadsDir, oldFile);
        const newPath = path.join(uploadsDir, newFile);
        if (!fs.existsSync(oldPath)) { renamed.push(null); return; }
        if (oldFile !== newFile && !fs.existsSync(newPath)) {
          try { fs.renameSync(oldPath, newPath); renamed.push(newFile); }
          catch(e) { renamed.push(oldFile); return; }
        } else {
          renamed.push(fs.existsSync(newPath) ? newFile : oldFile);
        }
      });
      // Update DB if any file was renamed
      const cleanRenamed = renamed.filter(Boolean);
      if (JSON.stringify(cleanRenamed) !== JSON.stringify(imgs)) {
        db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify(cleanRenamed), p.id);
      }
      cleanRenamed.forEach(f => { if (fs.existsSync(path.join(uploadsDir, f))) finalFiles.push(f); });
    }

    if (!finalFiles.length) return res.status(404).json({ error: 'No product images found' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="product-images.zip"');
    const { spawn } = require('child_process');
    const zip = spawn('zip', ['-j', '-', ...finalFiles], { cwd: uploadsDir });
    zip.stdout.pipe(res);
    zip.stderr.on('data', () => {});
    zip.on('error', () => res.status(500).end());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Arambhika Enablers running on http://localhost:${PORT}`));

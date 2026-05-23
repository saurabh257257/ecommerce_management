require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ─────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'shopmanager.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    firstName TEXT, lastName TEXT, email TEXT UNIQUE,
    phone TEXT, city TEXT, address TEXT,
    status TEXT DEFAULT 'Active', notes TEXT,
    joined TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customerName TEXT, product TEXT,
    qty INTEGER DEFAULT 1, amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    payment TEXT DEFAULT 'COD',
    notes TEXT, date TEXT
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function genId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// ── Customers ──────────────────────────────────────────────────
app.get('/api/customers', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM customers ORDER BY rowid DESC').all() });
});

app.post('/api/customers', (req, res) => {
  const c = req.body;
  const id = genId();
  db.prepare(`INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, c.firstName, c.lastName, c.email, c.phone, c.city, c.address,
         c.status || 'Active', c.notes, c.joined || new Date().toLocaleDateString('en-IN'));
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
  const o = req.body;
  const id = genId();
  db.prepare(`INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, o.customerName, o.product, o.qty || 1, o.amount || 0,
         o.status || 'Pending', o.payment || 'COD', o.notes,
         o.date || new Date().toLocaleDateString('en-IN'));
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

// ── AI Analysis ───────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { question } = req.body;
    const customers = db.prepare('SELECT * FROM customers').all();
    const orders = db.prepare('SELECT * FROM orders').all();
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
- Orders: ${orders.length}
- Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
- Pending orders: ${orders.filter(o => o.status === 'Pending').length}
- Processing orders: ${orders.filter(o => o.status === 'Processing').length}

Customers: ${JSON.stringify(customers.slice(0, 30))}
Orders: ${JSON.stringify(orders.slice(0, 50))}`
      }]
    });

    res.json({ answer: message.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`ShopManager running on http://localhost:${PORT}`));

// Run once on server: node seed_customers.js
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, 'shopmanager.db'));

// ── Schema ────────────────────────────────────────────────────
db.exec(`
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
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(customer_id) REFERENCES customers_v2(id)
  );

  CREATE TABLE IF NOT EXISTS customer_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    interest TEXT NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers_v2(id)
  );
`);

const existing = db.prepare("SELECT COUNT(*) as c FROM customers_v2").get();
if (existing.c > 0) {
  console.log(`Customers already seeded (${existing.c}). Skipping.`);
  process.exit(0);
}

const dataPath = path.join(__dirname, 'customers_data.json');
if (!fs.existsSync(dataPath)) {
  console.error('customers_data.json not found. Run extraction first.');
  process.exit(1);
}

const customers = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const insertCustomer = db.prepare(`
  INSERT INTO customers_v2 (name,company,phone,email,city,assigned_to,status,source,requirement,followup_action,next_followup,remark)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`);

const insertDiscussion = db.prepare(`
  INSERT INTO discussions (customer_id, note, author, type, created_at)
  VALUES (?,?,?,?,datetime('now'))
`);

const seedAll = db.transaction(() => {
  for (const c of customers) {
    const r = insertCustomer.run(
      c.name, c.company||'', c.phone||'', c.email||'', c.city||'',
      c.assigned_to||'', c.status||'Lead', c.source||'',
      c.requirement||'', c.followup_action||'',
      c.next_followup||'', c.remark||''
    );
    const cid = r.lastInsertRowid;

    // Seed last conversation as first discussion entry
    const note = [c.last_conversation, c.requirement].filter(Boolean).join(' | ');
    if (note && note.trim()) {
      insertDiscussion.run(cid, note.trim(), c.assigned_to || 'System', 'note');
    }
  }
});

seedAll();
console.log(`✓ Seeded ${customers.length} customers with discussion history.`);
db.close();

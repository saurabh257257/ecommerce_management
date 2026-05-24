// Run once to seed product data: node seed.js
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'shopmanager.db'));

db.exec(`
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

const existing = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (existing.count > 0) {
  console.log(`Products already seeded (${existing.count} records). Skipping.`);
  process.exit(0);
}

const insert = db.prepare(`
  INSERT INTO products (sku,category,name,price,new_price,availability,unit,min_quantity,dimensions,details,specs,applications,images)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const products = [
  // ── Nickel Strip Plated ──────────────────────────────────────
  { sku:'1', category:'Nickel Strip Plated', name:'Nickel Strip Plated 1P 6x0.15 mm', price:'480', availability:'yes', unit:'KG', min_quantity:3, dimensions:'Strip size: 6 x 0.15 mm thick; Nickel-plated', details:'Nickel-plated (corrosion resistant); balanced thickness; good conductivity; flexible, easy to solder', applications:'Battery packs, EV, ESS' },
  { sku:'2', category:'Nickel Strip Plated', name:'Nickel Strip Plated 1P 8x0.15 mm', price:'480', availability:'yes', unit:'KG', min_quantity:3, dimensions:'Strip size: 8 x 0.15 mm thick; Nickel-plated', details:'Nickel-plated (corrosion resistant); balanced thickness; good conductivity; flexible, easy to solder', applications:'Battery packs, EV, ESS' },
  { sku:'3', category:'Nickel Strip Plated', name:'Nickel Strip Plated 1P 10x0.15 mm', price:'480', availability:'order placed', unit:'KG', min_quantity:3, dimensions:'Strip size: 10 x 0.15 mm thick; Nickel-plated', details:'Nickel-plated (corrosion resistant); balanced thickness; good conductivity; flexible, easy to solder', applications:'Battery packs, EV, ESS' },
  { sku:'4', category:'Nickel Strip Plated', name:'Nickel Strip Plated 2P(18650) 26x0.15 mm', price:'740', availability:'yes', unit:'KG', min_quantity:3, dimensions:'26 x 0.15 mm for 18650 2P (H-type); depth 12 mm, pitch 19 mm; 19 mm holder', details:'Nickel-plated (corrosion resistant); balanced thickness; good conductivity; flexible, easy to solder', applications:'Battery packs, EV, ESS' },
  { sku:'5', category:'Nickel Strip Plated', name:'Nickel Strip Plated 2P(21700) 31x0.15 mm', price:'740', availability:'yes', unit:'KG', min_quantity:3, dimensions:'31 x 0.15 mm for 21700 2P (H-type); depth 15 mm, pitch 23 mm; 23 mm holder', details:'Nickel-plated (corrosion resistant); balanced thickness; good conductivity; flexible, easy to solder', applications:'Battery packs, EV, ESS' },
  { sku:'6', category:'Nickel Strip Plated', name:'Nickel Strip Plated 2P(32650) without holder 46.5x0.15 mm', price:'740', availability:'yes', unit:'KG', min_quantity:3, dimensions:'46.5 x 0.15 mm for 32650 2P (H-type); Cd 32.5 mm without holder', details:'Nickel-plated (corrosion resistant); balanced thickness; good conductivity', applications:'Battery packs, EV, ESS' },
  { sku:'7', category:'Nickel Strip Plated', name:'Nickel Strip Plated 2P(32650) with holder 46.5x0.15 mm', price:'740', availability:'yes', unit:'KG', min_quantity:3, dimensions:'46.5 x 0.15 mm for 32650 2P (H-type); depth 22.4 mm, pitch 34.4 mm; 34.4 mm holder', details:'Nickel-plated (corrosion resistant); balanced thickness; good conductivity; flexible, easy to solder', applications:'Battery packs, EV, ESS' },

  // ── Nickel Strip Pure ────────────────────────────────────────
  { sku:'1', category:'Nickel Strip Pure', name:'Nickel Strip Pure 1P 6x0.15 mm', price:'2850', availability:'yes', unit:'KG', min_quantity:3, dimensions:'Strip size: 6 x 0.15 mm thick; Pure Nickel', details:'Pure nickel; low resistance + corrosion resistance; easy soldering', applications:'Battery packs, EVs, power tools, ESS' },
  { sku:'2', category:'Nickel Strip Pure', name:'Nickel Strip Pure 1P 8x0.15 mm', price:'2850', availability:'yes', unit:'KG', min_quantity:3, dimensions:'Strip size: 8 x 0.15 mm thick; Pure Nickel', details:'Pure nickel; low resistance + corrosion resistance; easy soldering', applications:'Battery packs, EVs, power tools, ESS' },
  { sku:'3', category:'Nickel Strip Pure', name:'Nickel Strip Pure 1P 10x0.15 mm', price:'2850', availability:'order placed', unit:'KG', min_quantity:3, dimensions:'Strip size: 10 x 0.15 mm thick; Pure Nickel', details:'Pure nickel; low resistance + corrosion resistance; easy soldering', applications:'Battery packs, EVs, power tools, ESS' },
  { sku:'4', category:'Nickel Strip Pure', name:'Nickel Strip Pure 2P(18650) 26x0.15 mm', price:'3850', availability:'yes', unit:'KG', min_quantity:3, dimensions:'26 x 0.15 mm for 18650 2P (H-type); depth 12 mm, pitch 19 mm; 19 mm holder', details:'Pure nickel; low resistance + corrosion resistance; easy soldering', applications:'Battery packs, EVs, power tools, ESS' },
  { sku:'5', category:'Nickel Strip Pure', name:'Nickel Strip Pure 2P(21700) 31x0.15 mm', price:'3850', availability:'yes', unit:'KG', min_quantity:3, dimensions:'31 x 0.15 mm for 21700 2P (H-type); depth 15 mm, pitch 23 mm; 23 mm holder', details:'Pure nickel; low resistance + corrosion resistance; easy soldering', applications:'Battery packs, EVs, power tools, ESS' },
  { sku:'6', category:'Nickel Strip Pure', name:'Nickel Strip Pure 2P(32650) 46.5x0.15 mm', price:'3850', availability:'yes', unit:'KG', min_quantity:3, dimensions:'46.5 x 0.15 mm for 32650 2P (H-type); depth 22.4 mm, pitch 34.4 mm; 34.4 mm holder', details:'Pure nickel; low resistance + corrosion resistance; easy soldering', applications:'Battery packs, EVs, power tools, ESS' },
  { sku:'7', category:'Nickel Strip Pure', name:'Nickel Strip Pure ZigZag (18650) 32.96x0.15 mm', price:'3850', availability:'yes', unit:'KG', min_quantity:3, dimensions:'Width 32.96 mm; Central depth 19.00 mm; Pure Nickel', details:'Pure nickel; low resistance + corrosion resistance; easy soldering', applications:'Battery packs, EVs, power tools, ESS' },

  // ── Copper Bus Bar ───────────────────────────────────────────
  { sku:'1', category:'Copper Bus Bar', name:'Copper Bus Bar Universal 55x20x2 mm', price:'31', availability:'yes', unit:'Piece', min_quantity:100, dimensions:'55x20x2 mm; Pure Copper; Silver plated', details:'Pure Copper; Silver plated; universal fit', applications:'Battery interconnects, EV, ESS' },
  { sku:'2', category:'Copper Bus Bar', name:'Copper Bus Bar Universal 60x20x2 mm', price:'36', availability:'yes', unit:'Piece', min_quantity:100, dimensions:'60x20x2 mm; Pure Copper; Silver plated', details:'Pure Copper; Silver plated; universal fit', applications:'Battery interconnects, EV, ESS' },
  { sku:'3', category:'Copper Bus Bar', name:'Copper Bus Bar Universal 68x20x2 mm', price:'40', availability:'yes', unit:'Piece', min_quantity:100, dimensions:'68x20x2 mm; Pure Copper; Silver plated', details:'Pure Copper; Silver plated; universal fit', applications:'Battery interconnects, EV, ESS' },
  { sku:'4', category:'Copper Bus Bar', name:'Copper Bus Bar Universal 82x20x2 mm', price:'50', availability:'yes', unit:'Piece', min_quantity:100, dimensions:'82x20x2 mm; Pure Copper; Silver plated', details:'Pure Copper; Silver plated; universal fit', applications:'Battery interconnects, EV, ESS' },

  // ── Cells ────────────────────────────────────────────────────
  { sku:'1', category:'Cells', name:'LITHIUM-ION CELL 2600 mAh DMEGC 18650', price:'95', availability:'yes', unit:'Piece', min_quantity:200, dimensions:'18mm × 65mm; ~45g', details:'Lithium-Ion; 3.65V nominal; 2600 mAh (min 2500 mAh); 4.2V max; 2.5V cutoff; >1000 cycles @80% DOD; 1C charge; 2C discharge', specs:{ type:'Lithium-Ion', form_factor:'18650', nominal_voltage:'3.65V', capacity:'2600 mAh', max_voltage:'4.2V', min_voltage:'2.5V', cycle_life:'>1,000 cycles @ 80% DOD', std_charge:'1C (2.6A)', max_discharge:'2C (5.2A)', weight:'~45g', certifications:'—' }, applications:'Portable electronics, power banks, power tools, electric vehicles, e-bikes, energy storage, solar systems' },
  { sku:'2', category:'Cells', name:'LITHIUM-ION CELL 4500 mAh DMEGC 21700', price:'138', availability:'yes', unit:'Piece', min_quantity:200, dimensions:'21mm × 70mm; ~70g', details:'Lithium-Ion; 3.7V nominal; 4500 mAh (min 4400 mAh); 4.2V max; 2.5V cutoff; >1000 cycles @80% DOD; 1C charge; 2C discharge', specs:{ type:'Lithium-Ion', form_factor:'21700', nominal_voltage:'3.7V', capacity:'4500 mAh', max_voltage:'4.2V', min_voltage:'2.5V', cycle_life:'>1,000 cycles @ 80% DOD', std_charge:'1C (4.5A)', max_discharge:'2C (9.0A)', weight:'~70g', certifications:'—' }, applications:'Portable electronics, power tools, electric vehicles, e-bikes, energy storage, custom battery packs' },
  { sku:'3', category:'Cells', name:'LFP CELL 3.2V 6Ah LONGTTECH BY FBTECH', price:'110', availability:'yes', unit:'Piece', min_quantity:100, dimensions:'—', details:'LiFePO4; 3.2V nominal; 6Ah capacity; Standard grade', specs:{ type:'LiFePO4 (Lithium Iron Phosphate)', form_factor:'—', nominal_voltage:'3.2V', capacity:'6Ah', grade:'Standard' }, applications:'Detailed datasheet available from supplier' },
  { sku:'4', category:'Cells', name:'LFP CELL 3.2V 15Ah CNAE 32140 ESS A Grade', price:'270', availability:'yes', unit:'Piece', min_quantity:40, dimensions:'32140; ~310g', details:'LiFePO4; 3.2V nominal; 15Ah; 3.65V max; 2.0V cutoff; ≥3000 cycles @80% DOD; 0.5C charge; 3C discharge; ≤12 mΩ; -20°C to +60°C; 48Wh; A Grade ESS', specs:{ type:'LiFePO4', form_factor:'32140', nominal_voltage:'3.2V', capacity:'15Ah', max_voltage:'3.65V', min_voltage:'2.0V', cycle_life:'≥3,000 cycles @ 80% DOD', std_charge:'0.5C', max_discharge:'3C', weight:'~310g', internal_resistance:'≤12 mΩ', temp_range:'-20°C to +60°C', energy:'48Wh', grade:'A Grade (ESS)', certifications:'UN38.3, CE, RoHS, MSDS' }, applications:'Energy storage systems, solar batteries, electric vehicles, e-bikes, UPS, portable power stations' },
  { sku:'5', category:'Cells', name:'LFP CELL 3.2V 15Ah CHAM 32140 ESS Grade', price:'275', availability:'yes', unit:'Piece', min_quantity:50, dimensions:'CHAM 32140', details:'LiFePO4; 3.2V nominal; 15Ah; ESS Grade', specs:{ type:'LiFePO4', form_factor:'CHAM 32140', nominal_voltage:'3.2V', capacity:'15Ah', grade:'ESS Grade' }, applications:'Full datasheet available from supplier' },
  { sku:'6', category:'Cells', name:'K-TECH LiFePO4 CELL 15Ah 34145', price:'325', availability:'yes', unit:'Piece', min_quantity:40, dimensions:'34mm × 145mm; ~380g', details:'LiFePO4; 3.2V nominal; 15Ah; 3.65V max; 2.0V cutoff; >3000 cycles @80% DOD; 1C charge; 3C discharge', specs:{ type:'LiFePO4', form_factor:'34145', nominal_voltage:'3.2V', capacity:'15Ah', max_voltage:'3.65V', min_voltage:'2.0V', cycle_life:'>3,000 cycles @ 80% DOD', std_charge:'1C (15A)', max_discharge:'3C (45A)', weight:'~380g' }, applications:'Electric vehicles, e-bikes, solar power storage, UPS backup, industrial power tools' },
  { sku:'7', category:'Cells', name:'CELL HIGHSTAR LFP 50Ah', price:'1450', availability:'yes', unit:'Piece', min_quantity:16, dimensions:'—', details:'LiFePO4; 3.2V nominal; 50Ah', specs:{ type:'LiFePO4', nominal_voltage:'3.2V', capacity:'50Ah' }, applications:'Full datasheet available from supplier' },
  { sku:'8', category:'Cells', name:'GANFENG 100Ah 3.2V Prismatic Cell 3K Cycles (A35)', price:'2100', availability:'yes', unit:'Piece', min_quantity:4, dimensions:'Prismatic (A35)', details:'LiFePO4; 3.2V; 100Ah; 3,000 cycles', specs:{ type:'LiFePO4', form_factor:'A35 Prismatic', nominal_voltage:'3.2V', capacity:'100Ah', cycle_life:'3,000 cycles' }, applications:'Full datasheet available from supplier' },
  { sku:'9', category:'Cells', name:'GANFENG 100Ah 3.2V Prismatic Cell 5K Cycles (A09)', price:'2150', availability:'yes', unit:'Piece', min_quantity:4, dimensions:'Prismatic (A09)', details:'LiFePO4; 3.2V; 100Ah; 5,000 cycles', specs:{ type:'LiFePO4', form_factor:'A09 Prismatic', nominal_voltage:'3.2V', capacity:'100Ah', cycle_life:'5,000 cycles' }, applications:'Full datasheet available from supplier' },
  { sku:'10', category:'Cells', name:'LFP CELL 3.2V 6Ah WINWAY A Grade (Pack of 200)', price:'22400', availability:'yes', unit:'Pack', min_quantity:1, dimensions:'—', details:'LiFePO4; 3.2V; 6Ah; A Grade; Pack of 200 units (₹112/cell)', specs:{ type:'LiFePO4', nominal_voltage:'3.2V', capacity:'6Ah', grade:'A Grade', pack_size:'200 units' }, applications:'Full datasheet available from supplier' },
];

const seedMany = db.transaction((items) => {
  for (const p of items) {
    insert.run(
      p.sku, p.category, p.name, p.price, p.new_price || '',
      p.availability, p.unit, p.min_quantity,
      p.dimensions || '', p.details || '',
      JSON.stringify(p.specs || {}),
      p.applications || '', '[]'
    );
  }
});

seedMany(products);
console.log(`✓ Seeded ${products.length} products successfully.`);
db.close();

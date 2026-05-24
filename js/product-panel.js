/* Product Sidecar Panel — include on any page */
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .pp-toggle { position:fixed; right:0; top:50%; transform:translateY(-50%); z-index:999;
      background:var(--primary,#4f46e5); color:#fff; border:none; cursor:pointer;
      writing-mode:vertical-rl; padding:14px 10px; border-radius:8px 0 0 8px;
      font-size:12px; font-weight:600; letter-spacing:.5px; box-shadow:-2px 0 8px rgba(0,0,0,.15);
      transition:background .15s; }
    .pp-toggle:hover { background:#4338ca; }
    .pp-drawer { position:fixed; right:-360px; top:0; height:100vh; width:360px; z-index:1000;
      background:#fff; border-left:1px solid #e5e7eb; box-shadow:-4px 0 20px rgba(0,0,0,.12);
      display:flex; flex-direction:column; transition:right .28s cubic-bezier(.4,0,.2,1); }
    .pp-drawer.open { right:0; }
    .pp-head { padding:16px; border-bottom:1px solid #e5e7eb; display:flex; align-items:center; gap:10px; }
    .pp-head h4 { margin:0; font-size:15px; font-weight:700; flex:1; }
    .pp-head .pp-close { background:none; border:none; cursor:pointer; color:#6b7280; font-size:20px; padding:2px 6px; }
    .pp-search { padding:10px 14px; border-bottom:1px solid #e5e7eb; display:flex; gap:8px; }
    .pp-search input { flex:1; padding:8px 12px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; outline:none; }
    .pp-search input:focus { border-color:var(--primary,#4f46e5); }
    .pp-cats { padding:8px 14px; display:flex; gap:6px; flex-wrap:wrap; border-bottom:1px solid #e5e7eb; }
    .pp-cat { padding:4px 10px; border:1px solid #e5e7eb; border-radius:20px; font-size:11px; cursor:pointer; color:#6b7280; background:#f9fafb; white-space:nowrap; }
    .pp-cat.active { background:var(--primary,#4f46e5); color:#fff; border-color:var(--primary,#4f46e5); }
    .pp-list { flex:1; overflow-y:auto; padding:10px; }
    .pp-card { border:1px solid #e5e7eb; border-radius:8px; padding:12px; margin-bottom:8px; cursor:pointer; transition:border-color .15s,background .15s; }
    .pp-card:hover { border-color:var(--primary,#4f46e5); background:#f5f3ff; }
    .pp-card .pc-sku { font-size:10px; color:#6b7280; font-weight:600; text-transform:uppercase; }
    .pp-card .pc-name { font-size:13px; font-weight:600; margin:2px 0; }
    .pp-card .pc-cat { font-size:11px; color:#6b7280; }
    .pp-card .pc-row { display:flex; justify-content:space-between; align-items:center; margin-top:6px; }
    .pp-card .pc-price { font-size:14px; font-weight:700; color:var(--primary,#4f46e5); }
    .pp-card .pc-avail { font-size:10px; padding:2px 7px; border-radius:20px; font-weight:600; }
    .pp-card .pc-avail.yes { background:#dcfce7; color:#15803d; }
    .pp-card .pc-avail.no { background:#fee2e2; color:#dc2626; }
    .pp-card .pc-details { font-size:11px; color:#6b7280; margin-top:4px; line-height:1.4; }
    .pp-detail { padding:16px; overflow-y:auto; flex:1; display:none; }
    .pp-detail.show { display:block; }
    .pp-list.hide { display:none; }
    .pp-back { background:none; border:none; color:var(--primary,#4f46e5); font-size:13px; cursor:pointer; padding:0; margin-bottom:12px; font-weight:600; }
    .pp-detail h5 { font-size:16px; margin:0 0 4px; }
    .pp-detail .pd-sku { color:#6b7280; font-size:12px; margin-bottom:12px; }
    .pp-detail table { width:100%; border-collapse:collapse; font-size:13px; }
    .pp-detail td { padding:5px 0; border-bottom:1px solid #f3f4f6; }
    .pp-detail td:first-child { color:#6b7280; width:40%; }
    .pp-detail .pd-imgs { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
    .pp-detail .pd-imgs img { width:70px; height:70px; object-fit:cover; border-radius:6px; border:1px solid #e5e7eb; }
    .pp-empty { text-align:center; padding:40px 20px; color:#9ca3af; font-size:13px; }
  `;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.className = 'pp-toggle';
  toggle.textContent = 'Products';

  const drawer = document.createElement('div');
  drawer.className = 'pp-drawer';
  drawer.innerHTML = `
    <div class="pp-head">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--primary,#4f46e5)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
      <h4>Product Reference</h4>
      <button class="pp-close" id="ppClose">&#x2715;</button>
    </div>
    <div class="pp-search">
      <input type="text" id="ppSearch" placeholder="Search by name or SKU…" />
    </div>
    <div class="pp-cats" id="ppCats"><span class="pp-cat active" data-cat="">All</span></div>
    <div class="pp-list" id="ppList"><div class="pp-empty">Loading products…</div></div>
    <div class="pp-detail" id="ppDetail">
      <button class="pp-back" id="ppBack">&#8592; Back to list</button>
      <div id="ppDetailContent"></div>
    </div>
  `;

  document.body.appendChild(toggle);
  document.body.appendChild(drawer);

  let allProducts = [], activeCat = '', searchQ = '';

  async function loadProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      allProducts = data.data || [];
      const cats = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
      const catEl = document.getElementById('ppCats');
      catEl.innerHTML = '<span class="pp-cat active" data-cat="">All</span>' +
        cats.map(c => `<span class="pp-cat" data-cat="${c}">${c}</span>`).join('');
      catEl.querySelectorAll('.pp-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          catEl.querySelectorAll('.pp-cat').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeCat = btn.dataset.cat;
          renderList();
        });
      });
      renderList();
    } catch(e) {
      document.getElementById('ppList').innerHTML = `<div class="pp-empty">Error loading products</div>`;
    }
  }

  function renderList() {
    let list = allProducts;
    if (activeCat) list = list.filter(p => p.category === activeCat);
    if (searchQ) list = list.filter(p => (p.name + p.sku + p.category + (p.details||'')).toLowerCase().includes(searchQ));
    const el = document.getElementById('ppList');
    if (!list.length) { el.innerHTML = '<div class="pp-empty">No products found</div>'; return; }
    el.innerHTML = list.map(p => `
      <div class="pp-card" data-id="${p.id}">
        <div class="pc-sku">SKU: ${p.sku || '—'}</div>
        <div class="pc-name">${p.name}</div>
        <div class="pc-cat">${p.category}</div>
        <div class="pc-row">
          <span class="pc-price">${p.new_price && p.new_price !== p.price ? '₹'+p.new_price : (p.price ? '₹'+p.price : '—')}</span>
          <span class="pc-avail ${p.availability === 'yes' ? 'yes' : 'no'}">${p.availability === 'yes' ? 'In Stock' : 'Out of Stock'}</span>
        </div>
        ${p.details ? `<div class="pc-details">${p.details.slice(0, 100)}${p.details.length > 100 ? '…' : ''}</div>` : ''}
      </div>`).join('');
    el.querySelectorAll('.pp-card').forEach(card => {
      card.addEventListener('click', () => showDetail(parseInt(card.dataset.id)));
    });
  }

  function showDetail(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    let specs = {};
    try { specs = JSON.parse(p.specs || '{}'); } catch(e) {}
    const imgs = JSON.parse(p.images || '[]');
    const price = p.new_price && p.new_price !== p.price
      ? `<span style="color:#dc2626;text-decoration:line-through;font-size:12px">₹${p.price}</span> <strong>₹${p.new_price}</strong>`
      : `<strong>${p.price ? '₹' + p.price : '—'}</strong>`;
    const specRows = Object.entries(specs).map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    document.getElementById('ppDetailContent').innerHTML = `
      <h5>${p.name}</h5>
      <div class="pd-sku">SKU: ${p.sku || '—'} &bull; ${p.category}</div>
      <table>
        <tr><td>Price</td><td>${price}</td></tr>
        <tr><td>Availability</td><td><span class="pc-avail ${p.availability === 'yes' ? 'yes' : 'no'}" style="padding:2px 7px;border-radius:20px;font-size:11px;font-weight:600">${p.availability === 'yes' ? 'In Stock' : 'Out of Stock'}</span></td></tr>
        ${p.unit ? `<tr><td>Unit</td><td>${p.unit}</td></tr>` : ''}
        ${p.min_quantity > 1 ? `<tr><td>Min Qty</td><td>${p.min_quantity}</td></tr>` : ''}
        ${p.dimensions ? `<tr><td>Dimensions</td><td>${p.dimensions}</td></tr>` : ''}
        ${p.details ? `<tr><td>Details</td><td>${p.details}</td></tr>` : ''}
        ${p.applications ? `<tr><td>Applications</td><td>${p.applications}</td></tr>` : ''}
        ${specRows}
      </table>
      ${imgs.length ? `<div class="pd-imgs">${imgs.map(f => `<img src="/uploads/${f}" onerror="this.style.display='none'">`).join('')}</div>` : ''}
    `;
    document.getElementById('ppList').classList.add('hide');
    document.getElementById('ppDetail').classList.add('show');
  }

  document.getElementById('ppBack').addEventListener('click', () => {
    document.getElementById('ppList').classList.remove('hide');
    document.getElementById('ppDetail').classList.remove('show');
  });

  toggle.addEventListener('click', () => {
    drawer.classList.add('open');
    if (!allProducts.length) loadProducts();
  });
  document.getElementById('ppClose').addEventListener('click', () => drawer.classList.remove('open'));
  document.getElementById('ppSearch').addEventListener('input', e => {
    searchQ = e.target.value.trim().toLowerCase();
    renderList();
  });
})();

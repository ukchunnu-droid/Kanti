// Kanti storefront — shop.js
// The shop is built from the product data: filter buttons, counts and categories come from
// whatever products exist (added/edited on the admin page) — nothing here is a fixed list.

/* ---------- Product helpers (used by the shop, modal, routine and bag) ---------- */
const LOW_STOCK = 5;
const soldOut = (p) => p.stock === 0;
const maxQty = (p) => (p.stock == null ? MAX_QTY : Math.min(MAX_QTY, p.stock));
const titleCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
const skinLabel = (k) => SKIN_LABEL[k] || titleCase(k);
const doshaLabel = (k) => (DOSHA[k] ? DOSHA[k].name : titleCase(k));
function stockBadge(p) {
  if (soldOut(p)) return '<span class="stock-flag out">Sold out</span>';
  if (p.stock != null && p.stock <= LOW_STOCK) return `<span class="stock-flag low">Only ${p.stock} left</span>`;
  return '';
}

/* ---------- Shop ---------- */
state.shop = { q: '', category: 'all', skin: 'all', dosha: 'all', concern: 'all', sort: 'featured' };

const SORTS = {
  featured: { label: 'Featured', fn: (a, b) => (a.sort_order - b.sort_order) },
  match: { label: 'Best match for me', fn: (a, b) => scoreProduct(b, state.profile) - scoreProduct(a, state.profile) || a.sort_order - b.sort_order },
  'price-asc': { label: 'Price: low to high', fn: (a, b) => a.price_cents - b.price_cents },
  'price-desc': { label: 'Price: high to low', fn: (a, b) => b.price_cents - a.price_cents },
  newest: { label: 'Newest', fn: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) },
};

// Facets: every value that appears in the catalogue, with how many products have it.
const FACETS = [
  { key: 'category', label: 'Category', values: (p) => [p.cat], name: titleCase },
  { key: 'skin', label: 'Skin type', values: (p) => p.skin || [], name: skinLabel },
  { key: 'dosha', label: 'Dosha', values: (p) => p.dosha || [], name: doshaLabel },
  { key: 'concern', label: 'Goal', values: (p) => p.concern || [], name: titleCase },
];

function matchesSearch(p, q) {
  if (!q) return true;
  const hay = [p.name, p.cat, p.benefit, p.desc, ...(p.ings || []), ...(p.concern || [])].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
// Products matching everything except (optionally) one facet — used for the counts on that facet.
function shopFiltered(exceptKey) {
  const f = state.shop;
  return PRODUCTS.filter((p) => matchesSearch(p, f.q) && FACETS.every((fc) =>
    fc.key === exceptKey || f[fc.key] === 'all' || fc.values(p).includes(f[fc.key])));
}
function facetHTML(fc) {
  const counts = new Map();
  for (const p of shopFiltered(fc.key)) for (const v of new Set(fc.values(p))) counts.set(v, (counts.get(v) || 0) + 1);
  const all = new Set(PRODUCTS.flatMap(fc.values)); // keep zero-count values visible so buttons don't jump around
  if (all.size < 2) return '';
  const cur = state.shop[fc.key];
  const values = [...all].sort((a, b) => String(fc.name(a)).localeCompare(String(fc.name(b))));
  return `<div class="filters" role="group" aria-label="${fc.label}">
    <span class="label">${fc.label}</span>
    <button class="pill ${cur === 'all' ? 'active' : ''}" data-act="shopFilter" data-arg="${fc.key}" data-arg2="all">All</button>
    ${values.map((v) => {
      const n = counts.get(v) || 0;
      return `<button class="pill ${cur === v ? 'active' : ''}" data-act="shopFilter" data-arg="${fc.key}" data-arg2="${esc(v)}" ${n || cur === v ? '' : 'disabled'}>${esc(fc.name(v))} <span class="pill-n">${n}</span></button>`;
    }).join('')}
  </div>`;
}

function cardHTML(p) {
  const flag = (p.safety || []).find((s) => /safe|free/i.test(s));
  const out = soldOut(p);
  return `<div class="card ${out ? 'is-out' : ''}" data-act="openModal" data-arg="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} — details">
    <div class="card-img" style="background:${esc(p.bg)}">${esc(p.emoji)}${flag ? `<span class="card-flag">${esc(flag)}</span>` : ''}${stockBadge(p)}</div>
    <div class="card-body">
      <div class="cat">${esc(p.cat)}</div>
      <h3>${esc(p.name)}</h3>
      <div class="benefit">${esc(p.benefit)}</div>
      <div class="card-ings">${(p.ings || []).slice(0, 3).map((i) => `<span class="ing-tag">${esc(i)}</span>`).join('')}</div>
      <div class="card-foot">
        <span class="price">${money(p.price)}</span>
        <button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}" ${out ? 'disabled' : ''}>${out ? 'Sold out' : 'Add'}</button>
      </div>
    </div>
  </div>`;
}

function renderShop() {
  if (state.shop.sort === 'match' && !state.profile) state.shop.sort = 'featured';
  const f = state.shop;
  app.innerHTML = `
  <div class="wrap shop">
    <div class="section-head" style="margin-bottom:22px">
      <div class="eyebrow">Shop</div>
      <h2>Every product, fully transparent</h2>
      <p>Search by name or ingredient, filter by your skin type and dosha, and tap any product for its full ingredients, sourcing and safety notes.</p>
    </div>
    <div class="shop-tools">
      <label class="search"><span aria-hidden="true">🔍</span>
        <input id="shopQ" type="search" placeholder="Search products or ingredients — e.g. neem, serum" value="${esc(f.q)}" data-input="shopSearch" aria-label="Search products">
      </label>
      <label class="sort">Sort
        <select id="shopSort" data-change="shopSort" aria-label="Sort products">
          ${Object.entries(SORTS).map(([k, s]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''} ${k === 'match' && !state.profile ? 'disabled' : ''}>${s.label}${k === 'match' && !state.profile ? ' (take the quiz)' : ''}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="shopFacets">${FACETS.map(facetHTML).join('')}</div>
    <div id="shopResults"></div>
  </div>
  ${footerHTML()}`;
  renderShopResults();
}

// Re-renders only the facets + grid, so typing in the search box keeps focus.
function renderShopResults() {
  const list = shopFiltered().sort(SORTS[state.shop.sort].fn);
  const active = FACETS.filter((fc) => state.shop[fc.key] !== 'all').length + (state.shop.q ? 1 : 0);
  const facets = $('#shopFacets');
  if (facets) facets.innerHTML = FACETS.map(facetHTML).join('');
  $('#shopResults').innerHTML = `
    <div class="shop-count">${list.length} product${list.length === 1 ? '' : 's'}${active ? ` · <button class="link-btn" data-act="clearShopFilters">Clear filters</button>` : ''}</div>
    ${list.length ? `<div class="grid">${list.map(cardHTML).join('')}</div>`
      : `<div class="empty-state"><div class="big">🔍</div><p>No products match ${state.shop.q ? `“${esc(state.shop.q)}”` : 'that combination'} yet.</p>
         <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-act="clearShopFilters">Clear filters</button></div>`}`;
  enhanceTips($('#shopResults'));
}

function shopFilter(key, value) { state.shop[key] = value; renderShopResults(); }
function shopSearch(q) { state.shop.q = q.slice(0, 80); renderShopResults(); }
function shopSort(v) { if (SORTS[v]) { state.shop.sort = v; renderShopResults(); } }
function clearShopFilters() {
  state.shop = { ...state.shop, q: '', category: 'all', skin: 'all', dosha: 'all', concern: 'all' };
  const q = $('#shopQ'); if (q) q.value = '';
  renderShopResults();
}
// Reloads the catalogue (after admin edits, or a stock problem at checkout).
async function refreshProducts() {
  try {
    const r = await API.products();
    PRODUCTS = r.products; SHIPPING = r.shipping || SHIPPING;
    state.cart = state.cart.filter((c) => prod(c.id));
    updateCartCount(false);
  } catch (e) { /* keep what we have */ }
}

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
  const out = soldOut(p), saved = isWished(p.id), cmp = state.compare.includes(p.id);
  const why = state.profile ? whyFor(p.id) : '', skip = state.profile && isSkip(p.id);
  return `<div class="card ${out ? 'is-out' : ''}" data-act="openModal" data-arg="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} — details">
    <div class="card-img" style="background:${esc(p.bg)}">${productArt(p, 'card')}${flag ? `<span class="card-flag">${esc(flag)}</span>` : ''}${stockBadge(p)}
      <button class="heart ${saved ? 'on' : ''}" data-act="toggleWish" data-arg="${esc(p.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save for later'}" title="${saved ? 'Remove from saved' : 'Save for later'}">${saved ? '♥' : '♡'}</button></div>
    <div class="card-body">
      <div class="cat">${esc(p.cat)}</div>
      <h3>${esc(p.name)}</h3>
      <div class="benefit">${esc(p.benefit)}</div>
      ${why ? `<div class="card-why ${skip ? 'skip' : ''}">${skip ? '⚠︎ ' : '✦ '}${esc(why)}</div>` : ''}
      <div class="card-ings">${(p.ings || []).slice(0, 3).map((i) => `<span class="ing-tag">${esc(i)}</span>`).join('')}</div>
      <div class="card-foot">
        <span class="price">${money(p.price)}</span>
        <span class="card-btns">
          <button class="cmp-toggle ${cmp ? 'on' : ''}" data-act="toggleCompare" data-arg="${esc(p.id)}" aria-pressed="${cmp}" title="Compare">${cmp ? '✓ Comparing' : '+ Compare'}</button>
          ${out ? `<button class="btn btn-gold btn-sm" data-act="notifyMe" data-arg="${esc(p.id)}" ${state.alerts.includes(p.id) ? 'disabled' : ''}>${state.alerts.includes(p.id) ? '✓ Notifying' : 'Notify me'}</button>`
            : `<button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}">Add</button>`}
        </span>
      </div>
    </div>
  </div>`;
}

function renderShop() {
  if (state.shop.sort === 'match' && !state.profile) state.shop.sort = 'featured';
  // With a skin profile, the shop opens sorted by best match (until the shopper picks another sort).
  if (state.profile && !state.shop.sortChosen) state.shop.sort = 'match';
  ensureReco();
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
    <button class="btn btn-ghost btn-sm filter-open" data-act="openFilters" aria-controls="facetSheet">Filters<span id="filterN"></span></button>
    <div class="facet-sheet" id="facetSheet">
      <div class="fs-head"><b>Filters</b><button class="icon-btn" data-act="closeFilters" aria-label="Close filters">✕</button></div>
      <div id="shopFacets">${FACETS.map(facetHTML).join('')}</div>
      <div class="fs-foot"><button class="link-btn" data-act="clearShopFilters">Clear all</button><button class="btn btn-primary btn-sm" data-act="closeFilters" id="fsShow">Show products</button></div>
    </div>
    <div id="shopForYou"></div>
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
  const fn = $('#filterN'); if (fn) fn.textContent = active ? ` (${active})` : '';
  const fs = $('#fsShow'); if (fs) fs.textContent = `Show ${list.length} product${list.length === 1 ? '' : 's'}`;
  const fy = $('#shopForYou'); if (fy) fy.innerHTML = active ? '' : forYouHTML();
  const box = $('#shopResults');
  box.innerHTML = `
    <div class="shop-count">${list.length} product${list.length === 1 ? '' : 's'}${active ? ` · <button class="link-btn" data-act="clearShopFilters">Clear filters</button>` : ''}</div>
    ${list.length ? `<div class="grid">${list.map(cardHTML).join('')}</div>`
      : emptyShopHTML()}
    <div id="shopBeyond">${shopBeyondHTML()}</div>`;
  enhanceTips(box);
}

/* ---------- Search beyond Kanti ----------
   Searching for something Kanti doesn't carry → Kanti AI looks outside (POST /api/search/beyond):
   the closest Kanti alternatives, plus outside products with retailer search links and checked
   product pages. Runs by itself when nothing matches (after typing pauses); otherwise on request. */
const shopAi = { cache: new Map(), pending: new Map(), timer: null };
const aiQ = () => state.shop.q.trim().replace(/\s+/g, ' ').toLowerCase();
function shopBeyondHTML() {
  const q = aiQ();
  if (q.length < 3) return '';
  if (shopAi.cache.has(q)) return shopBeyondResultHTML(shopAi.cache.get(q));
  const anyMatch = PRODUCTS.some((p) => matchesSearch(p, q));
  if (shopAi.pending.has(q) || !anyMatch) {
    if (!anyMatch) scheduleShopBeyond(q);
    return `<div class="shop-beyond"><div class="sb-head"><h3>✦ Searching beyond Kanti for “${esc(state.shop.q.trim())}”…</h3></div>
      <div class="beyond-grid">${[0, 1, 2].map(() => '<div class="beyond-card skeleton"><span></span><span></span><span></span></div>').join('')}</div></div>`;
  }
  return `<div class="shop-beyond ask"><span>Not quite what you want?</span>
    <button class="btn btn-ghost btn-sm" data-act="shopBeyondSearch">✦ Search beyond Kanti for “${esc(state.shop.q.trim())}”</button></div>`;
}
function scheduleShopBeyond(q) {
  clearTimeout(shopAi.timer);
  shopAi.timer = setTimeout(() => runShopBeyond(q), 700); // wait until typing pauses
}
function shopBeyondSearch() { runShopBeyond(aiQ()); }
function runShopBeyond(q) {
  if (q.length < 3 || shopAi.cache.has(q) || shopAi.pending.has(q)) return;
  const req = API.searchBeyond(q, state.profile ? recoProfile(state.profile) : null)
    .then((d) => shopAi.cache.set(q, d))
    .catch((e) => shopAi.cache.set(q, { error: e.status === 429 ? 'You’ve searched a lot — please try again in a little while.' : 'Couldn’t search beyond Kanti right now.' }))
    .finally(() => {
      shopAi.pending.delete(q);
      const box = $('#shopBeyond'); // only repaint this part, so typing keeps focus
      if (box && aiQ() === q) { box.innerHTML = shopBeyondHTML(); enhanceTips(box); }
    });
  shopAi.pending.set(q, req);
  const box = $('#shopBeyond'); if (box && aiQ() === q) box.innerHTML = shopBeyondHTML();
}
function shopBeyondResultHTML(d) {
  if (d.error) return `<div class="shop-beyond"><p class="muted-p">${esc(d.error)} <button class="link-btn" data-act="shopBeyondRetry">Try again</button></p></div>`;
  if (d.off_topic) return `<div class="shop-beyond"><div class="sb-head"><h3>✦ Beyond Kanti</h3></div><p class="sb-msg">${esc(d.message)}</p></div>`;
  const kanti = (d.kanti || []).filter((k) => prod(k.id));
  return `<div class="shop-beyond">
    <div class="sb-head"><h3>✦ Beyond Kanti: “${esc(d.query)}”</h3>${d.source === 'gemini' ? '<small>Kanti AI</small>' : ''}</div>
    ${d.message ? `<p class="sb-msg">${esc(d.message)}</p>` : ''}
    ${d.verdict ? `<div class="gp-verdict ${esc(d.verdict.fit)} sb-verdict">${fitBadge(d.verdict.fit)}<p>${esc(d.verdict.why)}</p></div>`
      : (!state.profile && (d.items || []).length ? '<p class="sb-msg"><button class="link-btn" data-go="quiz">Take the quiz</button> to see which of these suit your skin.</p>' : '')}
    ${kanti.length ? `<div class="sb-sub">Closest in Kanti</div><div class="mini-grid">${kanti.map((k) => miniCardHTML(k.id, k.why)).join('')}</div>` : ''}
    ${(d.items || []).length ? `<div class="sb-sub">From other shops</div>${beyondCardsHTML(d)}` : ''}
  </div>`;
}
function shopBeyondRetry() { shopAi.cache.delete(aiQ()); runShopBeyond(aiQ()); }

function shopFilter(key, value) { state.shop[key] = value; renderShopResults(); }
function shopSearch(q) { state.shop.q = q.slice(0, 80); renderShopResults(); }
function shopSort(v) { if (SORTS[v]) { state.shop.sort = v; state.shop.sortChosen = true; renderShopResults(); } }

// "Picked for you": the AI's add-ons and routine products, shown above the full list when no filter is on.
function forYouHTML() {
  if (!state.profile) return '';
  const r = recoNow();
  const ids = [...(r ? (r.addons || []).map((a) => a.id) : []), ...routineIds()]
    .filter((id, i, a) => a.indexOf(id) === i && prod(id) && !soldOut(prod(id))).slice(0, 4);
  if (!ids.length) return '';
  return `<div class="for-you"><div class="fy-head"><h3>✦ Picked for your ${esc(DOSHA[state.profile.dosha].name)} · ${esc(SKIN_LABEL[state.profile.skin].toLowerCase())} skin</h3>
    <button class="link-btn" data-go="results">Your full routine →</button></div>
    <div class="mini-grid">${ids.map((id) => miniCardHTML(id, whyFor(id))).join('')}</div></div>
    <div class="shop-all-head">All products</div>`;
}

// No results: suggest which filter to drop, and the closest products to what was typed.
function emptyShopHTML() {
  const f = state.shop;
  const drops = FACETS.filter((fc) => f[fc.key] !== 'all').map((fc) => {
    const saved = f[fc.key]; f[fc.key] = 'all'; const n = shopFiltered().length; f[fc.key] = saved;
    return { fc, n, name: fc.name(saved) };
  }).filter((d) => d.n > 0);
  const near = f.q ? closestProducts(f.q, 3) : [];
  return `<div class="empty-state"><div class="big">🔍</div><p>No products match ${f.q ? `“${esc(f.q)}”` : 'that combination'}${drops.length && f.q ? ' with those filters' : ''}.</p>
    ${drops.length ? `<div class="drop-filters">${drops.map((d) => `<button class="pill" data-act="shopFilter" data-arg="${d.fc.key}" data-arg2="all">Remove “${esc(d.name)}” → ${d.n} product${d.n === 1 ? '' : 's'}</button>`).join('')}</div>` : ''}
    <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-act="clearShopFilters">Clear all filters</button></div>
    ${near.length ? `<div class="shop-all-head">Closest matches</div><div class="grid">${near.map(cardHTML).join('')}</div>` : ''}`;
}
// Fuzzy match: shared word starts and small typos (edit distance) between the query and product text.
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function closestProducts(q, n) {
  const words = q.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  return PRODUCTS.map((p) => {
    const hay = [p.name, p.cat, p.benefit, ...(p.ings || []), ...(p.concern || [])].join(' ').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
    let sc = 0;
    for (const w of words) {
      let best = 0;
      for (const h of hay) {
        if (h.startsWith(w.slice(0, 4)) || w.startsWith(h.slice(0, 4))) best = Math.max(best, 2);
        else if (w.length >= 4 && editDistance(w, h) <= (w.length > 6 ? 2 : 1)) best = Math.max(best, 3);
      }
      sc += best;
    }
    return { p, sc };
  }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, n).map((x) => x.p);
}
function openFilters() { const s = $('#facetSheet'); if (s) { s.classList.add('open'); document.body.classList.add('sheet-open'); } }
function closeFilters() { const s = $('#facetSheet'); if (s) s.classList.remove('open'); document.body.classList.remove('sheet-open'); }
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
    state.wish = state.wish.filter((id) => prod(id));
    updateCartCount(false);
  } catch (e) { /* keep what we have */ }
}

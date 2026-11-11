// Kanti storefront — extras.js
// Wishlist ("Saved for later"), back-in-stock alerts and product comparison.

/* ---------- Wishlist ----------
   Signed in: saved to the account. Signed out: kept in this browser and added to the account on sign-in. */
state.wish = [];
state.alerts = []; // product ids this shopper asked to be told about
const isWished = (id) => state.wish.includes(id);
function loadLocalWish() {
  try { const a = JSON.parse(localStorage.getItem('kanti_wish') || '[]'); if (Array.isArray(a)) state.wish = a.filter((id) => typeof id === 'string' && prod(id)); } catch (e) {}
}
function saveLocalWish() { try { localStorage.setItem('kanti_wish', JSON.stringify(state.wish)); } catch (e) {} }
async function syncWishlist() {
  if (!API.isAuthed()) { loadLocalWish(); updateWishCount(); return; }
  try {
    const local = (() => { try { return JSON.parse(localStorage.getItem('kanti_wish') || '[]'); } catch (e) { return []; } })();
    const r = local.length ? await API.wishMerge(local) : await API.wishlist();
    state.wish = r.items.filter((id) => prod(id));
    try { localStorage.removeItem('kanti_wish'); } catch (e) {}
  } catch (e) { /* keep what we have */ }
  updateWishCount();
}
function updateWishCount() {
  const c = $('#wishCount'); if (!c) return;
  c.textContent = state.wish.length; c.classList.toggle('hidden', !state.wish.length);
}
async function toggleWish(id, _b, el) {
  const p = prod(id); if (!p) return;
  const on = !isWished(id);
  state.wish = on ? [id, ...state.wish] : state.wish.filter((x) => x !== id);
  updateWishCount();
  if (el) { el.classList.toggle('on', on); el.textContent = on ? '♥' : '♡'; el.setAttribute('aria-pressed', on); el.title = on ? 'Remove from saved' : 'Save for later'; }
  toast(on ? `Saved ${p.name} for later` : 'Removed from saved');
  if (API.isAuthed()) {
    try { const r = on ? await API.wishAdd(id) : await API.wishRemove(id); state.wish = r.items.filter((x) => prod(x)); updateWishCount(); }
    catch (e) { if (!handleAuthError(e, state.view)) toast('Couldn’t save that — please try again'); }
  } else saveLocalWish();
  if (state.view === 'saved') render();
}
function renderSaved() {
  const items = state.wish.map(prod).filter(Boolean);
  const inStock = items.filter((p) => !soldOut(p));
  app.innerHTML = `<div class="wrap shop">
    <div class="section-head" style="margin-bottom:22px"><div class="eyebrow">Saved for later</div>
      <h2>${items.length ? `${items.length} saved product${items.length === 1 ? '' : 's'}` : 'Nothing saved yet'}</h2>
      <p>${API.isAuthed() ? 'Saved to your account, so they’re here on any device.' : 'Saved in this browser — sign in to keep them on your account.'}</p></div>
    ${items.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        ${inStock.length ? `<button class="btn btn-primary btn-sm" data-act="moveWishToBag">Add all ${inStock.length} to bag</button>` : ''}
        ${items.length >= 2 ? `<button class="btn btn-ghost btn-sm" data-act="compareWish">Compare ${Math.min(3, items.length)}</button>` : ''}
      </div>
      <div class="grid">${items.map(cardHTML).join('')}</div>`
      : `<div class="empty-state"><div class="big">♡</div><p>Tap the heart on any product to save it here.</p>
         <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-go="shop">Browse the shop</button></div>`}
  </div>${footerHTML()}`;
}
function moveWishToBag() {
  let n = 0; state.wish.forEach((id) => { if (addToCart(id, true)) n++; });
  toast(n ? `${n} added to bag` : 'Those are already in your bag'); openCart();
}
function compareWish() { state.compare = state.wish.filter((id) => prod(id)).slice(0, 3); stashCompare(); go('compare'); }

/* ---------- Back-in-stock alerts ---------- */
function notifyFormHTML(p) {
  if (state.alerts.includes(p.id)) return `<div class="notify-box ok">✓ We’ll email you when ${esc(p.name)} is back.</div>`;
  if (API.isAuthed()) {
    return `<div class="notify-box"><span>Sold out for now.</span>
      <button class="btn btn-gold btn-sm" data-act="notifyMe" data-arg="${esc(p.id)}">Email me when it’s back</button></div>`;
  }
  return `<form class="notify-box" novalidate data-submit="notifySubmit" data-arg="${esc(p.id)}">
    <span>Sold out for now — get one email when it’s back.</span>
    <input type="email" id="notifyEmail" placeholder="you@example.com" autocomplete="email" aria-label="Your email" required>
    <button class="btn btn-gold btn-sm">Notify me</button></form>`;
}
async function notifyMe(id, _b, el) {
  if (!API.isAuthed()) { openModal(id); setTimeout(() => { const i = $('#notifyEmail'); if (i) i.focus(); }, 50); return; }
  if (el) el.disabled = true;
  try { await API.notifyMe(id); state.alerts.push(id); toast('We’ll email you when it’s back'); }
  catch (e) { toast(e.message); }
  rerenderProductViews(id);
}
async function notifySubmit(id) {
  const i = $('#notifyEmail'), v = i ? i.value.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast('Please enter a valid email'); if (i) i.focus(); return; }
  try { await API.notifyMe(id, v); state.alerts.push(id); toast('Done — we’ll email you once'); }
  catch (e) { toast(e.message); return; }
  rerenderProductViews(id);
}
function rerenderProductViews(id) {
  if ($('#overlay').classList.contains('open')) openModal(id);
  if (state.view === 'shop') renderShopResults();
}

/* ---------- Compare (up to 3) ---------- */
state.compare = (() => { try { const a = JSON.parse(sessionStorage.getItem('kanti_compare') || '[]'); return Array.isArray(a) ? a.slice(0, 3) : []; } catch (e) { return []; } })();
function stashCompare() { try { sessionStorage.setItem('kanti_compare', JSON.stringify(state.compare)); } catch (e) {} }
function toggleCompare(id, _b, el) {
  if (state.compare.includes(id)) state.compare = state.compare.filter((x) => x !== id);
  else {
    if (state.compare.length >= 3) { toast('You can compare up to 3 — remove one first'); return; }
    state.compare.push(id);
  }
  stashCompare(); renderCompareBar();
  const on = state.compare.includes(id);
  if (el && el.closest('#modal, .card')) { el.setAttribute('aria-pressed', on); el.textContent = on ? '✓ Comparing' : '+ Compare'; el.classList.toggle('on', on); }
  if (state.view === 'compare') { if (state.compare.length) renderCompare(); else go('shop'); }
}
function clearCompare() { state.compare = []; stashCompare(); renderCompareBar(); if (state.view === 'compare') go('shop'); else if (state.view === 'shop') renderShopResults(); }
function renderCompareBar() {
  const bar = $('#compareBar'); if (!bar) return;
  state.compare = state.compare.filter((id) => prod(id));
  const show = state.compare.length && state.view !== 'compare' && !['checkout', 'admin'].includes(state.view);
  bar.classList.toggle('open', !!show);
  document.body.classList.toggle('has-compare', !!show);
  if (!show) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<div class="cb-items">${state.compare.map((id) => { const p = prod(id); return `<span class="cb-item" title="${esc(p.name)}" style="background:${esc(p.bg)}">${productArt(p, 'thumb')}</span>`; }).join('')}
    ${state.compare.length < 3 ? `<span class="cb-slot">+${3 - state.compare.length}</span>` : ''}</div>
    <span class="cb-text">${state.compare.length} of 3 to compare</span>
    <button class="btn btn-primary btn-sm" data-go="compare" ${state.compare.length < 2 ? 'disabled' : ''}>Compare</button>
    <button class="link-btn" data-act="clearCompare">Clear</button>`;
}
function renderCompare() {
  const ps = state.compare.map(prod).filter(Boolean);
  const prof = state.profile;
  const best = (fn) => { const v = ps.map(fn); const m = Math.max(...v); return (i) => v[i] === m && v.filter((x) => x === m).length < v.length; };
  const isBestPrice = (() => { const v = ps.map((p) => p.price_cents); const m = Math.min(...v); return (i) => v[i] === m && v.filter((x) => x === m).length < v.length; })();
  const isBestMatch = prof ? best((p) => scoreProduct(p, prof)) : () => false;
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${ps.map((p, i) => `<td>${fn(p, i)}</td>`).join('')}</tr>`;
  const list = (a, f) => (a || []).length ? a.map((x) => esc(f ? f(x) : x)).join(', ') : '—';
  app.innerHTML = `<div class="wrap compare">
    <div class="section-head" style="margin-bottom:22px"><div class="eyebrow">Compare</div><h2>Side by side</h2>
      <p>${prof ? `Highlighted cells are the best fit for your ${esc(SKIN_LABEL[prof.skin].toLowerCase())} skin and ${esc(DOSHA[prof.dosha].name)} nature.` : 'Take the quiz to see which one fits you best.'}</p></div>
    <div class="compare-scroll"><table class="compare-table">
      <thead><tr><th></th>${ps.map((p) => `<th scope="col">
        <div class="ct-img" style="background:${esc(p.bg)}">${productArt(p, 'thumb')}</div>
        <b>${esc(p.name)}</b>
        <button class="link-btn" data-act="toggleCompare" data-arg="${esc(p.id)}">Remove</button></th>`).join('')}</tr></thead>
      <tbody>
        ${row('Price', (p, i) => `<span class="${isBestPrice(i) ? 'best' : ''}">${money(p.price)}</span>`)}
        ${prof ? row('For you', (p, i) => `<span class="${isBestMatch(i) ? 'best' : ''} ${isSkip(p.id) ? 'warnc' : ''}">${esc(whyFor(p.id) || '—')}</span>`) : ''}
        ${row('Type', (p) => `${esc(p.cat)}${p.slot ? ` · ${esc(p.slot)} step` : ''}`)}
        ${row('When', (p) => ({ AM: 'Morning', PM: 'Evening', both: 'Morning & evening' }[p.tod] || '—'))}
        ${row('Skin types', (p) => list(p.skin, skinLabel))}
        ${row('Dosha', (p) => list(p.dosha, doshaLabel))}
        ${row('Goals', (p) => list(p.concern, titleCase))}
        ${row('Key ingredients', (p) => (p.ings || []).map((i) => `<span class="ing-tag">${esc(i)}</span>`).join(' '))}
        ${row('What it does', (p) => esc(p.benefit))}
        ${row('Good to know', (p) => list(p.safety))}
        ${row('Sourcing', (p) => esc(p.sourcing || '—'))}
        ${row('', (p) => soldOut(p) ? '<span class="stock-flag out inline">Sold out</span>' : `<button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}">Add to bag</button>`)}
      </tbody></table></div>
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn btn-ghost btn-sm" data-go="shop">← Back to shop</button>
      <button class="link-btn" data-act="clearCompare">Clear comparison</button></div>
  </div>${footerHTML()}`;
}

// Kanti storefront — admin.js
// The store admin page (/#admin). Only the account set as ADMIN_EMAIL on the server can open it —
// the server checks every admin request, this page just hides itself from everyone else.

const SLOTS = ['Cleanse', 'Tone', 'Treat', 'Moisturise', 'Protect', 'Weekly'];
const CONCERNS = ['breakouts', 'dryness', 'dullness', 'sensitivity', 'fine lines'];
const STATUS_LABEL = { placed: 'Placed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
const NEXT_STATUS = { placed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

state.admin = { tab: 'overview', stats: null, products: null, orders: null, emails: null, editing: null, orderFilter: '', loading: false };

async function adminLoad(what) {
  const a = state.admin;
  try {
    if (what === 'overview') { const [s, e] = await Promise.all([API.admin.stats(), API.admin.emails()]); a.stats = s.stats; a.emails = e.emails; }
    if (what === 'products') a.products = (await API.admin.products()).products;
    if (what === 'orders') a.orders = (await API.admin.orders(a.orderFilter)).orders;
  } catch (e) {
    if (handleAuthError(e, 'admin')) return false;
    if (e.status === 403) { toast('The admin page is only for the store admin'); go('account'); return false; }
    toast(e.message);
  }
  return true;
}

function renderAdmin() {
  if (!ensureSession('admin')) return;
  if (!session.user.is_admin) {
    app.innerHTML = `<div class="checkout"><div class="empty-state"><div class="big">🔒</div><p>This page is only for the store admin.</p>
      <button class="btn btn-primary btn-sm" style="margin-top:14px" data-go="account">Go to my account</button></div></div>`;
    return;
  }
  const a = state.admin;
  const need = { overview: !a.stats, products: !a.products, orders: !a.orders }[a.tab];
  if (need) {
    app.innerHTML = adminShell('<div class="empty-state"><div class="big">🌿</div><p>Loading…</p></div>');
    adminLoad(a.tab).then((ok) => { if (ok && state.view === 'admin') renderAdmin(); });
    return;
  }
  const body = a.tab === 'overview' ? adminOverviewHTML() : a.tab === 'products' ? (a.editing ? productFormHTML() : adminProductsHTML()) : adminOrdersHTML();
  app.innerHTML = adminShell(body);
  if (a.tab === 'products' && a.editing) { const i = $('#f_name'); if (i) i.focus(); }
}

function adminShell(body) {
  const t = state.admin.tab;
  const tab = (k, label) => `<button class="tab ${t === k ? 'active' : ''}" data-act="adminTab" data-arg="${k}" role="tab" aria-selected="${t === k}">${label}</button>`;
  return `<div class="wrap admin">
    <div class="section-head" style="margin-bottom:18px"><div class="eyebrow">Admin</div><h2>Run the store</h2></div>
    <div class="tabs" role="tablist">${tab('overview', 'Overview')}${tab('products', 'Products')}${tab('orders', 'Orders')}</div>
    <div class="admin-body">${body}</div>
  </div>`;
}
function adminTab(k) {
  state.admin.tab = k; state.admin.editing = null;
  if (k === 'overview') state.admin.stats = null; // always fresh numbers
  renderAdmin();
}

/* ---------- Overview ---------- */
function adminOverviewHTML() {
  const s = state.admin.stats, o = s.orders || {}, e = s.emails || {};
  const tile = (n, label, warn) => `<div class="stat ${warn ? 'warn' : ''}"><b>${n}</b><span>${label}</span></div>`;
  const em = s.email_mode || {};
  return `
    ${em.delivers === false ? `<div class="form-msg err" style="display:block">⚠️ Emails are not reaching customers. ${esc(em.problem || '')}</div>` : ''}
    <div class="stats">
      ${tile(money(s.revenue_cents / 100), 'Revenue (excl. cancelled)')}
      ${tile((o.placed || 0), 'Orders to ship', o.placed > 0)}
      ${tile((o.shipped || 0) + ' / ' + (o.delivered || 0), 'Shipped / delivered')}
      ${tile(s.products.active, `Products live${s.products.hidden ? ` · ${s.products.hidden} hidden` : ''}`)}
      ${tile(s.products.low_stock, 'Low on stock (≤ 5)', s.products.low_stock > 0)}
      ${tile(s.users, 'Customer accounts')}
    </div>
    <div class="acct-grid two">
      <div class="acct-card">
        <h3>Emails</h3>
        <div class="acct-row"><span class="ak">Delivery</span><span>${em.delivers ? 'Real email via ' + esc(em.host) : '<span class="danger-t">Test inbox only</span>'}</span></div>
        <div class="acct-row"><span class="ak">Sent</span><span>${e.sent || 0}</span></div>
        <div class="acct-row"><span class="ak">Waiting to retry</span><span>${e.pending || 0}</span></div>
        <div class="acct-row"><span class="ak">Failed</span><span class="${e.failed ? 'danger-t' : ''}">${e.failed || 0}</span></div>
        ${e.failed ? '<button class="btn btn-primary btn-sm" style="margin-top:12px" data-act="adminRetryEmails">Retry failed emails</button>' : ''}
        ${(state.admin.emails || []).length ? `<details class="email-log"><summary>Recent emails</summary>
          ${state.admin.emails.map((m) => `<div class="hist-row"><span>${esc(m.subject)}<br><small>${esc(m.to_addr)}${m.last_error ? ' · ' + esc(m.last_error) : ''}</small></span><small class="st-${esc(m.status)}">${esc(m.status)}</small></div>`).join('')}
        </details>` : ''}
      </div>
      <div class="acct-card">
        <h3>Backups</h3>
        <p class="muted-p">The database is copied automatically every day; the newest 14 copies are kept on the server.</p>
        <div class="acct-row"><span class="ak">Last backup</span><span>${s.last_backup_at ? fmtDateTime(s.last_backup_at) : 'never'}</span></div>
        <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-act="adminBackup">Back up now</button>
      </div>
      <div class="acct-card">
        <h3>AI recommendations</h3>
        <div class="acct-row"><span class="ak">Mode</span><span>${s.ai_mode === 'gemini' ? '✦ Gemini (with rule-based fallback)' : 'Rules only — set GEMINI_API_KEY for AI'}</span></div>
        <div class="acct-row"><span class="ak">Saved results</span><span>${s.ai_cache || 0}</span></div>
        <p class="muted-p">Routines are reused for 3 days and outside suggestions for 7, and refresh automatically when you edit products.</p>
        <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-act="adminClearAiCache">Refresh all AI results</button>
      </div>
    </div>`;
}
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };

async function adminBackup(_a, _b, el) {
  el.disabled = true; el.textContent = 'Backing up…';
  try { const r = await API.admin.backup(); toast('Backup saved: ' + r.file); state.admin.stats = null; renderAdmin(); }
  catch (e) { toast(e.message); el.disabled = false; el.textContent = 'Back up now'; }
}
async function adminClearAiCache(_a, _b, el) {
  el.disabled = true;
  try { const r = await API.admin.clearAiCache(); toast(`Cleared ${r.cleared} saved AI result${r.cleared === 1 ? '' : 's'}`); state.admin.stats = null; renderAdmin(); }
  catch (e) { toast(e.message); el.disabled = false; }
}
async function adminRetryEmails(_a, _b, el) {
  el.disabled = true;
  try { const r = await API.admin.retryEmails(); toast(`Retrying ${r.retried} email${r.retried === 1 ? '' : 's'}`); state.admin.stats = null; renderAdmin(); }
  catch (e) { toast(e.message); el.disabled = false; }
}

/* ---------- Products ---------- */
function adminProductsHTML() {
  const list = state.admin.products;
  return `
    <div class="admin-bar"><span class="muted-p">${list.length} products · changes appear in the shop straight away.</span>
      <button class="btn btn-primary btn-sm" data-act="adminEditProduct" data-arg="new">+ Add product</button></div>
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th></th><th>Product</th><th>Category</th><th>Step</th><th class="num">Price</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map((p) => `
        <tr class="${p.active ? '' : 'muted-row'}">
          <td><span class="oi-emoji" style="background:${esc(p.bg)}">${productArt(p, 'thumb')}</span></td>
          <td><b>${esc(p.name)}</b><br><small>${esc(p.id)}${p.orders ? ` · in ${p.orders} order${p.orders === 1 ? '' : 's'}` : ''}</small></td>
          <td>${esc(p.cat)}</td><td>${esc(p.slot)}</td>
          <td class="num">${money(p.price)}</td>
          <td class="num ${p.stock === 0 ? 'danger-t' : p.stock != null && p.stock <= 5 ? 'warn-t' : ''}">${p.stock == null ? '—' : p.stock}</td>
          <td>${p.active ? '<span class="status-pill delivered">Live</span>' : '<span class="status-pill">Hidden</span>'}</td>
          <td class="row-actions">
            <button class="link-btn" data-act="adminEditProduct" data-arg="${esc(p.id)}">Edit</button>
            <button class="link-btn" data-act="adminToggleProduct" data-arg="${esc(p.id)}">${p.active ? 'Hide' : 'Show'}</button>
            <button class="link-btn danger" data-act="adminDeleteProduct" data-arg="${esc(p.id)}">Delete</button>
          </td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

function productFormHTML() {
  const id = state.admin.editing;
  const p = id === 'new'
    ? { name: '', price: '', cat: '', slot: 'Treat', tod: 'both', skin: [], dosha: [], concern: [], ings: [], benefit: '', desc: '', sourcing: '', safety: [], bg: '#E7EFE9', stock: 25, active: true, packaging: '', texture: '', liquid: '' }
    : state.admin.products.find((x) => x.id === id);
  if (!p) { state.admin.editing = null; return adminProductsHTML(); }
  const checks = (name, options, cur, label) => `<fieldset class="field checks" data-f="${name}"><legend>${label}</legend>
    ${options.map((o) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(o)}" ${(cur || []).includes(o) ? 'checked' : ''}> ${esc(name === 'dosha' ? doshaLabel(o) : name === 'skin' ? skinLabel(o) : titleCase(o))}</label>`).join('')}
    <div class="field-err" id="e_${name}"></div></fieldset>`;
  const cats = [...new Set(state.admin.products.map((x) => x.cat))].sort();
  return `
    <div class="admin-bar"><h3 style="margin:0">${id === 'new' ? 'Add a product' : 'Edit ' + esc(p.name)}</h3>
      <button class="btn btn-ghost btn-sm" data-act="adminCancelEdit">Cancel</button></div>
    <div class="form-msg" id="formMsg" role="alert"></div>
    <form class="product-form" novalidate data-submit="adminSaveProduct" data-input="adminArtPreview" data-change="adminArtPreview">
      <div class="pf-grid">
        <div>
          ${fieldHTML('name', 'Name', p.name, 'required maxlength="80"')}
          <div class="field-row">
            ${fieldHTML('price', 'Price ($)', p.price, 'type="number" min="0" max="1000" step="0.01" required')}
            ${fieldHTML('stock', 'Stock', p.stock == null ? '' : p.stock, 'type="number" min="0" step="1" placeholder="blank = not tracked"')}
          </div>
          <div class="field-row">
            ${fieldHTML('category', 'Category', p.cat, 'list="catList" required maxlength="40" placeholder="e.g. Serum"')}
            <datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
            <div class="field" data-f="slot"><label for="f_slot">Routine step</label>
              <select id="f_slot">${SLOTS.map((s) => `<option ${p.slot === s ? 'selected' : ''}>${s}</option>`).join('')}</select><div class="field-err" id="e_slot"></div></div>
          </div>
          <div class="field" data-f="tod"><label for="f_tod">Use it</label>
            <select id="f_tod">${[['both', 'Morning & evening'], ['AM', 'Morning only'], ['PM', 'Evening only']].map(([v, l]) => `<option value="${v}" ${p.tod === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${checks('skin', ['oily', 'normal', 'combination', 'dry'], p.skin, 'Suits skin types')}
          ${checks('dosha', ['vata', 'pitta', 'kapha'], p.dosha, 'Suits doshas')}
          ${checks('concern', CONCERNS, p.concern, 'Helps with (optional)')}
        </div>
        <div>
          ${fieldHTML('ings', 'Key ingredients (comma-separated)', (p.ings || []).join(', '), 'required placeholder="Neem, Tulsi, Aloe"')}
          ${fieldHTML('benefit', 'One-line benefit', p.benefit, 'maxlength="160"')}
          <div class="field" data-f="desc"><label for="f_desc">Description</label><textarea id="f_desc" rows="4" maxlength="800">${esc(p.desc)}</textarea><div class="field-err" id="e_desc"></div></div>
          ${fieldHTML('sourcing', 'Sourcing', p.sourcing, 'maxlength="300"', true)}
          ${fieldHTML('safety', 'Safety notes (comma-separated)', (p.safety || []).join(', '), 'placeholder="Fragrance-free, Pregnancy-safe"', true)}
          <fieldset class="field art-fields"><legend>Product illustration</legend>
            <div class="art-row">
              <div class="art-preview" id="artPreview" style="background:${esc(p.bg)}">${productArt(p, 'modal')}</div>
              <div class="art-controls">
                <div class="field"><label for="f_packaging">Packaging</label>
                  <select id="f_packaging"><option value="">Automatic (from routine step)</option>
                  ${['pump', 'mist', 'dropper', 'jar', 'tube'].map((k) => `<option value="${k}" ${p.packaging === k ? 'selected' : ''}>${{ pump: 'Pump bottle', mist: 'Mist spray', dropper: 'Dropper bottle', jar: 'Jar', tube: 'Tube' }[k]}</option>`).join('')}</select></div>
                <div class="field"><label for="f_texture">What’s inside</label>
                  <select id="f_texture"><option value="">Automatic</option>
                  ${['gel', 'water', 'serum', 'oil', 'cream', 'clay', 'lotion'].map((k) => `<option value="${k}" ${p.texture === k ? 'selected' : ''}>${{ gel: 'Gel (slow bubbles)', water: 'Water / toner (petals & bubbles)', serum: 'Serum (sparkles)', oil: 'Oil (golden droplets)', cream: 'Cream (swirl)', clay: 'Clay (grains)', lotion: 'Lotion (shimmer)' }[k]}</option>`).join('')}</select></div>
                <div class="field-row">
                  <div class="field"><label for="f_liquid">Liquid colour</label><input id="f_liquid" type="color" value="${esc(p.liquid || artFor(p).liquid)}"></div>
                  ${fieldHTML('bg', 'Card colour', p.bg, 'type="color"')}
                </div>
                <label class="check"><input type="checkbox" id="f_liquidAuto" ${p.liquid ? '' : 'checked'}> Colour from the first ingredient</label>
              </div>
            </div>
          </fieldset>
          <label class="check"><input type="checkbox" id="f_active" ${p.active ? 'checked' : ''}> Live in the shop</label>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:10px">
        <button class="btn btn-primary" id="saveProductBtn">${id === 'new' ? 'Add product' : 'Save changes'}</button>
        <button type="button" class="btn btn-ghost" data-act="adminCancelEdit">Cancel</button>
      </div>
    </form>`;
}
function adminEditProduct(id) { state.admin.editing = id; renderAdmin(); window.scrollTo({ top: 0 }); }
function adminCancelEdit() { state.admin.editing = null; renderAdmin(); }

function readProductForm() {
  const checked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  const stock = fval('stock');
  return {
    name: fval('name'), price: fval('price'), stock: stock === '' ? null : Number(stock),
    category: fval('category'), slot: $('#f_slot').value, tod: $('#f_tod').value,
    skin: checked('skin'), dosha: checked('dosha'), concern: checked('concern'),
    ings: fval('ings'), benefit: fval('benefit'), desc: $('#f_desc').value.trim(), sourcing: fval('sourcing'),
    safety: fval('safety'), bg: $('#f_bg').value, active: $('#f_active').checked,
    packaging: $('#f_packaging').value, texture: $('#f_texture').value,
    liquid: $('#f_liquidAuto').checked ? '' : $('#f_liquid').value,
  };
}
// Redraws the bottle as the admin edits (ingredients, step, packaging, colours…).
function adminArtPreview(_v, _b, _el, e) {
  const box = $('#artPreview'); if (!box) return;
  if (e && e.target && e.target.id === 'f_liquid') $('#f_liquidAuto').checked = false; // picking a colour = custom
  const d = readProductForm();
  const preview = { ...d, id: 'preview', cat: d.category, ings: String(d.ings).split(',').map((x) => x.trim()).filter(Boolean) };
  box.style.background = d.bg;
  box.innerHTML = productArt(preview, 'modal');
  if ($('#f_liquidAuto').checked) $('#f_liquid').value = artFor(preview).liquid;
}
async function adminSaveProduct() {
  const d = readProductForm(), errs = {};
  if (!d.name) errs.name = 'Give the product a name.';
  if (d.price === '' || !(Number(d.price) >= 0) || Number(d.price) > 1000) errs.price = 'Between 0 and 1000.';
  if (d.stock != null && !(Number.isInteger(d.stock) && d.stock >= 0)) errs.stock = 'A whole number, or blank.';
  if (!d.category) errs.category = 'Add a category.';
  if (!d.skin.length) errs.skin = 'Pick at least one.';
  if (!d.dosha.length) errs.dosha = 'Pick at least one.';
  if (!d.ings) errs.ings = 'List at least one ingredient.';
  showFieldErrors(errs); formMsg('');
  if (Object.keys(errs).length) return;
  const id = state.admin.editing;
  await withBusy($('#saveProductBtn'), 'Saving…', async () => {
    try {
      if (id === 'new') await API.admin.createProduct(d); else await API.admin.updateProduct(id, d);
      state.admin.editing = null; state.admin.products = null;
      await refreshProducts(); // the shop shows the change right away
      toast(id === 'new' ? 'Product added' : 'Product saved');
      renderAdmin();
    } catch (e) { if (!handleAuthError(e, 'admin')) formMsg(e.message); }
  });
}
async function adminToggleProduct(id) {
  const p = state.admin.products.find((x) => x.id === id); if (!p) return;
  try {
    await API.admin.updateProduct(id, { active: !p.active });
    state.admin.products = null; await refreshProducts();
    toast(p.active ? `${p.name} hidden from the shop` : `${p.name} is live`);
    renderAdmin();
  } catch (e) { toast(e.message); }
}
async function adminDeleteProduct(id) {
  const p = state.admin.products.find((x) => x.id === id); if (!p) return;
  const msg = p.orders
    ? `${p.name} is in past orders, so it will be hidden (archived) rather than deleted. Continue?`
    : `Delete ${p.name} permanently?`;
  if (!confirm(msg)) return;
  try {
    const r = await API.admin.deleteProduct(id);
    state.admin.products = null; await refreshProducts();
    toast(r.archived ? `${p.name} archived` : `${p.name} deleted`);
    renderAdmin();
  } catch (e) { toast(e.message); }
}

/* ---------- Orders ---------- */
function adminOrdersHTML() {
  const a = state.admin;
  const filters = [['', 'All'], ['placed', 'To ship'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];
  return `
    <div class="filters">${filters.map(([v, l]) => `<button class="pill ${a.orderFilter === v ? 'active' : ''}" data-act="adminOrderFilter" data-arg="${v}">${l}</button>`).join('')}</div>
    ${a.orders.length ? a.orders.map((o) => `
      <div class="order">
        <div class="order-top">
          <div><b>${esc(o.order_no)}</b><span class="status-pill ${esc(o.status)}">${STATUS_LABEL[o.status] || esc(o.status)}</span>
            <small>${fmtDateTime(o.date)} · ${esc(o.customer ? (o.customer.name || o.customer.email) : 'deleted account')}${o.customer ? ' · ' + esc(o.customer.email) : ''}</small></div>
          <div class="order-total">${money(o.total)}</div>
        </div>
        <div class="order-ship">${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(' · ')}</div>
        ${addressLine(o.ship_to) ? `<div class="order-ship">Ship to: ${esc(o.ship_to.name || '')}, ${addressLine(o.ship_to)}${o.ship_to.phone ? ' · ' + esc(o.ship_to.phone) : ''}</div>` : ''}
        ${o.tracking_no ? `<div class="order-ship">Tracking: <b>${esc(o.tracking_no)}</b></div>` : ''}
        ${NEXT_STATUS[o.status].length ? `<div class="order-actions">
          ${NEXT_STATUS[o.status].map((s) => `<button class="link-btn ${s === 'cancelled' ? 'danger' : ''}" data-act="adminSetStatus" data-arg="${esc(o.order_no)}" data-arg2="${s}">Mark ${STATUS_LABEL[s].toLowerCase()}</button>`).join('')}
        </div>` : ''}
      </div>`).join('')
    : '<p class="muted-p">No orders here.</p>'}`;
}
function adminOrderFilter(v) { state.admin.orderFilter = v; state.admin.orders = null; renderAdmin(); }
async function adminSetStatus(no, status, el) {
  let tracking = null;
  if (status === 'shipped') {
    tracking = prompt(`Tracking number for ${no} (optional):`, '');
    if (tracking === null) return; // cancelled the prompt
  } else if (status === 'cancelled' && !confirm(`Cancel order ${no}? The customer is emailed and stock is put back.`)) return;
  if (el) el.disabled = true;
  try {
    await API.admin.setOrderStatus(no, status, tracking || null);
    toast(`${no} marked ${STATUS_LABEL[status].toLowerCase()} — customer emailed`);
    state.admin.orders = null; if (status === 'cancelled') refreshProducts();
    renderAdmin();
  } catch (e) { toast(e.message); if (el) el.disabled = false; }
}

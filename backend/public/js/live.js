// Kanti storefront — live.js
// Live updates (Server-Sent Events from /api/live): the bag, saved items, routine, diary, orders and
// stock update in every open tab and device without reloading. Plus the notification bell and
// optional push notifications on this device (via the service worker in /sw.js).

let liveES = null, liveProductsT = null;
function liveRestart() {
  if (!('EventSource' in window)) return;
  if (liveES) liveES.close();
  liveES = new EventSource('/api/live?tab=' + encodeURIComponent(API.tab));
  const on = (type, fn) => liveES.addEventListener(type, (ev) => { let d = {}; try { d = JSON.parse(ev.data || '{}'); } catch (e) {} Promise.resolve(fn(d)).catch(() => {}); });
  const keepScroll = (fn) => { const y = window.scrollY; fn(); window.scrollTo(0, y); };

  on('cart', async () => {
    if (!API.isAuthed()) return;
    const r = await API.cart(); setCartFromServer(r.items);
    if ($('#drawer').classList.contains('open')) renderDrawer();
    if (state.view === 'checkout') render();
    toast('Your bag was updated on another device');
  });
  on('wishlist', async () => { await syncWishlist(); if (state.view === 'saved') render(); else if (state.view === 'shop') renderShopResults(); });
  on('routine', async () => { await syncRoutine(); if (['results', 'routine'].includes(state.view)) keepScroll(render); });
  on('diary', () => { state.diary.entries = null; state.diary.form = null; if (state.view === 'routine') loadDiary(); });
  on('orders', async () => {
    if (!API.isAuthed()) return;
    try { session.orders = (await API.orders()).orders || []; } catch (e) { return; }
    if (state.view === 'account') keepScroll(render);
  });
  on('products', () => { // stock, prices, new products — batched
    clearTimeout(liveProductsT);
    liveProductsT = setTimeout(async () => {
      await refreshProducts();
      if (state.view === 'shop') renderShopResults();
      else if (['home', 'results', 'saved', 'compare'].includes(state.view)) keepScroll(render);
      if ($('#overlay').classList.contains('open') && state.modalId) openModal(state.modalId);
    }, 600);
  });
  on('notification', (d) => {
    if (typeof d.unread === 'number') setUnread(d.unread);
    if (d.notification) {
      state.notes.list = [d.notification, ...state.notes.list.filter((n) => n.id !== d.notification.id)].slice(0, 30);
      toast('🔔 ' + d.notification.title);
      const b = $('#navBell'); if (b) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
      if (!$('#bellPanel').hidden) renderBell();
    }
  });
  on('prefs', async () => { try { await loadSession(); applyPrefs(); updateHeader(); if (state.view === 'account') keepScroll(render); } catch (e) {} });
  on('session', (d) => {
    if (!d.ended) return;
    // Your own "Sign out" also ends the session on the server — that one needs no explanation.
    if (d.reason === 'signed out') { if (session.user || API.isAuthed()) localSignOut('manual'); return; }
    localSignOut(d.reason === 'inactivity' ? 'idle' : 'revoked');
  });
}

/* ---------- Notification bell ---------- */
state.notes = { list: [], unread: 0, push: null, loaded: false };
const NOTE_ICON = { order: '📦', restock: '✨', reminder: '⏰', review: '⭐', support: '💬', news: '🌿', test: '🔔' };
function resetNotifications() { state.notes = { list: [], unread: 0, push: null, loaded: false }; setUnread(0); const p = $('#bellPanel'); if (p) p.hidden = true; updateBellVisibility(); }
function updateBellVisibility() { const b = $('#navBell'); if (b) b.classList.toggle('hidden', !API.isAuthed()); }
function setUnread(n) {
  state.notes.unread = n;
  const c = $('#bellCount'); if (c) { c.textContent = n > 9 ? '9+' : n; c.classList.toggle('hidden', !n); }
  const b = $('#navBell'); if (b) b.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
}
async function loadNotifications() {
  updateBellVisibility();
  if (!API.isAuthed()) return;
  try {
    const r = await API.notifications();
    state.notes.list = r.notifications; state.notes.push = r.push; state.notes.loaded = true; setUnread(r.unread);
    if (!$('#bellPanel').hidden) renderBell();
  } catch (e) { handleAuthError(e, state.view); }
}
function toggleBell() {
  const p = $('#bellPanel'); p.hidden = !p.hidden;
  $('#navBell').setAttribute('aria-expanded', !p.hidden);
  if (!p.hidden) { renderBell(); if (!state.notes.loaded) loadNotifications(); }
}
const timeAgo = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
function renderBell() {
  const N = state.notes, p = N.push;
  const pushOn = !!(p && p.devices && localStorage.getItem('kanti_push') === '1');
  const pushOk = p && p.available && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  $('#bellPanel').innerHTML = `
    <div class="bp-head"><b>Notifications</b>${N.unread ? '<button class="link-btn" data-act="readAllNotes">Mark all read</button>' : ''}</div>
    <div class="bp-list">${N.list.length ? N.list.map((n) => `
      <button class="bp-item ${n.read_at ? '' : 'unread'}" data-act="openNote" data-arg="${n.id}">
        <span class="bp-ico" aria-hidden="true">${NOTE_ICON[n.kind] || '🔔'}</span>
        <span class="bp-txt"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}</span>
        <span class="bp-time">${timeAgo(n.created_at)}</span>
      </button>`).join('') : `<p class="bp-empty">${N.loaded ? 'You’re all caught up 🌿' : 'Loading…'}</p>`}</div>
    <div class="bp-foot">
      ${pushOk ? (pushOn
        ? '<span>🔔 Alerts on this device</span><button class="link-btn" data-act="pushTest">Test</button><button class="link-btn" data-act="pushOff">Turn off</button>'
        : '<button class="btn btn-ghost btn-sm" data-act="pushOn">Get alerts on this device</button>')
      : '<small class="muted-p">Device alerts aren’t supported in this browser.</small>'}
      <button class="link-btn" data-act="openReminderSettings">Reminder settings</button>
    </div>`;
}
async function openNote(id) {
  const n = state.notes.list.find((x) => String(x.id) === String(id)); if (!n) return;
  if (!n.read_at) { n.read_at = new Date().toISOString(); try { setUnread((await API.readNotifications(n.id)).unread); } catch (e) {} }
  $('#bellPanel').hidden = true;
  if (n.link && n.link.startsWith('/#')) { location.hash = n.link.slice(2); }
}
async function readAllNotes() {
  try { setUnread((await API.readNotifications()).unread); state.notes.list.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); }); renderBell(); } catch (e) {}
}
function openReminderSettings() { $('#bellPanel').hidden = true; state.acctSection = 'prefs'; go('account'); }
document.addEventListener('click', (e) => {
  const p = $('#bellPanel');
  if (p && !p.hidden && !e.target.closest('#bellPanel') && !e.target.closest('#navBell')) p.hidden = true;
});

/* ---------- Push notifications on this device ---------- */
const b64ToBytes = (b64) => { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function pushOn() {
  const key = state.notes.push && state.notes.push.publicKey; if (!key) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications are blocked — allow them in your browser settings'); return; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    const r = await API.pushSubscribe(sub.toJSON());
    state.notes.push.devices = r.devices; localStorage.setItem('kanti_push', '1');
    toast('Alerts are on for this device'); renderBell();
  } catch (e) { toast('Couldn’t turn on alerts: ' + (e.message || 'unknown error')); }
}
async function pushOff() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { const r = await API.pushUnsubscribe(sub.endpoint); await sub.unsubscribe(); state.notes.push.devices = r.devices; }
    localStorage.removeItem('kanti_push'); toast('Alerts turned off for this device'); renderBell();
  } catch (e) { toast(e.message); }
}
async function pushTest() { try { await API.pushTest(); } catch (e) { toast(e.message); } }

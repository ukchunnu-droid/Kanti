// Kanti storefront — session.js
// Inactivity sign-out, "remember me", and the devices list.
//  • Activity (mouse, keys, taps, scrolling) is shared by every open Kanti tab through localStorage.
//  • After 5 minutes of no activity a warning counts down 2 minutes; "Stay signed in" in any tab
//    answers for all tabs. With no answer, every tab signs out and personal data leaves the screen.
//  • The server enforces the same rule (tabs report every 30s), so closing the tab or editing the
//    page doesn't keep a session alive. Timings come from the server (GET /api/session).

const Idle = { warn: 300, grace: 120, tick: null, ping: null, local: 0, lastWrite: 0, lastPing: Date.now(), open: false, running: false };
const ACT_KEY = 'kanti_act';
const chan = ('BroadcastChannel' in window) ? new BroadcastChannel('kanti-session') : null;

function markActivity() {
  if (Idle.open) return; // the warning needs a deliberate answer — moving the mouse doesn't dismiss it
  const t = Date.now(); Idle.local = t;
  if (t - Idle.lastWrite > 3000) { Idle.lastWrite = t; try { localStorage.setItem(ACT_KEY, String(t)); } catch (e) {} }
}
function lastActivity() {
  let shared = 0; try { shared = Number(localStorage.getItem(ACT_KEY)) || 0; } catch (e) {}
  return Math.max(shared, Idle.local);
}
['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'wheel'].forEach((ev) =>
  window.addEventListener(ev, markActivity, { passive: true, capture: true }));

async function startIdle() {
  if (!API.isAuthed() || Idle.running) return;
  Idle.running = true;
  try { const s = await API.session(); if (s.idle) { Idle.warn = s.idle.warn_s; Idle.grace = s.idle.grace_s; } } catch (e) {}
  Idle.local = Date.now(); Idle.lastWrite = 0; markActivity(); Idle.lastPing = Date.now();
  clearInterval(Idle.tick); clearInterval(Idle.ping);
  Idle.tick = setInterval(idleTick, 1000);
  Idle.ping = setInterval(idlePing, Math.min(30000, Math.max(3000, Idle.warn * 250)));
}
function stopIdle() { Idle.running = false; clearInterval(Idle.tick); clearInterval(Idle.ping); closeIdleModal(); }

// Tell the server this tab is open, and whether the person did anything since the last report.
async function idlePing() {
  if (!API.isAuthed()) { stopIdle(); return; }
  const active = lastActivity() > Idle.lastPing && !Idle.open;
  Idle.lastPing = Date.now();
  try { await API.ping(active); } catch (e) { if (e.status === 401) localSignOut(e.reason || 'expired', e.message); }
}
function idleTick() {
  if (!API.isAuthed()) { stopIdle(); return; }
  const idle = Date.now() - lastActivity();
  const warnMs = Idle.warn * 1000, endMs = (Idle.warn + Idle.grace) * 1000;
  if (idle >= endMs) { expireSession(); return; }
  if (idle >= warnMs) showIdleModal(Math.ceil((endMs - idle) / 1000));
  else if (Idle.open) closeIdleModal(); // another tab chose "Stay signed in"
}

function showIdleModal(secs) {
  let m = document.getElementById('idleModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'idleModal'; m.className = 'sys-modal';
    m.innerHTML = `<div class="sys-card" role="alertdialog" aria-modal="true" aria-labelledby="idleTitle" aria-describedby="idleText">
      <svg class="sys-mark" aria-hidden="true"><use href="#kanti-mark"/></svg>
      <h2 id="idleTitle">Are you still there?</h2>
      <p id="idleText">For your security, you’ll be signed out in <b id="idleSecs"></b> because you’ve been inactive.</p>
      <div class="idle-bar"><span id="idleBar"></span></div>
      <div class="sys-actions">
        <button class="btn btn-ghost" data-act="idleSignOut">Sign out</button>
        <button class="btn btn-primary" data-act="idleStay" id="idleStayBtn">Stay signed in</button>
      </div></div>`;
    document.body.appendChild(m);
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('#idleSecs').textContent = fmt(secs);
  $('#idleBar').style.width = Math.max(0, Math.min(100, (secs / Idle.grace) * 100)) + '%';
  if (!Idle.open) { Idle.open = true; m.classList.add('open'); setTimeout(() => { const b = $('#idleStayBtn'); if (b) b.focus(); }, 30); }
}
function closeIdleModal() {
  Idle.open = false;
  const m = document.getElementById('idleModal'); if (m) m.classList.remove('open');
}
async function idleStay() {
  closeIdleModal();
  Idle.lastWrite = 0; markActivity();
  try { await API.ping(true); Idle.lastPing = Date.now(); toast('You’re still signed in'); }
  catch (e) { if (e.status === 401) localSignOut(e.reason || 'expired', e.message); }
}
async function idleSignOut() { closeIdleModal(); await signOut(); }
function expireSession() {
  stopIdle();
  // Clear this device first (and explain why), then tell the server — the session cookie is still sent.
  const done = API.logout().catch(() => {});
  localSignOut('idle');
  return done;
}

// Ends the session on this device without calling the server again (it already knows), and tells other tabs.
const REASONS = {
  idle: ['Signed out after inactivity', 'You were inactive for a while, so we signed you out to keep your account safe. Your bag is saved to your account.'],
  revoked: ['You were signed out', 'This device was signed out from another device or after a password change.'],
  expired: ['Your session ended', 'Please sign in again to continue.'],
};
function localSignOut(reason, message, fromOtherTab) {
  const wasSignedIn = !!(session.user || API.isAuthed());
  stopIdle();
  document.cookie = 'kanti_signed_in=; Max-Age=0; Path=/';
  resetSession(); state.profile = null; state.cart = []; routine = blankProgress();
  state.wish = []; state.alerts = []; state.diary = { entries: null, tags: [], loading: false, form: null };
  state.reco = { key: '', data: null, pending: null }; state.beyond = { key: '', data: null, pending: null, error: null };
  if (state.guide) { state.guide.msgs = []; if (state.guide.open) guideToggle(); }
  try {
    ['kanti_routine', 'kanti_wish', 'kanti_quiz'].forEach((k) => localStorage.removeItem(k));
    ['kanti_reco', 'kanti_guide', 'kanti_state'].forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {}
  if (typeof liveRestart === 'function') liveRestart();
  if (typeof resetNotifications === 'function') resetNotifications();
  updateCartCount(false); updateWishCount(); updateHeader();
  if (!fromOtherTab && chan) chan.postMessage({ type: 'signout', reason });
  closeModal(); closeCart();
  go('home');
  if (wasSignedIn && REASONS[reason]) showNotice(REASONS[reason][0], message && reason !== 'idle' ? message : REASONS[reason][1]);
}
function showNotice(title, text) {
  let m = document.getElementById('noticeModal');
  if (!m) { m = document.createElement('div'); m.id = 'noticeModal'; m.className = 'sys-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="sys-card" role="alertdialog" aria-modal="true" aria-labelledby="noticeTitle">
    <svg class="sys-mark" aria-hidden="true"><use href="#kanti-mark"/></svg>
    <h2 id="noticeTitle">${esc(title)}</h2><p>${esc(text)}</p>
    <div class="sys-actions"><button class="btn btn-ghost" data-act="closeNotice">Close</button><button class="btn btn-primary" data-act="noticeSignIn">Sign in again</button></div></div>`;
  m.classList.add('open');
}
function closeNotice() { const m = document.getElementById('noticeModal'); if (m) m.classList.remove('open'); }
function noticeSignIn() { closeNotice(); go('signin'); }

// Other tabs: signing out (or in) in one tab updates the rest.
if (chan) chan.onmessage = (ev) => {
  const d = ev.data || {};
  if (d.type === 'signout' && (session.user || state.cart.length || state.profile)) localSignOut(d.reason, null, true);
  if (d.type === 'signin') location.reload();
};
function broadcastSignIn() { if (chan) chan.postMessage({ type: 'signin' }); }

/* ---------- Devices (account page) ---------- */
state.devices = null;
function devicesCardHTML() {
  if (!state.devices) { loadDevices(); return `<div class="acct-card"><h3>Devices</h3><p class="muted-p pulse">Loading…</p></div>`; }
  const ago = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'active now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(iso); };
  const list = state.devices;
  return `<div class="acct-card wide devices">
    <div class="acct-card-head"><h3>Devices & sessions</h3>${list.length > 1 ? '<button class="link-btn danger" data-act="signOutOthers">Sign out all other devices</button>' : ''}</div>
    ${list.map((s) => `<div class="device-row">
      <span class="device-ico" aria-hidden="true">${s.device.mobile ? '📱' : '💻'}</span>
      <div class="device-info"><b>${esc(s.device.label)}</b>${s.current ? ' <span class="badge-now">This device</span>' : ''}
        <small>${s.current ? 'Active now' : 'Last active ' + ago(s.last_active_at)} · signed in ${fmtDate(s.created_at)}${s.remember ? ' · remembered' : ''}${s.ip ? ' · network ' + esc(s.ip) : ''}</small></div>
      ${s.current ? '' : `<button class="link-btn" data-act="signOutDevice" data-arg="${esc(s.id)}">Sign out</button>`}
    </div>`).join('')}
    <p class="muted-p" style="margin-top:10px">Don’t recognise a device? Sign it out and change your password.</p>
  </div>`;
}
async function loadDevices() {
  try { state.devices = (await API.sessions()).sessions; } catch (e) { if (handleAuthError(e, 'account')) return; state.devices = []; }
  if (state.view === 'account') render();
}
async function signOutDevice(id) {
  try { await API.endSession(id); toast('That device was signed out'); } catch (e) { toast(e.message); }
  state.devices = null; render();
}
async function signOutOthers() {
  try { const r = await API.endOtherSessions(); toast(`Signed out ${r.ended} other device${r.ended === 1 ? '' : 's'}`); } catch (e) { toast(e.message); }
  state.devices = null; render();
}

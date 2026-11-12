// Notifications: the bell in the header, live delivery to open tabs, and optional web push to
// phones/desktops. Plus a small scheduler for routine reminders and diary nudges (in each person's
// own time zone, at the times they chose).
const store = require('./store');
const db = require('./db');
const live = require('./live');
const email = require('./email');
const log = require('./log');

// ---------- Web push (VAPID keys from .env, or generated once and kept in the database) ----------
let webpush = null, vapid = null;
function pushSetup() {
  if (vapid) return vapid;
  try { webpush = require('web-push'); } catch { return null; }
  let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    pub = db.getMeta('vapid_public'); priv = db.getMeta('vapid_private');
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      db.setMeta('vapid_public', pub); db.setMeta('vapid_private', priv);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@kanti.example', pub, priv);
  vapid = { publicKey: pub };
  return vapid;
}
async function sendPush(userId, payload) {
  const subs = store.push.forUser(userId);
  if (!subs.length || !pushSetup()) return;
  await Promise.all(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 })
    .catch((e) => {
      if (e.statusCode === 404 || e.statusCode === 410) store.push.remove(s.endpoint); // unsubscribed in the browser
      else log.warn('push failed', { status: e.statusCode, error: String(e.message).slice(0, 120) });
    })));
}

// Saves a notification, shows it in open tabs, and pushes it to subscribed devices.
function notify(userId, n) {
  const row = store.notifications.add(userId, n);
  live.toUser(userId, 'notification', { notification: row, unread: store.notifications.unread(userId) });
  sendPush(userId, { title: row.title, body: row.body, link: row.link || '/', tag: n.kind }).catch(() => {});
  return row;
}

// ---------- Scheduler ----------
function localParts(tz) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
  } catch { return null; }
}
function runScheduler() {
  for (const u of store.prefs.usersWithReminders()) {
    const r = u.prefs.reminders || {};
    if (!r.enabled) continue;
    const t = localParts(u.prefs.tz || 'UTC'); if (!t) continue;
    const due = (kind, at, until) => at && t.hm >= at && t.hm <= until && store.notifications.onceToday(u.id, kind, t.day);
    const fire = (title, body, link) => {
      notify(u.id, { kind: 'reminder', title, body, link });
      email.queueReminder(u.email, u.name, title, body).catch(() => {});
    };
    if (due('am', r.am || '07:30', '11:59')) fire('Time for your morning routine', 'A few calm minutes: cleanse, tone, treat, moisturise, protect.', '/#routine');
    if (due('pm', r.pm || '21:30', '23:59')) fire('Time for your evening routine', 'Wind down with your evening steps.', '/#routine');
    if (u.prefs.diary_nudge !== false && due('diary', '20:30', '23:59')) {
      const diary = db.getDiary(u.id, 1);
      if (diary.length && diary[0].day !== t.day) fire('How was your skin today?', 'Ten seconds in your skin diary helps you see what’s working.', '/#routine');
    }
  }
}
let timer = null;
function startScheduler(intervalMs = 60000) {
  if (timer) return;
  timer = setInterval(() => {
    try { runScheduler(); store.sessions.purge(); } catch (e) { log.warn('scheduler failed', { error: e.message }); }
  }, intervalMs);
  timer.unref();
  setInterval(() => { try { store.events.purge(); } catch { /* ignore */ } }, 6 * 3600e3).unref();
}
const stopScheduler = () => { if (timer) clearInterval(timer); timer = null; };

module.exports = { notify, pushSetup, sendPush, runScheduler, startScheduler, stopScheduler, localParts };

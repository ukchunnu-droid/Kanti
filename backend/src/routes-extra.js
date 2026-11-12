// Routes for the newer features: sessions & devices, live updates, notifications & push, address book,
// email preferences & unsubscribe, preferences & profile photo, weather tips, reviews, analytics and
// the support inbox. Registered by server.js (before its 404 handler).
const crypto = require('crypto');
const db = require('./db');
const store = require('./store');
const live = require('./live');
const notify = require('./notify');
const email = require('./email');
const log = require('./log');
const v = require('./validate');
const { requireAuth, optionalAuth, requireAdmin, IDLE } = require('./auth');

module.exports = function routes(app, { h, bad, tabOf, APP_URL, sha256, endSession, rateLimit, ip }) {
  const trackLimit = rateLimit({ windowMs: 60e3, max: Number(process.env.RATE_TRACK_MAX || 120), key: (req) => 'track:' + ip(req) });
  const ticketLimit = rateLimit({ windowMs: 60 * 60e3, max: Number(process.env.RATE_TICKET_MAX || 8), key: (req) => 'ticket:' + ip(req) });
  const weatherLimit = rateLimit({ windowMs: 60 * 60e3, max: 60, key: (req) => 'weather:' + ip(req) });

  // ---------- Session: inactivity + devices ----------
  app.get('/api/session', optionalAuth, (req, res) => {
    res.json({ signedIn: !!req.userId, idle: { warn_s: IDLE.warn, grace_s: IDLE.grace },
      remember: req.session ? !!req.session.remember : null });
  });
  // Each open tab reports every ~30s; `active` = the person did something since the last report.
  app.post('/api/session/ping', requireAuth, (req, res) => {
    const active = (req.body || {}).active === true;
    store.sessions.touch(req.sessionId, active);
    res.json({ ok: true, idle: { warn_s: IDLE.warn, grace_s: IDLE.grace } });
  });
  app.get('/api/me/sessions', requireAuth, (req, res) => {
    res.json({ sessions: store.sessions.listActive(req.userId).map((s) => ({
      id: s.id, current: s.id === req.sessionId, remember: !!s.remember, device: describeDevice(s.user_agent),
      created_at: s.created_at, last_active_at: s.last_active_at, ip: maskIp(s.ip),
    })) });
  });
  app.delete('/api/me/sessions/:id', requireAuth, (req, res) => {
    const s = store.sessions.get(String(req.params.id));
    if (!s || s.user_id !== req.userId) return bad(res, 'Session not found.', 404);
    endSession(s.id, 'signed out from another device');
    res.json({ ok: true, current: s.id === req.sessionId });
  });
  app.post('/api/me/sessions/sign-out-others', requireAuth, (req, res) => {
    const others = store.sessions.listActive(req.userId).filter((s) => s.id !== req.sessionId);
    others.forEach((s) => endSession(s.id, 'signed out from another device'));
    res.json({ ended: others.length });
  });

  // ---------- Live updates ----------
  app.get('/api/live', optionalAuth, (req, res) => live.connect(req, res, { userId: req.userId || null, sessionId: req.sessionId || null }));

  // ---------- Notifications + push ----------
  app.get('/api/notifications', requireAuth, (req, res) => {
    res.json({ notifications: store.notifications.list(req.userId), unread: store.notifications.unread(req.userId),
      push: { available: !!notify.pushSetup(), publicKey: (notify.pushSetup() || {}).publicKey || null, devices: store.push.count(req.userId) } });
  });
  app.post('/api/notifications/read', requireAuth, (req, res) => {
    const id = Number((req.body || {}).id) || null;
    store.notifications.markRead(req.userId, id);
    const unread = store.notifications.unread(req.userId);
    live.toUser(req.userId, 'notification', { unread }, tabOf(req));
    res.json({ unread });
  });
  app.post('/api/push/subscribe', requireAuth, (req, res) => {
    const sub = (req.body || {}).subscription;
    const ok = sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000
      && sub.keys && typeof sub.keys.p256dh === 'string' && typeof sub.keys.auth === 'string';
    if (!ok) return bad(res, 'Invalid push subscription.');
    store.push.save(req.userId, sub);
    res.status(201).json({ ok: true, devices: store.push.count(req.userId) });
  });
  app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
    const endpoint = String((req.body || {}).endpoint || '');
    const mine = store.push.forUser(req.userId).some((s) => s.endpoint === endpoint);
    if (mine) store.push.remove(endpoint);
    res.json({ ok: true, devices: store.push.count(req.userId) });
  });
  app.post('/api/push/test', requireAuth, h(async (req, res) => {
    notify.notify(req.userId, { kind: 'test', title: 'Notifications are on 🌿', body: 'This is how Kanti will reach you.', link: '/#account' });
    res.json({ ok: true });
  }));

  // ---------- Address book ----------
  const addrIn = (b) => {
    const { fields, error } = v.profileFields({ name: b.name, phone: b.phone, address: b.address, address2: b.address2, city: b.city, state: b.state, zip: b.zip, country: b.country });
    if (error) return { error };
    if (!fields.address || !fields.city || !fields.zip) return { error: 'Street address, city and ZIP / postcode are required.' };
    return { value: { ...fields, label: v.text(b.label, 30) || null } };
  };
  app.get('/api/me/addresses', requireAuth, (req, res) => res.json({ addresses: store.addresses.list(req.userId) }));
  app.post('/api/me/addresses', requireAuth, (req, res) => {
    const { value, error } = addrIn(req.body || {}); if (error) return bad(res, error);
    if (store.addresses.list(req.userId).length >= 10) return bad(res, 'You can save up to 10 addresses.');
    store.addresses.add(req.userId, value, !!(req.body || {}).is_default);
    res.status(201).json({ addresses: store.addresses.list(req.userId) });
  });
  app.patch('/api/me/addresses/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!store.addresses.get(req.userId, id)) return bad(res, 'Address not found.', 404);
    const { value, error } = addrIn(req.body || {}); if (error) return bad(res, error);
    store.addresses.update(req.userId, id, value);
    if ((req.body || {}).is_default) store.addresses.setDefault(req.userId, id);
    res.json({ addresses: store.addresses.list(req.userId) });
  });
  app.post('/api/me/addresses/:id/default', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!store.addresses.get(req.userId, id)) return bad(res, 'Address not found.', 404);
    store.addresses.setDefault(req.userId, id);
    res.json({ addresses: store.addresses.list(req.userId) });
  });
  app.delete('/api/me/addresses/:id', requireAuth, (req, res) => {
    store.addresses.remove(req.userId, Number(req.params.id));
    res.json({ addresses: store.addresses.list(req.userId) });
  });

  // ---------- Email preferences + unsubscribe ----------
  app.get('/api/me/email-prefs', requireAuth, (req, res) => res.json({ prefs: store.optouts.prefs(req.user.email), categories: store.EMAIL_CATEGORIES }));
  app.put('/api/me/email-prefs', requireAuth, (req, res) => {
    const b = (req.body || {}).prefs || {};
    for (const c of Object.keys(store.EMAIL_CATEGORIES)) if (typeof b[c] === 'boolean') store.optouts.set(req.user.email, c, b[c]);
    res.json({ prefs: store.optouts.prefs(req.user.email) });
  });
  // The link in every marketing email. GET shows a confirm page; POST (button or one-click from the mail app) unsubscribes.
  const unsubPage = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} · Kanti</title><body style="font-family:system-ui,sans-serif;background:#FAF8F3;color:#1C241F;display:grid;place-items:center;min-height:100vh;margin:0">
    <div style="max-width:420px;background:#fff;border:1px solid #E3DFD3;border-radius:14px;padding:28px;text-align:center">
    <div style="font:600 24px Georgia,serif">Kan<span style="color:#B8862B">ti</span></div>${body}</div></body>`;
  app.get('/api/email/unsubscribe', (req, res) => {
    const { e, c, t } = req.query;
    const addr = store.EMAIL_CATEGORIES[c] && email.checkUnsubscribe(e, c, t);
    if (!addr) return res.status(400).type('html').send(unsubPage('Link not valid', '<p>This unsubscribe link isn’t valid. You can change emails from your account page.</p>'));
    res.type('html').send(unsubPage('Unsubscribe', `<p>Stop emails about <b>${escHtml(store.EMAIL_CATEGORIES[c])}</b> to ${escHtml(addr)}?</p>
      <form method="post"><button style="background:#20453B;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:700;cursor:pointer">Unsubscribe</button></form>`));
  });
  app.post('/api/email/unsubscribe', express_urlencoded, (req, res) => {
    const { e, c, t } = req.query;
    const addr = store.EMAIL_CATEGORIES[c] && email.checkUnsubscribe(e, c, t);
    if (!addr) return res.status(400).type('html').send(unsubPage('Link not valid', '<p>This unsubscribe link isn’t valid.</p>'));
    store.optouts.set(addr, c, false);
    log.info('email: unsubscribed', { category: c });
    res.type('html').send(unsubPage('Unsubscribed', `<p>Done — no more emails about <b>${escHtml(store.EMAIL_CATEGORIES[c])}</b>.</p><p><a href="${APP_URL}/#account" style="color:#20453B">Manage all email preferences</a></p>`));
  });

  // ---------- Preferences + profile photo ----------
  app.patch('/api/me/prefs', requireAuth, (req, res) => {
    const { value, error } = prefsIn(req.body || {}); if (error) return bad(res, error);
    const prefs = store.prefs.merge(req.userId, value);
    live.toUser(req.userId, 'prefs', {}, tabOf(req));
    res.json({ prefs });
  });
  app.get('/api/me/avatar', requireAuth, (req, res) => {
    const a = store.avatars.get(req.userId);
    if (!a || !a.avatar) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.type(a.avatar_type).send(a.avatar);
  });
  app.put('/api/me/avatar', requireAuth, (req, res) => {
    const m = String((req.body || {}).image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return bad(res, 'Please upload a JPEG, PNG or WebP image.');
    const buf = Buffer.from(m[2], 'base64');
    const magic = { 'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8, 'image/png': (b) => b[0] === 0x89 && b[1] === 0x50,
      'image/webp': (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' };
    if (buf.length > 250 * 1024 || !magic[m[1]](buf)) return bad(res, 'That image is too large or not a valid picture.');
    store.avatars.set(req.userId, buf, m[1]);
    live.toUser(req.userId, 'prefs', {}, tabOf(req));
    res.json({ ok: true });
  });
  app.delete('/api/me/avatar', requireAuth, (req, res) => { store.avatars.clear(req.userId); res.json({ ok: true }); });

  // ---------- Weather tips (opt-in; coordinates rounded to ~10 km, sent to Open-Meteo — no key, no account) ----------
  const weatherCache = new Map();
  app.get('/api/weather', weatherLimit, h(async (req, res) => {
    const lat = Math.round(Number(req.query.lat) * 10) / 10, lon = Math.round(Number(req.query.lon) * 10) / 10;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return bad(res, 'Invalid location.');
    const key = `${lat},${lon}`, hit = weatherCache.get(key);
    if (hit && Date.now() - hit.at < 30 * 60e3) return res.json(hit.data);
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,uv_index,wind_speed_10m&timezone=auto`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const c = (await r.json()).current || {};
      const data = { temp_c: c.temperature_2m, humidity: c.relative_humidity_2m, uv: c.uv_index, wind_kmh: c.wind_speed_10m, at: new Date().toISOString() };
      weatherCache.set(key, { at: Date.now(), data });
      res.json(data);
    } catch (e) {
      log.warn('weather failed', { error: e.message });
      bad(res, 'Weather isn’t available right now.', 503);
    }
  }));

  // ---------- Reviews ----------
  app.get('/api/products/:id/reviews', optionalAuth, (req, res) => {
    const p = db.getProduct(String(req.params.id));
    if (!p) return bad(res, 'Product not found.', 404);
    const dosha = ['vata', 'pitta', 'kapha'].includes(req.query.dosha) ? req.query.dosha : null;
    res.json({ summary: store.reviews.summary(p.id), reviews: store.reviews.forProduct(p.id, { dosha }),
      mine: req.userId ? store.reviews.mine(req.userId, p.id) : null,
      can_verify: req.userId ? store.reviews.isVerified(req.userId, p.id) : false });
  });
  app.post('/api/products/:id/reviews', requireAuth, (req, res) => {
    const p = db.getProduct(String(req.params.id));
    if (!p || !p.active) return bad(res, 'Product not found.', 404);
    const b = req.body || {};
    const rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return bad(res, 'Choose a rating from 1 to 5 stars.');
    const body = v.text(b.body, 1500), title = v.text(b.title, 80);
    if (body.length < 10) return bad(res, 'Tell us a little more (at least 10 characters).');
    const skin = db.latestQuiz(req.userId) || {};
    const r = store.reviews.upsert(req.userId, p.id, { rating, title, body, verified: store.reviews.isVerified(req.userId, p.id), skin: skin.skinType, dosha: skin.dosha });
    res.status(201).json({ review: { id: r.id, rating: r.rating, title: r.title, body: r.body, status: r.status, verified: !!r.verified } });
  });
  app.get('/api/admin/reviews', requireAdmin, (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    res.json({ reviews: store.reviews.adminList(status) });
  });
  app.patch('/api/admin/reviews/:id', requireAdmin, (req, res) => {
    const status = (req.body || {}).status;
    if (!['approved', 'rejected', 'pending'].includes(status)) return bad(res, 'Unknown status.');
    const r = store.reviews.get(Number(req.params.id));
    if (!r) return bad(res, 'Review not found.', 404);
    store.reviews.moderate(r.id, status);
    if (status === 'approved') {
      const p = db.getProduct(r.product_id);
      notify.notify(r.user_id, { kind: 'review', title: 'Your review is live', body: `Thanks for reviewing ${p ? p.name : 'your product'}.`, link: '/#shop' });
      live.toAll('products', {});
    }
    res.json({ ok: true });
  });

  // ---------- New-product announcement (marketing email, opted-in customers only) ----------
  app.post('/api/admin/products/:id/announce', requireAdmin, h(async (req, res) => {
    const p = db.getProduct(String(req.params.id));
    if (!p || !p.active) return bad(res, 'Product not found.', 404);
    const users = db.raw.prepare('SELECT id, email, name FROM users').all();
    let sent = 0, skipped = 0;
    for (const u of users) {
      const r = await email.queueProductNews(u.email, u.name, p);
      if (r.optedOut) skipped++; else sent++;
      notify.notify(u.id, { kind: 'news', title: `New at Kanti: ${p.name}`, body: p.benefit || '', link: '/#shop' });
    }
    log.info('admin: product announced', { id: p.id, sent, skipped });
    res.json({ sent, skipped });
  }));

  // ---------- Analytics ----------
  // Anonymous, first-party only: a random id kept in this browser, the event name and a few details.
  app.post('/api/track', optionalAuth, trackLimit, (req, res) => {
    const b = req.body || {};
    const anon = /^[a-z0-9-]{8,40}$/i.test(b.anon_id || '') ? b.anon_id : null;
    const list = Array.isArray(b.events) ? b.events.slice(0, 25) : [];
    for (const e of list) {
      if (!e || !store.EVENT_NAMES.includes(e.name) || ['order_placed', 'beyond_search'].includes(e.name)) continue; // those two are logged by the server
      const props = {};
      for (const [k, val] of Object.entries(e.props || {}).slice(0, 6)) {
        if (/^[a-z_]{1,20}$/.test(k) && (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string')) props[k] = typeof val === 'string' ? val.slice(0, 80) : val;
      }
      store.events.add(e.name, { anonId: anon, userId: req.userId, props });
    }
    res.status(204).end();
  });
  app.get('/api/admin/analytics', requireAdmin, (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    res.json({ report: store.events.report(days), live: live.stats() });
  });

  // ---------- Support inbox ----------
  const TOPICS = { order: 'An order', product: 'A product or ingredient', account: 'My account', routine: 'My routine or quiz', other: 'Something else' };
  const ticketView = (t) => ({ ref: t.ref, subject: t.subject, topic: t.topic, topic_label: TOPICS[t.topic] || t.topic, order_no: t.order_no, status: t.status,
    created_at: t.created_at, updated_at: t.updated_at, name: t.name, messages: store.tickets.messages(t.id) });
  app.post('/api/support/tickets', optionalAuth, ticketLimit, h(async (req, res) => {
    const b = req.body || {};
    const user = req.user || null;
    const to = user ? user.email : v.email(b.email);
    if (!to || !v.isEmail(to)) return bad(res, 'Please enter a valid email so we can reply.');
    const name = v.text(b.name, 80) || (user && user.name) || '';
    if (!name) return bad(res, 'Please tell us your name.');
    const topic = TOPICS[b.topic] ? b.topic : 'other';
    const message = String(b.message || '').trim().slice(0, 4000);
    if (message.length < 10) return bad(res, 'Please describe what you need (at least 10 characters).');
    let orderNo = v.text(b.order_no, 20) || null;
    if (orderNo && !(user && db.getOrder(user.id, orderNo))) orderNo = null; // only your own orders can be attached
    const subject = v.text(b.subject, 120) || `${TOPICS[topic]}${orderNo ? ' · ' + orderNo : ''}`;
    const token = crypto.randomBytes(24).toString('hex');
    const t = store.tickets.create({ userId: user && user.id, email: to, name, topic, subject, orderNo, body: message, accessHash: sha256(token) });
    const link = user ? `${APP_URL}/#support=${t.ref}` : `${APP_URL}/#ticket=${token}`;
    email.queueTicketEmail(to, name, t, `We’ve got your message and will reply within one working day.\n\n“${message.slice(0, 600)}”`, link).catch(() => {});
    log.info('support: ticket opened', { ref: t.ref, topic });
    res.status(201).json({ ticket: ticketView(t), link: user ? null : `/#ticket=${token}` });
  }));
  app.get('/api/support/tickets', requireAuth, (req, res) => res.json({ tickets: store.tickets.forUser(req.userId).map((t) => ({ ...ticketView(t), messages: undefined, message_count: t.messages })) }));
  // A ticket is opened by its owner (signed in) or by the private link emailed to a guest.
  function findTicket(req) {
    if (req.params.ref) { const t = store.tickets.byRef(String(req.params.ref)); return t && req.userId && t.user_id === req.userId ? t : null; }
    if (req.params.token && /^[a-f0-9]{48}$/.test(req.params.token)) return store.tickets.byAccess(sha256(req.params.token));
    return null;
  }
  const getT = (req, res) => { const t = findTicket(req); if (!t) return bad(res, 'Request not found.', 404); res.json({ ticket: ticketView(t) }); };
  const replyT = (req, res) => {
    const t = findTicket(req); if (!t) return bad(res, 'Request not found.', 404);
    const b = req.body || {};
    if (b.close === true) { store.tickets.setStatus(t.id, 'closed'); return res.json({ ticket: ticketView(store.tickets.byId(t.id)) }); }
    const body = String(b.message || '').trim().slice(0, 4000);
    if (body.length < 2) return bad(res, 'Please write a message.');
    store.tickets.addMessage(t.id, 'customer', body);
    res.json({ ticket: ticketView(store.tickets.byId(t.id)) });
  };
  app.get('/api/support/tickets/:ref', requireAuth, getT);
  app.post('/api/support/tickets/:ref/messages', requireAuth, replyT);
  app.get('/api/support/access/:token', getT);
  app.post('/api/support/access/:token/messages', ticketLimit, replyT);
  app.get('/api/admin/tickets', requireAdmin, (req, res) => {
    const status = ['open', 'waiting', 'closed'].includes(req.query.status) ? req.query.status : null;
    res.json({ tickets: store.tickets.adminList(status).map((t) => ({ ...ticketView(t), messages: undefined, message_count: t.messages, last_author: t.last_author, email: t.email })), counts: store.tickets.counts() });
  });
  app.get('/api/admin/tickets/:ref', requireAdmin, (req, res) => {
    const t = store.tickets.byRef(String(req.params.ref)); if (!t) return bad(res, 'Request not found.', 404);
    res.json({ ticket: { ...ticketView(t), email: t.email } });
  });
  app.post('/api/admin/tickets/:ref/reply', requireAdmin, h(async (req, res) => {
    const t = store.tickets.byRef(String(req.params.ref)); if (!t) return bad(res, 'Request not found.', 404);
    const body = String((req.body || {}).message || '').trim().slice(0, 4000);
    if (body.length < 2) return bad(res, 'Please write a reply.');
    store.tickets.addMessage(t.id, 'staff', body);
    if ((req.body || {}).close === true) store.tickets.setStatus(t.id, 'closed');
    // Guests get a fresh private link (only a hash of it is stored); customers open it from their account.
    let link = `${APP_URL}/#support=${t.ref}`;
    if (!t.user_id) { const token = crypto.randomBytes(24).toString('hex'); db.raw.prepare('UPDATE tickets SET access_hash = ? WHERE id = ?').run(sha256(token), t.id); link = `${APP_URL}/#ticket=${token}`; }
    email.queueTicketEmail(t.email, t.name, t, body, link).catch(() => {});
    if (t.user_id) notify.notify(t.user_id, { kind: 'support', title: `Kanti support replied · ${t.ref}`, body: body.slice(0, 120), link: `/#support=${t.ref}` });
    res.json({ ticket: { ...ticketView(store.tickets.byId(t.id)), email: t.email } });
  }));
  app.patch('/api/admin/tickets/:ref', requireAdmin, (req, res) => {
    const t = store.tickets.byRef(String(req.params.ref)); if (!t) return bad(res, 'Request not found.', 404);
    const status = (req.body || {}).status;
    if (!['open', 'waiting', 'closed'].includes(status)) return bad(res, 'Unknown status.');
    store.tickets.setStatus(t.id, status);
    res.json({ ok: true });
  });
};

// ---------- helpers ----------
const express_urlencoded = require('express').urlencoded({ extended: false, limit: '2kb' });
const escHtml = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function describeDevice(ua) {
  ua = String(ua || '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|undici/i.test(ua) ? 'App / script' : 'Browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return { browser, os, label: os ? `${browser} on ${os}` : browser, mobile: /iPhone|Android.*Mobile/.test(ua) };
}
// Only the first part of the address is shown (enough to recognise a network, not to locate someone).
function maskIp(ipAddr) {
  const s = String(ipAddr || '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split('.').slice(0, 2).join('.') + '.x.x';
  if (s.includes(':')) return s.split(':').slice(0, 2).join(':') + ':…';
  return '';
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function prefsIn(b) {
  const out = {};
  if ('lang' in b) { if (!['en', 'hi'].includes(b.lang)) return { error: 'Unsupported language.' }; out.lang = b.lang; }
  if ('temp_unit' in b) { if (!['c', 'f'].includes(b.temp_unit)) return { error: 'Unsupported unit.' }; out.temp_unit = b.temp_unit; }
  if ('tz' in b) {
    try { new Intl.DateTimeFormat('en', { timeZone: String(b.tz) }); out.tz = String(b.tz).slice(0, 60); } catch { return { error: 'Unknown time zone.' }; }
  }
  if ('reminders' in b) {
    const r = b.reminders || {};
    if ((r.am && !TIME_RE.test(r.am)) || (r.pm && !TIME_RE.test(r.pm))) return { error: 'Reminder times must look like 07:30.' };
    out.reminders = { enabled: r.enabled === true, am: r.am || '07:30', pm: r.pm || '21:30' };
  }
  if ('diary_nudge' in b) out.diary_nudge = b.diary_nudge === true;
  if ('weather' in b) out.weather = b.weather === true;
  return { value: out };
}
module.exports.describeDevice = describeDevice;

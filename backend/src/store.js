// Data access for the newer features (schema v5): sessions, notifications, push subscriptions,
// address book, email opt-outs, preferences, profile photos, reviews, analytics events, support tickets.
const crypto = require('crypto');
const db = require('./db');

const raw = db.raw;
const now = () => new Date().toISOString();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

// ---------- Sessions ----------
const sessions = {
  create({ userId, remember, ttlMs, userAgent, ip }) {
    const id = crypto.randomBytes(18).toString('base64url');
    const t = now();
    raw.prepare(`INSERT INTO sessions (id, user_id, remember, created_at, last_active_at, tab_seen_at, expires_at, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, remember ? 1 : 0, t, t, t,
      new Date(Date.now() + ttlMs).toISOString(), String(userAgent || '').slice(0, 300), String(ip || '').slice(0, 60));
    return id;
  },
  get: (id) => raw.prepare('SELECT * FROM sessions WHERE id = ?').get(id),
  touch(id, active) {
    const t = now();
    if (active) raw.prepare('UPDATE sessions SET last_active_at = ?, tab_seen_at = ? WHERE id = ? AND revoked_at IS NULL').run(t, t, id);
    else raw.prepare('UPDATE sessions SET tab_seen_at = ? WHERE id = ? AND revoked_at IS NULL').run(t, id);
  },
  revoke: (id, reason) => raw.prepare('UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL').run(now(), reason, id).changes,
  revokeAll: (userId, exceptId, reason) => raw.prepare(`UPDATE sessions SET revoked_at = ?, revoked_reason = ?
    WHERE user_id = ? AND revoked_at IS NULL AND id != coalesce(?, '')`).run(now(), reason, userId, exceptId || null).changes,
  listActive: (userId) => raw.prepare(`SELECT id, remember, created_at, last_active_at, tab_seen_at, expires_at, user_agent, ip
    FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_active_at DESC`).all(userId, now()),
  purge: () => raw.prepare(`DELETE FROM sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?`)
    .run(new Date(Date.now() - 7 * 86400e3).toISOString(), new Date(Date.now() - 86400e3).toISOString()).changes,
};

// ---------- Notifications ----------
const notifications = {
  add(userId, { kind, title, body = '', link = null }) {
    const id = raw.prepare('INSERT INTO notifications (user_id, kind, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, kind, String(title).slice(0, 140), String(body).slice(0, 400), link, now()).lastInsertRowid;
    return raw.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  },
  list: (userId, limit = 30) => raw.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit),
  unread: (userId) => raw.prepare('SELECT count(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n,
  markRead(userId, id) {
    if (id) raw.prepare('UPDATE notifications SET read_at = coalesce(read_at, ?) WHERE user_id = ? AND id = ?').run(now(), userId, id);
    else raw.prepare('UPDATE notifications SET read_at = coalesce(read_at, ?) WHERE user_id = ?').run(now(), userId);
  },
  // Once-per-day guard for reminders/nudges.
  onceToday: (userId, kind, day) => raw.prepare('INSERT OR IGNORE INTO notify_log (user_id, kind, day) VALUES (?, ?, ?)').run(userId, kind, day).changes > 0,
};

const push = {
  save(userId, sub) {
    raw.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now());
  },
  forUser: (userId) => raw.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId),
  remove: (endpoint) => raw.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint),
  count: (userId) => raw.prepare('SELECT count(*) n FROM push_subscriptions WHERE user_id = ?').get(userId).n,
};

// ---------- Address book ----------
const ADDR_FIELDS = ['label', 'name', 'phone', 'address', 'address2', 'city', 'state', 'zip', 'country'];
const addresses = {
  list: (userId) => raw.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id').all(userId),
  get: (userId, id) => raw.prepare('SELECT * FROM addresses WHERE user_id = ? AND id = ?').get(userId, id),
  add(userId, a, makeDefault) {
    return raw.transaction(() => {
      const first = !raw.prepare('SELECT 1 FROM addresses WHERE user_id = ?').get(userId);
      const id = raw.prepare(`INSERT INTO addresses (user_id, ${ADDR_FIELDS.join(', ')}, is_default, created_at)
        VALUES (?, ${ADDR_FIELDS.map(() => '?').join(', ')}, 0, ?)`).run(userId, ...ADDR_FIELDS.map((k) => a[k] || null), now()).lastInsertRowid;
      if (first || makeDefault) this.setDefault(userId, id);
      return id;
    })();
  },
  update(userId, id, a) {
    raw.prepare(`UPDATE addresses SET ${ADDR_FIELDS.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ? AND id = ?`)
      .run(...ADDR_FIELDS.map((k) => a[k] || null), userId, id);
  },
  remove(userId, id) {
    raw.transaction(() => {
      const row = this.get(userId, id);
      raw.prepare('DELETE FROM addresses WHERE user_id = ? AND id = ?').run(userId, id);
      if (row && row.is_default) {
        const next = raw.prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY id LIMIT 1').get(userId);
        if (next) this.setDefault(userId, next.id);
      }
    })();
  },
  setDefault(userId, id) {
    raw.prepare('UPDATE addresses SET is_default = (id = ?) WHERE user_id = ?').run(id, userId);
    const a = this.get(userId, id);
    if (a) db.updateProfile(userId, { address: a.address, address2: a.address2 || '', city: a.city || '', state: a.state || '', zip: a.zip || '', country: a.country || '' });
  },
  // After checkout: remember a new address (same street + zip = already saved).
  remember(userId, a) {
    const dup = raw.prepare('SELECT id FROM addresses WHERE user_id = ? AND lower(address) = lower(?) AND coalesce(zip, \'\') = coalesce(?, \'\')').get(userId, a.address, a.zip || '');
    if (dup) return dup.id;
    return this.add(userId, { label: 'Saved at checkout', ...a }, false);
  },
};

// ---------- Email opt-outs (one list for customers and guests) ----------
const EMAIL_CATEGORIES = {
  product_news: 'New products and launches',
  restock: 'Back-in-stock alerts',
  review_requests: 'Requests to review what you bought',
  reminders: 'Routine reminders and diary nudges by email',
};
const DEFAULT_OFF = ['reminders']; // opt-in only
const optouts = {
  allowed(email, category) {
    const e = String(email).toLowerCase();
    const row = raw.prepare('SELECT 1 FROM email_optouts WHERE email = ? AND category = ?').get(e, category);
    if (DEFAULT_OFF.includes(category)) return !!raw.prepare("SELECT 1 FROM email_optouts WHERE email = ? AND category = ?").get(e, 'optin:' + category);
    return !row;
  },
  set(email, category, on) {
    const e = String(email).toLowerCase();
    if (DEFAULT_OFF.includes(category)) {
      if (on) raw.prepare('INSERT OR IGNORE INTO email_optouts (email, category, created_at) VALUES (?, ?, ?)').run(e, 'optin:' + category, now());
      else raw.prepare('DELETE FROM email_optouts WHERE email = ? AND category = ?').run(e, 'optin:' + category);
      return;
    }
    if (on) raw.prepare('DELETE FROM email_optouts WHERE email = ? AND category = ?').run(e, category);
    else raw.prepare('INSERT OR IGNORE INTO email_optouts (email, category, created_at) VALUES (?, ?, ?)').run(e, category, now());
  },
  prefs: (email) => Object.fromEntries(Object.keys(EMAIL_CATEGORIES).map((c) => [c, optouts.allowed(email, c)])),
};

// ---------- Preferences + profile photo ----------
const prefs = {
  get: (userId) => parse((raw.prepare('SELECT prefs_json FROM users WHERE id = ?').get(userId) || {}).prefs_json, {}),
  merge(userId, patch) {
    const next = { ...prefs.get(userId), ...patch };
    raw.prepare('UPDATE users SET prefs_json = ? WHERE id = ?').run(JSON.stringify(next), userId);
    return next;
  },
  usersWithReminders: () => raw.prepare("SELECT id, email, name, prefs_json FROM users WHERE prefs_json LIKE '%\"reminders\"%'").all()
    .map((u) => ({ ...u, prefs: parse(u.prefs_json, {}) })),
};
const avatars = {
  set: (userId, buf, type) => raw.prepare('UPDATE users SET avatar = ?, avatar_type = ? WHERE id = ?').run(buf, type, userId),
  clear: (userId) => raw.prepare('UPDATE users SET avatar = NULL, avatar_type = NULL WHERE id = ?').run(userId),
  get: (userId) => raw.prepare('SELECT avatar, avatar_type FROM users WHERE id = ?').get(userId),
};

// ---------- Reviews ----------
const reviews = {
  // Verified = the reviewer has an order (not cancelled) that contains this product.
  isVerified: (userId, productId) => !!raw.prepare(`SELECT 1 FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.user_id = ? AND i.product_id = ? AND o.status != 'cancelled' LIMIT 1`).get(userId, productId),
  upsert(userId, productId, r) {
    const t = now();
    raw.prepare(`INSERT INTO reviews (product_id, user_id, rating, title, body, status, verified, skin, dosha, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      ON CONFLICT(product_id, user_id) DO UPDATE SET rating = excluded.rating, title = excluded.title, body = excluded.body,
        status = 'pending', verified = excluded.verified, skin = excluded.skin, dosha = excluded.dosha, updated_at = excluded.updated_at, moderated_at = NULL`)
      .run(productId, userId, r.rating, r.title, r.body, r.verified ? 1 : 0, r.skin || null, r.dosha || null, t, t);
    return raw.prepare('SELECT * FROM reviews WHERE product_id = ? AND user_id = ?').get(productId, userId);
  },
  forProduct(productId, { dosha } = {}) {
    const rows = raw.prepare(`SELECT r.id, r.rating, r.title, r.body, r.verified, r.skin, r.dosha, r.created_at, u.name
      FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? AND r.status = 'approved'
      ${dosha ? 'AND r.dosha = ?' : ''} ORDER BY r.verified DESC, r.id DESC LIMIT 50`).all(...(dosha ? [productId, dosha] : [productId]));
    // Public name: first name + last initial only.
    return rows.map(({ name, ...r }) => {
      const parts = String(name || '').trim().split(/\s+/);
      return { ...r, verified: !!r.verified, author: parts[0] ? parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '') : 'Kanti customer' };
    });
  },
  summary(productId) {
    const r = raw.prepare(`SELECT count(*) n, avg(rating) avg FROM reviews WHERE product_id = ? AND status = 'approved'`).get(productId);
    const dist = Object.fromEntries([1, 2, 3, 4, 5].map((k) => [k, 0]));
    for (const d of raw.prepare(`SELECT rating, count(*) n FROM reviews WHERE product_id = ? AND status = 'approved' GROUP BY rating`).all(productId)) dist[d.rating] = d.n;
    const byDosha = Object.fromEntries(raw.prepare(`SELECT dosha, count(*) n FROM reviews WHERE product_id = ? AND status = 'approved' AND dosha IS NOT NULL GROUP BY dosha`).all(productId).map((d) => [d.dosha, d.n]));
    return { count: r.n, avg: r.n ? Math.round(r.avg * 10) / 10 : null, dist, byDosha };
  },
  allSummaries() {
    return Object.fromEntries(raw.prepare(`SELECT product_id, count(*) n, avg(rating) avg FROM reviews WHERE status = 'approved' GROUP BY product_id`).all()
      .map((r) => [r.product_id, { count: r.n, avg: Math.round(r.avg * 10) / 10 }]));
  },
  mine: (userId, productId) => raw.prepare('SELECT id, rating, title, body, status, verified FROM reviews WHERE user_id = ? AND product_id = ?').get(userId, productId) || null,
  adminList: (status) => raw.prepare(`SELECT r.*, u.name, u.email, p.name AS product_name FROM reviews r JOIN users u ON u.id = r.user_id
    JOIN products p ON p.id = r.product_id ${status ? 'WHERE r.status = ?' : ''} ORDER BY r.id DESC LIMIT 200`).all(...(status ? [status] : [])),
  moderate: (id, status) => raw.prepare('UPDATE reviews SET status = ?, moderated_at = ? WHERE id = ?').run(status, now(), id).changes,
  get: (id) => raw.prepare('SELECT * FROM reviews WHERE id = ?').get(id),
};

// ---------- Analytics ----------
const EVENT_NAMES = ['page_view', 'quiz_start', 'quiz_complete', 'results_view', 'add_to_cart', 'checkout_start', 'order_placed',
  'shop_search', 'beyond_search', 'product_view', 'guide_message'];
const events = {
  add(name, { anonId, userId, props } = {}) {
    raw.prepare('INSERT INTO events (name, anon_id, user_id, props_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, anonId || null, userId || null, props ? JSON.stringify(props).slice(0, 1000) : null, now());
  },
  purge: (days = 180) => raw.prepare('DELETE FROM events WHERE created_at < ?').run(new Date(Date.now() - days * 86400e3).toISOString()).changes,
  report(days) {
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const who = "coalesce(anon_id, 'u' || user_id)";
    const uniq = (name) => raw.prepare(`SELECT count(DISTINCT ${who}) n FROM events WHERE name = ? AND created_at >= ?`).get(name, since).n;
    const funnel = [
      ['quiz_start', 'Started the quiz'], ['quiz_complete', 'Finished the quiz'], ['results_view', 'Saw their routine'],
      ['add_to_cart', 'Added to bag'], ['checkout_start', 'Reached checkout'], ['order_placed', 'Placed an order'],
    ].map(([k, label]) => ({ key: k, label, visitors: uniq(k) }));
    const searches = raw.prepare(`SELECT lower(json_extract(props_json, '$.q')) q, count(*) n,
        round(avg(json_extract(props_json, '$.results')), 1) avg_results, sum(json_extract(props_json, '$.results') = 0) zero
      FROM events WHERE name = 'shop_search' AND created_at >= ? AND json_extract(props_json, '$.q') IS NOT NULL
      GROUP BY 1 ORDER BY n DESC LIMIT 15`).all(since);
    const unmet = raw.prepare(`SELECT lower(json_extract(props_json, '$.q')) q, count(*) n, max(json_extract(props_json, '$.off_topic')) off_topic,
        group_concat(DISTINCT json_extract(props_json, '$.top')) ideas
      FROM events WHERE name = 'beyond_search' AND created_at >= ? GROUP BY 1 ORDER BY n DESC LIMIT 15`).all(since);
    const views = raw.prepare(`SELECT json_extract(props_json, '$.view') view, count(*) n, count(DISTINCT ${who}) visitors
      FROM events WHERE name = 'page_view' AND created_at >= ? GROUP BY 1 ORDER BY n DESC LIMIT 12`).all(since);
    const products = raw.prepare(`SELECT json_extract(props_json, '$.id') id, count(*) n FROM events
      WHERE name = 'add_to_cart' AND created_at >= ? GROUP BY 1 ORDER BY n DESC LIMIT 8`).all(since)
      .map((r) => ({ ...r, name: (db.getProduct(r.id) || {}).name || r.id }));
    const visitors = raw.prepare(`SELECT count(DISTINCT ${who}) n FROM events WHERE created_at >= ?`).get(since).n;
    return { days, visitors, funnel, searches, unmet, views, products };
  },
};

// ---------- Popularity (real orders only) ----------
// Buyers per product in the last `days`, grouped by the buyer's latest quiz dosha.
function popularity(days = 7, minBuyers = Number(process.env.POPULAR_MIN_BUYERS || 2)) {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const rows = raw.prepare(`
    SELECT i.product_id id, q.dosha dosha, count(DISTINCT o.user_id) buyers
    FROM orders o JOIN order_items i ON i.order_id = o.id
    LEFT JOIN quiz_results q ON q.id = (SELECT id FROM quiz_results WHERE user_id = o.user_id ORDER BY id DESC LIMIT 1)
    WHERE o.status != 'cancelled' AND o.created_at >= ?
    GROUP BY i.product_id, q.dosha`).all(since);
  const out = {};
  for (const r of rows) {
    const p = out[r.id] || (out[r.id] = { total: 0, byDosha: {} });
    p.total += r.buyers;
    if (r.dosha) p.byDosha[r.dosha] = r.buyers;
  }
  for (const id of Object.keys(out)) {
    out[id].byDosha = Object.fromEntries(Object.entries(out[id].byDosha).filter(([, n]) => n >= minBuyers));
    if (out[id].total < minBuyers && !Object.keys(out[id].byDosha).length) delete out[id];
  }
  return out;
}

// ---------- Support tickets ----------
function newRef() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'KS-' + Array.from(crypto.randomBytes(6), (b) => a[b % a.length]).join('');
}
const tickets = {
  create({ userId, email, name, topic, subject, orderNo, body, accessHash }) {
    return raw.transaction(() => {
      const t = now();
      let info;
      for (let i = 0; ; i++) {
        try {
          info = raw.prepare(`INSERT INTO tickets (ref, user_id, email, name, topic, subject, order_no, access_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newRef(), userId || null, email, name, topic, subject, orderNo || null, accessHash || null, t, t);
          break;
        } catch (e) { if (i < 3 && /UNIQUE/.test(e.message)) continue; throw e; }
      }
      raw.prepare("INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, 'customer', ?, ?)").run(info.lastInsertRowid, body, t);
      return tickets.byId(info.lastInsertRowid);
    })();
  },
  byId: (id) => raw.prepare('SELECT * FROM tickets WHERE id = ?').get(id),
  byRef: (ref) => raw.prepare('SELECT * FROM tickets WHERE ref = ?').get(ref),
  byAccess: (hash) => raw.prepare('SELECT * FROM tickets WHERE access_hash = ?').get(hash),
  messages: (ticketId) => raw.prepare('SELECT author, body, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY id').all(ticketId),
  addMessage(ticketId, author, body) {
    const t = now();
    raw.prepare('INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(ticketId, author, body, t);
    // Staff reply → waiting on the customer; customer reply → open again.
    raw.prepare('UPDATE tickets SET updated_at = ?, status = ? WHERE id = ?').run(t, author === 'staff' ? 'waiting' : 'open', ticketId);
  },
  setStatus: (id, status) => raw.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id).changes,
  forUser: (userId) => raw.prepare(`SELECT t.*, (SELECT count(*) FROM ticket_messages m WHERE m.ticket_id = t.id) messages
    FROM tickets t WHERE user_id = ? ORDER BY updated_at DESC`).all(userId),
  adminList: (status) => raw.prepare(`SELECT t.*, (SELECT count(*) FROM ticket_messages m WHERE m.ticket_id = t.id) messages,
      (SELECT author FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY id DESC LIMIT 1) last_author
    FROM tickets t ${status ? 'WHERE status = ?' : ''} ORDER BY (status = 'open') DESC, updated_at DESC LIMIT 200`).all(...(status ? [status] : [])),
  counts: () => Object.fromEntries(raw.prepare('SELECT status, count(*) n FROM tickets GROUP BY status').all().map((r) => [r.status, r.n])),
};

function exportExtras(userId) {
  const u = db.getUserById(userId) || {};
  return {
    sessions: sessions.listActive(userId).map(({ id, ...s }) => s),
    notifications: notifications.list(userId, 1000),
    addresses: addresses.list(userId),
    preferences: prefs.get(userId),
    email_preferences: u.email ? optouts.prefs(u.email) : {},
    reviews: raw.prepare('SELECT product_id, rating, title, body, status, created_at FROM reviews WHERE user_id = ?').all(userId),
    support_tickets: tickets.forUser(userId).map((t) => ({ ref: t.ref, subject: t.subject, status: t.status, created_at: t.created_at, messages: tickets.messages(t.id) })),
  };
}

module.exports = {
  sessions, notifications, push, addresses, optouts, EMAIL_CATEGORIES, prefs, avatars, reviews, events, EVENT_NAMES,
  popularity, tickets, exportExtras,
};

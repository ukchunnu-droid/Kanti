require('dotenv').config();
// Production settings are checked before anything opens the database.
if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) {
  // Reset/verification links would point at localhost — refuse rather than send broken emails.
  console.error('APP_URL must be set in production (e.g. https://your-domain). Refusing to start.');
  process.exit(1);
}
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const db = require('./db');
const {
  hashPassword, verifyPassword, setSession, clearSession, requireAuth, optionalAuth, requireAdmin,
} = require('./auth');
const email = require('./email');
const backup = require('./backup');
const log = require('./log');
const { classifyQuiz } = require('./ai');
const reco = require('./recommend');
const { rateLimit } = require('./rate-limit');
const v = require('./validate');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// ---------- Error tracking (optional) ----------
// Set SENTRY_DSN and `npm install @sentry/node` to get crash reports with the request id.
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
    log.info('error tracking: Sentry enabled');
  } catch {
    log.warn('SENTRY_DSN is set but @sentry/node is not installed — run `npm install @sentry/node`');
  }
}

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // behind Render/Railway etc. → real client IPs
app.disable('x-powered-by');

// ---------- Request id + access log ----------
// Every response carries X-Request-Id; error messages include it so a user can quote it.
app.use((req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{6,64}$/.test(incoming) ? incoming : crypto.randomBytes(6).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  if (req.path.startsWith('/api/')) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const fields = { id: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) };
      if (req.userId) fields.user = req.userId;
      if (res.statusCode >= 500) log.error('request', fields);
      else if (req.path !== '/api/health') log.info('request', fields);
    });
  }
  next();
});

// ---------- Security headers ----------
// Scripts may only come from this site (no inline scripts or onclick handlers allowed).
// Inline style="" attributes are still used for small per-item colours, hence style 'unsafe-inline'.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "object-src 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

app.use(express.json({ limit: '50kb' }));

// Old standalone pages now live inside the storefront.
const MOVED = { '/signin.html': '/#signin', '/signup.html': '/#signup', '/account.html': '/#account', '/quiz.html': '/#quiz' };
app.get(Object.keys(MOVED), (req, res) => {
  const next = typeof req.query.next === 'string' && /^[a-z]+$/.test(req.query.next) ? req.query.next : null;
  res.redirect(301, MOVED[req.path] + (next ? `?next=${next}` : ''));
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// ---------- Rate limits ----------
const ip = (req) => req.ip || 'unknown';
const loginLimit = rateLimit({
  windowMs: 15 * 60e3, max: Number(process.env.RATE_LOGIN_MAX || 10),
  key: (req) => 'login:' + ip(req) + ':' + v.email((req.body || {}).email),
});
const signupLimit = rateLimit({
  windowMs: 60 * 60e3, max: Number(process.env.RATE_SIGNUP_MAX || 30), key: (req) => 'signup:' + ip(req),
});
const verifyLimit = rateLimit({
  windowMs: 60 * 60e3, max: Number(process.env.RATE_VERIFY_MAX || 5), key: (req) => 'verify:' + (req.userId || ip(req)),
});
const resetLimit = rateLimit({
  windowMs: 60 * 60e3, max: Number(process.env.RATE_RESET_MAX || 10), key: (req) => 'reset:' + ip(req),
});

// AI endpoints cost money per call, so they get their own per-IP limits.
const aiLimit = rateLimit({
  windowMs: 60 * 60e3, max: Number(process.env.RATE_AI_MAX || 60), key: (req) => 'ai:' + ip(req),
});
const guideLimit = rateLimit({
  windowMs: 60 * 60e3, max: Number(process.env.RATE_GUIDE_MAX || 40), key: (req) => 'guide:' + ip(req),
});
const alertLimit = rateLimit({
  windowMs: 60 * 60e3, max: Number(process.env.RATE_ALERT_MAX || 20), key: (req) => 'alert:' + ip(req),
});

// Wrap async handlers so thrown errors reach the JSON error handler.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const DUMMY_HASH = require('bcryptjs').hashSync('not-a-real-password', 10);

// What the storefront gets back for the signed-in user.
const mePayload = (userId) => ({ user: db.publicUser(db.getUserById(userId)), skin: db.latestQuiz(userId) });

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Emails a 48-hour link that confirms the account's email address.
function sendVerification(user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.createEmailVerification(user.id, sha256(token), new Date(Date.now() + 48 * 3600e3).toISOString());
  return email.queueVerification(user, `${APP_URL}/#verify=${token}`);
}

// ---------- Health (for uptime monitors) ----------
app.get('/api/health', (_req, res) => {
  try {
    db.raw.prepare('SELECT 1').get();
    res.json({ ok: true, time: new Date().toISOString(), uptime_s: Math.round(process.uptime()) });
  } catch (e) {
    log.error('health check failed', { error: e.message });
    res.status(503).json({ ok: false });
  }
});

// ---------- Auth ----------
app.post('/api/auth/signup', signupLimit, h(async (req, res) => {
  const { name, password } = req.body || {};
  const emailAddr = v.email(req.body && req.body.email);
  if (!emailAddr || !v.isEmail(emailAddr)) return bad(res, 'Please enter a valid email.');
  const pwErr = v.passwordError(password);
  if (pwErr) return bad(res, pwErr);
  const nameVal = v.text(name, 80);
  if (!nameVal) return bad(res, 'Please tell us your name.');
  if (db.getUserByEmail(emailAddr)) return bad(res, 'An account with that email already exists. Try signing in.', 409);

  const user = db.createUser(nameVal, emailAddr, await hashPassword(password));
  setSession(res, user);
  sendVerification(user).catch((e) => log.warn('verification email failed', { error: e.message }));
  res.status(201).json(mePayload(user.id));
}));

app.post('/api/auth/login', loginLimit, h(async (req, res) => {
  const emailAddr = v.email(req.body && req.body.email);
  const password = String((req.body || {}).password || '');
  const user = emailAddr ? db.getUserByEmail(emailAddr) : null;
  // Always run bcrypt so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return bad(res, 'Email or password is incorrect.', 401);
  setSession(res, user);
  res.json(mePayload(user.id));
}));

app.post('/api/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// Always answers the same way, so it can't be used to discover which emails have accounts.
app.post('/api/auth/forgot', resetLimit, h(async (req, res) => {
  const emailAddr = v.email(req.body && req.body.email);
  const user = emailAddr && v.isEmail(emailAddr) ? db.getUserByEmail(emailAddr) : null;
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.createPasswordReset(user.id, sha256(token), new Date(Date.now() + 3600e3).toISOString());
    email.queuePasswordReset(user, `${APP_URL}/#reset=${token}`)
      .catch((e) => log.warn('reset email failed', { error: e.message }));
  }
  res.json({ ok: true });
}));

// Email verification: the link can be opened in any browser, signed in or not.
app.post('/api/auth/verify', resetLimit, (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return bad(res, 'This confirmation link is invalid.');
  const userId = db.consumeEmailVerification(sha256(token));
  if (!userId) return bad(res, 'This confirmation link has expired or was already used. You can send a new one from your account page.');
  res.json({ ok: true });
});

app.post('/api/auth/verify/resend', requireAuth, verifyLimit, h(async (req, res) => {
  if (req.user.email_verified_at) return bad(res, 'Your email is already confirmed.');
  await sendVerification(req.user);
  res.json({ ok: true });
}));

app.post('/api/auth/reset', resetLimit, h(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return bad(res, 'This reset link is invalid.');
  const pwErr = v.passwordError(password);
  if (pwErr) return bad(res, pwErr);
  const userId = db.consumePasswordReset(sha256(token));
  if (!userId) return bad(res, 'This reset link has expired or was already used. Please request a new one.');
  db.setPassword(userId, await hashPassword(password)); // also signs out every other session
  setSession(res, db.getUserById(userId));
  res.json(mePayload(userId));
}));

// ---------- Profile ----------
app.get('/api/me', requireAuth, (req, res) => res.json(mePayload(req.userId)));

// Partial update: only the fields you send are changed.
function updateProfile(req, res) {
  const { fields, error } = v.profileFields(req.body || {});
  if (error) return bad(res, error);
  if ('name' in fields && !fields.name) return bad(res, 'Name can’t be empty.');
  db.updateProfile(req.userId, fields);
  res.json(mePayload(req.userId));
}
app.patch('/api/me', requireAuth, updateProfile);
app.put('/api/me', requireAuth, updateProfile);

app.post('/api/me/password', requireAuth, h(async (req, res) => {
  const { current, next } = req.body || {};
  if (!(await verifyPassword(String(current || ''), req.user.password_hash))) {
    return bad(res, 'Your current password is incorrect.', 403);
  }
  const pwErr = v.passwordError(next);
  if (pwErr) return bad(res, pwErr);
  db.setPassword(req.userId, await hashPassword(next)); // bumps token_version → other devices signed out
  setSession(res, db.getUserById(req.userId)); // …but keep this one signed in
  res.json({ ok: true });
}));

// "Download my data": everything stored about the signed-in user, as a JSON file.
app.get('/api/me/export', requireAuth, (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="kanti-my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/json').send(JSON.stringify(db.exportUser(req.userId), null, 2));
});

app.delete('/api/me', requireAuth, h(async (req, res) => {
  if (!(await verifyPassword(String((req.body || {}).password || ''), req.user.password_hash))) {
    return bad(res, 'Your password is incorrect.', 403);
  }
  db.deleteUser(req.userId); // cascades: orders, items, quiz history, bag, routine, resets
  clearSession(res);
  res.json({ ok: true });
}));

// ---------- Catalogue ----------
app.get('/api/products', (_req, res) => {
  res.json({ products: db.listProducts(), shipping: db.SHIPPING });
});

// ---------- Saved bag ----------
app.get('/api/cart', requireAuth, (req, res) => res.json({ items: db.getCart(req.userId) }));

app.put('/api/cart', requireAuth, (req, res) => {
  const { items, error } = v.cartItems((req.body || {}).items, db.getProduct);
  if (error) return bad(res, error);
  res.json({ items: db.replaceCart(req.userId, items) });
});

// Sign-in merge: the bag from before signing in + the saved bag (larger quantity wins per product).
app.post('/api/cart/merge', requireAuth, (req, res) => {
  const { items, error } = v.cartItems((req.body || {}).items, db.getProduct);
  if (error) return bad(res, error);
  const merged = new Map(db.getCart(req.userId).map((i) => [i.id, i.qty]));
  for (const i of items) merged.set(i.id, Math.max(merged.get(i.id) || 0, i.qty));
  res.json({ items: db.replaceCart(req.userId, [...merged].map(([id, qty]) => ({ id, qty }))) });
});

// ---------- Quiz ----------
app.post('/api/quiz/classify', optionalAuth, h(async (req, res) => {
  const result = await classifyQuiz((req.body || {}).answers);
  // Signed in → keep it in their quiz history.
  if (req.userId) result.saved = db.addQuizResult(req.userId, result);
  res.json(result);
}));

// Save a result the user got before signing in.
app.post('/api/quiz/results', requireAuth, (req, res) => {
  const { result, error } = v.quizResult(req.body || {});
  if (error) return bad(res, error);
  res.status(201).json({ saved: db.addQuizResult(req.userId, result) });
});

app.get('/api/quiz/history', requireAuth, (req, res) => res.json({ results: db.quizHistory(req.userId) }));

// ---------- Routine checklist / streak ----------
app.get('/api/routine', requireAuth, (req, res) => res.json({ routine: db.getRoutine(req.userId) }));
app.put('/api/routine', requireAuth, (req, res) => {
  const { routine, error } = v.routine(req.body || {});
  if (error) return bad(res, error);
  db.setRoutine(req.userId, routine);
  res.json({ routine });
});

// ---------- Recommendations (AI routine, Beyond Kanti, Ask Kanti) ----------
// Signed in → the previous quiz result is used to explain what changed since last time.
function previousQuiz(req) {
  if (!req.userId) return null;
  const h = db.quizHistory(req.userId, 2);
  return h[1] || null;
}
app.post('/api/recommend', optionalAuth, aiLimit, h(async (req, res) => {
  const r = await reco.recommend((req.body || {}).profile, { previous: previousQuiz(req) });
  if (r.error) return bad(res, r.error);
  res.json(r);
}));
app.post('/api/recommend/beyond', optionalAuth, aiLimit, h(async (req, res) => {
  const r = await reco.beyond((req.body || {}).profile);
  if (r.error) return bad(res, r.error);
  res.json(r);
}));
app.post('/api/search/beyond', optionalAuth, aiLimit, h(async (req, res) => {
  const body = req.body || {};
  const r = await reco.searchBeyond(body.q, body.profile);
  if (r.error) return bad(res, r.error);
  res.json(r);
}));
app.post('/api/guide', optionalAuth, guideLimit, h(async (req, res) => {
  const body = req.body || {};
  const r = await reco.guide(body.messages, body.profile);
  if (r.error) return bad(res, r.error);
  res.json(r);
}));

// ---------- Wishlist ----------
app.get('/api/wishlist', requireAuth, (req, res) => res.json({ items: db.getWishlist(req.userId) }));
app.put('/api/wishlist/:id', requireAuth, (req, res) => {
  const p = db.getProduct(String(req.params.id));
  if (!p || !p.active) return bad(res, 'Product not found.', 404);
  db.addWishlist(req.userId, p.id);
  res.json({ items: db.getWishlist(req.userId) });
});
app.delete('/api/wishlist/:id', requireAuth, (req, res) => {
  db.removeWishlist(req.userId, String(req.params.id));
  res.json({ items: db.getWishlist(req.userId) });
});
// Sign-in merge: hearts added while signed out are added to the account.
app.post('/api/wishlist/merge', requireAuth, (req, res) => {
  const ids = Array.isArray((req.body || {}).items) ? req.body.items.slice(0, 100) : [];
  for (const id of ids) { const p = typeof id === 'string' && db.getProduct(id); if (p && p.active) db.addWishlist(req.userId, p.id); }
  res.json({ items: db.getWishlist(req.userId) });
});

// ---------- Back-in-stock alerts ----------
app.post('/api/products/:id/notify', optionalAuth, alertLimit, (req, res) => {
  const p = db.getProduct(String(req.params.id));
  if (!p || !p.active) return bad(res, 'Product not found.', 404);
  if (p.stock !== 0) return bad(res, 'This product is in stock — you can order it now.', 409);
  const user = req.userId ? db.getUserById(req.userId) : null;
  const to = user ? user.email : v.email((req.body || {}).email);
  if (!to || !v.isEmail(to)) return bad(res, 'Please enter a valid email.');
  db.addStockAlert(to, user ? user.id : null, p.id);
  res.status(201).json({ ok: true, email: to });
});
// Called whenever stock goes up: emails everyone waiting if the product was sold out.
function notifyIfRestocked(before, after) {
  if (!before || !after || before.stock !== 0 || !(after.stock == null || after.stock > 0) || !after.active) return 0;
  const alerts = db.takeStockAlerts(after.id);
  for (const a of alerts) {
    email.queueBackInStock(a.email, after, `${APP_URL}/#shop`).catch((e) => log.warn('restock email failed', { error: e.message }));
  }
  if (alerts.length) log.info('back-in-stock alerts queued', { product: after.id, count: alerts.length });
  return alerts.length;
}

// ---------- Skin diary ----------
app.get('/api/diary', requireAuth, (req, res) => res.json({ entries: db.getDiary(req.userId), tags: v.DIARY_TAGS }));
app.put('/api/diary/:day', requireAuth, (req, res) => {
  const { entry, error } = v.diaryEntry({ ...(req.body || {}), day: req.params.day });
  if (error) return bad(res, error);
  db.setDiary(req.userId, entry);
  res.json({ entries: db.getDiary(req.userId) });
});
app.delete('/api/diary/:day', requireAuth, (req, res) => {
  db.deleteDiary(req.userId, String(req.params.day));
  res.json({ entries: db.getDiary(req.userId) });
});

// ---------- Orders ----------
app.post('/api/orders', requireAuth, h(async (req, res) => {
  const body = req.body || {};
  // Prices come from the catalogue, never from the browser.
  const { items, error } = v.cartItems(body.items, db.getProduct);
  if (error) return bad(res, error);
  if (!items.length) return bad(res, 'Your bag is empty.');
  const ship = v.shipTo(body.ship_to);
  if (ship.error) return bad(res, ship.error);

  const lines = items.map((i) => {
    const p = db.getProduct(i.id);
    return { id: p.id, name: p.name, price_cents: p.price_cents, qty: i.qty };
  });
  const subtotal_cents = lines.reduce((s, l) => s + l.price_cents * l.qty, 0);
  const shipping_cents = subtotal_cents > db.SHIPPING.free_over_cents ? 0 : db.SHIPPING.flat_cents;

  let order;
  try {
    order = db.createOrder({
      user_id: req.userId, lines, subtotal_cents, shipping_cents,
      total_cents: subtotal_cents + shipping_cents, ship_to: ship.value,
    });
  } catch (e) {
    if (e instanceof db.StockError) return bad(res, e.message, 409);
    throw e;
  }
  // Remember the address for next time unless the shopper opted out.
  if (body.save_details !== false) {
    const { name, phone, address, address2, city, state, zip, country } = ship.value;
    db.updateProfile(req.userId, { name, phone, address, address2, city, state, zip, country });
  }

  // Saved to the outbox first, so it's retried if sending fails; waits up to 8s for the preview link.
  const sent = await email.queueOrderConfirmation(order, req.user);
  order.email_preview_url = sent.previewUrl || null;
  res.status(201).json({ order, email: { previewUrl: sent.previewUrl || null, sent: !!sent.ok, queued: true } });
}));

app.get('/api/orders', requireAuth, (req, res) => res.json({ orders: db.getOrdersByUser(req.userId) }));

app.get('/api/orders/:no', requireAuth, (req, res) => {
  const order = db.getOrder(req.userId, String(req.params.no));
  if (!order) return bad(res, 'Order not found.', 404);
  res.json({ order });
});

// Customers can cancel their own order until it ships. Stock goes back on the shelf.
app.post('/api/orders/:no/cancel', requireAuth, (req, res) => {
  const mine = db.getOrder(req.userId, String(req.params.no));
  if (!mine) return bad(res, 'Order not found.', 404);
  if (mine.status !== 'placed') return bad(res, `This order is already ${mine.status} and can’t be cancelled.`, 409);
  const before = mine.items.map((i) => db.getProduct(i.id));
  const r = db.setOrderStatus(mine.order_no, 'cancelled');
  if (!r.error) before.forEach((b) => b && notifyIfRestocked(b, db.getProduct(b.id)));
  if (r.error) return bad(res, r.error, r.code);
  email.queueOrderStatus(r.order, req.user).catch(() => {});
  res.json({ order: r.order });
});

// ---------- Admin (ADMIN_EMAIL only) ----------
app.get('/api/admin/stats', requireAdmin, (_req, res) => res.json({ stats: { ...db.stats(), email_mode: email.emailMode(), ai_mode: process.env.GEMINI_API_KEY ? 'gemini' : 'rules' } }));

app.get('/api/admin/products', requireAdmin, (_req, res) => res.json({ products: db.listAllProducts() }));

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { value, error } = v.productInput(req.body || {});
  if (error) return bad(res, error);
  value.category = db.canonicalCategory(value.category);
  let id = v.slugify(value.name);
  for (let i = 2; db.productIdExists(id); i++) id = `${v.slugify(value.name).slice(0, 36)}-${i}`;
  const product = db.createProduct({ ...value, id });
  log.info('admin: product created', { id, by: req.userId });
  res.status(201).json({ product });
});

app.patch('/api/admin/products/:id', requireAdmin, (req, res) => {
  if (!db.productIdExists(req.params.id)) return bad(res, 'Product not found.', 404);
  const { value, error } = v.productInput(req.body || {}, { partial: true });
  if (error) return bad(res, error);
  if (value.category) value.category = db.canonicalCategory(value.category);
  const before = db.getProduct(req.params.id);
  const product = db.updateProduct(req.params.id, value);
  notifyIfRestocked(before, product);
  log.info('admin: product updated', { id: req.params.id, fields: Object.keys(value), by: req.userId });
  res.json({ product });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  if (!db.productIdExists(req.params.id)) return bad(res, 'Product not found.', 404);
  const r = db.deleteProduct(req.params.id);
  log.info(`admin: product ${r.archived ? 'archived' : 'deleted'}`, { id: req.params.id, by: req.userId });
  res.json(r);
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const status = Object.keys(db.ORDER_TRANSITIONS).includes(req.query.status) ? req.query.status : undefined;
  res.json({ orders: db.listAllOrders({ status }) });
});

app.patch('/api/admin/orders/:no', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const tracking = v.text((req.body || {}).tracking_no, 60) || null;
  if (!Object.keys(db.ORDER_TRANSITIONS).includes(status)) return bad(res, 'Unknown status.');
  const prior = status === 'cancelled' ? (db.getOrderByNo(String(req.params.no)) || { items: [] }).items.map((i) => db.getProduct(i.id)) : [];
  const r = db.setOrderStatus(String(req.params.no), status, tracking);
  if (r.error) return bad(res, r.error, r.code);
  prior.forEach((b) => b && notifyIfRestocked(b, db.getProduct(b.id)));
  const customer = db.getUserById(r.order.user_id);
  if (customer) email.queueOrderStatus(r.order, customer).catch(() => {});
  log.info('admin: order status changed', { order: r.order.order_no, status, by: req.userId });
  res.json({ order: r.order });
});

app.get('/api/admin/emails', requireAdmin, (_req, res) => res.json({ emails: db.recentEmails(30) }));
app.post('/api/admin/emails/retry', requireAdmin, h(async (_req, res) => {
  const n = db.retryFailedEmails();
  await email.processOutbox();
  res.json({ retried: n });
}));

app.post('/api/admin/ai-cache/clear', requireAdmin, (_req, res) => res.json({ cleared: db.clearAiCache() }));

app.post('/api/admin/backup', requireAdmin, h(async (_req, res) => {
  const { file, at } = await backup.backupNow('admin page');
  res.json({ file: path.basename(file), at });
}));

// ---------- Errors ----------
app.use('/api', (_req, res) => bad(res, 'Not found.', 404));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return bad(res, 'Request body must be valid JSON.');
  if (err.type === 'entity.too.large') return bad(res, 'Request is too large.', 413);
  log.error('unhandled error', { id: req.id, path: req.path, error: err.message, stack: err.stack });
  if (Sentry) Sentry.captureException(err, { tags: { request_id: req.id } });
  res.status(500).json({ error: `Something went wrong on our side. Please try again. (ref ${req.id})`, requestId: req.id });
});

process.on('unhandledRejection', (e) => {
  log.error('unhandled promise rejection', { error: e && e.message, stack: e && e.stack });
  if (Sentry) Sentry.captureException(e);
});

module.exports = app;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    log.info(`Kanti running → http://localhost:${PORT}`, {
      ai: process.env.GEMINI_API_KEY ? 'gemini' : 'rules',
      email: process.env.SMTP_HOST ? 'smtp' : 'ethereal (test inbox, not delivered)',
      admin: process.env.ADMIN_EMAIL ? 'configured' : 'none (set ADMIN_EMAIL)',
    });
  });
  email.startWorker();
  backup.scheduleBackups();
  const em = email.emailMode();
  if (!em.delivers) log.warn('EMAILS ARE NOT BEING DELIVERED — ' + em.problem);

  // Graceful shutdown: finish in-flight requests, then close the database cleanly.
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal} received — shutting down`);
    email.stopWorker();
    server.close(() => { db.raw.close(); log.info('stopped cleanly'); process.exit(0); });
    setTimeout(() => { log.warn('forced exit after 10s'); process.exit(1); }, 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const db = require('./db');
const {
  hashPassword, verifyPassword, setSession, clearSession, requireAuth, optionalAuth,
} = require('./auth');
const { sendOrderConfirmation, sendPasswordReset } = require('./email');
const { classifyQuiz } = require('./ai');
const { rateLimit } = require('./rate-limit');
const v = require('./validate');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // behind Render/Railway etc. → real client IPs
app.disable('x-powered-by');

// ---------- Security headers ----------
// The storefront uses inline scripts/handlers, hence 'unsafe-inline'; everything else is locked to self.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
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
const resetLimit = rateLimit({
  windowMs: 60 * 60e3, max: Number(process.env.RATE_RESET_MAX || 10), key: (req) => 'reset:' + ip(req),
});

// Wrap async handlers so thrown errors reach the JSON error handler.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, error, status = 400) => res.status(status).json({ error });
const DUMMY_HASH = require('bcryptjs').hashSync('not-a-real-password', 10);

// What the storefront gets back for the signed-in user.
const mePayload = (userId) => ({ user: db.publicUser(db.getUserById(userId)), skin: db.latestQuiz(userId) });

// ---------- Health ----------
app.get('/api/health', (_req, res) => {
  db.raw.prepare('SELECT 1').get();
  res.json({ ok: true, ai: process.env.GEMINI_API_KEY ? 'gemini' : 'rules', time: new Date().toISOString() });
});

// ---------- Auth ----------
app.post('/api/auth/signup', signupLimit, h(async (req, res) => {
  const { name, password } = req.body || {};
  const email = v.email(req.body && req.body.email);
  if (!email || !v.isEmail(email)) return bad(res, 'Please enter a valid email.');
  const pwErr = v.passwordError(password);
  if (pwErr) return bad(res, pwErr);
  const nameVal = v.text(name, 80);
  if (!nameVal) return bad(res, 'Please tell us your name.');
  if (db.getUserByEmail(email)) return bad(res, 'An account with that email already exists. Try signing in.', 409);

  const user = db.createUser(nameVal, email, await hashPassword(password));
  setSession(res, user);
  res.status(201).json(mePayload(user.id));
}));

app.post('/api/auth/login', loginLimit, h(async (req, res) => {
  const email = v.email(req.body && req.body.email);
  const password = String((req.body || {}).password || '');
  const user = email ? db.getUserByEmail(email) : null;
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
  const email = v.email(req.body && req.body.email);
  const user = email && v.isEmail(email) ? db.getUserByEmail(email) : null;
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    db.createPasswordReset(user.id, hash, new Date(Date.now() + 3600e3).toISOString());
    sendPasswordReset(user, `${APP_URL}/#reset=${token}`)
      .catch((e) => console.warn('[auth] reset email failed:', e.message));
  }
  res.json({ ok: true });
}));

app.post('/api/auth/reset', resetLimit, h(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return bad(res, 'This reset link is invalid.');
  const pwErr = v.passwordError(password);
  if (pwErr) return bad(res, pwErr);
  const userId = db.consumePasswordReset(crypto.createHash('sha256').update(token).digest('hex'));
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

// ---------- Orders ----------
// Sends the email in the background; waits up to 8s so the preview link can usually be shown right away.
function sendOrderEmail(order, user) {
  const sending = sendOrderConfirmation(order, user)
    .then((r) => { if (r.previewUrl) db.setOrderEmailPreview(order.order_no, r.previewUrl); return r; })
    .catch((e) => { console.warn('[orders] email failed:', e.message); return { previewUrl: null, failed: true }; });
  const timeout = new Promise((r) => setTimeout(() => r({ previewUrl: null, pending: true }), 8000).unref());
  return Promise.race([sending, timeout]);
}

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

  const order = db.createOrder({
    user_id: req.userId, lines, subtotal_cents, shipping_cents,
    total_cents: subtotal_cents + shipping_cents, ship_to: ship.value,
  });
  // Remember the address for next time unless the shopper opted out.
  if (body.save_details !== false) {
    const { name, phone, address, address2, city, state, zip, country } = ship.value;
    db.updateProfile(req.userId, { name, phone, address, address2, city, state, zip, country });
  }

  const email = await sendOrderEmail(order, req.user);
  order.email_preview_url = email.previewUrl || null;
  res.status(201).json({ order, email });
}));

app.get('/api/orders', requireAuth, (req, res) => res.json({ orders: db.getOrdersByUser(req.userId) }));

app.get('/api/orders/:no', requireAuth, (req, res) => {
  const order = db.getOrder(req.userId, String(req.params.no));
  if (!order) return bad(res, 'Order not found.', 404);
  res.json({ order });
});

// ---------- Errors ----------
app.use('/api', (_req, res) => bad(res, 'Not found.', 404));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return bad(res, 'Request body must be valid JSON.');
  if (err.type === 'entity.too.large') return bad(res, 'Request is too large.', 413);
  console.error(err);
  bad(res, 'Something went wrong on our side. Please try again.', 500);
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Kanti backend running → http://localhost:${PORT}`);
    console.log(`  AI mode: ${process.env.GEMINI_API_KEY ? 'Gemini (dynamic)' : 'rule-based fallback (no GEMINI_API_KEY set)'}`);
    console.log(`  Email:   ${process.env.SMTP_HOST ? 'real SMTP' : 'Ethereal preview inbox (dev)'}\n`);
  });
}

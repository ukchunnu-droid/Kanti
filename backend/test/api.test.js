// API tests — run with `npm test`. Uses a throwaway database and an offline email transport,
// so it never touches kanti.db or the network.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kanti-test-'));
Object.assign(process.env, {
  DB_FILE: path.join(tmp, 'test.db'),
  JWT_SECRET: 'test-secret-'.padEnd(64, 'x'),
  EMAIL_TRANSPORT: 'json',
  RATE_SIGNUP_MAX: '1000',
  RATE_LOGIN_MAX: '5',
  RATE_VERIFY_MAX: '100',
  RATE_RESET_MAX: '100',
  GEMINI_API_KEY: '',
  ADMIN_EMAIL: 'admin@kanti.test',
  BACKUP_DIR: path.join(tmp, 'backups'),
  BACKUP_KEEP: '2',
  LOG_LEVEL: 'silent',
});

const app = require('../src/server');
const { outbox, testHooks, processOutbox } = require('../src/email');
const db = require('../src/db');
let server, base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// Minimal cookie-keeping client, one per simulated browser.
function client() {
  const jar = new Map();
  return async function call(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair.split('=');
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) jar.delete(k); else jar.set(k, v);
    }
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data, headers: res.headers, jar };
  };
}

let n = 0;
async function newUser(extra = {}) {
  const c = client();
  const email = `user${Date.now()}${n++}@Example.com`;
  const r = await c('POST', '/api/auth/signup', { name: 'Asha Rao', email, password: 'longenough1', ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { c, email, user: r.data.user };
}
const SHIP = { name: 'Asha Rao', address: '1 Neem Lane', city: 'Savannah', state: 'GA', zip: '31401', country: 'USA', phone: '555-0100' };

// ---------- H3: auth & sessions ----------
test('signup sets an httpOnly session cookie and never returns secrets', async () => {
  const c = client();
  const r = await c('POST', '/api/auth/signup', { name: 'A', email: `Mixed${Date.now()}@Case.com`, password: 'longenough1' });
  assert.equal(r.status, 201);
  const cookies = r.headers.getSetCookie().join('\n');
  assert.match(cookies, /kanti_session=[^;]+;.*HttpOnly/);
  assert.match(cookies, /SameSite=Lax/);
  assert.equal(r.data.user.password_hash, undefined);
  assert.equal(r.data.user.token_version, undefined);
  assert.equal(r.data.user.email, r.data.user.email.toLowerCase(), 'email stored lower-case');
  assert.equal((await c('GET', '/api/me')).status, 200);
});

test('emails are case-insensitive for login and duplicates', async () => {
  const { email } = await newUser();
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: email.toUpperCase(), password: 'longenough1' })).status, 200);
  const dup = await client()('POST', '/api/auth/signup', { name: 'B', email: email.toLowerCase(), password: 'longenough1' });
  assert.equal(dup.status, 409);
});

test('signup validation: short password, bad email, missing name', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/signup', { name: 'A', email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await c('POST', '/api/auth/signup', { name: 'A', email: 'nope', password: 'longenough1' })).status, 400);
  assert.equal((await c('POST', '/api/auth/signup', { email: 'x@y.co', password: 'longenough1' })).status, 400);
});

test('login is rate limited per email', async () => {
  const { email } = await newUser();
  const c = client();
  let last;
  for (let i = 0; i < 6; i++) last = await c('POST', '/api/auth/login', { email, password: 'wrong-password' });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('logout clears the session', async () => {
  const { c } = await newUser();
  await c('POST', '/api/auth/logout');
  assert.equal((await c('GET', '/api/me')).status, 401);
});

test('Bearer tokens are rejected when forged', async () => {
  const r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  assert.equal(r.status, 401);
});

test('malformed JSON gets a JSON 400, unknown API routes a JSON 404', async () => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /valid JSON/);
  const r2 = await fetch(base + '/api/nope');
  assert.equal(r2.status, 404);
  assert.ok((await r2.json()).error);
});

test('security headers and health check', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'no open CORS');
});

// ---------- H3/H11: profile ----------
test('profile updates are partial and validated', async () => {
  const { c } = await newUser();
  await c('PATCH', '/api/me', { phone: '555-0101', city: 'Atlanta' });
  let me = (await c('PATCH', '/api/me', { zip: '30301' })).data.user;
  assert.equal(me.phone, '555-0101', 'phone kept when not sent');
  assert.equal(me.city, 'Atlanta');
  assert.equal(me.zip, '30301');
  assert.equal(me.name, 'Asha Rao');
  assert.equal((await c('PATCH', '/api/me', { name: 'x'.repeat(200) })).status, 400);
  assert.equal((await c('PATCH', '/api/me', { phone: '<script>' })).status, 400);
  assert.equal((await c('PATCH', '/api/me', { name: '' })).status, 400);
  me = (await c('PATCH', '/api/me', { address2: 'Apt 4', state: 'GA', country: 'USA' })).data.user;
  assert.deepEqual([me.address2, me.state, me.country], ['Apt 4', 'GA', 'USA']);
});

test('change password signs out other sessions but keeps this one', async () => {
  const { c, email } = await newUser();
  const other = client();
  await other('POST', '/api/auth/login', { email, password: 'longenough1' });
  assert.equal((await c('POST', '/api/me/password', { current: 'wrong', next: 'newpassword1' })).status, 403);
  assert.equal((await c('POST', '/api/me/password', { current: 'longenough1', next: 'newpassword1' })).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 200, 'this device stays signed in');
  assert.equal((await other('GET', '/api/me')).status, 401, 'other device signed out');
  assert.equal((await client()('POST', '/api/auth/login', { email, password: 'newpassword1' })).status, 200);
});

test('delete account requires the password and removes everything', async () => {
  const { c, email } = await newUser();
  await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: SHIP });
  assert.equal((await c('DELETE', '/api/me', { password: 'nope' })).status, 403);
  assert.equal((await c('DELETE', '/api/me', { password: 'longenough1' })).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email, password: 'longenough1' })).status, 401);
  assert.equal(db.raw.prepare('SELECT count(*) n FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)').get().n, 0);
});

// ---------- H5/H6/H7: catalogue & orders ----------
test('catalogue is served by the API with integer-cent prices', async () => {
  const r = await (await fetch(base + '/api/products')).json();
  assert.ok(r.products.length >= 13);
  const p1 = r.products.find((p) => p.id === 'p1');
  assert.equal(p1.price_cents, 1800);
  assert.equal(p1.price, 18);
  assert.ok(Array.isArray(p1.ings) && p1.sourcing);
  assert.deepEqual(r.shipping, { flat_cents: 500, free_over_cents: 5000 });
});

test('orders are priced by the server, not the browser', async () => {
  const { c } = await newUser();
  const r = await c('POST', '/api/orders', {
    items: [{ id: 'p1', qty: 2, price: 0.01, name: 'HACKED' }, { id: 'p3', qty: 1 }], ship_to: SHIP,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const o = r.data.order;
  assert.equal(o.subtotal_cents, 1800 * 2 + 1600);
  assert.equal(o.shipping_cents, 0, 'free over $50');
  assert.equal(o.total_cents, 5200);
  assert.equal(o.items[0].name, 'Neem & Tulsi Gel Cleanser');
  assert.match(o.order_no, /^KNT-[A-Z2-9]{8}$/);
  assert.equal(o.status, 'placed');
});

test('shipping is charged at or under $50 and float maths never leaks', async () => {
  const { c } = await newUser();
  const o = (await c('POST', '/api/orders', { items: [{ id: 'p3', qty: 1 }], ship_to: SHIP })).data.order;
  assert.equal(o.shipping_cents, 500);
  assert.equal(o.total, 21);
});

test('order validation: unknown product, bad qty, missing address, empty bag', async () => {
  const { c } = await newUser();
  assert.equal((await c('POST', '/api/orders', { items: [{ id: 'p999', qty: 1 }], ship_to: SHIP })).status, 400);
  assert.equal((await c('POST', '/api/orders', { items: [{ id: 'p1', qty: -2 }], ship_to: SHIP })).status, 400);
  assert.equal((await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1.5 }], ship_to: SHIP })).status, 400);
  assert.equal((await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: { name: 'A' } })).status, 400);
  assert.equal((await c('POST', '/api/orders', { items: [], ship_to: SHIP })).status, 400);
  assert.equal((await client()('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: SHIP })).status, 401);
});

test('order saves the address to the profile unless opted out', async () => {
  const { c } = await newUser();
  await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: { ...SHIP, address: '9 Saved St' } });
  assert.equal((await c('GET', '/api/me')).data.user.address, '9 Saved St');
  await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: { ...SHIP, address: 'Gift Address' }, save_details: false });
  assert.equal((await c('GET', '/api/me')).data.user.address, '9 Saved St');
});

test('order history, order detail, and isolation between users', async () => {
  const a = await newUser();
  const b = await newUser();
  const no = (await a.c('POST', '/api/orders', { items: [{ id: 'p2', qty: 3 }], ship_to: SHIP })).data.order.order_no;
  const list = (await a.c('GET', '/api/orders')).data.orders;
  assert.equal(list.length, 1);
  assert.equal(list[0].items[0].qty, 3);
  assert.equal((await a.c('GET', '/api/orders/' + no)).data.order.order_no, no);
  assert.equal((await b.c('GET', '/api/orders/' + no)).status, 404, "can't read someone else's order");
  assert.equal((await b.c('GET', '/api/orders')).data.orders.length, 0);
});

test('order confirmation email is sent with user data escaped', async () => {
  const { c } = await newUser({ name: '<img src=x onerror=alert(1)> Rao' });
  const before = outbox.length;
  await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: { ...SHIP, name: 'Asha', address: '<b>1</b> Lane' } });
  const mail = outbox.slice(before).find((m) => /confirmed/.test(m.subject));
  assert.ok(mail, 'email sent');
  assert.doesNotMatch(mail.html, /<img src=x/);
  assert.doesNotMatch(mail.html, /<b>1<\/b>/);
  assert.match(mail.html, /&lt;b&gt;1&lt;\/b&gt; Lane/);
  assert.match(mail.html, /\$18\.00/);
});

// ---------- H8: saved bag ----------
test('bag is saved to the account, merged on sign-in, and emptied by an order', async () => {
  const { c } = await newUser();
  assert.deepEqual((await c('PUT', '/api/cart', { items: [{ id: 'p1', qty: 2 }, { id: 'p4', qty: 1 }] })).data.items,
    [{ id: 'p1', qty: 2 }, { id: 'p4', qty: 1 }]);
  const merged = (await c('POST', '/api/cart/merge', { items: [{ id: 'p1', qty: 1 }, { id: 'p3', qty: 1 }] })).data.items;
  assert.deepEqual(merged.sort((x, y) => x.id.localeCompare(y.id)), [{ id: 'p1', qty: 2 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }]);
  assert.equal((await c('PUT', '/api/cart', { items: [{ id: 'nope', qty: 1 }] })).status, 400);
  await c('POST', '/api/orders', { items: merged, ship_to: SHIP });
  assert.deepEqual((await c('GET', '/api/cart')).data.items, []);
});

// ---------- H9: quiz history ----------
const ANSWERS = [
  { t: 'Shiny', skin: 'oily' }, { t: 'Large', skin: 'oily' }, { t: 'Flush', dosha: 'pitta' },
  { t: 'Warm', dosha: 'pitta' }, { t: 'Breakouts', concern: 'breakouts' }, { t: 'Yoga', culture: 'yoga' },
  { t: 'Chilli', spice: 'chilli', doshaHint: 'pitta' },
];

test('anonymous quiz is classified but not saved', async () => {
  const r = await client()('POST', '/api/quiz/classify', { answers: ANSWERS });
  assert.equal(r.data.skinType, 'oily');
  assert.equal(r.data.dosha, 'pitta');
  assert.equal(r.data.culture, 'yoga');
  assert.equal(r.data.spice, 'chilli');
  assert.equal(r.data.saved, undefined);
});

test('signed-in quiz goes into history; pre-sign-in results can be saved', async () => {
  const { c } = await newUser();
  const r = await c('POST', '/api/quiz/classify', { answers: ANSWERS });
  assert.ok(r.data.saved.id);
  const saved = await c('POST', '/api/quiz/results', { skinType: 'dry', dosha: 'vata', concern: 'dryness', lookFor: ['Almond'], source: 'rules' });
  assert.equal(saved.status, 201);
  assert.equal((await c('POST', '/api/quiz/results', { skinType: 'lizard', dosha: 'vata' })).status, 400);
  const hist = (await c('GET', '/api/quiz/history')).data.results;
  assert.equal(hist.length, 2);
  assert.equal(hist[0].skinType, 'dry', 'newest first');
  assert.deepEqual(hist[1].lookFor.length > 0, true);
  assert.equal((await c('GET', '/api/me')).data.skin.skinType, 'dry', 'me returns the latest result');
});

test('quiz answers are sanitised (huge or junk input does not break it)', async () => {
  const huge = Array.from({ length: 500 }, () => ({ t: 'x'.repeat(10000), skin: 'oily' }));
  assert.equal((await client()('POST', '/api/quiz/classify', { answers: huge })).status, 413, 'oversized body rejected');
  const junk = Array.from({ length: 200 }, () => ({ t: 'x'.repeat(150), skin: 'oily', evil: { a: 1 }, dosha: 42 }));
  const r = await client()('POST', '/api/quiz/classify', { answers: junk });
  assert.equal(r.status, 200);
  assert.equal(r.data.skinType, 'oily');
  assert.equal(r.data.dosha, 'vata', 'non-string dosha ignored → default');
  assert.equal((await client()('POST', '/api/quiz/classify', { answers: 'not a list' })).status, 200);
});

// ---------- H10: routine ----------
test('routine progress is stored per account and validated', async () => {
  const { c } = await newUser();
  assert.equal((await c('GET', '/api/routine')).data.routine, null);
  const body = { date: '2026-11-10', done: { 'AM:0': true, 'PM:1': true, 'evil': true }, streak: 3, lastComplete: '2026-11-09' };
  const saved = (await c('PUT', '/api/routine', body)).data.routine;
  assert.deepEqual(saved.done, { 'AM:0': true, 'PM:1': true });
  assert.equal((await c('GET', '/api/routine')).data.routine.streak, 3);
  assert.equal((await c('PUT', '/api/routine', { date: 'yesterday' })).status, 400);
});

// ---------- H14: password reset ----------
test('forgot/reset password: one-time link, signs in, old password stops working', async () => {
  const { email } = await newUser();
  const anon = client();
  const unknown = await anon('POST', '/api/auth/forgot', { email: 'nobody@nowhere.com' });
  assert.equal(unknown.status, 200, 'same answer for unknown emails');
  const before = outbox.length;
  assert.equal((await anon('POST', '/api/auth/forgot', { email })).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  const mail = outbox.slice(before).find((m) => m.to === email.toLowerCase() && /Reset/.test(m.subject));
  const token = mail.html.match(/#reset=([a-f0-9]{64})/)[1];

  assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
  const ok = await anon('POST', '/api/auth/reset', { token, password: 'brandnewpass1' });
  assert.equal(ok.status, 200);
  assert.equal((await anon('GET', '/api/me')).status, 200, 'signed in after reset');
  assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'another-pass1' })).status, 400, 'one-time');
  assert.equal((await client()('POST', '/api/auth/login', { email, password: 'longenough1' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email, password: 'brandnewpass1' })).status, 200);
});

// ---------- H12: old pages ----------
test('old standalone pages redirect into the storefront', async () => {
  const r = await fetch(base + '/signin.html?next=checkout', { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/#signin?next=checkout');
});


// =====================================================================
// Admin, stock, order lifecycle, email outbox, verification, privacy, backups
// =====================================================================
let adminC = null; // one signed-in admin session, reused (login is rate limited)
async function adminClient() {
  if (adminC) return adminC;
  const c = client();
  let r = await c('POST', '/api/auth/login', { email: 'admin@kanti.test', password: 'adminpass123' });
  if (r.status !== 200) r = await c('POST', '/api/auth/signup', { name: 'Store Admin', email: 'admin@kanti.test', password: 'adminpass123' });
  assert.equal(r.data.user.is_admin, true);
  adminC = c;
  return c;
}
const NEW_PRODUCT = {
  name: 'Tulsi Face Mist', price: '14.50', category: 'Mist', slot: 'Tone', tod: 'both',
  skin: ['oily', 'normal'], dosha: 'pitta, kapha', concern: ['breakouts', 'made-up'],
  ings: 'Tulsi, Rose water', benefit: 'A cooling refresh.', desc: 'Long text', sourcing: 'Kerala',
  safety: 'Alcohol-free', emoji: '🌱', bg: '#E7EFE9', stock: 3,
};

test('admin API is closed to customers and signed-out visitors', async () => {
  const { c } = await newUser();
  assert.equal((await c('GET', '/api/me')).data.user.is_admin, false);
  for (const [m, u] of [['GET', '/api/admin/products'], ['POST', '/api/admin/products'], ['GET', '/api/admin/orders'], ['GET', '/api/admin/stats']]) {
    assert.equal((await c(m, u, m === 'POST' ? NEW_PRODUCT : undefined)).status, 403, `${m} ${u} as customer`);
    assert.equal((await client()(m, u)).status, 401, `${m} ${u} signed out`);
  }
});

test('admin creates, edits, hides and shows a product; shop reflects it', async () => {
  const admin = await adminClient();
  const bad = await admin('POST', '/api/admin/products', { ...NEW_PRODUCT, skin: [] });
  assert.equal(bad.status, 400);
  assert.equal((await admin('POST', '/api/admin/products', { ...NEW_PRODUCT, price: -1 })).status, 400);
  const r = await admin('POST', '/api/admin/products', NEW_PRODUCT);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const p = r.data.product;
  assert.equal(p.id, 'tulsi-face-mist');
  assert.equal(p.price_cents, 1450);
  assert.deepEqual(p.dosha, ['pitta', 'kapha'], 'comma text → list');
  assert.deepEqual(p.concern, ['breakouts'], 'unknown concerns dropped');
  assert.deepEqual(p.ings, ['Tulsi', 'Rose water']);
  assert.equal(p.cat, 'Mist');
  const sameCat = (await admin('POST', '/api/admin/products', { ...NEW_PRODUCT, name: 'Case Test', category: 'face OIL' })).data.product;
  const existing = db.listProducts().find((x) => x.id === 'p10').cat;
  assert.equal(sameCat.cat, existing, 'category matched case-insensitively to the existing one');
  assert.equal((await admin('POST', '/api/admin/products', NEW_PRODUCT)).data.product.id, 'tulsi-face-mist-2', 'unique ids');

  let shop = (await (await fetch(base + '/api/products')).json()).products;
  assert.ok(shop.some((x) => x.id === p.id), 'new product in the shop');

  const edited = (await admin('PATCH', `/api/admin/products/${p.id}`, { price: 16, active: false })).data.product;
  assert.equal(edited.price_cents, 1600);
  assert.equal(edited.name, 'Tulsi Face Mist', 'partial edit keeps other fields');
  shop = (await (await fetch(base + '/api/products')).json()).products;
  assert.ok(!shop.some((x) => x.id === p.id), 'hidden products leave the shop');
  const all = (await admin('GET', '/api/admin/products')).data.products;
  assert.ok(all.find((x) => x.id === p.id && x.active === false), 'admin still sees hidden ones');

  // hidden products can't be ordered or bagged
  const { c } = await newUser();
  assert.equal((await c('POST', '/api/orders', { items: [{ id: p.id, qty: 1 }], ship_to: SHIP })).status, 400);
  await admin('PATCH', `/api/admin/products/${p.id}`, { active: true });
  assert.equal((await c('POST', '/api/orders', { items: [{ id: p.id, qty: 1 }], ship_to: SHIP })).status, 201);
});

test('deleting a product that was ordered archives it; an unused one is removed', async () => {
  const admin = await adminClient();
  const used = (await admin('POST', '/api/admin/products', { ...NEW_PRODUCT, name: 'Used Product' })).data.product;
  const unused = (await admin('POST', '/api/admin/products', { ...NEW_PRODUCT, name: 'Unused Product' })).data.product;
  const { c } = await newUser();
  const no = (await c('POST', '/api/orders', { items: [{ id: used.id, qty: 1 }], ship_to: SHIP })).data.order.order_no;
  assert.deepEqual((await admin('DELETE', `/api/admin/products/${used.id}`)).data, { archived: true });
  assert.deepEqual((await admin('DELETE', `/api/admin/products/${unused.id}`)).data, { deleted: true });
  assert.equal((await admin('DELETE', `/api/admin/products/${unused.id}`)).status, 404);
  assert.equal((await c('GET', '/api/orders/' + no)).data.order.items[0].name, 'Used Product', 'history intact');
});

test('stock: decremented by orders, never oversold, restored by cancelling', async () => {
  const admin = await adminClient();
  const p = (await admin('POST', '/api/admin/products', { ...NEW_PRODUCT, name: 'Limited Balm', stock: 2 })).data.product;
  const a = await newUser();
  const b = await newUser();
  const over = await a.c('POST', '/api/orders', { items: [{ id: p.id, qty: 3 }], ship_to: SHIP });
  assert.equal(over.status, 409);
  assert.match(over.data.error, /Only 2/);
  // two shoppers race for the last 2
  const [r1, r2] = await Promise.all([
    a.c('POST', '/api/orders', { items: [{ id: p.id, qty: 2 }], ship_to: SHIP }),
    b.c('POST', '/api/orders', { items: [{ id: p.id, qty: 2 }], ship_to: SHIP }),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [201, 409], 'exactly one wins');
  assert.equal(db.getProduct(p.id).stock, 0);
  const winner = r1.status === 201 ? a : b;
  const no = (r1.status === 201 ? r1 : r2).data.order.order_no;
  const sold = await (r1.status === 201 ? b : a).c('POST', '/api/orders', { items: [{ id: p.id, qty: 1 }], ship_to: SHIP });
  assert.match(sold.data.error, /sold out/);
  assert.equal((await winner.c('POST', `/api/orders/${no}/cancel`)).data.order.status, 'cancelled');
  assert.equal(db.getProduct(p.id).stock, 2, 'stock back on the shelf');
  assert.equal((await winner.c('POST', `/api/orders/${no}/cancel`)).status, 409, 'cancel once');
  // untracked stock (blank) is unlimited
  const u = (await admin('POST', '/api/admin/products', { ...NEW_PRODUCT, name: 'Untracked', stock: '' })).data.product;
  assert.equal(u.stock, null);
  assert.equal((await a.c('POST', '/api/orders', { items: [{ id: u.id, qty: 20 }], ship_to: SHIP })).status, 201);
});

test('order lifecycle: admin ships with tracking (emails customer), invalid moves rejected', async () => {
  const admin = await adminClient();
  const { c, email } = await newUser();
  const no = (await c('POST', '/api/orders', { items: [{ id: 'p3', qty: 1 }], ship_to: SHIP })).data.order.order_no;
  const list = (await admin('GET', '/api/admin/orders?status=placed')).data.orders;
  assert.ok(list.find((o) => o.order_no === no && o.customer.email === email.toLowerCase()));
  assert.equal((await admin('PATCH', `/api/admin/orders/${no}`, { status: 'delivered' })).status, 409, 'placed → delivered not allowed');
  const before = outbox.length;
  const shipped = (await admin('PATCH', `/api/admin/orders/${no}`, { status: 'shipped', tracking_no: 'TRK123' })).data.order;
  assert.equal(shipped.status, 'shipped');
  assert.equal(shipped.tracking_no, 'TRK123');
  await new Promise((r) => setTimeout(r, 50));
  const mail = outbox.slice(before).find((m) => /has shipped/.test(m.subject));
  assert.ok(mail && /TRK123/.test(mail.html), 'shipping email with tracking');
  assert.equal((await c('POST', `/api/orders/${no}/cancel`)).status, 409, "can't cancel after shipping");
  assert.equal((await admin('PATCH', `/api/admin/orders/${no}`, { status: 'delivered' })).data.order.status, 'delivered');
  assert.equal((await c('GET', '/api/orders/' + no)).data.order.status, 'delivered');
});

test('email outbox: a failed send is kept and retried, and the order still succeeds', async () => {
  const { c } = await newUser();
  testHooks.failNext = 1;
  const r = await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: SHIP });
  assert.equal(r.status, 201, 'order placed even though email failed');
  assert.equal(r.data.email.sent, false);
  const row = db.raw.prepare("SELECT * FROM email_outbox WHERE ref = ? AND kind = 'order'").get(r.data.order.order_no);
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 1);
  assert.ok(row.next_attempt_at > new Date().toISOString(), 'retry scheduled later');
  db.raw.prepare('UPDATE email_outbox SET next_attempt_at = ? WHERE id = ?').run(new Date(0).toISOString(), row.id);
  await processOutbox();
  const after = db.raw.prepare('SELECT status, attempts FROM email_outbox WHERE id = ?').get(row.id);
  assert.deepEqual(after, { status: 'sent', attempts: 2 });
});

test('email outbox: gives up after 6 attempts; admin can retry failed emails', async () => {
  const id = db.enqueueEmail({ to: 'x@example.com', subject: 'Hi', html: '<p>hi</p>', kind: 'test' });
  testHooks.failNext = 6;
  for (let i = 0; i < 6; i++) {
    db.raw.prepare('UPDATE email_outbox SET next_attempt_at = ? WHERE id = ?').run(new Date(0).toISOString(), id);
    await processOutbox();
  }
  assert.equal(db.raw.prepare('SELECT status FROM email_outbox WHERE id = ?').get(id).status, 'failed');
  const admin = await adminClient();
  assert.ok((await admin('GET', '/api/admin/stats')).data.stats.emails.failed >= 1);
  const r = await admin('POST', '/api/admin/emails/retry');
  assert.ok(r.data.retried >= 1);
  assert.equal(db.raw.prepare('SELECT status FROM email_outbox WHERE id = ?').get(id).status, 'sent');
});

test('email verification: signup sends a link; it confirms once; resend works', async () => {
  const before = outbox.length;
  const { c, email } = await newUser();
  assert.equal((await c('GET', '/api/me')).data.user.email_verified_at, null);
  await new Promise((r) => setTimeout(r, 50));
  const mail = outbox.slice(before).find((m) => m.to === email.toLowerCase() && /Confirm/.test(m.subject));
  const token = mail.html.match(/#verify=([a-f0-9]{64})/)[1];
  assert.equal((await client()('POST', '/api/auth/verify', { token: 'f'.repeat(64) })).status, 400);
  assert.equal((await client()('POST', '/api/auth/verify', { token })).status, 200, 'works from any browser');
  assert.equal((await client()('POST', '/api/auth/verify', { token })).status, 400, 'one-time');
  assert.ok((await c('GET', '/api/me')).data.user.email_verified_at);
  assert.equal((await c('POST', '/api/auth/verify/resend')).status, 400, 'already verified');
  const other = await newUser();
  assert.equal((await other.c('POST', '/api/auth/verify/resend')).status, 200);
});

test('download my data includes everything about the user and nothing secret', async () => {
  const { c } = await newUser();
  await c('POST', '/api/orders', { items: [{ id: 'p1', qty: 1 }], ship_to: SHIP });
  await c('POST', '/api/quiz/results', { skinType: 'dry', dosha: 'vata' });
  const res = await fetch(base + '/api/me/export', { headers: { Cookie: [...(await c('GET', '/api/me')).jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
  assert.match(res.headers.get('content-disposition'), /attachment; filename="kanti-my-data-/);
  const data = await res.json();
  assert.equal(data.orders.length, 1);
  assert.equal(data.quiz_history.length, 1);
  assert.equal(data.account.password_hash, undefined);
  assert.equal(JSON.stringify(data).includes('$2a$'), false, 'no bcrypt hash anywhere');
});

test('backups: consistent copy, rotation keeps the newest N, admin can trigger one', async () => {
  const { backupNow, listBackups } = require('../src/backup');
  for (let i = 0; i < 3; i++) await backupNow('test');
  assert.equal(listBackups().length, 2, 'BACKUP_KEEP=2');
  const Database = require('better-sqlite3');
  const copy = new Database(path.join(tmp, 'backups', listBackups().at(-1)), { readonly: true });
  assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
  assert.ok(copy.prepare('SELECT count(*) n FROM products').get().n >= 13);
  copy.close();
  const admin = await adminClient();
  const r = await admin('POST', '/api/admin/backup');
  assert.match(r.data.file, /^kanti-\d{8}-\d{6}/);
  assert.ok((await admin('GET', '/api/admin/stats')).data.stats.last_backup_at);
});

test('every response has a request id; server errors quote it', async () => {
  const r = await fetch(base + '/api/products');
  assert.match(r.headers.get('x-request-id'), /^[a-f0-9]{12}$/);
  const r2 = await fetch(base + '/api/health', { headers: { 'X-Request-Id': 'my-trace-123' } });
  assert.equal(r2.headers.get('x-request-id'), 'my-trace-123');
});

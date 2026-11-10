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
  GEMINI_API_KEY: '',
});

const app = require('../src/server');
const { outbox } = require('../src/email');
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
  const db = require('../src/db').raw;
  assert.equal(db.prepare('SELECT count(*) n FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)').get().n, 0);
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
  const mail = outbox.slice(before).find((m) => m.to === email.toLowerCase());
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

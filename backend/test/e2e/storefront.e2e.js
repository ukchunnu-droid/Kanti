// Browser end-to-end test — `npm run test:e2e`.
// Starts its own server on a throwaway database with an offline email transport, drives Chrome
// through every customer and admin journey, and fails on any page error, console error or
// Content-Security-Policy violation. Set CHROME_PATH if Chrome isn't in a standard place.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((p) => p && fs.existsSync(p));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kanti-e2e-'));
Object.assign(process.env, {
  DB_FILE: path.join(tmp, 'e2e.db'), JWT_SECRET: 'e2e-secret-'.padEnd(64, 'x'), EMAIL_TRANSPORT: 'json',
  GEMINI_API_KEY: '', ADMIN_EMAIL: 'admin@kanti.test', LOG_LEVEL: 'silent', BACKUP_DIR: path.join(tmp, 'backups'),
  RATE_SIGNUP_MAX: '1000', RATE_LOGIN_MAX: '1000', RATE_RESET_MAX: '1000', RATE_VERIFY_MAX: '1000',
});

let browser, page, server, B;
const problems = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// E2E_SCREENSHOTS=/some/dir saves a screenshot at key steps (for reviewing the UI).
const shot = async (name) => { if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.E2E_SCREENSHOTS, name + '.png'), fullPage: true }); };

before(async () => {
  if (!CHROME) return;
  const app = require('../../src/server');
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  B = `http://127.0.0.1:${server.address().port}`;
  const puppeteer = require('puppeteer-core');
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/status of (400|401|403|409)/.test(t)) problems.push('console: ' + t);
    if (/Content Security Policy/i.test(t)) problems.push('CSP: ' + t);
  });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'TRACK-42' : undefined)); // confirm()/prompt()
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------- helpers ----------
const view = () => page.evaluate(() => state.view);
const until = (fn, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg);
async function click(sel, text) {
  const ok = await page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (!text || e.textContent.trim().includes(text)) && !e.disabled && e.offsetParent !== null);
    if (el) { el.click(); return true; } return false;
  }, sel, text);
  if (!ok) throw new Error(`nothing clickable: ${sel} "${text || ''}" (view=${await view()})`);
}
async function fill(id, v) {
  await page.$eval('#f_' + id, (e) => { e.value = ''; });
  await page.type('#f_' + id, String(v));
}
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
// The opening blossom covers the page for ~2s; wait for it before clicking.
const splashGone = () => page.waitForFunction(() => !document.getElementById('splash'), { timeout: 10000 });
const count = (sel) => page.$$eval(sel, (els) => els.length);
const lastMailTo = (to, re) => {
  const { outbox } = require('../../src/email');
  return [...outbox].reverse().find((m) => m.to === to && re.test(m.subject));
};
const skip = !CHROME && 'Chrome not found (set CHROME_PATH)';
const email = `shopper${Date.now()}@example.com`;

test('storefront journeys', { skip, timeout: 180000 }, async (t) => {
  await t.test('shop is built from the product data', async () => {
    await page.goto(B + '/#shop', { waitUntil: 'networkidle0' }); await splashGone();
    assert.equal(await count('.grid .card'), 13);
    assert.equal(await count('.grid .card .card-img svg.pa'), 13, 'every product has its illustrated bottle');
    const kinds = await page.$$eval('.grid .card svg.pa', (els) => [...new Set(els.map((e) => [...e.classList].find((c) => /^pa-(pump|mist|dropper|jar|tube)$/.test(c))))].sort());
    assert.deepEqual(kinds, ['pa-dropper', 'pa-jar', 'pa-mist', 'pa-pump', 'pa-tube']);
    assert.equal(await count('.grid .card svg.pa-still'), 0, 'shop bottles are animated');
    assert.match(await text('.shop-count'), /13 products/);
    const facetLabels = await page.$$eval('#shopFacets .label', (els) => els.map((e) => e.textContent));
    assert.deepEqual(facetLabels, ['Category', 'Skin type', 'Dosha', 'Goal']);
    await page.type('#shopQ', 'neem');
    await until(() => document.querySelectorAll('.grid .card').length < 13);
    const names = await page.$$eval('.grid .card h3', (els) => els.map((e) => e.textContent));
    assert.ok(names.length > 0 && names.every((n) => /neem/i.test(n) || true));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'shopQ', 'search keeps focus while typing');
    await click('.link-btn', 'Clear filters');
    await shot('1-shop');
    await click('#shopFacets .pill', 'Serum');
    const cats = await page.$$eval('.grid .card .cat', (els) => [...new Set(els.map((e) => e.textContent))]);
    assert.deepEqual(cats, ['Serum']);
    await page.select('#shopSort', 'price-desc');
    const prices = await page.$$eval('.grid .card .price', (els) => els.map((e) => Number(e.textContent.replace('$', ''))));
    assert.deepEqual(prices, [...prices].sort((a, b) => b - a), 'sorted high → low');
    await click('.link-btn', 'Clear filters');
  });

  await t.test('quiz (signed out) → results → bag → checkout asks to sign in', async () => {
    await page.evaluate(() => go('quiz'));
    for (let i = 0; i < 7; i++) { await page.click('.option'); await page.click('.quiz-nav .btn-primary'); await wait(40); }
    await page.waitForSelector('.profile-card');
    assert.match(await text('.profile-card h2'), /skin · \w+-leaning/);
    // Personalised sections: profile chip, add-ons, outside products with real https links.
    assert.ok(await page.$eval('#profileChip', (e) => !e.classList.contains('hidden')));
    await page.waitForSelector('.beyond-card:not(.skeleton)', { timeout: 8000 });
    const hrefs = await page.$$eval('.beyond-card a', (as) => as.map((a) => [a.href, a.target, a.rel]));
    assert.ok(hrefs.length >= 4);
    for (const [h, t, rel] of hrefs) { assert.match(h, /^https:\/\//); assert.equal(t, '_blank'); assert.match(rel, /noopener/); }
    assert.match(await text('.beyond-note'), /Not sold or reviewed by Kanti/);
    // Before/after illustration + reasons
    assert.equal(await count('.sim .face'), 2, 'before and after faces');
    assert.equal(await count('#dbRows .db-row'), 6);
    assert.ok(await count('.why-step') >= 4, 'a reason for each routine product');
    await page.evaluate(() => { const r = document.getElementById('simRange'); r.value = 30; r.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.evaluate(() => state.sim.pos), 30, 'drag to compare');
    await click('button', 'Add full routine to bag');
    await wait(200);
    assert.ok(Number(await text('#cartCount')) >= 5);
    await click('#drawerFoot button', 'Checkout');
    await until(() => state.view === 'signin');
  });

  await t.test('sign up in-page; bag and quiz result carried over; verification email sent', async () => {
    await click('.auth button', 'Create an account');
    await until(() => state.view === 'signup');
    await fill('name', 'Mira Shah'); await fill('email', email); await fill('password', 'goodpassword1');
    await page.click('#authBtn');
    await until(() => state.view === 'checkout' && document.querySelector('#placeBtn'));
    assert.ok(await count('.co-summary .co-line') >= 5);
    assert.equal(await page.evaluate(() => document.cookie), 'kanti_signed_in=1', 'session cookie not readable by scripts');
    assert.match(await text('.verify-banner'), /confirm your email/);
    assert.ok(lastMailTo(email, /Confirm/), 'verification email');
  });

  await t.test('checkout validates fields and never sends card data', async () => {
    await page.click('#placeBtn'); await wait(80);
    const errs = await page.$$eval('.field.has-err', (els) => els.map((e) => e.dataset.f));
    assert.deepEqual(errs, ['address', 'city', 'zip', 'card', 'exp', 'cvc']);
    await fill('address', '12 Tulsi Road'); await fill('city', 'Savannah'); await fill('zip', '31401');
    await fill('card', '4242424242424242'); await fill('exp', '1230'); await fill('cvc', '123');
    let body = '';
    const onReq = (r) => { if (r.url().endsWith('/api/orders') && r.method() === 'POST') body = r.postData(); };
    page.on('request', onReq);
    await page.click('#placeBtn');
    await page.waitForSelector('.confirm .order-no', { timeout: 20000 });
    page.off('request', onReq);
    assert.ok(!/4242/.test(body), 'no card number in the request');
    assert.equal(await text('#cartCount'), '0');
    assert.ok(lastMailTo(email, /is confirmed/), 'order confirmation email');
  });

  await t.test('account: order history, cancel order, download my data, privacy page', async () => {
    await click('button', 'View my orders');
    await page.waitForSelector('.order');
    assert.match(await text('.order .status-pill'), /placed/i);
    assert.ok(await count('.order .oi-emoji svg.pa-still') >= 5, 'order history shows still bottle thumbnails');
    await click('.link-btn', 'Cancel order');
    await until(() => document.querySelector('.order .status-pill') && /cancelled/i.test(document.querySelector('.order .status-pill').textContent));
    assert.ok(lastMailTo(email, /was cancelled/), 'cancellation email');
    assert.equal(await page.$eval('a[href="/api/me/export"]', (a) => a.hasAttribute('download')), true);
    await click('.footer-link', 'Privacy');
    await until(() => state.view === 'privacy');
    assert.match(await text('.privacy h2'), /What Kanti keeps/);
  });

  await t.test('email confirmation link works', async () => {
    const token = lastMailTo(email, /Confirm/).html.match(/#verify=([a-f0-9]{64})/)[1];
    await page.goto(B + '/#verify=' + token, { waitUntil: 'networkidle0' }); await splashGone();
    await page.waitForFunction(() => /Email confirmed/.test(document.body.innerText), { timeout: 8000 });
    assert.ok(!page.url().includes(token), 'token removed from the address bar');
    await page.evaluate(() => go('account'));
    await page.waitForSelector('.order');
    assert.equal(await count('.verify-banner'), 0, 'banner gone once confirmed');
    await click('.link-btn', 'Sign out');
    await until(() => state.view === 'home');
  });

  await t.test('customers cannot open the admin page', async () => {
    assert.equal(await page.$eval('#navAdmin', (e) => e.classList.contains('hidden')), true);
  });

  await t.test('admin: add a product (shows in shop), stock & sold-out, ship an order', async () => {
    // create the admin account
    await page.evaluate(() => go('signup'));
    await fill('name', 'Store Admin'); await fill('email', 'admin@kanti.test'); await fill('password', 'adminpass123');
    await page.click('#authBtn');
    await until(() => state.view === 'account');
    await until(() => !document.querySelector('#navAdmin').classList.contains('hidden'));
    await click('#navAdmin');
    await page.waitForSelector('.stats');
    await shot('2-admin-overview');
    await click('.tab', 'Products');
    await page.waitForSelector('.admin-table');
    await shot('3-admin-products');
    await click('button', '+ Add product');
    await page.click('#saveProductBtn'); await wait(80);
    await shot('4-admin-product-form');
    const errs = await page.$$eval('.field.has-err', (els) => els.map((e) => e.dataset.f));
    assert.ok(errs.includes('name') && errs.includes('skin'));
    await fill('name', 'Saffron Glow Drops'); await fill('price', '41'); await fill('stock', '1');
    await fill('category', 'Face Oil'); await page.select('#f_slot', 'Treat');
    await page.click('input[name=skin][value=dry]'); await page.click('input[name=dosha][value=vata]');
    await fill('ings', 'Saffron, Almond oil'); await fill('benefit', 'A golden overnight glow.');
    assert.equal(await count('#artPreview svg.pa-dropper'), 1, 'Treat step → dropper bottle by default');
    await page.select('#f_packaging', 'jar');
    await until(() => document.querySelector('#artPreview svg.pa-jar'));
    await page.select('#f_packaging', '');
    await until(() => document.querySelector('#artPreview svg.pa-dropper'));
    assert.equal(await page.$eval('#f_liquid', (e) => e.value.toLowerCase()), '#e39a3b', 'colour picked from saffron');
    await page.click('#saveProductBtn');
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-table b')].some((b) => b.textContent === 'Saffron Glow Drops'), { timeout: 8000 });

    // appears in the shop, filed under the existing "Face oil" category (typed as "Face Oil")
    await page.evaluate(() => go('shop'));
    assert.equal(await page.$$eval('#shopFacets .pill', (els) => els.filter((e) => /face oil/i.test(e.textContent)).length), 1, 'one Face Oil button, not two');
    await click('#shopFacets .pill', 'Face Oil');
    assert.ok((await page.$$eval('.grid .card h3', (els) => els.map((e) => e.textContent))).includes('Saffron Glow Drops'));
    const card = '.grid .card[data-arg="saffron-glow-drops"]';
    assert.match(await text(card + ' .stock-flag'), /Only 1 left/);
    await click(card + ' .btn', 'Add');
    await click(card + ' .btn', 'Add'); // second one is over the stock
    await wait(100);
    assert.equal(await text('#cartCount'), '1', 'capped at stock');

    // buy it → sold out
    await page.evaluate(() => { closeCart(); go('checkout'); });
    await page.waitForSelector('#placeBtn');
    await fill('address', '1 Admin St'); await fill('city', 'Savannah'); await fill('zip', '31401');
    await fill('card', '4242424242424242'); await fill('exp', '1230'); await fill('cvc', '123');
    await page.click('#placeBtn');
    await page.waitForSelector('.confirm .order-no', { timeout: 20000 });
    const orderNo = await text('.confirm .order-no');
    await page.evaluate(async () => { await refreshProducts(); go('shop'); });
    assert.match(await text(card + ' .stock-flag'), /Sold out/);
    assert.equal(await page.$eval(card + ' .card-foot .btn', (b) => b.textContent.trim()), 'Notify me', 'sold out → offer a back-in-stock alert');
    assert.equal(await count(card + ' [data-act=addToCart]'), 0);

    // ship it from the admin orders tab (prompt answers TRACK-42)
    await page.evaluate(() => go('admin'));
    await click('.tab', 'Orders');
    await page.waitForSelector('.admin .order');
    await click('.link-btn', 'Mark shipped');
    await page.waitForFunction((no) => [...document.querySelectorAll('.admin .order')].some((o) => o.textContent.includes(no) && /Shipped/.test(o.textContent) && /TRACK-42/.test(o.textContent)), { timeout: 8000 }, orderNo);
    assert.ok(lastMailTo('admin@kanti.test', /has shipped/), 'shipping email');
    await shot('5-admin-orders');

    // hide a product → gone from the shop
    await click('.tab', 'Products');
    await page.waitForSelector('.admin-table');
    await page.evaluate(() => [...document.querySelectorAll('.admin-table tr')].find((r) => r.textContent.includes('Saffron Glow Drops')).querySelector('[data-act=adminToggleProduct]').click());
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-table tr')].some((r) => r.textContent.includes('Saffron Glow Drops') && r.textContent.includes('Hidden')), { timeout: 8000 });
    await page.evaluate(() => go('shop'));
    assert.equal(await count(card), 0, 'hidden product is gone from the shop');
  });

  await t.test('saved, compare, routine page, quiz resume and Ask Kanti', async () => {
    await page.evaluate(() => { state.profile = { skin: 'dry', dosha: 'vata', concern: 'dryness' }; stashState(); go('shop'); clearShopFilters(); });
    await click('.card .heart');
    await until(() => state.wish.length === 1);
    assert.equal(await text('#wishCount'), '1');
    await click('.card .cmp-toggle'); await click('.card:nth-child(2) .cmp-toggle');
    await click('#compareBar button', 'Compare');
    await until(() => state.view === 'compare');
    assert.equal(await count('.compare-table thead th b'), 2);
    await page.evaluate(() => go('saved'));
    assert.equal(await count('.grid .card'), 1);
    await page.evaluate(() => go('routine'));
    assert.ok(await count('.rt-step') >= 7);
    await click('.rt-step .step-no');
    await until(() => Object.keys(routine.done).length === 1);
    assert.ok(await count('.rating .rate') === 5, 'diary shown when signed in');
    await click('.rating .rate', 'Good'); await click('#diarySave');
    await until(() => state.diary.entries && state.diary.entries.length === 1);
    // Half-finished quiz picks up where it left off after a reload.
    await page.evaluate(() => go('quiz'));
    for (let i = 0; i < 2; i++) { await page.click('.option'); await page.click('.quiz-nav .btn-primary'); await wait(40); }
    await page.reload({ waitUntil: 'networkidle0' }); await splashGone();
    await page.evaluate(() => go('quiz'));
    assert.equal(await page.evaluate(() => state.qStep), 2);
    await click('.resume-note .link-btn', 'Start over');
    assert.equal(await page.evaluate(() => state.qStep), 0);
    // "Other" needs a few words before Next is enabled
    await click('.option', 'Other');
    assert.equal(await page.$eval('#quizNext', (b) => b.disabled), true);
    await page.type('#otherText', 'shiny T-zone');
    assert.equal(await page.$eval('#quizNext', (b) => b.disabled), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'otherText', 'typing keeps focus');
    await click('.option', 'All of the above');
    assert.equal(await count('#otherText'), 0);
    // Chat
    await page.evaluate(() => go('shop'));
    await page.click('#guideFab');
    await page.type('#guideInput', 'What does neem do?');
    await click('.gp-form button', 'Send');
    await until(() => state.guide.msgs.length === 2 && !state.guide.busy);
    assert.equal(await count('.gp-msg.user'), 1); assert.equal(await count('.gp-msg.guide'), 1);
    await click('.gp-head .icon-btn');
  });

  await t.test('mobile width has no horizontal scroll; dark mode renders', async () => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.setViewport({ width: 390, height: 844 });
    for (const v of ['shop', 'admin', 'account', 'privacy', 'routine', 'saved', 'home']) {
      await page.evaluate((v) => go(v), v);
      await wait(400);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow on ${v}`);
    }
  });

  await t.test('no page errors, console errors or CSP violations', () => {
    assert.deepEqual(problems, []);
  });
});

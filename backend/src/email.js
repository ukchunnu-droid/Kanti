// Email via Nodemailer, sent through a database outbox so nothing is lost.
// - Every email is first saved to the email_outbox table, then sent. If sending fails
//   (SMTP down, Gmail limit hit…) it is retried with back-off: 1m, 5m, 30m, 2h, 12h, then
//   marked failed (retryable from the admin page).
// - If SMTP_* env vars are set, real email is sent through that server. Otherwise a free
//   Ethereal test inbox is used: each email gets a preview link but is never delivered.
const nodemailer = require('nodemailer');
const db = require('./db');
const log = require('./log');

let transportPromise = null;
const outbox = []; // filled only when EMAIL_TRANSPORT=json (tests)
const testHooks = { failNext: 0 }; // tests: make the next N sends fail

async function getTransport() {
  if (transportPromise) return transportPromise;

  transportPromise = (async () => {
    // Tests: build the message but don't send it anywhere.
    if (process.env.EMAIL_TRANSPORT === 'json') return nodemailer.createTransport({ jsonTransport: true });
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
    // Dev fallback: a throwaway test inbox with preview links.
    const test = await nodemailer.createTestAccount();
    log.info('email: no SMTP configured — using the Ethereal test inbox (nothing is really delivered)');
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: test.user, pass: test.pass },
    });
  })();
  transportPromise.catch(() => { transportPromise = null; }); // don't cache a failed connection forever
  return transportPromise;
}

function currency(cents) {
  return '$' + (Number(cents) / 100).toFixed(2);
}
// Everything user-supplied (name, address, item names) is escaped before going into the HTML.
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shell(inner) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #E3DFD3;border-radius:14px;overflow:hidden">
    <div style="background:#20453B;color:#F4F1E8;padding:20px 24px">
      <div style="font-size:22px;font-weight:700">Kan<span style="color:#C9972F">ti</span></div>
      <div style="font-size:13px;color:#C9D6CC">Skincare that fits your nature</div>
    </div>
    <div style="padding:22px 24px;color:#1C241F">${inner}</div>
  </div>`;
}

function orderEmailHtml(order, user) {
  const s = order.ship_to || {};
  const rows = order.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0;color:#1C241F">${esc(it.name)} ×${Number(it.qty)}</td>
             <td style="padding:6px 0;text-align:right;color:#6B746C">${currency(it.price_cents * it.qty)}</td></tr>`
    )
    .join('');
  const addr = [s.address, s.address2, [s.city, s.state].filter(Boolean).join(', '), s.zip, s.country]
    .filter(Boolean).map(esc).join(', ');
  return shell(`
      <h2 style="margin:0 0 6px;font-size:20px">Order confirmed 🌿</h2>
      <p style="color:#6B746C;margin:0 0 16px">Hi ${esc((user.name || '').split(' ')[0] || 'there')}, thanks for your order
         <b>${esc(order.order_no)}</b>. Here's what's on its way:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows}
        <tr><td style="padding:6px 0;color:#6B746C">Shipping</td>
            <td style="padding:6px 0;text-align:right;color:#6B746C">${order.shipping_cents === 0 ? 'Free' : currency(order.shipping_cents)}</td></tr>
        <tr><td style="padding:10px 0 0;border-top:1px solid #E3DFD3;font-weight:700">Total</td>
            <td style="padding:10px 0 0;border-top:1px solid #E3DFD3;text-align:right;font-weight:700">${currency(order.total_cents)}</td></tr>
      </table>
      ${addr ? `<p style="color:#6B746C;font-size:13px;margin-top:16px">Shipping to: ${addr}</p>` : ''}
      <p style="color:#6B746C;font-size:13px;margin-top:18px">We'll send another note when it ships. With care,<br>Team Kanti</p>`);
}

function orderStatusHtml(order, user) {
  const first = esc((user.name || '').split(' ')[0] || 'there');
  const body = {
    shipped: `<h2 style="margin:0 0 6px;font-size:20px">Your order is on its way 📦</h2>
      <p style="color:#6B746C">Hi ${first}, order <b>${esc(order.order_no)}</b> has shipped.</p>
      ${order.tracking_no ? `<p style="color:#6B746C">Tracking number: <b>${esc(order.tracking_no)}</b></p>` : ''}`,
    delivered: `<h2 style="margin:0 0 6px;font-size:20px">Delivered 🌿</h2>
      <p style="color:#6B746C">Hi ${first}, order <b>${esc(order.order_no)}</b> has been delivered. Enjoy your routine — and tick it off each day to grow your streak.</p>`,
    cancelled: `<h2 style="margin:0 0 6px;font-size:20px">Order cancelled</h2>
      <p style="color:#6B746C">Hi ${first}, order <b>${esc(order.order_no)}</b> (${currency(order.total_cents)}) has been cancelled. No payment was taken.</p>`,
  }[order.status];
  return body ? shell(body + `<p style="color:#6B746C;font-size:13px;margin-top:18px">With care,<br>Team Kanti</p>`) : null;
}

function verifyEmailHtml(user, link) {
  return shell(`
      <h2 style="margin:0 0 6px;font-size:20px">Confirm your email</h2>
      <p style="color:#6B746C">Hi ${esc((user.name || '').split(' ')[0] || 'there')}, welcome to Kanti! Please confirm this is your
         email so we can send your order updates here. The link works for 48 hours.</p>
      <p style="margin:20px 0"><a href="${esc(link)}" style="background:#20453B;color:#FBF8EF;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Confirm my email</a></p>
      <p style="color:#6B746C;font-size:13px">Didn't sign up? You can ignore this email.</p>`);
}

function passwordResetHtml(user, link) {
  return shell(`
      <h2 style="margin:0 0 6px;font-size:20px">Reset your password</h2>
      <p style="color:#6B746C">Hi ${esc((user.name || '').split(' ')[0] || 'there')}, someone (hopefully you) asked to reset
         the password for your Kanti account. This link works once and expires in 1 hour.</p>
      <p style="margin:20px 0"><a href="${esc(link)}" style="background:#20453B;color:#FBF8EF;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Choose a new password</a></p>
      <p style="color:#6B746C;font-size:13px">Didn't ask for this? You can ignore this email — your password won't change.</p>`);
}

function backInStockInner(product, link) {
  return `
      <h2 style="margin:0 0 6px;font-size:20px">${esc(product.name)} is back 🌿</h2>
      <p style="color:#6B746C">You asked us to tell you when this was back in stock — it is, but stock is limited.</p>
      <p style="margin:20px 0"><a href="${esc(link)}" style="background:#20453B;color:#FBF8EF;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">See it in the shop</a></p>
      <p style="color:#6B746C;font-size:13px">This was a one-time alert for this product.</p>`;
}

// ---------- Marketing emails: opt-outs + unsubscribe ----------
// Every non-essential email checks the recipient's preferences first and carries a one-click
// unsubscribe link (footer + List-Unsubscribe header), as US marketing-email law (CAN-SPAM) requires.
const crypto = require('crypto');
const APP_URL = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
function unsubToken(email, category) {
  const secret = require('./auth').SECRET;
  return crypto.createHmac('sha256', secret).update(String(email).toLowerCase() + '|' + category).digest('base64url').slice(0, 32);
}
function unsubscribeUrl(email, category) {
  return `${APP_URL()}/api/email/unsubscribe?e=${encodeURIComponent(Buffer.from(String(email).toLowerCase()).toString('base64url'))}&c=${encodeURIComponent(category)}&t=${unsubToken(email, category)}`;
}
function checkUnsubscribe(e, c, t) {
  let email;
  try { email = Buffer.from(String(e || ''), 'base64url').toString('utf8'); } catch { return null; }
  if (!email.includes('@') || !t) return null;
  const want = unsubToken(email, c);
  const ok = want.length === String(t).length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(String(t)));
  return ok ? email : null;
}
function marketing(to, category, subject, inner, kind, ref) {
  const store = require('./store');
  if (!store.optouts.allowed(to, category)) return Promise.resolve({ queued: false, optedOut: true });
  const url = unsubscribeUrl(to, category);
  const label = store.EMAIL_CATEGORIES[category] || category;
  const html = shell(inner + `
      <p style="color:#9AA39B;font-size:12px;margin-top:26px;border-top:1px solid #E3DFD3;padding-top:12px">
        You’re receiving this because “${esc(label)}” is on in your Kanti email preferences.
        <a href="${esc(url)}" style="color:#6B746C">Unsubscribe</a> ·
        <a href="${esc(APP_URL())}/#account" style="color:#6B746C">Email preferences</a></p>`);
  return queue({ to, subject, html, kind, ref, headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
}
const btn = (href, text) => `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#20453B;color:#FBF8EF;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${esc(text)}</a></p>`;

// ---------- Outbox ----------
const BACKOFF_MIN = [1, 5, 30, 120, 720]; // after attempt 1..5; attempt 6 failing = give up

async function deliver(row) {
  try {
    if (testHooks.failNext > 0) { testHooks.failNext--; throw new Error('simulated failure (test)'); }
    const transport = await getTransport();
    const info = await transport.sendMail({
      from: process.env.MAIL_FROM || 'Kanti <orders@kanti.example>', to: row.to_addr, subject: row.subject, html: row.html,
      headers: row.headers_json ? JSON.parse(row.headers_json) : undefined,
    });
    const preview = nodemailer.getTestMessageUrl(info) || null; // only on Ethereal
    if (process.env.EMAIL_TRANSPORT === 'json') outbox.push({ to: row.to_addr, subject: row.subject, html: row.html, headers: row.headers_json ? JSON.parse(row.headers_json) : {} });
    db.markEmailSent(row.id, preview);
    if (row.kind === 'order' && row.ref && preview) db.setOrderEmailPreview(row.ref, preview);
    log.info('email sent', { id: row.id, kind: row.kind, ref: row.ref, ...(preview ? { preview } : {}) });
    return { ok: true, previewUrl: preview };
  } catch (e) {
    const attempt = row.attempts + 1;
    const delay = BACKOFF_MIN[attempt - 1];
    const next = delay ? new Date(Date.now() + delay * 60e3).toISOString() : null;
    db.markEmailFailed(row.id, e.message, next);
    log.warn('email failed', { id: row.id, kind: row.kind, attempt, retry_at: next || 'gave up', error: e.message });
    return { ok: false, error: e.message };
  }
}

let processing = false;
async function processOutbox() {
  if (processing) return 0;
  processing = true;
  let n = 0;
  try {
    for (const row of db.claimDueEmails(20)) { await deliver(row); n++; }
  } finally { processing = false; }
  return n;
}

let workerTimer = null;
function startWorker(intervalMs = 30000) {
  const stuck = db.requeueStuckEmails();
  if (stuck) log.warn('email: re-queued emails interrupted by a restart', { count: stuck });
  processOutbox().catch((e) => log.error('email worker', { error: e.message }));
  workerTimer = setInterval(() => processOutbox().catch((e) => log.error('email worker', { error: e.message })), intervalMs);
  workerTimer.unref();
}
function stopWorker() { if (workerTimer) clearInterval(workerTimer); }

// Saves the email, then tries to send it right away. Resolves within `waitMs` either way —
// if it isn't sent by then (or fails), the worker keeps retrying in the background.
function queue({ to, subject, html, kind, ref, headers }, waitMs = 0) {
  const id = db.enqueueEmail({ to, subject, html, kind, ref, headers });
  const row = db.claimEmail(id);
  const sending = row ? deliver(row) : Promise.resolve({ ok: false });
  if (!waitMs) { sending.catch(() => {}); return Promise.resolve({ queued: true }); }
  const timeout = new Promise((r) => setTimeout(() => r({ queued: true, pending: true }), waitMs).unref());
  return Promise.race([sending, timeout]).then((r) => ({ queued: true, ...r }));
}

// How email is being delivered right now — shown on the admin page and at startup.
function emailMode() {
  if (process.env.EMAIL_TRANSPORT === 'json') return { mode: 'test', delivers: false };
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return { mode: 'smtp', delivers: true, host: process.env.SMTP_HOST };
  return {
    mode: 'ethereal', delivers: false,
    problem: process.env.SMTP_USER || process.env.SMTP_PASS
      ? 'SMTP_USER/SMTP_PASS are set but SMTP_HOST is empty, so emails only go to the Ethereal test inbox and are never delivered. Set SMTP_HOST (e.g. smtp.gmail.com) in .env and restart.'
      : 'No SMTP settings in .env, so emails only go to the Ethereal test inbox and are never delivered.',
  };
}

module.exports = {
  emailMode,
  // Order confirmation waits up to 8s so the confirmation page can usually link the sent email.
  queueOrderConfirmation: (order, user) => queue({
    to: user.email, subject: `Your Kanti order ${order.order_no} is confirmed 🌿`,
    html: orderEmailHtml(order, user), kind: 'order', ref: order.order_no,
  }, 8000),
  queueOrderStatus(order, user) {
    const html = orderStatusHtml(order, user);
    if (!html) return Promise.resolve({ queued: false });
    const subject = { shipped: `Your Kanti order ${order.order_no} has shipped 📦`,
      delivered: `Your Kanti order ${order.order_no} was delivered 🌿`,
      cancelled: `Your Kanti order ${order.order_no} was cancelled` }[order.status];
    return queue({ to: user.email, subject, html, kind: 'order-' + order.status, ref: order.order_no });
  },
  queuePasswordReset: (user, link) => queue({
    to: user.email, subject: 'Reset your Kanti password', html: passwordResetHtml(user, link), kind: 'reset',
  }),
  queueVerification: (user, link) => queue({
    to: user.email, subject: 'Confirm your Kanti email', html: verifyEmailHtml(user, link), kind: 'verify',
  }),
  queueBackInStock: (to, product, link) => marketing(to, 'restock', `${product.name} is back in stock`, backInStockInner(product, link), 'restock', product.id),
  queueProductNews: (to, name, product) => marketing(to, 'product_news', `New at Kanti: ${product.name} 🌿`, `
      <h2 style="margin:0 0 6px;font-size:20px">New: ${esc(product.name)}</h2>
      <p style="color:#6B746C">Hi ${esc((name || '').split(' ')[0] || 'there')}, ${esc(product.benefit || 'something new just arrived in the shop.')}</p>
      <p style="color:#6B746C">Key ingredients: ${esc((product.ings || []).join(', '))}.</p>${btn(APP_URL() + '/#shop', 'See it in the shop')}`, 'product_news', product.id),
  queueReviewRequest: (to, name, items) => marketing(to, 'review_requests', 'How is your Kanti order working for you?', `
      <h2 style="margin:0 0 6px;font-size:20px">How’s it going?</h2>
      <p style="color:#6B746C">Hi ${esc((name || '').split(' ')[0] || 'there')}, your order arrived. When you’ve used it for a little while,
        a quick review of ${items.map((i) => `<b>${esc(i.name)}</b>`).join(', ')} helps others with skin like yours.</p>${btn(APP_URL() + '/#account', 'Write a review')}`, 'review', null),
  queueReminder: (to, name, title, body) => marketing(to, 'reminders', title, `
      <h2 style="margin:0 0 6px;font-size:20px">${esc(title)}</h2><p style="color:#6B746C">${esc(body)}</p>${btn(APP_URL() + '/#routine', 'Open my routine')}`, 'reminder', null),
  // Support tickets are service emails (always sent).
  queueTicketEmail: (to, name, ticket, text, link) => queue({
    to, subject: `[${ticket.ref}] ${ticket.subject}`, kind: 'support', ref: ticket.ref, html: shell(`
      <h2 style="margin:0 0 6px;font-size:20px">${esc(ticket.subject)}</h2>
      <p style="color:#6B746C">Hi ${esc((name || '').split(' ')[0] || 'there')},</p>
      <div style="white-space:pre-wrap;border-left:3px solid #C9972F;padding:4px 0 4px 12px;margin:12px 0">${esc(text)}</div>
      ${btn(link, 'View and reply')}<p style="color:#9AA39B;font-size:12px">Request ${esc(ticket.ref)}</p>`),
  }),
  unsubscribeUrl, checkUnsubscribe,
  processOutbox, startWorker, stopWorker, outbox, testHooks,
};

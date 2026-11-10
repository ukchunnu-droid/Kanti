// Email confirmations via Nodemailer.
// - If SMTP_* env vars are set, real email is sent through that server.
// - Otherwise a free Ethereal test inbox is created automatically and each
//   email returns a preview URL you can open in the browser (great for demos).
const nodemailer = require('nodemailer');

let transportPromise = null;
const outbox = []; // filled only when EMAIL_TRANSPORT=json (tests)

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
    console.log('[email] No SMTP configured — using Ethereal test inbox.');
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: test.user, pass: test.pass },
    });
  })();

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

async function send(to, subject, html) {
  const transport = await getTransport();
  const info = await transport.sendMail({ from: process.env.MAIL_FROM || 'Kanti <orders@kanti.example>', to, subject, html });
  if (process.env.EMAIL_TRANSPORT === 'json') outbox.push({ to, subject, html });
  const preview = nodemailer.getTestMessageUrl(info) || null; // non-null only on Ethereal
  if (preview) console.log(`[email] "${subject}" preview:`, preview);
  return { messageId: info.messageId, previewUrl: preview };
}

function sendOrderConfirmation(order, user) {
  return send(user.email, `Your Kanti order ${order.order_no} is confirmed 🌿`, orderEmailHtml(order, user));
}

function sendPasswordReset(user, link) {
  return send(user.email, 'Reset your Kanti password', shell(`
      <h2 style="margin:0 0 6px;font-size:20px">Reset your password</h2>
      <p style="color:#6B746C">Hi ${esc((user.name || '').split(' ')[0] || 'there')}, someone (hopefully you) asked to reset
         the password for your Kanti account. This link works once and expires in 1 hour.</p>
      <p style="margin:20px 0"><a href="${esc(link)}" style="background:#20453B;color:#FBF8EF;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Choose a new password</a></p>
      <p style="color:#6B746C;font-size:13px">Didn't ask for this? You can ignore this email — your password won't change.</p>`));
}

module.exports = { sendOrderConfirmation, sendPasswordReset, outbox };

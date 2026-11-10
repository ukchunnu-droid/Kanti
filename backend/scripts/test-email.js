// Sends one test email using the settings in .env — checks real delivery without placing an order.
//   npm run test-email                 → sends to SMTP_USER (yourself)
//   npm run test-email -- someone@x.com
require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER) {
    console.error('SMTP_HOST / SMTP_USER are not set in .env — the app is using the Ethereal test inbox, which never delivers real email.');
    process.exit(1);
  }
  const to = process.argv[2] || SMTP_USER;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  try {
    await transport.verify();
    console.log(`✓ Logged in to ${SMTP_HOST} as ${SMTP_USER}`);
    const info = await transport.sendMail({
      from: MAIL_FROM || SMTP_USER, to,
      subject: 'Kanti test email 🌿',
      html: '<p>If you can read this, Kanti can send real email (order confirmations and password resets).</p>',
    });
    console.log(`✓ Sent to ${to} (message id ${info.messageId}). Check the inbox — and the spam folder.`);
  } catch (e) {
    console.error('✗ Email failed:', e.message);
    if (/535|Username and Password not accepted|BadCredentials/i.test(e.message)) {
      console.error('  → Gmail rejected the login. Use a 16-character App Password (needs 2-Step Verification), not your normal password.');
    }
    process.exit(1);
  }
})();

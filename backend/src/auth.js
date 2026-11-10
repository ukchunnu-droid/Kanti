// Authentication: password hashing, session tokens, and the auth middleware.
//
// Sessions are a signed JWT in an httpOnly cookie (`kanti_session`), so page
// scripts can never read the token. A second, readable cookie (`kanti_signed_in=1`)
// only tells the UI that someone is signed in — it grants nothing by itself.
// `Authorization: Bearer <token>` is still accepted for API clients and tests.
//
// Each token carries the user's token_version; bumping it (password change/reset)
// signs out every other session.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const IS_PROD = process.env.NODE_ENV === 'production';
const PLACEHOLDER = 'change-me-to-a-long-random-string';

function resolveSecret() {
  const s = process.env.JWT_SECRET;
  if (s && s !== PLACEHOLDER && s.length >= 32) return s;
  if (IS_PROD) {
    console.error('[auth] JWT_SECRET must be set to a long random string in production. Refusing to start.');
    process.exit(1);
  }
  console.warn('[auth] JWT_SECRET not set (or too short) — using a random dev secret; sessions reset on restart.');
  return crypto.randomBytes(48).toString('hex');
}
const SECRET = resolveSecret();

const SESSION_COOKIE = 'kanti_session';
const HINT_COOKIE = 'kanti_signed_in';
const MAX_AGE_S = 30 * 24 * 3600; // 30 days

const hashPassword = (plain) => bcrypt.hash(plain, 10);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

function signToken(user) {
  return jwt.sign({ uid: user.id, tv: user.token_version || 0 }, SECRET, { expiresIn: MAX_AGE_S });
}

function cookie(name, value, { httpOnly, maxAge }) {
  return [
    `${name}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'SameSite=Lax',
    httpOnly ? 'HttpOnly' : '', IS_PROD ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}
function setSession(res, user) {
  res.setHeader('Set-Cookie', [
    cookie(SESSION_COOKIE, signToken(user), { httpOnly: true, maxAge: MAX_AGE_S }),
    cookie(HINT_COOKIE, '1', { httpOnly: false, maxAge: MAX_AGE_S }),
  ]);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', [
    cookie(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 }),
    cookie(HINT_COOKIE, '', { httpOnly: false, maxAge: 0 }),
  ]);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Returns the signed-in user row, or null.
function userFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { uid, tv } = jwt.verify(token, SECRET);
    const user = db.getUserById(uid);
    if (!user || (user.token_version || 0) !== (tv || 0)) return null; // deleted, or signed out everywhere
    return user;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) {
    if (readCookie(req, HINT_COOKIE)) clearSession(res); // stale cookies → clear them
    return res.status(401).json({ error: 'Please sign in.' });
  }
  req.user = user;
  req.userId = user.id;
  next();
}

// Attaches req.user when signed in, but never blocks.
function optionalAuth(req, _res, next) {
  const user = userFromRequest(req);
  if (user) { req.user = user; req.userId = user.id; }
  next();
}

module.exports = {
  hashPassword, verifyPassword, signToken, setSession, clearSession, requireAuth, optionalAuth,
};

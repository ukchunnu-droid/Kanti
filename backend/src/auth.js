// Authentication: password hashing, sessions, and the auth middleware.
//
// Sessions live in the `sessions` table (one row per signed-in browser), so they can be listed and
// signed out per device. The httpOnly cookie `kanti_session` holds a signed JWT naming the session;
// page scripts can never read it. A readable `kanti_signed_in=1` cookie only tells the UI someone is
// signed in. `Authorization: Bearer <token>` is still accepted for API clients and tests.
//
// Inactivity: each open tab reports every ~30s whether the person is active. After
// SESSION_IDLE_WARN_S (default 5 min) of no activity the page warns; after the grace period
// (SESSION_IDLE_GRACE_S, default 2 min) the server refuses the session. "Remember me" sessions
// survive closing the browser (up to 30 days) — the inactivity rule then applies while a tab is open.
// Without "remember me", the rule applies even with every tab closed.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const store = require('./store');
const live = require('./live');
const log = require('./log');

const IS_PROD = process.env.NODE_ENV === 'production';
const PLACEHOLDER = 'change-me-to-a-long-random-string';

function resolveSecret() {
  const s = process.env.JWT_SECRET;
  if (s && s !== PLACEHOLDER && s.length >= 32) return s;
  if (IS_PROD) {
    log.error('JWT_SECRET must be set to a long random string in production. Refusing to start.');
    process.exit(1);
  }
  log.warn('JWT_SECRET not set (or too short) — using a random dev secret; sessions reset on restart.');
  return crypto.randomBytes(48).toString('hex');
}
const SECRET = resolveSecret();

const SESSION_COOKIE = 'kanti_session';
const HINT_COOKIE = 'kanti_signed_in';
const REMEMBER_S = 30 * 24 * 3600;      // "remember me": 30 days
const SHORT_S = 12 * 3600;              // otherwise: until the browser closes, at most 12 hours
const IDLE = {
  warn: Number(process.env.SESSION_IDLE_WARN_S || 300),
  grace: Number(process.env.SESSION_IDLE_GRACE_S || 120),
  tabAlive: Number(process.env.SESSION_TAB_ALIVE_S || 75), // a tab that pinged this recently counts as open
};
const idleLimitMs = () => (IDLE.warn + IDLE.grace) * 1000;

const hashPassword = (plain) => bcrypt.hash(plain, 10);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

function cookie(name, value, { httpOnly, maxAge }) {
  return [
    `${name}=${value}`, 'Path=/', maxAge == null ? '' : `Max-Age=${maxAge}`, 'SameSite=Lax',
    httpOnly ? 'HttpOnly' : '', IS_PROD ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}
function writeCookies(res, token, remember) {
  const maxAge = remember ? REMEMBER_S : null; // no Max-Age = removed when the browser closes
  res.setHeader('Set-Cookie', [
    cookie(SESSION_COOKIE, token, { httpOnly: true, maxAge }),
    cookie(HINT_COOKIE, '1', { httpOnly: false, maxAge }),
  ]);
}
const tokenFor = (user, sid, ttlS) => jwt.sign({ uid: user.id, sid, tv: user.token_version || 0 }, SECRET, { expiresIn: ttlS });
const clientIp = (req) => req.ip || (req.socket && req.socket.remoteAddress) || '';

// New sign-in: a new session row + cookies.
function setSession(res, user, req, { remember = false } = {}) {
  const ttl = remember ? REMEMBER_S : SHORT_S;
  const sid = store.sessions.create({ userId: user.id, remember, ttlMs: ttl * 1000, userAgent: req && req.get('user-agent'), ip: req && clientIp(req) });
  writeCookies(res, tokenFor(user, sid, ttl), remember);
  if (req) req.sessionId = sid;
  return sid;
}
// Same session, new token (after a password change bumps token_version).
function reissueSession(res, req, user) {
  const s = req.sessionId && store.sessions.get(req.sessionId);
  if (!s) return setSession(res, user, req, {});
  const ttl = Math.max(60, Math.floor((Date.parse(s.expires_at) - Date.now()) / 1000));
  writeCookies(res, tokenFor(user, s.id, ttl), !!s.remember);
  return s.id;
}
function clearCookies(res) {
  res.setHeader('Set-Cookie', [
    cookie(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 }),
    cookie(HINT_COOKIE, '', { httpOnly: false, maxAge: 0 }),
  ]);
}
function clearSession(res, req) {
  if (req && req.sessionId) { store.sessions.revoke(req.sessionId, 'signed out'); live.endSession(req.sessionId, 'signed out'); }
  clearCookies(res);
}
function endSession(sid, reason) {
  store.sessions.revoke(sid, reason);
  live.endSession(sid, reason);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Returns { user, session } or { reason } ('idle' | 'revoked' | 'expired' | null).
function authenticate(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : readCookie(req, SESSION_COOKIE);
  if (!token) return { reason: null };
  let claims;
  try { claims = jwt.verify(token, SECRET); } catch { return { reason: 'expired' }; }
  const user = db.getUserById(claims.uid);
  if (!user || (user.token_version || 0) !== (claims.tv || 0)) return { reason: 'revoked' };
  const s = claims.sid && store.sessions.get(claims.sid);
  if (!s || s.user_id !== user.id) return { reason: 'revoked' };
  if (s.revoked_at) return { reason: s.revoked_reason === 'inactivity' ? 'idle' : 'revoked' };
  const t = Date.now();
  if (Date.parse(s.expires_at) < t) return { reason: 'expired' };
  const idleMs = t - Date.parse(s.last_active_at);
  const tabOpen = t - Date.parse(s.tab_seen_at) < IDLE.tabAlive * 1000;
  if (idleMs > idleLimitMs() && (!s.remember || tabOpen)) {
    endSession(s.id, 'inactivity');
    log.info('session ended after inactivity', { user: user.id });
    return { reason: 'idle' };
  }
  return { user, session: s };
}

const REASON_TEXT = {
  idle: 'You were signed out after a period of inactivity. Please sign in again.',
  revoked: 'This session was signed out. Please sign in again.',
  expired: 'Your session has expired. Please sign in again.',
};
function requireAuth(req, res, next) {
  const a = authenticate(req);
  if (!a.user) {
    if (readCookie(req, HINT_COOKIE) || readCookie(req, SESSION_COOKIE)) clearCookies(res); // stale cookies → clear them
    return res.status(401).json({ error: REASON_TEXT[a.reason] || 'Please sign in.', reason: a.reason || 'signed_out' });
  }
  req.user = a.user; req.userId = a.user.id; req.sessionId = a.session.id; req.session = a.session;
  next();
}
// Attaches req.user when signed in, but never blocks.
function optionalAuth(req, _res, next) {
  const a = authenticate(req);
  if (a.user) { req.user = a.user; req.userId = a.user.id; req.sessionId = a.session.id; req.session = a.session; }
  next();
}
// Admin pages/API: only the account whose email matches ADMIN_EMAIL.
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!db.isAdmin(req.user)) return res.status(403).json({ error: 'This page is for the store admin only.' });
    next();
  });
}

module.exports = {
  hashPassword, verifyPassword, setSession, reissueSession, clearSession, endSession, requireAuth, optionalAuth, requireAdmin,
  IDLE, SECRET,
};

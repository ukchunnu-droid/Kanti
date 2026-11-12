// Live updates over Server-Sent Events (GET /api/live).
// Every open tab keeps one connection. Changes are pushed to all of a user's tabs and devices
// (except the tab that made the change), and stock changes go to everyone, so pages update
// without reloading. Plain HTTP — no extra library or port.
const log = require('./log');

const byUser = new Map(); // userId → Set<client>
const everyone = new Set();

function connect(req, res, { userId, sessionId }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 4000\n\n');
  const client = { res, userId, sessionId, tab: String(req.query.tab || '').slice(0, 40) };
  everyone.add(client);
  if (userId) {
    if (!byUser.has(userId)) byUser.set(userId, new Set());
    byUser.get(userId).add(client);
  }
  send(client, 'hello', { signedIn: !!userId });
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  ping.unref();
  req.on('close', () => {
    clearInterval(ping);
    everyone.delete(client);
    if (userId && byUser.has(userId)) { byUser.get(userId).delete(client); if (!byUser.get(userId).size) byUser.delete(userId); }
  });
}
function send(client, type, data) {
  try { client.res.write(`event: ${type}\ndata: ${JSON.stringify(data || {})}\n\n`); } catch (e) { log.debug('live: write failed', { error: e.message }); }
}
// To every tab of one user (optionally skipping the tab that caused the change).
function toUser(userId, type, data, exceptTab) {
  for (const c of byUser.get(userId) || []) if (!exceptTab || c.tab !== exceptTab) send(c, type, data);
}
function toAll(type, data) { for (const c of everyone) send(c, type, data); }
// A session was signed out (device list, password change, inactivity): tell its tabs, then close them.
function endSession(sessionId, reason) {
  for (const c of everyone) {
    if (c.sessionId === sessionId) { send(c, 'session', { ended: true, reason }); try { c.res.end(); } catch { /* closed */ } }
  }
}
const stats = () => ({ connections: everyone.size, users: byUser.size });

module.exports = { connect, toUser, toAll, endSession, stats };

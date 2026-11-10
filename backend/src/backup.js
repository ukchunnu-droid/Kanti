// Database backups.
// - backupNow(): a consistent copy of the live database (safe while the server is running),
//   saved as backups/kanti-YYYYMMDD-HHMMSS.db. Only the newest BACKUP_KEEP (default 14) are kept.
// - scheduleBackups(): takes one every BACKUP_INTERVAL_HOURS (default 24; 0 = off), including
//   at startup if the last one is older than that.
// Restore with `npm run restore -- backups/<file>.db` while the server is stopped.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const log = require('./log');

const DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 14));
const INTERVAL_H = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24);

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function listBackups() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /^kanti-\d{8}-\d{6}(-\d+)?\.db$/.test(f)).sort();
}

async function backupNow(reason = 'manual') {
  fs.mkdirSync(DIR, { recursive: true });
  let file = path.join(DIR, `kanti-${stamp()}.db`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(DIR, `kanti-${stamp()}-${i}.db`);
  await db.raw.backup(file);
  const old = listBackups().slice(0, -KEEP);
  for (const f of old) fs.unlinkSync(path.join(DIR, f));
  const at = new Date().toISOString();
  db.setMeta('last_backup_at', at);
  db.setMeta('last_backup_file', path.basename(file));
  log.info('backup saved', { file: path.basename(file), reason, kept: Math.min(KEEP, listBackups().length), removed: old.length });
  return { file, at };
}

function scheduleBackups() {
  if (!(INTERVAL_H > 0)) { log.info('automatic backups are off (BACKUP_INTERVAL_HOURS=0)'); return; }
  const check = () => {
    const last = db.getMeta('last_backup_at');
    if (!last || Date.now() - new Date(last).getTime() >= INTERVAL_H * 3600e3) {
      backupNow('scheduled').catch((e) => log.error('backup failed', { error: e.message }));
    }
  };
  check();
  setInterval(check, 60 * 60e3).unref(); // look once an hour
}

module.exports = { backupNow, scheduleBackups, listBackups, BACKUP_DIR: DIR };

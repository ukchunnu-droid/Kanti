// npm run restore -- backups/kanti-YYYYMMDD-HHMMSS.db
// Replaces the database with a backup. Stop the server first. The current database is
// saved as backups/pre-restore-<time>.db so a restore can itself be undone.
require('dotenv').config();
const fs = require('fs');
const path = require('path');

(async () => {
  const src = process.argv[2];
  const target = process.env.DB_FILE || path.join(__dirname, '..', 'kanti.db');
  const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  if (!src || !fs.existsSync(src)) {
    console.error('Usage: npm run restore -- backups/<file>.db');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort() : [];
    if (files.length) console.error('Available backups:\n  ' + files.map((f) => path.join(path.relative(process.cwd(), dir), f)).join('\n  '));
    process.exit(1);
  }
  // Refuse while the server is running — it holds the database open.
  const port = process.env.PORT || 3000;
  try {
    await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    console.error(`✗ A server is answering on port ${port}. Stop it first, then run the restore again.`);
    process.exit(1);
  } catch { /* not running — good */ }

  const Database = require('better-sqlite3');
  try {
    const check = new Database(src, { readonly: true });
    const ok = check.pragma('integrity_check', { simple: true });
    check.close();
    if (ok !== 'ok') throw new Error('integrity check: ' + ok);
  } catch (e) {
    console.error('✗ That file is not a healthy Kanti database:', e.message);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(target)) {
    const safety = path.join(dir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    const live = new Database(target);
    await live.backup(safety);
    live.close();
    console.log('• Current database saved to', safety);
  }
  for (const ext of ['-wal', '-shm']) fs.rmSync(target + ext, { force: true });
  fs.copyFileSync(src, target);
  console.log('✓ Restored', src, '→', target, '\n  Start the server again with npm start.');
})();

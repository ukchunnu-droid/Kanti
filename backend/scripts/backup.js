// npm run backup — saves a copy of the database to backups/ (safe while the server runs).
require('dotenv').config();
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const { backupNow } = require('../src/backup');
backupNow('manual (npm run backup)')
  .then(({ file }) => { console.log('✓ Backup saved:', file); process.exit(0); })
  .catch((e) => { console.error('✗ Backup failed:', e.message); process.exit(1); });

// Small structured logger (no dependency).
// - Production (or LOG_FORMAT=json): one JSON object per line — easy to search in any log viewer.
// - Development: readable "[level] message {fields}" lines.
// LOG_LEVEL = error | warn | info (default) | debug | silent
const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };
const JSON_MODE = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

function threshold() {
  return LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
}

function write(level, msg, fields = {}) {
  if (LEVELS[level] > threshold()) return;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (JSON_MODE) {
    out(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
  } else {
    const extra = Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
    out(`[${level}] ${msg}${extra}`);
  }
}

module.exports = {
  error: (msg, fields) => write('error', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  info: (msg, fields) => write('info', msg, fields),
  debug: (msg, fields) => write('debug', msg, fields),
};

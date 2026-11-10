// SQLite database. Zero-config — the file is created automatically on first run.
// Schema changes are versioned migrations (PRAGMA user_version), so an existing
// kanti.db is upgraded in place on startup. For production, swap to Postgres.
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { PRODUCTS, SHIPPING } = require('./catalog');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'kanti.db');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// ---------- Migrations ----------
// Append only. Each entry runs once, in order, inside a transaction.
const MIGRATIONS = [
  // 1 — the original schema (no-op on databases created before migrations existed)
  () => db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, phone TEXT, address TEXT, city TEXT, zip TEXT,
      skin_type TEXT, dosha TEXT, concern TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT NOT NULL, user_id INTEGER NOT NULL,
      items_json TEXT NOT NULL, subtotal REAL NOT NULL, shipping REAL NOT NULL, total REAL NOT NULL,
      ship_to_json TEXT, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id)
    );`),

  // 2 — accounts, catalogue, real order records, quiz history, saved bag, routine, password resets
  () => {
    // Users: richer address, session versioning, normalised emails, skin profile → quiz_results.
    db.exec(`
      ALTER TABLE users ADD COLUMN address2 TEXT;
      ALTER TABLE users ADD COLUMN state TEXT;
      ALTER TABLE users ADD COLUMN country TEXT;
      ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN updated_at TEXT;
      UPDATE OR IGNORE users SET email = lower(trim(email));

      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        active INTEGER NOT NULL DEFAULT 1, data_json TEXT NOT NULL
      );

      CREATE TABLE quiz_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skin_type TEXT NOT NULL, dosha TEXT NOT NULL, concern TEXT, culture TEXT, spice TEXT,
        look_for_json TEXT, avoid_json TEXT, rationale TEXT, source TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX idx_quiz_user ON quiz_results(user_id, id);

      CREATE TABLE cart_items (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 20),
        PRIMARY KEY (user_id, product_id)
      );

      CREATE TABLE routine_progress (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );

      CREATE TABLE password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL, used_at TEXT
      );

      CREATE TABLE orders_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','shipped','delivered','cancelled')),
        subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL,
        ship_to_json TEXT NOT NULL DEFAULT '{}',
        email_preview_url TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders_v2(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        qty INTEGER NOT NULL CHECK (qty > 0)
      );
      CREATE INDEX idx_order_items_order ON order_items(order_id);
    `);

    // Existing skin profiles become the first quiz-history entry.
    db.exec(`
      INSERT INTO quiz_results (user_id, skin_type, dosha, concern, source, created_at)
      SELECT id, skin_type, dosha, concern, 'legacy', created_at FROM users
      WHERE skin_type IS NOT NULL AND dosha IS NOT NULL;`);

    // Existing orders: JSON blob + float dollars → order rows + item rows in cents.
    const insO = db.prepare(`INSERT OR IGNORE INTO orders_v2
      (id, order_no, user_id, subtotal_cents, shipping_cents, total_cents, ship_to_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insI = db.prepare(`INSERT INTO order_items (order_id, product_id, name, unit_price_cents, qty)
      VALUES (?, ?, ?, ?, ?)`);
    const cents = (n) => Math.round(Number(n || 0) * 100);
    for (const o of db.prepare('SELECT * FROM orders').all()) {
      const r = insO.run(o.id, o.order_no, o.user_id, cents(o.subtotal), cents(o.shipping), cents(o.total),
        o.ship_to_json || '{}', o.created_at);
      if (!r.changes) continue; // duplicate order_no from the old random generator — skip
      let items = [];
      try { items = JSON.parse(o.items_json) || []; } catch { /* corrupt row */ }
      for (const it of items) {
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        insI.run(o.id, String(it.id || '?'), String(it.name || 'Item'), cents(it.price), qty);
      }
    }
    db.exec(`
      DROP TABLE orders;
      ALTER TABLE orders_v2 RENAME TO orders;
      CREATE INDEX idx_orders_user ON orders(user_id, id);
      ALTER TABLE users DROP COLUMN skin_type;
      ALTER TABLE users DROP COLUMN dosha;
      ALTER TABLE users DROP COLUMN concern;`);
  },
];

function migrate() {
  const current = db.pragma('user_version', { simple: true });
  if (current >= MIGRATIONS.length) return;
  db.pragma('foreign_keys = OFF'); // table rebuilds need FKs off; re-checked below
  try {
    for (let v = current; v < MIGRATIONS.length; v++) {
      db.transaction(() => {
        MIGRATIONS[v]();
        db.pragma(`user_version = ${v + 1}`);
      })();
      console.log(`[db] migrated to schema v${v + 1}`);
    }
    const broken = db.pragma('foreign_key_check');
    if (broken.length) console.warn('[db] foreign key problems after migration:', broken.slice(0, 5));
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
migrate();
db.pragma('foreign_keys = ON');

// ---------- Catalogue (upserted from src/catalog.js on every start) ----------
const upsertProduct = db.prepare(`
  INSERT INTO products (id, name, price_cents, active, data_json) VALUES (@id, @name, @price_cents, @active, @data_json)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, price_cents=excluded.price_cents,
    active=excluded.active, data_json=excluded.data_json`);
db.transaction(() => {
  for (const p of PRODUCTS) {
    const { id, name, price_cents, active, ...rest } = p;
    upsertProduct.run({ id, name, price_cents, active: active === false ? 0 : 1, data_json: JSON.stringify(rest) });
  }
})();

const rowToProduct = (r) => ({
  id: r.id, name: r.name, price_cents: r.price_cents, price: r.price_cents / 100, active: !!r.active,
  ...JSON.parse(r.data_json),
});
const productStmt = db.prepare('SELECT * FROM products WHERE id = ?');
const productsStmt = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY rowid');

// ---------- Users ----------
const USER_FIELDS = ['name', 'phone', 'address', 'address2', 'city', 'state', 'zip', 'country'];

function publicUser(u) {
  if (!u) return null;
  const { password_hash, token_version, ...safe } = u;
  return safe;
}

const now = () => new Date().toISOString();

// ---------- Orders ----------
function newOrderNo() {
  // KNT- + 8 random base32-ish chars; the UNIQUE constraint is the final guard.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  return 'KNT-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const orderItemsStmt = db.prepare(
  'SELECT product_id, name, unit_price_cents, qty FROM order_items WHERE order_id = ? ORDER BY id');
function orderFromRow(r) {
  const items = orderItemsStmt.all(r.id).map((i) => ({
    id: i.product_id, name: i.name, qty: i.qty, price_cents: i.unit_price_cents, price: i.unit_price_cents / 100,
  }));
  return {
    order_no: r.order_no, status: r.status, date: r.created_at, items,
    subtotal_cents: r.subtotal_cents, shipping_cents: r.shipping_cents, total_cents: r.total_cents,
    subtotal: r.subtotal_cents / 100, shipping: r.shipping_cents / 100, total: r.total_cents / 100,
    ship_to: JSON.parse(r.ship_to_json || '{}'),
    email_preview_url: r.email_preview_url || null,
  };
}

// ---------- Quiz results ----------
function quizFromRow(r) {
  if (!r) return null;
  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  return {
    id: r.id, skinType: r.skin_type, dosha: r.dosha, concern: r.concern, culture: r.culture, spice: r.spice,
    lookFor: parse(r.look_for_json), avoid: parse(r.avoid_json), rationale: r.rationale, source: r.source,
    date: r.created_at,
  };
}

module.exports = {
  raw: db,
  SHIPPING,
  USER_FIELDS,
  publicUser,

  // users
  createUser(name, email, password_hash) {
    const info = db.prepare(`INSERT INTO users (name, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run(name, email, password_hash, now(), now());
    return this.getUserById(info.lastInsertRowid);
  },
  getUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
  getUserById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  // Partial update: only keys present in `fields` are changed.
  updateProfile(id, fields) {
    const keys = USER_FIELDS.filter((k) => k in fields);
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE users SET ${sets}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...Object.fromEntries(keys.map((k) => [k, fields[k]])), updated_at: now(), id });
  },
  setPassword(id, password_hash) {
    db.prepare(`UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?`)
      .run(password_hash, now(), id);
  },
  deleteUser: (id) => db.prepare('DELETE FROM users WHERE id = ?').run(id),

  // products
  listProducts: () => productsStmt.all().map(rowToProduct),
  getProduct: (id) => { const r = productStmt.get(id); return r ? rowToProduct(r) : null; },

  // orders
  createOrder({ user_id, lines, subtotal_cents, shipping_cents, total_cents, ship_to }) {
    return db.transaction(() => {
      let info;
      for (let attempt = 0; ; attempt++) {
        try {
          info = db.prepare(`INSERT INTO orders (order_no, user_id, subtotal_cents, shipping_cents, total_cents, ship_to_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(newOrderNo(), user_id, subtotal_cents, shipping_cents, total_cents, JSON.stringify(ship_to || {}), now());
          break;
        } catch (e) {
          if (attempt < 3 && /UNIQUE/.test(e.message)) continue; // order number collision → retry
          throw e;
        }
      }
      const ins = db.prepare(`INSERT INTO order_items (order_id, product_id, name, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?)`);
      for (const l of lines) ins.run(info.lastInsertRowid, l.id, l.name, l.price_cents, l.qty);
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user_id); // ordered → bag is empty
      return orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid));
    })();
  },
  setOrderEmailPreview: (order_no, url) =>
    db.prepare('UPDATE orders SET email_preview_url = ? WHERE order_no = ?').run(url, order_no),
  getOrdersByUser: (userId) =>
    db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(userId).map(orderFromRow),
  getOrder(userId, orderNo) {
    const r = db.prepare('SELECT * FROM orders WHERE user_id = ? AND order_no = ?').get(userId, orderNo);
    return r ? orderFromRow(r) : null;
  },

  // quiz history
  addQuizResult(userId, q) {
    const info = db.prepare(`INSERT INTO quiz_results
      (user_id, skin_type, dosha, concern, culture, spice, look_for_json, avoid_json, rationale, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      userId, q.skinType, q.dosha, q.concern ?? null, q.culture ?? null, q.spice ?? null,
      q.lookFor ? JSON.stringify(q.lookFor) : null, q.avoid ? JSON.stringify(q.avoid) : null,
      q.rationale ?? null, q.source ?? null, now());
    return quizFromRow(db.prepare('SELECT * FROM quiz_results WHERE id = ?').get(info.lastInsertRowid));
  },
  latestQuiz: (userId) =>
    quizFromRow(db.prepare('SELECT * FROM quiz_results WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)),
  quizHistory: (userId, limit = 20) =>
    db.prepare('SELECT * FROM quiz_results WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit).map(quizFromRow),

  // saved bag
  getCart: (userId) =>
    db.prepare(`SELECT c.product_id AS id, c.qty FROM cart_items c JOIN products p ON p.id = c.product_id
      WHERE c.user_id = ? AND p.active = 1 ORDER BY c.rowid`).all(userId),
  replaceCart(userId, items) {
    db.transaction(() => {
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
      const ins = db.prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)');
      for (const it of items) ins.run(userId, it.id, it.qty);
    })();
    return this.getCart(userId);
  },

  // routine progress
  getRoutine(userId) {
    const r = db.prepare('SELECT data_json FROM routine_progress WHERE user_id = ?').get(userId);
    return r ? JSON.parse(r.data_json) : null;
  },
  setRoutine(userId, data) {
    db.prepare(`INSERT INTO routine_progress (user_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
      .run(userId, JSON.stringify(data), now());
  },

  // password resets (only a SHA-256 of the token is stored)
  createPasswordReset(userId, tokenHash, expiresAt) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(userId);
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);
  },
  // Returns the user id and marks the token used, or null if invalid/expired/used.
  consumePasswordReset(tokenHash) {
    return db.transaction(() => {
      const r = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash);
      if (!r || r.used_at || r.expires_at < now()) return null;
      db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(now(), tokenHash);
      return r.user_id;
    })();
  },
};

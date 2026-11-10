// SQLite database. Zero-config — the file is created automatically on first run.
// Schema changes are versioned migrations (PRAGMA user_version), so an existing
// kanti.db is upgraded in place on startup. For production, swap to Postgres.
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { PRODUCTS, SHIPPING } = require('./catalog');
const log = require('./log');

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

  // 3 — products become admin-managed (category/stock/order columns), email verification,
  //     order lifecycle, email outbox with retries, app settings
  () => db.exec(`
    ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
    ALTER TABLE products ADD COLUMN stock INTEGER CHECK (stock IS NULL OR stock >= 0);
    ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN created_at TEXT;
    ALTER TABLE products ADD COLUMN updated_at TEXT;
    UPDATE products SET
      category = coalesce(json_extract(data_json, '$.cat'), 'Other'),
      data_json = json_remove(data_json, '$.cat'),
      sort_order = rowid, stock = 25,
      created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

    ALTER TABLE users ADD COLUMN email_verified_at TEXT;
    UPDATE users SET email_verified_at = created_at; -- accounts made before verification existed count as verified

    ALTER TABLE orders ADD COLUMN status_updated_at TEXT;
    ALTER TABLE orders ADD COLUMN tracking_no TEXT;
    UPDATE orders SET status_updated_at = created_at;

    CREATE TABLE email_verifications (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL, used_at TEXT
    );

    CREATE TABLE email_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_addr TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL,
      kind TEXT NOT NULL, ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL, last_error TEXT, preview_url TEXT,
      created_at TEXT NOT NULL, sent_at TEXT
    );
    CREATE INDEX idx_outbox_due ON email_outbox(status, next_attempt_at);

    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT);`),
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
      log.info(`db: migrated to schema v${v + 1}`);
    }
    const broken = db.pragma('foreign_key_check');
    if (broken.length) log.warn('db: foreign key problems after migration', { rows: broken.slice(0, 5) });
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
migrate();
db.pragma('foreign_keys = ON');

// ---------- Catalogue ----------
// The products table is the source of truth (edited from the admin page).
// src/catalog.js only seeds a brand-new, empty database.
const now = () => new Date().toISOString();
const PRODUCT_COLUMNS = ['id', 'name', 'price_cents', 'active', 'category', 'stock', 'sort_order', 'created_at', 'updated_at'];

function splitProduct(p) {
  // Columns vs. the free-form details kept in data_json.
  const { id, name, price_cents, active, cat, category, stock, sort_order, price, created_at, updated_at, orders, ...rest } = p;
  return {
    cols: { id, name, price_cents, active: active === false ? 0 : 1, category: category || cat || 'Other',
      stock: stock == null ? null : stock, sort_order: sort_order || 0 },
    data: rest,
  };
}
const insertProductStmt = db.prepare(`INSERT INTO products
  (id, name, price_cents, active, category, stock, sort_order, data_json, created_at, updated_at)
  VALUES (@id, @name, @price_cents, @active, @category, @stock, @sort_order, @data_json, @created_at, @updated_at)`);
function insertProduct(p) {
  const { cols, data } = splitProduct(p);
  insertProductStmt.run({ ...cols, data_json: JSON.stringify(data), created_at: now(), updated_at: now() });
}

if (db.prepare('SELECT count(*) AS n FROM products').get().n === 0) {
  db.transaction(() => PRODUCTS.forEach((p, i) => insertProduct({ stock: 25, ...p, sort_order: i + 1 })))();
  log.info(`db: seeded ${PRODUCTS.length} products from src/catalog.js`);
}

const rowToProduct = (r) => ({
  ...JSON.parse(r.data_json),
  id: r.id, name: r.name, cat: r.category, category: r.category,
  price_cents: r.price_cents, price: r.price_cents / 100, active: !!r.active,
  stock: r.stock, sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
});
const productStmt = db.prepare('SELECT * FROM products WHERE id = ?');
const productsStmt = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order, created_at');
const allProductsStmt = db.prepare(`SELECT p.*, (SELECT count(*) FROM order_items i WHERE i.product_id = p.id) AS orders
  FROM products p ORDER BY p.active DESC, p.sort_order, p.created_at`);

class StockError extends Error {}

// ---------- Users ----------
const USER_FIELDS = ['name', 'phone', 'address', 'address2', 'city', 'state', 'zip', 'country'];

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const isAdmin = (u) => !!(u && ADMIN_EMAIL && u.email === ADMIN_EMAIL);

function publicUser(u) {
  if (!u) return null;
  const { password_hash, token_version, ...safe } = u;
  return { ...safe, is_admin: isAdmin(u) };
}

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
    status_updated_at: r.status_updated_at || r.created_at, tracking_no: r.tracking_no || null,
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

// Allowed order status changes.
const ORDER_TRANSITIONS = { placed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

module.exports = {
  raw: db,
  SHIPPING,
  USER_FIELDS,
  ORDER_TRANSITIONS,
  StockError,
  publicUser,
  isAdmin,

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
  listAllProducts: () => allProductsStmt.all().map((r) => ({ ...rowToProduct(r), orders: r.orders })),
  getProduct: (id) => { const r = productStmt.get(id); return r ? rowToProduct(r) : null; },
  productIdExists: (id) => !!productStmt.get(id),
  createProduct(p) {
    const max = db.prepare('SELECT coalesce(max(sort_order), 0) AS m FROM products').get().m;
    insertProduct({ sort_order: max + 1, ...p });
    return this.getProduct(p.id);
  },
  // Partial update: `changes` holds only the fields being changed.
  updateProduct(id, changes) {
    const cur = this.getProduct(id);
    if (!cur) return null;
    const { cols, data } = splitProduct({ ...cur, ...changes });
    db.prepare(`UPDATE products SET name=@name, price_cents=@price_cents, active=@active, category=@category,
      stock=@stock, sort_order=@sort_order, data_json=@data_json, updated_at=@updated_at WHERE id=@id`)
      .run({ ...cols, id, data_json: JSON.stringify(data), updated_at: now() });
    return this.getProduct(id);
  },
  // Products that appear in past orders are archived (hidden) instead of deleted, so history stays intact.
  deleteProduct(id) {
    const used = db.prepare('SELECT count(*) AS n FROM order_items WHERE product_id = ?').get(id).n;
    if (used) { this.updateProduct(id, { active: false }); return { archived: true }; }
    db.transaction(() => {
      db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
    })();
    return { deleted: true };
  },

  // orders
  createOrder({ user_id, lines, subtotal_cents, shipping_cents, total_cents, ship_to }) {
    return db.transaction(() => {
      let info;
      for (let attempt = 0; ; attempt++) {
        try {
          info = db.prepare(`INSERT INTO orders (order_no, user_id, subtotal_cents, shipping_cents, total_cents, ship_to_json, created_at, status_updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(newOrderNo(), user_id, subtotal_cents, shipping_cents, total_cents, JSON.stringify(ship_to || {}), now(), now());
          break;
        } catch (e) {
          if (attempt < 3 && /UNIQUE/.test(e.message)) continue; // order number collision → retry
          throw e;
        }
      }
      const ins = db.prepare(`INSERT INTO order_items (order_id, product_id, name, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?)`);
      // Take stock atomically: the WHERE clause makes overselling impossible, even with simultaneous orders.
      const take = db.prepare(`UPDATE products SET stock = stock - @qty
        WHERE id = @id AND active = 1 AND (stock IS NULL OR stock >= @qty)`);
      for (const l of lines) {
        if (!take.run({ id: l.id, qty: l.qty }).changes) {
          const p = productStmt.get(l.id);
          throw new StockError(!p || !p.active ? `${l.name} is no longer available.`
            : p.stock === 0 ? `${l.name} just sold out.` : `Only ${p.stock} of ${l.name} left — please lower the quantity.`);
        }
        ins.run(info.lastInsertRowid, l.id, l.name, l.price_cents, l.qty);
      }
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
  getOrderByNo(orderNo) {
    const r = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
    return r ? { ...orderFromRow(r), user_id: r.user_id } : null;
  },
  // Admin list: every order with its customer.
  listAllOrders({ status } = {}) {
    const rows = status
      ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 500').all(status)
      : db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all();
    const userStmt = db.prepare('SELECT name, email FROM users WHERE id = ?');
    return rows.map((r) => ({ ...orderFromRow(r), customer: userStmt.get(r.user_id) || null }));
  },
  // Moves an order along its lifecycle; cancelling puts the stock back. Returns the updated order.
  setOrderStatus(orderNo, status, trackingNo) {
    return db.transaction(() => {
      const r = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
      if (!r) return { error: 'Order not found.', code: 404 };
      if (!(ORDER_TRANSITIONS[r.status] || []).includes(status)) {
        return { error: `An order that is ${r.status} can’t be marked ${status}.`, code: 409 };
      }
      db.prepare('UPDATE orders SET status = ?, status_updated_at = ?, tracking_no = coalesce(?, tracking_no) WHERE id = ?')
        .run(status, now(), trackingNo || null, r.id);
      if (status === 'cancelled') {
        const back = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL');
        for (const i of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(r.id)) back.run(i.qty, i.product_id);
      }
      return { order: { ...orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(r.id)), user_id: r.user_id } };
    })();
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

  // email verification (only a SHA-256 of the token is stored)
  createEmailVerification(userId, tokenHash, expiresAt) {
    db.prepare('DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL').run(userId);
    db.prepare('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);
  },
  consumeEmailVerification(tokenHash) {
    return db.transaction(() => {
      const r = db.prepare('SELECT * FROM email_verifications WHERE token_hash = ?').get(tokenHash);
      if (!r || r.used_at || r.expires_at < now()) return null;
      db.prepare('UPDATE email_verifications SET used_at = ? WHERE token_hash = ?').run(now(), tokenHash);
      db.prepare('UPDATE users SET email_verified_at = coalesce(email_verified_at, ?) WHERE id = ?').run(now(), r.user_id);
      return r.user_id;
    })();
  },

  // email outbox
  enqueueEmail({ to, subject, html, kind, ref }) {
    return db.prepare(`INSERT INTO email_outbox (to_addr, subject, html, kind, ref, next_attempt_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(to, subject, html, kind, ref || null, now(), now()).lastInsertRowid;
  },
  // Atomically claims due emails so two workers never send the same one.
  claimDueEmails(limit = 10) {
    return db.transaction(() => {
      const rows = db.prepare(`SELECT * FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= ?
        ORDER BY id LIMIT ?`).all(now(), limit);
      const claim = db.prepare(`UPDATE email_outbox SET status = 'sending' WHERE id = ? AND status = 'pending'`);
      return rows.filter((r) => claim.run(r.id).changes);
    })();
  },
  claimEmail(id) {
    const ok = db.prepare(`UPDATE email_outbox SET status = 'sending' WHERE id = ? AND status = 'pending'`).run(id).changes;
    return ok ? db.prepare('SELECT * FROM email_outbox WHERE id = ?').get(id) : null;
  },
  markEmailSent(id, previewUrl) {
    db.prepare(`UPDATE email_outbox SET status = 'sent', sent_at = ?, preview_url = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?`)
      .run(now(), previewUrl || null, id);
  },
  markEmailFailed(id, error, nextAttemptAt) {
    db.prepare(`UPDATE email_outbox SET status = ?, attempts = attempts + 1, last_error = ?, next_attempt_at = coalesce(?, next_attempt_at) WHERE id = ?`)
      .run(nextAttemptAt ? 'pending' : 'failed', String(error).slice(0, 500), nextAttemptAt, id);
  },
  // Emails left in 'sending' by a crash go back in the queue on startup.
  requeueStuckEmails: () => db.prepare(`UPDATE email_outbox SET status = 'pending' WHERE status = 'sending'`).run().changes,
  retryFailedEmails: () => db.prepare(`UPDATE email_outbox SET status = 'pending', attempts = 0, next_attempt_at = ? WHERE status = 'failed'`).run(now()).changes,
  recentEmails: (limit = 30) => db.prepare(`SELECT id, to_addr, subject, kind, ref, status, attempts, last_error, created_at, sent_at
    FROM email_outbox ORDER BY id DESC LIMIT ?`).all(limit),

  // settings
  getMeta: (key) => (db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) || {}).value || null,
  setMeta: (key, value) => db.prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value)),

  // admin dashboard numbers
  stats() {
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const byStatus = Object.fromEntries(db.prepare('SELECT status, count(*) n FROM orders GROUP BY status').all().map((r) => [r.status, r.n]));
    const emails = Object.fromEntries(db.prepare('SELECT status, count(*) n FROM email_outbox GROUP BY status').all().map((r) => [r.status, r.n]));
    return {
      users: one('SELECT count(*) n FROM users').n,
      products: { active: one('SELECT count(*) n FROM products WHERE active = 1').n,
        hidden: one('SELECT count(*) n FROM products WHERE active = 0').n,
        low_stock: one('SELECT count(*) n FROM products WHERE active = 1 AND stock IS NOT NULL AND stock <= 5').n },
      orders: byStatus,
      revenue_cents: one(`SELECT coalesce(sum(total_cents), 0) n FROM orders WHERE status != 'cancelled'`).n,
      emails,
      last_backup_at: this.getMeta('last_backup_at'),
    };
  },

  // everything stored about one user ("download my data")
  exportUser(userId) {
    return {
      exported_at: now(),
      account: publicUser(this.getUserById(userId)),
      orders: this.getOrdersByUser(userId),
      quiz_history: this.quizHistory(userId, 1000),
      saved_bag: this.getCart(userId),
      routine: this.getRoutine(userId),
    };
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

// Input validation. Every function either returns clean values or an `error` message
// that is safe to show to the user.

const SKIN_TYPES = ['oily', 'normal', 'dry', 'combination'];
const DOSHAS = ['vata', 'pitta', 'kapha'];
const MAX_QTY = 20;
const MAX_LINES = 30;

// Trimmed string capped at `max` chars; '' for anything that isn't text.
function text(x, max) {
  return typeof x === 'string' || typeof x === 'number' ? String(x).trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

const email = (x) => text(x, 254).toLowerCase();
const isEmail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

function passwordError(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (/^\s+|\s+$/.test(pw)) return 'Password can’t start or end with a space.';
  return null;
}

// name, phone, address, address2, city, state, zip, country — max lengths
const PROFILE_LIMITS = { name: 80, phone: 30, address: 120, address2: 120, city: 60, state: 60, zip: 12, country: 60 };

// Only keys present in `body` are returned (partial updates).
function profileFields(body) {
  const fields = {};
  for (const [k, max] of Object.entries(PROFILE_LIMITS)) {
    if (!(k in body) || body[k] == null) continue;
    if (typeof body[k] === 'string' && body[k].trim().length > max) return { error: `${label(k)} is too long (max ${max}).` };
    fields[k] = text(body[k], max);
  }
  if (fields.phone && !/^[0-9+()\-.\s]{5,30}$/.test(fields.phone)) return { error: 'Please enter a valid phone number.' };
  if (fields.zip && !/^[A-Za-z0-9\-\s]{3,12}$/.test(fields.zip)) return { error: 'Please enter a valid ZIP / postcode.' };
  return { fields };
}
function label(k) {
  return { address2: 'Address line 2', zip: 'ZIP / postcode' }[k] || k[0].toUpperCase() + k.slice(1);
}

function shipTo(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Please add a shipping address.' };
  const { fields, error } = profileFields(raw);
  if (error) return { error };
  for (const k of ['name', 'address', 'city', 'zip']) {
    if (!fields[k]) return { error: `Please add your ${k === 'zip' ? 'ZIP / postcode' : k}.` };
  }
  return { value: fields };
}

// [{id, qty}] → de-duplicated, validated against the active catalogue.
function cartItems(raw, getProduct) {
  if (raw == null) return { items: [] };
  if (!Array.isArray(raw)) return { error: 'Items must be a list.' };
  if (raw.length > MAX_LINES) return { error: 'Too many items.' };
  const merged = new Map();
  for (const it of raw) {
    const id = it && typeof it.id === 'string' ? it.id : null;
    const qty = Number(it && it.qty);
    if (!id || !Number.isInteger(qty) || qty < 1) return { error: 'Each item needs a product and a quantity.' };
    const p = getProduct(id);
    if (!p || !p.active) return { error: 'One of the products in your bag is no longer available.' };
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) || 0) + qty));
  }
  return { items: [...merged].map(([id, qty]) => ({ id, qty })) };
}

function strList(a, maxItems, maxLen) {
  return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, maxItems).map((x) => text(x, maxLen)).filter(Boolean) : null;
}

function quizResult(b) {
  if (!SKIN_TYPES.includes(b.skinType) || !DOSHAS.includes(b.dosha)) return { error: 'Invalid skin profile.' };
  return {
    result: {
      skinType: b.skinType, dosha: b.dosha,
      concern: text(b.concern, 60) || null, culture: text(b.culture, 30) || null, spice: text(b.spice, 30) || null,
      lookFor: strList(b.lookFor, 8, 60), avoid: strList(b.avoid, 8, 60),
      rationale: text(b.rationale, 600) || null,
      source: ['gemini', 'rules', 'offline'].includes(b.source) ? b.source : 'rules',
    },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function routine(b) {
  if (!DATE_RE.test(b.date || '')) return { error: 'Invalid routine date.' };
  const done = {};
  if (b.done && typeof b.done === 'object') {
    for (const [k, val] of Object.entries(b.done).slice(0, 40)) {
      if (/^(AM|PM):\d{1,2}$/.test(k) && val === true) done[k] = true;
    }
  }
  const streak = Number.isInteger(b.streak) && b.streak >= 0 && b.streak < 100000 ? b.streak : 0;
  const lastComplete = DATE_RE.test(b.lastComplete || '') ? b.lastComplete : null;
  return { routine: { date: b.date, done, streak, lastComplete } };
}

// ---------- Admin: products ----------
const SLOTS = ['Cleanse', 'Tone', 'Treat', 'Moisturise', 'Protect', 'Weekly'];
const TODS = ['AM', 'PM', 'both'];
const CONCERNS = ['breakouts', 'dryness', 'dullness', 'sensitivity', 'fine lines'];

const slugify = (name) => text(name, 60).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
  .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'product';

// Lists may arrive as arrays or comma-separated text (from the admin form).
function list(x, maxItems, maxLen) {
  const arr = Array.isArray(x) ? x : typeof x === 'string' ? x.split(',') : [];
  return arr.map((v) => text(v, maxLen)).filter(Boolean).slice(0, maxItems);
}
function pick(x, allowed) {
  return [...new Set(list(x, allowed.length, 20).map((v) => v.toLowerCase()))].filter((v) => allowed.includes(v));
}

// Full or partial (`partial: true`) product input → { value } or { error }.
function productInput(b, { partial = false } = {}) {
  const v = {};
  const has = (k) => k in b && b[k] !== undefined;
  const need = (k) => !partial || has(k);

  if (need('name')) { v.name = text(b.name, 80); if (!v.name) return { error: 'Give the product a name.' }; }
  if (need('price')) {
    const price = Number(b.price);
    if (!Number.isFinite(price) || price < 0 || price > 1000) return { error: 'Price must be between $0 and $1000.' };
    v.price_cents = Math.round(price * 100);
  }
  if (need('category')) { v.category = text(b.category, 40); if (!v.category) return { error: 'Add a category (e.g. Serum).' }; }
  if (need('slot')) { if (!SLOTS.includes(b.slot)) return { error: `Routine step must be one of: ${SLOTS.join(', ')}.` }; v.slot = b.slot; }
  if (need('tod')) { v.tod = TODS.includes(b.tod) ? b.tod : 'both'; }
  if (need('skin')) { v.skin = pick(b.skin, SKIN_TYPES); if (!v.skin.length) return { error: 'Choose at least one skin type.' }; }
  if (need('dosha')) { v.dosha = pick(b.dosha, DOSHAS); if (!v.dosha.length) return { error: 'Choose at least one dosha.' }; }
  if (has('concern')) v.concern = pick(b.concern, CONCERNS);
  if (need('ings')) { v.ings = list(b.ings, 12, 40); if (!v.ings.length) return { error: 'List at least one key ingredient.' }; }
  if (need('benefit')) v.benefit = text(b.benefit, 160);
  if (need('desc')) v.desc = text(b.desc, 800);
  if (need('sourcing')) v.sourcing = text(b.sourcing, 300);
  if (need('safety')) v.safety = list(b.safety, 8, 60);
  if (need('emoji')) v.emoji = text(b.emoji, 8) || '🌿';
  if (need('bg')) v.bg = /^#[0-9a-fA-F]{6}$/.test(b.bg || '') ? b.bg : '#E7EFE9';
  if (has('stock')) {
    if (b.stock === null || b.stock === '') v.stock = null; // not tracked
    else {
      const n = Number(b.stock);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: 'Stock must be a whole number (or blank for “not tracked”).' };
      v.stock = n;
    }
  } else if (!partial) v.stock = null;
  if (has('active')) v.active = b.active === true || b.active === 'true' || b.active === 1;
  else if (!partial) v.active = true;
  if (has('sort_order')) { const n = Number(b.sort_order); if (Number.isInteger(n)) v.sort_order = n; }
  return { value: v };
}

module.exports = {
  text, email, isEmail, passwordError, profileFields, shipTo, cartItems, quizResult, routine, productInput, slugify,
  SKIN_TYPES, DOSHAS, SLOTS, TODS, CONCERNS,
};

# Kanti — Project Memory (read me first)

Kanti is a **personalized Ayurvedic skincare platform** (student project, SCAD Marketing, by
Uma Kaila). This file is the context for continuing the work in Claude Code.

## The two pillars (keep serving both in every feature)
- **Trust** — transparent ingredients, sourcing and safety on every product.
- **Fit** — personalized matching via a quiz → skin type + dosha → ingredient guidance → routine.

## What's in this repo
```
kanti/
├── CLAUDE.md                        ← this file
├── KANTI-ENHANCEMENT-BACKLOG.md     ← roadmap + paste-ready task prompts (build one at a time)
├── prototype/
│   └── kanti-prototype.html         ← the design prototype (single self-contained file)
├── backend/                         ← the real full-stack app (Node + Express + SQLite)
│   ├── src/ (server, db, auth, email, ai)   public/ (frontend pages)   README.md
└── deliverables/
    └── Kanti-Work-In-Progress.pptx  ← class presentation
```

## Two codebases, on purpose
1. **`prototype/kanti-prototype.html`** — the polished storefront UI. One self-contained HTML file,
   vanilla JS, in-memory + `localStorage` only. It was built to be published as a claude.ai artifact,
   which **cannot** run a server, use a database, send email, or hold secrets. That's why its
   accounts/orders use `localStorage` as a stopgap.
2. **`backend/`** — the real app: accounts, SQLite DB, email confirmations, AI quiz classification.
   Run it locally (see `backend/README.md`).

### ✅ Storefront ↔ backend (B2) + hardening (H1–H15), done
The real app is **`backend/public/index.html`** (storefront) + **`backend/public/api.js`** (client).
- Sessions are an **httpOnly cookie** — never put tokens in localStorage. `API.isAuthed()` reads a hint cookie.
- Sign in / up / forgot / reset are **views inside the storefront** (`go('signin')`), not separate pages.
- **Products live in the database** and are edited on the admin page (`/#admin`, only `ADMIN_EMAIL`).
  `backend/src/catalog.js` only seeds an empty DB. Prices are integer cents; never price in the browser.
- Frontend = `backend/public/js/*.js` (plain scripts, shared globals, no build). **No inline
  onclick/scripts** (CSP forbids them): use `data-go` / `data-act` + add the function to `ACTIONS` in
  `js/app.js`. Escape all data with `esc()`.
- Product images are **generated SVG bottles** (`backend/public/js/art.js`), not emoji or photos:
  packaging/texture/liquid colour come from the product data (admin can override). Keep it calm.
- Tests: `npm test` (API) and `npm run test:e2e` (Chrome) — run both before committing. Git is set up.
- Bag, quiz history and routine streak are saved to the account; DB schema changes go in
  `MIGRATIONS` in `backend/src/db.js` (append only).
- Run `npm test` in `backend/` after backend changes. Full API + table list: `backend/README.md`.
- **Two copies of the UI:** `prototype/kanti-prototype.html` = artifact-publishable design file
  (localStorage stopgap); `backend/public/index.html` = the real app. Port design changes across.

## Design conventions (don't drift)
- **Palette:** neem-green `#20453B` (brand), turmeric-gold `#B8862B`/`#C9972F` (accent),
  paper `#FAF8F3`, ink `#1C241F`. Dosha colors: Vata `#6E74AE`, Pitta `#C2663A`, Kapha `#4C7A4E`.
- **Logo:** the gold blossom on a neem-green tile. Source PNG `backend/public/img/kanti-logo.png`;
  vector copy `img/kanti-mark.svg` and an inline `<symbol id="kanti-mark">` in `index.html` (use it
  with `<svg><use href="#kanti-mark"/></svg>`). The opening splash in `index.html` animates its
  petals (CSS `.b-petal`), and `hideSplash()` in `js/app.js` removes it. Don't reuse keyframe names.
- **Fonts:** prototype uses Fraunces (display) + Hanken Grotesk (UI). Deck uses Cambria + Calibri.
- **Deliberately avoid** the generic "wellness beige + terracotta + serif" look.
- Prototype must stay **one self-contained file** unless we deliberately move it into `backend/public/`.
- Keep the quiz → results → cart → checkout flow working after any change.

## Backend quick facts (details in backend/README.md)
- `cd backend && npm install && cp .env.example .env && npm start` → http://localhost:3000 · `npm test`
- **Secrets live only in `backend/.env`** (gitignored). Never put `GEMINI_API_KEY` in any `public/`
  file or commit it. The AI falls back to rule-based classification when no key is set.
- Email: no SMTP configured = Ethereal preview inbox (prints a preview URL per email).
- DB: SQLite file `backend/kanti.db`, auto-created. Swap to Postgres for production.

## Status
- **Done (prototype):** quiz with culture+spice questions & fun fact, dosha+skin personalization,
  ordered AM/PM routine, trust layer, cart/checkout, results reveal animation, tap-to-learn dosha
  cards, ingredient tooltips, routine checklist + streak, share-result card, account page +
  order history, on-screen email preview.
- **Done (backend):** auth (bcrypt + JWT), SQLite schema, profile + orders endpoints, email
  confirmations, AI quiz endpoint (Gemini + fallback), basic frontend pages.
- **Done (integration, B2):** storefront wired to the API (see above); `PUT /api/me/skin`;
  `better-sqlite3` bumped to v12 (Node 20–26).
- **Done (hardening H1–H15):** see the H-table in the backlog.
- **Done (H16):** Gemini key set (model fallback chain, see README); real email via Gmail SMTP.
- **Done (R1–R12):** admin, data-driven shop, stock, order lifecycle, email outbox/verification,
  backups, logging, module split + strict CSP, E2E + CI, Docker/Render, privacy. Payments not done.
- **Done (A1–A12, 2026-11-11):** AI routine + "why" per product (`src/recommend.js`), Beyond Kanti
  outside products (`src/links.js` — never show an unchecked AI-written URL), profile chip, compare,
  wishlist, back-in-stock alerts, quiz resume, routine page + reminders + skin diary, Ask Kanti chat,
  phone layouts. Frontend: `js/reco.js`, `js/extras.js`, `js/routine.js`, `js/guide.js`. Not ported to the prototype.
- **Done (A13–A16):** logo + opening bloom; quiz "All of the above"/"Other"; before/after illustration
  (`js/skinsim.js`); reasons from `src/skin-science.js` — keep those hand-written (no AI, no invented
  stats/studies), and add an entry for any new ingredient.
- **Next:** E6, E7 (seasonal), E9 (reviews), E10; payments deliberately skipped.

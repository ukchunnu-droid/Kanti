# Kanti — Full-Stack App

The real Kanti Ayurvedic skincare store: the storefront UI plus a Node.js + Express server with
**accounts**, a **SQLite database** (profiles, saved bag, quiz history, routine streak, orders),
**email** (order confirmations, password resets) and **AI-powered quiz results**.

> **Why this is separate from `prototype/`:** the design prototype is one HTML file that can be
> published as an artifact, so it can't run a server, use a database, send email, or hold a secret.
> This folder is the working app. Design changes made in the prototype need to be carried over to
> `public/index.html` by hand (and vice versa).

---

## 1. Requirements

- **Node.js 20 or newer** — check with `node -v`. Get it from https://nodejs.org
- A terminal

## 2. Install

```bash
cd backend
npm install
```

> If `better-sqlite3` fails to install, make sure you're on Node 20+ and try again. On Windows you
> may need the "Desktop development with C++" build tools; on macOS, `xcode-select --install`.

## 3. Configure

```bash
cp .env.example .env
```

Then edit `.env`:

- **`JWT_SECRET`** — a long random string (32+ chars). The example file shows how to generate one.
- **`GEMINI_API_KEY`** *(optional)* — makes quiz results AI-driven. Blank = built-in rule-based
  classifier. Keep it in `.env` only. **`GEMINI_MODEL`** is a comma-separated list tried in order
  (default `gemini-flash-lite-latest,gemini-3.5-flash-lite`, 8s each); if all fail, the rules answer.
- **`SMTP_*`** *(optional)* — blank = a free Ethereal **test** inbox: emails are only viewable via a
  preview link and are **never delivered** to a real inbox. For real delivery with Gmail:
  `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<16-char App
  Password>` (needs 2-Step Verification), `MAIL_FROM=Kanti <you@gmail.com>`. Check it with
  `npm run test-email`.
- **`APP_URL`, `NODE_ENV`, `TRUST_PROXY`** — only matter when you deploy (see below).

> 🔐 Never commit `.env` or put keys in `public/` (that folder is sent to the browser).

## 4. Run & test

```bash
npm start        # → http://localhost:3000   (busy? PORT=3001 npm start)
npm run dev      # same, restarts on file changes
npm test         # API test suite — uses a throwaway database, never touches kanti.db
npm run test-email   # sends one real test email using your SMTP settings
```

Open the site and try the whole journey: take the quiz → add the routine to your bag → checkout
(you'll be asked to sign in or create an account, in-page, with your bag kept) → place the order →
see it in **Account**, with the confirmation email link, reorder, quiz history and settings.

---

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| Storefront | `public/index.html` + `public/api.js` | The full UI. All data goes through the `API` client. |
| Server & routes | `src/server.js` | Express. Security headers, rate limits, JSON errors. |
| Sessions | `src/auth.js` | httpOnly cookie (JWT). Changing/resetting a password signs out other devices. |
| Validation | `src/validate.js` | Every input is checked and length-limited on the server. |
| Database | `src/db.js` | SQLite with versioned **migrations** (an old `kanti.db` upgrades itself on start). Foreign keys on. |
| Product catalogue | `src/catalog.js` | **Single source of truth** for products and prices (integer cents) and the shipping rule. |
| Email | `src/email.js` | Order confirmation + password reset. User data is HTML-escaped. |
| AI quiz | `src/ai.js` | Gemini when a key is set, otherwise rule-based. Answers are sanitised first. |
| Tests | `test/api.test.js` | `npm test`. |

### Database tables

`users` · `products` · `orders` + `order_items` (prices snapshotted in cents, status
`placed/shipped/delivered/cancelled`, email preview link) · `quiz_results` (every quiz, newest
first) · `cart_items` (the saved bag) · `routine_progress` (checklist + streak) ·
`password_resets` (only a hash of each one-time token is stored).

### API

```
GET    /api/health
GET    /api/products                         → { products, shipping }

POST   /api/auth/signup   { name, email, password }        → sets session cookie
POST   /api/auth/login    { email, password }
POST   /api/auth/logout
POST   /api/auth/forgot   { email }                        → always { ok } (no account probing)
POST   /api/auth/reset    { token, password }              → signs in

GET    /api/me                                → { user, skin }   (skin = latest quiz result)
PATCH  /api/me            { any of name, phone, address, address2, city, state, zip, country }
POST   /api/me/password   { current, next }
DELETE /api/me            { password }        → deletes the account and all its data

GET    /api/cart | PUT /api/cart { items:[{id,qty}] } | POST /api/cart/merge { items }

POST   /api/quiz/classify { answers }         → result (+ saved to history when signed in)
POST   /api/quiz/results  { skinType, dosha, … }   (save a result from before signing in)
GET    /api/quiz/history

GET    /api/routine | PUT /api/routine { date, done, streak, lastComplete }

POST   /api/orders        { items:[{id,qty}], ship_to:{name,address,city,zip,…}, save_details }
GET    /api/orders | GET /api/orders/:order_no
```

Everything except products, health, quiz classify and the auth routes needs a signed-in session.
Order prices, shipping and totals are always worked out on the server from the catalogue —
whatever price a browser sends is ignored.

### What lives where in the browser

Nothing secret. The session cookie is httpOnly (page scripts can't read it); a `kanti_signed_in`
hint cookie only tells the UI someone is signed in. Signed out, the bag and last quiz result are
kept in `sessionStorage` (this tab) and the routine streak in `localStorage`; on sign-in they are
merged into the account. Signing out clears them from the device.

## Deploying (later)

- Hosts like **Render** or **Railway** run this directly (`npm install` + `npm start`).
- Set `NODE_ENV=production`, `APP_URL=https://your-domain`, `TRUST_PROXY=1`, a real `JWT_SECRET`,
  and SMTP settings in the host's dashboard — never in code.
- SQLite needs a **persistent disk**, or move `src/db.js` to **Postgres** for a managed database.

## Security notes

- Passwords: bcrypt hashes, 8+ characters. Login is rate-limited per email + IP; signup and
  password reset per IP (in-memory — use a shared store if you run several servers).
- Sessions: httpOnly, `SameSite=Lax` cookie (`Secure` in production), 30 days.
- No open CORS; CSP, `nosniff`, `X-Frame-Options` and (in production) HSTS headers are set.
- This is a student/demo project with **no real payments**: the demo card fields are checked in
  the browser and never sent to the server. Before taking real money, use a payment provider
  (e.g. Stripe Checkout), add email verification, and review everything above.

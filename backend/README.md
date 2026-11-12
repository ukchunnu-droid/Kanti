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
  The same key powers the AI routine, "Beyond Kanti" and the Ask Kanti chat (see below).
- **`BEYOND_RETAILERS`** *(optional)* — which shops "Beyond Kanti" links to (default
  `nykaa,amazon,sephora,ulta`; edit `src/links.js` to add more). **`BEYOND_ALLOWED_DOMAINS`** adds
  extra domains (e.g. brand sites) whose product pages may be shown after checking.
  **`GEMINI_SEARCH_MODEL`** picks the model for live Google Search (defaults to `GEMINI_MODEL`).
- **`SMTP_*`** *(optional)* — blank = a free Ethereal **test** inbox: emails are only viewable via a
  preview link and are **never delivered** to a real inbox. For real delivery with Gmail:
  `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<16-char App
  Password>` (needs 2-Step Verification), `MAIL_FROM=Kanti <you@gmail.com>`. Check it with
  `npm run test-email`.
- **`APP_URL`, `NODE_ENV`, `TRUST_PROXY`** — only matter when you deploy (see below).
- **Sessions** *(optional)*: `SESSION_IDLE_WARN_S` (default 300 = warn after 5 min idle), `SESSION_IDLE_GRACE_S`
  (default 120 = signed out 2 min later). "Remember me" keeps a session 30 days; otherwise until the browser closes (max 12 h).
- **Push** *(optional)*: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. If unset, keys are generated once and kept in the database.
- **`POPULAR_MIN_BUYERS`** (default 2): buyers needed in 7 days before a "Popular" badge shows (real orders only).

> 🔐 Never commit `.env` or put keys in `public/` (that folder is sent to the browser).

## 4. Run & test

```bash
npm start        # → http://localhost:3000   (busy? PORT=3001 npm start)
npm run dev      # same, restarts on file changes
npm test             # API tests — throwaway database, never touches kanti.db
npm run test:e2e     # browser test of every journey (needs Google Chrome; CHROME_PATH to override)
npm run test-email   # sends one real test email using your SMTP settings
npm run backup       # copy the database to backups/ now (safe while running)
npm run restore -- backups/<file>.db   # put a backup back (stop the server first)
```

**Admin:** set `ADMIN_EMAIL` in `.env` to your account's email, sign in, and an **Admin** link
appears in the header (`/#admin`): store numbers, add/edit/hide/delete products (with stock),
ship/deliver/cancel orders (customers are emailed), retry failed emails, and back up now.

Open the site and try the whole journey: take the quiz → add the routine to your bag → checkout
(you'll be asked to sign in or create an account, in-page, with your bag kept) → place the order →
see it in **Account**, with the confirmation email link, reorder, quiz history and settings.

---

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| Storefront | `public/index.html`, `public/css/kanti.css`, `public/js/*.js`, `public/api.js` | Plain scripts, no build step. No inline scripts/handlers: elements use `data-go` / `data-act` attributes handled in `js/app.js`. |
| Admin page | `public/js/admin.js` | Only shown to `ADMIN_EMAIL`; the server checks every admin request. |
| Product art | `public/js/art.js` + `.pa-*` in `kanti.css` | Animated SVG packaging drawn from the data: packaging from the routine step, contents from the product type, colour from the first ingredient. Admins can override all three (live preview). Thumbnails are still; reduced-motion users see no animation. |
| Server & routes | `src/server.js` | Express. Security headers, rate limits, JSON errors. |
| Sessions | `src/auth.js` | httpOnly cookie (JWT). Changing/resetting a password signs out other devices. |
| Validation | `src/validate.js` | Every input is checked and length-limited on the server. |
| Database | `src/db.js` | SQLite with versioned **migrations** (an old `kanti.db` upgrades itself on start). Foreign keys on. |
| Products | `products` table (edited on the admin page) | Source of truth for products, prices (integer cents) and stock. `src/catalog.js` only seeds an **empty** database and holds the shipping rule. |
| Email | `src/email.js` | Saved to an **outbox** table, then sent; failures retry (1m, 5m, 30m, 2h, 12h) then show as failed on the admin page. Order, shipping, cancellation, verification and reset emails. |
| Backups | `src/backup.js`, `scripts/` | Daily automatic copy, newest 14 kept in `backups/`. |
| Logging | `src/log.js` | JSON lines in production; every response has an `X-Request-Id`, quoted in error messages. Optional Sentry via `SENTRY_DSN`. |
| AI quiz | `src/ai.js` | Gemini when a key is set, otherwise rule-based. Answers are sanitised first. Shared helpers: `geminiJSON` (model chain + timeouts), `geminiSearch` (Google Search grounding over REST). |
| AI routine, Beyond Kanti, chat | `src/recommend.js` | Builds the routine from the live catalogue. Every AI answer is cleaned: unknown product ids dropped, wrong slots fixed, gaps filled from rules, text capped. Results cached in `ai_cache` (routine 3 days, outside products 7 days; the key includes the catalogue version, so product edits refresh it). |
| Reasons + before/after | `src/skin-science.js` | Fixed, hand-written scientific and Ayurvedic notes per ingredient and step (never AI-written, no invented numbers or studies), the dosha principle, and illustrative 1–9 scores for six skin measures, today vs week 8. Returned as `science` on `/api/recommend`. Add an entry when you add an ingredient (a test checks coverage). |
| Outside links | `src/links.js` | Retailer **search links** (always work) + **product pages** only after a check: https, approved retailer (every redirect hop too), page opens and its title names the product. |
| Tests | `test/api.test.js`, `test/e2e/` | `npm test`, `npm run test:e2e`; both run on GitHub Actions (`.github/workflows/ci.yml`). |

### Database tables

`users` (incl. `email_verified_at`) · `products` (category, stock, sort order) · `orders` +
`order_items` (prices snapshotted in cents; status `placed → shipped → delivered`, or
`cancelled`, which restocks; tracking number) · `quiz_results` · `cart_items` · `routine_progress`
· `email_outbox` · `email_verifications` / `password_resets` (only hashes of one-time tokens) ·
`app_meta` (e.g. last backup time, VAPID keys) · `sessions` (one row per signed-in browser) · `notifications` +
`notify_log` + `push_subscriptions` · `addresses` · `email_optouts` · `reviews` · `events` (anonymous analytics) ·
`tickets` + `ticket_messages` · `ai_cache` · `wishlist_items` · `stock_alerts` (one-time
back-in-stock emails) · `skin_diary` (one entry per user per day). Schema changes are migrations in `src/db.js` (append only).

### API

```
GET    /api/health
GET    /api/products                         → { products, shipping }

POST   /api/auth/signup   { name, email, password }        → sets session cookie
POST   /api/auth/login    { email, password }
POST   /api/auth/logout
POST   /api/auth/forgot   { email }                        → always { ok } (no account probing)
POST   /api/auth/reset    { token, password }              → signs in

POST   /api/auth/verify   { token }                        (link from the confirmation email)
POST   /api/auth/verify/resend

GET    /api/me                                → { user, skin }   (skin = latest quiz result)
GET    /api/me/export                         → JSON file of everything stored about you
PATCH  /api/me            { any of name, phone, address, address2, city, state, zip, country }
POST   /api/me/password   { current, next }
DELETE /api/me            { password }        → deletes the account and all its data

GET    /api/cart | PUT /api/cart { items:[{id,qty}] } | POST /api/cart/merge { items }

POST   /api/quiz/classify { answers }         → result (+ saved to history when signed in)
POST   /api/quiz/results  { skinType, dosha, … }   (save a result from before signing in)
GET    /api/quiz/history

GET    /api/routine | PUT /api/routine { date, done, streak, lastComplete }

POST   /api/recommend         { profile:{skin,dosha,concern,lookFor,avoid} }
       → { summary, am:[{id,slot,why}], pm, weekly, addons, skip, why:{id:text}, tips, change, source,
           science:{ metrics:[{key,label,before,after,helped_by,why}], focus, principle, skin_science, steps:{id:{science,ayurveda}}, note } }
POST   /api/recommend/beyond  { profile } → { items:[{title, why, ingredients, search:[{retailer,url}],
       products:[{name, kind:'page'|'search', url|links}]}], note, grounded, source }
POST   /api/search/beyond     { q, profile? } → { query, off_topic, message, kanti:[{id,why}], verdict?, items:[…as beyond], note }
       (with a profile: verdict + per-item fit — good / caution / avoid — with scientific and Ayurvedic reasons)
       (shop search for something Kanti doesn't carry: closest Kanti products + outside options; non-skincare politely declined)
POST   /api/guide             { messages:[{role:'user'|'guide', text}], profile } → { reply, products, followups,
       outside?:{query, verdict:{fit,why}, items:[…with fit, fit_why]}, needs_quiz? }
       (asking for products outside Kanti: needs a skin profile — without one the reply asks for the quiz first)

GET    /api/wishlist | PUT/DELETE /api/wishlist/:id | POST /api/wishlist/merge { items }
POST   /api/products/:id/notify { email }   (sold-out only; signed in uses the account email)
GET    /api/diary | PUT /api/diary/:YYYY-MM-DD { rating 1–5, tags, note } | DELETE /api/diary/:day

POST   /api/orders        { items:[{id,qty}], ship_to:{name,address,city,zip,…}, save_details }
GET    /api/orders | GET /api/orders/:order_no | POST /api/orders/:order_no/cancel   (until shipped)

GET    /api/session | POST /api/session/ping { active }        (inactivity: tabs report every ~30s)
GET    /api/me/sessions | DELETE /api/me/sessions/:id | POST /api/me/sessions/sign-out-others
GET    /api/live?tab=…                                          (Server-Sent Events: cart, wishlist, routine, diary,
                                                                 orders, products, notification, prefs, session)
GET    /api/notifications | POST /api/notifications/read { id? } | POST /api/push/subscribe|unsubscribe|test
GET/POST /api/me/addresses | PATCH/DELETE /api/me/addresses/:id | POST /api/me/addresses/:id/default
GET/PUT /api/me/email-prefs | GET+POST /api/email/unsubscribe?e&c&t  (signed one-click link in marketing emails)
PATCH  /api/me/prefs { lang, temp_unit, tz, reminders:{enabled,am,pm}, diary_nudge } | GET/PUT/DELETE /api/me/avatar
GET    /api/weather?lat&lon                                     (opt-in; rounded; Open-Meteo)
GET/POST /api/products/:id/reviews                               (POST → pending until approved)
POST   /api/track { anon_id, events:[{name, props}] }           (first-party anonymous analytics)
POST   /api/support/tickets | GET /api/support/tickets[/:ref] | POST /api/support/tickets/:ref/messages
GET/POST /api/support/access/:token[/messages]                   (guests, via the private emailed link)

# admin (ADMIN_EMAIL only)
GET    /api/admin/stats
GET    /api/admin/products | POST /api/admin/products | PATCH/DELETE /api/admin/products/:id
GET    /api/admin/orders?status= | PATCH /api/admin/orders/:order_no { status, tracking_no }
GET    /api/admin/emails | POST /api/admin/emails/retry | POST /api/admin/backup
POST   /api/admin/ai-cache/clear
GET    /api/admin/reviews?status= | PATCH /api/admin/reviews/:id { status }
GET    /api/admin/analytics?days=7|30|90
GET    /api/admin/tickets?status= | GET /api/admin/tickets/:ref | POST …/:ref/reply { message, close } | PATCH …/:ref { status }
POST   /api/admin/products/:id/announce                          (email opted-in customers + bell notification)
```

Stock is taken inside the order's database transaction, so two people can never buy the last
item; deleting a product that appears in past orders archives (hides) it instead.

Everything except products, health, quiz classify, recommend/beyond/guide, notify and the auth
routes needs a signed-in session. The AI routes have their own per-IP hourly limits
(`RATE_AI_MAX`, default 60; `RATE_GUIDE_MAX`, 40) because each call costs money.

**About outside product links:** Gemini makes up plausible but non-existent product URLs (we tested:
every Amazon link it wrote was a 404), so AI-written links are never shown unchecked. With a key
whose plan includes Google Search grounding, real product pages are found live and checked; on a
free-tier key that returns 429 for search, so Kanti shows the AI's named example products with a
retailer search for each, plus generic search links — every link works.
Order prices, shipping and totals are always worked out on the server from the catalogue —
whatever price a browser sends is ignored.

### What lives where in the browser

Nothing secret. The session cookie is httpOnly (page scripts can't read it); a `kanti_signed_in`
hint cookie only tells the UI someone is signed in. Signed out, the bag and last quiz result are
kept in `sessionStorage` (this tab) and the routine streak in `localStorage`; on sign-in they are
merged into the account. Signing out clears them from the device. Also in this browser only:
a half-finished quiz (`localStorage`, 7 days), saved products while signed out (merged on
sign-in), reminder times, the compare tray and the Ask Kanti conversation (`sessionStorage`).

## Deploying

- **Docker:** `backend/Dockerfile` builds a production image; mount a volume at `/data` (database +
  backups live there). It has a health check on `/api/health`.
- **Render:** `render.yaml` at the repo root is a one-click Blueprint (Docker + 1 GB persistent
  disk + HTTPS). Fill in `APP_URL`, `ADMIN_EMAIL`, SMTP and Gemini values in the dashboard.
- **Netlify address (optional):** Netlify can't run the server (it needs a long-running process and
  a database file), so `netlify.toml` makes Netlify serve `backend/public` and pass `/api/*` through
  to the Render server. In Netlify set `BACKEND_URL=https://<your-app>.onrender.com`; on Render set
  `APP_URL=https://<your-site>.netlify.app` (email links) and `TRUST_PROXY=2`.
- Production needs `NODE_ENV=production`, `APP_URL=https://your-domain` (the server refuses to start
  without it), `TRUST_PROXY=1`, a real `JWT_SECRET` — set in the host's dashboard, never in code.
- SQLite on a persistent disk is fine for a store this size. Move `src/db.js` to Postgres only if
  you need several servers at once.
- **Uptime:** point a free monitor (e.g. UptimeRobot) at `https://your-domain/api/health`.
- **Email at scale:** Gmail allows ~500 emails/day and often lands in spam. For a real launch use a
  transactional provider (Resend, Brevo, Postmark) with your own domain and SPF/DKIM — it's only a
  change of `SMTP_*` values.

## Security notes

- Passwords: bcrypt hashes, 8+ characters. Login is rate-limited per email + IP; signup and
  password reset per IP (in-memory — use a shared store if you run several servers).
- Sessions: httpOnly, `SameSite=Lax` cookie (`Secure` in production), 30 days.
- No open CORS; CSP, `nosniff`, `X-Frame-Options` and (in production) HSTS headers are set.
- This is a student/demo project with **no real payments**: the demo card fields are checked in
  the browser and never sent to the server. Before taking real money, use a payment provider
  (e.g. Stripe Checkout), add email verification, and review everything above.

# Kanti — Enhancement Backlog

Build these **one at a time**. For each to-do item, paste its prompt into Claude Code, review, then
mark it done here.

**Golden rule for prototype changes:** keep the quiz → results → cart → checkout flow working, keep
the neem-green/turmeric-gold theme, and keep `prototype/kanti-prototype.html` self-contained (unless
we deliberately move it into `backend/public/`).

## Status: ✅ done · ⬜ to do · ⭐ high priority

| ID | Enhancement | Status |
|----|-------------|--------|
| E0 | Culture + spice quiz questions & fun fact | ✅ |
| E1 | Results reveal animation | ✅ |
| E2 | Tap-to-learn dosha cards ⭐ | ✅ |
| E3 | Ingredient tooltips | ✅ |
| E4 | Share-your-result card | ✅ |
| E5 | Routine checklist / daily streak ⭐ | ✅ |
| E6 | Save & retake comparison | ⬜ |
| E7 | Seasonal recommendations (ritucharya) ⭐ | ⬜ |
| E8 | Wishlist / favourites | ✅ (A-series) |
| E9 | Product reviews & ratings | ⬜ |
| E10 | Mock "skin scan" (photo) | ⬜ |
| E11 | Ask an Ayurvedic guide (chat) | ✅ (A-series) |
| E12 | Skin diary / progress tracking | ✅ (A-series) |
| E13 | Account / profile page (prototype) | ✅ |
| E14 | Order-confirmation email preview (prototype) | ✅ |
| **B1** | **Backend: auth + SQLite + email + AI quiz** | ✅ (in `backend/`) |
| **B2** | **Wire storefront prototype to the backend API** ⭐ | ✅ |

---

## Hardening plan (H-series) — build in order, before new E-features
Agreed 2026-11-10; H1–H15 done the same day (`npm test` in `backend/` covers them). **Gemini key + model update is deliberately LAST (H16).**

| ID | Fix | Status |
|----|-----|--------|
| H1 | Safety net: API test suite, configurable DB path (`DB_FILE`) | ✅ |
| H2 | DB migrations (`user_version`) + foreign keys ON | ✅ |
| H3 | Sessions & auth hygiene: httpOnly cookie session (no token in localStorage), lower-case emails, password ≥ 8, field length limits, partial profile updates, one JWT helper, prod secret guard, auth rate limit, JSON errors, no open CORS, security headers, `/api/health` | ✅ |
| H4 | Escape user data in email HTML | ✅ |
| H5 | Product catalogue on the server (`GET /api/products`); storefront loads it | ✅ |
| H6 | Server-side pricing in cents, validated items, one shipping rule, unique order numbers | ✅ |
| H7 | Orders: `order_items` table, status, stored email link, order detail + reorder, email doesn't block checkout | ✅ |
| H8 | Bag saved to the account, merged on sign-in | ✅ |
| H9 | Full quiz history saved (enables E6) | ✅ |
| H10 | Routine streak saved to the account | ✅ |
| H11 | Fuller account: address line 2/state/country, change password, delete account | ✅ |
| H12 | Sign in/up inside the storefront, header shows auth state; remove old debug pages + duplicate quiz; favicon | ✅ |
| H13 | Checkout form: autocomplete, per-field errors, demo-card format checks (never sent) | ✅ |
| H14 | Forgot / reset password by email | ✅ |
| H15 | Docs | ✅ |
| H16 | **Last:** Gemini key + current model name | ✅ |

## Robustness plan (R-series) — done 2026-11-10
| ID | Fix | Status |
|----|-----|--------|
| R1 | Git repository + commits per milestone | ✅ |
| R2 | Admin product manager (DB is the source of truth) | ✅ |
| R3 | Data-driven shop: search, sort, facets with counts | ✅ |
| R4 | Stock + sold-out, no overselling | ✅ |
| R5 | Order lifecycle (ship/deliver/cancel) + status emails | ✅ |
| R6 | Email outbox with retries; signup email verification | ✅ |
| R7 | Daily backups + restore script | ✅ |
| R8 | Request ids, JSON logs, optional Sentry, graceful shutdown | ✅ |
| R9 | Frontend split into modules; no inline scripts (strict CSP) | ✅ |
| R10 | Browser E2E in repo + GitHub Actions CI | ✅ |
| R11 | Dockerfile + Render blueprint; production config guard | ✅ |
| R12 | Privacy page + "Download my data" | ✅ |
| — | Payments (Stripe) — deliberately not done | ⬜ |

## AI personalisation + usability (A-series) — done 2026-11-11
Live in `backend/` (not ported to the prototype). Tests: 44 API + 12 e2e checks.

| ID | Feature | Status |
|----|---------|--------|
| A1 | AI routine: Gemini picks real catalogue products per step with a personal "why"; add-ons, "probably skip", tips, what-changed-since-last-quiz; cached; rules fallback | ✅ |
| A2 | "Why this suits you" on every card/modal; "Picked for you" on shop + home | ✅ |
| A3 | Beyond Kanti: outside product types + retailer search links (option 1) + live-search product pages, only shown after checking (option 2; needs a key with Search grounding quota) | ✅ |
| A4 | Header profile chip; shop opens on "Best match" | ✅ |
| A5 | Add whole routine with total; bag "completes your routine" + free-shipping nudge | ✅ |
| A6 | Quiz resumes after refresh (7 days) with "Start over" | ✅ |
| A7 | Compare up to 3 (tray + side-by-side table, best fit highlighted) | ✅ |
| A8 | Wishlist (account + signed-out, merged) and back-in-stock email alerts (one-time) | ✅ |
| A9 | Empty search: "remove this filter → N products" + typo-tolerant closest matches | ✅ |
| A10 | My routine page: checklist, calendar reminders (.ics), skin diary with 30-day chart | ✅ |
| A11 | Ask Kanti chat (profile- and catalogue-aware, product cards, follow-ups) | ✅ |
| A12 | Phones: bottom-sheet filters, sticky add-to-bag, compact header | ✅ |
| A13 | Kanti blossom logo + opening bloom animation | ✅ |
| A14 | Quiz: "All of the above" + "Other" (own words, read by AI and keyword fallback) on every question | ✅ |
| A15 | Before/after skin illustration (8-week timeline, drag to compare, skin tones) + comparison chart | ✅ |
| A16 | "Why this routine works": fixed scientific + Ayurvedic reasons per step (`src/skin-science.js`) | ✅ |
| A17 | Shop search falls back to “Beyond Kanti” (AI: closest Kanti products + outside links, options 1+2) | ✅ |
| A18 | Ask Kanti finds products outside Kanti with a fit verdict for your skin + dosha; asks for the quiz first if no profile | ✅ |
| C1 | Inactivity sign-out (5 min warning + 2 min countdown, server-enforced, all tabs in sync) | ✅ |
| C2 | "Remember me" (30 days) vs browser-session sign-in | ✅ |
| C3 | Devices & sessions list, sign out one/all others | ✅ |
| C4 | Live sync across tabs/devices (SSE): bag, saved, routine, diary, orders, stock | ✅ |
| C5 | Notification bell + device push notifications + reminders in your time zone | ✅ |
| C6 | Home that changes: time-of-day greeting, ritucharya season, opt-in weather tips, daily tip | ✅ |
| C7 | Continue where you left off + recently viewed; “New” and real “Popular” badges | ✅ |
| C8 | Address book (default, used at checkout) | ✅ |
| C9 | Email preferences + signed one-click unsubscribe (List-Unsubscribe) | ✅ |
| C10 | Skin journey (quiz changes + diary chart with routine-change markers) — E6 | ✅ |
| C11 | Reviews & ratings: moderation, verified purchase, filter by dosha — E9 | ✅ |
| C12 | Profile photo; preferences: language (English/हिन्दी, site chrome) and °C/°F | ✅ |
| C13 | Analytics dashboard: funnel, top searches, wanted-but-not-sold | ✅ |
| C14 | Support inbox: contact form, tickets tied to orders, email replies, guest private links | ✅ |

## Priority next

### B2 · Wire the storefront to the backend ⭐ — ✅ done (2026-11-10)
Done: storefront now lives at `backend/public/index.html`; see "The storefront ↔ API wiring" in
`backend/README.md`. Original brief: Serve `prototype/kanti-prototype.html` from `backend/public/` and replace its `localStorage` logic
with the `API.*` client (`backend/public/api.js`): `API.classify` after the quiz, `API.createOrder`
at checkout, `API.me/updateMe/orders` on the account page, and gate checkout/account behind
`API.isAuthed()`. This turns the pretty prototype into the real app.

### E7 · Seasonal recommendations (ritucharya) ⭐
Add a Summer / Monsoon / Winter toggle on the results page that adjusts guidance and product picks to
suit the season for the user's dosha (lighter/cooling in summer, richer/warming in winter).

---

## Remaining to-do prompts

- **E6 — Save & retake comparison:** on retake show "last time X → now Y". The data is ready:
  `GET /api/quiz/history` (signed in) returns every past result.
- **E8 — Wishlist/favourites:** heart toggle on product cards + a wishlist view.
- **E9 — Reviews & ratings:** star averages on cards + sample reviews in the product modal.
- **E10 — Mock skin scan:** optional selfie upload → clearly-labelled *simulated* analysis feeding
  the profile.
- **E11 — Ask an Ayurvedic guide:** scripted Q&A in the prototype; a real AI version belongs in the
  backend (new endpoint) once B2 is done.
- **E12 — Skin diary:** dated notes (+ optional photo) with a timeline.

## Beyond features — project polish
- Replace mock brand/products/prices/photography with real content.
- Usability testing with young-adult users.
- Expand the catalogue; consider a true multi-brand marketplace.
- Accessibility + mobile polish.
- Source (or soften) the market stats used in the deck.

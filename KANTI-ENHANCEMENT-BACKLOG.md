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
| E8 | Wishlist / favourites | ⬜ |
| E9 | Product reviews & ratings | ⬜ |
| E10 | Mock "skin scan" (photo) | ⬜ |
| E11 | Ask an Ayurvedic guide (chat) | ⬜ |
| E12 | Skin diary / progress tracking | ⬜ |
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

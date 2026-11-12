// Kanti storefront — reviews.js
// Product reviews in the product window: rating summary, "verified purchase" badges, filter by
// dosha, and writing a review (held for the admin to approve). Plus the admin moderation tab.

state.rev = { id: null, data: null, dosha: null, writing: false, rating: 0 };
function reviewsSectionHTML(p) {
  const R = state.rev;
  if (R.id !== p.id) { R.id = p.id; R.data = null; R.dosha = null; R.writing = false; R.rating = 0; loadReviews(); }
  if (!R.data) return `<section class="reviews" id="reviewsBox"><h3>${t('Reviews')}</h3><p class="muted-p pulse">Loading reviews…</p></section>`;
  const { summary: s, reviews, mine, can_verify } = R.data;
  const my = state.profile && state.profile.dosha;
  const pill = (k, label, n) => `<button class="pill ${R.dosha === k ? 'active' : ''}" data-act="revFilter" data-arg="${k || ''}">${label}${n != null ? ` <span class="pill-n">${n}</span>` : ''}</button>`;
  return `<section class="reviews" id="reviewsBox">
    <div class="rev-head"><h3>${t('Reviews')}</h3>${s.count ? starsHTML(s.avg, s.count) : '<small class="muted-p">No reviews yet</small>'}</div>
    ${s.count ? `<div class="rev-dist">${[5, 4, 3, 2, 1].map((k) => `<div><span>${k}★</span><i style="--w:${s.count ? (s.dist[k] / s.count) * 100 : 0}%"></i><small>${s.dist[k]}</small></div>`).join('')}</div>
      <div class="filters rev-filters">${pill(null, 'All', s.count)}${['vata', 'pitta', 'kapha'].map((d) => pill(d, `${DOSHA[d].name}${d === my ? ' (you)' : ''}`, s.byDosha[d] || 0)).join('')}</div>` : ''}
    <div class="rev-list">${reviews.length ? reviews.map((r) => `<article class="rev">
      <div class="rev-top">${starsHTML(r.rating, 1, true).replace(/<small>.*<\/small>/, '')}<b>${esc(r.title || '')}</b></div>
      <p>${esc(r.body)}</p>
      <small class="rev-meta">${esc(r.author)}${r.verified ? ' · <span class="verified">✓ Verified purchase</span>' : ''}${r.dosha ? ` · ${esc(doshaLabel(r.dosha))}` : ''}${r.skin ? `, ${esc(skinLabel(r.skin).toLowerCase())} skin` : ''} · ${fmtDate(r.created_at)}</small>
    </article>`).join('') : (s.count ? '<p class="muted-p">No reviews from that dosha yet.</p>' : '<p class="muted-p">Be the first to review this.</p>')}</div>
    ${API.isAuthed() ? (R.writing ? reviewFormHTML(mine, can_verify)
      : `<button class="btn btn-ghost btn-sm" data-act="revWrite">${mine ? 'Edit your review' : 'Write a review'}</button>${mine ? ` <small class="muted-p">Yours is ${mine.status === 'approved' ? 'published' : mine.status === 'pending' ? 'waiting for approval' : 'not published'}.</small>` : ''}`)
      : '<p class="muted-p"><button class="link-btn" data-act="revSignIn">Sign in</button> to write a review.</p>'}
  </section>`;
}
function reviewFormHTML(mine, verified) {
  const R = state.rev; if (!R.rating && mine) R.rating = mine.rating;
  return `<form class="rev-form" novalidate data-submit="revSubmit">
    <div class="form-msg" id="revMsg" role="alert"></div>
    <div class="star-pick" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${n <= R.rating ? 'on' : ''}" role="radio" aria-checked="${n === R.rating}" aria-label="${n} star${n > 1 ? 's' : ''}" data-act="revRate" data-arg="${n}">★</button>`).join('')}</div>
    <input id="revTitle" maxlength="80" placeholder="Headline (optional)" value="${esc(mine ? mine.title : '')}">
    <textarea id="revBody" rows="3" maxlength="1500" placeholder="How did it work for your skin?">${esc(mine ? mine.body : '')}</textarea>
    <small class="muted-p">${verified ? '✓ You bought this — your review gets a “Verified purchase” badge. ' : ''}Your first name, last initial, skin type and dosha are shown. Reviews are checked before they appear.</small>
    <div style="display:flex;gap:10px;margin-top:8px"><button class="btn btn-primary btn-sm" id="revBtn">Submit review</button><button type="button" class="btn btn-ghost btn-sm" data-act="revCancel">Cancel</button></div>
  </form>`;
}
async function loadReviews() {
  const id = state.rev.id;
  try { const d = await API.reviews(id, state.rev.dosha); if (state.rev.id === id) state.rev.data = d; }
  catch (e) { if (state.rev.id === id) state.rev.data = { summary: { count: 0, dist: {}, byDosha: {} }, reviews: [], mine: null }; }
  paintReviews();
}
function paintReviews() { const box = $('#reviewsBox'), p = prod(state.rev.id); if (box && p) box.outerHTML = reviewsSectionHTML(p); }
function revFilter(k) { state.rev.dosha = k || null; loadReviews(); }
function revWrite() { state.rev.writing = true; paintReviews(); const t2 = $('#revBody'); if (t2) t2.focus(); }
function revCancel() { state.rev.writing = false; paintReviews(); }
function revRate(n) {
  state.rev.rating = Number(n);
  document.querySelectorAll('.star-pick button').forEach((b, i) => { b.classList.toggle('on', i < n); b.setAttribute('aria-checked', i + 1 === Number(n)); });
}
function revSignIn() { closeModal(); state.next = 'shop'; go('signin'); }
async function revSubmit() {
  const R = state.rev, msg = $('#revMsg');
  if (!R.rating) { msg.className = 'form-msg err'; msg.textContent = 'Choose a star rating.'; return; }
  try {
    await API.writeReview(R.id, { rating: R.rating, title: $('#revTitle').value, body: $('#revBody').value });
    R.writing = false; toast('Thanks! Your review will appear once it’s approved.'); loadReviews();
  } catch (e) { msg.className = 'form-msg err'; msg.textContent = e.message; }
}

/* ---------- Admin: moderation ---------- */
function adminReviewsHTML() {
  const list = state.admin.reviews || [], f = state.admin.reviewFilter || 'pending';
  return `<div class="admin-bar"><div class="filters">${['pending', 'approved', 'rejected', ''].map((k) => `<button class="pill ${f === k ? 'active' : ''}" data-act="adminReviewFilter" data-arg="${k}">${k || 'All'}</button>`).join('')}</div></div>
    ${list.length ? list.map((r) => `<div class="acct-card mod">
      <div class="acct-card-head"><div><b>${esc(r.product_name)}</b> ${starsHTML(r.rating, 1, true).replace(/<small>.*<\/small>/, '')}</div><span class="status-pill r-${esc(r.status)}">${esc(r.status)}</span></div>
      ${r.title ? `<b>${esc(r.title)}</b>` : ''}<p>${esc(r.body)}</p>
      <small class="muted-p">${esc(r.name)} (${esc(r.email)}) · ${r.verified ? '✓ verified purchase' : 'not a verified buyer'} · ${esc(r.dosha || '–')} · ${fmtDate(r.created_at)}</small>
      <div class="order-actions">${r.status !== 'approved' ? `<button class="btn btn-primary btn-sm" data-act="adminModerate" data-arg="${r.id}" data-arg2="approved">Approve</button>` : ''}
        ${r.status !== 'rejected' ? `<button class="btn btn-ghost btn-sm" data-act="adminModerate" data-arg="${r.id}" data-arg2="rejected">Reject</button>` : ''}</div>
    </div>`).join('') : '<div class="empty-state"><div class="big">⭐</div><p>No reviews here.</p></div>'}`;
}
function adminReviewFilter(k) { state.admin.reviewFilter = k; state.admin.reviews = null; renderAdmin(); }
async function adminModerate(id, status) {
  try { await API.admin.moderateReview(id, status); toast(status === 'approved' ? 'Review published' : 'Review rejected'); state.admin.reviews = null; renderAdmin(); }
  catch (e) { toast(e.message); }
}

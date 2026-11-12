// Kanti storefront — reco.js
// AI recommendations from the server (POST /api/recommend): the routine, a "why" for every product,
// add-ons, products to skip and tips. Until they arrive (or if the server can't reach the AI) the
// local rules in views.js are used, so nothing ever waits on the AI to work.
// Also: "Beyond Kanti" (outside products with links), bag suggestions and the header profile chip.

const profileKey = (p) => (p ? [p.skin, p.dosha, p.concern || '', p.note || ''].join('|') : '');
state.reco = { key: '', data: null, pending: null };
state.beyond = { key: '', data: null, pending: null, error: null };

// The AI result for the current profile, or null.
function recoNow() {
  const r = state.reco;
  return state.profile && r.data && r.key === profileKey(state.profile) ? r.data : null;
}
function recoProfile(p) {
  return { skin: p.skin, dosha: p.dosha, concern: p.concern || null, lookFor: p.lookFor || [], avoid: p.avoid || [], note: p.note || '' };
}
// Starts loading recommendations for the current profile (once). Resolves when done.
function loadReco() {
  const p = state.profile; if (!p) return Promise.resolve(null);
  const key = profileKey(p), r = state.reco;
  if (r.key === key && (r.data || r.pending)) return r.pending || Promise.resolve(r.data);
  r.key = key; r.data = null;
  if (state.sim) Object.assign(state.sim, { t: 0, pos: 0, played: false }); // new profile → play the before/after again
  r.pending = API.recommend(recoProfile(p))
    .then((d) => { if (state.reco.key === key) { r.data = d; stashReco(); } return d; })
    .catch(() => null)
    .finally(() => { if (state.reco.key === key) r.pending = null; });
  return r.pending;
}
// Called after recommendations arrive while the shopper is looking at a page that uses them.
function refreshForReco() {
  if (['results', 'shop', 'home', 'routine', 'compare', 'saved'].includes(state.view)) {
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }
  updateProfileChip();
}
function ensureReco() {
  if (!state.profile || recoNow() || state.reco.pending) return;
  loadReco().then((d) => { if (d) refreshForReco(); });
}
function stashReco() { try { sessionStorage.setItem('kanti_reco', JSON.stringify({ key: state.reco.key, data: state.reco.data })); } catch (e) {} }
function restoreReco() {
  try {
    const d = JSON.parse(sessionStorage.getItem('kanti_reco') || 'null');
    if (d && d.data && d.key === profileKey(state.profile)) { state.reco.key = d.key; state.reco.data = d.data; }
  } catch (e) {}
}

// "Why this suits you" for any product (AI text when available, else the rule-based reason).
function whyFor(id) {
  const r = recoNow();
  if (r && r.why && r.why[id]) return r.why[id];
  const p = prod(id);
  if (!state.profile || !p) return '';
  const bits = [];
  if ((p.dosha || []).includes(state.profile.dosha)) bits.push('balances ' + DOSHA[state.profile.dosha].name);
  if ((p.skin || []).includes(state.profile.skin)) bits.push('made for ' + SKIN_LABEL[state.profile.skin].toLowerCase() + ' skin');
  return bits.length ? bits.join(' · ').replace(/^./, (c) => c.toUpperCase()) : '';
}
const isSkip = (id) => { const r = recoNow(); return !!(r && (r.skip || []).some((s) => s.id === id)); };

// Every product in the routine (AM + PM + weekly), no repeats.
function routineIds(prof) {
  prof = prof || state.profile; if (!prof) return [];
  const ids = new Set();
  buildRoutine(prof, 'AM').forEach((s) => ids.add(s.p.id));
  buildRoutine(prof, 'PM').forEach((s) => ids.add(s.p.id));
  const wk = weeklyStep(prof); if (wk) ids.add(wk.p.id);
  return [...ids];
}
function weeklyStep(prof) {
  const r = recoNow();
  if (r && r.weekly && prod(r.weekly.id)) return { slot: 'Weekly', p: prod(r.weekly.id), why: r.weekly.why };
  const p = pickForSlot('Weekly', prof);
  return p ? { slot: 'Weekly', p, why: whyFor(p.id) } : null;
}

/* ---------- Results page: the AI sections ---------- */
function recoStatusHTML() {
  if (recoNow()) {
    const r = recoNow();
    return r.source === 'gemini' ? '<div class="src-note">✦ Routine written for you by Kanti AI</div>' : '';
  }
  return state.reco.pending ? '<div class="src-note pulse">✦ Kanti AI is tailoring your routine…</div>' : '';
}
function recoIntroHTML() {
  const r = recoNow(); if (!r) return '';
  return `${r.change ? `<div class="change-note">↻ ${esc(r.change)}</div>` : ''}
    ${r.summary ? `<p class="reco-summary">${esc(r.summary)}</p>` : ''}`;
}
function tipsHTML() {
  const r = recoNow(); if (!r || !(r.tips || []).length) return '';
  return `<div class="tips-card"><h3>Little habits that help</h3><ul>${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}
function miniCardHTML(id, why, kind) {
  const p = prod(id); if (!p) return '';
  return `<div class="mini-card ${kind || ''}" data-act="openModal" data-arg="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} — details">
    <div class="mini-thumb" style="background:${esc(p.bg)}">${productArt(p, 'thumb')}</div>
    <div class="mini-body"><b>${esc(p.name)}</b><small>${esc(why || p.benefit)}</small>
      <span class="mini-foot"><span class="price">${money(p.price)}</span>${stockBadge(p)}</span></div>
    ${kind === 'skip' ? '' : `<button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}" ${soldOut(p) ? 'disabled' : ''}>Add</button>`}
  </div>`;
}
function addonsHTML() {
  const r = recoNow(); if (!r) return '';
  const add = (r.addons || []).filter((a) => prod(a.id));
  const skip = (r.skip || []).filter((a) => prod(a.id));
  return `${add.length ? `<div class="routine-head" style="margin-top:36px"><h2>Good add-ons for you</h2></div>
      <div class="mini-grid">${add.map((a) => miniCardHTML(a.id, a.why)).join('')}</div>` : ''}
    ${skip.length ? `<details class="skip-box"><summary>Probably skip <small>(${skip.length}) — not the best fit for you</small></summary>
      <div class="mini-grid">${skip.map((a) => miniCardHTML(a.id, a.why, 'skip')).join('')}</div></details>` : ''}`;
}
function routineTotal(prof) {
  const ids = routineIds(prof).filter((id) => !soldOut(prod(id)));
  return { n: ids.length, cents: ids.reduce((s, id) => s + prod(id).price_cents, 0) };
}

/* ---------- Beyond Kanti ---------- */
const safeHref = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? esc(u) : null);
function loadBeyond() {
  const p = state.profile; if (!p) return;
  const key = profileKey(p), b = state.beyond;
  if (b.key === key && (b.data || b.pending)) return;
  b.key = key; b.data = null; b.error = null;
  b.pending = API.beyond(recoProfile(p))
    .then((d) => { if (state.beyond.key === key) b.data = d; })
    .catch((e) => { if (state.beyond.key === key) b.error = e.message; })
    .finally(() => {
      if (state.beyond.key !== key) return;
      b.pending = null;
      const box = document.getElementById('beyondBox'); if (box) box.innerHTML = beyondInnerHTML();
    });
}
function beyondHTML() {
  if (!state.profile) return '';
  loadBeyond();
  return `<section class="beyond" aria-labelledby="beyondTitle">
    <div class="routine-head" style="margin-top:44px"><div><div class="eyebrow">Beyond Kanti</div><h2 id="beyondTitle">Other things worth knowing about</h2></div></div>
    <p class="routine-hint">Kanti doesn’t make everything. These outside products suit your ${esc(SKIN_LABEL[state.profile.skin].toLowerCase())} skin and ${esc(DOSHA[state.profile.dosha].name)} nature. Links open other shops.</p>
    <div id="beyondBox">${beyondInnerHTML()}</div>
  </section>`;
}
function beyondInnerHTML() {
  const b = state.beyond;
  if (b.pending || (!b.data && !b.error)) {
    return `<div class="beyond-grid">${[0, 1, 2].map(() => '<div class="beyond-card skeleton"><span></span><span></span><span></span></div>').join('')}</div>
      <p class="muted-p pulse">✦ Finding outside products that suit you — this can take a few seconds…</p>`;
  }
  if (b.error || !b.data || !(b.data.items || []).length) {
    return `<p class="muted-p">Couldn’t load outside suggestions right now. <button class="link-btn" data-act="retryBeyond">Try again</button></p>`;
  }
  return beyondCardsHTML(b.data);
}
// Outside-product cards (used by the results page and the shop search).
function beyondCardsHTML(d) {
  if (!d || !(d.items || []).length) return '';
  return `<div class="beyond-grid">${d.items.map((it) => `
    <article class="beyond-card">
      <span class="beyond-tag">Not sold by Kanti</span>
      <h3>${esc(it.title)}</h3>
      <p>${esc(it.why)}</p>
      ${(it.ingredients || []).length ? `<div class="chips">${it.ingredients.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>` : ''}
      ${(it.products || []).length ? `<div class="beyond-products"><small>Examples</small>${it.products.map(beyondProductHTML).join('')}</div>` : ''}
      <div class="beyond-search"><small>Search for this at</small>
        ${(it.search || []).map((s) => { const h = safeHref(s.url); return h ? `<a href="${h}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.retailer)} ↗</a>` : ''; }).join('')}
      </div>
    </article>`).join('')}</div>
    <p class="beyond-note">ⓘ ${esc(d.note)}${d.source === 'gemini' ? ' Suggestions by Kanti AI.' : ''}${d.grounded ? ' Product pages found with live search and checked before showing.' : ''}</p>`;
}
function beyondProductHTML(p) {
  if (p.kind === 'page') {
    const h = safeHref(p.url);
    return h ? `<a class="bp verified" href="${h}" target="_blank" rel="noopener noreferrer nofollow"><b>${esc(p.name)}</b><span>✓ ${esc(p.retailer)} ↗</span></a>` : '';
  }
  return `<div class="bp"><b>${esc(p.name)}</b><span>${(p.links || []).map((l) => { const h = safeHref(l.url); return h ? `<a href="${h}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.retailer)} ↗</a>` : ''; }).join(' · ')}</span></div>`;
}
function retryBeyond() { state.beyond.key = ''; const box = $('#beyondBox'); loadBeyond(); if (box) box.innerHTML = beyondInnerHTML(); }

/* ---------- Bag: "completes your routine" ---------- */
function bagSuggestionsHTML() {
  if (!state.profile) {
    return `<div class="bag-suggest"><small>Not sure what goes together?</small>
      <button class="link-btn" data-go="quiz">Take the 2-minute quiz</button> for a routine that fits you.</div>`;
  }
  const inBag = new Set(state.cart.map((c) => c.id));
  const steps = [...buildRoutine(state.profile, 'AM'), ...buildRoutine(state.profile, 'PM')];
  const wk = weeklyStep(state.profile); if (wk) steps.push(wk);
  const seen = new Set();
  const missing = steps.filter((s) => !inBag.has(s.p.id) && !soldOut(s.p) && !seen.has(s.p.id) && seen.add(s.p.id));
  if (!missing.length) return state.cart.length ? '<div class="bag-suggest ok">✓ Your bag covers your whole routine.</div>' : '';
  const n = missing.length;
  return `<div class="bag-suggest">
    <small>${state.cart.length ? `Completes your routine (${n} step${n === 1 ? '' : 's'} missing)` : 'Your routine'}</small>
    ${missing.slice(0, 3).map((s) => `<div class="bs-line">
      <div class="thumb sm" style="background:${esc(s.p.bg)}">${productArt(s.p, 'thumb')}</div>
      <div><b>${esc(s.p.name)}</b><span>${esc(s.slot)} · ${money(s.p.price)}</span></div>
      <button class="btn btn-ghost btn-sm" data-act="addFromBag" data-arg="${esc(s.p.id)}">Add</button></div>`).join('')}
    ${n > 1 ? `<button class="link-btn" data-act="addWholeRoutine">Add all ${n} missing</button>` : ''}
  </div>`;
}
function addFromBag(id) { if (addToCart(id, true)) { toast(prod(id).name + ' added'); renderDrawer(); } }

/* ---------- Header profile chip ---------- */
function updateProfileChip() {
  const c = $('#profileChip'), p = state.profile, r = $('#navRoutine'), q = $('#navQuiz');
  if (c) {
    c.classList.toggle('hidden', !p);
    if (p) { c.innerHTML = `<span class="dosha-dot" style="background:${DOSHA[p.dosha].color}"></span>${esc(DOSHA[p.dosha].name)} · ${esc(SKIN_LABEL[p.skin])}`; }
  }
  if (r) r.classList.toggle('hidden', !p);
  if (q) q.textContent = p ? 'Retake quiz' : 'Find your routine';
}

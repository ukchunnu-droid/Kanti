// Kanti storefront — analytics.js
// First-party, anonymous analytics: a random id kept in this browser, what happened (e.g. "quiz_start")
// and a few details. Nothing goes to third parties; "Do Not Track" turns it off. Plus the admin dashboard.

const AID = (() => {
  try {
    let a = localStorage.getItem('kanti_aid');
    if (!a) { a = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem('kanti_aid', a); }
    return a;
  } catch (e) { return null; }
})();
const trackQueue = [];
let trackT = null;
function track(name, props) {
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  trackQueue.push({ name, props: props || {} });
  clearTimeout(trackT);
  trackT = setTimeout(flushTrack, 1200);
}
function flushTrack() {
  if (!trackQueue.length) return;
  const events = trackQueue.splice(0, 25);
  API.track(AID, events).catch(() => {});
}
window.addEventListener('pagehide', () => {
  if (!trackQueue.length || !navigator.sendBeacon) return;
  navigator.sendBeacon('/api/track', new Blob([JSON.stringify({ anon_id: AID, events: trackQueue.splice(0, 25) })], { type: 'application/json' }));
});
let searchTrackT = null;
function trackSearch(q, results) {
  clearTimeout(searchTrackT);
  if (q.trim().length < 2) return;
  searchTrackT = setTimeout(() => track('shop_search', { q: q.trim().toLowerCase().slice(0, 60), results }), 1500);
}

/* ---------- Admin dashboard ---------- */
function adminAnalyticsHTML() {
  const A = state.admin.analytics; if (!A) return '';
  const r = A.report, days = state.admin.analyticsDays || 30;
  const top = Math.max(1, ...r.funnel.map((f) => f.visitors));
  return `<div class="admin-bar"><div class="filters">${[7, 30, 90].map((d) => `<button class="pill ${days === d ? 'active' : ''}" data-act="adminAnalyticsDays" data-arg="${d}">Last ${d} days</button>`).join('')}</div>
      <span class="muted-p">${r.visitors} visitors · ${A.live.connections} open now</span></div>
    <div class="an-grid">
      <section class="acct-card wide"><h3>Quiz → order funnel</h3>
        <p class="muted-p">Unique visitors reaching each step. Percentages are of the step before.</p>
        <div class="funnel">${r.funnel.map((f, i) => {
          const prev = i ? r.funnel[i - 1].visitors : null;
          const pct = prev ? Math.round((f.visitors / prev) * 100) : null;
          return `<div class="fn-row" tabindex="0" title="${esc(f.label)}: ${f.visitors} visitors${pct != null ? ` (${pct}% of the previous step)` : ''}">
            <span class="fn-label">${esc(f.label)}</span>
            <span class="fn-track"><span class="fn-bar" style="width:${(f.visitors / top) * 100}%"></span></span>
            <span class="fn-num"><b>${f.visitors}</b>${pct != null ? `<small>${pct}%</small>` : ''}</span></div>`;
        }).join('')}</div></section>
      <section class="acct-card"><h3>Top searches</h3>${r.searches.length ? `<table class="an-table"><thead><tr><th>Search</th><th>Times</th><th>Avg results</th></tr></thead><tbody>
        ${r.searches.map((s) => `<tr class="${s.zero ? 'zero' : ''}"><td>${esc(s.q)}</td><td>${s.n}</td><td>${s.avg_results}${s.zero ? ' <small>· no match ' + s.zero + '×</small>' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted-p">No searches yet.</p>'}</section>
      <section class="acct-card"><h3>Wanted but not sold <small class="muted-p">— product ideas</small></h3>
        <p class="muted-p">Searches that went to “Beyond Kanti”, with what the AI suggested instead.</p>
        ${r.unmet.length ? `<table class="an-table"><thead><tr><th>Searched for</th><th>Times</th><th>Suggested type</th></tr></thead><tbody>
        ${r.unmet.map((s) => `<tr><td>${esc(s.q)}${s.off_topic ? ' <small>(not skincare)</small>' : ''}</td><td>${s.n}</td><td>${esc(s.ideas || '—')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted-p">Nothing yet.</p>'}</section>
      <section class="acct-card"><h3>Most added to bag</h3>${r.products.length ? `<table class="an-table"><tbody>${r.products.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.n}</td></tr>`).join('')}</tbody></table>` : '<p class="muted-p">Nothing yet.</p>'}</section>
      <section class="acct-card"><h3>Pages</h3>${r.views.length ? `<table class="an-table"><thead><tr><th>Page</th><th>Views</th><th>Visitors</th></tr></thead><tbody>${r.views.map((v) => `<tr><td>${esc(v.view || '—')}</td><td>${v.n}</td><td>${v.visitors}</td></tr>`).join('')}</tbody></table>` : '<p class="muted-p">Nothing yet.</p>'}</section>
    </div>
    <p class="muted-p">Anonymous and first-party only: a random id per browser, never sent to third parties; “Do Not Track” is respected. Events are kept for 180 days.</p>`;
}
function adminAnalyticsDays(d) { state.admin.analyticsDays = Number(d); state.admin.analytics = null; renderAdmin(); }

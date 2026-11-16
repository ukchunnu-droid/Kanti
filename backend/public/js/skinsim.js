// Kanti storefront — skinsim.js
// "Your skin with this routine": an illustrated before/after face, an 8-week timeline, a drag-to-compare
// slider and a before/after chart, plus "Why this routine works" (scientific + Ayurvedic reasons).
// The numbers and reasons come from the server (src/skin-science.js) — fixed, reviewed statements, not AI.
// It's an illustration of the usual direction of change, never presented as a photo or a promise.

const SKIN_TONES = [
  { name: 'Fair', base: '#F1D2BC', shade: '#D6A88B', lip: '#C9817A' },
  { name: 'Light', base: '#E3B893', shade: '#C38F6B', lip: '#B5715F' },
  { name: 'Medium', base: '#C79064', shade: '#A06B45', lip: '#97584A' },
  { name: 'Tan', base: '#9C6745', shade: '#7A4C30', lip: '#7C4335' },
  { name: 'Deep', base: '#6A4331', shade: '#4E2F21', lip: '#5A3127' },
];
state.sim = {
  t: 0, pos: 0, played: false, playing: false,
  tone: (() => { try { const n = Number(localStorage.getItem('kanti_tone')); return n >= 0 && n < SKIN_TONES.length ? n : 2; } catch (e) { return 2; } })(),
};

function simData() { const r = recoNow(); return r && r.science ? r.science : null; }
const mVal = (m, t) => m.before + (m.after - m.before) * t;

// How visible each skin "feature" is at time t (0 = today, 1 = week 8).
function featureLevels(metrics, t) {
  const v = Object.fromEntries(metrics.map((m) => [m.key, mVal(m, t)]));
  // Curved so problems read clearly today and fade convincingly — but never to "perfect".
  const def = (k) => Math.pow(Math.max(0, Math.min(1, ((9 - v[k]) / 7) * 1.25)), 1.4);
  return {
    shine: def('oil') * 0.85, flakes: def('hydration'), red: def('calm'), spots: def('clarity'),
    dull: def('radiance') * 0.6, lines: def('smoothness'), glow: Math.max(0, Math.min(1, (v.radiance - 4.5) / 4.5)) * 0.4,
  };
}

function faceSVG(id, tone) {
  const c = SKIN_TONES[tone];
  const spots = [[100, 86, 2.6], [139, 92, 2.2], [86, 160, 2.8], [154, 166, 2.4], [112, 196, 2.5], [131, 199, 2], [146, 152, 2]];
  return `<svg class="face" viewBox="0 0 240 260" role="img" aria-label="Illustration of skin">
  <defs>
    <filter id="${id}b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="${id}s" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <radialGradient id="${id}g"><stop offset="0" stop-color="#FFD98A" stop-opacity=".7"/><stop offset="1" stop-color="#FFD98A" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}c"><path d="M54,120 C54,62 84,40 120,40 C156,40 186,62 186,120 C186,160 170,188 148,203 C137,210 128,214 120,214 C112,214 103,210 92,203 C70,188 54,160 54,120Z"/></clipPath>
  </defs>
  <!-- Proportions: hair frames the face; the neck sits inside the jawline and is drawn behind the face. -->
  <path d="M40,118 C40,44 78,18 120,18 C162,18 200,44 200,118 L204,214 C196,226 182,230 170,226 L166,150 L74,150 L70,226 C58,230 44,226 36,214Z" fill="#2B1D16"/>
  <path d="M100,176 L140,176 L142,218 C162,224 194,232 210,246 L214,260 L26,260 L30,246 C46,232 78,224 98,218Z" fill="${c.base}"/>
  <path d="M100,186 L140,186 L140,206 C127,214 113,214 100,206Z" fill="${c.shade}" opacity=".6"/>
  <ellipse cx="52" cy="128" rx="8" ry="14" fill="${c.shade}"/><ellipse cx="188" cy="128" rx="8" ry="14" fill="${c.shade}"/>
  <path d="M54,120 C54,62 84,40 120,40 C156,40 186,62 186,120 C186,160 170,188 148,203 C137,210 128,214 120,214 C112,214 103,210 92,203 C70,188 54,160 54,120Z" fill="${c.base}"/>
  <g clip-path="url(#${id}c)">
    <g class="f-dull"><rect x="40" y="40" width="160" height="170" fill="#8C8A86" style="mix-blend-mode:multiply"/></g>
    <g class="f-red" filter="url(#${id}b)" style="mix-blend-mode:multiply">
      <ellipse cx="88" cy="150" rx="19" ry="13" fill="#D2483C"/><ellipse cx="152" cy="150" rx="19" ry="13" fill="#D2483C"/>
      <ellipse cx="120" cy="146" rx="8" ry="11" fill="#D2483C"/><ellipse cx="120" cy="92" rx="14" ry="6" fill="#D2483C" opacity=".6"/>
    </g>
    <g class="f-glow" style="mix-blend-mode:screen">
      <ellipse cx="91" cy="138" rx="22" ry="14" fill="url(#${id}g)"/><ellipse cx="149" cy="138" rx="22" ry="14" fill="url(#${id}g)"/>
      <ellipse cx="120" cy="88" rx="26" ry="12" fill="url(#${id}g)"/>
    </g>
    <g class="f-shine" filter="url(#${id}s)" fill="#FFFFFF">
      <ellipse cx="120" cy="90" rx="22" ry="7" opacity=".7"/><ellipse cx="120" cy="138" rx="3" ry="10" opacity=".75"/>
      <ellipse cx="121" cy="152" rx="6" ry="4" opacity=".85"/><ellipse cx="120" cy="190" rx="10" ry="3.5" opacity=".6"/>
    </g>
    <g class="f-spots">${spots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 2.4}" fill="#C4503F" opacity=".25"/><circle cx="${x}" cy="${y}" r="${r}" fill="#B2402F"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.35}" fill="#F3C9B4" opacity=".8"/>`).join('')}</g>
    <g class="f-flakes" fill="none" stroke-linecap="round">
      <g stroke="${c.shade}" stroke-width="1.4" opacity=".8"><path d="M80,158 l4,-1.5 M86,165 l3.5,.5 M95,160 l3,-2.5 M147,160 l4,1.5 M154,166 l-3.5,1 M150,153 l3,-1 M108,150 l-2.5,2 M134,150 l2.5,2 M90,172 l3,-1 M150,173 l-3,-1"/></g>
      <g stroke="#FFFFFF" stroke-width=".8" opacity=".75"><path d="M80,157.4 l4,-1.5 M86,164.4 l3.5,.5 M95,159.4 l3,-2.5 M147,159.4 l4,1.5 M154,165.4 l-3.5,1 M150,152.4 l3,-1 M108,149.4 l-2.5,2 M134,149.4 l2.5,2 M90,171.4 l3,-1 M150,172.4 l-3,-1"/></g>
    </g>
    <g class="f-lines" fill="none" stroke="${c.shade}" stroke-width="1.4" stroke-linecap="round">
      <path d="M92,134 q10,5 20,0"/><path d="M128,134 q10,5 20,0"/><path d="M100,78 q20,-5 40,0"/><path d="M104,84 q16,-3 32,0"/>
      <path d="M103,160 q-6,10 -2,22"/><path d="M137,160 q6,10 2,22"/>
    </g>
  </g>
  <path d="M50,124 C42,8 198,8 190,124 C180,88 152,64 120,64 C88,64 60,88 50,124Z" fill="#2B1D16"/>
  <g fill="none" stroke="#2B1D16" stroke-linecap="round">
    <path d="M86,110 q14,-7 28,-2" stroke-width="3"/><path d="M126,108 q14,-5 28,2" stroke-width="3"/>
    <path d="M89,124 q11,7 22,0" stroke-width="2.2"/><path d="M129,124 q11,7 22,0" stroke-width="2.2"/>
  </g>
  <path d="M120,128 q-6,17 -2,23 q4,2 8,0" fill="none" stroke="${c.shade}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M105,172 q15,-6 30,0 q-15,10 -30,0z" fill="${c.lip}"/>
</svg>`;
}
function applyLevels(root, lv) {
  if (!root) return;
  for (const [k, cls] of [['shine', 'f-shine'], ['flakes', 'f-flakes'], ['red', 'f-red'], ['spots', 'f-spots'], ['dull', 'f-dull'], ['lines', 'f-lines'], ['glow', 'f-glow']]) {
    const g = root.querySelector('.' + cls); if (g) g.style.opacity = lv[k].toFixed(3);
  }
}

/* ---------- Section ---------- */
function skinSimHTML() {
  const d = simData();
  if (!d) {
    return state.reco.pending ? `<section class="sim"><div class="sim-loading pulse">✦ Preparing your before & after…</div></section>` : '';
  }
  const S = state.sim, focus = new Set(d.focus);
  const prof = state.profile;
  return `<section class="sim" id="sim" aria-labelledby="simTitle">
    <div class="routine-head"><div><div class="eyebrow">If you follow this routine</div>
      <h2 id="simTitle">Your skin, ${d.weeks} weeks in</h2></div></div>
    <div class="sim-grid">
      <div class="sim-stage-wrap">
        <div class="sim-stage" id="simStage" style="--pos:${S.pos}%">
          <div class="sim-layer before">${faceSVG('fb', S.tone)}</div>
          <div class="sim-layer after">${faceSVG('fa', S.tone)}</div>
          <div class="sim-divider" aria-hidden="true"><span>⇆</span></div>
          <span class="sim-tag l">Before</span><span class="sim-tag r" id="simWeekTag">Week ${Math.round(S.t * d.weeks)}</span>
          <input type="range" class="sim-range" id="simRange" min="0" max="100" value="${S.pos}" data-input="simSlide"
            aria-label="Drag to compare your skin before and after the routine">
        </div>
        <div class="sim-controls">
          <button class="btn btn-ghost btn-sm" data-act="simPlay" id="simPlayBtn">${S.played ? '↻ Replay 8 weeks' : '▶ Play 8 weeks'}</button>
          <div class="sim-weeks" aria-hidden="true">${[0, 2, 4, 6, 8].map((w) => `<span class="${Math.round(S.t * d.weeks) >= w ? 'on' : ''}">W${w}</span>`).join('')}</div>
        </div>
        <div class="tone-pick" role="radiogroup" aria-label="Skin tone for the illustration">
          <small>Skin tone</small>${SKIN_TONES.map((c, i) => `<button class="tone ${i === S.tone ? 'on' : ''}" role="radio" aria-checked="${i === S.tone}" title="${c.name}" aria-label="${c.name}" style="background:${c.base}" data-act="simTone" data-arg="${i}"></button>`).join('')}
        </div>
      </div>
      <div class="sim-chart">
        <div class="sim-legend"><span><i class="dot before"></i>Today</span><span><i class="dot after"></i>Week ${d.weeks} with the routine</span><small>scale 1–9, higher is better</small></div>
        <div class="db-rows" id="dbRows">
          ${d.metrics.map((m) => `<div class="db-row ${focus.has(m.key) ? 'focus' : ''}" tabindex="0" data-key="${esc(m.key)}"
              aria-label="${esc(m.label)}: today ${m.before} out of 9, week ${d.weeks} about ${m.after}. ${esc(m.why)}">
            <div class="db-label">${esc(m.label)}${focus.has(m.key) ? ' <em>your focus</em>' : ''}</div>
            <div class="db-track">
              <span class="db-bar" style="left:${pct(m.before)}%;width:${Math.max(0, pct(mVal(m, S.t)) - pct(m.before))}%"></span>
              <span class="db-dot before" style="left:${pct(m.before)}%"></span>
              <span class="db-dot after" style="left:${pct(mVal(m, S.t))}%"></span>
            </div>
            <div class="db-val"><span class="v-before">${m.before}</span> → <b class="v-after">${fmt1(mVal(m, S.t))}</b></div>
            <div class="db-tip" role="tooltip"><b>${esc(m.label)}</b>Today ${m.before}/9 → week ${d.weeks} ≈ ${m.after}/9<br>${esc(m.why)}</div>
          </div>`).join('')}
        </div>
        <details class="db-table"><summary>Show as a table</summary>
          <table><thead><tr><th>Measure</th><th>Today</th><th>Week ${d.weeks}</th><th>Helped by</th></tr></thead>
          <tbody>${d.metrics.map((m) => `<tr><td>${esc(m.label)}</td><td>${m.before}</td><td>${m.after}</td><td>${esc(m.helped_by.join(', ') || '—')}</td></tr>`).join('')}</tbody></table>
        </details>
      </div>
    </div>
    <p class="sim-note">ⓘ ${esc(d.note)}</p>
    ${whyRoutineHTML(d, prof)}
  </section>`;
}
const pct = (v) => ((v - 1) / 8) * 100;
const fmt1 = (v) => (Math.round(v * 10) / 10).toString();

function whyRoutineHTML(d, prof) {
  const pr = d.principle;
  const steps = [...buildRoutine(prof, 'AM'), ...buildRoutine(prof, 'PM')];
  const wk = weeklyStep(prof); if (wk) steps.push(wk);
  const seen = new Set();
  const uniq = steps.filter((s) => d.steps[s.p.id] && !seen.has(s.p.id) && seen.add(s.p.id));
  const bullets = (list) => list.map((x) => `<li><b>${esc(x.name)}</b> — ${esc(x.text)}</li>`).join('');
  return `<div class="why-wrap">
    <div class="routine-head" style="margin-top:34px"><h2>Why this routine works</h2></div>
    <p class="routine-hint">Every step is chosen for two reasons: what modern skin science knows about the ingredients, and what Ayurveda says about balancing your dosha.</p>
    <div class="why-cards">
      <div class="why-card ay"><div class="wc-kicker">🌿 Ayurveda</div><h3>Balancing ${esc(DOSHA[pr.dosha].name)}</h3>
        <p>${esc(pr.skin)}</p>
        <p>${esc(DOSHA[pr.dosha].name)} carries the qualities <b>${esc(pr.qualities)}</b>. Ayurveda’s principle of <i>samanya–vishesha</i> — like increases like, opposites restore balance — calls for <b>${esc(pr.remedy)}</b>. That is what this routine is built from.</p></div>
      <div class="why-card sc"><div class="wc-kicker">🔬 Skin science</div><h3>${esc(SKIN_LABEL[prof.skin])} skin</h3>
        <p>${esc(d.skin_science)}</p>
        <p>The routine follows the order dermatologists recommend — cleanse, tone, treat, moisturise, protect — so each step prepares the skin for the next and actives aren’t blocked.</p></div>
    </div>
    <div class="why-steps">${uniq.map((s) => { const r = d.steps[s.p.id]; return `
      <details class="why-step">
        <summary><span class="rs-thumb sm" style="background:${esc(s.p.bg)}">${productArt(s.p, 'thumb')}</span>
          <span class="ws-name"><small>${esc(r.slot)}</small><b>${esc(s.p.name)}</b></span><span class="ws-open">Why?</span></summary>
        <div class="ws-cols">
          <div><h4>🔬 Science</h4>${r.step ? `<p class="ws-step">${esc(r.step.science)}</p>` : ''}<ul>${bullets(r.science)}</ul></div>
          <div><h4>🌿 Ayurveda</h4>${r.step ? `<p class="ws-step">${esc(r.step.ayurveda)}</p>` : ''}<ul>${bullets(r.ayurveda)}</ul></div>
        </div>
      </details>`; }).join('')}</div>
  </div>`;
}

/* ---------- Behaviour ---------- */
let simRaf = null, simObserver = null;
// Called after the results page renders: paint the current state and auto-play once when scrolled into view.
function mountSkinSim() {
  const d = simData(), stage = $('#simStage'); if (!d || !stage) return;
  applyLevels($('.sim-layer.before'), featureLevels(d.metrics, 0));
  paintSim(d, state.sim.t);
  if (simObserver) simObserver.disconnect();
  if (!state.sim.played && 'IntersectionObserver' in window) {
    simObserver = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { simObserver.disconnect(); simPlay(); }
    }, { threshold: 0.45 });
    simObserver.observe(stage);
  }
}
function paintSim(d, t) {
  applyLevels($('.sim-layer.after'), featureLevels(d.metrics, t));
  const tag = $('#simWeekTag'); if (tag) tag.textContent = t >= 1 ? `After · week ${d.weeks}` : `Week ${Math.round(t * d.weeks)}`;
  document.querySelectorAll('.sim-weeks span').forEach((el, i) => el.classList.toggle('on', t * d.weeks >= i * 2 - 0.01));
  document.querySelectorAll('#dbRows .db-row').forEach((row, i) => {
    const m = d.metrics[i], v = mVal(m, t);
    row.querySelector('.db-dot.after').style.left = pct(v) + '%';
    row.querySelector('.db-bar').style.width = Math.max(0, pct(v) - pct(m.before)) + '%';
    row.querySelector('.v-after').textContent = fmt1(v);
  });
}
function setPos(p) {
  state.sim.pos = p;
  const st = $('#simStage'); if (st) st.style.setProperty('--pos', p + '%');
  const r = $('#simRange'); if (r && Number(r.value) !== p) r.value = p;
}
// Week 0 → 8 on the whole face, then slide the divider to the middle to compare.
function simPlay() {
  const d = simData(); if (!d) return;
  cancelAnimationFrame(simRaf);
  if (simObserver) { simObserver.disconnect(); simObserver = null; } // played by hand → no auto-play later
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = state.sim;
  S.played = true; S.playing = true;
  const btn = $('#simPlayBtn'); if (btn) btn.textContent = '↻ Replay 8 weeks';
  if (reduce) { S.t = 1; paintSim(d, 1); setPos(50); S.playing = false; return; }
  setPos(0); S.t = 0; paintSim(d, 0);
  const start = performance.now(), GROW = 3600, SLIDE = 900, PAUSE = 400;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const step = (now) => {
    if (!$('#simStage')) { S.playing = false; return; }
    const e = now - start;
    if (e < GROW) { S.t = ease(e / GROW); paintSim(d, S.t); }
    else {
      if (S.t !== 1) { S.t = 1; paintSim(d, 1); }
      const k = Math.min(1, Math.max(0, (e - GROW - PAUSE) / SLIDE));
      setPos(Math.round(ease(k) * 50));
      if (k >= 1) { S.playing = false; return; }
    }
    simRaf = requestAnimationFrame(step);
  };
  simRaf = requestAnimationFrame(step);
}
function simSlide(v) {
  if (state.sim.playing) { cancelAnimationFrame(simRaf); state.sim.playing = false; state.sim.t = 1; paintSim(simData(), 1); }
  setPos(Math.max(0, Math.min(100, Number(v) || 0)));
}
function simTone(i) {
  state.sim.tone = Number(i);
  try { localStorage.setItem('kanti_tone', String(i)); } catch (e) {}
  const d = simData(); if (!d) return;
  $('.sim-layer.before').innerHTML = faceSVG('fb', state.sim.tone);
  $('.sim-layer.after').innerHTML = faceSVG('fa', state.sim.tone);
  applyLevels($('.sim-layer.before'), featureLevels(d.metrics, 0));
  paintSim(d, state.sim.t);
  document.querySelectorAll('.tone').forEach((b, k) => { b.classList.toggle('on', k === state.sim.tone); b.setAttribute('aria-checked', k === state.sim.tone); });
}

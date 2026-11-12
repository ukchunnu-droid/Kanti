// Kanti storefront — routine.js
// "My routine" page: today's AM/PM checklist + streak, calendar reminders (.ics) and the skin diary.

state.diary = { entries: null, tags: [], loading: false, form: null };
state.reminder = (() => {
  try { const r = JSON.parse(localStorage.getItem('kanti_reminder') || 'null'); if (r && /^\d\d:\d\d$/.test(r.am) && /^\d\d:\d\d$/.test(r.pm)) return r; } catch (e) {}
  return { am: '07:30', pm: '21:30' };
})();
const RATING = [null, { e: '😣', t: 'Rough' }, { e: '😕', t: 'Meh' }, { e: '🙂', t: 'Okay' }, { e: '😊', t: 'Good' }, { e: '🤩', t: 'Glowing' }];

function renderRoutine() {
  const prof = state.profile;
  if (!prof) {
    app.innerHTML = `<div class="checkout"><div class="empty-state"><div class="big">🌿</div>
      <p>Your routine is built from the skin quiz — it takes 2 minutes.</p>
      <button class="btn btn-primary" style="margin-top:14px" data-go="quiz">Take the quiz</button></div></div>${footerHTML()}`;
    return;
  }
  ensureReco();
  const am = buildRoutine(prof, 'AM'), pm = buildRoutine(prof, 'PM');
  const list = (steps, tod) => steps.map((s, i) => {
    const on = !!routine.done[tod + ':' + i];
    return `<li class="rt-step ${on ? 'done' : ''}">
      <button class="step-no toggle ${on ? 'on' : ''}" aria-pressed="${on}" title="Mark ${esc(s.p.name)} as done" data-act="toggleStep" data-arg="${tod}" data-arg2="${i}">${on ? '✓' : i + 1}</button>
      <div class="rs-thumb" style="background:${esc(s.p.bg)}">${productArt(s.p, 'thumb')}</div>
      <div class="rs-body"><span class="slot">${esc(s.slot)}</span><b>${esc(s.p.name)}</b></div>
      <button class="link-btn" data-act="openModal" data-arg="${esc(s.p.id)}">How</button>
    </li>`;
  }).join('');
  app.innerHTML = `<div class="wrap routine-page">
    <div class="section-head" style="margin-bottom:22px"><div class="eyebrow">My routine</div>
      <h2>Today, ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
      <p>${esc(SKIN_LABEL[prof.skin])} skin · ${esc(DOSHA[prof.dosha].name)}-leaning. <button class="link-btn" data-go="results">See why each step was chosen</button>${API.isAuthed() ? ` · <button class="link-btn" data-go="journey">${t('Skin journey')}</button> · <button class="link-btn" data-act="openReminderSettings">Reminders in the app</button>` : ''}</p></div>
    ${streakHTML(prof)}
    <div class="rt-cols">
      <section class="acct-card"><h3>☀️ Morning</h3><ol class="rt-list">${list(am, 'AM')}</ol></section>
      <section class="acct-card"><h3>🌙 Evening</h3><ol class="rt-list">${list(pm, 'PM')}</ol></section>
    </div>
    <div class="rt-cols">
      ${reminderCardHTML()}
      ${diaryCardHTML()}
    </div>
    ${diaryHistoryHTML()}
  </div>${footerHTML()}`;
  if (API.isAuthed() && !state.diary.entries && !state.diary.loading) loadDiary();
}

/* ---------- Reminders: a calendar file with two daily repeating events ---------- */
function reminderCardHTML() {
  const r = state.reminder;
  return `<section class="acct-card"><h3>⏰ Reminders</h3>
    <p class="muted-p">Add two daily reminders to your phone or computer calendar (Apple, Google, Outlook).</p>
    <div class="field-row">
      <div class="field"><label for="remAm">Morning</label><input type="time" id="remAm" value="${esc(r.am)}" data-change="setReminder" data-arg="am"></div>
      <div class="field"><label for="remPm">Evening</label><input type="time" id="remPm" value="${esc(r.pm)}" data-change="setReminder" data-arg="pm"></div>
    </div>
    <button class="btn btn-primary btn-sm" data-act="downloadReminders">Add to my calendar</button>
  </section>`;
}
function setReminder(value, _b, el) {
  if (!/^\d\d:\d\d$/.test(value)) return;
  state.reminder[el.id === 'remAm' ? 'am' : 'pm'] = value;
  try { localStorage.setItem('kanti_reminder', JSON.stringify(state.reminder)); } catch (e) {}
}
function icsEscape(s) { return String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n'); }
function downloadReminders() {
  const prof = state.profile; if (!prof) return;
  const d = new Date(); d.setDate(d.getDate() + 1);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = (tod, time) => {
    const steps = buildRoutine(prof, tod).map((s, i) => `${i + 1}. ${s.slot}: ${s.p.name}`).join('\n');
    const label = tod === 'AM' ? 'Morning' : 'Evening';
    return ['BEGIN:VEVENT', `UID:kanti-${tod.toLowerCase()}-${ymd}@kanti`, `DTSTAMP:${stamp}`,
      `DTSTART:${ymd}T${time.replace(':', '')}00`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
      `SUMMARY:${icsEscape(`🌿 Kanti ${label.toLowerCase()} routine`)}`,
      `DESCRIPTION:${icsEscape(`${label} routine\n${steps}\n\nTick it off at ${location.origin}/#routine`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Kanti ${label.toLowerCase()} routine`)}`, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT'].join('\r\n');
  };
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kanti//Routine//EN', 'CALSCALE:GREGORIAN',
    ev('AM', state.reminder.am), ev('PM', state.reminder.pm), 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a'); a.href = url; a.download = 'kanti-routine-reminders.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Calendar file downloaded — open it to add the reminders');
}

/* ---------- Skin diary ---------- */
async function loadDiary() {
  state.diary.loading = true;
  try { const r = await API.diary(); state.diary.entries = r.entries; state.diary.tags = r.tags || []; }
  catch (e) { if (handleAuthError(e, 'routine')) return; state.diary.entries = []; }
  state.diary.loading = false;
  if (state.view === 'routine') { const y = window.scrollY; renderRoutine(); window.scrollTo(0, y); }
}
function todayEntry() { return (state.diary.entries || []).find((e) => e.day === todayStr()) || null; }
function diaryCardHTML() {
  if (!API.isAuthed()) {
    return `<section class="acct-card"><h3>📔 Skin diary</h3>
      <p class="muted-p">Log how your skin feels each day and see how it changes with your routine.</p>
      <button class="btn btn-ghost btn-sm" data-act="diarySignIn">Sign in to keep a diary</button></section>`;
  }
  if (!state.diary.entries) return `<section class="acct-card"><h3>📔 Skin diary</h3><p class="muted-p pulse">Loading…</p></section>`;
  const cur = todayEntry();
  const f = state.diary.form || (state.diary.form = cur ? { rating: cur.rating, tags: [...cur.tags], note: cur.note } : { rating: 0, tags: [], note: '' });
  return `<section class="acct-card"><h3>📔 How’s your skin today?</h3>
    <div class="rating" role="radiogroup" aria-label="How your skin feels today">
      ${[1, 2, 3, 4, 5].map((n) => `<button class="rate ${f.rating === n ? 'on' : ''}" role="radio" aria-checked="${f.rating === n}" data-act="diaryRate" data-arg="${n}" title="${RATING[n].t}"><span>${RATING[n].e}</span><small>${RATING[n].t}</small></button>`).join('')}
    </div>
    <div class="tag-pills">${state.diary.tags.map((t) => `<button class="pill ${f.tags.includes(t) ? 'active' : ''}" data-act="diaryTag" data-arg="${esc(t)}" aria-pressed="${f.tags.includes(t)}">${esc(t)}</button>`).join('')}</div>
    <textarea id="diaryNote" rows="2" maxlength="500" placeholder="Anything to remember? (new product, weather, stress…)" data-input="diaryNote">${esc(f.note)}</textarea>
    <div style="display:flex;gap:10px;align-items:center;margin-top:10px">
      <button class="btn btn-primary btn-sm" id="diarySave" data-act="diarySave" ${f.rating ? '' : 'disabled'}>${cur ? 'Update today' : 'Save today'}</button>
      ${cur ? '<small class="muted-p">✓ Logged today</small>' : ''}
    </div>
  </section>`;
}
function diaryRate(n) { state.diary.form.rating = Number(n); rerenderDiary(); }
function diaryTag(t) { const f = state.diary.form; f.tags = f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t]; rerenderDiary(); }
function diaryNote(v) { state.diary.form.note = v.slice(0, 500); }
function rerenderDiary() { const y = window.scrollY; renderRoutine(); window.scrollTo(0, y); }
function diarySignIn() { state.next = 'routine'; go('signin'); }
async function diarySave(_a, _b, el) {
  const f = state.diary.form; if (!f || !f.rating) return;
  await withBusy(el, 'Saving…', async () => {
    try { const r = await API.saveDiary(todayStr(), f); state.diary.entries = r.entries; toast('Saved to your skin diary'); }
    catch (e) { if (!handleAuthError(e, 'routine')) toast(e.message); }
  });
  rerenderDiary();
}

// Last 30 days as thin bars (one series: how your skin felt, 1–5), with routine-complete days marked.
function diaryHistoryHTML() {
  const entries = state.diary.entries;
  if (!API.isAuthed() || !entries || !entries.length) return '';
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(todayStr(d)); }
  const W = 600, H = 120, pad = 22, bw = (W - pad) / 30;
  const bars = days.map((day, i) => {
    const e = byDay.get(day); const x = pad + i * bw + 2;
    if (!e) return `<rect x="${x}" y="${H - 4}" width="${bw - 4}" height="2" rx="1" class="d-empty"><title>${fmtDate(day)} — no entry</title></rect>`;
    const h = (e.rating / 5) * (H - 12);
    return `<g class="d-bar" tabindex="0"><rect x="${x - 1}" y="0" width="${bw - 2}" height="${H}" fill="transparent"/>
      <path d="M${x},${H} v${-(h - 4)} q0,-4 4,-4 h${bw - 12} q4,0 4,4 v${h - 4} z" class="d-fill"/>
      <title>${fmtDate(day)} — ${RATING[e.rating].t}${e.tags.length ? ' · ' + e.tags.join(', ') : ''}</title></g>`;
  }).join('');
  const grid = [1, 3, 5].map((n) => { const y = H - (n / 5) * (H - 12); return `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" class="d-grid"/><text x="0" y="${y + 4}" class="d-axis">${n}</text>`; }).join('');
  const recent = entries.slice(0, 7);
  const avg = (list) => list.length ? (list.reduce((s, e) => s + e.rating, 0) / list.length) : 0;
  const last7 = entries.filter((e) => days.slice(-7).includes(e.day)), prev7 = entries.filter((e) => days.slice(-14, -7).includes(e.day));
  const trend = last7.length && prev7.length ? avg(last7) - avg(prev7) : null;
  return `<section class="acct-card wide diary-hist">
    <div class="acct-card-head"><h3>Your skin, last 30 days</h3>
      ${trend != null ? `<span class="trend ${trend >= 0 ? 'up' : 'down'}">${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(1)} vs. the week before</span>` : ''}</div>
    <svg class="diary-chart" viewBox="0 0 ${W} ${H + 2}" role="img" aria-label="Daily skin rating for the last 30 days, 1 (rough) to 5 (glowing)">${grid}${bars}</svg>
    <details><summary>Show entries as a list</summary>
      <table class="diary-table"><thead><tr><th>Day</th><th>Feeling</th><th>Tags</th><th>Note</th></tr></thead>
      <tbody>${recent.map((e) => `<tr><td>${fmtDate(e.day)}</td><td>${RATING[e.rating].e} ${RATING[e.rating].t}</td><td>${esc(e.tags.join(', ')) || '—'}</td><td>${esc(e.note) || '—'}</td></tr>`).join('')}</tbody></table>
    </details>
  </section>`;
}

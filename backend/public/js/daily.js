// Kanti storefront — daily.js
// What makes the home page change through the day and the year: a time-of-day greeting with your
// routine, the Ayurvedic season (ritucharya), opt-in weather tips, a daily tip, "continue where you
// left off", recently viewed products, "New" badges and real popularity from orders.

let RATINGS = {}, POPULAR = {};

/* ---------- Ritucharya: the six Ayurvedic seasons (northern-hemisphere months) ---------- */
const RITUS = [
  { key: 'shishira', name: 'Shishira', en: 'late winter', from: [1, 15], dosha: 'Kapha builds, Vata stays high',
    tips: ['Cold, dry wind thins the skin’s protective oils — a few drops of sesame or almond oil before bathing (abhyanga) helps.', 'Use lukewarm, not hot, water: very hot water strips the lipid barrier.', 'Choose a richer moisturiser at night.'] },
  { key: 'vasanta', name: 'Vasanta', en: 'spring', from: [3, 15], dosha: 'Kapha melts and rises',
    tips: ['Spring loosens stored Kapha, so congestion and breakouts are common — keep textures light.', 'A gentle weekly clay or ubtan cleanse lifts excess oil.', 'Clarifying herbs like neem and turmeric suit this season.'] },
  { key: 'grishma', name: 'Grishma', en: 'summer', from: [5, 15], dosha: 'Pitta builds with the heat',
    tips: ['Heat and sun build Pitta — cooling aloe, rose and sandalwood calm warm, flushed skin.', 'Reapply sunscreen every two hours outdoors; UV is the main driver of dark spots.', 'Swap heavy creams for gel moisturisers.'] },
  { key: 'varsha', name: 'Varsha', en: 'monsoon', from: [7, 15], dosha: 'Vata rises, Pitta gathers',
    tips: ['Humidity and sweat can clog pores — cleanse twice daily and keep skin dry.', 'Light, non-greasy layers work best; neem helps keep skin clear.', 'Don’t skip moisturiser: humid air can still leave skin dehydrated.'] },
  { key: 'sharad', name: 'Sharad', en: 'autumn', from: [9, 15], dosha: 'Pitta is at its peak',
    tips: ['After summer’s heat, Pitta peaks — redness, sensitivity and pigmentation are common. Favour soothing, cooling care.', 'Sandalwood and liquorice calm heat and help even tone.', 'Avoid harsh peels and very hot showers for now.'] },
  { key: 'hemanta', name: 'Hemanta', en: 'early winter', from: [11, 15], dosha: 'Vata and Kapha begin to rise',
    tips: ['Cooling air starts to dry the skin — nourishing oils and shatavari or almond creams help.', 'Protect the barrier: gentle cleansers, no over-exfoliating.', 'A warm oil massage is the classic Hemanta ritual.'] },
];
function currentRitu(d = new Date()) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  let cur = RITUS[RITUS.length - 1]; // before Jan 15 → Hemanta
  for (const r of RITUS) if (md >= r.from[0] * 100 + r.from[1]) cur = r;
  return cur;
}

/* ---------- Daily tip ---------- */
const TIPS = [
  ['all', 'Apply products thinnest to thickest: toner, serum, then moisturiser.'],
  ['all', 'Patch test anything new on your inner arm for 24 hours.'],
  ['all', 'Pat, don’t rub — tugging irritates the skin over time.'],
  ['all', 'Sunscreen is the most effective anti-ageing step there is.'],
  ['all', 'Change your pillowcase twice a week; it collects oil and bacteria.'],
  ['all', 'Give a new routine 6–8 weeks: that’s roughly one skin renewal cycle.'],
  ['all', 'Ayurveda sees skin as a mirror of digestion and sleep — rest shows on your face.'],
  ['all', 'Massage moisturiser upward for a minute — it boosts circulation and feels calming.'],
  ['vata', 'Vata skin loves oil: a few drops of sesame or almond oil on damp skin seals in moisture.'],
  ['vata', 'Wind and cold dry Vata skin fast — protect cheeks and lips outdoors.'],
  ['vata', 'Keep a steady routine: Vata thrives on rhythm, skin included.'],
  ['pitta', 'Pitta skin flares with heat — rinse with cool water and skip saunas before bed.'],
  ['pitta', 'Rose water is a gentle Pitta-cooling mist between meetings.'],
  ['pitta', 'Strong acids and fragrance can inflame Pitta skin; keep actives gentle.'],
  ['kapha', 'Kapha skin benefits from a weekly clay mask to clear congestion.'],
  ['kapha', 'Light, gel textures suit Kapha skin better than heavy creams.'],
  ['kapha', 'A brisk morning routine — and a little movement — wakes up dull Kapha skin.'],
];
function dailyTip() {
  const d = state.profile ? state.profile.dosha : null;
  const pool = TIPS.filter(([k]) => k === 'all' || k === d);
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
  return pool[day % pool.length][1];
}

/* ---------- Greeting + routine ---------- */
function partOfDay(h = new Date().getHours()) { return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night'; }
function greetingHTML() {
  const pod = partOfDay(), first = session.user ? splitName(session.user.name).first : '';
  const hello = { morning: t('Good morning'), afternoon: t('Good afternoon'), evening: t('Good evening'), night: t('Good night') }[pod];
  const prof = state.profile;
  let line = '', cta = '';
  if (!prof) { line = t('Take the 2-minute quiz and your day here becomes personal.'); cta = `<button class="btn btn-primary btn-sm" data-go="quiz">${t('Find your routine')}</button>`; }
  else {
    const tod = pod === 'morning' || pod === 'afternoon' ? 'AM' : 'PM';
    const steps = buildRoutine(prof, tod), done = steps.filter((_, i) => routine.done[tod + ':' + i]).length;
    const label = tod === 'AM' ? t('morning routine') : t('evening routine');
    line = done >= steps.length && steps.length ? `✓ ${label} ${t('done today — lovely.')}` : `${t('Time for your')} ${label}: ${done}/${steps.length} ${t('steps done')}.`;
    cta = `<button class="btn btn-primary btn-sm" data-go="routine">${done >= steps.length ? t('See my routine') : t('Start now')}</button>`;
  }
  return `<div class="today-card greet ${pod}"><div class="tc-kicker">${esc(new Date().toLocaleDateString(langLocale(), { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
    <h2>${esc(hello)}${first ? ', ' + esc(first) : ''} ${pod === 'morning' ? '☀️' : pod === 'night' ? '🌙' : pod === 'evening' ? '🌆' : '🌿'}</h2>
    <p>${line}</p>${cta}${routine.streak ? `<span class="tc-streak">🔥 ${routine.streak}-${t('day streak')}</span>` : ''}</div>`;
}
function rituHTML() {
  const r = currentRitu(), prof = state.profile;
  return `<div class="today-card ritu"><div class="tc-kicker">${t('Season')} · ritucharya</div>
    <h3>${esc(r.name)} <small>(${esc(r.en)})</small></h3><p class="ritu-dosha">${esc(r.dosha)}${prof ? ` — ${t('you’re')} ${esc(DOSHA[prof.dosha].name)}-leaning` : ''}</p>
    <ul>${r.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}
function tipHTML() {
  return `<div class="today-card tip"><div class="tc-kicker">${t('Today’s Ayurvedic tip')}</div><p class="tip-text">“${esc(dailyTip())}”</p></div>`;
}

/* ---------- Weather (opt-in) ---------- */
state.weather = { on: (() => { try { return localStorage.getItem('kanti_weather') === '1'; } catch (e) { return false; } })(), data: null, loading: false, error: null };
function weatherHTML() {
  const w = state.weather;
  if (!w.on) {
    return `<div class="today-card weather off"><div class="tc-kicker">${t('Weather tips')}</div>
      <p>${t('Get skincare tips for today’s weather where you are.')}</p>
      <button class="btn btn-ghost btn-sm" data-act="weatherOn">📍 ${t('Use my location')}</button>
      <small class="muted-p">${t('Your location is rounded to about 10 km and only used to look up the weather.')}</small></div>`;
  }
  if (!w.data && !w.error) { if (!w.loading) loadWeather(); return `<div class="today-card weather"><div class="tc-kicker">${t('Weather tips')}</div><p class="pulse">${t('Checking the weather…')}</p></div>`; }
  if (w.error) return `<div class="today-card weather"><div class="tc-kicker">${t('Weather tips')}</div><p class="muted-p">${esc(w.error)}</p><button class="link-btn" data-act="weatherOff">${t('Turn off')}</button></div>`;
  const d = w.data, f = tempUnit() === 'f';
  const temp = f ? Math.round(d.temp_c * 9 / 5 + 32) + '°F' : Math.round(d.temp_c) + '°C';
  return `<div class="today-card weather"><div class="tc-kicker">${t('Weather tips')} <button class="link-btn" data-act="weatherOff">${t('Turn off')}</button></div>
    <div class="wx-now"><b>${temp}</b><span>💧 ${Math.round(d.humidity)}%</span><span>☀️ UV ${d.uv != null ? Math.round(d.uv) : '–'}</span></div>
    <ul>${weatherTips(d).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}
function weatherTips(d) {
  const tips = [], dosha = state.profile && state.profile.dosha;
  if (d.humidity >= 70) tips.push('Humid today — keep layers light and choose gel textures.');
  else if (d.humidity <= 35) tips.push('Dry air today — add a hydrating layer and seal it with moisturiser.');
  if (d.uv >= 6) tips.push(`High UV (${Math.round(d.uv)}) — wear SPF and reapply every two hours outside.`);
  else if (d.uv >= 3) tips.push('Moderate UV — sunscreen is still worth it today.');
  if (d.temp_c >= 30) tips.push(dosha === 'pitta' ? 'Hot day — Pitta skin will feel it: mist with rose water and rinse with cool water.' : 'Hot day — a cooling aloe or rose layer helps.');
  else if (d.temp_c <= 8) tips.push(dosha === 'vata' ? 'Cold out — Vata skin dries fast: richer cream and lukewarm water.' : 'Cold out — use a richer cream and lukewarm, not hot, water.');
  if (d.wind_kmh >= 30) tips.push('Windy — protect lips and cheeks; wind dries the skin quickly.');
  if (!tips.length) tips.push('Mild weather — a good day to stick to your usual routine.');
  return tips.slice(0, 3);
}
function weatherOn() {
  if (!navigator.geolocation) { toast('Location isn’t available in this browser'); return; }
  state.weather.on = true; state.weather.error = null;
  try { localStorage.setItem('kanti_weather', '1'); } catch (e) {}
  render();
}
function weatherOff() {
  state.weather = { on: false, data: null, loading: false, error: null };
  try { localStorage.removeItem('kanti_weather'); } catch (e) {}
  render();
}
function loadWeather() {
  const w = state.weather; w.loading = true;
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try { w.data = await API.weather(pos.coords.latitude.toFixed(1), pos.coords.longitude.toFixed(1)); }
    catch (e) { w.error = e.message; }
    w.loading = false; if (state.view === 'home') { const y = window.scrollY; render(); window.scrollTo(0, y); }
  }, () => { w.loading = false; w.error = 'Location permission was declined.'; if (state.view === 'home') render(); }, { timeout: 10000, maximumAge: 30 * 60e3 });
}

/* ---------- Recently viewed + continue where you left off ---------- */
function rememberViewed(id) {
  try {
    const list = JSON.parse(localStorage.getItem('kanti_recent') || '[]').filter((x) => x !== id);
    localStorage.setItem('kanti_recent', JSON.stringify([id, ...list].slice(0, 8)));
  } catch (e) {}
}
const recentlyViewed = () => { try { return JSON.parse(localStorage.getItem('kanti_recent') || '[]').map(prod).filter(Boolean); } catch (e) { return []; } };
function continueHTML() {
  const items = [];
  try {
    const q = JSON.parse(localStorage.getItem('kanti_quiz') || 'null');
    if (q && Array.isArray(q.answers) && q.answers.filter(Boolean).length && Date.now() - q.at < 7 * 864e5) {
      items.push(`<button class="cont-item" data-go="quiz"><span>📝</span><span><b>${t('Finish your quiz')}</b><small>${t('Question')} ${Math.min(q.step + 1, QUIZ.length)} ${t('of')} ${QUIZ.length}</small></span></button>`);
    }
  } catch (e) {}
  if (state.cart.length) {
    items.push(`<button class="cont-item" data-act="openCart"><span>🧺</span><span><b>${t('Your bag')}</b><small>${cartQty()} ${t('items')} · ${money(cartTotal())}</small></span></button>`);
  }
  const last = recentlyViewed()[0];
  if (last) items.push(`<button class="cont-item" data-act="openModal" data-arg="${esc(last.id)}"><span class="cont-thumb" style="background:${esc(last.bg)}">${productArt(last, 'thumb')}</span><span><b>${esc(last.name)}</b><small>${t('Last viewed')}</small></span></button>`);
  return items.length ? `<div class="continue"><div class="tc-kicker">${t('Continue where you left off')}</div><div class="cont-row">${items.join('')}</div></div>` : '';
}
function recentHTML() {
  const list = recentlyViewed().slice(0, 4);
  return list.length >= 2 ? `<section class="section wrap" style="padding-top:0"><div class="section-head"><div class="eyebrow">${t('Recently viewed')}</div></div>
    <div class="grid">${list.map(cardHTML).join('')}</div></section>` : '';
}
function todayHTML() {
  return `<section class="wrap today">${continueHTML()}<div class="today-grid">${greetingHTML()}${tipHTML()}${rituHTML()}${weatherHTML()}</div></section>`;
}

/* ---------- Badges: New, Popular (real orders), ratings ---------- */
function isNewProduct(p) {
  if (!p.created_at) return false;
  const first = Math.min(...PRODUCTS.map((x) => Date.parse(x.created_at) || Infinity));
  const at = Date.parse(p.created_at);
  return at - first > 864e5 && Date.now() - at < 30 * 864e5; // added after launch, in the last 30 days
}
function popularLabel(p) {
  const pop = POPULAR[p.id]; if (!pop) return '';
  const d = state.profile && state.profile.dosha;
  if (d && pop.byDosha && pop.byDosha[d]) return `🔥 ${t('Popular with')} ${DOSHA[d].name} ${t('skin this week')}`;
  return `🔥 ${t('Popular this week')}`;
}
function starsHTML(avg, count, small) {
  if (!count) return '';
  const full = Math.round(avg);
  return `<span class="stars ${small ? 'sm' : ''}" aria-label="${avg} out of 5 stars, ${count} review${count === 1 ? '' : 's'}"><span aria-hidden="true">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span> <small>${avg} (${count})</small></span>`;
}

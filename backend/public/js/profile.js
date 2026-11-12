// Kanti storefront — profile.js
// Account extras: profile photo, address book, preferences (language, units, reminders), email
// preferences, and the "skin journey" page. Plus the small translation layer (English / हिन्दी).

/* ---------- Preferences ---------- */
function prefs() {
  if (session.user && session.user.prefs) return session.user.prefs;
  try { return JSON.parse(localStorage.getItem('kanti_prefs') || '{}'); } catch (e) { return {}; }
}
const lang = () => prefs().lang || 'en';
const tempUnit = () => prefs().temp_unit || (/^en-US/.test(navigator.language) ? 'f' : 'c');
const langLocale = () => (lang() === 'hi' ? 'hi-IN' : undefined);
async function savePrefs(patch) {
  if (API.isAuthed()) {
    const r = await API.savePrefs(patch);
    if (session.user) session.user.prefs = r.prefs;
  } else {
    try { localStorage.setItem('kanti_prefs', JSON.stringify({ ...prefs(), ...patch })); } catch (e) {}
  }
  applyPrefs();
}

/* ---------- Translations (site chrome and main headings; product details stay in English) ---------- */
const HI = {
  'Home': 'होम', 'Find your routine': 'अपना रूटीन खोजें', 'Retake quiz': 'क्विज़ दोबारा लें', 'My routine': 'मेरा रूटीन', 'Shop': 'दुकान',
  'Sign in': 'साइन इन', 'Account': 'खाता', 'Admin': 'एडमिन', 'Bag': 'बैग', 'Your bag': 'आपका बैग', 'Checkout': 'चेकआउट',
  'Good morning': 'सुप्रभात', 'Good afternoon': 'नमस्कार', 'Good evening': 'शुभ संध्या', 'Good night': 'शुभ रात्रि',
  'Take the 2-minute quiz and your day here becomes personal.': '2 मिनट का क्विज़ लें — फिर यह पेज आपके लिए होगा।',
  'morning routine': 'सुबह का रूटीन', 'evening routine': 'शाम का रूटीन', 'done today — lovely.': 'आज पूरा — बहुत बढ़िया।',
  'Time for your': 'समय है आपके', 'steps done': 'स्टेप पूरे', 'See my routine': 'मेरा रूटीन देखें', 'Start now': 'अभी शुरू करें',
  'day streak': 'दिन की लय', 'Season': 'ऋतु', 'you’re': 'आप', 'Today’s Ayurvedic tip': 'आज की आयुर्वेदिक सलाह',
  'Weather tips': 'मौसम के सुझाव', 'Get skincare tips for today’s weather where you are.': 'अपने शहर के आज के मौसम के हिसाब से स्किनकेयर सुझाव पाएँ।',
  'Use my location': 'मेरी लोकेशन इस्तेमाल करें', 'Your location is rounded to about 10 km and only used to look up the weather.': 'लोकेशन लगभग 10 किमी तक गोल की जाती है और सिर्फ़ मौसम देखने के लिए इस्तेमाल होती है।',
  'Checking the weather…': 'मौसम देख रहे हैं…', 'Turn off': 'बंद करें', 'Continue where you left off': 'जहाँ छोड़ा था वहीं से जारी रखें',
  'Finish your quiz': 'अपना क्विज़ पूरा करें', 'Question': 'प्रश्न', 'of': 'में से', 'items': 'आइटम', 'Last viewed': 'पिछली बार देखा',
  'Recently viewed': 'हाल ही में देखे गए', 'Popular with': 'लोकप्रिय —', 'skin this week': 'त्वचा वालों में इस हफ़्ते', 'Popular this week': 'इस हफ़्ते लोकप्रिय',
  'New': 'नया', 'Preferences': 'पसंद', 'Language': 'भाषा', 'Temperature': 'तापमान', 'Save': 'सहेजें',
  'Addresses': 'पते', 'Email preferences': 'ईमेल पसंद', 'Devices & sessions': 'डिवाइस और सत्र', 'Reviews': 'समीक्षाएँ',
  'Help & support': 'मदद और सहायता', 'Contact us': 'संपर्क करें', 'Skin journey': 'त्वचा की यात्रा', 'Notifications': 'सूचनाएँ',
  'Skincare that fits': 'स्किनकेयर जो मेल खाए', 'Our story': 'हमारी कहानी', 'your nature.': 'आपकी प्रकृति से।', 'Browse products': 'उत्पाद देखें',
};
function t(s) { return lang() === 'hi' && HI[s] ? HI[s] : s; }
// Elements in index.html marked data-i18n="Text" are translated in place.
function applyPrefs() {
  document.documentElement.lang = lang() === 'hi' ? 'hi' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  updateProfileChip();
}

/* ---------- Profile photo ---------- */
const avatarUrl = () => `/api/me/avatar?v=${encodeURIComponent((session.user && session.user.updated_at) || '')}${state.avatarBust || ''}`;
function avatarHTML(size) {
  const u = session.user; if (!u) return '';
  const initials = splitName(u.name).first.slice(0, 1).toUpperCase() + (splitName(u.name).last.slice(0, 1).toUpperCase());
  return u.has_avatar ? `<img class="avatar" src="${avatarUrl()}" alt="" width="${size}" height="${size}">`
    : `<span class="avatar initials" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px" aria-hidden="true">${esc(initials || '🌿')}</span>`;
}
function avatarPick(_v, _b, el) {
  const f = el.files && el.files[0]; if (!f) return;
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) && !/^image\//.test(f.type)) { toast('Please choose an image'); return; }
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = async () => {
    // Square-crop and shrink in the browser, so only a small JPEG is uploaded.
    const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
    URL.revokeObjectURL(url);
    try { await API.saveAvatar(c.toDataURL('image/jpeg', 0.85)); session.user.has_avatar = true; state.avatarBust = '&b=' + Date.now(); toast('Photo updated'); updateHeader(); render(); }
    catch (e) { toast(e.message); }
  };
  img.onerror = () => toast('That image couldn’t be read');
  img.src = url;
}
async function avatarRemove() {
  try { await API.deleteAvatar(); session.user.has_avatar = false; updateHeader(); render(); toast('Photo removed'); } catch (e) { toast(e.message); }
}

/* ---------- Account extras ---------- */
state.acct = { addresses: null, addrForm: null, emailPrefs: null, emailCats: null, tickets: null };
function loadAccountExtras() {
  const A = state.acct;
  if (!A.addresses) API.addresses().then((r) => { A.addresses = r.addresses; rerenderAccount(); }).catch(() => { A.addresses = []; });
  if (!A.emailPrefs) API.emailPrefs().then((r) => { A.emailPrefs = r.prefs; A.emailCats = r.categories; rerenderAccount(); }).catch(() => {});
  if (!A.tickets) API.tickets().then((r) => { A.tickets = r.tickets; rerenderAccount(); }).catch(() => { A.tickets = []; });
}
function rerenderAccount() { if (state.view === 'account') { const y = window.scrollY; render(); window.scrollTo(0, y); } }

function accountExtrasHTML() {
  loadAccountExtras();
  const A = state.acct, p = prefs(), r = p.reminders || {};
  const addrCard = `<div class="acct-card wide" id="addrCard">
    <div class="acct-card-head"><h3>${t('Addresses')}</h3>${A.addrForm ? '' : '<button class="link-btn" data-act="addrNew">+ Add address</button>'}</div>
    ${A.addrForm ? addressFormHTML(A.addrForm === 'new' ? {} : (A.addresses || []).find((a) => String(a.id) === String(A.addrForm)) || {}) : ''}
    ${A.addresses == null ? '<p class="muted-p pulse">Loading…</p>' : A.addresses.length ? `<div class="addr-grid">${A.addresses.map((a) => `
      <div class="addr ${a.is_default ? 'default' : ''}"><div class="addr-top"><b>${esc(a.label || 'Address')}</b>${a.is_default ? '<span class="badge-now">Default</span>' : ''}</div>
        <p>${[a.name, a.address, a.address2, [a.city, a.state].filter(Boolean).join(', ') + ' ' + (a.zip || ''), a.country].filter((x) => x && x.trim()).map(esc).join('<br>')}</p>
        <div class="addr-actions">${a.is_default ? '' : `<button class="link-btn" data-act="addrDefault" data-arg="${a.id}">Make default</button>`}
          <button class="link-btn" data-act="addrEdit" data-arg="${a.id}">Edit</button><button class="link-btn danger" data-act="addrDelete" data-arg="${a.id}">Delete</button></div></div>`).join('')}</div>`
      : '<p class="muted-p">No saved addresses yet — they’re added when you check out, or add one now.</p>'}
  </div>`;
  const prefsCard = `<div class="acct-card" id="prefsCard">
    <h3>${t('Preferences')}</h3>
    <div class="pref-row"><span>${t('Language')}</span><div class="seg">${[['en', 'English'], ['hi', 'हिन्दी']].map(([k, l]) => `<button class="${lang() === k ? 'on' : ''}" data-act="setLang" data-arg="${k}">${l}</button>`).join('')}</div></div>
    <div class="pref-row"><span>${t('Temperature')}</span><div class="seg">${[['c', '°C'], ['f', '°F']].map(([k, l]) => `<button class="${tempUnit() === k ? 'on' : ''}" data-act="setTempUnit" data-arg="${k}">${l}</button>`).join('')}</div></div>
    <div class="pref-row"><span>Theme</span><button class="btn btn-ghost btn-sm" data-act="toggleTheme">Light / dark</button></div>
    <div class="pref-sub">Routine reminders</div>
    <label class="toggle"><input type="checkbox" ${r.enabled ? 'checked' : ''} data-change="setRemindersOn"> Remind me to do my routine</label>
    <div class="field-row">
      <div class="field"><label for="prefAm">Morning</label><input type="time" id="prefAm" value="${esc(r.am || '07:30')}" data-change="setReminderTime" ${r.enabled ? '' : 'disabled'}></div>
      <div class="field"><label for="prefPm">Evening</label><input type="time" id="prefPm" value="${esc(r.pm || '21:30')}" data-change="setReminderTime" ${r.enabled ? '' : 'disabled'}></div>
    </div>
    <label class="toggle"><input type="checkbox" ${p.diary_nudge !== false ? 'checked' : ''} data-change="setDiaryNudge"> Evening skin-diary nudge</label>
    <small class="muted-p">Reminders arrive in the bell 🔔 (and on your devices if alerts are on), in your time zone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}.</small>
  </div>`;
  const emailCard = `<div class="acct-card"><h3>${t('Email preferences')}</h3>
    ${A.emailPrefs ? Object.entries(A.emailCats).map(([k, label]) => `<label class="toggle"><input type="checkbox" ${A.emailPrefs[k] ? 'checked' : ''} data-change="setEmailPref" data-arg="${k}"> ${esc(label)}</label>`).join('')
      + '<label class="toggle locked"><input type="checkbox" checked disabled> Order and account emails <small>(always sent)</small></label>'
      : '<p class="muted-p pulse">Loading…</p>'}
  </div>`;
  const supportCard = `<div class="acct-card" id="supportCard"><div class="acct-card-head"><h3>${t('Help & support')}</h3><button class="link-btn" data-go="contact">New request</button></div>
    ${A.tickets == null ? '<p class="muted-p pulse">Loading…</p>' : A.tickets.length ? A.tickets.slice(0, 5).map((tk) => `
      <button class="ticket-row" data-act="openTicket" data-arg="${esc(tk.ref)}"><span><b>${esc(tk.subject)}</b><small>${esc(tk.ref)} · ${fmtDate(tk.updated_at)}</small></span><span class="status-pill t-${esc(tk.status)}">${tk.status === 'waiting' ? 'replied' : esc(tk.status)}</span></button>`).join('')
      : '<p class="muted-p">No requests yet. Questions about an order, a product or your routine? We’re here.</p>'}
  </div>`;
  return `<div class="acct-grid extras">${prefsCard}${emailCard}${supportCard}</div>${addrCard}${devicesCardHTML()}`;
}
function addressFormHTML(a) {
  return `<form class="addr-form" novalidate data-submit="addrSave" data-arg="${a.id || 'new'}">
    <div class="form-msg" id="formMsg" role="alert"></div>
    <div class="field-row">${fieldHTML('a_label', 'Label (e.g. Home, Work)', a.label || '', 'maxlength="30"', true)}${fieldHTML('a_name', 'Full name', a.name || (session.user && session.user.name) || '', 'autocomplete="name"', true)}</div>
    ${fieldHTML('a_address', 'Street address', a.address || '', 'autocomplete="address-line1" required')}
    ${fieldHTML('a_address2', 'Apartment, suite, etc.', a.address2 || '', 'autocomplete="address-line2"', true)}
    <div class="field-row">${fieldHTML('a_city', 'City', a.city || '', 'autocomplete="address-level2" required')}${fieldHTML('a_state', 'State / region', a.state || '', 'autocomplete="address-level1"', true)}</div>
    <div class="field-row">${fieldHTML('a_zip', 'ZIP / Postcode', a.zip || '', 'autocomplete="postal-code" required')}${fieldHTML('a_country', 'Country', a.country || '', 'autocomplete="country-name"', true)}</div>
    ${fieldHTML('a_phone', 'Phone', a.phone || '', 'type="tel" autocomplete="tel"', true)}
    <label class="toggle"><input type="checkbox" id="a_default" ${a.is_default ? 'checked' : ''}> Use as my default address</label>
    <div style="display:flex;gap:10px;margin-top:8px"><button class="btn btn-primary btn-sm">Save address</button><button type="button" class="btn btn-ghost btn-sm" data-act="addrCancel">Cancel</button></div>
  </form>`;
}
function addrNew() { state.acct.addrForm = 'new'; rerenderAccount(); setTimeout(() => { const i = $('#f_a_address'); if (i) i.focus(); }, 30); }
function addrEdit(id) { state.acct.addrForm = id; rerenderAccount(); }
function addrCancel() { state.acct.addrForm = null; rerenderAccount(); }
async function addrSave(id) {
  const b = { label: fval('a_label'), name: fval('a_name'), address: fval('a_address'), address2: fval('a_address2'), city: fval('a_city'),
    state: fval('a_state'), zip: fval('a_zip'), country: fval('a_country'), phone: fval('a_phone'), is_default: !!($('#a_default') || {}).checked };
  const errs = {}; if (!b.address) errs.a_address = 'Required'; if (!b.city) errs.a_city = 'Required'; if (!b.zip) errs.a_zip = 'Required';
  showFieldErrors(errs); if (Object.keys(errs).length) return;
  try {
    const r = id === 'new' ? await API.addAddress(b) : await API.updateAddress(id, b);
    state.acct.addresses = r.addresses; state.acct.addrForm = null; toast('Address saved');
    if (b.is_default) { session.user = null; loadSession().catch(() => {}); }
    rerenderAccount();
  } catch (e) { formMsg(e.message); }
}
async function addrDefault(id) { try { state.acct.addresses = (await API.defaultAddress(id)).addresses; rerenderAccount(); toast('Default address updated'); } catch (e) { toast(e.message); } }
async function addrDelete(id) { try { state.acct.addresses = (await API.deleteAddress(id)).addresses; rerenderAccount(); toast('Address deleted'); } catch (e) { toast(e.message); } }

async function setLang(k) { await savePrefs({ lang: k }); render(); }
async function setTempUnit(k) { await savePrefs({ temp_unit: k }); render(); }
async function setRemindersOn(_v, _b, el) {
  const r = prefs().reminders || {};
  try { await savePrefs({ reminders: { ...r, enabled: el.checked, am: r.am || '07:30', pm: r.pm || '21:30' }, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); toast(el.checked ? 'Reminders on' : 'Reminders off'); rerenderAccount(); }
  catch (e) { toast(e.message); }
}
async function setReminderTime() {
  const r = prefs().reminders || {};
  try { await savePrefs({ reminders: { ...r, enabled: !!r.enabled, am: $('#prefAm').value, pm: $('#prefPm').value }, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); toast('Reminder times saved'); }
  catch (e) { toast(e.message); }
}
async function setDiaryNudge(_v, _b, el) { try { await savePrefs({ diary_nudge: el.checked }); } catch (e) { toast(e.message); } }
async function setEmailPref(cat, _b, el) {
  try { state.acct.emailPrefs = (await API.saveEmailPrefs({ [cat]: el.checked })).prefs; toast('Email preferences saved'); }
  catch (e) { toast(e.message); el.checked = !el.checked; }
}

/* ---------- Skin journey ---------- */
state.journey = { diary: null };
function renderJourney() {
  if (!ensureSession('journey')) return;
  const J = state.journey;
  if (!J.diary) { API.diary().then((r) => { J.diary = r.entries; if (state.view === 'journey') renderJourney(); }).catch((e) => { if (!handleAuthError(e, 'journey')) { J.diary = []; renderJourney(); } }); }
  const hist = (session.history || []).slice().reverse(); // oldest first
  const orders = (session.orders || []).filter((o) => o.status !== 'cancelled');
  const changes = hist.map((h, i) => {
    const prev = hist[i - 1];
    const bits = [];
    if (prev && prev.dosha !== h.dosha) bits.push(`${doshaLabel(prev.dosha)} → ${doshaLabel(h.dosha)}`);
    if (prev && prev.skinType !== h.skinType) bits.push(`${skinLabel(prev.skinType)} → ${skinLabel(h.skinType)} skin`);
    return { ...h, change: i === 0 ? 'First quiz' : bits.join(' · ') || 'No change' };
  });
  const first = hist[0], last = hist[hist.length - 1];
  app.innerHTML = `<div class="wrap routine-page">
    <div class="section-head" style="margin-bottom:22px"><div class="eyebrow">${t('Skin journey')}</div>
      <h2>How your skin has changed</h2>
      <p>Your quiz results over time, and how your skin diary moved when your routine changed.</p></div>
    ${hist.length ? `<div class="journey-sum">
      <div><small>First quiz</small><b>${skinLabel(first.skinType)} · ${doshaLabel(first.dosha)}</b><span>${fmtDate(first.date)}</span></div>
      <div class="arrow" aria-hidden="true">→</div>
      <div><small>Latest</small><b>${skinLabel(last.skinType)} · ${doshaLabel(last.dosha)}</b><span>${fmtDate(last.date)}</span></div>
      <div><small>Quizzes taken</small><b>${hist.length}</b></div><div><small>Diary entries</small><b>${J.diary ? J.diary.length : '…'}</b></div>
    </div>` : `<div class="empty-state"><div class="big">📝</div><p>Take the quiz to start your skin journey.</p><button class="btn btn-primary btn-sm" data-go="quiz">Take the quiz</button></div>`}
    ${J.diary ? journeyChartHTML(J.diary, hist, orders) : '<p class="muted-p pulse">Loading your diary…</p>'}
    ${changes.length ? `<section class="acct-card wide" style="margin-top:18px"><h3>Quiz history</h3>
      <ol class="timeline">${changes.slice().reverse().map((c) => `<li><span class="tl-dot" style="background:${DOSHA[c.dosha] ? DOSHA[c.dosha].color : 'var(--muted)'}"></span>
        <div><b>${skinLabel(c.skinType)} skin · ${doshaLabel(c.dosha)}</b>${c.concern ? ` <small>· goal: ${esc(c.concern)}</small>` : ''}<small class="tl-meta">${fmtDate(c.date)} · ${esc(c.change)}</small></div></li>`).join('')}</ol>
      <button class="btn btn-ghost btn-sm" data-go="quiz">Retake the quiz</button></section>` : ''}
  </div>${footerHTML()}`;
}
// Diary rating over the last 90 days (one series), with markers where the routine changed.
function journeyChartHTML(entries, hist, orders) {
  if (!entries.length) return `<section class="acct-card wide"><h3>Skin diary</h3><p class="muted-p">No diary entries yet. Log how your skin feels on the <button class="link-btn" data-go="routine">routine page</button> and your trend will appear here.</p></section>`;
  const days = 90, W = 720, H = 150, pad = 24, bw = (W - pad) / days;
  const start = new Date(); start.setDate(start.getDate() - (days - 1)); start.setHours(0, 0, 0, 0);
  const idx = (iso) => Math.floor((new Date(iso.slice(0, 10) + 'T00:00:00') - start) / 864e5);
  const bars = entries.map((e) => {
    const i = idx(e.day); if (i < 0 || i >= days) return '';
    const h = (e.rating / 5) * (H - 30), x = pad + i * bw;
    return `<rect x="${x + 0.5}" y="${H - h}" width="${Math.max(1.5, bw - 1)}" height="${h}" rx="1.5" class="d-fill"><title>${fmtDate(e.day)} — ${RATING[e.rating].t}${e.note ? ': ' + esc(e.note) : ''}</title></rect>`;
  }).join('');
  const marks = [
    ...hist.map((q) => ({ d: q.date, label: `Quiz: ${doshaLabel(q.dosha)}`, cls: 'm-quiz' })),
    ...orders.map((o) => ({ d: o.date, label: `Order ${o.order_no}`, cls: 'm-order' })),
  ].map((m) => {
    const i = idx(m.d); if (i < 0 || i >= days) return '';
    const x = pad + i * bw + bw / 2;
    return `<g class="${m.cls}"><line x1="${x}" x2="${x}" y1="10" y2="${H}"/><circle cx="${x}" cy="10" r="4"/><title>${fmtDate(m.d)} — ${esc(m.label)}</title></g>`;
  }).join('');
  const grid = [1, 3, 5].map((n) => { const y = H - (n / 5) * (H - 30); return `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" class="d-grid"/><text x="2" y="${y + 4}" class="d-axis">${n}</text>`; }).join('');
  return `<section class="acct-card wide"><div class="acct-card-head"><h3>Skin diary · last 90 days</h3>
      <div class="j-legend"><span><i class="lg-bar"></i>How your skin felt (1–5)</span><span><i class="lg-quiz"></i>Quiz retaken</span><span><i class="lg-order"></i>Order</span></div></div>
    <svg class="diary-chart" viewBox="0 0 ${W} ${H + 4}" role="img" aria-label="Daily skin rating over the last 90 days with quiz and order markers">${grid}${bars}${marks}</svg>
    <p class="muted-p">Hover a bar or marker for details. ${trendSentence(entries, hist)}</p></section>`;
}
function trendSentence(entries, hist) {
  const lastQuiz = hist.length > 1 ? hist[hist.length - 1].date.slice(0, 10) : null;
  if (!lastQuiz) return '';
  const avg = (l) => l.reduce((s, e) => s + e.rating, 0) / l.length;
  const before = entries.filter((e) => e.day < lastQuiz), after = entries.filter((e) => e.day >= lastQuiz);
  if (before.length < 3 || after.length < 3) return 'Keep logging — after a few more entries we’ll compare before and after your latest routine change.';
  const d = avg(after) - avg(before);
  return `Since your routine last changed, your average went from ${avg(before).toFixed(1)} to ${avg(after).toFixed(1)} (${d >= 0 ? '+' : ''}${d.toFixed(1)}).`;
}

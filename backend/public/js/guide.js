// Kanti storefront — guide.js
// "Ask Amu": Kanti's chat guide — Amu the peacock (India's national bird; "Amu" is Uma backwards). Answers come from POST /api/guide (Gemini with the shopper's skin
// profile and the live catalogue, or rules when the AI isn't available). Kept for this tab only.

state.guide = (() => {
  try { const g = JSON.parse(sessionStorage.getItem('kanti_guide') || 'null'); if (g && Array.isArray(g.msgs)) return { open: false, busy: false, msgs: g.msgs.slice(-20) }; } catch (e) {}
  return { open: false, busy: false, msgs: [] };
})();
function stashGuide() { try { sessionStorage.setItem('kanti_guide', JSON.stringify({ msgs: state.guide.msgs.slice(-20) })); } catch (e) {} }

function guideStarters() {
  const p = guideProfile();
  return p
    ? [`What should ${DOSHA[p.dosha].name} skin avoid?`, 'Find me a coconut cleanser outside Kanti', `Is turmeric good for ${SKIN_LABEL[p.skin].toLowerCase()} skin?`]
    : ['What’s my dosha?', 'What does neem do for skin?', 'I need a coconut cleanser outside of Kanti'];
}
function guideToggle() {
  const g = state.guide; g.open = !g.open;
  const panel = $('#guidePanel'), fab = $('#guideFab');
  panel.hidden = !g.open; fab.setAttribute('aria-expanded', g.open); fab.classList.toggle('open', g.open);
  if (g.open) { renderGuide(); setTimeout(() => { const i = $('#guideInput'); if (i) i.focus(); }, 30); }
}
function renderGuide() {
  const g = state.guide, panel = $('#guidePanel'); if (!panel || !g.open) return;
  const last = g.msgs[g.msgs.length - 1];
  const chips = !g.busy ? (g.msgs.length ? ((last && last.followups) || []) : guideStarters()) : [];
  panel.innerHTML = `
    <div class="gp-head"><div class="gp-id"><svg class="gp-avatar lg" aria-hidden="true"><use href="#amu-mark"/></svg><div><b>Ask Amu</b><small>${guideProfile() ? `Knows your ${esc(DOSHA[guideProfile().dosha].name)} · ${esc(SKIN_LABEL[guideProfile().skin].toLowerCase())} profile` : 'Kanti’s peacock skincare guide'}</small></div></div>
      <div>${g.msgs.length ? '<button class="link-btn" data-act="guideClear">Clear</button>' : ''}<button class="icon-btn" data-act="guideToggle" aria-label="Close">✕</button></div></div>
    <div class="gp-body" id="guideBody" aria-live="polite">
      ${g.msgs.length ? '' : `<div class="gp-msg guide"><svg class="gp-avatar" aria-hidden="true"><use href="#amu-mark"/></svg><p>Namaste 🦚 I’m Amu, Kanti’s peacock guide. Ask me about ingredients, your dosha, or which products suit you.</p></div>`}
      ${g.msgs.map((m) => `<div class="gp-msg ${m.role}">${m.role === 'guide' ? '<svg class="gp-avatar" aria-hidden="true"><use href="#amu-mark"/></svg>' : ''}<p>${esc(m.text).replace(/\n/g, '<br>')}</p>
        ${(m.products || []).filter((id) => prod(id)).map((id) => { const p = prod(id); return `<div class="gp-prod">
          <span class="thumb sm" style="background:${esc(p.bg)}">${productArt(p, 'thumb')}</span>
          <span><b>${esc(p.name)}</b><small>${money(p.price)}</small></span>
          <button class="link-btn" data-act="openModal" data-arg="${esc(p.id)}">View</button>
          <button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}" ${soldOut(p) ? 'disabled' : ''}>Add</button></div>`; }).join('')}
        ${m.needs_quiz ? `<div class="gp-quiz"><button class="btn btn-gold btn-sm" data-act="guideTakeQuiz">Take the 2-minute quiz</button><small>Then ask me again — I’ll check what suits you.</small></div>` : ''}
        ${m.outside ? guideOutsideHTML(m.outside) : ''}
      </div>`).join('')}
      ${g.busy ? '<div class="gp-msg guide"><svg class="gp-avatar" aria-hidden="true"><use href="#amu-mark"/></svg><div class="typing"><span></span><span></span><span></span></div></div>' : ''}
    </div>
    ${chips.length ? `<div class="gp-chips">${chips.map((c) => `<button class="pill" data-act="guideAsk" data-arg="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <form class="gp-form" data-submit="guideSend" novalidate>
      <input id="guideInput" maxlength="500" placeholder="Ask about ingredients, doshas, routines…" autocomplete="off" aria-label="Your question" ${g.busy ? 'disabled' : ''}>
      <button class="btn btn-primary btn-sm" ${g.busy ? 'disabled' : ''}>Send</button>
    </form>
    <p class="gp-note">Skincare guidance, not medical advice.</p>`;
  const b = $('#guideBody'); if (b) b.scrollTop = b.scrollHeight;
}
function guideSend() { const i = $('#guideInput'); const t = i ? i.value.trim() : ''; if (t) guideAsk(t); }
async function guideAsk(text) {
  const g = state.guide; if (g.busy || !text) return;
  g.msgs.push({ role: 'user', text: String(text).slice(0, 500) });
  g.busy = true; renderGuide();
  try {
    const prof = guideProfile();
    const r = await API.guide(g.msgs.map((m) => ({ role: m.role, text: m.text })), prof ? recoProfile(prof) : null);
    g.msgs.push({ role: 'guide', text: r.reply, products: r.products || [], followups: r.followups || [],
      needs_quiz: !!r.needs_quiz, outside: r.outside || null });
  } catch (e) {
    g.msgs.push({ role: 'guide', text: e.status === 429 ? 'You’ve asked a lot of questions — please try again in a little while.' : 'Sorry, I couldn’t answer just now. Please try again.' });
  }
  g.busy = false; stashGuide(); renderGuide();
  const i = $('#guideInput'); if (i) i.focus();
}
// The skin profile the chat uses: this visit's quiz, or the one saved on the account.
function guideProfile() { return state.profile || (session && session.skin ? profileFromSkin(session.skin) : null); }
function guideTakeQuiz() { guideToggle(); go('quiz'); }

// Outside-Kanti listings inside a chat reply: the fit verdict, then each option with its own fit.
const FIT_LABEL = { good: '✓ Good fit for you', caution: '⚠︎ Use with care', avoid: '✕ Not ideal for you' };
function fitBadge(fit) { return fit ? `<span class="fit-badge ${esc(fit)}">${FIT_LABEL[fit]}</span>` : ''; }
function guideOutsideHTML(o) {
  const items = (o.items || []).slice(0, 4);
  const link = (l) => { const h = safeHref(l.url); return h ? `<a href="${h}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.retailer)} ↗</a>` : ''; };
  return `<div class="gp-outside">
    ${o.verdict ? `<div class="gp-verdict ${esc(o.verdict.fit)}">${fitBadge(o.verdict.fit)}<p>${esc(o.verdict.why)}</p></div>` : ''}
    ${items.map((it) => `<div class="gp-out-item">
      <div class="goi-head"><b>${esc(it.title)}</b>${fitBadge(it.fit)}</div>
      ${it.fit_why ? `<p>${esc(it.fit_why)}</p>` : (it.why ? `<p>${esc(it.why)}</p>` : '')}
      ${(it.products || []).map((p) => p.kind === 'page'
        ? `<div class="goi-prod">✓ <b>${esc(p.name)}</b> ${link({ url: p.url, retailer: p.retailer })}</div>`
        : `<div class="goi-prod"><b>${esc(p.name)}</b> ${(p.links || []).map(link).join(' · ')}</div>`).join('')}
      <div class="goi-search">Search: ${(it.search || []).slice(0, 4).map(link).join(' · ')}</div>
    </div>`).join('')}
    <small class="gp-out-note">ⓘ ${esc(o.note || 'Not sold or reviewed by Kanti.')}</small>
  </div>`;
}

function guideClear() { state.guide.msgs = []; stashGuide(); renderGuide(); }

// First visit: Amu says hello once, so people know there's someone to ask.
function amuHello() {
  try { if (localStorage.getItem('kanti_amu_hi')) return; localStorage.setItem('kanti_amu_hi', '1'); } catch (e) { return; }
  setTimeout(() => {
    if (state.guide.open || document.getElementById('amuHello')) return;
    const b = document.createElement('div');
    b.id = 'amuHello'; b.className = 'amu-hello'; b.setAttribute('role', 'status');
    b.innerHTML = `<button class="amu-hello-open" data-act="amuHelloOpen"><b>Hi, I’m Amu 🦚</b><span>Ask me anything about your skin or your dosha.</span></button>
      <button class="amu-hello-x" data-act="amuHelloClose" aria-label="Dismiss">✕</button>`;
    document.body.appendChild(b);
    setTimeout(amuHelloClose, 12000);
  }, 3500);
}
function amuHelloClose() { const b = document.getElementById('amuHello'); if (b) b.remove(); }
function amuHelloOpen() { amuHelloClose(); if (!state.guide.open) guideToggle(); }

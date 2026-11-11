// Kanti storefront — guide.js
// "Ask Kanti": a small chat panel. Answers come from POST /api/guide (Gemini with the shopper's skin
// profile and the live catalogue, or rules when the AI isn't available). Kept for this tab only.

state.guide = (() => {
  try { const g = JSON.parse(sessionStorage.getItem('kanti_guide') || 'null'); if (g && Array.isArray(g.msgs)) return { open: false, busy: false, msgs: g.msgs.slice(-20) }; } catch (e) {}
  return { open: false, busy: false, msgs: [] };
})();
function stashGuide() { try { sessionStorage.setItem('kanti_guide', JSON.stringify({ msgs: state.guide.msgs.slice(-20) })); } catch (e) {} }

function guideStarters() {
  const p = state.profile;
  return p
    ? [`What should ${DOSHA[p.dosha].name} skin avoid?`, 'How do I layer my evening routine?', `Is turmeric good for ${SKIN_LABEL[p.skin].toLowerCase()} skin?`]
    : ['What’s my dosha?', 'What does neem do for skin?', 'Which products help with dullness?'];
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
    <div class="gp-head"><div><b>Ask Kanti</b><small>${state.profile ? `Knows your ${esc(DOSHA[state.profile.dosha].name)} · ${esc(SKIN_LABEL[state.profile.skin].toLowerCase())} profile` : 'Ayurvedic skincare guide'}</small></div>
      <div>${g.msgs.length ? '<button class="link-btn" data-act="guideClear">Clear</button>' : ''}<button class="icon-btn" data-act="guideToggle" aria-label="Close">✕</button></div></div>
    <div class="gp-body" id="guideBody" aria-live="polite">
      ${g.msgs.length ? '' : `<div class="gp-msg guide"><p>Namaste 🌿 Ask me about ingredients, your dosha, or which Kanti products suit you.</p></div>`}
      ${g.msgs.map((m) => `<div class="gp-msg ${m.role}"><p>${esc(m.text).replace(/\n/g, '<br>')}</p>
        ${(m.products || []).filter((id) => prod(id)).map((id) => { const p = prod(id); return `<div class="gp-prod">
          <span class="thumb sm" style="background:${esc(p.bg)}">${productArt(p, 'thumb')}</span>
          <span><b>${esc(p.name)}</b><small>${money(p.price)}</small></span>
          <button class="link-btn" data-act="openModal" data-arg="${esc(p.id)}">View</button>
          <button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}" ${soldOut(p) ? 'disabled' : ''}>Add</button></div>`; }).join('')}
      </div>`).join('')}
      ${g.busy ? '<div class="gp-msg guide typing"><span></span><span></span><span></span></div>' : ''}
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
    const r = await API.guide(g.msgs.map((m) => ({ role: m.role, text: m.text })), state.profile ? recoProfile(state.profile) : null);
    g.msgs.push({ role: 'guide', text: r.reply, products: r.products || [], followups: r.followups || [] });
  } catch (e) {
    g.msgs.push({ role: 'guide', text: e.status === 429 ? 'You’ve asked a lot of questions — please try again in a little while.' : 'Sorry, I couldn’t answer just now. Please try again.' });
  }
  g.busy = false; stashGuide(); renderGuide();
  const i = $('#guideInput'); if (i) i.focus();
}
function guideClear() { state.guide.msgs = []; stashGuide(); renderGuide(); }

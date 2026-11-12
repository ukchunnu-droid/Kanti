// Kanti storefront — support.js
// Contact form → support ticket, the ticket conversation (signed-in customers, or guests via the private
// link in their email), and the admin support inbox.

const TOPICS = { order: 'An order', product: 'A product or ingredient', routine: 'My routine or quiz', account: 'My account', other: 'Something else' };
state.support = { ticket: null, token: null, ref: null, sent: null };

function renderContact() {
  const u = session.user, orders = (session.orders || []).slice(0, 10);
  if (API.isAuthed() && !session.orders) { loadSession().then(() => { if (state.view === 'contact') renderContact(); }).catch(() => {}); }
  const sent = state.support.sent;
  app.innerHTML = `<div class="wrap contact"><div class="section-head" style="margin-bottom:22px"><div class="eyebrow">${t('Help & support')}</div>
    <h2>${t('Contact us')}</h2><p>Questions about an order, a product or your routine — we reply within one working day.</p></div>
    ${sent ? `<div class="acct-card sent"><h3>Thanks — we’ve got it ✓</h3><p>Your request <b>${esc(sent.ticket.ref)}</b> is open. We’ve emailed you a confirmation${sent.link ? ' with a private link to follow the conversation' : ''}.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${sent.link ? `<button class="btn btn-primary btn-sm" data-act="openGuestTicket" data-arg="${esc(sent.link.split('=')[1])}">View your request</button>` : `<button class="btn btn-primary btn-sm" data-act="openTicket" data-arg="${esc(sent.ticket.ref)}">View your request</button>`}
      <button class="btn btn-ghost btn-sm" data-act="contactAgain">Send another</button></div></div>` : `
    <form class="acct-card contact-form" novalidate data-submit="sendTicket">
      <div class="form-msg" id="formMsg" role="alert"></div>
      ${u ? `<p class="muted-p">Replying to <b>${esc(u.email)}</b></p>` : `<div class="field-row">${fieldHTML('c_name', 'Your name', '', 'autocomplete="name" required')}${fieldHTML('c_email', 'Email', '', 'type="email" autocomplete="email" required')}</div>`}
      <div class="field"><label for="c_topic">What’s it about?</label><select id="c_topic">${Object.entries(TOPICS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      ${orders.length ? `<div class="field"><label for="c_order">Order (optional)</label><select id="c_order"><option value="">— None —</option>${orders.map((o) => `<option value="${esc(o.order_no)}">${esc(o.order_no)} · ${fmtDate(o.date)} · ${money(o.total)}</option>`).join('')}</select></div>` : ''}
      ${fieldHTML('c_subject', 'Subject', '', 'maxlength="120"', true)}
      <div class="field" data-f="c_message"><label for="f_c_message">Message</label><textarea id="f_c_message" rows="6" maxlength="4000" placeholder="Tell us what’s happening…"></textarea><div class="field-err" id="e_c_message"></div></div>
      <button class="btn btn-primary" id="ticketBtn">Send message</button>
      <small class="muted-p">For anything urgent about a reaction to a product, stop using it and see a doctor or dermatologist.</small>
    </form>`}
  </div>${footerHTML()}`;
}
async function sendTicket() {
  const errs = {}, u = session.user;
  const body = { topic: $('#c_topic').value, order_no: ($('#c_order') || {}).value || '', subject: fval('c_subject'), message: ($('#f_c_message') || {}).value || '' };
  if (!u) { body.name = fval('c_name'); body.email = fval('c_email'); if (!body.name) errs.c_name = 'Please tell us your name.'; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errs.c_email = 'Please enter a valid email.'; }
  if (body.message.trim().length < 10) errs.c_message = 'Please describe what you need (at least 10 characters).';
  showFieldErrors(errs); if (Object.keys(errs).length) return;
  await withBusy($('#ticketBtn'), 'Sending…', async () => {
    try { state.support.sent = await API.openTicket(body); state.acct.tickets = null; renderContact(); window.scrollTo({ top: 0 }); }
    catch (e) { formMsg(e.message); }
  });
}
function contactAgain() { state.support.sent = null; renderContact(); }

function openTicket(ref) { location.hash = 'support=' + ref; }
function openGuestTicket(token) { location.hash = 'ticket=' + token; }
async function renderTicket() {
  const S = state.support;
  if (!S.ticket || (S.ref && S.ticket.ref !== S.ref)) {
    app.innerHTML = `<div class="checkout"><div class="empty-state"><div class="big">💬</div><p>Loading your request…</p></div></div>`;
    try { S.ticket = (S.token ? await API.guestTicket(S.token) : await API.ticket(S.ref)).ticket; }
    catch (e) {
      if (handleAuthError(e, 'account')) return;
      app.innerHTML = `<div class="checkout"><div class="empty-state"><div class="big">🔒</div><p>${esc(e.message)}</p><button class="btn btn-primary btn-sm" data-go="contact">Contact us</button></div></div>`; return;
    }
    if (state.view !== 'ticket') return;
  }
  const tk = S.ticket;
  app.innerHTML = `<div class="wrap contact"><div class="section-head" style="margin-bottom:18px"><div class="eyebrow">Support request ${esc(tk.ref)}</div>
    <h2>${esc(tk.subject)}</h2><p>${esc(tk.topic_label)}${tk.order_no ? ' · order ' + esc(tk.order_no) : ''} · <span class="status-pill t-${esc(tk.status)}">${tk.status === 'waiting' ? 'we replied' : esc(tk.status)}</span></p></div>
    <div class="thread">${tk.messages.map((m) => `<div class="msg ${m.author}"><div class="msg-who">${m.author === 'staff' ? '<svg class="gp-avatar" aria-hidden="true"><use href="#kanti-mark"/></svg> Kanti support' : 'You'} · ${fmtDate(m.created_at)}</div><p>${esc(m.body).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>
    ${tk.status === 'closed' ? '<p class="muted-p">This request is closed. Reply below to reopen it.</p>' : ''}
    <form class="acct-card reply-form" novalidate data-submit="replyTicket">
      <textarea id="replyBody" rows="3" maxlength="4000" placeholder="Write a reply…"></textarea>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="replyBtn">Send reply</button>
      ${tk.status !== 'closed' ? '<button type="button" class="link-btn" data-act="closeTicket">My issue is solved — close it</button>' : ''}</div>
    </form>
  </div>${footerHTML()}`;
}
async function replyTicket() {
  const S = state.support, text = ($('#replyBody') || {}).value || '';
  if (text.trim().length < 2) { toast('Please write a message'); return; }
  await withBusy($('#replyBtn'), 'Sending…', async () => {
    try { S.ticket = (S.token ? await API.replyGuestTicket(S.token, { message: text }) : await API.replyTicket(S.ref, { message: text })).ticket; renderTicket(); toast('Reply sent'); }
    catch (e) { toast(e.message); }
  });
}
async function closeTicket() {
  const S = state.support;
  try { S.ticket = (S.token ? await API.replyGuestTicket(S.token, { close: true }) : await API.replyTicket(S.ref, { close: true })).ticket; renderTicket(); toast('Request closed — glad it’s sorted'); }
  catch (e) { toast(e.message); }
}

/* ---------- Admin: support inbox ---------- */
function adminSupportHTML() {
  const A = state.admin;
  if (A.ticketOpen) return adminTicketHTML();
  const list = A.tickets || [], f = A.ticketFilter || 'open', c = A.ticketCounts || {};
  return `<div class="admin-bar"><div class="filters">${[['open', 'Needs reply'], ['waiting', 'Waiting on customer'], ['closed', 'Closed'], ['', 'All']].map(([k, l]) => `<button class="pill ${f === k ? 'active' : ''}" data-act="adminTicketFilter" data-arg="${k}">${l}${k && c[k] ? ` <span class="pill-n">${c[k]}</span>` : ''}</button>`).join('')}</div></div>
    ${list.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Request</th><th>From</th><th>Topic</th><th>Updated</th><th></th></tr></thead><tbody>
      ${list.map((tk) => `<tr><td><b>${esc(tk.subject)}</b><br><small>${esc(tk.ref)}${tk.order_no ? ' · ' + esc(tk.order_no) : ''} · ${tk.message_count} message${tk.message_count === 1 ? '' : 's'}</small></td>
        <td>${esc(tk.name)}<br><small>${esc(tk.email)}</small></td><td>${esc(tk.topic_label)}</td><td>${fmtDate(tk.updated_at)}<br><small>${tk.last_author === 'customer' ? '⏳ customer wrote last' : 'you replied'}</small></td>
        <td><button class="btn btn-ghost btn-sm" data-act="adminOpenTicket" data-arg="${esc(tk.ref)}">Open</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><div class="big">💬</div><p>No requests here.</p></div>'}`;
}
function adminTicketHTML() {
  const tk = state.admin.ticketOpen;
  return `<button class="link-btn" data-act="adminCloseTicketView">← All requests</button>
    <div class="section-head" style="margin:10px 0 14px"><h2 style="font-size:24px">${esc(tk.subject)}</h2>
      <p>${esc(tk.ref)} · ${esc(tk.name)} &lt;${esc(tk.email)}&gt; · ${esc(tk.topic_label)}${tk.order_no ? ' · order <b>' + esc(tk.order_no) + '</b>' : ''} · <span class="status-pill t-${esc(tk.status)}">${esc(tk.status)}</span></p></div>
    <div class="thread">${tk.messages.map((m) => `<div class="msg ${m.author === 'staff' ? 'customer' : 'staff'}"><div class="msg-who">${m.author === 'staff' ? 'Kanti (you)' : esc(tk.name)} · ${fmtDate(m.created_at)}</div><p>${esc(m.body).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>
    <form class="acct-card reply-form" novalidate data-submit="adminReplyTicket">
      <textarea id="adminReply" rows="4" maxlength="4000" placeholder="Reply to ${esc(tk.name)} — they’ll get it by email"></textarea>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="adminReplyBtn">Send reply</button>
        <label class="toggle"><input type="checkbox" id="adminReplyClose"> Close after replying</label>
        ${tk.status !== 'closed' ? '<button type="button" class="link-btn" data-act="adminTicketStatus" data-arg="closed">Close without replying</button>' : '<button type="button" class="link-btn" data-act="adminTicketStatus" data-arg="open">Reopen</button>'}</div>
    </form>`;
}
function adminTicketFilter(k) { state.admin.ticketFilter = k; state.admin.tickets = null; renderAdmin(); }
async function adminOpenTicket(ref) {
  try { state.admin.ticketOpen = (await API.admin.ticket(ref)).ticket; renderAdmin(); } catch (e) { toast(e.message); }
}
function adminCloseTicketView() { state.admin.ticketOpen = null; state.admin.tickets = null; renderAdmin(); }
async function adminReplyTicket() {
  const tk = state.admin.ticketOpen, text = $('#adminReply').value;
  if (text.trim().length < 2) { toast('Please write a reply'); return; }
  await withBusy($('#adminReplyBtn'), 'Sending…', async () => {
    try { state.admin.ticketOpen = (await API.admin.replyTicket(tk.ref, text, $('#adminReplyClose').checked)).ticket; toast('Reply sent and emailed'); renderAdmin(); }
    catch (e) { toast(e.message); }
  });
}
async function adminTicketStatus(status) {
  const tk = state.admin.ticketOpen;
  try { await API.admin.setTicketStatus(tk.ref, status); state.admin.ticketOpen = (await API.admin.ticket(tk.ref)).ticket; renderAdmin(); } catch (e) { toast(e.message); }
}

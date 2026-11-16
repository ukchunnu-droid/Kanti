// Kanti storefront — app.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* ---------- Event delegation ----------
   No inline onclick="…" anywhere (so the security policy can forbid inline scripts).
   Elements say what they do with data attributes, handled here:
     data-go="shop"                     → go('shop')  (also closes the bag)
     data-act="name" data-arg data-arg2 → ACTIONS.name(arg, arg2, element, event)
     <form data-submit="name">          → ACTIONS.name(arg, null, form, event)
     data-input / data-change="name"    → ACTIONS.name(value, null, element, event) */
const ACTIONS = {
  // navigation & chrome
  openCart, closeCart, toggleTheme, skipSplash: () => hideSplash(true), closeModal, reload: () => location.reload(), render: () => render(),
  openModal: (id) => openModal(id),
  flip: (_a, _b, el) => el.classList.toggle('flipped'),
  // quiz & routine
  answer: (i) => { const o = quizOptions(state.qStep)[Number(i)]; if (o) answer(o); }, otherText,
  nextQ, prevQ, addWholeRoutine, viewSavedRoutine, shareResult, downloadShare, copyShareText,
  setTod: (v) => { state.tod = v === 'PM' ? 'PM' : 'AM'; renderResults(); },
  toggleStep: (tod, idx) => toggleStep(tod, Number(idx)),
  // bag
  addToCart: (id) => addToCart(id), removeLine: (id) => removeLine(id),
  changeQty: (id, d) => changeQty(id, Number(d)),
  restartQuiz, retryBeyond, addFromBag, simPlay, simSlide, simTone,
  // shop, saved, compare, alerts
  shopFilter, shopSearch, shopSort, clearShopFilters, openFilters, closeFilters, shopBeyondSearch, shopBeyondRetry,
  toggleWish, moveWishToBag, compareWish, toggleCompare, clearCompare, notifyMe, notifySubmit: (id) => notifySubmit(id),
  // routine page, diary, reminders
  setReminder, downloadReminders, diaryRate, diaryTag, diaryNote, diarySave, diarySignIn,
  // Ask Kanti
  guideToggle, guideSend, guideClear, guideTakeQuiz, amuHelloOpen, amuHelloClose, guideAsk: (t) => guideAsk(t),
  // auth, checkout, account
  submitAuth: (view) => submitAuth(view), placeOrder, saveProfileEdits, changePassword, deleteAccount, signOut,
  fmtCard: (_v, _b, el) => fmtCard(el), fmtExp: (_v, _b, el) => fmtExp(el),
  editProfile: () => { state.editProfile = true; state.acctForm = null; render(); },
  cancelEdit: () => { state.editProfile = false; render(); },
  toggleAcctForm: (f) => { state.acctForm = state.acctForm === f ? null : f; state.editProfile = false; render(); },
  reorder: (no) => reorder(no), openOrderEmail: (no) => openOrderEmail(no), cancelOrder, resendVerification,
  // sessions, notifications
  idleStay, idleSignOut, closeNotice, noticeSignIn, signOutDevice, signOutOthers,
  toggleBell, openNote: (id) => openNote(id), readAllNotes, openReminderSettings, pushOn, pushOff, pushTest,
  // home, account extras
  weatherOn, weatherOff, avatarPick, avatarRemove, addrNew, addrEdit, addrCancel, addrSave: (id) => addrSave(id), addrDefault, addrDelete,
  setLang, setTempUnit, setRemindersOn, setReminderTime, setDiaryNudge, setEmailPref, useSavedAddress,
  // reviews, support
  revFilter, revWrite, revCancel, revRate, revSignIn, revSubmit, sendTicket, contactAgain, openTicket, openGuestTicket, replyTicket, closeTicket,
  // admin
  adminReviewFilter, adminModerate, adminAnalyticsDays, adminTicketFilter, adminOpenTicket, adminCloseTicketView, adminReplyTicket, adminTicketStatus, adminAnnounce,
  adminTab, adminEditProduct, adminCancelEdit, adminSaveProduct, adminToggleProduct, adminDeleteProduct,
  adminOrderFilter, adminSetStatus, adminBackup, adminRetryEmails, adminArtPreview, adminClearAiCache,
};
function runAction(name, a, b, el, e) {
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : null;
  if (!fn) { console.warn('Unknown action:', name); return; }
  Promise.resolve(fn(a, b, el, e)).catch((err) => { console.error(err); toast('Something went wrong — please try again.'); });
}
document.addEventListener('click', (e) => {
  if (e.target.id === 'overlay') { closeModal(); return; } // click outside the modal
  const el = e.target.closest('[data-go],[data-act]');
  if (!el || el.disabled) return;
  if (el.tagName === 'BUTTON' || el.tagName === 'A') e.preventDefault();
  if (el.dataset.go) { closeCart(); go(el.dataset.go); return; }
  runAction(el.dataset.act, el.dataset.arg, el.dataset.arg2, el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]'); if (!f) return;
  e.preventDefault();
  runAction(f.dataset.submit, f.dataset.arg, null, f, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]'); if (el) runAction(el.dataset.input, el.value, null, el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]'); if (el) runAction(el.dataset.change, el.value, null, el, e);
});
// Keyboard: the clickable product cards (divs) open on Enter/Space too.
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('div[data-act]')) {
    e.preventDefault(); runAction(e.target.dataset.act, e.target.dataset.arg, e.target.dataset.arg2, e.target, e);
  }
  if (e.key === 'Escape') { closeModal(); closeCart(); closeFilters(); closeNotice(); if (state.guide.open) guideToggle(); const bp = $('#bellPanel'); if (bp) bp.hidden = true; }
});

/* ---------- Opening blossom ----------
   The splash in index.html plays while the shop loads. It stays at least until the blossom has
   opened (~1.7s from page load; 0.3s with reduced motion), then fades away. Click skips it. */
function hideSplash(now) {
  const s = document.getElementById('splash'); if (!s || s.classList.contains('done')) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = now ? 0 : Math.max(0, (reduce ? 300 : 1700) - performance.now());
  setTimeout(() => {
    s.classList.add('done'); document.body.classList.remove('splashing');
    setTimeout(() => s.remove(), 600);
  }, wait);
}

/* ---------- Boot ---------- */
(async function boot(){
  try{ localStorage.removeItem('kanti_token'); }catch(e){} // tokens are no longer kept in page storage
  updateHeader();
  app.innerHTML=`<div class="checkout"><div class="empty-state"><div class="big">🌿</div><p>Loading…</p></div></div>`;
  try{
    const r=await API.products();
    PRODUCTS=r.products; SHIPPING=r.shipping||SHIPPING; RATINGS=r.ratings||{}; POPULAR=r.popular||{};
  }catch(e){
    app.innerHTML=`<div class="checkout"><div class="empty-state"><div class="big">⚠️</div>
      <p>Couldn’t load the shop — is the Kanti server running?</p>
      <button class="btn btn-primary btn-sm" style="margin-top:14px" data-act="reload">Try again</button></div></div>`;
    hideSplash();
    return;
  }
  applyPrefs();
  restoreState();
  restoreReco();
  liveRestart();
  updateCartCount(false);
  syncWishlist();
  if(API.isAuthed()){
    // Signed in from an earlier visit: load the saved bag and routine.
    API.cart().then(r=>{setCartFromServer(r.items);if(state.view==='checkout')render();})
      .catch(e=>{if(e.status===401){resetSession();updateHeader();}});
    syncRoutine();
    loadSession().then(()=>{updateHeader();applyPrefs();}).catch(()=>{}); // shows the Admin link for the admin
    startIdle(); loadNotifications();
  }
  go(viewFromHash());
  hideSplash();
  amuHello();
  window.addEventListener('hashchange',()=>{const v=viewFromHash(); if(v!==state.view) go(v);});
})();

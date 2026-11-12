// Tiny client for the Kanti backend.
// The session lives in an httpOnly cookie the browser sends automatically — page scripts never
// see the token. isAuthed() reads a harmless hint cookie that only says "someone is signed in";
// the server is always the real check (a 401 means the session is gone).
const API = {
  // Identifies this tab, so live updates caused here aren't echoed back to it.
  tab: Math.random().toString(36).slice(2, 12),
  isAuthed() { return /(?:^|;\s*)kanti_signed_in=1(?:;|$)/.test(document.cookie); },

  async req(path, method = 'GET', body) {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { 'X-Kanti-Tab': this.tab } : { 'Content-Type': 'application/json', 'X-Kanti-Tab': this.tab },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status; // 401 → signed out / session expired
      err.reason = data.reason || null; // 'idle' | 'revoked' | 'expired'
      throw err;
    }
    return data;
  },

  // auth
  signup(d) { return this.req('/api/auth/signup', 'POST', d); },
  login(d) { return this.req('/api/auth/login', 'POST', d); },
  logout() { return this.req('/api/auth/logout', 'POST'); },
  forgot(email) { return this.req('/api/auth/forgot', 'POST', { email }); },
  reset(token, password) { return this.req('/api/auth/reset', 'POST', { token, password }); },
  verifyEmail(token) { return this.req('/api/auth/verify', 'POST', { token }); },
  resendVerification() { return this.req('/api/auth/verify/resend', 'POST'); },

  // profile
  me() { return this.req('/api/me'); },
  updateMe(d) { return this.req('/api/me', 'PATCH', d); },
  changePassword(current, next) { return this.req('/api/me/password', 'POST', { current, next }); },
  deleteAccount(password) { return this.req('/api/me', 'DELETE', { password }); },

  // catalogue + saved bag
  products() { return this.req('/api/products'); },
  cart() { return this.req('/api/cart'); },
  saveCart(items) { return this.req('/api/cart', 'PUT', { items }); },
  mergeCart(items) { return this.req('/api/cart/merge', 'POST', { items }); },

  // quiz + routine
  classify(answers) { return this.req('/api/quiz/classify', 'POST', { answers }); },
  saveQuizResult(r) { return this.req('/api/quiz/results', 'POST', r); },
  quizHistory() { return this.req('/api/quiz/history'); },
  routine() { return this.req('/api/routine'); },
  saveRoutine(r) { return this.req('/api/routine', 'PUT', r); },

  // AI recommendations + chat
  recommend(profile) { return this.req('/api/recommend', 'POST', { profile }); },
  beyond(profile) { return this.req('/api/recommend/beyond', 'POST', { profile }); },
  searchBeyond(q, profile) { return this.req('/api/search/beyond', 'POST', { q, profile }); },
  guide(messages, profile) { return this.req('/api/guide', 'POST', { messages, profile }); },

  // wishlist, stock alerts, skin diary
  wishlist() { return this.req('/api/wishlist'); },
  wishAdd(id) { return this.req('/api/wishlist/' + encodeURIComponent(id), 'PUT'); },
  wishRemove(id) { return this.req('/api/wishlist/' + encodeURIComponent(id), 'DELETE'); },
  wishMerge(items) { return this.req('/api/wishlist/merge', 'POST', { items }); },
  notifyMe(id, email) { return this.req('/api/products/' + encodeURIComponent(id) + '/notify', 'POST', { email }); },
  diary() { return this.req('/api/diary'); },
  saveDiary(day, e) { return this.req('/api/diary/' + encodeURIComponent(day), 'PUT', e); },
  deleteDiary(day) { return this.req('/api/diary/' + encodeURIComponent(day), 'DELETE'); },

  // session, devices, notifications, push
  session() { return this.req('/api/session'); },
  ping(active) { return this.req('/api/session/ping', 'POST', { active }); },
  sessions() { return this.req('/api/me/sessions'); },
  endSession(id) { return this.req('/api/me/sessions/' + encodeURIComponent(id), 'DELETE'); },
  endOtherSessions() { return this.req('/api/me/sessions/sign-out-others', 'POST'); },
  notifications() { return this.req('/api/notifications'); },
  readNotifications(id) { return this.req('/api/notifications/read', 'POST', { id }); },
  pushSubscribe(subscription) { return this.req('/api/push/subscribe', 'POST', { subscription }); },
  pushUnsubscribe(endpoint) { return this.req('/api/push/unsubscribe', 'POST', { endpoint }); },
  pushTest() { return this.req('/api/push/test', 'POST'); },

  // account extras
  addresses() { return this.req('/api/me/addresses'); },
  addAddress(a) { return this.req('/api/me/addresses', 'POST', a); },
  updateAddress(id, a) { return this.req('/api/me/addresses/' + id, 'PATCH', a); },
  defaultAddress(id) { return this.req('/api/me/addresses/' + id + '/default', 'POST'); },
  deleteAddress(id) { return this.req('/api/me/addresses/' + id, 'DELETE'); },
  emailPrefs() { return this.req('/api/me/email-prefs'); },
  saveEmailPrefs(prefs) { return this.req('/api/me/email-prefs', 'PUT', { prefs }); },
  savePrefs(p) { return this.req('/api/me/prefs', 'PATCH', p); },
  saveAvatar(image) { return this.req('/api/me/avatar', 'PUT', { image }); },
  deleteAvatar() { return this.req('/api/me/avatar', 'DELETE'); },
  weather(lat, lon) { return this.req(`/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`); },

  // reviews, analytics, support
  reviews(id, dosha) { return this.req('/api/products/' + encodeURIComponent(id) + '/reviews' + (dosha ? '?dosha=' + dosha : '')); },
  writeReview(id, r) { return this.req('/api/products/' + encodeURIComponent(id) + '/reviews', 'POST', r); },
  track(anon_id, events) { return this.req('/api/track', 'POST', { anon_id, events }); },
  openTicket(t) { return this.req('/api/support/tickets', 'POST', t); },
  tickets() { return this.req('/api/support/tickets'); },
  ticket(ref) { return this.req('/api/support/tickets/' + encodeURIComponent(ref)); },
  replyTicket(ref, b) { return this.req('/api/support/tickets/' + encodeURIComponent(ref) + '/messages', 'POST', b); },
  guestTicket(token) { return this.req('/api/support/access/' + encodeURIComponent(token)); },
  replyGuestTicket(token, b) { return this.req('/api/support/access/' + encodeURIComponent(token) + '/messages', 'POST', b); },

  // orders
  createOrder(d) { return this.req('/api/orders', 'POST', d); },
  orders() { return this.req('/api/orders'); },
  order(no) { return this.req('/api/orders/' + encodeURIComponent(no)); },
  cancelOrder(no) { return this.req('/api/orders/' + encodeURIComponent(no) + '/cancel', 'POST'); },

  // admin (ADMIN_EMAIL account only)
  admin: {
    stats() { return API.req('/api/admin/stats'); },
    products() { return API.req('/api/admin/products'); },
    createProduct(d) { return API.req('/api/admin/products', 'POST', d); },
    updateProduct(id, d) { return API.req('/api/admin/products/' + encodeURIComponent(id), 'PATCH', d); },
    deleteProduct(id) { return API.req('/api/admin/products/' + encodeURIComponent(id), 'DELETE'); },
    orders(status) { return API.req('/api/admin/orders' + (status ? '?status=' + encodeURIComponent(status) : '')); },
    setOrderStatus(no, status, tracking_no) { return API.req('/api/admin/orders/' + encodeURIComponent(no), 'PATCH', { status, tracking_no }); },
    emails() { return API.req('/api/admin/emails'); },
    retryEmails() { return API.req('/api/admin/emails/retry', 'POST'); },
    backup() { return API.req('/api/admin/backup', 'POST'); },
    clearAiCache() { return API.req('/api/admin/ai-cache/clear', 'POST'); },
    reviews(status) { return API.req('/api/admin/reviews' + (status ? '?status=' + status : '')); },
    moderateReview(id, status) { return API.req('/api/admin/reviews/' + id, 'PATCH', { status }); },
    analytics(days) { return API.req('/api/admin/analytics?days=' + days); },
    tickets(status) { return API.req('/api/admin/tickets' + (status ? '?status=' + status : '')); },
    ticket(ref) { return API.req('/api/admin/tickets/' + encodeURIComponent(ref)); },
    replyTicket(ref, message, close) { return API.req('/api/admin/tickets/' + encodeURIComponent(ref) + '/reply', 'POST', { message, close }); },
    setTicketStatus(ref, status) { return API.req('/api/admin/tickets/' + encodeURIComponent(ref), 'PATCH', { status }); },
    announce(id) { return API.req('/api/admin/products/' + encodeURIComponent(id) + '/announce', 'POST'); },
  },
};

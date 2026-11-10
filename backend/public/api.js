// Tiny client for the Kanti backend.
// The session lives in an httpOnly cookie the browser sends automatically — page scripts never
// see the token. isAuthed() reads a harmless hint cookie that only says "someone is signed in";
// the server is always the real check (a 401 means the session is gone).
const API = {
  isAuthed() { return /(?:^|;\s*)kanti_signed_in=1(?:;|$)/.test(document.cookie); },

  async req(path, method = 'GET', body) {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status; // 401 → signed out / session expired
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

  // orders
  createOrder(d) { return this.req('/api/orders', 'POST', d); },
  orders() { return this.req('/api/orders'); },
  order(no) { return this.req('/api/orders/' + encodeURIComponent(no)); },
};

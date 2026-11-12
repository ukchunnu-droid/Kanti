// Kanti storefront — account.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* ---------- Email verification ---------- */
function verifyBannerHTML(){
  const u=session.user; if(!u||u.email_verified_at) return '';
  return `<div class="verify-banner" role="status">📧 Please confirm your email — we sent a link to <b>${esc(u.email)}</b> so your order updates reach you.
    <button class="link-btn" data-act="resendVerification">Send it again</button></div>`;
}
async function resendVerification(_a,_b,el){
  if(el) el.disabled=true;
  try{ await API.resendVerification(); toast('Confirmation email sent'); }
  catch(e){ if(!handleAuthError(e,state.view)) toast(e.message); if(el) el.disabled=false; }
}
// Opened from the link in the confirmation email (works signed in or not).
function renderVerify(){
  app.innerHTML=`<div class="auth"><div class="auth-card" style="text-align:center"><div class="big" style="font-size:40px">🌿</div><p>Confirming your email…</p></div></div>`;
  const token=state.verifyToken; state.verifyToken=null;
  if(!token){go('home');return;}
  API.verifyEmail(token).then(()=>{
    if(session.user) session.user.email_verified_at=new Date().toISOString();
    app.innerHTML=`<div class="auth"><div class="auth-card" style="text-align:center">
      <div class="seal-sm">✓</div><h1>Email confirmed</h1><p class="sub">Thanks — your order updates will reach you.</p>
      <button class="btn btn-primary" data-go="${API.isAuthed()?'account':'shop'}">${API.isAuthed()?'Go to my account':'Start shopping'}</button></div></div>${footerHTML()}`;
  }).catch(e=>{
    app.innerHTML=`<div class="auth"><div class="auth-card" style="text-align:center">
      <h1>Link didn’t work</h1><p class="sub">${esc(e.message)}</p>
      <button class="btn btn-primary" data-go="account">Go to my account</button></div></div>${footerHTML()}`;
  });
}

/* ---------- Privacy ---------- */
function renderPrivacy(){
  app.innerHTML=`<div class="wrap privacy">
    <div class="section-head"><div class="eyebrow">Privacy</div><h2>What Kanti keeps about you</h2>
      <p>Kanti is a student project (SCAD Marketing). This page explains, in plain words, what the app stores and why.</p></div>
    <div class="privacy-body">
      <h3>What we store</h3>
      <ul>
        <li><b>Your account:</b> name, email, and a securely hashed password (we never see or store your actual password).</li>
        <li><b>Shipping details</b> you choose to save: phone, address.</li>
        <li><b>Your skin quiz results</b> (skin type, dosha, goal, suggested ingredients) so your routine is ready next time.</li>
        <li><b>Your bag, routine checklist and streak,</b> so they follow you across devices.</li>
        <li><b>Your orders</b> and the emails we send about them.</li>
        <li><b>Signed-in devices:</b> browser type, the first part of your network address and when each was last active — so you can see and sign out devices. Sessions end after inactivity.</li>
        <li><b>Optional extras you add:</b> saved addresses, a profile photo, preferences, reminder times, skin-diary entries, reviews (shown with your first name and last initial), support messages and notification subscriptions.</li>
        <li><b>Anonymous usage counts:</b> a random id in your browser and what you did (e.g. “started the quiz”, a search phrase) — first-party only, kept 180 days. “Do Not Track” turns it off.</li>
      </ul>
      <h3>What we don’t do</h3>
      <ul>
        <li>No payment details: this is a demo store and card numbers never leave your browser.</li>
        <li>No selling or sharing your data, no advertising trackers.</li>
      </ul>
      <h3>Who processes it</h3>
      <ul>
        <li>Quiz answers may be sent to Google’s Gemini AI to work out your skin profile (answers only — not your name or email).</li>
        <li>Emails are sent through our email provider; marketing emails always have a one-click unsubscribe.</li>
        <li>Weather tips (only if you turn them on) send a location rounded to about 10 km to Open-Meteo, which needs no account.</li>
        <li>Device alerts (only if you turn them on) are delivered through your browser’s push service.</li>
      </ul>
      <h3>Cookies</h3>
      <p>One essential cookie keeps you signed in, and a second one just tells the page you’re signed in. No tracking cookies.</p>
      <h3>Your choices</h3>
      <ul>
        <li><b>Download everything</b> we have about you from your account page (“Download my data”).</li>
        <li><b>Edit</b> your details any time, or <b>delete your account</b> — that permanently removes your profile, orders, quiz history and saved bag.</li>
      </ul>
      <p class="muted-p">Questions? Contact the project team.</p>
    </div>
  </div>${footerHTML()}`;
}

/* ---------- Form helpers ---------- */
// A labelled input with a slot for its own error message.
function fieldHTML(id,label,value,attrs,optional){
  return `<div class="field" data-f="${id}"><label for="f_${id}">${label}${optional?' <span class="opt">(optional)</span>':''}</label>
    <input id="f_${id}" name="${id}" value="${esc(value||'')}" ${attrs||''}><div class="field-err" id="e_${id}"></div></div>`;
}
function showFieldErrors(errs){
  document.querySelectorAll('.field[data-f]').forEach(f=>{
    const k=f.dataset.f, msg=errs[k]||'';
    f.classList.toggle('has-err',!!msg);
    const e=document.getElementById('e_'+k); if(e) e.textContent=msg;
    const i=document.getElementById('f_'+k); if(i) i.setAttribute('aria-invalid',msg?'true':'false');
  });
  const first=Object.keys(errs)[0]; if(first){const i=document.getElementById('f_'+first); if(i) i.focus();}
}
function formMsg(text,kind){const m=$('#formMsg'); if(!m) return; m.className='form-msg'+(text?' '+(kind||'err'):''); m.textContent=text||'';}
const fval=id=>{const el=document.getElementById('f_'+id);return el?el.value.trim():'';};
async function withBusy(btn,label,fn){
  const old=btn.textContent; btn.disabled=true; btn.textContent=label;
  try{ return await fn(); } finally { if(document.body.contains(btn)){btn.disabled=false;btn.textContent=old;} }
}

/* ---------- Sign in / sign up / forgot / reset (inside the storefront) ---------- */
function renderAuth(view){
  const nextNote = state.next==='checkout' ? 'Sign in to check out — your bag is kept.' :
                   state.next==='account' ? 'Sign in to see your profile and orders.' : '';
  const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const views={
    signin:{title:'Welcome back', sub:nextNote||'Sign in to your Kanti account.', body:`
      ${fieldHTML('email','Email','','type="email" autocomplete="email" required')}
      <div class="field" data-f="password"><div class="field-label-row"><label for="f_password">Password</label>
        <button type="button" class="link-btn" data-go="forgot">Forgot password?</button></div>
        <input id="f_password" type="password" autocomplete="current-password" required><div class="field-err" id="e_password"></div></div>
      <label class="remember"><input type="checkbox" id="f_remember"> Remember me for 30 days <small>(not on shared computers)</small></label>
      <button class="btn btn-primary btn-block" id="authBtn">Sign in</button>
      <p class="alt">New to Kanti? <button type="button" class="link-btn" data-go="signup">Create an account</button></p>`},
    signup:{title:'Create your account', sub:nextNote?nextNote.replace('Sign in','Create an account'):'Save your skin profile, routine, bag and orders.', body:`
      ${fieldHTML('name','Full name','','autocomplete="name" required')}
      ${fieldHTML('email','Email','','type="email" autocomplete="email" required')}
      ${fieldHTML('password','Password','','type="password" autocomplete="new-password" placeholder="At least 8 characters" required')}
      <label class="remember"><input type="checkbox" id="f_remember"> Remember me for 30 days <small>(not on shared computers)</small></label>
      <button class="btn btn-primary btn-block" id="authBtn">Create account</button>
      <p class="alt">Already have an account? <button type="button" class="link-btn" data-go="signin">Sign in</button></p>`},
    forgot:{title:'Reset your password', sub:'Enter your account email and we’ll send you a link to choose a new password.', body:`
      ${fieldHTML('email','Email','','type="email" autocomplete="email" required')}
      <button class="btn btn-primary btn-block" id="authBtn">Send reset link</button>
      ${local?'<p class="dev-hint">Running locally: the email preview link is printed in the server terminal.</p>':''}
      <p class="alt"><button type="button" class="link-btn" data-go="signin">Back to sign in</button></p>`},
    reset:{title:'Choose a new password', sub:'This will sign you out on your other devices.', body:`
      ${fieldHTML('password','New password','','type="password" autocomplete="new-password" placeholder="At least 8 characters" required')}
      ${fieldHTML('confirm','Confirm new password','','type="password" autocomplete="new-password" required')}
      <button class="btn btn-primary btn-block" id="authBtn">Save password &amp; sign in</button>`},
  };
  const v=views[view];
  app.innerHTML=`<div class="auth"><div class="auth-card">
    <h1>${v.title}</h1><p class="sub">${v.sub}</p>
    <div class="form-msg" id="formMsg" role="alert"></div>
    <form novalidate data-submit="submitAuth" data-arg="${view}">${v.body}</form>
  </div></div>${footerHTML()}`;
  const first=app.querySelector('input'); if(first) setTimeout(()=>first.focus(),0);
}
async function submitAuth(view){
  const errs={}, email=fval('email'), pw=(document.getElementById('f_password')||{}).value||'';
  if(view!=='reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email='Please enter a valid email.';
  if(view==='signup' && !fval('name')) errs.name='Please tell us your name.';
  if(view==='signin' && !pw) errs.password='Please enter your password.';
  if((view==='signup'||view==='reset') && pw.length<8) errs.password='Use at least 8 characters.';
  if(view==='reset' && pw!==((document.getElementById('f_confirm')||{}).value||'')) errs.confirm='Passwords don’t match.';
  showFieldErrors(errs); formMsg('');
  if(Object.keys(errs).length) return;
  await withBusy($('#authBtn'), view==='forgot'?'Sending…':'One moment…', async()=>{
    try{
      if(view==='forgot'){
        await API.forgot(email);
        formMsg('If there’s an account for that email, a reset link is on its way. It expires in 1 hour.','ok');
        return;
      }
      const remember=!!(document.getElementById('f_remember')||{}).checked;
      const me = view==='signin' ? await API.login({email,password:pw,remember})
               : view==='signup' ? await API.signup({name:fval('name'),email,password:pw,remember})
               : await API.reset(state.resetToken,pw);
      state.resetToken=null;
      await afterSignIn(me);
      toast(view==='signup'?'Welcome to Kanti 🌿':view==='reset'?'Password updated':'Signed in');
    }catch(e){ formMsg(e.message||'Something went wrong — please try again.'); }
  });
}

/* ---------- Checkout ---------- */
function renderCheckout(){
  if(state.cart.length===0){
    app.innerHTML=`<div class="checkout"><div class="empty-state"><div class="big">🧺</div>
      <p>Your bag is empty — add a routine first.</p>
      <button class="btn btn-primary btn-sm" style="margin-top:14px" data-go="quiz">Find my routine</button></div></div>${footerHTML()}`;
    return;
  }
  if(!ensureSession('checkout')) return;
  if(!state.acct.addresses) API.addresses().then(r=>{state.acct.addresses=r.addresses; if(state.view==='checkout'&&r.addresses.length>1) render();}).catch(()=>{});
  const sub=cartTotalCents(), ship=shippingCents(sub), total=sub+ship;
  const u=session.user, nm=splitName(u.name);
  const toFree=SHIPPING.free_over_cents-sub;
  app.innerHTML=`
  <div class="checkout">
    <h1>Checkout</h1>
    ${verifyBannerHTML()}
    <p style="color:var(--muted)">${u.address?'Welcome back — we’ve filled in your saved details.':'You’re almost there. Add your shipping details to place the order.'}</p>
    <form class="co-grid" id="coForm" novalidate data-submit="placeOrder">
      <div>
        <div class="form-msg" id="formMsg" role="alert"></div>
        <h3 class="co-h3">Contact & shipping</h3>
        ${(state.acct.addresses||[]).length>1?`<div class="field"><label for="coSaved">Saved addresses</label><select id="coSaved" data-change="useSavedAddress">
          ${state.acct.addresses.map(a=>`<option value="${a.id}" ${a.is_default?'selected':''}>${esc(a.label||'Address')} — ${esc(a.address)}, ${esc(a.city||'')}</option>`).join('')}</select></div>`:''}
        <div class="field"><label>Email</label><input type="email" value="${esc(u.email)}" readonly autocomplete="email">
          <div class="field-hint">Your confirmation email goes to your account address.</div></div>
        <div class="field-row">
          ${fieldHTML('first','First name',nm.first,'autocomplete="given-name" required')}
          ${fieldHTML('last','Last name',nm.last,'autocomplete="family-name"')}
        </div>
        ${fieldHTML('phone','Phone',u.phone,'type="tel" autocomplete="tel"',true)}
        ${fieldHTML('address','Street address',u.address,'autocomplete="address-line1" required')}
        ${fieldHTML('address2','Apartment, suite, etc.',u.address2,'autocomplete="address-line2"',true)}
        <div class="field-row">
          ${fieldHTML('city','City',u.city,'autocomplete="address-level2" required')}
          ${fieldHTML('state','State / region',u.state,'autocomplete="address-level1"',true)}
        </div>
        <div class="field-row">
          ${fieldHTML('zip','ZIP / Postcode',u.zip,'autocomplete="postal-code" required')}
          ${fieldHTML('country','Country',u.country,'autocomplete="country-name"',true)}
        </div>
        <label class="check"><input type="checkbox" id="f_save" checked> Save these details to my account</label>
        <h3 class="co-h3 pay">Payment</h3>
        <div class="demo-badge">🔒 Demo store — no payment is taken and card details never leave your browser. Try 4242 4242 4242 4242.</div>
        ${fieldHTML('card','Card number','','inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" data-input="fmtCard"')}
        <div class="field-row">
          ${fieldHTML('exp','Expiry','','inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" data-input="fmtExp"')}
          ${fieldHTML('cvc','CVC','','inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"')}
        </div>
      </div>
      <div class="co-summary">
        <h3>Order summary</h3>
        ${state.cart.map(c=>{const p=prod(c.id);return `<div class="co-line"><span>${esc(p.name)} ×${c.qty}</span><span>${money(p.price_cents*c.qty/100)}</span></div>`;}).join('')}
        <div class="co-line"><span>Shipping</span><span>${ship===0?'Free':money(ship/100)}</span></div>
        ${ship>0&&toFree>=0?`<div class="field-hint">Add ${money((toFree+1)/100)} more for free shipping.</div>`:''}
        <div class="co-total"><span>Total</span><span>${money(total/100)}</span></div>
        <button type="submit" class="btn btn-primary btn-block" style="margin-top:18px" id="placeBtn">Place order · ${money(total/100)}</button>
        <button type="button" class="btn btn-ghost btn-block" style="margin-top:10px" data-go="shop">Back to shop</button>
      </div>
    </form>
  </div>`;
}
// Demo card checks only — the numbers are never sent anywhere.
function luhn(d){let s=0,alt=false;for(let i=d.length-1;i>=0;i--){let n=+d[i];if(alt){n*=2;if(n>9)n-=9;}s+=n;alt=!alt;}return d.length>0&&s%10===0;}
function fmtCard(el){const d=el.value.replace(/\D/g,'').slice(0,19);el.value=d.replace(/(.{4})(?=.)/g,'$1 ');}
function fmtExp(el){const d=el.value.replace(/\D/g,'').slice(0,4);el.value=d.length>2?d.slice(0,2)+'/'+d.slice(2):d;}
function validateCheckout(v){
  const e={};
  if(!v.first) e.first='Please add your first name.';
  if(!v.address) e.address='Please add your street address.';
  if(!v.city) e.city='Please add your city.';
  if(!/^[A-Za-z0-9\- ]{3,12}$/.test(v.zip)) e.zip='Please enter a valid ZIP / postcode.';
  if(v.phone && !/^[0-9+()\-.\s]{5,30}$/.test(v.phone)) e.phone='Please enter a valid phone number.';
  const digits=v.card.replace(/\D/g,'');
  if(digits.length<13||!luhn(digits)) e.card='That card number doesn’t look right.';
  const m=v.exp.match(/^(\d{2})\/(\d{2})$/);
  if(!m||+m[1]<1||+m[1]>12) e.exp='Use MM/YY.';
  else if(new Date(2000+ +m[2], +m[1], 1)<=new Date()) e.exp='This card has expired.';
  if(!/^\d{3,4}$/.test(v.cvc)) e.cvc='3 or 4 digits.';
  return e;
}
async function placeOrder(){
  const v={}; ['first','last','phone','address','address2','city','state','zip','country','card','exp','cvc'].forEach(k=>v[k]=fval(k));
  const errs=validateCheckout(v); showFieldErrors(errs); formMsg('');
  if(Object.keys(errs).length) return;
  const save=$('#f_save').checked;
  const ship_to={name:(v.first+' '+v.last).trim(),phone:v.phone,address:v.address,address2:v.address2,city:v.city,state:v.state,zip:v.zip,country:v.country};
  await withBusy($('#placeBtn'),'Placing order…',async()=>{
    try{
      // Prices, shipping and totals are worked out by the server from the catalogue.
      const {order}=await API.createOrder({items:state.cart.map(c=>({id:c.id,qty:c.qty})),ship_to,save_details:save,anon_id:AID});
      state.acct.addresses=null;
      if(save) Object.assign(session.user,ship_to);
      if(session.orders) session.orders.unshift(order);
      state.lastOrder=orderView(order);
      clearTimeout(cartSaveT); state.cart=[]; updateCartCount(false); // the server already emptied the saved bag
      go('confirm');
    }catch(e){
      if(handleAuthError(e,'checkout')) return;
      if(e.status===409||e.status===400){
        // Stock changed (or a product was retired) while shopping → reload prices/stock and show the bag as it is now.
        await refreshProducts();
        state.cart.forEach(c=>{const p=prod(c.id); if(p) c.qty=Math.min(c.qty,maxQty(p));});
        state.cart=state.cart.filter(c=>c.qty>0); updateCartCount();
        if(!state.cart.length){ toast(e.message); go('shop'); return; }
        renderCheckout(); formMsg(e.message+' Your bag has been updated — please check it and try again.');
      } else formMsg(e.message||'Could not place the order.');
      window.scrollTo({top:0,behavior:'smooth'});
    }
  });
}
function emailPreviewHTML(o){
  const addr=addressLine(o.ship_to||{});
  return `<div class="email-card">
    <div class="email-badge">📧 Your confirmation email</div>
    <div class="email-head">
      <div><span class="ek">From</span> Kanti &lt;orders@kanti.example&gt;</div>
      <div><span class="ek">To</span> ${esc(o.email)}</div>
      <div><span class="ek">Subject</span> Your Kanti order ${esc(o.no)} is confirmed 🌿</div>
    </div>
    <div class="email-body">
      <p>Hi ${esc(o.name)}, thanks for your order! Here’s what’s on its way:</p>
      ${o.items.map(it=>`<div class="email-line"><span>${esc(it.name)} ×${it.qty}</span><span>${money(it.price*it.qty)}</span></div>`).join('')}
      <div class="email-line"><span>Shipping</span><span>${o.shipping===0?'Free':money(o.shipping)}</span></div>
      <div class="email-line total"><span>Total</span><span>${money(o.total)}</span></div>
      ${addr?`<p class="email-ship">Shipping to: ${addr}</p>`:''}
      <p class="email-foot">We’ll send another note when it ships. With care,<br>Team Kanti 🌿</p>
    </div>
  </div>`;
}
function renderConfirm(){
  const o=state.lastOrder;
  if(!o){app.innerHTML=`<div class="confirm"><div class="seal">🧺</div><h1>Nothing here yet</h1><p>Place an order to see your confirmation.</p><div class="confirm-actions"><button class="btn btn-primary" data-go="shop">Shop</button></div></div>`;return;}
  app.innerHTML=`
  <div class="confirm">
    <div class="seal">✓</div>
    <h1>Order placed!</h1>
    <p>Thanks, ${esc(o.name)}. Your Ayurvedic routine is on its way.<br>
    Order <span class="order-no">${esc(o.no)}</span> · ${money(o.total)}</p>
    <p class="sent-note">A confirmation email ${o.previewUrl?'has been sent':'is on its way'} to <b>${esc(o.email)}</b>. Here’s what it says:</p>
    ${emailPreviewHTML(o)}
    ${previewLinkHTML(o)}
    <div class="confirm-actions">
      <button class="btn btn-primary" data-go="account">View my orders</button>
      <button class="btn btn-ghost" data-go="shop">Keep shopping</button>
    </div>
    <p class="demo-note">Demo store — no payment is taken. Your order is saved to your Kanti account and the confirmation email is really sent (in development it goes to a test inbox — use the link above to open it).</p>
  </div>`;
}
// Link to the real sent email (Ethereal test inbox in development; none with real SMTP).
function previewLinkHTML(o){
  return o.previewUrl&&/^https:\/\//.test(o.previewUrl)
    ? `<a class="btn btn-ghost btn-sm preview-link" href="${esc(o.previewUrl)}" target="_blank" rel="noopener">Open the sent email ↗</a>`:'';
}
async function openOrderEmail(no){
  let raw=(session.orders||[]).find(x=>x.order_no===no);
  // The email may have finished sending after the order was placed → refresh to pick up its link.
  if(raw&&!raw.email_preview_url){try{raw=(await API.order(no)).order;}catch(e){}}
  if(!raw) return;
  const o=orderView(raw);
  $('#modal').innerHTML=`<button class="modal-close" data-act="closeModal">✕</button><div style="padding:26px 24px 28px">${emailPreviewHTML(o)}${previewLinkHTML(o)}</div>`;
  $('#overlay').classList.add('open');
}
// Put a past order's products back in the bag (current prices; retired products are skipped).
function reorder(no){
  const o=(session.orders||[]).find(x=>x.order_no===no); if(!o) return;
  let added=0, missing=0;
  o.items.forEach(it=>{ addToCart(it.id,true,it.qty) ? added++ : missing++; });
  toast(added?`${added} product${added>1?'s':''} added to bag${missing?` · ${missing} no longer available`:''}`:'Those products are no longer available');
  if(added) openCart();
}

// Customers can cancel until the order ships.
async function cancelOrder(no,_b,el){
  if(!confirm(`Cancel order ${no}? This can’t be undone.`)) return;
  if(el) el.disabled=true;
  try{
    const {order}=await API.cancelOrder(no);
    session.orders=(session.orders||[]).map(o=>o.order_no===no?order:o);
    refreshProducts(); render(); toast('Order cancelled');
  }catch(e){ if(!handleAuthError(e,'account')) toast(e.message); if(el) el.disabled=false; }
}

/* ---------- Account / profile page ---------- */
function viewSavedRoutine(){
  if(!state.profile) state.profile=profileFromSkin(session.skin);
  if(!state.profile){go('quiz');return;}
  stashState(); state.animateResults=false; go('results');
}
function renderAccount(){
  if(!ensureSession('account')) return;
  const u=session.user, nm=splitName(u.name);
  const orders=(session.orders||[]).map(orderView);
  const prof=state.profile||profileFromSkin(session.skin);
  const history=session.history||[];
  const ed=state.editProfile, form=state.acctForm;

  const detailsCard = ed ? `
    <div class="acct-card" style="grid-column:span 2">
      <h3>Edit details</h3>
      <div class="form-msg" id="formMsg" role="alert"></div>
      <form novalidate data-submit="saveProfileEdits">
        ${fieldHTML('name','Full name',u.name,'autocomplete="name" required')}
        <div class="field"><label>Email</label><input value="${esc(u.email)}" readonly></div>
        ${fieldHTML('phone','Phone',u.phone,'type="tel" autocomplete="tel"',true)}
        ${fieldHTML('address','Street address',u.address,'autocomplete="address-line1"',true)}
        ${fieldHTML('address2','Apartment, suite, etc.',u.address2,'autocomplete="address-line2"',true)}
        <div class="field-row">${fieldHTML('city','City',u.city,'autocomplete="address-level2"',true)}${fieldHTML('state','State / region',u.state,'autocomplete="address-level1"',true)}</div>
        <div class="field-row">${fieldHTML('zip','ZIP / Postcode',u.zip,'autocomplete="postal-code"',true)}${fieldHTML('country','Country',u.country,'autocomplete="country-name"',true)}</div>
        <div style="display:flex;gap:10px;margin-top:6px">
          <button class="btn btn-primary btn-sm" id="saveBtn">Save</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="cancelEdit">Cancel</button>
        </div>
      </form>
    </div>` : `
    <div class="acct-card">
      <div class="acct-card-head"><h3>Account details</h3><button class="link-btn" data-act="editProfile">Edit</button></div>
      <div class="acct-row"><span class="ak">Name</span><span>${esc(u.name)||'—'}</span></div>
      <div class="acct-row"><span class="ak">Email</span><span>${esc(u.email)}</span></div>
      <div class="acct-row"><span class="ak">Phone</span><span>${esc(u.phone)||'—'}</span></div>
    </div>
    <div class="acct-card">
      <div class="acct-card-head"><h3>Shipping address</h3><button class="link-btn" data-act="editProfile">Edit</button></div>
      ${u.address ? `<p class="addr">${esc(u.name)}<br>${esc(u.address)}${u.address2?'<br>'+esc(u.address2):''}<br>${[esc(u.city),esc(u.state)].filter(Boolean).join(', ')} ${esc(u.zip)}${u.country?'<br>'+esc(u.country):''}</p>`
        : `<p class="muted-p">No address saved yet — it’s saved when you check out.</p>`}
    </div>`;

  const skinCard = prof ? `
    <div class="acct-card skin">
      <div class="acct-card-head"><h3>Your skin profile</h3><span><button class="link-btn" data-go="journey">${t('Skin journey')}</button> · <button class="link-btn" data-act="viewSavedRoutine">View routine</button></span></div>
      <div class="skin-badges">
        <span class="skin-pill">${SKIN_LABEL[prof.skin]} skin</span>
        <span class="skin-pill dosha" style="--dc:${DOSHA[prof.dosha].color}">${DOSHA[prof.dosha].name}-leaning</span>
        ${routine.streak?`<span class="skin-pill">🔥 ${routine.streak}-day streak</span>`:''}
      </div>
      ${history.length?`<div style="margin-top:14px"><small class="muted-p">Quiz history</small>
        ${history.slice(0,5).map(h=>`<div class="hist-row"><span>${SKIN_LABEL[h.skinType]||esc(h.skinType)} · ${DOSHA[h.dosha]?DOSHA[h.dosha].name:esc(h.dosha)}</span><small>${fmtDate(h.date)}</small></div>`).join('')}</div>`:''}
    </div>` : `
    <div class="acct-card">
      <div class="acct-card-head"><h3>Your skin profile</h3></div>
      <p class="muted-p">No skin profile saved yet. <button class="link-btn" data-go="quiz">Take the quiz</button></p>
    </div>`;

  const securityCard = `
    <div class="acct-card">
      <h3>Sign-in & security</h3>
      <div class="sec-actions">
        <button class="link-btn" data-act="toggleAcctForm" data-arg="password">Change password</button>
        <a class="link-btn" href="/api/me/export" download>Download my data</a>
        <button class="link-btn" data-act="signOut">Sign out</button>
        <button class="link-btn danger" data-act="toggleAcctForm" data-arg="delete">Delete account</button>
      </div>
      ${form==='password'?`<form class="inline-form" novalidate data-submit="changePassword">
        <div class="form-msg" id="formMsg" role="alert"></div>
        ${fieldHTML('current','Current password','','type="password" autocomplete="current-password"')}
        ${fieldHTML('password','New password','','type="password" autocomplete="new-password" placeholder="At least 8 characters"')}
        <button class="btn btn-primary btn-sm" id="pwBtn">Update password</button>
        <p class="muted-p" style="margin-top:8px">You’ll stay signed in here; other devices are signed out.</p>
      </form>`:''}
      ${form==='delete'?`<form class="inline-form" novalidate data-submit="deleteAccount">
        <div class="form-msg" id="formMsg" role="alert"></div>
        <p class="muted-p">This permanently deletes your account, orders, quiz history and saved bag. It can’t be undone.</p>
        ${fieldHTML('password','Enter your password to confirm','','type="password" autocomplete="current-password"')}
        <button class="btn btn-sm" style="background:var(--danger);color:#fff" id="delBtn">Delete my account</button>
      </form>`:''}
    </div>`;

  const ordersSection = `
    <div class="acct-card wide">
      <h3>Order history</h3>
      ${orders.length ? orders.map(o=>`
        <div class="order">
          <div class="order-top">
            <div><b>${esc(o.no)}</b><span class="status-pill ${esc(o.status)}">${esc(o.status)}</span><small>${fmtDate(o.date)} · ${o.items.reduce((s,i)=>s+i.qty,0)} item(s)</small></div>
            <div class="order-total">${money(o.total)}</div>
          </div>
          <div class="order-items">
            ${o.items.map(it=>`<span class="oi"><span class="oi-emoji" style="background:${esc(it.bg)}">${it.art}</span>${esc(it.name)} ×${it.qty}</span>`).join('')}
          </div>
          ${addressLine(o.ship_to)?`<div class="order-ship">${o.status==='placed'?'Shipping to':o.status==='cancelled'?'Was going to':'Shipped to'} ${addressLine(o.ship_to)}</div>`:''}
          ${o.tracking?`<div class="order-ship">Tracking: <b>${esc(o.tracking)}</b></div>`:''}
          <div class="order-actions">
            <button class="link-btn" data-act="reorder" data-arg="${esc(o.no)}">Reorder</button>
            ${o.status==='placed'?`<button class="link-btn danger" data-act="cancelOrder" data-arg="${esc(o.no)}">Cancel order</button>`:''}
            <button class="link-btn" data-act="openOrderEmail" data-arg="${esc(o.no)}">View confirmation email</button>
          </div>
        </div>`).join('')
      : `<p class="muted-p">No orders yet. <button class="link-btn" data-go="shop">Browse the shop</button></p>`}
    </div>`;

  app.innerHTML=`<div class="wrap account">
    <div class="section-head" style="margin-bottom:26px"><div class="eyebrow">My account</div>
      <div class="acct-hello">
        <label class="avatar-edit" title="Change profile photo">${avatarHTML(64)}<input type="file" accept="image/*" data-change="avatarPick" aria-label="Upload a profile photo"><span>Edit</span></label>
        <div><h2>Hi${nm.first?', '+esc(nm.first):''} 👋</h2>
        <p>Your Kanti details, skin profile and orders, all in one place.${u.has_avatar?' <button class="link-btn" data-act="avatarRemove">Remove photo</button>':''}</p></div>
      </div></div>
    ${verifyBannerHTML()}
    <div class="acct-grid">
      ${detailsCard}
      ${skinCard}
      ${securityCard}
    </div>
    ${ordersSection}
    ${accountExtrasHTML()}
  </div>${footerHTML()}`;
  if(state.acctSection){const el=document.getElementById(state.acctSection+'Card'); state.acctSection=null; if(el) setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'start'}),50);}
  if(form||ed){const i=app.querySelector('.inline-form input, form input:not([readonly])'); if(i) i.focus();}
}
async function saveProfileEdits(){
  const v={}; ['name','phone','address','address2','city','state','zip','country'].forEach(k=>v[k]=fval(k));
  const errs={};
  if(!v.name) errs.name='Name can’t be empty.';
  if(v.phone && !/^[0-9+()\-.\s]{5,30}$/.test(v.phone)) errs.phone='Please enter a valid phone number.';
  if(v.zip && !/^[A-Za-z0-9\- ]{3,12}$/.test(v.zip)) errs.zip='Please enter a valid ZIP / postcode.';
  showFieldErrors(errs); if(Object.keys(errs).length) return;
  await withBusy($('#saveBtn'),'Saving…',async()=>{
    try{
      const me=await API.updateMe(v);
      session.user=me.user; state.editProfile=false; render(); toast('Profile updated');
    }catch(e){ if(!handleAuthError(e,'account')) formMsg(e.message||'Could not save'); }
  });
}
async function changePassword(){
  const current=(document.getElementById('f_current')||{}).value||'', next=(document.getElementById('f_password')||{}).value||'';
  const errs={};
  if(!current) errs.current='Enter your current password.';
  if(next.length<8) errs.password='Use at least 8 characters.';
  showFieldErrors(errs); if(Object.keys(errs).length) return;
  await withBusy($('#pwBtn'),'Updating…',async()=>{
    try{ await API.changePassword(current,next); state.acctForm=null; render(); toast('Password updated'); }
    catch(e){ if(!handleAuthError(e,'account')) formMsg(e.message); }
  });
}
async function deleteAccount(){
  const pw=(document.getElementById('f_password')||{}).value||'';
  if(!pw){showFieldErrors({password:'Enter your password to confirm.'});return;}
  await withBusy($('#delBtn'),'Deleting…',async()=>{
    try{
      await API.deleteAccount(pw);
      resetSession(); state.profile=null; state.cart=[]; state.acctForm=null; routine=blankProgress();
      try{localStorage.removeItem('kanti_routine');}catch(e){}
      updateCartCount(false); updateHeader(); go('home'); toast('Your account has been deleted');
    }catch(e){ if(!handleAuthError(e,'account')) formMsg(e.message); }
  });
}

// Checkout: picking a saved address fills the shipping fields.
function useSavedAddress(id){
  const a=(state.acct.addresses||[]).find(x=>String(x.id)===String(id)); if(!a) return;
  const set=(k,v)=>{const el=document.getElementById('f_'+k); if(el) el.value=v||'';};
  if(a.name){const n=splitName(a.name); set('first',n.first); set('last',n.last);}
  ['phone','address','address2','city','state','zip','country'].forEach(k=>set(k,a[k]));
}

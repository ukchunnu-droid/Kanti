// Kanti storefront — state.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* ---------- App state ---------- */
let state = {
  view:'home',
  qStep:0,
  answers:[],
  profile:null,       // {skin, dosha, concern, culture, spice, lookFor, avoid, rationale, source}
  tod:'AM',
  shopSkin:'all',
  shopDosha:'all',
  cart:[],            // [{id, qty}] — saved to the account while signed in
  next:null,          // where to go after signing in
};

/* ---------- Routine tracking (checklist + streak) ----------
   Signed out: kept in this browser. Signed in: also saved to the account (GET/PUT /api/routine). */
function todayStr(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function yesterdayStr(){const d=new Date();d.setDate(d.getDate()-1);return todayStr(d);}
function blankProgress(){return {date:todayStr(),done:{},streak:0,lastComplete:null};}
function freshDay(p){if(p.date!==todayStr()){p.done={};p.date=todayStr();}return p;} // new day → fresh checkboxes, streak kept
function loadProgress(){
  let p=blankProgress();
  try{const s=localStorage.getItem('kanti_routine');if(s){const d=JSON.parse(s);if(d&&typeof d==='object')p=Object.assign(p,d);}}catch(e){}
  return freshDay(p);
}
let routineSaveT=null;
function saveProgress(){
  try{localStorage.setItem('kanti_routine',JSON.stringify(routine));}catch(e){}
  if(API.isAuthed()){clearTimeout(routineSaveT);routineSaveT=setTimeout(()=>API.saveRoutine(routine).catch(()=>{}),600);}
}
// After sign-in: the account's copy wins if it has one, otherwise this browser's progress is uploaded.
async function syncRoutine(){
  try{
    const r=(await API.routine()).routine;
    if(r){routine=freshDay(Object.assign(blankProgress(),r));try{localStorage.setItem('kanti_routine',JSON.stringify(routine));}catch(e){}}
    else await API.saveRoutine(routine);
  }catch(e){}
}
let routine = loadProgress();
let activeTipEl = null;

/* ---------- Account session (backend) ----------
   Sessions are an httpOnly cookie set by the server; API.isAuthed() only reads a harmless hint cookie.
   Checkout and the account page are gated behind the in-page sign-in view. */
let session = {user:null, skin:null, orders:null, history:null, pending:null};
function resetSession(){session={user:null,skin:null,orders:null,history:null,pending:null};}
function loadSession(){
  if(!session.pending){
    session.pending=Promise.all([API.me(),API.orders(),API.quizHistory()])
      .then(([me,o,h])=>{session.user=me.user;session.skin=me.skin;session.orders=o.orders||[];session.history=h.results||[];updateHeader();return session.user;})
      .finally(()=>{session.pending=null;});
  }
  return session.pending;
}
// Not signed in → show the sign-in view, then come back to `view`. Nothing is lost: it's the same page.
function requireSignIn(view){
  if(API.isAuthed()) return true;
  state.next=view;
  go('signin');
  return false;
}
// Session expired/revoked → back to sign-in.
function handleAuthError(e,view){
  if(!e||e.status!==401) return false;
  resetSession(); updateHeader();
  toast('Please sign in again');
  state.next=view; go('signin');
  return true;
}
// Render a loading state until the session is loaded; returns true once it's ready.
function ensureSession(view){
  if(session.user && session.orders && session.history) return true; // fully loaded (user + orders + quiz history)
  app.innerHTML=`<div class="checkout"><div class="empty-state"><div class="big">🌿</div><p>Loading your account…</p></div></div>`;
  loadSession().then(()=>{ if(state.view===view) render(); })
    .catch(e=>{
      if(handleAuthError(e,view) || state.view!==view) return;
      app.innerHTML=`<div class="checkout"><div class="empty-state"><div class="big">⚠️</div>
        <p>Couldn’t reach the Kanti server — ${esc(e.message)}</p>
        <button class="btn btn-primary btn-sm" style="margin-top:14px" data-act="render">Try again</button></div></div>`;
    });
  return false;
}
// Runs after sign in / sign up / password reset.
async function afterSignIn(me){
  resetSession(); session.user=me.user; session.skin=me.skin; updateHeader();
  // 1. The bag from before signing in is merged with the bag saved on the account.
  try{setCartFromServer((await API.mergeCart(state.cart.map(c=>({id:c.id,qty:c.qty})))).items);}catch(e){}
  // 2. A quiz taken while signed out goes into the account's quiz history.
  await syncSkinProfile();
  // 3. Routine streak, saved products; the diary reloads for this account.
  await syncRoutine();
  await syncWishlist();
  state.diary.entries=null; state.diary.form=null;
  const next=state.next||'account'; state.next=null;
  go(next);
}
async function syncSkinProfile(){
  const p=state.profile; if(!p||!p.unsaved) return;
  try{
    const r=await API.saveQuizResult({skinType:p.skin,dosha:p.dosha,concern:p.concern,culture:p.culture,spice:p.spice,
      lookFor:p.lookFor,avoid:p.avoid,rationale:p.rationale,source:p.source});
    session.skin=r.saved; delete p.unsaved; stashState();
  }catch(e){}
}
// Signing out forgets everything personal on this device: bag, quiz result, routine.
async function signOut(){
  try{await API.logout();}catch(e){}
  resetSession(); state.profile=null; state.cart=[]; routine=blankProgress();
  state.wish=[]; state.alerts=[]; state.diary={entries:null,tags:[],loading:false,form:null};
  state.reco={key:'',data:null,pending:null}; state.beyond={key:'',data:null,pending:null,error:null};
  state.guide.msgs=[]; if(state.guide.open) guideToggle();
  try{localStorage.removeItem('kanti_routine');localStorage.removeItem('kanti_wish');localStorage.removeItem('kanti_quiz');
      sessionStorage.removeItem('kanti_reco');sessionStorage.removeItem('kanti_guide');}catch(e){}
  updateWishCount();
  updateCartCount(false); updateHeader(); go('home'); toast('Signed out');
}
function updateHeader(){
  const a=API.isAuthed(), b=$('#navAccount'), i=$('#navAcctIcon'), adm=$('#navAdmin');
  if(b) b.textContent=a?'Account':'Sign in';
  if(adm) adm.classList.toggle('hidden',!(a&&session.user&&session.user.is_admin));
  if(i){i.title=a?'My account':'Sign in';i.setAttribute('aria-label',i.title);}
}
function splitName(n){const parts=String(n||'').trim().split(/\s+/).filter(Boolean);return {first:parts[0]||'',last:parts.slice(1).join(' ')};}
// Server order → the shape the confirmation/email views use (re-hydrates emoji/colour from the catalogue).
function orderView(o){
  const u=session.user||{}, st=o.ship_to||{};
  return {no:o.order_no, status:o.status||'placed', date:o.date, email:u.email||'', tracking:o.tracking_no||null,
    name:splitName(st.name||u.name).first||'there',
    items:(o.items||[]).map(it=>{const p=prod(it.id)||null;return {id:it.id,name:it.name,qty:Number(it.qty),price:Number(it.price),art:p?productArt(p,'thumb'):'🌿',bg:(p&&p.bg)||'var(--surface-2)'};}),
    subtotal:o.subtotal, shipping:o.shipping, total:o.total, ship_to:st, previewUrl:o.email_preview_url||null};
}
function addressLine(s){
  return [s.address,s.address2,[s.city,s.state].filter(Boolean).join(', '),s.zip,s.country].filter(Boolean).map(esc).join(', ');
}
// Server quiz result → the profile shape the results page uses.
function profileFromSkin(k){
  return k && SKIN_LABEL[k.skinType] && DOSHA[k.dosha]
    ? {skin:k.skinType,dosha:k.dosha,concern:k.concern||null,culture:k.culture||null,spice:k.spice||null,
       lookFor:k.lookFor||null,avoid:k.avoid||null,rationale:k.rationale||'',source:k.source==='legacy'?'rules':k.source}
    : null;
}
// The quiz result (and, when signed out, the bag) survive reloads in this tab.
function stashState(){try{sessionStorage.setItem('kanti_state',JSON.stringify({cart:API.isAuthed()?[]:state.cart,profile:state.profile}));}catch(e){}}
function restoreState(){
  try{
    const d=JSON.parse(sessionStorage.getItem('kanti_state')||'null'); if(!d) return;
    if(Array.isArray(d.cart)&&!API.isAuthed()) state.cart=d.cart.filter(c=>c&&prod(c.id)&&c.qty>0);
    if(d.profile&&DOSHA[d.profile.dosha]&&SKIN_LABEL[d.profile.skin]) state.profile=d.profile;
  }catch(e){}
}
function fmtDate(iso){try{return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(e){return iso;}}

function toggleStep(tod,idx){
  freshDay(routine);
  const k=tod+':'+idx;
  routine.done[k]=!routine.done[k];
  maybeCompleteDay();           // updates streak + saves
  const y=window.scrollY; render(); window.scrollTo(0,y);
}
function maybeCompleteDay(){
  if(!state.profile){saveProgress();return;}
  const am=buildRoutine(state.profile,'AM'), pm=buildRoutine(state.profile,'PM');
  const amC=am.length>0 && am.every((_,i)=>routine.done['AM:'+i]);
  const pmC=pm.length>0 && pm.every((_,i)=>routine.done['PM:'+i]);
  if(amC&&pmC){
    const t=todayStr();
    if(routine.lastComplete!==t){
      routine.streak=(routine.lastComplete===yesterdayStr())?routine.streak+1:1;
      routine.lastComplete=t;
    }
  }
  saveProgress();
}

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const app = $('#app');
const money = n => '$'+Number(n).toFixed(2);
// Escape text that comes from the server / AI before putting it in innerHTML.
const esc = x => String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prod = id => PRODUCTS.find(p=>p.id===id);
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1800);}

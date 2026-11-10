// Kanti storefront — ui.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* ---------- Ingredient tooltips ---------- */
function enhanceTips(root){
  (root||document).querySelectorAll('.ing-tag, .chip:not(.warn)').forEach(el=>{
    if(el.dataset.tip) return;
    if(lookupIngredient(el.textContent.trim())){
      el.dataset.tip='1'; el.tabIndex=0; el.setAttribute('role','button'); el.classList.add('has-tip');
    }
  });
}
function showTip(el){
  const info=lookupIngredient(el.textContent.trim()); if(!info) return;
  let tip=document.getElementById('ingtip');
  if(!tip){tip=document.createElement('div');tip.id='ingtip';tip.className='ingtip';document.body.appendChild(tip);}
  tip.innerHTML=`<b>${info.name}</b><span>${info.what}</span><em>Best for: ${info.suits}</em>`;
  tip.style.display='block';
  const r=el.getBoundingClientRect();
  const tw=Math.min(260, window.innerWidth-24);
  tip.style.width=tw+'px';
  let left=Math.max(12, Math.min(r.left+r.width/2-tw/2, window.innerWidth-tw-12));
  tip.style.left=left+'px'; tip.style.top=(r.bottom+8)+'px';
  const th=tip.offsetHeight;
  if(r.bottom+8+th>window.innerHeight-12) tip.style.top=Math.max(12,r.top-th-8)+'px';
  activeTipEl=el;
}
function hideTip(){const tip=document.getElementById('ingtip'); if(tip)tip.style.display='none'; activeTipEl=null;}
function toggleTip(el){ activeTipEl===el ? hideTip() : showTip(el); }

const AUTH_VIEWS=['signin','signup','forgot','reset'];
const GATED_VIEWS=['checkout','account','admin']; // need a signed-in account
function go(view){
  if(GATED_VIEWS.includes(view) && !requireSignIn(view)) return;
  if(AUTH_VIEWS.includes(view) && view!=='reset' && API.isAuthed()){ view=state.next||'account'; state.next=null; }
  state.view=view;
  if(view==='quiz'){state.qStep=0;state.answers=[];state.classifying=false;}
  if(view!=='account'){state.editProfile=false;state.acctForm=null;}
  try{history.replaceState(null,'',view==='home'?location.pathname:'#'+view);}catch(e){} // also drops reset tokens from the URL
  window.scrollTo({top:0,behavior:'instant'});
  render();
}
// Deep links: /#checkout, /#signin?next=checkout, /#reset=<token>, /#verify=<token> (from emails).
function viewFromHash(){
  const raw=(location.hash||'').slice(1);
  const m=raw.match(/^reset=([a-f0-9]{64})$/);
  if(m){state.resetToken=m[1];return 'reset';}
  const vm=raw.match(/^verify=([a-f0-9]{64})$/);
  if(vm){state.verifyToken=vm[1];return 'verify';}
  const [v,q]=raw.split('?');
  const next=new URLSearchParams(q||'').get('next');
  if(next&&/^(checkout|account|quiz|shop|admin)$/.test(next)) state.next=next;
  if(v==='results') return state.profile?'results':'quiz';
  if(v==='reset') return state.resetToken?'reset':'forgot';
  return ['home','quiz','shop','checkout','account','admin','privacy','signin','signup','forgot'].includes(v)?v:'home';
}

/* ---------- Cart ---------- */
const MAX_QTY=20;
// Returns false when the product can't be added (gone or sold out). Quantities are capped by stock.
function addToCart(id,silent,qty){
  const p=prod(id); if(!p||soldOut(p)) { if(!silent) toast(p?`${p.name} is sold out`:'That product is no longer available'); return false; }
  const line=state.cart.find(c=>c.id===id), add=qty||1, cap=maxQty(p);
  const before=line?line.qty:0, after=Math.min(cap,before+add);
  if(after===before){ if(!silent) toast(`Only ${cap} of ${p.name} available`); return false; }
  if(line)line.qty=after; else state.cart.push({id,qty:after});
  updateCartCount();
  if(!silent)toast(p.name+' added to bag');
  return true;
}
function changeQty(id,d){
  const line=state.cart.find(c=>c.id===id), p=prod(id);if(!line||!p)return;
  if(d>0&&line.qty>=maxQty(p)){toast(`Only ${maxQty(p)} of ${p.name} available`);return;}
  line.qty=Math.min(maxQty(p),line.qty+d); if(line.qty<=0)state.cart=state.cart.filter(c=>c.id!==id);
  updateCartCount();renderDrawer();
}
function removeLine(id){state.cart=state.cart.filter(c=>c.id!==id);updateCartCount();renderDrawer();}
function cartTotalCents(){return state.cart.reduce((s,c)=>s+prod(c.id).price_cents*c.qty,0);}
function cartTotal(){return cartTotalCents()/100;}
function shippingCents(sub){return sub>SHIPPING.free_over_cents?0:SHIPPING.flat_cents;}
function cartQty(){return state.cart.reduce((s,c)=>s+c.qty,0);}
let cartSaveT=null;
// push=false when the change came from the server (nothing to save back).
function updateCartCount(push){
  $('#cartCount').textContent=cartQty(); stashState();
  if(push!==false && API.isAuthed()){
    clearTimeout(cartSaveT);
    cartSaveT=setTimeout(()=>API.saveCart(state.cart.map(c=>({id:c.id,qty:c.qty}))).catch(()=>{}),500);
  }
}
function setCartFromServer(items){
  state.cart=(items||[]).filter(i=>prod(i.id)).map(i=>({id:i.id,qty:i.qty}));
  updateCartCount(false);
}

function openCart(){renderDrawer();$('#drawer').classList.add('open');}
function closeCart(){$('#drawer').classList.remove('open');}

function renderDrawer(){
  const body=$('#drawerBody'),foot=$('#drawerFoot');
  if(state.cart.length===0){
    body.innerHTML=`<div class="empty-state"><div class="big">🧺</div><p>Your bag is empty.</p>
      <button class="btn btn-ghost btn-sm" style="margin-top:14px" data-go="shop">Browse products</button></div>`;
    foot.innerHTML='';return;
  }
  body.innerHTML=state.cart.map(c=>{const p=prod(c.id);return `
    <div class="cart-line">
      <div class="thumb" style="background:${esc(p.bg)}">${esc(p.emoji)}</div>
      <div class="cl-body">
        <b>${esc(p.name)}</b><small>${money(p.price)}</small>
        <div class="qty">
          <button data-act="changeQty" data-arg="${p.id}" data-arg2="-1">−</button>
          <span>${c.qty}</span>
          <button data-act="changeQty" data-arg="${p.id}" data-arg2="1">+</button>
        </div>
        <button class="remove" data-act="removeLine" data-arg="${p.id}">Remove</button>
      </div>
      <div style="font-weight:700">${money(p.price*c.qty)}</div>
    </div>`;}).join('');
  foot.innerHTML=`
    <div class="subtotal"><span>Subtotal</span><span>${money(cartTotal())}</span></div>
    <div class="note">Shipping & taxes calculated at checkout.</div>
    <button class="btn btn-primary btn-block" data-go="checkout">Checkout</button>`;
}

/* ---------- Product modal ---------- */
function openModal(id){
  const p=prod(id); if(!p) return;
  const why = p._why ? `<div class="demo-badge" style="margin:0 0 14px">⭑ Recommended for you — ${p._why}</div>`:'';
  $('#modal').innerHTML=`
    <button class="modal-close" data-act="closeModal">✕</button>
    <div class="modal-top">
      <div class="modal-img" style="background:${esc(p.bg)}">${esc(p.emoji)}</div>
      <div>
        <div class="cat">${esc(p.cat)} ${stockBadge(p)}</div>
        <h2>${esc(p.name)}</h2>
        ${why}
        <p class="desc">${esc(p.desc)}</p>
        <div>${(p.ings||[]).map(i=>`<span class="ing-tag">${esc(i)}</span>`).join(' ')}</div>
      </div>
    </div>
    <div class="modal-meta">
      <div class="meta-row"><span class="k">Full ingredients</span><span>${esc((p.ings||[]).join(', '))}, plant-derived base</span></div>
      <div class="meta-row"><span class="k">Suited to</span><span>${(p.skin||[]).map(skinLabel).map(esc).join(', ')} skin · ${(p.dosha||[]).map(doshaLabel).map(esc).join('/')} dosha</span></div>
      ${p.sourcing?`<div class="meta-row"><span class="k">Sourcing</span><span>${esc(p.sourcing)}</span></div>`:''}
      ${(p.safety||[]).length?`<div class="meta-row"><span class="k">Good to know</span><span>${p.safety.map(s=>`<span class="safety-flag">✓ ${esc(s)}</span>`).join('')}</span></div>`:''}
    </div>
    <div class="modal-buy">
      <span class="price">${money(p.price)}</span>
      <button class="btn btn-primary" style="flex:1" data-act="addToCart" data-arg="${esc(p.id)}" ${soldOut(p)?'disabled':''}>${soldOut(p)?'Sold out':'Add to bag'}</button>
    </div>`;
  $('#overlay').classList.add('open');
  enhanceTips($('#modal'));
}
function closeModal(){$('#overlay').classList.remove('open');}

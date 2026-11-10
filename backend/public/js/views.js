// Kanti storefront — views.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* ---------- Quiz logic ---------- */
function answer(opt){
  state.answers[state.qStep]=opt;
  renderQuiz();
}
async function nextQ(){
  if(state.qStep<QUIZ.length-1){state.qStep++;renderQuiz();window.scrollTo({top:0});return;}
  if(state.classifying) return;
  state.classifying=true; renderQuiz();
  try{
    // AI classification on the server (Gemini, or rule-based fallback). If signed in, it's saved to the account.
    applyClassification(await API.classify(state.answers));
  }catch(e){
    buildProfile(); state.profile.source='offline'; // server unreachable → local rules keep the flow working
    toast('Couldn’t reach the server — showing an offline result');
  }
  state.classifying=false;
  if(state.view!=='quiz') return; // user navigated away while we waited
  stashState();
  state.animateResults=true; go('results');
}
function prevQ(){if(state.classifying)return;if(state.qStep>0){state.qStep--;renderQuiz();window.scrollTo({top:0});}}

// Merge the server's result into the profile. The local pass still supplies culture/spice
// (fun fact) and the user's chosen goal; skin, dosha and ingredient guidance come from the API.
function applyClassification(r){
  buildProfile();
  const p=state.profile;
  if(SKIN_LABEL[r.skinType]) p.skin=r.skinType;
  if(DOSHA[r.dosha]) p.dosha=r.dosha;
  const list=a=>Array.isArray(a)&&a.length?a.slice(0,6).map(String):null;
  p.lookFor=list(r.lookFor); p.avoid=list(r.avoid);
  p.rationale=r.rationale?String(r.rationale):'';
  p.source=r.source==='gemini'?'gemini':'rules';
  if(r.saved){ // signed in → the server already saved it to quiz history
    session.skin=r.saved; if(session.history) session.history.unshift(r.saved);
  } else if(!API.isAuthed()) p.unsaved=true; // saved after the user signs in
}

function buildProfile(){
  const skinVotes={},doshaVotes={};let concern=null,culture=null,spice=null;
  state.answers.forEach((a,i)=>{
    if(a.skin)skinVotes[a.skin]=(skinVotes[a.skin]||0)+(i===0?2:1); // Q1 weighted
    if(a.dosha)doshaVotes[a.dosha]=(doshaVotes[a.dosha]||0)+1;
    if(a.doshaHint)doshaVotes[a.doshaHint]=(doshaVotes[a.doshaHint]||0)+0.5; // spice = gentle tiebreaker
    if(a.concern)concern=a.concern;
    if(a.culture)culture=a.culture;
    if(a.spice)spice=a.spice;
  });
  const skin=Object.keys(skinVotes).sort((a,b)=>skinVotes[b]-skinVotes[a])[0]||'normal';
  const dosha=Object.keys(doshaVotes).sort((a,b)=>doshaVotes[b]-doshaVotes[a])[0]||'vata';
  state.profile={skin,dosha,concern,culture,spice};
}

/* match score: dosha + skin + concern */
function scoreProduct(p,prof){
  let s=0;
  if(p.dosha.includes(prof.dosha))s+=3;
  if(p.skin.includes(prof.skin))s+=3;
  if(prof.concern && p.concern && p.concern.includes(prof.concern))s+=2;
  return s;
}
function pickForSlot(slot,prof,todFilter){
  const cands=PRODUCTS.filter(p=>p.slot===slot &&
     (!todFilter || p.tod===todFilter || p.tod==='both'));
  // Best match first; in-stock products win ties so the routine is something you can actually buy.
  cands.sort((a,b)=>scoreProduct(b,prof)-scoreProduct(a,prof) || (soldOut(a)-soldOut(b)));
  const inStock=cands.filter(p=>!soldOut(p));
  return (inStock.length && scoreProduct(inStock[0],prof)>=scoreProduct(cands[0],prof)-2) ? inStock[0] : cands[0];
}
function buildRoutine(prof,tod){
  // ordered slots
  let order = tod==='AM'
    ? ['Cleanse','Tone','Treat','Moisturise','Protect']
    : ['Cleanse','Tone','Treat','Moisturise'];
  const steps=[];
  order.forEach(slot=>{
    const p=pickForSlot(slot, prof, tod);
    if(p){
      const why=[];
      if(p.dosha.includes(prof.dosha))why.push(DOSHA[prof.dosha].name);
      if(p.skin.includes(prof.skin))why.push(SKIN_LABEL[prof.skin].toLowerCase()+' skin');
      p._why = why.length? 'matches your '+why.join(' + ') : 'a universal step';
      steps.push({slot,p});
    }
  });
  return steps;
}

/* =========================================================
   RENDERERS
   ========================================================= */
function render(){
  closeModal();
  if(state.view==='home')renderHome();
  else if(state.view==='quiz')renderQuiz();
  else if(state.view==='results')renderResults();
  else if(state.view==='shop')renderShop();
  else if(state.view==='checkout')renderCheckout();
  else if(state.view==='confirm')renderConfirm();
  else if(state.view==='account')renderAccount();
  else if(state.view==='admin')renderAdmin();
  else if(state.view==='privacy')renderPrivacy();
  else if(state.view==='verify')renderVerify();
  else if(AUTH_VIEWS.includes(state.view))renderAuth(state.view);
  hideTip();
  enhanceTips(app);
}

function renderHome(){
  app.innerHTML=`
  <section class="hero">
    <div class="wrap">
      <div>
        <div class="hero-eyebrow">Ayurvedic skincare · made personal</div>
        <h1>Skincare that fits <em>your nature.</em></h1>
        <p>Stop guessing across a dozen unreliable sites. Take a 2-minute quiz and get an ingredient-matched routine built around your skin type and your dosha.</p>
        <div class="hero-cta">
          <button class="btn btn-gold" data-go="quiz">Find your routine →</button>
          <button class="btn btn-ghost" style="color:#F4F1E8;border-color:rgba(255,255,255,.3)" data-go="shop">Browse products</button>
        </div>
      </div>
      <div class="doshas">
        ${['vata','pitta','kapha'].map(k=>{const d=DOSHA[k];return `
        <button class="dflip" data-act="flip" aria-label="Flip to learn about ${d.name}">
          <div class="dflip-inner">
            <div class="dface dfront">
              <span class="dosha-dot" style="background:${d.color}"></span>
              <span class="dtext"><b>${d.name}</b><small>${d.note}</small></span>
              <span class="dhint">Tap ↻</span>
            </div>
            <div class="dface dback">
              <span class="dtext"><b>${d.name} skincare</b><small>Look for ${d.look.slice(0,3).join(', ')}. Ease up on ${d.avoid[0].toLowerCase()}.</small></span>
              <span class="dhint">Back ↻</span>
            </div>
          </div>
        </button>`;}).join('')}
      </div>
    </div>
  </section>

  <div class="trust-strip"><div class="wrap">
    <div class="trust-item"><i>🌿</i> Full ingredient transparency</div>
    <div class="trust-item"><i>📍</i> Traceable sourcing</div>
    <div class="trust-item"><i>🐰</i> Cruelty-free & vegan</div>
    <div class="trust-item"><i>🧪</i> Purity-tested botanicals</div>
  </div></div>

  <section class="section wrap">
    <div class="section-head">
      <div class="eyebrow">How Kanti works</div>
      <h2>A routine built for you, not for everyone</h2>
      <p>Most sites sell products. Kanti figures out what your skin actually needs first — then shows you the right things in the right order.</p>
    </div>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Take the skin quiz</h3><p>A few quick questions decode your skin type, your Ayurvedic dosha — and a little about you.</p></div>
      <div class="step"><div class="num">2</div><h3>Get your profile & routine</h3><p>See which ingredients to look for, and a step-by-step AM / PM routine matched to you.</p></div>
      <div class="step"><div class="num">3</div><h3>Shop with confidence</h3><p>Every product shows its full ingredients, sourcing and safety notes. No guesswork.</p></div>
    </div>
    <div style="text-align:center;margin-top:44px">
      <button class="btn btn-primary" data-go="quiz">Start the 2-minute quiz →</button>
    </div>
  </section>

  <section class="section wrap" style="padding-top:0">
    <div class="section-head"><div class="eyebrow">Bestsellers</div><h2>A few favourites</h2></div>
    <div class="grid">${PRODUCTS.slice(0,3).map(cardHTML).join('')}</div>
  </section>

  ${footerHTML()}`;
}

function renderQuiz(){
  const step=QUIZ[state.qStep];
  const chosen=state.answers[state.qStep];
  const pct=Math.round(((state.qStep)/(QUIZ.length))*100);
  app.innerHTML=`
  <div class="quiz">
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="progress-label"><span>Question ${state.qStep+1} of ${QUIZ.length}</span><span>${SKIN_or_DOSHA(state.qStep)}</span></div>
    <h2 class="q-title">${step.q}</h2>
    <p class="q-sub">${step.sub}</p>
    <div class="options">
      ${step.opts.map((o,i)=>`
        <button class="option ${chosen&&chosen.t===o.t?'selected':''}" data-act="answer" data-arg="${i}">
          <span class="mark"></span>
          <span><b>${o.t}</b>${o.s?`<small>${o.s}</small>`:''}</span>
        </button>`).join('')}
    </div>
    <div class="quiz-nav">
      <button class="btn btn-ghost" ${state.qStep===0?'data-go="home"':'data-act="prevQ"'} ${state.classifying?'disabled':''}>← Back</button>
      <button class="btn btn-primary" data-act="nextQ" ${chosen&&!state.classifying?'':'disabled'}>${state.classifying?'Reading your skin…':state.qStep===QUIZ.length-1?'See my routine':'Next'}</button>
    </div>
  </div>`;
}
function SKIN_or_DOSHA(i){return i<2?'Skin type':i<4?'Your dosha':i===4?'Your goal':'A little fun';}

function funFactHTML(prof){
  const ct=CULTURE_TRAIT[prof.culture]||'your own thing';
  const sn=SPICE_NOTE[prof.spice]||'you keep your kitchen interesting';
  const df=DOSHA_FUN[prof.dosha];
  return `<div class="funfact">
    <div class="ff-badge">✨ A little about you</div>
    <p>You’re drawn to <b>${ct}</b>, and <b>${sn}</b>. That pairs nicely with your <b>${DOSHA[prof.dosha].name}</b> nature — ${df}</p>
  </div>`;
}
function renderResults(){
  const prof=state.profile;const d=DOSHA[prof.dosha];
  const steps=buildRoutine(prof,state.tod);
  const weekly=PRODUCTS.filter(p=>p.slot==='Weekly').map(p=>({slot:'Weekly',p}))
      .sort((a,b)=>scoreProduct(b.p,prof)-scoreProduct(a.p,prof)).slice(0,1);
  const concernTxt = prof.concern? ` We’ve prioritised your goal: <b>${esc(prof.concern)}</b>.`:'';
  const look = prof.lookFor||d.look, avoid = prof.avoid||d.avoid;
  const srcNote = {gemini:'✦ Personalised by Kanti AI from your answers',
                   rules:'Matched by Kanti’s skin rules from your answers',
                   offline:'Offline result — reconnect for your full AI reading'}[prof.source]||'';
  const anim = state.animateResults ? 'animate' : '';
  state.animateResults = false; // play once per entry, not on AM/PM toggle

  app.innerHTML=`
  <div class="wrap results ${anim}">
    <div class="profile-card rv" style="--d:0s">
      <div>
        <div class="eyebrow">Your skin profile</div>
        <h2><em>${SKIN_LABEL[prof.skin]}</em> skin · ${d.name}-leaning</h2>
        <p>Your skin reads as ${SKIN_LABEL[prof.skin].toLowerCase()} with a ${d.name} tendency — ${d.note.toLowerCase()}${concernTxt}</p>
        ${prof.source==='gemini'&&prof.rationale?`<p class="rationale">${esc(prof.rationale)}</p>`:''}
        ${srcNote?`<div class="src-note">${srcNote}</div>`:''}
      </div>
      <div class="dosha-badge">
        <div class="big" style="background:${d.color}"></div>
        <b>${d.name}</b><small>dominant dosha</small>
      </div>
    </div>

    ${prof.culture||prof.spice?`<div class="rv" style="--d:.14s">${funFactHTML(prof)}</div>`:''}

    <div class="guidance rv" style="--d:.28s">
      <div class="guide-card"><h3>🌿 Look for</h3><div class="chips">${look.map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div></div>
      <div class="guide-card"><h3>⚠️ Go easy on</h3><div class="chips">${avoid.map(x=>`<span class="chip warn">${esc(x)}</span>`).join('')}</div></div>
    </div>

    <div class="rv" style="--d:.42s">
      ${streakHTML(prof)}
      <div class="routine-head">
        <h2>Your daily routine</h2>
        <div class="tod">
          <button class="${state.tod==='AM'?'active':''}" data-act="setTod" data-arg="AM">☀️ Morning</button>
          <button class="${state.tod==='PM'?'active':''}" data-act="setTod" data-arg="PM">🌙 Evening</button>
        </div>
      </div>
      <p class="routine-hint">Tick each step off as you go — finish morning and evening to grow your streak.</p>
      ${steps.map((s,i)=>routineStepHTML(s,i+1,state.tod,i,true)).join('')}
    </div>

    <div class="rv" style="--d:.56s">
      <div class="routine-head" style="margin-top:36px"><h2>Weekly treat</h2></div>
      ${weekly.map((s,i)=>routineStepHTML(s,i+1,'WK',i,false)).join('')}
    </div>

    <div class="rv" style="--d:.68s;display:flex;gap:14px;flex-wrap:wrap;margin-top:34px">
      <button class="btn btn-gold" data-act="addWholeRoutine">Add full routine to bag</button>
      <button class="btn btn-ghost" data-act="shareResult">Share my result</button>
      <button class="btn btn-ghost" data-go="shop">Keep browsing</button>
      <button class="btn btn-ghost" data-go="quiz">Retake quiz</button>
    </div>
  </div>
  ${footerHTML()}`;
  enhanceTips(app);
}
function streakHTML(prof){
  const am=buildRoutine(prof,'AM'), pm=buildRoutine(prof,'PM');
  const amDone=am.filter((_,i)=>routine.done['AM:'+i]).length;
  const pmDone=pm.filter((_,i)=>routine.done['PM:'+i]).length;
  const amC=amDone===am.length, pmC=pmDone===pm.length;
  const n=routine.streak||0;
  const msg = (amC&&pmC) ? 'Both done today — lovely work!' :
              n>0 ? 'Keep it going — finish today to extend your streak.' :
              'Complete morning and evening to start a streak.';
  return `<div class="streak">
    <div class="streak-flame">${n>0?'🔥':'🌱'}</div>
    <div><b>${n}-day streak</b><small>${msg}</small></div>
    <div class="streak-prog">
      <span class="${amC?'c':''}">☀️ Morning ${amDone}/${am.length}</span>
      <span class="${pmC?'c':''}">🌙 Evening ${pmDone}/${pm.length}</span>
    </div>
  </div>`;
}
function routineStepHTML(s,n,tod,idx,checkable){
  const p=s.p;
  const checked = checkable && routine.done[tod+':'+idx];
  const lead = checkable
    ? `<button class="step-no toggle ${checked?'on':''}" aria-pressed="${checked?'true':'false'}" title="Mark ${esc(p.name)} as done" data-act="toggleStep" data-arg="${tod}" data-arg2="${idx}">${checked?'✓':n}</button>`
    : `<div class="step-no">${n}</div>`;
  return `<div class="routine-step ${checked?'done':''}">
    ${lead}
    <div class="rs-thumb" style="background:${esc(p.bg)}">${productArt(p, 'thumb')}</div>
    <div class="rs-body">
      <span class="slot">${s.slot}</span>
      <b>${esc(p.name)}</b>
      <small>${p._why?('✓ '+esc(p._why)):esc(p.benefit)}${soldOut(p)?' · <span class="stock-flag out inline">Sold out</span>':''}</small>
    </div>
    <span class="rs-price">${money(p.price)}</span>
    <button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}" ${soldOut(p)?'disabled':''}>Add</button>
    <button class="btn btn-ghost btn-sm" data-act="openModal" data-arg="${esc(p.id)}">Details</button>
  </div>`;
}
function addWholeRoutine(){
  const prof=state.profile;
  const ids=new Set();
  buildRoutine(prof,'AM').forEach(s=>ids.add(s.p.id));
  buildRoutine(prof,'PM').forEach(s=>ids.add(s.p.id));
  const weekly=pickForSlot('Weekly',prof); if(weekly) ids.add(weekly.id);
  let added=0, out=0;
  ids.forEach(id=>{ addToCart(id,true) ? added++ : (soldOut(prod(id))&&out++); });
  toast(`${added} product${added===1?'':'s'} added to bag${out?` · ${out} sold out`:''}`);
  openCart();
}

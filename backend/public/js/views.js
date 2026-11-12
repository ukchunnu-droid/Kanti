// Kanti storefront — views.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* ---------- Quiz logic ---------- */
function answer(opt){
  const prev=state.answers[state.qStep];
  // Re-picking "Other" keeps what was typed.
  state.answers[state.qStep]=opt.isOther?{...opt,other:prev&&prev.isOther?prev.other:''}:opt;
  saveQuizProgress();
  renderQuiz();
  if(opt.isOther){const i=$('#otherText'); if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
}
// Typing in the "Other" box: update the answer without re-rendering (keeps focus).
function otherText(v){
  const a=state.answers[state.qStep]; if(!a||!a.isOther) return;
  a.other=v.slice(0,120); saveQuizProgress();
  const next=$('#quizNext'); if(next) next.disabled=!answerReady(a)||!!state.classifying;
}
const answerReady=a=>!!a&&(!a.isOther||a.other.trim().length>=2);
async function nextQ(){
  if(!answerReady(state.answers[state.qStep])) return;
  if(state.qStep<QUIZ.length-1){state.qStep++;saveQuizProgress();renderQuiz();window.scrollTo({top:0});return;}
  if(state.classifying) return;
  state.classifying='reading'; renderQuiz();
  try{
    // AI classification on the server (Gemini, or rule-based fallback). If signed in, it's saved to the account.
    applyClassification(await API.classify(state.answers));
  }catch(e){
    buildProfile(); state.profile.source='offline'; // server unreachable → local rules keep the flow working
    toast('Couldn’t reach the server — showing an offline result');
  }
  clearQuizProgress();
  track('quiz_complete',{dosha:state.profile.dosha,skin:state.profile.skin});
  // Then the AI routine. Wait a little for it so the results open complete; if it's slow,
  // the rule-based routine shows first and the AI version swaps in when it arrives.
  if(state.view==='quiz'){ state.classifying='building'; renderQuiz(); }
  const reco=loadReco();
  const arrived=await Promise.race([reco.then(()=>true),new Promise(r=>setTimeout(()=>r(false),12000))]);
  if(!arrived) reco.then(d=>{ if(d) refreshForReco(); });
  state.classifying=false;
  if(state.view!=='quiz') return; // user navigated away while we waited
  stashState(); updateProfileChip();
  state.animateResults=true; go('results');
}
function prevQ(){if(state.classifying)return;if(state.qStep>0){state.qStep--;saveQuizProgress();renderQuiz();window.scrollTo({top:0});}}

// Half-finished quizzes survive a refresh or coming back later (this browser only, for 7 days).
function saveQuizProgress(){
  try{localStorage.setItem('kanti_quiz',JSON.stringify({step:state.qStep,answers:state.answers.map(a=>a?{t:a.t,other:a.other||''}:null),at:Date.now()}));}catch(e){}
}
function clearQuizProgress(){try{localStorage.removeItem('kanti_quiz');}catch(e){} state.quizResumed=false;}
function restoreQuizProgress(){
  try{
    const d=JSON.parse(localStorage.getItem('kanti_quiz')||'null');
    if(!d||!Array.isArray(d.answers)||Date.now()-d.at>7*864e5) return false;
    const answers=d.answers.slice(0,QUIZ.length).map((x,i)=>{
      const t=x&&typeof x==='object'?x.t:x; const o=quizOptions(i).find(o=>o.t===t);
      return o?(o.isOther?{...o,other:String(x.other||'').slice(0,120)}:o):null;
    });
    const firstGap=answers.findIndex(a=>!a);
    const answered=firstGap<0?answers.length:firstGap;
    if(!answered) return false;
    state.answers=answers.slice(0,answered);
    state.qStep=Math.min(Number(d.step)||0,answered,QUIZ.length-1);
    return true;
  }catch(e){return false;}
}
function restartQuiz(){clearQuizProgress();state.qStep=0;state.answers=[];renderQuiz();}

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
  // A goal the AI read from "Other" text fills in only when no goal was picked.
  if(!p.concern && !p.allGoals && ['breakouts','dryness','dullness','sensitivity','fine lines'].includes(r.concern)) p.concern=r.concern;
  if(r.saved){ // signed in → the server already saved it to quiz history
    session.skin=r.saved; if(session.history) session.history.unshift(r.saved);
  } else if(!API.isAuthed()) p.unsaved=true; // saved after the user signs in
}

function buildProfile(){
  const skinVotes={},doshaVotes={};let concern=null,culture=null,spice=null;
  const vote=(o,k,w)=>{o[k]=(o[k]||0)+w;};
  state.answers.forEach((a,i)=>{
    const w=i===0?2:1; // Q1 weighted
    if(a.skin)vote(skinVotes,a.skin,w);
    if(a.dosha)vote(doshaVotes,a.dosha,1);
    if(a.doshaHint)vote(doshaVotes,a.doshaHint,0.5); // spice = gentle tiebreaker
    if(a.concern)concern=a.concern;
    if(a.culture)culture=a.culture;
    if(a.spice)spice=a.spice;
    if(a.all){ // "All of the above": mixed skin reads as combination; a vote for every dosha; every goal
      if(a.dim==='skin')vote(skinVotes,'combination',w);
      if(a.dim==='dosha')a.doshas.forEach(d=>vote(doshaVotes,d,1/a.doshas.length));
      if(a.dim==='concern')concern=null;
    }
    if(a.isOther&&a.other){
      if(a.dim==='skin')otherHints('skin',a.other).slice(0,1).forEach(v=>vote(skinVotes,v,w));
      if(a.dim==='dosha'||a.dim==='skin')otherHints('dosha',a.other).forEach(v=>vote(doshaVotes,v,a.dim==='dosha'?1:0.5));
      if(a.dim==='concern'){const c=otherHints('concern',a.other)[0]; if(c)concern=c;}
      if(a.dim==='culture')culture='other';
      if(a.dim==='spice')spice='other';
    }
  });
  const skin=Object.keys(skinVotes).sort((a,b)=>skinVotes[b]-skinVotes[a])[0]||'normal';
  const dosha=Object.keys(doshaVotes).sort((a,b)=>doshaVotes[b]-doshaVotes[a])[0]||'vata';
  const note=state.answers.filter(a=>a&&a.isOther&&a.other.trim()).map(a=>a.other.trim()).join(' · ').slice(0,240);
  const allGoals=state.answers.some(a=>a&&a.all&&a.dim==='concern');
  const own=dim=>{const a=state.answers.find(a=>a&&a.isOther&&a.dim===dim);return a?a.other.trim():'';};
  state.profile={skin,dosha,concern,culture,spice,note,allGoals,cultureText:own('culture'),spiceText:own('spice')};
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
  // The AI routine for this profile, when it has arrived (reco.js); otherwise the rules below.
  const r=recoNow();
  if(r && prof===state.profile){
    const steps=(tod==='AM'?r.am:r.pm)||[];
    const out=steps.filter(s=>prod(s.id)).map(s=>({slot:s.slot,p:prod(s.id),why:s.why}));
    if(out.length) return out;
  }
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
      steps.push({slot,p,why:why.length? 'Matches your '+why.join(' + ') : 'A universal step'});
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
  else if(state.view==='routine')renderRoutine();
  else if(state.view==='saved')renderSaved();
  else if(state.view==='compare')renderCompare();
  else if(state.view==='journey')renderJourney();
  else if(state.view==='contact')renderContact();
  else if(state.view==='ticket')renderTicket();
  else if(AUTH_VIEWS.includes(state.view))renderAuth(state.view);
  hideTip();
  enhanceTips(app);
  updateProfileChip(); renderCompareBar();
}

function renderHome(){
  app.innerHTML=`
  <section class="hero">
    <div class="wrap">
      <div>
        <div class="hero-eyebrow">Ayurvedic skincare · made personal</div>
        <h1>${t('Skincare that fits')} <em>${t('your nature.')}</em></h1>
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

  ${todayHTML()}

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
    ${state.profile
      ? `<div class="section-head"><div class="eyebrow">Picked for you</div><h2>For your ${esc(DOSHA[state.profile.dosha].name)} nature</h2></div>
         <div class="grid">${homePicks().map(cardHTML).join('')}</div>`
      : `<div class="section-head"><div class="eyebrow">Bestsellers</div><h2>A few favourites</h2></div>
         <div class="grid">${PRODUCTS.slice(0,3).map(cardHTML).join('')}</div>`}
  </section>
  ${recentHTML()}


  ${footerHTML()}`;
}

function homePicks(){
  const r=recoNow();
  const ids=[...(r?(r.addons||[]).map(a=>a.id):[]),...routineIds()].filter((id,i,a)=>a.indexOf(id)===i&&prod(id)&&!soldOut(prod(id)));
  return ids.slice(0,3).map(prod);
}
function renderQuiz(){
  const step=QUIZ[state.qStep];
  const chosen=state.answers[state.qStep];
  const pct=Math.round(((state.qStep)/(QUIZ.length))*100);
  app.innerHTML=`
  <div class="quiz">
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="progress-label"><span>Question ${state.qStep+1} of ${QUIZ.length}</span><span>${SKIN_or_DOSHA(state.qStep)}</span></div>
    ${state.quizResumed&&!state.classifying?`<div class="resume-note">↺ Picked up where you left off. <button class="link-btn" data-act="restartQuiz">Start over</button></div>`:''}
    <h2 class="q-title">${step.q}</h2>
    <p class="q-sub">${step.sub}</p>
    <div class="options">
      ${quizOptions(state.qStep).map((o,i)=>`
        <button class="option ${o.all?'opt-all':''} ${o.isOther?'opt-other':''} ${chosen&&chosen.t===o.t?'selected':''}" data-act="answer" data-arg="${i}" aria-pressed="${!!(chosen&&chosen.t===o.t)}">
          <span class="mark"></span>
          <span><b>${o.t}</b>${o.s?`<small>${o.s}</small>`:''}</span>
        </button>`).join('')}
      ${chosen&&chosen.isOther?`<div class="other-box">
        <label for="otherText">In your own words</label>
        <input id="otherText" maxlength="120" autocomplete="off" value="${esc(chosen.other)}" data-input="otherText"
          placeholder="${esc({skin:'e.g. shiny by noon but flaky around my nose',dosha:'e.g. I get red and blotchy in summer',concern:'e.g. dark spots from old acne',culture:'e.g. Carnatic music and temple architecture',spice:'e.g. fennel (saunf)'}[step.dim]||'Tell us a little more')}">
        <small>Kanti AI reads this to fine-tune your result.</small>
      </div>`:''}
    </div>
    <div class="quiz-nav">
      <button class="btn btn-ghost" ${state.qStep===0?'data-go="home"':'data-act="prevQ"'} ${state.classifying?'disabled':''}>← Back</button>
      <button class="btn btn-primary" id="quizNext" data-act="nextQ" ${answerReady(chosen)&&!state.classifying?'':'disabled'}>${state.classifying==='building'?'Building your routine…':state.classifying?'Reading your skin…':state.qStep===QUIZ.length-1?'See my routine':'Next'}</button>
    </div>
  </div>`;
}
function SKIN_or_DOSHA(i){return i<2?'Skin type':i<4?'Your dosha':i===4?'Your goal':'A little fun';}

function funFactHTML(prof){
  const ct=prof.culture==='other'&&prof.cultureText?esc(prof.cultureText):(CULTURE_TRAIT[prof.culture]||'your own thing');
  const sn=prof.spice==='other'&&prof.spiceText?`you reach for ${esc(prof.spiceText)}`:(SPICE_NOTE[prof.spice]||'you keep your kitchen interesting');
  const df=DOSHA_FUN[prof.dosha];
  return `<div class="funfact">
    <div class="ff-badge">✨ A little about you</div>
    <p>You’re drawn to <b>${ct}</b>, and <b>${sn}</b>. That pairs nicely with your <b>${DOSHA[prof.dosha].name}</b> nature — ${df}</p>
  </div>`;
}
function renderResults(){
  const prof=state.profile;const d=DOSHA[prof.dosha];
  ensureReco();
  const steps=buildRoutine(prof,state.tod);
  const wk=weeklyStep(prof), weekly=wk?[wk]:[];
  const tot=routineTotal(prof);
  const concernTxt = prof.concern? ` We’ve prioritised your goal: <b>${esc(prof.concern)}</b>.`:(prof.allGoals?' We’ve balanced your routine across <b>all your goals</b>.':'');
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
        ${recoNow()&&recoNow().summary?recoIntroHTML():(prof.source==='gemini'&&prof.rationale?`<p class="rationale">${esc(prof.rationale)}</p>`:'')}
        ${recoStatusHTML()||(srcNote?`<div class="src-note">${srcNote}</div>`:'')}
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

    <div class="rv" style="--d:.36s">${skinSimHTML()}</div>

    <div class="rv" style="--d:.42s">
      ${streakHTML(prof)}
      <div class="routine-head">
        <h2>Your daily routine</h2>
        <div class="tod">
          <button class="${state.tod==='AM'?'active':''}" data-act="setTod" data-arg="AM">☀️ Morning</button>
          <button class="${state.tod==='PM'?'active':''}" data-act="setTod" data-arg="PM">🌙 Evening</button>
        </div>
      </div>
      <p class="routine-hint">Tick each step off as you go — finish morning and evening to grow your streak. <button class="link-btn" data-go="routine">Open my routine page →</button></p>
      ${steps.map((s,i)=>routineStepHTML(s,i+1,state.tod,i,true)).join('')}
    </div>

    <div class="rv" style="--d:.56s">
      <div class="routine-head" style="margin-top:36px"><h2>Weekly treat</h2></div>
      ${weekly.map((s,i)=>routineStepHTML(s,i+1,'WK',i,false)).join('')}
    </div>

    <div class="rv" style="--d:.6s">${tipsHTML()}</div>

    <div class="rv" style="--d:.68s;display:flex;gap:14px;flex-wrap:wrap;margin-top:34px;align-items:center">
      <button class="btn btn-gold" data-act="addWholeRoutine">Add full routine to bag · ${tot.n} products · ${money(tot.cents/100)}</button>
      <button class="btn btn-ghost" data-act="shareResult">Share my result</button>
      <button class="btn btn-ghost" data-go="shop">Keep browsing</button>
      <button class="btn btn-ghost" data-go="quiz">Retake quiz</button>
    </div>
    <div class="rv" style="--d:.76s">${addonsHTML()}${beyondHTML()}</div>
  </div>
  ${footerHTML()}`;
  enhanceTips(app);
  mountSkinSim();
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
      <small>${s.why?('✓ '+esc(s.why)):esc(p.benefit)}${soldOut(p)?' · <span class="stock-flag out inline">Sold out</span>':''}</small>
    </div>
    <span class="rs-price">${money(p.price)}</span>
    <button class="btn btn-primary btn-sm" data-act="addToCart" data-arg="${esc(p.id)}" ${soldOut(p)?'disabled':''}>Add</button>
    <button class="btn btn-ghost btn-sm" data-act="openModal" data-arg="${esc(p.id)}">Details</button>
  </div>`;
}
function addWholeRoutine(){
  const prof=state.profile; if(!prof){go('quiz');return;}
  const ids=routineIds(prof);
  let added=0, out=0;
  ids.forEach(id=>{ addToCart(id,true) ? added++ : (soldOut(prod(id))&&out++); });
  toast(added?`${added} product${added===1?'':'s'} added to bag${out?` · ${out} sold out`:''}`:(out?`${out} sold out`:'Your routine is already in your bag'));
  openCart();
}

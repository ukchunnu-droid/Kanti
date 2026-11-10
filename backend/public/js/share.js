// Kanti storefront — share.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* ---------- Share your result ---------- */
function funFactText(prof){
  const ct=CULTURE_TRAIT[prof.culture]||'your own thing';
  const sn=SPICE_NOTE[prof.spice]||'you keep your kitchen interesting';
  return `Drawn to ${ct}, and ${sn}.`;
}
function resultSummaryText(prof){
  const d=DOSHA[prof.dosha];
  return `My Kanti skin profile: ${SKIN_LABEL[prof.skin]} skin, ${d.name}-leaning. ${funFactText(prof)} Find your Ayurvedic routine 🌿`;
}
function wrapCanvasText(ctx,text,cx,y,maxW,lh){
  const words=text.split(' ');let line='';const lines=[];
  words.forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;});
  if(line)lines.push(line);
  lines.forEach((ln,i)=>ctx.fillText(ln,cx,y+i*lh));
  return lines.length;
}
function renderShareCanvas(prof){
  const d=DOSHA[prof.dosha], W=1080, H=1080;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d');
  x.fillStyle='#20453B';x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(201,151,47,.5)';x.lineWidth=4;x.strokeRect(50,50,W-100,H-100);
  x.textAlign='center';
  x.fillStyle='#E0B964';x.font='700 32px Arial';x.fillText('MY KANTI SKIN PROFILE',W/2,185);
  x.fillStyle='#F7F3E9';x.font='600 104px Georgia';x.fillText(SKIN_LABEL[prof.skin]+' skin',W/2,330);
  x.fillStyle='#E0B964';x.font='600 92px Georgia';x.fillText(d.name+'-leaning',W/2,450);
  const dcol={vata:'#8A90C8',pitta:'#D2764A',kapha:'#5E9160'};const names=['vata','pitta','kapha'];const gap=170,sx=W/2-gap;
  names.forEach((k,i)=>{x.beginPath();x.fillStyle=dcol[k];x.arc(sx+i*gap,560,36,0,Math.PI*2);x.fill();
    x.fillStyle=(k===prof.dosha)?'#F7F3E9':'#7E9389';x.font='500 28px Arial';x.fillText(DOSHA[k].name,sx+i*gap,648);});
  x.fillStyle='#EAE6DA';x.font='400 44px Georgia';
  wrapCanvasText(x,funFactText(prof),W/2,760,W-260,62);
  x.fillStyle='#E0B964';x.font='700 70px Georgia';x.fillText('Kanti',W/2,955);
  x.fillStyle='#AFC0B4';x.font='400 30px Arial';x.fillText('Skincare that fits your nature',W/2,1000);
  return c;
}
function shareResult(){
  const prof=state.profile; if(!prof){toast('Take the quiz first');return;}
  const dataUrl=renderShareCanvas(prof).toDataURL('image/png');
  window._shareData=dataUrl; window._shareText=resultSummaryText(prof);
  $('#modal').innerHTML=`
    <button class="modal-close" data-act="closeModal">✕</button>
    <div class="share-wrap">
      <h2>Share your result</h2>
      <img class="share-img" src="${dataUrl}" alt="My Kanti skin result card">
      <div class="share-actions">
        <button class="btn btn-primary" data-act="downloadShare">Download image</button>
        <button class="btn btn-ghost" data-act="copyShareText">Copy text</button>
      </div>
      <p class="share-note">Save the image to post it, or copy the text to share your result.</p>
    </div>`;
  $('#overlay').classList.add('open');
}
function downloadShare(){
  try{const a=document.createElement('a');a.href=window._shareData;a.download='my-kanti-result.png';document.body.appendChild(a);a.click();a.remove();toast('Image downloaded');}
  catch(e){toast('Download not supported here');}
}
function copyShareText(){
  const t=window._shareText||'';
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(()=>toast('Copied to clipboard')).catch(()=>toast('Press and hold to copy'));}
  else toast('Copy not supported here');
}

function footerHTML(){
  return `<footer><div class="wrap">
    <div class="brand">Kan<span style="color:var(--gold)">ti</span></div>
    <small>Ayurvedic skincare that fits your nature · Student project · <button class="link-btn footer-link" data-go="privacy">Privacy</button></small>
  </div></footer>`;
}

/* ---------- Theme toggle ---------- */
function toggleTheme(){
  const root=document.documentElement;
  const cur=root.getAttribute('data-theme');
  const isDark = cur==='dark' || (!cur && matchMedia('(prefers-color-scheme:dark)').matches);
  root.setAttribute('data-theme', isDark?'light':'dark');
  $('#themeBtn').textContent = isDark?'☾':'☀';
}

/* ---------- Tooltip interaction (delegated, capture phase) ---------- */
document.addEventListener('click',function(e){
  const chip = e.target.closest && e.target.closest('.has-tip');
  if(chip){ e.stopPropagation(); e.preventDefault(); toggleTip(chip); return; }
  if(!(e.target.closest && e.target.closest('#ingtip'))) hideTip();
}, true);
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){ hideTip(); return; }
  if((e.key==='Enter'||e.key===' ') && e.target.classList && e.target.classList.contains('has-tip')){
    e.preventDefault(); toggleTip(e.target);
  }
});
window.addEventListener('scroll',hideTip,true);
window.addEventListener('resize',hideTip);

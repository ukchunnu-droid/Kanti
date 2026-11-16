// Kanti storefront — data.js
// Classic script: shares globals with the other files; load order is set in index.html.
/* =========================================================
   KANTI — Ayurvedic skincare storefront (backend-wired)
   Served by the Express backend. Accounts, orders, email and
   quiz classification go through the API client (/api.js).
   Product catalogue is still mock / for demonstration.
   Source design: prototype/kanti-prototype.html
   ========================================================= */

/* ---------- Product catalogue ---------- */
// Products and the shipping rule come from the server (GET /api/products) — see backend/src/catalog.js.
let PRODUCTS = [];
let SHIPPING = {flat_cents:500, free_over_cents:5000};

const SKIN_LABEL = {oily:'Oily',normal:'Normal',dry:'Dry',combination:'Combination'};
const DOSHA = {
  vata:{name:'Vata',color:'var(--vata)',note:'Air & ether — tends dry, fine, thirsty skin.',
        look:['Hydrating oils','Almond','Shatavari','Hyaluronic acid'], avoid:['Harsh foaming washes','Over-exfoliating']},
  pitta:{name:'Pitta',color:'var(--pitta)',note:'Fire & water — tends sensitive, warm, reactive skin.',
        look:['Cooling aloe','Sandalwood','Rose','Liquorice'], avoid:['Hot water','Strong acids','Heavy fragrance']},
  kapha:{name:'Kapha',color:'var(--kapha)',note:'Earth & water — tends oily, congested, dull skin.',
        look:['Clarifying neem','Turmeric','Clay','Niacinamide'], avoid:['Heavy occlusive creams','Skipping exfoliation']},
};

/* ---------- Fun-fact content (end-of-quiz personality moment) ---------- */
const CULTURE_TRAIT = {
  all:'a little of everything — festivals, yoga, music, crafts and cinema',
  festivals:'bringing everyone together',
  yoga:'a calm, mindful kind of glow',
  arts:'rhythm and a touch of old-soul grace',
  crafts:'colour, texture and detail',
  cinema:'big-hearted, full-of-feeling energy',
};
const SPICE_NOTE = {
  all:'your spice rack has a bit of everything',
  turmeric:'you reach for turmeric — the spice world’s all-rounder',
  chilli:'you like a little heat in life (your skin can take the hint too)',
  ginger:'ginger keeps you warm and on the move',
  cumin:'earthy cumin keeps you grounded',
  cardamom:'cool, aromatic cardamom keeps you calm',
};
const DOSHA_FUN = {
  vata:'Creative and always on the go — your skin just loves a little extra hydration.',
  pitta:'Driven and warm — your skin is happiest when you keep things cool and calm.',
  kapha:'Steady and nurturing — your skin glows brightest when you keep it light and clarified.',
};

/* ---------- Ingredient glossary (for tap-to-learn tooltips) ---------- */
const INGREDIENT_INFO = {
  'neem':{name:'Neem',what:'Antibacterial — clears breakouts and calms oily, congested skin.',suits:'Oily / combination · Pitta, Kapha'},
  'tulsi':{name:'Tulsi (holy basil)',what:'Purifies and soothes blemish-prone skin.',suits:'Oily / combination · Pitta, Kapha'},
  'turmeric':{name:'Turmeric',what:'Antioxidant that brightens tone and calms inflammation.',suits:'All skin · especially Pitta, Kapha'},
  'aloe':{name:'Aloe',what:'Lightweight hydration that cools and soothes.',suits:'All skin · especially Pitta'},
  'rose':{name:'Rose',what:'Tones, hydrates and balances the skin.',suits:'Normal / dry · Vata, Pitta'},
  'sandalwood':{name:'Sandalwood',what:'Calms redness, sensitivity and heat.',suits:'Sensitive / normal · Pitta'},
  'brahmi':{name:'Brahmi',what:'Strengthens the skin barrier; antioxidant-rich.',suits:'Dry / normal · Vata'},
  'amla':{name:'Amla',what:'Vitamin-C rich — brightens and helps firm skin.',suits:'All skin'},
  'saffron':{name:'Saffron',what:'The classic Ayurvedic radiance and even-tone ingredient.',suits:'Dry / normal · Vata'},
  'shatavari':{name:'Shatavari',what:'Nourishes and replenishes depleted, dry skin.',suits:'Dry · Vata'},
  'triphala':{name:'Triphala',what:'Gentle antioxidant blend for overnight renewal.',suits:'Normal / combination · Pitta, Kapha'},
  'bakuchiol':{name:'Bakuchiol',what:'A gentle plant alternative to retinol; smooths texture.',suits:'All skin (well tolerated)'},
  'niacinamide':{name:'Niacinamide',what:'Evens tone, controls oil and refines the look of pores.',suits:'Oily / combination'},
  'hyaluronic':{name:'Hyaluronic acid',what:'Draws water into the skin for lasting hydration.',suits:'All skin'},
  'zinc':{name:'Zinc oxide',what:'Mineral UV protection that also calms skin.',suits:'All skin'},
  'multani':{name:'Multani mitti',what:'Fuller’s earth clay that draws out oil and congestion.',suits:'Oily · Kapha'},
  'almond':{name:'Almond oil',what:'Softening, vitamin-E rich moisture for dry skin.',suits:'Dry · Vata'},
  'shea':{name:'Shea butter',what:'Rich, cushioning moisture that seals in hydration.',suits:'Dry'},
  'liquorice':{name:'Liquorice',what:'Brightens dark marks and soothes irritation.',suits:'Sensitive · Pitta'},
  'witch hazel':{name:'Witch hazel',what:'Gently tightens and mattifies oily skin.',suits:'Oily'},
  'glycerin':{name:'Glycerin',what:'A humectant that holds moisture in the skin.',suits:'All skin'},
  'honey':{name:'Honey',what:'Humectant, antibacterial and soothing.',suits:'Dry / normal'},
  'green tea':{name:'Green tea',what:'Antioxidant that calms and protects.',suits:'Oily / combination'},
  'cucumber':{name:'Cucumber',what:'Cooling and lightly hydrating.',suits:'Normal · Pitta'},
  'oat':{name:'Oat',what:'Soothes irritation and supports the barrier.',suits:'Sensitive'},
  'sesame':{name:'Sesame oil',what:'Warming, nourishing base oil — a classic in Ayurveda.',suits:'Dry · Vata'},
  'clay':{name:'Clay',what:'Draws out excess oil and impurities.',suits:'Oily · Kapha'},
  'vitamin c':{name:'Vitamin C',what:'Brightens tone and defends against daily damage.',suits:'All skin'},
};
function lookupIngredient(text){
  const t=(text||'').toLowerCase();
  for(const k in INGREDIENT_INFO){ if(t.includes(k)) return INGREDIENT_INFO[k]; }
  return null;
}

/* ---------- Quiz definition ---------- */
const QUIZ = [
  {dim:'skin', q:'By mid-afternoon, your skin usually feels…', sub:'Tells us your core skin type.',
   opts:[
     {t:'Tight, maybe a little flaky', s:'Dry all over', skin:'dry'},
     {t:'Shiny or oily across the whole face', s:'Oily all over', skin:'oily'},
     {t:'Oily on the T-zone, normal-to-dry on cheeks', s:'The classic combination', skin:'combination'},
     {t:'Comfortable and balanced', s:'Lucky you', skin:'normal'},
   ]},
  {dim:'skin', q:'How would you describe your pores?', sub:'Confirms skin type.',
   opts:[
     {t:'Small, barely visible', s:'', skin:'dry'},
     {t:'Large, especially around the nose', s:'', skin:'oily'},
     {t:'Visible on the T-zone, fine elsewhere', s:'', skin:'combination'},
     {t:'Even and unremarkable', s:'', skin:'normal'},
   ]},
  {dim:'dosha', q:'When the weather changes, your skin tends to…', sub:'This points to your dosha — Ayurveda’s read on your skin’s nature.',
   opts:[
     {t:'Get dry, rough or chapped; you feel the cold', s:'Vata leaning', dosha:'vata'},
     {t:'Flush, get red or break out in the heat', s:'Pitta leaning', dosha:'pitta'},
     {t:'Get oily, congested or look dull & heavy', s:'Kapha leaning', dosha:'kapha'},
   ]},
  {dim:'dosha', q:'Which best describes you overall?', sub:'Doshas describe the whole person, not just skin.',
   opts:[
     {t:'Light, quick, often cold, changeable energy', s:'Vata', dosha:'vata'},
     {t:'Medium build, warm, intense, driven', s:'Pitta', dosha:'pitta'},
     {t:'Solid, steady, calm, slow to change', s:'Kapha', dosha:'kapha'},
   ]},
  {dim:'concern', q:'What’s your main skin goal right now?', sub:'We’ll prioritise this in your routine.',
   opts:[
     {t:'Clear up breakouts', s:'', concern:'breakouts'},
     {t:'More hydration', s:'', concern:'dryness'},
     {t:'Brighten dullness / glow', s:'', concern:'dullness'},
     {t:'Calm redness & sensitivity', s:'', concern:'sensitivity'},
     {t:'Soften early fine lines', s:'', concern:'fine lines'},
   ]},
  {dim:'culture', multi:true, q:'Which parts of Indian culture do you love?', sub:'Pick as many as you like — just for fun, it doesn’t change your skin result.',
   opts:[
     {t:'Festivals & food', s:'The one who brings everyone together', culture:'festivals'},
     {t:'Yoga & wellness', s:'Calm and mindful', culture:'yoga'},
     {t:'Classical dance & music', s:'An old soul with great rhythm', culture:'arts'},
     {t:'Textiles & handicrafts', s:'An eye for colour and detail', culture:'crafts'},
     {t:'Cinema & Bollywood', s:'Big-hearted (and a little dramatic)', culture:'cinema'},
   ]},
  {dim:'spice', q:'Which spice do you reach for most, day to day?', sub:'In Ayurveda, what warms or cools you can hint at your dosha.',
   opts:[
     {t:'Turmeric (haldi)', s:'The all-rounder', spice:'turmeric'},
     {t:'Chilli', s:'You like a little heat', spice:'chilli', doshaHint:'pitta'},
     {t:'Ginger (adrak)', s:'Warming and zingy', spice:'ginger', doshaHint:'kapha'},
     {t:'Cumin (jeera)', s:'Earthy and grounding', spice:'cumin', doshaHint:'vata'},
     {t:'Cardamom (elaichi)', s:'Cool and aromatic', spice:'cardamom'},
   ]},
];

/* Every question also offers "All of the above" and "Other" (your own words).
   "All" carries every option's values; "Other" carries the typed text (read by the AI, and by
   simple keywords when the AI isn't available). */
const ALL_T='All of the above', OTHER_T='Other';
function quizOptions(i){
  const q=QUIZ[i]; if(!q) return [];
  const pick=k=>[...new Set(q.opts.map(o=>o[k]).filter(Boolean))];
  const all={t:ALL_T,s:{skin:'A bit of everything',dosha:'A mix of all three',concern:'I’d like help with all of these',culture:'I love it all',spice:'A bit of everything'}[q.dim]||'',
    all:true,dim:q.dim,skins:pick('skin'),doshas:pick('dosha'),concerns:pick('concern')};
  if(q.dim==='culture') all.culture='all';
  if(q.dim==='spice') all.spice='all';
  return [...q.opts.map(o=>({...o,dim:q.dim})),all,{t:OTHER_T,s:'Describe it in your own words',other:'',dim:q.dim,isOther:true}];
}
// Plain keywords for "Other" answers (mirrors the server's fallback; the AI reads the full text).
const OTHER_KEYWORDS={
  skin:[['oily',/oil|greas|shin|slick|sweaty/],['dry',/dry|flak|tight|rough|dehydrat|peel|itch/],['combination',/t-?zone|combo|combination|both|mixed/],['normal',/normal|balanced|comfortable|fine/]],
  dosha:[['pitta',/hot|heat|warm|red|flush|sensitiv|burn|rash|irritat|intense|sweat|inflam/],['vata',/cold|dry|anxi|thin|restless|rough|crack|chap|wind/],['kapha',/oily|heavy|dull|congest|puff|slow|steady|sluggish|calm/]],
  concern:[['breakouts',/acne|pimple|break ?out|spot|blemish|zit|blackhead/],['dryness',/dry|flak|hydrat|tight|moistur/],['dullness',/dull|glow|bright|tired|uneven|pigment|dark|tan|radian/],['sensitivity',/red|sensitiv|irritat|itch|rosacea|calm|react/],['fine lines',/line|wrinkl|aging|ageing|firm|sag/]],
};
const otherHints=(dim,text)=>(OTHER_KEYWORDS[dim]||[]).filter(([,re])=>re.test(String(text||'').toLowerCase())).map(([v])=>v);

/* Multi-answer questions (culture): the answer keeps every pick. "All of the above" ticks every
   option; "Other" adds your own words. culture = the picked keys joined with commas. */
function multiAnswer(i, picks, other){
  const q=QUIZ[i], opts=quizOptions(i);
  const chosen=opts.filter(o=>!o.all&&picks.includes(o.t));
  const keys=chosen.filter(o=>!o.isOther).map(o=>o[q.dim]).filter(Boolean);
  const hasOther=chosen.some(o=>o.isOther);
  if(hasOther) keys.push('other');
  return {multi:true, dim:q.dim, picks:chosen.map(o=>o.t), other:hasOther?String(other||'').slice(0,120):'',
    t:chosen.map(o=>o.isOther?(other||OTHER_T):o.t).join(' + ').slice(0,120), [q.dim]:keys.join(',')||null};
}
// "Festivals & food, Yoga & wellness" → "bringing everyone together and a calm, mindful kind of glow"
function cultureTraits(prof){
  const keys=String(prof.culture||'').split(',').filter(Boolean);
  const list=keys.map(k=>k==='other'?(prof.cultureText||''):CULTURE_TRAIT[k]).filter(Boolean);
  if(!list.length) return 'your own thing';
  return list.length===1?list[0]:list.slice(0,-1).join(', ')+' and '+list[list.length-1];
}

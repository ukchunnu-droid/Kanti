// "Why this routine works" — the reasons behind each step, and the before/after illustration.
//
// Deliberately NOT written by the AI: these are fixed, reviewed statements, so the app never shows an
// invented study, statistic or claim. Each ingredient has
//   science  — what it does in the skin, stated cautiously (mechanism level, no numbers or citations)
//   ayurveda — its classical properties (rasa = taste, guna = quality, virya = potency) and dosha action;
//              modern ingredients say plainly that they are not classical Ayurvedic herbs.
//   targets  — which skin measures it helps (used for the before/after illustration).
// Scores are an ILLUSTRATION of the usual direction of change with consistent use, not a measurement.

const NOT_CLASSICAL = 'Not a classical Ayurvedic herb — included for its well-studied effect on the skin.';

const INGREDIENTS = {
  neem: { name: 'Neem', targets: ['clarity', 'oil'],
    science: 'Neem leaf extracts show antibacterial activity in laboratory studies, including against acne-associated bacteria, and are mildly anti-inflammatory.',
    ayurveda: 'Nimba is tikta (bitter) and sheeta (cooling). It is classically used to pacify Pitta and Kapha and to purify the blood and skin (raktashodhana).' },
  tulsi: { name: 'Tulsi (holy basil)', targets: ['clarity'],
    science: 'Holy basil contains eugenol and other compounds with antimicrobial and antioxidant activity.',
    ayurveda: 'Tulsi is katu and tikta (pungent, bitter) with ushna (warming) potency; it reduces Kapha and Vata and is used to clear the skin.' },
  aloe: { name: 'Aloe', targets: ['hydration', 'calm'],
    science: 'Aloe gel’s polysaccharides help the skin hold water, and it has soothing, anti-inflammatory properties.',
    ayurveda: 'Kumari is sheeta (cooling) and picchila (slimy, soothing); it pacifies Pitta and is a classic remedy for heat and redness.' },
  rose: { name: 'Rose', targets: ['calm', 'hydration'],
    science: 'Rose water is a gentle, slightly astringent toner that supplies antioxidant polyphenols.',
    ayurveda: 'Shatapatri is madhura (sweet) and sheeta (cooling); it calms Pitta and refreshes the skin.' },
  sandalwood: { name: 'Sandalwood', targets: ['calm', 'radiance'],
    science: 'Sandalwood’s main component, alpha-santalol, has shown anti-inflammatory and soothing effects in studies.',
    ayurveda: 'Chandana is tikta and madhura with sheeta potency — the classic Pitta-cooling herb, and varnya (it improves complexion).' },
  turmeric: { name: 'Turmeric', targets: ['radiance', 'clarity', 'calm'],
    science: 'Curcumin, turmeric’s active compound, is an antioxidant and anti-inflammatory agent.',
    ayurveda: 'Haridra is tikta and katu with ushna potency; it is varnya (complexion-enhancing) and reduces Kapha.' },
  brahmi: { name: 'Brahmi', targets: ['hydration', 'smoothness', 'calm'],
    science: 'Brahmi (bacopa) is rich in antioxidant saponins called bacosides, which help protect skin cells from oxidative stress.',
    ayurveda: 'Brahmi is tikta with sheeta potency; it pacifies Pitta and Vata and is used in traditional skin-healing preparations.' },
  amla: { name: 'Amla', targets: ['radiance', 'smoothness'],
    science: 'Amla is naturally rich in vitamin C and polyphenols, antioxidants that support collagen and a more even tone.',
    ayurveda: 'Amalaki balances all three doshas (tridoshic) and is a rasayana — a rejuvenative.' },
  saffron: { name: 'Saffron', targets: ['radiance'],
    science: 'Saffron contains crocin and safranal, antioxidants studied for brightening and protecting the skin.',
    ayurveda: 'Kumkuma is varnya (complexion-enhancing) with ushna potency; it balances Vata and Kapha and is the heart of classical Kumkumadi taila.' },
  shatavari: { name: 'Shatavari', targets: ['hydration', 'smoothness'],
    science: 'Shatavari root contains saponins and mucilage and is used as a moisturising, emollient botanical.',
    ayurveda: 'Shatavari is madhura, snigdha (unctuous) and sheeta; it nourishes and pacifies Vata and Pitta.' },
  triphala: { name: 'Triphala', targets: ['radiance', 'clarity'],
    science: 'Triphala’s three fruits supply polyphenols and tannins with antioxidant and gently astringent action.',
    ayurveda: 'Triphala (amalaki, bibhitaki, haritaki) is tridoshic; it cleanses and rejuvenates.' },
  bakuchiol: { name: 'Bakuchiol', targets: ['smoothness', 'radiance'],
    science: 'Bakuchiol is a plant compound that, in a controlled clinical study, improved fine lines and uneven pigmentation similarly to retinol, with less irritation.',
    ayurveda: 'It comes from bakuchi (Psoralea corylifolia), an herb classically used for skin disorders (kushthaghna).' },
  niacinamide: { name: 'Niacinamide', targets: ['oil', 'calm', 'clarity', 'radiance'],
    science: 'Niacinamide (vitamin B3) strengthens the skin barrier, reduces water loss and helps regulate oil, redness and uneven tone.',
    ayurveda: NOT_CLASSICAL },
  hyaluronic: { name: 'Hyaluronic acid', targets: ['hydration', 'smoothness'],
    science: 'Hyaluronic acid is a humectant: it binds water in the outer layer of skin, plumping it and reducing the look of fine dryness lines.',
    ayurveda: NOT_CLASSICAL },
  zinc: { name: 'Zinc oxide', targets: ['radiance', 'smoothness', 'calm'],
    science: 'Zinc oxide is a mineral sunscreen that blocks UVA and UVB rays — the main cause of dark spots and early lines — and is gentle on sensitive skin.',
    ayurveda: 'Not a classical herb — sun protection supports the Ayurvedic aim of shielding the skin from excess heat (ushna), which aggravates Pitta.' },
  multani: { name: 'Multani mitti', targets: ['oil', 'clarity'],
    science: 'Fuller’s earth clay absorbs excess sebum and lifts impurities from pores.',
    ayurveda: 'Multani mitti is ruksha (drying) and sheeta (cooling); it reduces Kapha oiliness and cools Pitta.' },
  almond: { name: 'Almond oil', targets: ['hydration', 'smoothness'],
    science: 'Almond oil is an emollient rich in fatty acids and vitamin E that softens skin and reduces water loss.',
    ayurveda: 'Badam taila is madhura and snigdha (unctuous); it pacifies Vata.' },
  shea: { name: 'Shea butter', targets: ['hydration', 'smoothness'],
    science: 'Shea butter is an occlusive emollient that seals moisture into the skin.',
    ayurveda: 'Not a classical herb — its rich, unctuous (snigdha) nature balances dry, rough Vata skin.' },
  liquorice: { name: 'Liquorice', targets: ['calm', 'radiance'],
    science: 'Liquorice root extract contains glabridin, studied for soothing redness and fading dark spots.',
    ayurveda: 'Yashtimadhu is madhura with sheeta potency and is varnya; it calms Pitta and evens complexion.' },
  'witch hazel': { name: 'Witch hazel', targets: ['oil'],
    science: 'Witch hazel contains tannins, which are astringent and temporarily reduce the look of oiliness and pores.',
    ayurveda: 'Not a classical herb — its astringent (kashaya-like) quality counters Kapha oiliness.' },
  glycerin: { name: 'Glycerin', targets: ['hydration'],
    science: 'Glycerin is a humectant that draws water into the skin and supports the barrier.',
    ayurveda: NOT_CLASSICAL },
  honey: { name: 'Honey', targets: ['hydration', 'clarity'],
    science: 'Honey is a natural humectant with antibacterial properties.',
    ayurveda: 'Madhu reduces Kapha and is used in traditional cleansing and healing pastes (lepa).' },
  'green tea': { name: 'Green tea', targets: ['calm', 'oil'],
    science: 'Green tea polyphenols such as EGCG are antioxidants and may help reduce sebum and redness.',
    ayurveda: NOT_CLASSICAL },
  cucumber: { name: 'Cucumber', targets: ['hydration', 'calm'],
    science: 'Cucumber extract is mostly water with soothing, cooling compounds.',
    ayurveda: 'Trapusa is sheeta (cooling); it pacifies Pitta.' },
  oat: { name: 'Oat', targets: ['calm', 'hydration'],
    science: 'Colloidal oat contains avenanthramides that soothe itching and irritation and support the skin barrier.',
    ayurveda: NOT_CLASSICAL },
  sesame: { name: 'Sesame oil', targets: ['hydration', 'smoothness'],
    science: 'Sesame oil is an emollient containing antioxidant lignans such as sesamol.',
    ayurveda: 'Tila taila is the classic Vata oil — snigdha and ushna — used for abhyanga (oil massage).' },
  'vitamin c': { name: 'Vitamin C', targets: ['radiance', 'smoothness'],
    science: 'Vitamin C is an antioxidant needed for collagen formation; it also helps fade uneven tone.',
    ayurveda: NOT_CLASSICAL },
};
function lookup(name) {
  const t = String(name || '').toLowerCase();
  if (t.includes('almond')) return INGREDIENTS.almond;
  for (const k of Object.keys(INGREDIENTS)) if (t.includes(k)) return { key: k, ...INGREDIENTS[k] };
  return null;
}

// What each routine step does.
const STEPS = {
  Cleanse: { science: 'Removes excess sebum, sweat and pollution so the following steps can reach the skin.', ayurveda: 'Shodhana — cleansing comes before nourishing.' },
  Tone: { science: 'Rebalances the skin after cleansing and adds a first light layer of hydration.', ayurveda: 'A cooling or balancing herbal water prepares the skin (prakshalana).' },
  Treat: { science: 'Delivers concentrated actives aimed at your main concern.', ayurveda: 'The targeted step that brings your dominant dosha back into balance.' },
  Moisturise: { science: 'Replaces lipids and reduces transepidermal water loss, keeping the barrier strong.', ayurveda: 'Snehana — nourishing the skin with the right amount of unctuousness.' },
  Protect: { science: 'Daily UV protection prevents the sun damage behind most dark spots and early lines.', ayurveda: 'Shields the skin from the sun’s heat (ushna), which aggravates Pitta.' },
  Weekly: { science: 'A weekly mask deep-cleans or replenishes beyond what daily care can.', ayurveda: 'Lepa — the traditional herbal paste applied to the face.' },
};

// The Ayurvedic principle: like increases like, opposites balance (samanya–vishesha siddhanta).
const DOSHA_PRINCIPLE = {
  vata: { qualities: 'ruksha (dry), laghu (light), sheeta (cold) and chala (mobile)',
    remedy: 'snigdha (unctuous), warm and nourishing care, with madhura (sweet) herbs and gentle oils',
    skin: 'Vata-leaning skin tends to be thin and dry, losing moisture easily and showing fine lines early.' },
  pitta: { qualities: 'ushna (hot), tikshna (sharp) and drava (fluid)',
    remedy: 'sheeta (cooling), soothing care with madhura, tikta and kashaya (sweet, bitter, astringent) herbs',
    skin: 'Pitta-leaning skin tends to be warm and reactive — prone to redness, sensitivity and heat-triggered breakouts.' },
  kapha: { qualities: 'guru (heavy), snigdha (oily), sheeta (cold) and sthira (stable)',
    remedy: 'laghu (light), clarifying, gently warming care with tikta, katu and kashaya (bitter, pungent, astringent) herbs',
    skin: 'Kapha-leaning skin tends to be oily and thick, prone to congestion and a dull, heavy look.' },
};
const SKIN_SCIENCE = {
  oily: 'Oily skin makes more sebum, which can clog pores and feed acne-causing bacteria; the goal is to balance oil without stripping the barrier (stripped skin often produces even more oil).',
  dry: 'Dry skin has a weaker lipid barrier and loses water faster (higher transepidermal water loss); the goal is to attract water and then seal it in.',
  combination: 'Combination skin has more oil glands in the T-zone than on the cheeks; the goal is to balance oil in the centre while keeping the cheeks hydrated.',
  normal: 'Normal skin has a well-functioning barrier; the goal is to maintain it and protect it from the sun and oxidative stress.',
};

// ---------- Before/after illustration ----------
const METRICS = [
  { key: 'hydration', label: 'Hydration' },
  { key: 'oil', label: 'Oil balance' },
  { key: 'calm', label: 'Calm (less redness)' },
  { key: 'clarity', label: 'Clarity (fewer breakouts)' },
  { key: 'radiance', label: 'Radiance & even tone' },
  { key: 'smoothness', label: 'Smoothness' },
];
const DEFICITS = {
  skin: { dry: { hydration: 4, smoothness: 2, radiance: 1 }, oily: { oil: 4, clarity: 2 }, combination: { oil: 3, hydration: 1, clarity: 1 }, normal: {} },
  dosha: { vata: { hydration: 1, smoothness: 2 }, pitta: { calm: 3, clarity: 1 }, kapha: { oil: 1, radiance: 2, clarity: 1 } },
  concern: { breakouts: { clarity: 3 }, dryness: { hydration: 2 }, dullness: { radiance: 3 }, sensitivity: { calm: 3 }, 'fine lines': { smoothness: 3 } },
};

// prof: {skin, dosha, concern}; steps: [{slot, product}] (unique products of the routine).
function skinScience(prof, steps) {
  const before = Object.fromEntries(METRICS.map((m) => [m.key, 8]));
  for (const table of [DEFICITS.skin[prof.skin], DEFICITS.dosha[prof.dosha], prof.concern ? DEFICITS.concern[prof.concern] : null]) {
    for (const [k, d] of Object.entries(table || {})) before[k] -= d;
  }
  for (const k in before) before[k] = Math.max(1, Math.min(9, before[k]));

  // Which routine ingredients help each measure.
  const helpers = Object.fromEntries(METRICS.map((m) => [m.key, new Map()]));
  const stepReasons = {};
  for (const { slot, product: p } of steps) {
    const ings = (p.ings || []).map(lookup).filter(Boolean);
    const seen = new Set();
    const uniq = ings.filter((i) => !seen.has(i.name) && seen.add(i.name));
    for (const i of uniq) for (const t of i.targets) helpers[t].set(i.name, i);
    const classical = uniq.filter((i) => i.ayurveda !== NOT_CLASSICAL);
    stepReasons[p.id] = {
      slot,
      step: STEPS[slot] || null,
      science: uniq.slice(0, 3).map((i) => ({ name: i.name, text: i.science })),
      ayurveda: (classical.length ? classical : uniq.slice(0, 1)).slice(0, 3).map((i) => ({ name: i.name, text: i.ayurveda })),
    };
  }
  const metrics = METRICS.map((m) => {
    const b = before[m.key], gap = 9 - b, n = helpers[m.key].size;
    // More targeted ingredients → more of the gap closed (capped: no routine makes skin "perfect").
    const share = n === 0 ? 0.15 : n === 1 ? 0.45 : n === 2 ? 0.6 : 0.7;
    const after = Math.min(9, Math.round((b + gap * share) * 10) / 10);
    const names = [...helpers[m.key].keys()];
    return { key: m.key, label: m.label, before: b, after,
      helped_by: names.slice(0, 4),
      why: n ? `${names.slice(0, 3).join(', ')} ${n === 1 ? 'targets' : 'target'} this in your routine.` : 'Supported indirectly by cleansing, moisturising and sun protection.' };
  });
  const focus = metrics.filter((m) => m.before <= 5).map((m) => m.key);
  return {
    metrics,
    focus: focus.length ? focus : metrics.slice().sort((a, b) => a.before - b.before).slice(0, 2).map((m) => m.key),
    principle: { dosha: prof.dosha, ...DOSHA_PRINCIPLE[prof.dosha] },
    skin_science: SKIN_SCIENCE[prof.skin],
    steps: stepReasons,
    weeks: 8,
    note: 'An illustration of the usual direction of change with consistent twice-daily use over about 8–12 weeks — not a photo, a measurement or a guarantee. Everyone’s skin is different; patch test new products.',
  };
}

module.exports = { skinScience, lookup, INGREDIENTS, METRICS };

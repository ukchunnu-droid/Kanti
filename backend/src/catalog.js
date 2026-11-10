// The product catalogue — single source of truth for products and prices.
// Seeded into the products table at startup; served to the storefront by GET /api/products.
// Prices are integer cents. Set active:false to retire a product (old orders keep their snapshot).
const SHIPPING = { flat_cents: 500, free_over_cents: 5000 }; // free when subtotal > $50

const PRODUCTS = [
  {
    "active": true,
    "id": "p1",
    "name": "Neem & Tulsi Gel Cleanser",
    "cat": "Cleanser",
    "slot": "Cleanse",
    "tod": "both",
    "emoji": "🌿",
    "bg": "#E7EFE9",
    "skin": [
      "oily",
      "combination"
    ],
    "dosha": [
      "pitta",
      "kapha"
    ],
    "ings": [
      "Neem",
      "Tulsi",
      "Aloe"
    ],
    "benefit": "Lifts excess oil without stripping — calms congestion.",
    "desc": "A lightweight gel that clears daily buildup and soothes reactive, blemish-prone skin using cold-pressed neem and holy basil.",
    "sourcing": "Neem leaf sourced from certified organic farms in Tamil Nadu.",
    "safety": [
      "Fragrance-free",
      "Patch test advised"
    ],
    "price_cents": 1800
  },
  {
    "active": true,
    "id": "p2",
    "name": "Rose & Aloe Cream Cleanser",
    "cat": "Cleanser",
    "slot": "Cleanse",
    "tod": "both",
    "emoji": "🌸",
    "bg": "#F4E9CF",
    "skin": [
      "normal",
      "dry",
      "combination"
    ],
    "dosha": [
      "vata",
      "pitta"
    ],
    "ings": [
      "Rose",
      "Aloe",
      "Almond oil"
    ],
    "benefit": "Gently removes the day while keeping skin soft and hydrated.",
    "desc": "A milky cleanser for skin that tightens easily. Rose water and aloe cleanse without disturbing the moisture barrier.",
    "sourcing": "Damask rose distilled in Kannauj, the historic home of Indian attar.",
    "safety": [
      "Pregnancy-safe",
      "Fragrance from rose only"
    ],
    "price_cents": 1900
  },
  {
    "active": true,
    "id": "p3",
    "name": "Rosewater Balancing Toner",
    "cat": "Toner",
    "slot": "Tone",
    "tod": "both",
    "emoji": "💧",
    "bg": "#F4E9CF",
    "skin": [
      "oily",
      "normal",
      "combination",
      "dry"
    ],
    "dosha": [
      "vata",
      "pitta",
      "kapha"
    ],
    "ings": [
      "Rose",
      "Witch hazel",
      "Glycerin"
    ],
    "benefit": "Rebalances and preps skin so the next step absorbs better.",
    "desc": "A refreshing mist that restores pH and adds a first layer of hydration after cleansing.",
    "sourcing": "Steam-distilled rose water, no added synthetic fragrance.",
    "safety": [
      "Pregnancy-safe",
      "Alcohol-free"
    ],
    "price_cents": 1600
  },
  {
    "active": true,
    "id": "p4",
    "name": "Neem Clarifying Serum",
    "cat": "Serum",
    "slot": "Treat",
    "tod": "both",
    "emoji": "🧴",
    "bg": "#E7EFE9",
    "skin": [
      "oily",
      "combination"
    ],
    "dosha": [
      "pitta",
      "kapha"
    ],
    "concern": [
      "breakouts"
    ],
    "ings": [
      "Neem",
      "Turmeric",
      "Niacinamide"
    ],
    "benefit": "Targets breakouts and visibly evens oily, congested skin.",
    "desc": "A daily treatment serum that pairs traditional neem and turmeric with niacinamide to reduce blemishes and marks.",
    "sourcing": "Wild-harvested turmeric, lab-tested for curcumin potency.",
    "safety": [
      "Patch test advised",
      "Non-comedogenic"
    ],
    "price_cents": 2800
  },
  {
    "active": true,
    "id": "p5",
    "name": "Brahmi Hydro-Repair Serum",
    "cat": "Serum",
    "slot": "Treat",
    "tod": "both",
    "emoji": "🧪",
    "bg": "#E7EFE9",
    "skin": [
      "dry",
      "normal",
      "combination"
    ],
    "dosha": [
      "vata"
    ],
    "concern": [
      "dryness",
      "dullness"
    ],
    "ings": [
      "Brahmi",
      "Hyaluronic acid",
      "Amla"
    ],
    "benefit": "Floods dehydrated skin with lasting moisture and glow.",
    "desc": "A weightless serum for tight, dull skin. Brahmi and amla support the barrier while hyaluronic acid holds water in.",
    "sourcing": "Brahmi grown in the Western Ghats; vegan hyaluronic acid.",
    "safety": [
      "Pregnancy-safe",
      "Fragrance-free"
    ],
    "price_cents": 3000
  },
  {
    "active": true,
    "id": "p6",
    "name": "Triphala Night Repair Serum",
    "cat": "Serum",
    "slot": "Treat",
    "tod": "PM",
    "emoji": "🌙",
    "bg": "#F4E9CF",
    "skin": [
      "normal",
      "combination"
    ],
    "dosha": [
      "pitta",
      "kapha"
    ],
    "concern": [
      "fine lines",
      "dullness"
    ],
    "ings": [
      "Triphala",
      "Vitamin C",
      "Bakuchiol"
    ],
    "benefit": "Smooths texture and softens early fine lines overnight.",
    "desc": "A gentle retinol-alternative serum. Bakuchiol and triphala antioxidants renew skin while you sleep.",
    "sourcing": "Triphala blended from three organically grown fruits.",
    "safety": [
      "Pregnancy-safe",
      "Use PM only"
    ],
    "price_cents": 3200
  },
  {
    "active": true,
    "id": "p7",
    "name": "Aloe Daily Gel Moisturiser",
    "cat": "Moisturiser",
    "slot": "Moisturise",
    "tod": "both",
    "emoji": "🪴",
    "bg": "#E7EFE9",
    "skin": [
      "oily",
      "combination"
    ],
    "dosha": [
      "pitta",
      "kapha"
    ],
    "concern": [
      "breakouts"
    ],
    "ings": [
      "Aloe",
      "Green tea",
      "Cucumber"
    ],
    "benefit": "Light, fast-absorbing hydration that never feels greasy.",
    "desc": "An oil-free gel-cream that hydrates oily and combination skin without clogging pores.",
    "sourcing": "Cold-stabilised aloe, 92% of formula from botanical sources.",
    "safety": [
      "Non-comedogenic",
      "Fragrance-free"
    ],
    "price_cents": 2200
  },
  {
    "active": true,
    "id": "p8",
    "name": "Almond & Shatavari Nourish Cream",
    "cat": "Moisturiser",
    "slot": "Moisturise",
    "tod": "both",
    "emoji": "🥣",
    "bg": "#F4E9CF",
    "skin": [
      "dry",
      "normal"
    ],
    "dosha": [
      "vata"
    ],
    "concern": [
      "dryness"
    ],
    "ings": [
      "Sweet almond",
      "Shatavari",
      "Shea"
    ],
    "benefit": "Rich, cushioning moisture for skin that drinks it up.",
    "desc": "A deeply nourishing cream for dry, depleted skin. Shatavari and almond restore softness and comfort.",
    "sourcing": "Cold-pressed almond oil; fair-trade shea butter.",
    "safety": [
      "Pregnancy-safe",
      "Rich texture"
    ],
    "price_cents": 2600
  },
  {
    "active": true,
    "id": "p9",
    "name": "Sandalwood Calming Cream",
    "cat": "Moisturiser",
    "slot": "Moisturise",
    "tod": "both",
    "emoji": "🪵",
    "bg": "#F4E9CF",
    "skin": [
      "normal",
      "combination",
      "dry"
    ],
    "dosha": [
      "pitta"
    ],
    "concern": [
      "sensitivity"
    ],
    "ings": [
      "Sandalwood",
      "Oat",
      "Liquorice"
    ],
    "benefit": "Calms redness and sensitivity while hydrating.",
    "desc": "A soothing moisturiser for warm, reactive skin. Sandalwood and liquorice reduce visible redness.",
    "sourcing": "Sustainably farmed sandalwood (no wild harvesting).",
    "safety": [
      "Pregnancy-safe",
      "For sensitive skin"
    ],
    "price_cents": 2700
  },
  {
    "active": true,
    "id": "p10",
    "name": "Kumkumadi Glow Face Oil",
    "cat": "Face oil",
    "slot": "Treat",
    "tod": "PM",
    "emoji": "✨",
    "bg": "#F4E9CF",
    "skin": [
      "dry",
      "normal"
    ],
    "dosha": [
      "vata"
    ],
    "concern": [
      "dullness",
      "fine lines"
    ],
    "ings": [
      "Saffron",
      "Sandalwood",
      "Sesame"
    ],
    "benefit": "A classic radiance oil for a lit-from-within glow.",
    "desc": "The legendary kumkumadi formula — saffron-infused oils that brighten tone and soften the look of lines overnight.",
    "sourcing": "Kashmiri saffron, GI-tagged and purity-tested.",
    "safety": [
      "Patch test advised",
      "Use PM only"
    ],
    "price_cents": 3800
  },
  {
    "active": true,
    "id": "p11",
    "name": "Turmeric Bright Clay Mask",
    "cat": "Mask",
    "slot": "Weekly",
    "tod": "weekly",
    "emoji": "🟡",
    "bg": "#F4E9CF",
    "skin": [
      "oily",
      "combination"
    ],
    "dosha": [
      "pitta",
      "kapha"
    ],
    "concern": [
      "breakouts",
      "dullness"
    ],
    "ings": [
      "Turmeric",
      "Multani mitti",
      "Honey"
    ],
    "benefit": "Draws out congestion and leaves skin clear and bright.",
    "desc": "A 2x-weekly clay mask with turmeric and fuller’s earth to detox pores and brighten dull, oily skin.",
    "sourcing": "Rajasthani multani mitti (fuller’s earth), unrefined.",
    "safety": [
      "Use 1–2x weekly",
      "May lightly tint — rinse well"
    ],
    "price_cents": 2400
  },
  {
    "active": true,
    "id": "p12",
    "name": "Rose & Honey Hydra Mask",
    "cat": "Mask",
    "slot": "Weekly",
    "tod": "weekly",
    "emoji": "🍯",
    "bg": "#F4E9CF",
    "skin": [
      "dry",
      "normal"
    ],
    "dosha": [
      "vata",
      "pitta"
    ],
    "concern": [
      "dryness",
      "dullness"
    ],
    "ings": [
      "Rose",
      "Honey",
      "Hyaluronic"
    ],
    "benefit": "A weekly moisture surge for tight, thirsty skin.",
    "desc": "A creamy leave-on mask that replenishes dry skin and restores a soft, dewy finish.",
    "sourcing": "Raw forest honey from co-operative beekeepers.",
    "safety": [
      "Pregnancy-safe",
      "Use 1–2x weekly"
    ],
    "price_cents": 2400
  },
  {
    "active": true,
    "id": "p13",
    "name": "Mineral Day Shield SPF 30",
    "cat": "Sunscreen",
    "slot": "Protect",
    "tod": "AM",
    "emoji": "☀️",
    "bg": "#E7EFE9",
    "skin": [
      "oily",
      "normal",
      "combination",
      "dry"
    ],
    "dosha": [
      "vata",
      "pitta",
      "kapha"
    ],
    "ings": [
      "Zinc oxide",
      "Aloe",
      "Green tea"
    ],
    "benefit": "Non-greasy mineral protection — the step that matters most.",
    "desc": "A lightweight mineral sunscreen with no white cast. The single most effective anti-ageing step in any routine.",
    "sourcing": "Non-nano zinc oxide; reef-safe formula.",
    "safety": [
      "Pregnancy-safe",
      "Mineral / reef-safe"
    ],
    "price_cents": 2500
  }
];

module.exports = { PRODUCTS, SHIPPING };

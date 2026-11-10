// Kanti storefront — art.js
// Illustrated product packaging, drawn as SVG from the product data (no image files):
//   packaging  pump | mist | dropper | jar | tube      (from the routine step / category)
//   texture    gel | water | serum | oil | cream | clay | lotion   (what's inside, animated)
//   liquid     colour picked from the key ingredients (neem → green, rose → pink, saffron → amber…)
// Admins can override all three on the product form. Animations are CSS (see .pa-* in kanti.css),
// paused for small thumbnails and for anyone who prefers reduced motion.

const PACKAGINGS = ['pump', 'mist', 'dropper', 'jar', 'tube'];
const TEXTURES = ['gel', 'water', 'serum', 'oil', 'cream', 'clay', 'lotion'];

// First matching ingredient wins. Colours sit in the brand's earthy range, never neon.
const INGREDIENT_COLOURS = [
  ['saffron', '#E39A3B'], ['kumkumadi', '#E39A3B'], ['turmeric', '#E2B13C'], ['honey', '#E7B550'],
  ['multani', '#C49A73'], ['clay', '#C49A73'], ['triphala', '#B88A57'], ['sandalwood', '#E4CBA6'],
  ['rose', '#EFB3C2'], ['liquorice', '#D9B48A'], ['almond', '#F1E1C2'], ['shatavari', '#EFE3CC'],
  ['shea', '#F3E7CF'], ['oat', '#EEE3CC'], ['neem', '#86B072'], ['tulsi', '#93BD7F'], ['brahmi', '#9CC79F'],
  ['green tea', '#A8C87E'], ['cucumber', '#BFE0B0'], ['aloe', '#BCE0B2'], ['hyaluronic', '#C9E3F0'],
  ['zinc', '#F3F0E8'], ['vitamin c', '#F2C46A'], ['amla', '#D7C46A'], ['niacinamide', '#DCE7EC'],
];
const PARTICLES = [
  [/neem|tulsi|aloe|brahmi|green tea|cucumber|leaf/, 'leaf'], [/rose|petal|flower/, 'petal'],
  [/saffron|kumkumadi|vitamin c|amla|glow|gold/, 'spark'], [/turmeric|sandalwood|triphala|clay|multani/, 'seed'],
  [/hyaluronic|glycerin|honey|water/, 'drop'],
];

function artFor(p) {
  const ings = (p.ings || []).join(' ').toLowerCase();
  const name = String(p.name || '').toLowerCase();
  const slot = p.slot, cat = String(p.cat || '').toLowerCase();
  const packaging = PACKAGINGS.includes(p.packaging) ? p.packaging
    : slot === 'Cleanse' ? 'pump' : slot === 'Tone' ? 'mist' : slot === 'Protect' ? 'tube'
    : slot === 'Moisturise' || slot === 'Weekly' ? 'jar' : 'dropper';
  const texture = TEXTURES.includes(p.texture) ? p.texture
    : /clay|mitti/.test(name + ings) ? 'clay'
    : packaging === 'tube' ? 'lotion'
    : packaging === 'mist' ? 'water'
    : packaging === 'jar' ? (/gel/.test(name) ? 'gel' : 'cream')
    : packaging === 'pump' ? (/cream|milk/.test(name) ? 'cream' : 'gel')
    : /oil/.test(cat + name) ? 'oil' : 'serum';
  // Colour of the first listed ingredient that has one (the hero ingredient comes first).
  const firstColour = () => {
    for (const ing of (p.ings || []).map((x) => String(x).toLowerCase())) {
      const hit = INGREDIENT_COLOURS.find(([k]) => ing.includes(k));
      if (hit) return hit[1];
    }
    return null;
  };
  const liquid = /^#[0-9a-fA-F]{6}$/.test(p.liquid || '') ? p.liquid : (firstColour() || '#BFD8C4');
  const particle = ((PARTICLES.find(([re]) => re.test(ings + ' ' + name)) || [])[1]) || 'drop';
  return { packaging, texture, liquid, particle };
}

// ---- colour helpers ----
function shade(hex, amt) { // amt -1 (darker) … +1 (lighter)
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

// ---- packaging geometry (viewBox 0 0 120 150) ----
const SHAPES = {
  pump: {
    vb: '24 11 72 137',
    body: '<rect x="33" y="52" width="54" height="88" rx="13"/>',
    clip: '<rect x="36.5" y="55.5" width="47" height="81" rx="10"/>',
    top: 70, bottom: 137, left: 37, right: 83,
    label: [41, 115, 38, 17],
    cap: (c) => `<rect x="49" y="40" width="22" height="14" rx="3" fill="${c.collar}"/>
      <rect x="45" y="30" width="30" height="11" rx="3.5" fill="${c.cap}"/>
      <rect x="57" y="20" width="6" height="11" rx="1.5" fill="${c.cap}"/>
      <rect x="57" y="16" width="30" height="7" rx="3.5" fill="${c.cap}"/>`,
  },
  mist: {
    vb: '20 17 76 131',
    body: '<rect x="40" y="50" width="40" height="92" rx="11"/>',
    clip: '<rect x="43.5" y="53.5" width="33" height="85" rx="8.5"/>',
    top: 66, bottom: 139, left: 44, right: 76,
    label: [46, 113, 28, 21],
    cap: (c) => `<rect x="47" y="40" width="26" height="12" rx="2.5" fill="${c.collar}"/>
      <rect x="49" y="22" width="22" height="19" rx="5" fill="${c.cap}"/>
      <circle cx="51.5" cy="30" r="1.4" fill="${c.collar}"/>
      <g class="pa-spray">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${44 - i * 4}" cy="${30 + (i % 2 ? -2 : 2) * (i / 2)}" r="${1.6 - i * 0.2}" style="--i:${i}"/>`).join('')}</g>`,
  },
  dropper: {
    vb: '24 11 72 137',
    body: '<path d="M44 140 Q35 140 35 130 L35 80 Q35 64 51 60 L51 55 L69 55 L69 60 Q85 64 85 80 L85 130 Q85 140 76 140 Z"/>',
    clip: '<path d="M46 137 Q38.5 137 38.5 128 L38.5 81 Q38.5 68 54 63.5 L66 63.5 Q81.5 68 81.5 81 L81.5 128 Q81.5 137 74 137 Z"/>',
    top: 84, bottom: 137, left: 39, right: 81,
    label: [43, 116, 34, 16],
    cap: (c) => `<rect x="58.3" y="56" width="3.4" height="62" rx="1.7" fill="rgba(255,255,255,.55)"/>
      <rect x="48" y="43" width="24" height="13" rx="2.5" fill="${c.collar}"/>
      <path d="M52 44 L52 29 Q52 15 60 15 Q68 15 68 29 L68 44 Z" fill="${c.cap}"/>`,
  },
  jar: {
    vb: '14 46 92 102',
    body: '<rect x="24" y="80" width="72" height="58" rx="15"/>',
    clip: '<rect x="27.5" y="83.5" width="65" height="51" rx="12"/>',
    top: 92, bottom: 134, left: 28, right: 92,
    label: [36, 114, 48, 16],
    cap: (c) => `<g class="pa-lid"><rect x="20" y="62" width="80" height="19" rx="7" fill="${c.cap}"/>
      <rect x="20" y="62" width="80" height="6" rx="3" fill="rgba(255,255,255,.18)"/></g>`,
  },
  tube: {
    vb: '22 24 76 124',
    body: '<path d="M47 122 L38 46 L38 38 L82 38 L82 46 L73 122 Z"/>',
    clip: '<path d="M49 119 L41 47 L41 41 L79 41 L79 47 L71 119 Z"/>',
    top: 46, bottom: 120, left: 41, right: 79,
    label: [46, 90, 28, 22],
    cap: (c) => `<rect x="36" y="29" width="48" height="10" rx="2" fill="${c.collar}"/>
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${40 + i * 6}" y="31" width="2" height="6" rx="1" fill="rgba(255,255,255,.25)"/>`).join('')}
      <rect x="45" y="121" width="30" height="19" rx="5" fill="${c.cap}"/>`,
  },
};

// ---- texture layers (drawn inside the bottle's clip) ----
function particleShape(kind, colour) {
  if (kind === 'leaf') return `<path d="M0 -6 C5 -4 5 4 0 6 C-5 4 -5 -4 0 -6 Z M0 -6 L0 6" fill="${colour}" stroke="${shade(colour, -0.35)}" stroke-width=".6"/>`;
  if (kind === 'petal') return `<path d="M0 -5 C4 -5 5 2 0 6 C-5 2 -4 -5 0 -5 Z" fill="${colour}"/>`;
  if (kind === 'spark') return `<path d="M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z" fill="${colour}"/>`;
  if (kind === 'seed') return `<ellipse rx="2.6" ry="1.8" fill="${colour}"/>`;
  return `<path d="M0 -4 C2.5 -1 3 1 3 2 A3 3 0 0 1 -3 2 C-3 1 -2.5 -1 0 -4 Z" fill="${colour}"/>`;
}

function textureLayers(t, s, a, uid) {
  const { top, bottom, left, right } = s;
  const w = right - left, h = bottom - top, cx = (left + right) / 2;
  const deep = shade(a.liquid, -0.22), light = shade(a.liquid, 0.45);
  const opaque = ['cream', 'clay', 'lotion'].includes(t);
  const alpha = { water: 0.5, serum: 0.7, gel: 0.78, oil: 0.88 }[t] || 1;
  // seeded pseudo-random so each product looks the same on every render
  let seed = [...uid].reduce((n, ch) => n + ch.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const out = [];

  out.push(`<rect x="${left - 4}" y="${top}" width="${w + 8}" height="${h + 6}" fill="url(#${uid}g)" opacity="${alpha}"/>`);

  if (!opaque) {
    // moving surface: two offset waves
    const wave = (y, amp, cls, fill, op) => {
      let d = `M${left - 40} ${y}`;
      for (let x = left - 40; x < right + 40; x += 15) d += ` q7.5 ${-amp} 15 0`;
      return `<path class="${cls}" d="${d} L${right + 40} ${bottom + 6} L${left - 40} ${bottom + 6} Z" fill="${fill}" opacity="${op}"/>`;
    };
    out.push(wave(top + 1, t === 'oil' ? 2 : 3, 'pa-wave', light, 0.35));
    out.push(wave(top + 3, 2, 'pa-wave pa-wave2', deep, 0.25));
  }

  if (t === 'gel' || t === 'water' || t === 'serum') {
    const n = t === 'water' ? 7 : t === 'gel' ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const r = t === 'gel' ? 2.2 + rnd() * 2.2 : 0.9 + rnd() * 1.4;
      out.push(`<circle class="pa-bubble" cx="${left + 5 + rnd() * (w - 10)}" cy="${bottom - 3}" r="${r.toFixed(1)}"
        fill="rgba(255,255,255,.75)" stroke="rgba(255,255,255,.9)" stroke-width=".4"
        style="--rise:${-(h - 6)}px;--dur:${(t === 'gel' ? 6 : 3.4) + rnd() * 3}s;--delay:${(-rnd() * 7).toFixed(2)}s"/>`);
    }
  }
  if (t === 'serum') {
    for (let i = 0; i < 6; i++) out.push(`<g class="pa-twinkle" style="--delay:${(-rnd() * 3).toFixed(2)}s" transform="translate(${(left + 6 + rnd() * (w - 12)).toFixed(1)} ${(top + 8 + rnd() * (h - 14)).toFixed(1)}) scale(.45)">${particleShape('spark', '#fff')}</g>`);
  }
  if (t === 'oil') {
    for (let i = 0; i < 6; i++) {
      const r = 1.6 + rnd() * 2.6;
      out.push(`<g class="pa-bob" style="--dur:${4 + rnd() * 3}s;--delay:${(-rnd() * 5).toFixed(2)}s">
        <circle cx="${(left + 6 + rnd() * (w - 12)).toFixed(1)}" cy="${(top + 8 + rnd() * (h - 16)).toFixed(1)}" r="${r.toFixed(1)}" fill="${shade(a.liquid, 0.25)}" stroke="${shade(a.liquid, 0.6)}" stroke-width=".6"/></g>`);
    }
    out.push(`<rect class="pa-sheen" x="${left - 30}" y="${top}" width="14" height="${h + 6}" fill="rgba(255,255,255,.35)" transform="skewX(-18)"/>`);
  }
  if (t === 'cream' || t === 'lotion') {
    // a soft swirl that turns slowly, like the top of a freshly opened cream
    const r = Math.min(w, h) * 0.32, cy = top + h * 0.42;
    let d = `M${cx} ${cy}`;
    for (let k = 0; k < 26; k++) { const ang = k * 0.55, rr = (k / 26) * r; d += ` L${(cx + Math.cos(ang) * rr).toFixed(1)} ${(cy + Math.sin(ang) * rr * 0.7).toFixed(1)}`; }
    out.push(`<path class="pa-swirl" d="${d}" fill="none" stroke="${shade(a.liquid, -0.12)}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>`);
    out.push(`<path class="pa-swirl" d="${d}" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".7" transform="translate(-.8 -.8)"/>`);
    out.push(`<rect class="pa-sheen" x="${left - 30}" y="${top}" width="12" height="${h + 6}" fill="rgba(255,255,255,.45)" transform="skewX(-18)"/>`);
  }
  if (t === 'clay') {
    for (let i = 0; i < 26; i++) out.push(`<circle class="pa-grain" cx="${(left + 3 + rnd() * (w - 6)).toFixed(1)}" cy="${(top + 3 + rnd() * (h - 4)).toFixed(1)}" r="${(0.5 + rnd() * 1.1).toFixed(1)}" fill="${shade(a.liquid, -0.35)}" style="--delay:${(-rnd() * 4).toFixed(2)}s"/>`);
    out.push(`<path class="pa-swirl slow" d="M${cx - 14} ${top + 12} q14 -8 28 0 q-14 8 -28 0" fill="none" stroke="${light}" stroke-width="1.6" opacity=".6"/>`);
  }
  // the hero ingredient floating inside (not in the opaque pastes)
  if (!['clay', 'lotion'].includes(t)) {
    const pc = a.particle === 'leaf' ? shade(a.liquid, -0.15) : a.particle === 'petal' ? '#F6CAD5' : a.particle === 'spark' ? '#FBE3A1' : a.particle === 'seed' ? shade(a.liquid, -0.3) : 'rgba(255,255,255,.85)';
    const count = t === 'cream' ? 1 : 2;
    for (let i = 0; i < count; i++) {
      out.push(`<g transform="translate(${(left + w * (0.3 + 0.4 * i)).toFixed(1)} ${(top + h * (0.35 + 0.25 * i)).toFixed(1)})">
        <g class="pa-float" style="--dur:${6 + rnd() * 3}s;--delay:${(-rnd() * 6).toFixed(2)}s">${particleShape(a.particle, pc)}</g></g>`);
    }
  }
  return out.join('');
}

let artSeq = 0;
// size: 'card' | 'modal' (animated) or 'thumb' (still, simpler)
function productArt(p, size = 'card') {
  const a = artFor(p);
  const s = SHAPES[a.packaging];
  const uid = 'pa' + (++artSeq) + String(p.id || 'x').replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const still = size === 'thumb';
  const colours = {
    cap: a.packaging === 'dropper' ? '#20453B' : a.packaging === 'jar' ? '#B8862B' : '#20453B',
    collar: a.packaging === 'jar' ? '#20453B' : '#B8862B',
  };
  const [lx, ly, lw, lh] = s.label;
  const word = String(p.cat || '').toUpperCase().slice(0, 12);
  const label = still ? `<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="3" fill="#FAF8F3" opacity=".92"/>` : `
    <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="3" fill="#FAF8F3" opacity=".93"/>
    <text x="${lx + lw / 2}" y="${ly + lh * 0.52}" text-anchor="middle" class="pa-brand">Kanti</text>
    <text x="${lx + lw / 2}" y="${ly + lh * 0.82}" text-anchor="middle" class="pa-cat">${esc(word)}</text>`;
  return `<svg class="pa ${still ? 'pa-still' : ''} pa-${a.packaging} pa-${a.texture}" viewBox="${s.vb}" role="img" aria-label="${esc(p.name || 'Product')}" focusable="false">
    <defs>
      <clipPath id="${uid}c">${s.clip}</clipPath>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${shade(a.liquid, 0.25)}"/><stop offset="1" stop-color="${shade(a.liquid, -0.12)}"/>
      </linearGradient>
      <linearGradient id="${uid}glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/>
      </linearGradient>
    </defs>
    <ellipse cx="60" cy="143" rx="${a.packaging === 'jar' ? 40 : 28}" ry="4" fill="rgba(28,36,31,.12)"/>
    <g class="pa-bottle">
      <g fill="url(#${uid}glass)" stroke="rgba(32,69,59,.28)" stroke-width="1.2">${s.body}</g>
      <g clip-path="url(#${uid}c)">${still ? `<rect x="0" y="${s.top}" width="120" height="150" fill="${a.liquid}" opacity=".85"/>` : textureLayers(a.texture, s, a, uid)}</g>
      ${label}
      <path d="M${s.left + 3} ${s.top - 4} q-2 ${(s.bottom - s.top) / 2} 0 ${s.bottom - s.top - 6}" stroke="rgba(255,255,255,.7)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      ${s.cap(colours)}
    </g>
  </svg>`;
}

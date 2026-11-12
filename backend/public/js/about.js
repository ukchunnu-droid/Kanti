// Kanti storefront — about.js
// "Our story": the founder page (/#about) and the "Meet the founder" teaser on the home page.

const FOUNDER_PHOTO = '/img/founder-uma.jpg';
const FOUNDER_ALT = 'Uma Kaila, founder of Kanti, standing outdoors in front of a green hedge';

function renderAbout() {
  app.innerHTML = `
  <section class="founder-hero">
    <div class="wrap founder-grid">
      <figure class="founder-photo">
        <img src="${FOUNDER_PHOTO}" alt="${FOUNDER_ALT}" width="993" height="1100" loading="eager">
        <figcaption>Uma Kaila · Founder</figcaption>
      </figure>
      <div class="founder-intro">
        <div class="eyebrow">Our story</div>
        <h1>Hi, I’m <em>Uma Kaila.</em></h1>
        <p class="lead">I’m 21, I’m a skincare enthusiast, and I started Kanti because I wanted Ayurvedic skincare to feel as simple, honest and personal as the brands I love.</p>
        <div class="founder-sign">— Uma</div>
      </div>
    </div>
  </section>

  <section class="wrap founder-story">
    <div class="story-block">
      <div class="story-num">01</div>
      <div>
        <h2>Where it began</h2>
        <p>My favourite skincare brand is <b>rhode</b>. What drew me in was how simple it feels: a few thoughtful products you actually use every day, from a brand that talks to you like a friend instead of a catalogue.</p>
        <p>I kept wishing Ayurvedic skincare felt the same way. The ingredients are beautiful — neem, sandalwood, saffron, rose — but finding the right ones meant jumping between a dozen sites, decoding labels, and guessing what would suit my skin.</p>
      </div>
    </div>
    <div class="story-block">
      <div class="story-num">02</div>
      <div>
        <h2>What “Kanti” means</h2>
        <p><i>Kānti</i> (कान्ति) is Sanskrit for radiance — the glow of skin that’s in balance. That’s the whole idea: not perfect skin, but skin that’s cared for in a way that fits your nature.</p>
      </div>
    </div>
    <div class="story-block">
      <div class="story-num">03</div>
      <div>
        <h2>The two promises I built it on</h2>
        <div class="promise-grid">
          <div class="promise"><span aria-hidden="true">🌿</span><h3>Trust</h3><p>Every product shows its full ingredients, where they come from and what to know before you use it. No mystery blends.</p></div>
          <div class="promise"><span aria-hidden="true">🧭</span><h3>Fit</h3><p>A two-minute quiz reads your skin type and your dosha, then builds a routine — and explains, with science and Ayurveda, why each step is there.</p></div>
        </div>
      </div>
    </div>
    <blockquote class="founder-quote">
      <svg class="sys-mark" aria-hidden="true"><use href="#kanti-mark"/></svg>
      <p>“Skincare should fit your nature — not the other way round.”</p>
      <cite>Uma Kaila, founder</cite>
    </blockquote>
    <div class="founder-cta">
      <button class="btn btn-gold" data-go="quiz">Find your routine →</button>
      <button class="btn btn-ghost" data-go="shop">Browse products</button>
      <button class="btn btn-ghost" data-go="contact">Say hello</button>
    </div>
  </section>
  ${footerHTML()}`;
}

// Home page teaser.
function founderTeaserHTML() {
  return `<section class="section wrap founder-teaser">
    <img src="${FOUNDER_PHOTO}" alt="${FOUNDER_ALT}" width="993" height="1100" loading="lazy">
    <div>
      <div class="eyebrow">Meet the founder</div>
      <h2>Hi, I’m Uma.</h2>
      <p>I’m 21 and a skincare enthusiast. My favourite brand, rhode, showed me how good simple, personal skincare can feel — Kanti is my take on that for Ayurveda.</p>
      <button class="btn btn-ghost btn-sm" data-go="about">Read my story →</button>
    </div>
  </section>`;
}

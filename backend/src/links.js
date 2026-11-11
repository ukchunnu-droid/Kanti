// Outside-product links for "Beyond Kanti".
// 1. Search links (always): built from a search phrase, so they can never be dead or made up.
// 2. Product links (when found): real product pages, kept only if they are on an approved retailer
//    and the page actually opens and is about that product.
const log = require('./log');

// Retailers we link to. Edit this list (or set BEYOND_RETAILERS=nykaa,amazon,…) to change who shows up.
const RETAILERS = {
  nykaa: { name: 'Nykaa', search: 'https://www.nykaa.com/search/result/?q=', domains: ['nykaa.com'] },
  amazon: { name: 'Amazon', search: 'https://www.amazon.com/s?k=', domains: ['amazon.com', 'amazon.in'] },
  sephora: { name: 'Sephora', search: 'https://www.sephora.com/search?keyword=', domains: ['sephora.com'] },
  ulta: { name: 'Ulta', search: 'https://www.ulta.com/search?search=', domains: ['ulta.com'] },
};
function activeRetailers() {
  const want = (process.env.BEYOND_RETAILERS || 'nykaa,amazon,sephora,ulta').split(',').map((s) => s.trim().toLowerCase());
  return want.filter((k) => RETAILERS[k]).map((k) => ({ key: k, ...RETAILERS[k] }));
}
// Extra domains allowed for product links (e.g. brand sites), comma-separated.
function allowedDomains() {
  const extra = (process.env.BEYOND_ALLOWED_DOMAINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...activeRetailers().flatMap((r) => r.domains), ...extra];
}
const hostAllowed = (host) => allowedDomains().some((d) => host === d || host.endsWith('.' + d));
function retailerFor(host) {
  const r = activeRetailers().find((x) => x.domains.some((d) => host === d || host.endsWith('.' + d)));
  return r ? r.name : host.replace(/^www\./, '');
}

function searchLinks(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!q) return [];
  // encodeURIComponent leaves ' ( ) ! * alone; encode them too so links are safe to put in HTML attributes.
  const enc = encodeURIComponent(q).replace(/['()!*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return activeRetailers().map((r) => ({ retailer: r.name, url: r.search + enc }));
}

function parseHttps(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

const STOP = new Set(['with', 'from', 'oil', 'face', 'skin', 'cream', 'serum', 'the', 'and', 'for', 'ayurvedic', 'natural']);
const tokens = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
  .filter((w) => w.length >= 4 && !STOP.has(w));

// Fetches an approved https page (following redirects only to approved hosts) and checks its <title>
// mentions the product. Returns { url, title, retailer } or null.
async function verifyProductLink(rawUrl, productName, { timeoutMs = 6000, allowRedirectFrom = [] } = {}) {
  let url = parseHttps(rawUrl);
  if (!url) return null;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const host = url.hostname.toLowerCase();
      // Grounding links start on Google's redirect host; that first hop is allowed, the destination must be approved.
      if (!hostAllowed(host) && !allowRedirectFrom.includes(host)) return null;
      const res = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KantiLinkCheck/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = parseHttps(new URL(res.headers.get('location'), url).toString());
        if (!url) return null;
        continue;
      }
      if (!res.ok || !hostAllowed(host)) return null;
      const html = (await readCapped(res, 300_000));
      const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
      const title = m ? m[1].replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim() : '';
      const want = tokens(productName);
      const have = new Set(tokens(title));
      const hits = want.filter((w) => have.has(w)).length;
      if (!want.length || hits < Math.min(2, want.length)) return null; // a bot wall or the wrong page
      url.hash = '';
      return { url: url.toString(), title: title.slice(0, 140), retailer: retailerFor(host) };
    }
  } catch (e) {
    log.debug && log.debug('links: verify failed', { error: e.message });
  }
  return null;
}
async function readCapped(res, max) {
  const reader = res.body.getReader();
  const chunks = []; let n = 0;
  while (n < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = { searchLinks, verifyProductLink, activeRetailers, hostAllowed, parseHttps };

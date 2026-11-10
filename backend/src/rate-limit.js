// Tiny in-memory fixed-window rate limiter (no dependency).
// Good enough for one server process; use Redis or the host's limiter when scaling out.
function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  setInterval(() => {
    const t = Date.now();
    for (const [k, e] of hits) if (t > e.reset) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    const t = Date.now();
    let e = hits.get(k);
    if (!e || t > e.reset) { e = { n: 0, reset: t + windowMs }; hits.set(k, e); }
    if (++e.n > max) {
      res.setHeader('Retry-After', Math.ceil((e.reset - t) / 1000));
      return res.status(429).json({ error: 'Too many attempts — please wait a few minutes and try again.' });
    }
    next();
  };
}

module.exports = { rateLimit };

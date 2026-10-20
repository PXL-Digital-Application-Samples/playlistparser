// One shared request pacer per external service (per process), so different
// features calling the same service never exceed its rate limit together.
const limiters = new Map();

export function limiter(name, perSecond) {
  if (!limiters.has(name)) limiters.set(name, createLimiter(perSecond));
  return limiters.get(name);
}

function createLimiter(perSecond) {
  const spacing = 1000 / perSecond;
  let next = 0;
  // Returns fn's result; calls start at least `spacing` ms apart.
  return async function schedule(fn) {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + spacing;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    return fn();
  };
}

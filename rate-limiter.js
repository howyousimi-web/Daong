/**
 * rate-limiter.js
 * ---------------------------------------------------------------
 * Simple in-memory rate limiter to prevent API abuse.
 * Tracks requests per IP/endpoint and enforces limits.
 * --------------------------------------------------------------- */

const WINDOW_MS = 15 * 60 * 1000; // 15 minute window
const LIMITS = {
  '/auth/login': { max: 10, message: 'Too many login attempts, try again later' },
  '/donations/pledge': { max: 50, message: 'Too many pledges, try again later' },
  '/donations': { max: 100, message: 'Too many requests, try again later' },
  default: { max: 1000, message: 'Rate limit exceeded' },
};

// Map: "ip:endpoint" -> { count, resetAt }
const requests = new Map();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of requests.entries()) {
    if (value.resetAt < now) {
      requests.delete(key);
    }
  }
}

function getRateLimitConfig(endpoint) {
  return LIMITS[endpoint] || LIMITS.default;
}

function rateLimiter(req, res, next) {
  cleanupExpired();

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const endpoint = req.path;
  const key = `${ip}:${endpoint}`;
  const config = getRateLimitConfig(endpoint);

  const now = Date.now();
  let entry = requests.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    requests.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > config.max) {
    return res.status(429).json({
      error: 'rate_limited',
      message: config.message,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
  }

  // Add rate limit info to response headers
  res.set('X-RateLimit-Limit', config.max);
  res.set('X-RateLimit-Remaining', config.max - entry.count);
  res.set('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  next();
}

module.exports = { rateLimiter };

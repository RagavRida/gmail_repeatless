/**
 * Simple in-memory rate limiter for API endpoints.
 * Prevents abuse and helps stay within Gmail API quotas.
 */

const requestCounts = new Map();

export function rateLimiter({ windowMs = 60000, maxRequests = 60 } = {}) {
  return (req, res, next) => {
    const key = req.session?.accountId || req.ip;
    const now = Date.now();

    if (!requestCounts.has(key)) {
      requestCounts.set(key, []);
    }

    const timestamps = requestCounts.get(key).filter((t) => now - t < windowMs);
    timestamps.push(now);
    requestCounts.set(key, timestamps);

    if (timestamps.length > maxRequests) {
      return res.status(429).json({
        error: {
          message: 'Too many requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(windowMs / 1000),
        },
      });
    }

    next();
  };
}

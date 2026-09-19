'use strict';

/**
 * Fixed-window rate limiting with a MongoDB store (shared across instances,
 * survives restarts) or an in-memory store (tests / single process).
 */
const net = require('node:net');
const RateLimitHit = require('../models/RateLimitHit');
const { tooManyRequests } = require('../lib/errors');
const { logger } = require('../logger');

class MemoryStore {
  constructor() {
    this.hits = new Map();
    this.timer = setInterval(() => this.prune(), 60 * 1000);
    this.timer.unref();
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.hits) if (entry.expiresAt <= now) this.hits.delete(key);
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const id = `${key}:${windowStart}`;
    const entry = this.hits.get(id) || { count: 0, expiresAt: windowStart + windowMs };
    entry.count += 1;
    this.hits.set(id, entry);
    return { count: entry.count, resetAt: entry.expiresAt };
  }

  async decrement(key, windowMs) {
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const entry = this.hits.get(`${key}:${windowStart}`);
    if (entry && entry.count > 0) entry.count -= 1;
  }

  async reset(prefix) {
    for (const key of this.hits.keys()) if (!prefix || key.startsWith(prefix)) this.hits.delete(key);
  }
}

class MongoStore {
  async increment(key, windowMs) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const expiresAt = new Date(windowStart + windowMs);
    const doc = await RateLimitHit.findOneAndUpdate(
      { _id: `${key}:${windowStart}` },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true, lean: true }
    );
    return { count: doc.count, resetAt: expiresAt.getTime() };
  }

  async decrement(key, windowMs) {
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    await RateLimitHit.updateOne({ _id: `${key}:${windowStart}` }, { $inc: { count: -1 } });
  }

  async reset() {
    await RateLimitHit.deleteMany({});
  }
}

/** Group IPv6 clients by /64 so a single host cannot rotate addresses. */
function clientIp(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const plain = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (net.isIPv6(plain)) {
    const groups = plain.split('::');
    const head = groups[0].split(':').filter(Boolean);
    const tail = groups.length > 1 ? groups[1].split(':').filter(Boolean) : [];
    const full = [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
    return `${full.slice(0, 4).join(':')}::/64`;
  }
  return plain;
}

function createRateLimiter(config) {
  const store = config.rateLimit.store === 'memory' ? new MemoryStore() : new MongoStore();

  /**
   * @param {object} opts
   * @param {string} opts.name        bucket name
   * @param {number} opts.windowMs    window length
   * @param {number} opts.max         allowed hits per window
   * @param {(req) => string} [opts.key] extra key material (defaults to client IP)
   * @param {boolean} [opts.skipSuccessful] refund hits for responses < 400
   * @param {boolean} [opts.failClosed] reject requests if the store is unavailable
   */
  function limit({ name, windowMs, max, key, skipSuccessful = false, failClosed = false }) {
    return async function rateLimitMiddleware(req, res, next) {
      if (config.rateLimit.disabled) return next();
      const bucket = `${name}:${key ? key(req) : clientIp(req)}`;
      let result;
      try {
        result = await store.increment(bucket, windowMs);
      } catch (error) {
        // Fail closed for authentication endpoints, open for everything else.
        logger.error('Rate limiter store failure', { err: error, bucket: name });
        if (failClosed) return next(tooManyRequests(60));
        return next();
      }
      const remaining = Math.max(0, max - result.count);
      const resetSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      res.setHeader('RateLimit-Policy', `${max};w=${Math.round(windowMs / 1000)}`);
      res.setHeader('RateLimit', `limit=${max}, remaining=${remaining}, reset=${resetSeconds}`);
      if (result.count > max) return next(tooManyRequests(resetSeconds));
      if (skipSuccessful) {
        res.on('finish', () => {
          if (res.statusCode < 400) store.decrement(bucket, windowMs).catch(() => {});
        });
      }
      return next();
    };
  }

  return { limit, store, clientIp };
}

module.exports = { createRateLimiter, MemoryStore, MongoStore, clientIp };

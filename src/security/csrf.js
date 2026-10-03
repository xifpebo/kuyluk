'use strict';

/**
 * CSRF protection: HMAC-signed double-submit token bound to the session.
 *
 *  - An HttpOnly, SameSite cookie holds a random seed.
 *  - The token = HMAC(APP_SECRET, seed | sessionId) is handed to the page via
 *    GET /api/auth/session and must be echoed in the `X-CSRF-Token` header on
 *    every state-changing request. A cross-site attacker can neither read the
 *    cookie nor the token, and cannot set custom headers cross-origin.
 *  - Origin / Sec-Fetch-Site headers are checked as an additional layer.
 */
const crypto = require('node:crypto');
const { cookieName, baseOptions } = require('./cookies');
const { forbidden } = require('../lib/errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SEED_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function createCsrf(config) {
  const name = cookieName(config, 'sb_csrf');

  function sign(seed, sessionId) {
    return crypto
      .createHmac('sha256', config.appSecret)
      .update(`csrf|${seed}|${sessionId || 'anonymous'}`)
      .digest('base64url');
  }

  function setSeedCookie(res, seed) {
    res.cookie(name, seed, { ...baseOptions(config), sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
  }

  function currentSeed(req) {
    const seed = req.cookies?.[name];
    return typeof seed === 'string' && SEED_PATTERN.test(seed) ? seed : null;
  }

  /** Return a valid token for this request, creating the seed cookie if needed. */
  function issueToken(req, res) {
    let seed = res.locals.csrfSeed || currentSeed(req);
    if (!seed) {
      seed = crypto.randomBytes(32).toString('base64url');
      setSeedCookie(res, seed);
      res.locals.csrfSeed = seed;
    }
    return sign(seed, res.locals.sessionIdOverride ?? req.auth?.sessionId);
  }

  /** New seed after login/logout so pre-authentication tokens die. */
  function rotate(req, res, sessionId) {
    const seed = crypto.randomBytes(32).toString('base64url');
    setSeedCookie(res, seed);
    res.locals.csrfSeed = seed;
    res.locals.sessionIdOverride = sessionId || null;
    return sign(seed, sessionId);
  }

  function originAllowed(req) {
    const site = req.get('sec-fetch-site');
    if (site && !['same-origin', 'none'].includes(site)) return false;
    const origin = req.get('origin');
    if (!origin) return true;
    if (origin === 'null') return false;
    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    return origin === selfOrigin || config.allowedOrigins.includes(origin);
  }

  function protect(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!originAllowed(req)) return next(forbidden('csrf_failed'));
    const seed = currentSeed(req);
    const provided = req.get('x-csrf-token');
    if (!seed || typeof provided !== 'string' || provided.length > 128) return next(forbidden('csrf_failed'));
    const expected = Buffer.from(sign(seed, req.auth?.sessionId));
    const actual = Buffer.from(provided);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return next(forbidden('csrf_failed'));
    }
    return next();
  }

  return { issueToken, rotate, protect, cookie: name };
}

module.exports = { createCsrf };

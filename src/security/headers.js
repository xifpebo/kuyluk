'use strict';

/**
 * Security response headers (a dependency-free equivalent of helmet with a
 * strict Content-Security-Policy and Trusted Types enforcement).
 */
function buildCsp(config) {
  const google = config.fontProvider === 'google';
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    `style-src 'self'${google ? ' https://fonts.googleapis.com' : ''}`,
    "style-src-attr 'none'",
    `font-src 'self'${google ? ' https://fonts.gstatic.com' : ''}`,
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types bb-html'
  ];
  if (config.cookieSecure) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
  'fullscreen=(self)'
].join(', ');

function securityHeaders(config) {
  const csp = buildCsp(config);
  return function securityHeadersMiddleware(req, res, next) {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-XSS-Protection', '0');
    if (config.cookieSecure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

/** Responses that must never be stored by browsers or proxies. */
function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  next();
}

module.exports = { securityHeaders, noStore, buildCsp };

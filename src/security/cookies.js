'use strict';

/**
 * Cookie helpers. With HTTPS the `__Host-` prefix is used, which browsers
 * only accept when the cookie is Secure, has Path=/ and no Domain — so the
 * cookie cannot be injected from a sibling sub-domain.
 */
function cookieName(config, base) {
  return config.cookieSecure ? `__Host-${base}` : base;
}

function baseOptions(config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    path: '/'
  };
}

/** Parse the Cookie header without a dependency. First occurrence wins. */
function parseCookies(header) {
  const out = Object.create(null);
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in out) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

function cookieParser(req, res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  next();
}

module.exports = { cookieName, baseOptions, parseCookies, cookieParser };

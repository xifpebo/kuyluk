'use strict';

const crypto = require('node:crypto');
const { logger } = require('../logger');

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const STATIC_PREFIXES = ['/css/', '/js/', '/img/', '/fonts/', '/uploads/', '/i18n/', '/favicon'];

/** Assigns a request id and writes one access-log line per request (no bodies, no query strings). */
function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    const entry = {
      id: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10
    };
    if (req.auth?.userId) entry.user = req.auth.userId;
    const isStatic = STATIC_PREFIXES.some((prefix) => path.startsWith(prefix));
    if (res.statusCode >= 500) logger.error('request', entry);
    else if (isStatic) logger.debug('request', entry);
    else logger.info('request', entry);
  });
  next();
}

module.exports = { requestContext };

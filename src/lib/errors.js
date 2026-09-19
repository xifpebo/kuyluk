'use strict';

/**
 * HTTP errors carry a stable machine code plus an i18n message key.
 * The error middleware translates them into the request language.
 */
class HttpError extends Error {
  constructor(status, code, { messageKey, params, fields, headers, details, cause } = {}) {
    super(code, cause ? { cause } : undefined);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.messageKey = messageKey || `errors.${code}`;
    this.params = params || {};
    this.fields = fields || null;
    this.headers = headers || null;
    this.details = details || null;
  }
}

const badRequest = (code = 'bad_request', opts) => new HttpError(400, code, opts);
const unauthorized = (code = 'unauthorized', opts) => new HttpError(401, code, opts);
const forbidden = (code = 'forbidden', opts) => new HttpError(403, code, opts);
const notFound = (code = 'not_found', opts) => new HttpError(404, code, opts);
const conflict = (code = 'conflict', opts) => new HttpError(409, code, opts);
const payloadTooLarge = (code = 'payload_too_large', opts) => new HttpError(413, code, opts);
const unsupportedMedia = (code = 'unsupported_media_type', opts) => new HttpError(415, code, opts);
const tooManyRequests = (retryAfterSeconds) =>
  new HttpError(429, 'rate_limited', {
    params: { minutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) },
    headers: { 'Retry-After': String(Math.max(1, retryAfterSeconds)) }
  });

/** `fields` maps dotted field paths to `{ code, params }` validation issues. */
const validationFailed = (fields) => new HttpError(422, 'validation_failed', { fields });

/** Wrap async route handlers so rejections reach the error middleware (Express 4). */
const asyncHandler = (fn) =>
  function asyncRoute(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  payloadTooLarge,
  unsupportedMedia,
  tooManyRequests,
  validationFailed,
  asyncHandler
};

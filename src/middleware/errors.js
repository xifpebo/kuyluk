'use strict';

const mongoose = require('mongoose');
const {
  HttpError,
  badRequest,
  payloadTooLarge,
  unsupportedMedia,
  validationFailed,
  notFound
} = require('../lib/errors');
const i18n = require('../i18n');
const { logger } = require('../logger');

const MONGOOSE_KIND_CODES = {
  required: 'required',
  enum: 'invalid_choice',
  min: 'too_small',
  max: 'too_big',
  minlength: 'too_short',
  maxlength: 'too_long',
  regexp: 'invalid_format'
};

function fromMongooseValidation(err) {
  const fields = {};
  for (const [path, detail] of Object.entries(err.errors || {})) {
    const kind = detail.kind || 'invalid';
    const code = MONGOOSE_KIND_CODES[kind] || 'invalid';
    const params = {};
    if (detail.properties?.min !== undefined) params.min = detail.properties.min;
    if (detail.properties?.max !== undefined) params.max = detail.properties.max;
    if (detail.properties?.minlength !== undefined) params.min = detail.properties.minlength;
    if (detail.properties?.maxlength !== undefined) params.max = detail.properties.maxlength;
    fields[path] = { code, params };
  }
  return validationFailed(fields);
}

function normalizeError(err) {
  if (err instanceof HttpError) return err;
  switch (err?.type) {
    case 'entity.parse.failed':
      return badRequest('invalid_json');
    case 'entity.too.large':
      return payloadTooLarge();
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return unsupportedMedia();
    case 'request.aborted':
    case 'request.size.invalid':
    case 'stream.encoding.set':
      return badRequest();
    default:
      break;
  }
  if (err instanceof mongoose.Error.ValidationError) return fromMongooseValidation(err);
  if (err instanceof mongoose.Error.CastError) return badRequest();
  if (err instanceof mongoose.Error && /sanitizeFilter|not allowed/i.test(err.message)) return badRequest();
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0];
    return new HttpError(409, 'duplicate', field ? { fields: { [field]: { code: 'already_exists', params: {} } } } : {});
  }
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500 && err.expose) {
    return new HttpError(err.status, 'bad_request');
  }
  return null;
}

function localizedFields(lang, fields) {
  if (!fields) return undefined;
  const out = {};
  for (const [path, issue] of Object.entries(fields)) {
    out[path] = i18n.t(lang, `validation.${issue.code}`, issue.params);
  }
  return out;
}

function wantsJson(req) {
  if (req.originalUrl.startsWith('/api/') || req.originalUrl === '/api') return true;
  return req.accepts(['html', 'json']) === 'json';
}

function createErrorHandler({ config, renderErrorPage }) {
  // Express identifies error handlers by arity, so all four arguments are required.
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    if (res.headersSent) {
      req.socket.destroy();
      return undefined;
    }
    let error = normalizeError(err);
    if (!error) {
      logger.error('Unhandled error', { err, id: req.id, method: req.method, path: req.originalUrl.split('?')[0] });
      error = new HttpError(500, 'internal_error');
    } else if (error.status >= 500) {
      logger.error('Server error', { err, id: req.id });
    }
    const lang = req.lang || config.defaultLang;
    if (error.headers) res.set(error.headers);
    if (wantsJson(req)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(error.status).json({
        error: {
          code: error.code,
          message: i18n.t(lang, error.messageKey, error.params),
          fields: localizedFields(lang, error.fields),
          details: error.details || undefined,
          requestId: req.id
        }
      });
    }
    return res.status(error.status).type('html').send(renderErrorPage(req, res, error.status));
  };
}

function notFoundHandler(req, res, next) {
  next(notFound());
}

module.exports = { createErrorHandler, notFoundHandler, normalizeError };

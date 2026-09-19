'use strict';

const express = require('express');
const C = require('../../domain/constants');
const { ROLES } = require('../../security/rbac');
const { noStore } = require('../../security/headers');
const { unsupportedMedia, notFound } = require('../../lib/errors');
const { IMAGE_TYPES } = require('../../services/uploadService');
const { createAuthRouter } = require('./auth');
const { createCatalogRouter } = require('./catalog');
const { createQuotesRouter } = require('./quotes');
const { createAccountRouter } = require('./account');
const { createAdminRouter } = require('./admin');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Bodies on write requests must be JSON (uploads excepted). */
function requireJsonBody(req, res, next) {
  if (!WRITE_METHODS.has(req.method) || req.path === '/admin/uploads') return next();
  const hasBody = Number(req.get('content-length') || 0) > 0 || Boolean(req.get('transfer-encoding'));
  if (hasBody && !req.is('application/json')) return next(unsupportedMedia());
  return next();
}

function createApiRouter(ctx) {
  const router = express.Router();
  router.use(noStore, requireJsonBody);

  const meta = {
    languages: C.LANGUAGES,
    units: C.UNITS,
    fractionalUnits: C.FRACTIONAL_UNITS,
    materials: C.MATERIALS,
    stockStatuses: C.STOCK_STATUSES,
    categoryIcons: C.CATEGORY_ICONS,
    quoteStatuses: C.QUOTE_STATUSES,
    quoteTransitions: C.QUOTE_TRANSITIONS,
    deliveryMethods: C.DELIVERY_METHODS,
    contactMethods: C.CONTACT_METHODS,
    regions: C.REGIONS,
    paymentMethods: C.PAYMENT_METHODS,
    workingDays: C.WORKING_DAYS,
    productSorts: C.PRODUCT_SORTS,
    roles: ROLES,
    uploads: { maxBytes: ctx.config.uploads.maxBytes, types: IMAGE_TYPES }
  };
  router.get('/meta', (req, res) => res.json(meta));

  router.use('/auth', createAuthRouter(ctx));
  router.use('/catalog', createCatalogRouter(ctx));
  router.use('/quotes', createQuotesRouter(ctx));
  router.use('/account', createAccountRouter(ctx));
  router.use('/admin', createAdminRouter(ctx));
  router.use((req, res, next) => next(notFound()));
  return router;
}

module.exports = { createApiRouter };

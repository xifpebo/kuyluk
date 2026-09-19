'use strict';

const express = require('express');
const { asyncHandler, notFound } = require('../../lib/errors');
const { validateRequest } = require('../../lib/schema');
const v = require('../../validation');
const catalog = require('../../services/catalogService');

/** Public, read-only catalog endpoints. */
function createCatalogRouter({ limiter }) {
  const router = express.Router();

  router.use(limiter.limit({ name: 'catalog', windowMs: 60 * 1000, max: 240 }));

  router.get(
    '/home',
    asyncHandler(async (req, res) => {
      res.json(await catalog.homeData());
    })
  );

  router.get(
    '/stats',
    asyncHandler(async (req, res) => {
      res.json(await catalog.stats());
    })
  );

  router.get(
    '/categories',
    asyncHandler(async (req, res) => {
      res.json({ items: await catalog.listCategories() });
    })
  );

  router.get(
    '/brands',
    asyncHandler(async (req, res) => {
      res.json({ items: await catalog.listBrands() });
    })
  );

  router.get(
    '/products',
    validateRequest({ query: v.productListQuery }),
    asyncHandler(async (req, res) => {
      res.json(await catalog.listProducts(req.valid.query, { lang: req.lang }));
    })
  );

  router.get(
    '/products/:slug',
    validateRequest({ params: v.slugParams }),
    asyncHandler(async (req, res) => {
      const result = await catalog.getProduct(req.valid.params.slug);
      if (!result) throw notFound();
      res.json(result);
    })
  );

  router.get(
    '/lookup',
    validateRequest({ query: v.lookupQuery }),
    asyncHandler(async (req, res) => {
      res.json({ items: await catalog.lookupProducts(req.valid.query.ids) });
    })
  );

  router.get(
    '/suggest',
    limiter.limit({ name: 'suggest', windowMs: 60 * 1000, max: 90 }),
    validateRequest({ query: v.suggestQuery }),
    asyncHandler(async (req, res) => {
      res.json(await catalog.suggest(req.valid.query.q, { lang: req.lang }));
    })
  );

  router.get(
    '/suppliers',
    validateRequest({ query: v.supplierListQuery }),
    asyncHandler(async (req, res) => {
      res.json(await catalog.listSuppliers(req.valid.query));
    })
  );

  router.get(
    '/suppliers/:slug',
    validateRequest({ params: v.slugParams }),
    asyncHandler(async (req, res) => {
      const result = await catalog.getSupplier(req.valid.params.slug);
      if (!result) throw notFound();
      res.json(result);
    })
  );

  return router;
}

module.exports = { createCatalogRouter };

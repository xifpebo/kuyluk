'use strict';

const express = require('express');
const { asyncHandler, notFound } = require('../../lib/errors');
const { validateRequest } = require('../../lib/schema');
const v = require('../../validation');
const catalog = require('../../services/catalogService');
const content = require('../../services/contentService');

/** Public, read-only catalog endpoints (+ anonymous view/contact counters). */
function createCatalogRouter({ config, limiter }) {
  const router = express.Router();

  router.use(limiter.limit({ name: 'catalog', windowMs: 60 * 1000, max: 300 }));

  router.get(
    '/home',
    asyncHandler(async (req, res) => {
      res.json({ ...(await catalog.homeData()), settings: content.publicSettings(config) });
    })
  );

  router.get('/stats', asyncHandler(async (req, res) => res.json(await catalog.stats())));
  router.get('/categories', asyncHandler(async (req, res) => res.json({ items: await catalog.listCategories() })));
  router.get('/brands', asyncHandler(async (req, res) => res.json({ items: await catalog.listBrands() })));

  router.get(
    '/products',
    validateRequest({ query: v.productListQuery }),
    asyncHandler(async (req, res) => res.json(await catalog.listProducts(req.valid.query, { lang: req.lang })))
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
    asyncHandler(async (req, res) => res.json({ items: await catalog.lookupProducts(req.valid.query.ids) }))
  );

  router.get(
    '/suggest',
    limiter.limit({ name: 'suggest', windowMs: 60 * 1000, max: 120 }),
    validateRequest({ query: v.suggestQuery }),
    asyncHandler(async (req, res) => res.json(await catalog.suggest(req.valid.query.q)))
  );

  router.get(
    '/shops',
    validateRequest({ query: v.shopListQuery }),
    asyncHandler(async (req, res) => res.json(await catalog.listShops(req.valid.query)))
  );

  router.get(
    '/shops/:slug',
    validateRequest({ params: v.slugParams, query: v.shopDetailQuery }),
    asyncHandler(async (req, res) => {
      const result = await catalog.getShop(req.valid.params.slug, req.valid.query);
      if (!result) throw notFound();
      res.json(result);
    })
  );

  router.get(
    '/reviews',
    validateRequest({ query: v.reviewListQuery }),
    asyncHandler(async (req, res) => {
      const q = req.valid.query;
      if (q.product) return res.json(await catalog.listReviews({ target: 'product', productId: q.product, page: q.page, limit: q.limit }));
      if (q.shop) {
        const refs = await catalog.loadRefs();
        const shop = refs.shopBySlug.get(q.shop);
        if (!shop || shop.status !== 'approved') throw notFound();
        return res.json(await catalog.listReviews({ target: 'shop', shopId: shop._id, page: q.page, limit: q.limit }));
      }
      throw notFound();
    })
  );

  router.post(
    '/track',
    limiter.limit({ name: 'track', windowMs: 60 * 1000, max: 60 }),
    validateRequest({ body: v.track }),
    asyncHandler(async (req, res) => {
      await catalog.track(req.valid.body);
      res.status(204).end();
    })
  );

  return router;
}

module.exports = { createCatalogRouter };

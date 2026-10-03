'use strict';

/**
 * Shop-owner cabinet API. Requires a shop-owner session; every handler is
 * scoped to the owner's own shop inside sellerService.
 */
const express = require('express');
const { asyncHandler } = require('../../lib/errors');
const { validateRequest, parse } = require('../../lib/schema');
const v = require('../../validation');
const seller = require('../../services/sellerService');
const { requireAuth, requirePermission, requireFreshPassword } = require('../../middleware/auth');
const { PERMISSIONS: P } = require('../../security/rbac');

function createSellerRouter({ config, limiter }) {
  const router = express.Router();
  router.use(requireAuth, requirePermission(P.SELLER_ACCESS), requireFreshPassword);
  router.use(limiter.limit({ name: 'seller-api', windowMs: 60 * 1000, max: 300, key: (req) => req.auth.userId }));

  router.get('/stats', asyncHandler(async (req, res) => res.json(await seller.stats(req))));
  router.get('/options', asyncHandler(async (req, res) => res.json(await seller.formOptions())));

  router.get('/shop', asyncHandler(async (req, res) => res.json(await seller.getShop(req))));
  router.put(
    '/shop',
    asyncHandler(async (req, res) => res.json(await seller.updateShop(req, parse(v.sellerShopBody, req.body))))
  );

  router.get(
    '/products',
    validateRequest({ query: v.adminProductQuery }),
    asyncHandler(async (req, res) => res.json(await seller.listProducts(req, req.valid.query)))
  );
  router.get(
    '/products/:id',
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await seller.getProduct(req, req.valid.params.id)))
  );
  router.post(
    '/products',
    limiter.limit({ name: 'seller-product-create', windowMs: 60 * 60 * 1000, max: 120, key: (req) => req.auth.userId }),
    asyncHandler(async (req, res) => res.status(201).json(await seller.createProduct(req, parse(v.sellerProductBody, req.body), config)))
  );
  router.put(
    '/products/:id',
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) =>
      res.json(await seller.updateProduct(req, req.valid.params.id, parse(v.sellerProductBody, req.body), config))
    )
  );
  router.patch(
    '/products/:id',
    validateRequest({ params: v.idParams, body: v.productPatch }),
    asyncHandler(async (req, res) => res.json(await seller.patchProduct(req, req.valid.params.id, req.valid.body)))
  );
  router.delete(
    '/products/:id',
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await seller.deleteProduct(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );

  return router;
}

module.exports = { createSellerRouter };

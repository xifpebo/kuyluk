'use strict';

/**
 * Admin API. Every route requires a staff session, a fresh password and an
 * explicit permission from the RBAC matrix; nothing relies on the UI hiding
 * buttons.
 */
const express = require('express');
const mongoose = require('mongoose');
const { Product, Shop, Review, User, AuditLog, ShopStat } = require('../../models');
const { asyncHandler } = require('../../lib/errors');
const { validateRequest, parse } = require('../../lib/schema');
const v = require('../../validation');
const { requireStaff, requirePermission, requireFreshPassword } = require('../../middleware/auth');
const { PERMISSIONS: P, can } = require('../../security/rbac');
const adminCatalog = require('../../services/adminCatalogService');
const reviews = require('../../services/reviewService');
const content = require('../../services/contentService');
const users = require('../../services/userAdminService');
const { escapeRegex } = require('../../lib/text');

const { trusted } = mongoose;

function mountCrud(router, path, service, schema, { read, write, remove }) {
  router.get(
    path,
    requirePermission(read),
    validateRequest({ query: v.listQuery }),
    asyncHandler(async (req, res) => res.json(await service.list(req.valid.query)))
  );
  router.get(
    `${path}/:id`,
    requirePermission(read),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await service.get(req.valid.params.id)))
  );
  router.post(
    path,
    requirePermission(write),
    asyncHandler(async (req, res) => res.status(201).json(await service.create(req, parse(schema, req.body))))
  );
  router.put(
    `${path}/:id`,
    requirePermission(write),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await service.update(req, req.valid.params.id, parse(schema, req.body))))
  );
  router.delete(
    `${path}/:id`,
    requirePermission(remove),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await service.remove(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );
}

async function dashboard(auth) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [
    approvedProducts,
    pendingProducts,
    activeShops,
    pendingShops,
    pendingReviews,
    users30,
    outOfStock,
    statRows,
    recentProducts,
    topShops,
    recentActivity
  ] = await Promise.all([
    Product.countDocuments({ status: 'approved', isActive: true }),
    Product.countDocuments({ status: 'pending' }),
    Shop.countDocuments({ status: 'approved' }),
    Shop.countDocuments({ status: 'pending' }),
    Review.countDocuments({ status: 'pending' }),
    User.countDocuments({ createdAt: trusted({ $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }) }),
    Product.countDocuments({ status: 'approved', 'stock.status': 'out_of_stock' }),
    ShopStat.aggregate([
      { $match: { day: { $gte: since } } },
      {
        $group: {
          _id: '$day',
          views: { $sum: { $add: ['$productViews', '$shopViews'] } },
          contacts: { $sum: { $add: ['$contacts.phone', '$contacts.telegram', '$contacts.instagram', '$contacts.whatsapp'] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Product.find({ status: 'pending' }).select('sku name shop submittedAt images').sort({ submittedAt: -1 }).limit(6).populate('shop', 'name').lean(),
    Shop.find({ status: 'approved' }).select('name slug rating reviewCount').sort({ rating: -1, reviewCount: -1 }).limit(5).lean(),
    can(auth.role, P.AUDIT_READ) ? AuditLog.find({}).sort({ at: -1 }).limit(8).lean() : Promise.resolve([])
  ]);
  const views30 = statRows.reduce((sum, row) => sum + row.views, 0);
  const contacts30 = statRows.reduce((sum, row) => sum + row.contacts, 0);
  return {
    kpis: { approvedProducts, pendingProducts, activeShops, pendingShops, pendingReviews, users30, outOfStock, views30, contacts30 },
    series: statRows.map((row) => ({ day: row._id, views: row.views, contacts: row.contacts })),
    pending: recentProducts.map((p) => ({
      id: String(p._id),
      sku: p.sku,
      name: p.name,
      image: p.images?.[0] || null,
      shop: p.shop?.name || '',
      submittedAt: p.submittedAt
    })),
    topShops: topShops.map((s) => ({ id: String(s._id), name: s.name, slug: s.slug, rating: s.rating, reviewCount: s.reviewCount })),
    recentActivity: recentActivity.map(auditJson)
  };
}

function auditJson(entry) {
  return {
    id: String(entry._id),
    at: entry.at,
    action: entry.action,
    status: entry.status,
    actor: { id: entry.actor?.id ? String(entry.actor.id) : null, email: entry.actor?.email, name: entry.actor?.name, role: entry.actor?.role },
    entity: entry.entity,
    changes: entry.changes || [],
    meta: entry.meta || {},
    ip: entry.ip,
    userAgent: entry.userAgent,
    requestId: entry.requestId
  };
}

function createAdminRouter({ config, limiter }) {
  const router = express.Router();
  router.use(requireStaff, requireFreshPassword);
  router.use(limiter.limit({ name: 'admin-api', windowMs: 60 * 1000, max: 600, key: (req) => req.auth.userId }));

  router.get(
    '/dashboard',
    requirePermission(P.DASHBOARD_VIEW),
    asyncHandler(async (req, res) => res.json(await dashboard(req.auth)))
  );

  router.get(
    '/options',
    requirePermission(P.PRODUCTS_READ),
    asyncHandler(async (req, res) => {
      res.json(await adminCatalog.formOptions());
    })
  );

  /* ---------------------------------------------------------- products */
  router.get(
    '/products',
    requirePermission(P.PRODUCTS_READ),
    validateRequest({ query: v.adminProductQuery }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.listProducts(req.valid.query)))
  );
  router.get(
    '/products/:id',
    requirePermission(P.PRODUCTS_READ),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.getProduct(req.valid.params.id)))
  );
  router.post(
    '/products',
    requirePermission(P.PRODUCTS_WRITE),
    asyncHandler(async (req, res) => res.status(201).json(await adminCatalog.createProduct(req, parse(v.productBody, req.body))))
  );
  router.put(
    '/products/:id',
    requirePermission(P.PRODUCTS_WRITE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) =>
      res.json(await adminCatalog.updateProduct(req, req.valid.params.id, parse(v.productBody, req.body)))
    )
  );
  router.patch(
    '/products/:id',
    requirePermission(P.PRODUCTS_WRITE),
    validateRequest({ params: v.idParams, body: v.productPatch }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.patchProduct(req, req.valid.params.id, req.valid.body)))
  );
  router.post(
    '/products/:id/moderate',
    requirePermission(P.PRODUCTS_APPROVE),
    validateRequest({ params: v.idParams, body: v.moderation }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.moderateProduct(req, req.valid.params.id, req.valid.body)))
  );
  router.delete(
    '/products/:id',
    requirePermission(P.PRODUCTS_DELETE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await adminCatalog.deleteProduct(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );

  /* --------------------------------------------------- categories/brands */
  mountCrud(router, '/categories', adminCatalog.categories, v.categoryBody, {
    read: P.PRODUCTS_READ,
    write: P.TAXONOMY_WRITE,
    remove: P.TAXONOMY_DELETE
  });
  mountCrud(router, '/brands', adminCatalog.brands, v.brandBody, {
    read: P.PRODUCTS_READ,
    write: P.TAXONOMY_WRITE,
    remove: P.TAXONOMY_DELETE
  });

  /* --------------------------------------------------------------- shops */
  router.get(
    '/shops',
    requirePermission(P.PRODUCTS_READ),
    validateRequest({ query: v.shopListAdminQuery }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.listShops(req.valid.query)))
  );
  router.get(
    '/shops/:id',
    requirePermission(P.PRODUCTS_READ),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.getShop(req.valid.params.id)))
  );
  router.post(
    '/shops',
    requirePermission(P.SHOPS_WRITE),
    asyncHandler(async (req, res) => res.status(201).json(await adminCatalog.createShop(req, parse(v.shopBody, req.body))))
  );
  router.put(
    '/shops/:id',
    requirePermission(P.SHOPS_WRITE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.updateShop(req, req.valid.params.id, parse(v.shopBody, req.body))))
  );
  router.post(
    '/shops/:id/status',
    requirePermission(P.SHOPS_APPROVE),
    validateRequest({ params: v.idParams, body: v.shopStatus }),
    asyncHandler(async (req, res) => res.json(await adminCatalog.setShopStatus(req, req.valid.params.id, req.valid.body)))
  );
  router.delete(
    '/shops/:id',
    requirePermission(P.SHOPS_DELETE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await adminCatalog.deleteShop(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );

  /* ------------------------------------------------------------- reviews */
  router.get(
    '/reviews',
    requirePermission(P.REVIEWS_MODERATE),
    validateRequest({ query: v.reviewAdminQuery }),
    asyncHandler(async (req, res) => res.json(await reviews.adminList(req.valid.query)))
  );
  router.patch(
    '/reviews/:id',
    requirePermission(P.REVIEWS_MODERATE),
    validateRequest({ params: v.idParams, body: v.reviewModeration }),
    asyncHandler(async (req, res) => res.json(await reviews.moderate(req, req.valid.params.id, req.valid.body.status)))
  );
  router.delete(
    '/reviews/:id',
    requirePermission(P.REVIEWS_MODERATE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await reviews.remove(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );

  /* ------------------------------------------------------------- content */
  router.get('/banners', requirePermission(P.CONTENT_WRITE), asyncHandler(async (req, res) => res.json(await content.listBanners())));
  router.get(
    '/banners/:id',
    requirePermission(P.CONTENT_WRITE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await content.getBanner(req.valid.params.id)))
  );
  router.post(
    '/banners',
    requirePermission(P.CONTENT_WRITE),
    asyncHandler(async (req, res) => res.status(201).json(await content.createBanner(req, parse(v.bannerBody, req.body))))
  );
  router.put(
    '/banners/:id',
    requirePermission(P.CONTENT_WRITE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await content.updateBanner(req, req.valid.params.id, parse(v.bannerBody, req.body))))
  );
  router.delete(
    '/banners/:id',
    requirePermission(P.CONTENT_WRITE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await content.removeBanner(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );

  router.get('/settings', requirePermission(P.CONTENT_WRITE), asyncHandler(async (req, res) => res.json(await content.getSettings(config))));
  router.put(
    '/settings',
    requirePermission(P.SETTINGS_WRITE),
    validateRequest({ body: v.settingsBody }),
    asyncHandler(async (req, res) => res.json(await content.updateSettings(req, config, req.valid.body)))
  );
  router.patch(
    '/settings/home',
    requirePermission(P.CONTENT_WRITE),
    validateRequest({ body: v.settingsBody }),
    asyncHandler(async (req, res) => {
      const { home, announcement, sections } = req.valid.body;
      res.json(await content.updateSettings(req, config, { home, announcement, sections }));
    })
  );

  router.get(
    '/translations',
    requirePermission(P.TRANSLATIONS_WRITE),
    validateRequest({ query: v.translationQuery }),
    asyncHandler(async (req, res) => res.json(await content.listTranslations(req.valid.query)))
  );
  router.put(
    '/translations',
    requirePermission(P.TRANSLATIONS_WRITE),
    validateRequest({ body: v.translationBody }),
    asyncHandler(async (req, res) => res.json(await content.saveTranslation(req, req.valid.body)))
  );

  /* ------------------------------------------------------------- users */
  const usersRouter = express.Router();
  usersRouter.use(requirePermission(P.USERS_MANAGE));
  usersRouter.get(
    '/',
    validateRequest({ query: v.userListQuery }),
    asyncHandler(async (req, res) => res.json(await users.listUsers(req.valid.query)))
  );
  usersRouter.post(
    '/',
    limiter.limit({ name: 'user-create', windowMs: 60 * 60 * 1000, max: 50, key: (req) => req.auth.userId }),
    validateRequest({ body: v.userCreate }),
    asyncHandler(async (req, res) => res.status(201).json(await users.create(req, req.valid.body)))
  );
  usersRouter.patch(
    '/:id',
    validateRequest({ params: v.idParams, body: v.userUpdate }),
    asyncHandler(async (req, res) => res.json({ user: await users.update(req, req.valid.params.id, req.valid.body) }))
  );
  usersRouter.post(
    '/:id/reset-password',
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await users.resetPassword(req, req.valid.params.id)))
  );
  usersRouter.post(
    '/:id/unlock',
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await users.unlock(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );
  usersRouter.post(
    '/:id/revoke-sessions',
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await users.revokeSessions(req, req.valid.params.id)))
  );
  usersRouter.delete(
    '/:id',
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await users.remove(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );
  router.use('/users', usersRouter);

  /* ------------------------------------------------------------- audit */
  router.get(
    '/audit',
    requirePermission(P.AUDIT_READ),
    validateRequest({ query: v.auditQuery }),
    asyncHandler(async (req, res) => {
      const q = req.valid.query;
      const conditions = [];
      if (q.action) conditions.push({ action: q.action });
      if (q.status) conditions.push({ status: q.status });
      if (q.entityType) conditions.push({ 'entity.type': q.entityType });
      if (q.entityId) conditions.push({ 'entity.id': q.entityId });
      if (q.actor) {
        const pattern = escapeRegex(q.actor);
        conditions.push({
          $or: [
            { 'actor.email': trusted({ $regex: pattern, $options: 'i' }) },
            { 'meta.email': trusted({ $regex: pattern, $options: 'i' }) }
          ]
        });
      }
      if (q.from || q.to) {
        const range = {};
        if (q.from) range.$gte = q.from;
        if (q.to) range.$lte = new Date(q.to.getTime() + 24 * 60 * 60 * 1000 - 1);
        conditions.push({ at: trusted(range) });
      }
      const filter = conditions.length ? { $and: conditions } : {};
      const [docs, total] = await Promise.all([
        AuditLog.find(filter).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
        AuditLog.countDocuments(filter)
      ]);
      res.json({ items: docs.map(auditJson), total, page: q.page, pages: Math.ceil(total / q.limit), limit: q.limit });
    })
  );

  return router;
}

module.exports = { createAdminRouter };

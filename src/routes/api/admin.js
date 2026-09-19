'use strict';

/**
 * Admin API. Every route requires a staff session, a fresh password and an
 * explicit permission from the RBAC matrix; nothing relies on the UI hiding
 * buttons.
 */
const express = require('express');
const mongoose = require('mongoose');
const { Product, Supplier, QuoteRequest, AuditLog } = require('../../models');
const { asyncHandler } = require('../../lib/errors');
const { validateRequest, parse } = require('../../lib/schema');
const v = require('../../validation');
const { requireStaff, requirePermission, requireFreshPassword } = require('../../middleware/auth');
const { PERMISSIONS: P, can } = require('../../security/rbac');
const adminCatalog = require('../../services/adminCatalogService');
const quotes = require('../../services/quoteService');
const users = require('../../services/userAdminService');
const { saveImage, IMAGE_TYPES } = require('../../services/uploadService');
const { recordAudit } = require('../../services/audit');
const { escapeRegex } = require('../../lib/text');

const { trusted } = mongoose;
const OPEN_STATUSES = ['new', 'in_progress', 'quoted'];

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
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    activeProducts,
    outOfStock,
    newQuotes,
    activeSuppliers,
    quotes30,
    pipeline,
    recentQuotes,
    lowStock,
    byStatus,
    recentActivity
  ] = await Promise.all([
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true, 'stock.status': 'out_of_stock' }),
    QuoteRequest.countDocuments({ status: 'new' }),
    Supplier.countDocuments({ isActive: true }),
    QuoteRequest.countDocuments({ createdAt: trusted({ $gte: since }) }),
    QuoteRequest.aggregate([
      { $match: { status: { $in: OPEN_STATUSES } } },
      { $group: { _id: null, total: { $sum: '$estimatedTotal' } } }
    ]),
    QuoteRequest.find({}).sort({ createdAt: -1 }).limit(6).populate('assignedTo', 'name').lean(),
    Product.find({ isActive: true, 'stock.status': trusted({ $in: ['low_stock', 'out_of_stock'] }) })
      .select('sku slug name stock unit')
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean(),
    QuoteRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    can(auth.role, P.AUDIT_READ) ? AuditLog.find({}).sort({ at: -1 }).limit(8).lean() : Promise.resolve([])
  ]);
  return {
    kpis: {
      activeProducts,
      outOfStock,
      newQuotes,
      activeSuppliers,
      quotes30,
      pipelineTotal: pipeline[0]?.total || 0
    },
    recentQuotes: recentQuotes.map((quote) => quotes.serializeQuote(quote, { internal: true })),
    lowStock: lowStock.map((p) => ({ id: String(p._id), sku: p.sku, slug: p.slug, name: p.name, stock: p.stock, unit: p.unit })),
    quotesByStatus: Object.fromEntries(byStatus.map((row) => [row._id, row.count])),
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
      const [catalogOptions, staff] = await Promise.all([adminCatalog.formOptions(), users.staffOptions()]);
      res.json({ ...catalogOptions, staff });
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
  router.delete(
    '/products/:id',
    requirePermission(P.PRODUCTS_DELETE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await adminCatalog.deleteProduct(req, req.valid.params.id);
      res.json({ ok: true });
    })
  );

  /* ------------------------------------------- categories/brands/suppliers */
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
  mountCrud(router, '/suppliers', adminCatalog.suppliers, v.supplierBody, {
    read: P.PRODUCTS_READ,
    write: P.SUPPLIERS_WRITE,
    remove: P.SUPPLIERS_DELETE
  });

  /* ------------------------------------------------------------ quotes */
  router.get(
    '/quotes',
    requirePermission(P.QUOTES_READ),
    validateRequest({ query: v.adminQuoteQuery }),
    asyncHandler(async (req, res) => res.json(await quotes.listQuotes(req.valid.query, req.auth)))
  );
  router.get(
    '/quotes/:id',
    requirePermission(P.QUOTES_READ),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => res.json(await quotes.getQuote(req.valid.params.id)))
  );
  router.patch(
    '/quotes/:id',
    requirePermission(P.QUOTES_WRITE),
    validateRequest({ params: v.idParams, body: v.quoteUpdate }),
    asyncHandler(async (req, res) => res.json(await quotes.updateQuote(req, req.valid.params.id, req.valid.body)))
  );
  router.delete(
    '/quotes/:id',
    requirePermission(P.QUOTES_DELETE),
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      await quotes.deleteQuote(req, req.valid.params.id);
      res.json({ ok: true });
    })
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

  /* ----------------------------------------------------------- uploads */
  router.post(
    '/uploads',
    requirePermission(P.UPLOADS_WRITE),
    limiter.limit({ name: 'uploads', windowMs: 60 * 60 * 1000, max: 120, key: (req) => req.auth.userId }),
    express.raw({ type: IMAGE_TYPES, limit: config.uploads.maxBytes }),
    asyncHandler(async (req, res) => {
      const saved = await saveImage(config, req.body, req.get('content-type'));
      await recordAudit(req, {
        action: 'upload.create',
        entity: { type: 'upload', id: saved.url.split('/').pop().split('.')[0], label: saved.url },
        meta: { size: saved.size, type: saved.type }
      });
      res.status(201).json(saved);
    })
  );

  return router;
}

module.exports = { createAdminRouter };

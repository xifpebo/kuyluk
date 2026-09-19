'use strict';

/**
 * Catalog management for staff: products, categories, brands and suppliers.
 * Every mutation writes an audit entry with a field-level diff.
 */
const mongoose = require('mongoose');
const { Product, Category, Brand, Supplier } = require('../models');
const { recordAudit, diff } = require('./audit');
const { loadRefs, invalidateCatalogCache, buildSearchText, refreshSearchText } = require('./catalogService');
const { normalizeTiers } = require('../lib/pricing');
const { slugify, randomSuffix, escapeRegex } = require('../lib/text');
const { conflict, notFound, validationFailed } = require('../lib/errors');
const { STOCK_RANK } = require('../domain/constants');

const { trusted } = mongoose;

async function uniqueSlug(Model, requested, fallbackSource, excludeId) {
  const root = requested || slugify(fallbackSource).slice(0, 80);
  let candidate = root;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const filter = { slug: candidate };
    if (excludeId) filter._id = trusted({ $ne: excludeId });
    // eslint-disable-next-line no-await-in-loop
    if (!(await Model.exists(filter))) return candidate;
    if (requested) throw validationFailed({ slug: { code: 'already_exists', params: {} } });
    candidate = `${root}-${randomSuffix(4)}`;
  }
  throw conflict('duplicate');
}

function paginate(query) {
  return { skip: (query.page - 1) * query.limit, limit: query.limit };
}

function listResult(items, total, query) {
  return { items, total, page: query.page, pages: Math.ceil(total / query.limit), limit: query.limit };
}

function nameContains(q, fields) {
  const pattern = escapeRegex(q.trim());
  return { $or: fields.map((field) => ({ [field]: trusted({ $regex: pattern, $options: 'i' }) })) };
}

/* -------------------------------------------------------------- products */

const PRODUCT_AUDIT_FIELDS = [
  'sku', 'slug', 'name', 'description', 'category', 'brand', 'supplier', 'materialType', 'grade', 'unit',
  'price', 'oldPrice', 'priceTiers', 'minOrderQty', 'orderStep', 'unitsPerPallet', 'dimensions', 'weightKg',
  'specs', 'stock', 'leadTimeDays', 'images', 'isFeatured', 'isActive'
];

async function assertReferences(input) {
  const refs = await loadRefs();
  const fields = {};
  if (!refs.categoryById.has(input.category)) fields.category = { code: 'invalid_choice', params: {} };
  if (!refs.supplierById.has(input.supplier)) fields.supplier = { code: 'invalid_choice', params: {} };
  if (input.brand && !refs.brandById.has(input.brand)) fields.brand = { code: 'invalid_choice', params: {} };
  if (Object.keys(fields).length) throw validationFailed(fields);
  return refs;
}

async function assertSkuFree(sku, excludeId) {
  const filter = { sku };
  if (excludeId) filter._id = trusted({ $ne: excludeId });
  if (await Product.exists(filter)) throw validationFailed({ sku: { code: 'already_exists', params: {} } });
}

function productPayload(input, refs) {
  const payload = {
    ...input,
    priceTiers: normalizeTiers(input.priceTiers, input.price),
    stock: { status: input.stock.status, quantity: input.stock.quantity ?? null }
  };
  payload.stockRank = STOCK_RANK[payload.stock.status];
  payload.hasBulkPricing = payload.priceTiers.length > 0;
  payload.searchText = buildSearchText(payload, refs);
  return payload;
}

function adminProductJson(doc, refs) {
  const category = refs.categoryById.get(String(doc.category));
  const brand = doc.brand ? refs.brandById.get(String(doc.brand)) : null;
  const supplier = refs.supplierById.get(String(doc.supplier));
  return {
    ...doc,
    id: String(doc._id),
    _id: undefined,
    searchText: undefined,
    category: String(doc.category),
    brand: doc.brand ? String(doc.brand) : null,
    supplier: String(doc.supplier),
    categoryName: category?.name || null,
    brandName: brand?.name || null,
    supplierName: supplier ? `${supplier.stallNumber} · ${supplier.name}` : null,
    createdBy: undefined,
    updatedBy: undefined
  };
}

async function listProducts(query) {
  const conditions = [];
  if (query.q) conditions.push(nameContains(query.q, ['name.uz', 'name.ru', 'sku', 'grade']));
  if (query.category) conditions.push({ category: query.category });
  if (query.supplier) conditions.push({ supplier: query.supplier });
  if (query.stock) conditions.push({ 'stock.status': query.stock });
  if (query.active) conditions.push({ isActive: query.active === 'active' });
  const filter = conditions.length ? { $and: conditions } : {};
  const sorts = {
    updated: { updatedAt: -1 },
    name: { 'name.uz': 1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    sku: { sku: 1 }
  };
  const { skip, limit } = paginate(query);
  const [refs, docs, total] = await Promise.all([
    loadRefs(),
    Product.find(filter).select('-searchText -description -specs').sort(sorts[query.sort]).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter)
  ]);
  return listResult(docs.map((doc) => adminProductJson(doc, refs)), total, query);
}

async function getProduct(id) {
  const [refs, doc] = await Promise.all([loadRefs(), Product.findById(id).select('-searchText').lean()]);
  if (!doc) throw notFound();
  return adminProductJson(doc, refs);
}

async function createProduct(req, input) {
  const refs = await assertReferences(input);
  await assertSkuFree(input.sku);
  const slug = await uniqueSlug(Product, input.slug, `${input.name.uz} ${input.sku}`);
  const payload = productPayload({ ...input, slug }, refs);
  const doc = await Product.create({ ...payload, createdBy: req.auth.userId, updatedBy: req.auth.userId });
  invalidateCatalogCache();
  await recordAudit(req, {
    action: 'product.create',
    entity: { type: 'product', id: doc._id, label: `${doc.sku} · ${doc.name.uz}` },
    meta: { price: doc.price, category: String(doc.category) }
  });
  return getProduct(doc._id);
}

async function updateProduct(req, id, input) {
  const before = await Product.findById(id).lean();
  if (!before) throw notFound();
  const refs = await assertReferences(input);
  await assertSkuFree(input.sku, before._id);
  const slug = input.slug && input.slug !== before.slug
    ? await uniqueSlug(Product, input.slug, '', before._id)
    : before.slug;
  const payload = productPayload({ ...input, slug }, refs);
  await Product.updateOne({ _id: before._id }, { $set: { ...payload, updatedBy: req.auth.userId } }, { runValidators: true });
  const after = await Product.findById(before._id).lean();
  invalidateCatalogCache();
  const changes = diff(before, after, PRODUCT_AUDIT_FIELDS);
  if (changes.length) {
    await recordAudit(req, {
      action: 'product.update',
      entity: { type: 'product', id: before._id, label: `${after.sku} · ${after.name.uz}` },
      changes
    });
  }
  return adminProductJson(after, refs);
}

async function patchProduct(req, id, input) {
  const before = await Product.findById(id).lean();
  if (!before) throw notFound();
  const set = { updatedBy: req.auth.userId };
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.isFeatured !== undefined) set.isFeatured = input.isFeatured;
  if (input.stockStatus !== undefined) {
    set['stock.status'] = input.stockStatus;
    set.stockRank = STOCK_RANK[input.stockStatus];
  }
  if (input.price !== undefined) {
    set.price = input.price;
    set.priceTiers = normalizeTiers(before.priceTiers, input.price);
    set.hasBulkPricing = set.priceTiers.length > 0;
  }
  await Product.updateOne({ _id: before._id }, { $set: set });
  const after = await Product.findById(before._id).lean();
  invalidateCatalogCache();
  const changes = diff(before, after, ['isActive', 'isFeatured', 'stock', 'price', 'priceTiers']);
  if (changes.length) {
    await recordAudit(req, {
      action: 'product.update',
      entity: { type: 'product', id: before._id, label: `${after.sku} · ${after.name.uz}` },
      changes
    });
  }
  return adminProductJson(after, await loadRefs());
}

async function deleteProduct(req, id) {
  const doc = await Product.findById(id).lean();
  if (!doc) throw notFound();
  await Product.deleteOne({ _id: doc._id });
  invalidateCatalogCache();
  await recordAudit(req, {
    action: 'product.delete',
    entity: { type: 'product', id: doc._id, label: `${doc.sku} · ${doc.name.uz}` },
    meta: { snapshot: { sku: doc.sku, name: doc.name, price: doc.price, category: String(doc.category), supplier: String(doc.supplier) } }
  });
}

/* ------------------------------------------------ categories/brands/suppliers */

function makeTaxonomy({ Model, type, refField, auditFields, label, searchFields, sort, beforeSave }) {
  async function counts() {
    const rows = await Product.aggregate([{ $group: { _id: `$${refField}`, count: { $sum: 1 } } }]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  const json = (doc, countMap) => ({
    ...doc,
    id: String(doc._id),
    _id: undefined,
    nameKey: undefined,
    productCount: countMap ? countMap.get(String(doc._id)) || 0 : undefined
  });

  return {
    async list(query) {
      const conditions = [];
      if (query.q) conditions.push(nameContains(query.q, searchFields));
      if (query.active) conditions.push({ isActive: query.active === 'active' });
      const filter = conditions.length ? { $and: conditions } : {};
      const { skip, limit } = paginate(query);
      const [docs, total, countMap] = await Promise.all([
        Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        Model.countDocuments(filter),
        counts()
      ]);
      return listResult(docs.map((doc) => json(doc, countMap)), total, query);
    },

    async get(id) {
      const doc = await Model.findById(id).lean();
      if (!doc) throw notFound();
      return json(doc, await counts());
    },

    async create(req, input) {
      const payload = beforeSave ? await beforeSave(input) : { ...input };
      payload.slug = await uniqueSlug(Model, input.slug, label(input));
      let doc;
      try {
        doc = await Model.create(payload);
      } catch (error) {
        throw mapDuplicate(error);
      }
      invalidateCatalogCache();
      await recordAudit(req, { action: `${type}.create`, entity: { type, id: doc._id, label: label(doc) } });
      return json(doc.toObject(), await counts());
    },

    async update(req, id, input) {
      const before = await Model.findById(id).lean();
      if (!before) throw notFound();
      const payload = beforeSave ? await beforeSave(input, before) : { ...input };
      payload.slug = input.slug && input.slug !== before.slug ? await uniqueSlug(Model, input.slug, '', before._id) : before.slug;
      const doc = await Model.findById(before._id);
      doc.set(payload);
      try {
        await doc.save();
      } catch (error) {
        throw mapDuplicate(error);
      }
      const after = doc.toObject();
      const changes = diff(before, after, auditFields);
      if (changes.some((change) => /^(name|stallNumber)/.test(change.field))) {
        await refreshSearchText({ [refField]: before._id });
      } else {
        invalidateCatalogCache();
      }
      if (changes.length) {
        await recordAudit(req, { action: `${type}.update`, entity: { type, id: before._id, label: label(after) }, changes });
      }
      return json(after, await counts());
    },

    async remove(req, id) {
      const doc = await Model.findById(id).lean();
      if (!doc) throw notFound();
      const inUse = await Product.countDocuments({ [refField]: doc._id });
      if (inUse > 0) throw conflict('in_use', { params: { count: inUse } });
      await Model.deleteOne({ _id: doc._id });
      invalidateCatalogCache();
      await recordAudit(req, {
        action: `${type}.delete`,
        entity: { type, id: doc._id, label: label(doc) },
        meta: { snapshot: { ...doc, _id: String(doc._id) } }
      });
    }
  };
}

function mapDuplicate(error) {
  if (error?.code !== 11000) return error;
  const field = Object.keys(error.keyPattern || error.keyValue || { name: 1 })[0];
  const target = field === 'nameKey' ? 'name' : field;
  return validationFailed({ [target]: { code: 'already_exists', params: {} } });
}

const categories = makeTaxonomy({
  Model: Category,
  type: 'category',
  refField: 'category',
  auditFields: ['slug', 'name', 'description', 'icon', 'sortOrder', 'isActive'],
  label: (doc) => doc.name?.uz || doc.slug,
  searchFields: ['name.uz', 'name.ru', 'slug'],
  sort: { sortOrder: 1, 'name.uz': 1 }
});

const brands = makeTaxonomy({
  Model: Brand,
  type: 'brand',
  refField: 'brand',
  auditFields: ['slug', 'name', 'country', 'description', 'isActive'],
  label: (doc) => doc.name,
  searchFields: ['name', 'slug'],
  sort: { name: 1 },
  beforeSave: async (input) => ({ ...input, nameKey: input.name.trim().toLowerCase() })
});

const suppliers = makeTaxonomy({
  Model: Supplier,
  type: 'supplier',
  refField: 'supplier',
  auditFields: [
    'slug', 'name', 'stallNumber', 'description', 'address', 'phone', 'telegram', 'whatsapp', 'email',
    'workingHours', 'workingDays', 'deliveryAvailable', 'deliveryNote', 'paymentMethods', 'isVerified',
    'isFeatured', 'isActive', 'logoUrl'
  ],
  label: (doc) => `${doc.stallNumber} · ${doc.name}`,
  searchFields: ['name', 'stallNumber', 'phone'],
  sort: { stallNumber: 1 }
});

/** Lightweight option lists for admin form selects. */
async function formOptions() {
  const refs = await loadRefs();
  return {
    categories: refs.categories.map((c) => ({ id: String(c._id), name: c.name, isActive: c.isActive })),
    brands: refs.brands.map((b) => ({ id: String(b._id), name: b.name, isActive: b.isActive })),
    suppliers: refs.suppliers.map((s) => ({ id: String(s._id), name: s.name, stallNumber: s.stallNumber, isActive: s.isActive }))
  };
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  patchProduct,
  deleteProduct,
  categories,
  brands,
  suppliers,
  formOptions
};

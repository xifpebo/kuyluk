'use strict';

/**
 * Catalog management for staff: products (incl. moderation), shops (incl.
 * approval), categories, brands. Every mutation writes an audit entry with
 * a field-level diff. Product payload helpers are shared with the seller
 * cabinet (sellerService).
 */
const mongoose = require('mongoose');
const { Product, Category, Brand, Shop, User, Review, ShopStat } = require('../models');
const { recordAudit, diff } = require('./audit');
const { loadRefs, invalidateCatalogCache, buildSearchText, refreshSearchText } = require('./catalogService');
const { slugify, randomSuffix, escapeRegex } = require('../lib/text');
const { conflict, notFound, validationFailed } = require('../lib/errors');
const { STOCK_RANK } = require('../domain/constants');

const { trusted } = mongoose;

async function uniqueSlug(Model, requested, fallbackSource, excludeId) {
  const root = requested || slugify(fallbackSource).slice(0, 80) || randomSuffix(8);
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

/* ------------------------------------------------------- product helpers */

const PRODUCT_AUDIT_FIELDS = [
  'sku', 'slug', 'name', 'description', 'category', 'brand', 'shop', 'unit', 'price', 'oldPrice', 'colors', 'sizes',
  'specs', 'stock', 'leadTimeDays', 'images', 'status', 'moderationNote', 'isFeatured', 'isActive'
];

/** Fields whose change sends an approved product back to moderation (seller edits). */
const MODERATED_FIELDS = ['name', 'description', 'category', 'brand', 'images', 'specs'];

async function assertReferences(input) {
  const refs = await loadRefs();
  const fields = {};
  const category = refs.categoryById.get(String(input.category));
  if (!category) fields.category = { code: 'invalid_choice', params: {} };
  else if (!category.parent) fields.category = { code: 'subcategory_required', params: {} };
  if (input.shop !== undefined && !refs.shopById.has(String(input.shop))) fields.shop = { code: 'invalid_choice', params: {} };
  if (input.brand && !refs.brandById.has(String(input.brand))) fields.brand = { code: 'invalid_choice', params: {} };
  if (input.oldPrice !== null && input.oldPrice !== undefined && input.oldPrice <= input.price) {
    fields.oldPrice = { code: 'old_price_low', params: {} };
  }
  if (Object.keys(fields).length) throw validationFailed(fields);
  return refs;
}

async function assertSkuFree(sku, excludeId) {
  const filter = { sku };
  if (excludeId) filter._id = trusted({ $ne: excludeId });
  if (await Product.exists(filter)) throw validationFailed({ sku: { code: 'already_exists', params: {} } });
}

function productPayload(input, refs) {
  const payload = { ...input, stock: { status: input.stock.status, quantity: input.stock.quantity ?? null } };
  payload.stockRank = STOCK_RANK[payload.stock.status];
  payload.discountPercent = Product.discountOf(payload.price, payload.oldPrice);
  payload.searchText = buildSearchText(payload, refs);
  return payload;
}

function adminProductJson(doc, refs) {
  const category = refs.categoryById.get(String(doc.category));
  const parent = category?.parent ? refs.categoryById.get(String(category.parent)) : null;
  const brand = doc.brand ? refs.brandById.get(String(doc.brand)) : null;
  const shop = refs.shopById.get(String(doc.shop));
  return {
    ...doc,
    id: String(doc._id),
    _id: undefined,
    searchText: undefined,
    category: String(doc.category),
    brand: doc.brand ? String(doc.brand) : null,
    shop: String(doc.shop),
    categoryName: category?.name || null,
    parentCategoryName: parent?.name || null,
    brandName: brand?.name || null,
    shopName: shop?.name || null,
    shopSlug: shop?.slug || null,
    shopStatus: shop?.status || null,
    createdBy: undefined,
    updatedBy: undefined,
    approvedBy: undefined
  };
}

function productConditions(query) {
  const conditions = [];
  if (query.q) conditions.push(nameContains(query.q, ['name.uz', 'name.ru', 'sku']));
  if (query.category) conditions.push({ category: query.category });
  if (query.shop) conditions.push({ shop: query.shop });
  if (query.stock) conditions.push({ 'stock.status': query.stock });
  if (query.status) conditions.push({ status: query.status });
  if (query.active) conditions.push({ isActive: query.active === 'active' });
  if (query.featured) conditions.push({ isFeatured: true });
  if (query.discounted) conditions.push({ discountPercent: trusted({ $gt: 0 }) });
  return conditions;
}

const PRODUCT_SORTS = {
  updated: { updatedAt: -1 },
  name: { 'name.uz': 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  sku: { sku: 1 },
  discount: { discountPercent: -1 },
  views: { viewCount: -1 },
  submitted: { submittedAt: -1, updatedAt: -1 }
};

async function listProducts(query, extraConditions = []) {
  const conditions = [...productConditions(query), ...extraConditions];
  const filter = conditions.length ? { $and: conditions } : {};
  const { skip, limit } = paginate(query);
  const [refs, docs, total] = await Promise.all([
    loadRefs(),
    Product.find(filter).select('-searchText -description -specs').sort(PRODUCT_SORTS[query.sort] || PRODUCT_SORTS.updated).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter)
  ]);
  return listResult(docs.map((doc) => adminProductJson(doc, refs)), total, query);
}

async function getProduct(id, extraFilter = {}) {
  const [refs, doc] = await Promise.all([loadRefs(), Product.findOne({ _id: id, ...extraFilter }).select('-searchText').lean()]);
  if (!doc) throw notFound();
  return adminProductJson(doc, refs);
}

function productLabel(doc) {
  return `${doc.sku} · ${doc.name?.uz || ''}`;
}

async function createProduct(req, input, { status = 'approved', shopId = null } = {}) {
  const data = { ...input, shop: shopId || input.shop };
  const refs = await assertReferences(data);
  await assertSkuFree(data.sku);
  const slug = await uniqueSlug(Product, data.slug, `${data.name.uz} ${data.sku}`);
  const now = new Date();
  const payload = productPayload({ ...data, slug }, refs);
  const doc = await Product.create({
    ...payload,
    status,
    submittedAt: status === 'pending' ? now : null,
    approvedAt: status === 'approved' ? now : null,
    approvedBy: status === 'approved' ? req.auth.userId : null,
    createdBy: req.auth.userId,
    updatedBy: req.auth.userId
  });
  invalidateCatalogCache();
  await recordAudit(req, {
    action: 'product.create',
    entity: { type: 'product', id: doc._id, label: productLabel(doc) },
    meta: { price: doc.price, status, shop: String(doc.shop) }
  });
  return getProduct(doc._id);
}

async function updateProduct(req, id, input, { extraFilter = {}, seller = false } = {}) {
  const before = await Product.findOne({ _id: id, ...extraFilter }).lean();
  if (!before) throw notFound();
  const data = { ...input, shop: seller ? before.shop : input.shop };
  const refs = await assertReferences(data);
  await assertSkuFree(data.sku, before._id);
  const slug = data.slug && data.slug !== before.slug ? await uniqueSlug(Product, data.slug, '', before._id) : before.slug;
  const payload = productPayload({ ...data, slug }, refs);
  const set = { ...payload, updatedBy: req.auth.userId };
  if (seller) {
    // Sellers cannot feature products; content changes need a new review.
    delete set.isFeatured;
    const probe = diff(before, { ...before, ...payload }, MODERATED_FIELDS);
    if (before.status === 'rejected' || before.status === 'draft' || (before.status === 'approved' && probe.length)) {
      set.status = 'pending';
      set.submittedAt = new Date();
      set.moderationNote = '';
    }
  }
  await Product.updateOne({ _id: before._id }, { $set: set }, { runValidators: true });
  const after = await Product.findById(before._id).lean();
  invalidateCatalogCache();
  const changes = diff(before, after, PRODUCT_AUDIT_FIELDS);
  if (changes.length) {
    await recordAudit(req, {
      action: 'product.update',
      entity: { type: 'product', id: before._id, label: productLabel(after) },
      changes
    });
  }
  return adminProductJson(after, refs);
}

async function patchProduct(req, id, input, { extraFilter = {}, seller = false } = {}) {
  const before = await Product.findOne({ _id: id, ...extraFilter }).lean();
  if (!before) throw notFound();
  const set = { updatedBy: req.auth.userId };
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.isFeatured !== undefined && !seller) set.isFeatured = input.isFeatured;
  if (input.stockStatus !== undefined) {
    set['stock.status'] = input.stockStatus;
    set.stockRank = STOCK_RANK[input.stockStatus];
  }
  if (input.stockQuantity !== undefined) set['stock.quantity'] = input.stockQuantity;
  const price = input.price !== undefined ? input.price : before.price;
  const oldPrice = input.oldPrice !== undefined ? input.oldPrice : before.oldPrice;
  if (input.price !== undefined || input.oldPrice !== undefined) {
    if (oldPrice !== null && oldPrice !== undefined && oldPrice <= price) {
      throw validationFailed({ oldPrice: { code: 'old_price_low', params: {} } });
    }
    set.price = price;
    set.oldPrice = oldPrice ?? null;
    set.discountPercent = Product.discountOf(price, oldPrice);
  }
  await Product.updateOne({ _id: before._id }, { $set: set });
  const after = await Product.findById(before._id).lean();
  invalidateCatalogCache();
  const changes = diff(before, after, ['isActive', 'isFeatured', 'stock', 'price', 'oldPrice']);
  if (changes.length) {
    await recordAudit(req, {
      action: 'product.update',
      entity: { type: 'product', id: before._id, label: productLabel(after) },
      changes
    });
  }
  return adminProductJson(after, await loadRefs());
}

async function moderateProduct(req, id, { decision, note = '' }) {
  const before = await Product.findById(id).lean();
  if (!before) throw notFound();
  const status = decision === 'approve' ? 'approved' : 'rejected';
  if (status === 'rejected' && !note) throw validationFailed({ note: { code: 'required', params: {} } });
  const set = { status, moderationNote: status === 'rejected' ? note : '' };
  if (status === 'approved') {
    set.approvedAt = new Date();
    set.approvedBy = req.auth.userId;
  }
  await Product.updateOne({ _id: before._id }, { $set: set });
  const after = await Product.findById(before._id).lean();
  invalidateCatalogCache();
  await recordAudit(req, {
    action: status === 'approved' ? 'product.approve' : 'product.reject',
    entity: { type: 'product', id: before._id, label: productLabel(after) },
    changes: diff(before, after, ['status', 'moderationNote'])
  });
  return adminProductJson(after, await loadRefs());
}

async function deleteProduct(req, id, extraFilter = {}) {
  const doc = await Product.findOne({ _id: id, ...extraFilter }).lean();
  if (!doc) throw notFound();
  await Product.deleteOne({ _id: doc._id });
  await Review.deleteMany({ product: doc._id });
  await User.updateMany({ favorites: doc._id }, { $pull: { favorites: doc._id } });
  invalidateCatalogCache();
  await recordAudit(req, {
    action: 'product.delete',
    entity: { type: 'product', id: doc._id, label: productLabel(doc) },
    meta: { snapshot: { sku: doc.sku, name: doc.name, price: doc.price, category: String(doc.category), shop: String(doc.shop) } }
  });
}

/* ------------------------------------------------------------ taxonomy */

function makeTaxonomy({ Model, type, refField, auditFields, label, searchFields, sort, beforeSave, beforeRemove }) {
  async function counts() {
    const rows = await Product.aggregate([{ $group: { _id: `$${refField}`, count: { $sum: 1 } } }]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  const json = (doc, countMap) => ({
    ...doc,
    id: String(doc._id),
    _id: undefined,
    nameKey: undefined,
    parent: doc.parent ? String(doc.parent) : doc.parent,
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
      if (changes.some((change) => /^(name|parent)/.test(change.field))) {
        await refreshSearchText(type === 'category' ? {} : { [refField]: before._id });
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
      if (beforeRemove) await beforeRemove(doc);
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
  auditFields: ['slug', 'name', 'description', 'parent', 'icon', 'image', 'sortOrder', 'isActive'],
  label: (doc) => doc.name?.uz || doc.slug,
  searchFields: ['name.uz', 'name.ru', 'slug'],
  sort: { sortOrder: 1, 'name.uz': 1 },
  async beforeSave(input, before) {
    const payload = { ...input, parent: input.parent || null };
    if (payload.parent) {
      if (before && String(before._id) === payload.parent) throw validationFailed({ parent: { code: 'invalid_choice', params: {} } });
      const parent = await Category.findById(payload.parent).lean();
      if (!parent || parent.parent) throw validationFailed({ parent: { code: 'invalid_choice', params: {} } });
      if (before && (await Category.exists({ parent: before._id }))) {
        throw validationFailed({ parent: { code: 'has_children', params: {} } });
      }
    }
    return payload;
  },
  async beforeRemove(doc) {
    const children = await Category.countDocuments({ parent: doc._id });
    if (children > 0) throw conflict('has_children', { params: { count: children } });
  }
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

/* ---------------------------------------------------------------- shops */

const SHOP_AUDIT_FIELDS = [
  'slug', 'name', 'owner', 'status', 'statusNote', 'tagline', 'description', 'address', 'landmark', 'city', 'mapUrl',
  'phone', 'phone2', 'telegram', 'instagram', 'whatsapp', 'email', 'website', 'workingHours', 'workingDays',
  'deliveryAvailable', 'deliveryNote', 'paymentMethods', 'foundedYear', 'accent', 'logoUrl', 'coverUrl',
  'isVerified', 'isFeatured'
];

async function shopCounts() {
  const rows = await Product.aggregate([{ $group: { _id: { shop: '$shop', status: '$status' }, count: { $sum: 1 } } }]);
  const map = new Map();
  for (const row of rows) {
    const key = String(row._id.shop);
    if (!map.has(key)) map.set(key, { total: 0, approved: 0, pending: 0 });
    const entry = map.get(key);
    entry.total += row.count;
    if (row._id.status === 'approved') entry.approved += row.count;
    if (row._id.status === 'pending') entry.pending += row.count;
  }
  return map;
}

async function shopJson(doc, counts) {
  const owner = doc.owner ? await User.findById(doc.owner).select('name email phone isActive').lean() : null;
  return {
    ...doc,
    id: String(doc._id),
    _id: undefined,
    owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email, phone: owner.phone, isActive: owner.isActive } : null,
    approvedBy: undefined,
    products: counts ? counts.get(String(doc._id)) || { total: 0, approved: 0, pending: 0 } : undefined
  };
}

async function listShops(query) {
  const conditions = [];
  if (query.q) conditions.push(nameContains(query.q, ['name', 'slug', 'phone', 'telegram']));
  if (query.status) conditions.push({ status: query.status });
  const filter = conditions.length ? { $and: conditions } : {};
  const { skip, limit } = paginate(query);
  const [docs, total, counts] = await Promise.all([
    Shop.find(filter).sort({ status: 1, isFeatured: -1, name: 1 }).skip(skip).limit(limit).lean(),
    Shop.countDocuments(filter),
    shopCounts()
  ]);
  return listResult(await Promise.all(docs.map((doc) => shopJson(doc, counts))), total, query);
}

async function getShop(id) {
  const doc = await Shop.findById(id).lean();
  if (!doc) throw notFound();
  return shopJson(doc, await shopCounts());
}

async function resolveOwner(email, excludeShopId) {
  if (!email) return null;
  const user = await User.findOne({ email }).lean();
  if (!user) throw validationFailed({ ownerEmail: { code: 'user_not_found', params: {} } });
  if (!['shop_owner', 'user'].includes(user.role)) throw validationFailed({ ownerEmail: { code: 'invalid_owner', params: {} } });
  const filter = { owner: user._id };
  if (excludeShopId) filter._id = trusted({ $ne: excludeShopId });
  if (await Shop.exists(filter)) throw validationFailed({ ownerEmail: { code: 'owner_has_shop', params: {} } });
  return user;
}

async function promoteOwner(user) {
  if (user && user.role === 'user') {
    await User.updateOne({ _id: user._id }, { $set: { role: 'shop_owner' }, $inc: { tokenVersion: 1 } });
  }
}

async function createShop(req, input) {
  const { ownerEmail, ...rest } = input;
  const owner = await resolveOwner(ownerEmail);
  const slug = await uniqueSlug(Shop, rest.slug, rest.name);
  const status = rest.status || 'approved';
  const doc = await Shop.create({
    ...rest,
    slug,
    owner: owner?._id || null,
    status,
    approvedAt: status === 'approved' ? new Date() : null,
    approvedBy: status === 'approved' ? req.auth.userId : null
  });
  await promoteOwner(owner);
  invalidateCatalogCache();
  await recordAudit(req, { action: 'shop.create', entity: { type: 'shop', id: doc._id, label: doc.name }, meta: { status } });
  return getShop(doc._id);
}

async function updateShop(req, id, input, { seller = false } = {}) {
  const before = await Shop.findById(id).lean();
  if (!before) throw notFound();
  const { ownerEmail, ...rest } = input;
  const set = { ...rest };
  if (!seller) {
    if (ownerEmail !== undefined) {
      const owner = await resolveOwner(ownerEmail, before._id);
      set.owner = owner?._id || null;
      await promoteOwner(owner);
    }
    set.slug = rest.slug && rest.slug !== before.slug ? await uniqueSlug(Shop, rest.slug, '', before._id) : before.slug;
  }
  delete set.status;
  await Shop.updateOne({ _id: before._id }, { $set: set }, { runValidators: true });
  const after = await Shop.findById(before._id).lean();
  const changes = diff(before, after, SHOP_AUDIT_FIELDS);
  if (changes.some((change) => change.field === 'name')) await refreshSearchText({ shop: before._id });
  else invalidateCatalogCache();
  if (changes.length) {
    await recordAudit(req, { action: 'shop.update', entity: { type: 'shop', id: before._id, label: after.name }, changes });
  }
  return getShop(before._id);
}

async function setShopStatus(req, id, { status, note = '' }) {
  const before = await Shop.findById(id).lean();
  if (!before) throw notFound();
  if (['rejected', 'suspended'].includes(status) && !note) throw validationFailed({ note: { code: 'required', params: {} } });
  const set = { status, statusNote: status === 'approved' ? '' : note };
  if (status === 'approved' && !before.approvedAt) {
    set.approvedAt = new Date();
    set.approvedBy = req.auth.userId;
  }
  await Shop.updateOne({ _id: before._id }, { $set: set });
  if (status === 'approved' && before.owner) {
    const owner = await User.findById(before.owner).lean();
    await promoteOwner(owner);
  }
  const after = await Shop.findById(before._id).lean();
  invalidateCatalogCache();
  await recordAudit(req, {
    action: `shop.${status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : status === 'suspended' ? 'suspend' : 'update'}`,
    entity: { type: 'shop', id: before._id, label: after.name },
    changes: diff(before, after, ['status', 'statusNote'])
  });
  return getShop(before._id);
}

async function deleteShop(req, id) {
  const doc = await Shop.findById(id).lean();
  if (!doc) throw notFound();
  const inUse = await Product.countDocuments({ shop: doc._id });
  if (inUse > 0) throw conflict('in_use', { params: { count: inUse } });
  await Shop.deleteOne({ _id: doc._id });
  await Review.deleteMany({ shop: doc._id });
  await ShopStat.deleteMany({ shop: doc._id });
  invalidateCatalogCache();
  await recordAudit(req, { action: 'shop.delete', entity: { type: 'shop', id: doc._id, label: doc.name }, meta: { snapshot: { name: doc.name, slug: doc.slug } } });
}

/** Lightweight option lists for admin form selects. */
async function formOptions() {
  const refs = await loadRefs();
  const parents = refs.categories.filter((c) => !c.parent);
  return {
    categories: refs.categories.map((c) => ({
      id: String(c._id),
      name: c.name,
      parent: c.parent ? String(c.parent) : null,
      isActive: c.isActive
    })),
    parents: parents.map((c) => ({ id: String(c._id), name: c.name })),
    brands: refs.brands.map((b) => ({ id: String(b._id), name: b.name, isActive: b.isActive })),
    shops: refs.shops.map((s) => ({ id: String(s._id), name: s.name, status: s.status }))
  };
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  patchProduct,
  moderateProduct,
  deleteProduct,
  categories,
  brands,
  listShops,
  getShop,
  createShop,
  updateShop,
  setShopStatus,
  deleteShop,
  formOptions,
  uniqueSlug,
  MODERATED_FIELDS
};

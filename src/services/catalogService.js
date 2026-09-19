'use strict';

/**
 * Public catalog: product search with faceted filters, categories,
 * suppliers and lookups for the quote cart.
 *
 * Every query operator object is wrapped with mongoose.trusted() because
 * `sanitizeFilter` is enabled globally; user input never reaches a filter
 * without passing the validation schemas first.
 */
const mongoose = require('mongoose');
const { Product, Category, Brand, Supplier } = require('../models');
const { searchTokens, normalizeForSearch } = require('../lib/text');
const i18n = require('../i18n');

const { trusted } = mongoose;
const REFS_TTL_MS = 30 * 1000;

let refsCache = null;
let refsPromise = null;
const memo = new Map();

function idOf(value) {
  return value ? String(value._id || value) : null;
}

async function buildRefs() {
  const [categories, brands, suppliers] = await Promise.all([
    Category.find({}).sort({ sortOrder: 1, 'name.uz': 1 }).lean(),
    Brand.find({}).sort({ name: 1 }).lean(),
    Supplier.find({}).sort({ stallNumber: 1 }).lean()
  ]);
  const byId = (list) => new Map(list.map((doc) => [String(doc._id), doc]));
  const bySlug = (list) => new Map(list.map((doc) => [doc.slug, doc]));
  return {
    at: Date.now(),
    categories,
    brands,
    suppliers,
    categoryById: byId(categories),
    brandById: byId(brands),
    supplierById: byId(suppliers),
    categoryBySlug: bySlug(categories),
    brandBySlug: bySlug(brands),
    supplierBySlug: bySlug(suppliers),
    activeCategoryIds: categories.filter((c) => c.isActive).map((c) => c._id),
    activeSupplierIds: suppliers.filter((s) => s.isActive).map((s) => s._id)
  };
}

async function loadRefs() {
  if (refsCache && Date.now() - refsCache.at < REFS_TTL_MS) return refsCache;
  if (!refsPromise) {
    refsPromise = buildRefs()
      .then((refs) => {
        refsCache = refs;
        return refs;
      })
      .finally(() => {
        refsPromise = null;
      });
  }
  return refsPromise;
}

/** Call after any catalog write so public listings reflect it immediately. */
function invalidateCatalogCache() {
  refsCache = null;
  memo.clear();
}

async function memoize(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}

/* ------------------------------------------------------ serialisation */

function categoryRef(category) {
  if (!category) return null;
  return { id: idOf(category), slug: category.slug, name: category.name, icon: category.icon };
}

function brandRef(brand) {
  if (!brand) return null;
  return { id: idOf(brand), slug: brand.slug, name: brand.name, country: brand.country || '' };
}

function supplierRef(supplier) {
  if (!supplier) return null;
  return {
    id: idOf(supplier),
    slug: supplier.slug,
    name: supplier.name,
    stallNumber: supplier.stallNumber,
    isVerified: Boolean(supplier.isVerified),
    deliveryAvailable: Boolean(supplier.deliveryAvailable)
  };
}

function supplierPublic(supplier, productCount) {
  if (!supplier) return null;
  return {
    ...supplierRef(supplier),
    description: supplier.description,
    address: supplier.address,
    phone: supplier.phone,
    telegram: supplier.telegram,
    whatsapp: supplier.whatsapp,
    email: supplier.email,
    workingHours: supplier.workingHours,
    workingDays: supplier.workingDays,
    deliveryNote: supplier.deliveryNote,
    paymentMethods: supplier.paymentMethods || [],
    isFeatured: Boolean(supplier.isFeatured),
    logoUrl: supplier.logoUrl || '',
    productCount: productCount ?? undefined
  };
}

function compactDimensions(dimensions = {}) {
  const out = {};
  for (const key of ['lengthMm', 'widthMm', 'heightMm', 'thicknessMm', 'diameterMm']) {
    if (typeof dimensions[key] === 'number') out[key] = dimensions[key];
  }
  return out;
}

function serializeProduct(product, refs, { detail = false } = {}) {
  const out = {
    id: idOf(product),
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    category: categoryRef(refs.categoryById.get(idOf(product.category))),
    brand: brandRef(product.brand ? refs.brandById.get(idOf(product.brand)) : null),
    supplier: supplierRef(refs.supplierById.get(idOf(product.supplier))),
    materialType: product.materialType,
    grade: product.grade || '',
    unit: product.unit,
    price: product.price,
    oldPrice: product.oldPrice ?? null,
    currency: product.currency || 'UZS',
    priceTiers: (product.priceTiers || []).map(({ minQty, price }) => ({ minQty, price })),
    minOrderQty: product.minOrderQty || 1,
    orderStep: product.orderStep || 1,
    dimensions: compactDimensions(product.dimensions),
    weightKg: product.weightKg ?? null,
    stock: { status: product.stock?.status || 'in_stock', quantity: product.stock?.quantity ?? null },
    leadTimeDays: product.leadTimeDays || 0,
    image: product.images?.[0] || null,
    isFeatured: Boolean(product.isFeatured),
    hasBulkPricing: Boolean(product.priceTiers?.length)
  };
  if (detail) {
    out.description = product.description || { uz: '', ru: '' };
    out.specs = (product.specs || []).map(({ label, value }) => ({ label, value }));
    out.images = product.images || [];
    out.unitsPerPallet = product.unitsPerPallet ?? null;
    out.supplier = supplierPublic(refs.supplierById.get(idOf(product.supplier)));
    out.updatedAt = product.updatedAt;
  }
  return out;
}

const LIST_FIELDS = '-description -specs -searchText -createdBy -updatedBy';

/* ------------------------------------------------------------ filters */

function publicConditions(refs) {
  return [
    { isActive: true },
    { category: trusted({ $in: refs.activeCategoryIds }) },
    { supplier: trusted({ $in: refs.activeSupplierIds }) }
  ];
}

function idsFromSlugs(map, slugs) {
  return (slugs || []).map((slug) => map.get(slug)).filter(Boolean).map((doc) => doc._id);
}

const FACET_KEYS = ['brand', 'material', 'grade', 'stock', 'unit', 'supplier', 'thickness', 'diameter', 'price'];

/**
 * Build filter conditions. `except` omits one facet's own condition so that
 * facet counts reflect "what you would get if you toggled this value".
 */
function filterConditions(query, refs, except) {
  const conditions = [];
  const add = (key, condition) => {
    if (key !== except) conditions.push(condition);
  };
  if (query.brand?.length) add('brand', { brand: trusted({ $in: idsFromSlugs(refs.brandBySlug, query.brand) }) });
  if (query.material?.length) add('material', { materialType: trusted({ $in: query.material }) });
  if (query.grade?.length) add('grade', { grade: trusted({ $in: query.grade }) });
  if (query.stock?.length) add('stock', { 'stock.status': trusted({ $in: query.stock }) });
  if (query.unit?.length) add('unit', { unit: trusted({ $in: query.unit }) });
  if (query.supplier?.length) {
    add('supplier', { supplier: trusted({ $in: idsFromSlugs(refs.supplierBySlug, query.supplier) }) });
  }
  if (query.thickness?.length) add('thickness', { 'dimensions.thicknessMm': trusted({ $in: query.thickness }) });
  if (query.diameter?.length) add('diameter', { 'dimensions.diameterMm': trusted({ $in: query.diameter }) });
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const range = {};
    if (query.priceMin !== undefined) range.$gte = query.priceMin;
    if (query.priceMax !== undefined) range.$lte = query.priceMax;
    add('price', { price: trusted(range) });
  }
  if (query.bulk) add('bulk', { hasBulkPricing: true });
  if (query.featured) add('featured', { isFeatured: true });
  return conditions;
}

function baseConditions(query, refs) {
  const conditions = publicConditions(refs);
  let impossible = false;
  if (query.category) {
    const category = refs.categoryBySlug.get(query.category);
    if (!category || !category.isActive) impossible = true;
    else conditions.push({ category: category._id });
  }
  for (const token of searchTokens(query.q || '')) {
    conditions.push({ searchText: trusted({ $regex: token }) });
  }
  return { conditions, impossible };
}

const and = (conditions) => (conditions.length ? { $and: conditions } : {});

const SORTS = {
  recommended: { isFeatured: -1, stockRank: 1, createdAt: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  name: null
};

async function computeFacets(base, query, refs) {
  const facetPipeline = (except, groupStage) => [{ $match: and(filterConditions(query, refs, except)) }, ...groupStage];
  const countBy = (field) => [{ $group: { _id: field, count: { $sum: 1 } } }];
  const [result] = await Product.aggregate([
    { $match: and(base) },
    {
      $facet: {
        brand: facetPipeline('brand', countBy('$brand')),
        material: facetPipeline('material', countBy('$materialType')),
        grade: facetPipeline('grade', countBy('$grade')),
        stock: facetPipeline('stock', countBy('$stock.status')),
        unit: facetPipeline('unit', countBy('$unit')),
        supplier: facetPipeline('supplier', countBy('$supplier')),
        thickness: facetPipeline('thickness', countBy('$dimensions.thicknessMm')),
        diameter: facetPipeline('diameter', countBy('$dimensions.diameterMm')),
        price: facetPipeline('price', [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }])
      }
    }
  ]);
  const clean = (rows) => rows.filter((row) => row._id !== null && row._id !== undefined && row._id !== '');
  const byCount = (a, b) => b.count - a.count;
  const numeric = (rows) =>
    clean(rows)
      .map((row) => ({ value: row._id, count: row.count }))
      .sort((a, b) => a.value - b.value);
  return {
    brands: clean(result.brand)
      .map((row) => ({ ...brandRef(refs.brandById.get(idOf(row._id))), count: row.count }))
      .filter((row) => row.slug)
      .sort((a, b) => a.name.localeCompare(b.name)),
    materials: clean(result.material).map((row) => ({ value: row._id, count: row.count })).sort(byCount),
    grades: clean(result.grade)
      .map((row) => ({ value: row._id, count: row.count }))
      .sort((a, b) => a.value.localeCompare(b.value, 'en', { numeric: true })),
    stock: clean(result.stock).map((row) => ({ value: row._id, count: row.count })),
    units: clean(result.unit).map((row) => ({ value: row._id, count: row.count })).sort(byCount),
    suppliers: clean(result.supplier)
      .map((row) => ({ ...supplierRef(refs.supplierById.get(idOf(row._id))), count: row.count }))
      .filter((row) => row.slug)
      .sort((a, b) => a.stallNumber.localeCompare(b.stallNumber, 'en', { numeric: true })),
    thickness: numeric(result.thickness),
    diameter: numeric(result.diameter),
    price: result.price[0] ? { min: result.price[0].min, max: result.price[0].max } : null
  };
}

async function listProducts(query, { lang = 'uz' } = {}) {
  const refs = await loadRefs();
  const { conditions: base, impossible } = baseConditions(query, refs);
  const page = query.page || 1;
  const limit = query.limit || 24;
  if (impossible) {
    return { items: [], total: 0, page, pages: 0, limit, facets: query.facets ? emptyFacets() : undefined };
  }
  const filter = and([...base, ...filterConditions(query, refs)]);
  let cursor = Product.find(filter).select(LIST_FIELDS);
  if (query.sort === 'name') {
    cursor = cursor.sort({ [`name.${lang}`]: 1, _id: 1 }).collation({ locale: lang === 'ru' ? 'ru' : 'en' });
  } else {
    cursor = cursor.sort(SORTS[query.sort] || SORTS.recommended);
  }
  const [docs, total, facets] = await Promise.all([
    cursor.skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
    query.facets ? computeFacets(base, query, refs) : Promise.resolve(undefined)
  ]);
  return {
    items: docs.map((doc) => serializeProduct(doc, refs)),
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
    facets
  };
}

function emptyFacets() {
  return { brands: [], materials: [], grades: [], stock: [], units: [], suppliers: [], thickness: [], diameter: [], price: null };
}

async function getProduct(slug) {
  const refs = await loadRefs();
  const doc = await Product.findOne({ slug, isActive: true }).select('-searchText').lean();
  if (!doc) return null;
  const category = refs.categoryById.get(idOf(doc.category));
  const supplier = refs.supplierById.get(idOf(doc.supplier));
  if (!category?.isActive || !supplier?.isActive) return null;
  const similarDocs = await Product.find(
    and([...publicConditions(refs), { category: doc.category }, { _id: trusted({ $ne: doc._id }) }])
  )
    .select(LIST_FIELDS)
    .sort(SORTS.recommended)
    .limit(8)
    .lean();
  return {
    product: serializeProduct(doc, refs, { detail: true }),
    similar: similarDocs.map((item) => serializeProduct(item, refs))
  };
}

async function lookupProducts(ids) {
  const refs = await loadRefs();
  const docs = await Product.find(and([...publicConditions(refs), { _id: trusted({ $in: ids }) }]))
    .select(LIST_FIELDS)
    .lean();
  return docs.map((doc) => serializeProduct(doc, refs));
}

async function suggest(q, { lang = 'uz' } = {}) {
  const refs = await loadRefs();
  const tokens = searchTokens(q, 4);
  if (!tokens.length) return { products: [], categories: [] };
  const docs = await Product.find(
    and([...publicConditions(refs), ...tokens.map((token) => ({ searchText: trusted({ $regex: token }) }))])
  )
    .select('sku slug name images price unit category supplier')
    .sort(SORTS.recommended)
    .limit(6)
    .lean();
  const needle = normalizeForSearch(q);
  const categories = refs.categories
    .filter((c) => c.isActive)
    .filter((c) => normalizeForSearch(`${c.name.uz} ${c.name.ru}`).includes(needle))
    .slice(0, 4)
    .map(categoryRef);
  return {
    products: docs.map((doc) => ({
      id: idOf(doc),
      sku: doc.sku,
      slug: doc.slug,
      name: doc.name,
      image: doc.images?.[0] || null,
      price: doc.price,
      unit: doc.unit
    })),
    categories,
    lang
  };
}

async function productCountsBy(field, refs) {
  const rows = await Product.aggregate([
    { $match: and(publicConditions(refs)) },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } }
  ]);
  return new Map(rows.map((row) => [idOf(row._id), row.count]));
}

async function listCategories() {
  return memoize('categories', REFS_TTL_MS, async () => {
    const refs = await loadRefs();
    const counts = await productCountsBy('category', refs);
    return refs.categories
      .filter((c) => c.isActive)
      .map((c) => ({ ...categoryRef(c), description: c.description, productCount: counts.get(idOf(c)) || 0 }));
  });
}

async function listBrands() {
  return memoize('brands', REFS_TTL_MS, async () => {
    const refs = await loadRefs();
    const counts = await productCountsBy('brand', refs);
    return refs.brands
      .filter((b) => b.isActive)
      .map((b) => ({ ...brandRef(b), productCount: counts.get(idOf(b)) || 0 }))
      .filter((b) => b.productCount > 0);
  });
}

async function listSuppliers({ q, featured, page = 1, limit = 24 } = {}) {
  const refs = await loadRefs();
  const counts = await memoize('supplierCounts', REFS_TTL_MS, () => productCountsBy('supplier', refs));
  let list = refs.suppliers.filter((s) => s.isActive);
  if (featured) list = list.filter((s) => s.isFeatured);
  if (q) {
    const needle = normalizeForSearch(q);
    list = list.filter((s) =>
      normalizeForSearch(`${s.name} ${s.stallNumber} ${s.description?.uz || ''} ${s.description?.ru || ''}`).includes(needle)
    );
  }
  list = [...list].sort(
    (a, b) =>
      Number(b.isFeatured) - Number(a.isFeatured) ||
      Number(b.isVerified) - Number(a.isVerified) ||
      a.stallNumber.localeCompare(b.stallNumber, 'en', { numeric: true })
  );
  const total = list.length;
  const items = list.slice((page - 1) * limit, page * limit).map((s) => supplierPublic(s, counts.get(idOf(s)) || 0));
  return { items, total, page, pages: Math.ceil(total / limit), limit };
}

async function getSupplier(slug) {
  const refs = await loadRefs();
  const supplier = refs.supplierBySlug.get(slug);
  if (!supplier || !supplier.isActive) return null;
  const docs = await Product.find(and([...publicConditions(refs), { supplier: supplier._id }]))
    .select(LIST_FIELDS)
    .sort(SORTS.recommended)
    .limit(60)
    .lean();
  return {
    supplier: supplierPublic(supplier, docs.length),
    products: docs.map((doc) => serializeProduct(doc, refs))
  };
}

async function stats() {
  return memoize('stats', REFS_TTL_MS, async () => {
    const refs = await loadRefs();
    const products = await Product.countDocuments(and(publicConditions(refs)));
    return {
      products,
      suppliers: refs.activeSupplierIds.length,
      categories: refs.activeCategoryIds.length
    };
  });
}

async function homeData() {
  const refs = await loadRefs();
  const [categories, statistics, featuredDocs, suppliers] = await Promise.all([
    listCategories(),
    stats(),
    Product.find(and([...publicConditions(refs), { isFeatured: true }]))
      .select(LIST_FIELDS)
      .sort(SORTS.recommended)
      .limit(8)
      .lean(),
    listSuppliers({ featured: true, limit: 6 })
  ]);
  let featured = featuredDocs;
  if (featured.length < 4) {
    featured = await Product.find(and(publicConditions(refs))).select(LIST_FIELDS).sort(SORTS.recommended).limit(8).lean();
  }
  const supplierItems = suppliers.items.length ? suppliers.items : (await listSuppliers({ limit: 6 })).items;
  return {
    stats: statistics,
    categories,
    featured: featured.map((doc) => serializeProduct(doc, refs)),
    suppliers: supplierItems
  };
}

/** Normalised text used by the catalog search (both languages + references). */
function buildSearchText(product, refs) {
  const category = refs.categoryById.get(idOf(product.category));
  const brand = product.brand ? refs.brandById.get(idOf(product.brand)) : null;
  const supplier = refs.supplierById.get(idOf(product.supplier));
  const parts = [
    product.sku,
    product.name?.uz,
    product.name?.ru,
    product.grade,
    brand?.name,
    category?.name?.uz,
    category?.name?.ru,
    supplier?.name,
    supplier?.stallNumber,
    i18n.t('uz', `materials.${product.materialType}`),
    i18n.t('ru', `materials.${product.materialType}`),
    ...(product.specs || []).flatMap((spec) => [spec.value?.uz, spec.value?.ru])
  ];
  return normalizeForSearch(parts.filter(Boolean).join(' ')).slice(0, 3000);
}

/** Recompute searchText for products referencing a renamed category/brand/supplier. */
async function refreshSearchText(filter) {
  invalidateCatalogCache();
  const refs = await loadRefs();
  const docs = await Product.find(filter).select('sku name grade brand category supplier materialType specs').lean();
  if (!docs.length) return 0;
  await Product.bulkWrite(
    docs.map((doc) => ({
      updateOne: { filter: { _id: doc._id }, update: { $set: { searchText: buildSearchText(doc, refs) } } }
    }))
  );
  return docs.length;
}

module.exports = {
  loadRefs,
  invalidateCatalogCache,
  serializeProduct,
  listProducts,
  getProduct,
  lookupProducts,
  suggest,
  listCategories,
  listBrands,
  listSuppliers,
  getSupplier,
  stats,
  homeData,
  buildSearchText,
  refreshSearchText,
  FACET_KEYS
};

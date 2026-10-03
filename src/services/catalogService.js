'use strict';

/**
 * Public catalog: product search with faceted filters, the category tree,
 * shops, home page data and contact/view tracking.
 *
 * A product is public only when it is approved, active, in an active
 * category and listed by an approved shop. Every operator object is wrapped
 * with mongoose.trusted() because `sanitizeFilter` is enabled globally; user
 * input never reaches a filter without passing the validation schemas first.
 */
const mongoose = require('mongoose');
const { Product, Category, Brand, Shop, Review, Banner, ShopStat } = require('../models');
const { searchTokens, normalizeForSearch } = require('../lib/text');
const i18n = require('../i18n');

const { trusted } = mongoose;
const REFS_TTL_MS = 30 * 1000;

let refsCache = null;
let refsPromise = null;
const memo = new Map();

const idOf = (value) => (value ? String(value._id || value) : null);

async function buildRefs() {
  const [categories, brands, shops] = await Promise.all([
    Category.find({}).sort({ sortOrder: 1, 'name.uz': 1 }).lean(),
    Brand.find({}).sort({ name: 1 }).lean(),
    Shop.find({}).sort({ isFeatured: -1, name: 1 }).lean()
  ]);
  const byId = (list) => new Map(list.map((doc) => [String(doc._id), doc]));
  const bySlug = (list) => new Map(list.map((doc) => [doc.slug, doc]));
  const categoryById = byId(categories);
  const childrenOf = new Map();
  for (const c of categories) {
    if (!c.parent) continue;
    const key = String(c.parent);
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(c);
  }
  const isCategoryVisible = (c) => Boolean(c && c.isActive && (!c.parent || categoryById.get(String(c.parent))?.isActive));
  return {
    at: Date.now(),
    categories,
    brands,
    shops,
    categoryById,
    brandById: byId(brands),
    shopById: byId(shops),
    categoryBySlug: bySlug(categories),
    brandBySlug: bySlug(brands),
    shopBySlug: bySlug(shops),
    childrenOf,
    isCategoryVisible,
    visibleCategoryIds: categories.filter(isCategoryVisible).map((c) => c._id),
    visibleShopIds: shops.filter((s) => s.status === 'approved').map((s) => s._id)
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

function categoryRef(category, refs) {
  if (!category) return null;
  const parent = category.parent && refs ? refs.categoryById.get(String(category.parent)) : null;
  return {
    id: idOf(category),
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    parent: parent ? { id: idOf(parent), slug: parent.slug, name: parent.name } : null
  };
}

function brandRef(brand) {
  if (!brand) return null;
  return { id: idOf(brand), slug: brand.slug, name: brand.name, country: brand.country || '' };
}

/** Contact details travel with every shop reference: they are what the site is for. */
function shopContacts(shop) {
  return {
    phone: shop.phone || '',
    phone2: shop.phone2 || '',
    telegram: shop.telegram || '',
    instagram: shop.instagram || '',
    whatsapp: shop.whatsapp || ''
  };
}

function shopRef(shop) {
  if (!shop) return null;
  return {
    id: idOf(shop),
    slug: shop.slug,
    name: shop.name,
    accent: shop.accent || '#FF7A1A',
    logoUrl: shop.logoUrl || '',
    isVerified: Boolean(shop.isVerified),
    rating: shop.rating || 0,
    reviewCount: shop.reviewCount || 0,
    city: shop.city || '',
    deliveryAvailable: Boolean(shop.deliveryAvailable),
    workingHours: shop.workingHours || '',
    workingDays: shop.workingDays || 'mon_sat',
    ...shopContacts(shop)
  };
}

function shopPublic(shop, extra = {}) {
  if (!shop) return null;
  return {
    ...shopRef(shop),
    tagline: shop.tagline || { uz: '', ru: '' },
    description: shop.description || { uz: '', ru: '' },
    address: shop.address || { uz: '', ru: '' },
    landmark: shop.landmark || { uz: '', ru: '' },
    mapUrl: shop.mapUrl || '',
    email: shop.email || '',
    website: shop.website || '',
    deliveryNote: shop.deliveryNote || { uz: '', ru: '' },
    paymentMethods: shop.paymentMethods || [],
    foundedYear: shop.foundedYear || null,
    coverUrl: shop.coverUrl || '',
    isFeatured: Boolean(shop.isFeatured),
    isDemo: Boolean(shop.isDemo),
    ...extra
  };
}

function serializeProduct(product, refs, { detail = false } = {}) {
  const shop = refs.shopById.get(idOf(product.shop));
  const out = {
    id: idOf(product),
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    category: categoryRef(refs.categoryById.get(idOf(product.category)), refs),
    brand: brandRef(product.brand ? refs.brandById.get(idOf(product.brand)) : null),
    shop: shopRef(shop),
    unit: product.unit,
    price: product.price,
    oldPrice: product.oldPrice ?? null,
    discountPercent: product.discountPercent || 0,
    currency: product.currency || 'UZS',
    colors: product.colors || [],
    stock: { status: product.stock?.status || 'in_stock', quantity: product.stock?.quantity ?? null },
    leadTimeDays: product.leadTimeDays || 0,
    image: product.images?.[0] || null,
    imageCount: product.images?.length || 0,
    rating: product.rating || 0,
    reviewCount: product.reviewCount || 0,
    isFeatured: Boolean(product.isFeatured),
    createdAt: product.createdAt
  };
  if (detail) {
    out.description = product.description || { uz: '', ru: '' };
    out.specs = (product.specs || []).map(({ label, value }) => ({ label, value }));
    out.sizes = product.sizes || [];
    out.images = product.images || [];
    out.shop = shopPublic(shop);
    out.updatedAt = product.updatedAt;
  }
  return out;
}

const LIST_FIELDS = '-description -specs -searchText -createdBy -updatedBy -moderationNote';

/* ------------------------------------------------------------ filters */

function publicConditions(refs) {
  return [
    { status: 'approved' },
    { isActive: true },
    { category: trusted({ $in: refs.visibleCategoryIds }) },
    { shop: trusted({ $in: refs.visibleShopIds }) }
  ];
}

function idsFromSlugs(map, slugs) {
  return (slugs || []).map((slug) => map.get(slug)).filter(Boolean).map((doc) => doc._id);
}

/** A category slug selects itself plus its children (for top-level groups). */
function categoryScope(refs, slug) {
  const category = refs.categoryBySlug.get(slug);
  if (!category || !refs.isCategoryVisible(category)) return null;
  const children = (refs.childrenOf.get(String(category._id)) || []).filter((c) => c.isActive);
  return { category, ids: [category._id, ...children.map((c) => c._id)] };
}

/**
 * Build filter conditions. `except` omits one facet's own condition so that
 * facet counts reflect "what you would get if you toggled this value".
 */
function filterConditions(query, refs, except) {
  const conditions = [];
  const add = (key, condition) => {
    if (key !== except) conditions.push(condition);
  };
  if (query.sub?.length) {
    const ids = idsFromSlugs(refs.categoryBySlug, query.sub);
    add('sub', { category: trusted({ $in: ids }) });
  }
  if (query.brand?.length) add('brand', { brand: trusted({ $in: idsFromSlugs(refs.brandBySlug, query.brand) }) });
  if (query.shop?.length) add('shop', { shop: trusted({ $in: idsFromSlugs(refs.shopBySlug, query.shop) }) });
  if (query.color?.length) add('color', { colors: trusted({ $in: query.color }) });
  if (query.stock?.length) add('stock', { 'stock.status': trusted({ $in: query.stock }) });
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const range = {};
    if (query.priceMin !== undefined) range.$gte = query.priceMin;
    if (query.priceMax !== undefined) range.$lte = query.priceMax;
    add('price', { price: trusted(range) });
  }
  if (query.discount) add('discount', { discountPercent: trusted({ $gt: 0 }) });
  if (query.featured) add('featured', { isFeatured: true });
  if (query.rating) add('rating', { rating: trusted({ $gte: query.rating }) });
  return conditions;
}

function baseConditions(query, refs) {
  const conditions = publicConditions(refs);
  let impossible = false;
  let scope = null;
  if (query.category) {
    scope = categoryScope(refs, query.category);
    if (!scope) impossible = true;
    else conditions.push({ category: trusted({ $in: scope.ids }) });
  }
  for (const token of searchTokens(query.q || '')) {
    conditions.push({ searchText: trusted({ $regex: token }) });
  }
  return { conditions, impossible, scope };
}

const and = (conditions) => (conditions.length ? { $and: conditions } : {});

const SORTS = {
  recommended: { isFeatured: -1, stockRank: 1, rating: -1, createdAt: -1, _id: 1 },
  popular: { contactCount: -1, viewCount: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  discount: { discountPercent: -1, price: 1, _id: 1 },
  rating: { rating: -1, reviewCount: -1, _id: 1 },
  name: null
};

async function computeFacets(base, query, refs) {
  const facetPipeline = (except, groupStage) => [{ $match: and(filterConditions(query, refs, except)) }, ...groupStage];
  const countBy = (field) => [{ $group: { _id: field, count: { $sum: 1 } } }];
  const [result] = await Product.aggregate([
    { $match: and(base) },
    {
      $facet: {
        sub: facetPipeline('sub', countBy('$category')),
        brand: facetPipeline('brand', countBy('$brand')),
        shop: facetPipeline('shop', countBy('$shop')),
        color: facetPipeline('color', [{ $unwind: '$colors' }, { $group: { _id: '$colors', count: { $sum: 1 } } }]),
        stock: facetPipeline('stock', countBy('$stock.status')),
        discount: facetPipeline('discount', [{ $match: { discountPercent: { $gt: 0 } } }, { $group: { _id: null, count: { $sum: 1 } } }]),
        price: facetPipeline('price', [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }])
      }
    }
  ]);
  const clean = (rows) => rows.filter((row) => row._id !== null && row._id !== undefined && row._id !== '');
  const byCount = (a, b) => b.count - a.count;
  return {
    subcategories: clean(result.sub)
      .map((row) => {
        const c = refs.categoryById.get(idOf(row._id));
        return c ? { slug: c.slug, name: c.name, icon: c.icon, sortOrder: c.sortOrder, count: row.count } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    brands: clean(result.brand)
      .map((row) => ({ ...brandRef(refs.brandById.get(idOf(row._id))), count: row.count }))
      .filter((row) => row.slug)
      .sort((a, b) => a.name.localeCompare(b.name)),
    shops: clean(result.shop)
      .map((row) => {
        const s = refs.shopById.get(idOf(row._id));
        return s ? { slug: s.slug, name: s.name, count: row.count } : null;
      })
      .filter(Boolean)
      .sort(byCount),
    colors: clean(result.color).map((row) => ({ value: row._id, count: row.count })).sort(byCount),
    stock: clean(result.stock).map((row) => ({ value: row._id, count: row.count })),
    discount: result.discount[0]?.count || 0,
    price: result.price[0] ? { min: result.price[0].min, max: result.price[0].max } : null
  };
}

function emptyFacets() {
  return { subcategories: [], brands: [], shops: [], colors: [], stock: [], discount: 0, price: null };
}

async function listProducts(query, { lang = 'uz' } = {}) {
  const refs = await loadRefs();
  const { conditions: base, impossible, scope } = baseConditions(query, refs);
  const page = query.page || 1;
  const limit = query.limit || 24;
  const categoryInfo = scope ? categoryRef(scope.category, refs) : null;
  if (impossible) {
    return { items: [], total: 0, page, pages: 0, limit, category: null, facets: query.facets ? emptyFacets() : undefined };
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
    category: categoryInfo ? { ...categoryInfo, description: scope.category.description } : null,
    facets
  };
}

async function findPublicProduct(refs, filter) {
  const doc = await Product.findOne({ ...filter, status: 'approved', isActive: true }).select('-searchText').lean();
  if (!doc) return null;
  const category = refs.categoryById.get(idOf(doc.category));
  const shop = refs.shopById.get(idOf(doc.shop));
  if (!refs.isCategoryVisible(category) || shop?.status !== 'approved') return null;
  return doc;
}

async function getProduct(slug) {
  const refs = await loadRefs();
  const doc = await findPublicProduct(refs, { slug });
  if (!doc) return null;
  const [similarDocs, shopDocs, reviews] = await Promise.all([
    Product.find(and([...publicConditions(refs), { category: doc.category }, { _id: trusted({ $ne: doc._id }) }]))
      .select(LIST_FIELDS)
      .sort(SORTS.recommended)
      .limit(10)
      .lean(),
    Product.find(and([...publicConditions(refs), { shop: doc.shop }, { _id: trusted({ $ne: doc._id }) }]))
      .select(LIST_FIELDS)
      .sort(SORTS.popular)
      .limit(8)
      .lean(),
    listReviews({ target: 'product', productId: doc._id, page: 1, limit: 5 })
  ]);
  return {
    product: serializeProduct(doc, refs, { detail: true }),
    similar: similarDocs.map((item) => serializeProduct(item, refs)),
    fromShop: shopDocs.map((item) => serializeProduct(item, refs)),
    reviews
  };
}

async function lookupProducts(ids) {
  const refs = await loadRefs();
  const docs = await Product.find(and([...publicConditions(refs), { _id: trusted({ $in: ids }) }]))
    .select(LIST_FIELDS)
    .lean();
  const order = new Map(ids.map((id, index) => [String(id), index]));
  return docs.map((doc) => serializeProduct(doc, refs)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function suggest(q) {
  const refs = await loadRefs();
  const tokens = searchTokens(q, 4);
  if (!tokens.length) return { products: [], categories: [], shops: [] };
  const docs = await Product.find(
    and([...publicConditions(refs), ...tokens.map((token) => ({ searchText: trusted({ $regex: token }) }))])
  )
    .select('sku slug name images price oldPrice unit category shop')
    .sort(SORTS.recommended)
    .limit(6)
    .lean();
  const needle = normalizeForSearch(q);
  const categories = refs.categories
    .filter(refs.isCategoryVisible)
    .filter((c) => normalizeForSearch(`${c.name.uz} ${c.name.ru}`).includes(needle))
    .slice(0, 4)
    .map((c) => categoryRef(c, refs));
  const shops = refs.shops
    .filter((s) => s.status === 'approved')
    .filter((s) => normalizeForSearch(s.name).includes(needle))
    .slice(0, 3)
    .map(shopRef);
  return {
    products: docs.map((doc) => ({
      id: idOf(doc),
      sku: doc.sku,
      slug: doc.slug,
      name: doc.name,
      image: doc.images?.[0] || null,
      price: doc.price,
      unit: doc.unit,
      shop: refs.shopById.get(idOf(doc.shop))?.name || ''
    })),
    categories,
    shops
  };
}

async function productCountsBy(field, refs) {
  const rows = await Product.aggregate([
    { $match: and(publicConditions(refs)) },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, image: { $first: { $arrayElemAt: ['$images', 0] } } } }
  ]);
  return new Map(rows.map((row) => [idOf(row._id), row]));
}

/** Category tree with product counts and a representative image per category. */
async function listCategories() {
  return memoize('categories', REFS_TTL_MS, async () => {
    const refs = await loadRefs();
    const rows = await productCountsBy('category', refs);
    const visible = refs.categories.filter(refs.isCategoryVisible);
    const parents = visible.filter((c) => !c.parent);
    return parents.map((parent) => {
      const children = visible
        .filter((c) => String(c.parent) === String(parent._id))
        .map((c) => {
          const row = rows.get(idOf(c));
          return {
            ...categoryRef(c, refs),
            description: c.description,
            productCount: row?.count || 0,
            image: c.image || row?.image || null
          };
        });
      const own = rows.get(idOf(parent));
      const productCount = children.reduce((sum, c) => sum + c.productCount, own?.count || 0);
      const image = parent.image || children.find((c) => c.image)?.image || own?.image || null;
      return { ...categoryRef(parent, refs), description: parent.description, productCount, image, children };
    });
  });
}

async function listBrands() {
  return memoize('brands', REFS_TTL_MS, async () => {
    const refs = await loadRefs();
    const counts = await productCountsBy('brand', refs);
    return refs.brands
      .filter((b) => b.isActive)
      .map((b) => ({ ...brandRef(b), productCount: counts.get(idOf(b))?.count || 0 }))
      .filter((b) => b.productCount > 0)
      .sort((a, b) => b.productCount - a.productCount);
  });
}

/** Subcategories each shop sells (for shop cards and filters). */
async function shopCategoryMap(refs) {
  return memoize('shopCategories', REFS_TTL_MS, async () => {
    const rows = await Product.aggregate([
      { $match: and(publicConditions(refs)) },
      { $group: { _id: { shop: '$shop', category: '$category' }, count: { $sum: 1 } } }
    ]);
    const map = new Map();
    for (const row of rows) {
      const shopId = idOf(row._id.shop);
      const category = refs.categoryById.get(idOf(row._id.category));
      if (!category) continue;
      if (!map.has(shopId)) map.set(shopId, { count: 0, categories: [] });
      const entry = map.get(shopId);
      entry.count += row.count;
      entry.categories.push({ slug: category.slug, name: category.name, icon: category.icon, count: row.count, parent: idOf(category.parent) });
    }
    for (const entry of map.values()) entry.categories.sort((a, b) => b.count - a.count);
    return map;
  });
}

async function listShops({ q, featured, category, city, sort = 'recommended', page = 1, limit = 24 } = {}) {
  const refs = await loadRefs();
  const catMap = await shopCategoryMap(refs);
  let list = refs.shops.filter((s) => s.status === 'approved');
  if (featured) list = list.filter((s) => s.isFeatured);
  if (city) list = list.filter((s) => s.city === city);
  if (category) {
    const scope = categoryScope(refs, category);
    const slugs = new Set(scope ? scope.ids.map((id) => refs.categoryById.get(idOf(id))?.slug) : []);
    list = list.filter((s) => (catMap.get(idOf(s))?.categories || []).some((c) => slugs.has(c.slug)));
  }
  if (q) {
    const needle = normalizeForSearch(q);
    list = list.filter((s) =>
      normalizeForSearch(
        `${s.name} ${s.tagline?.uz || ''} ${s.tagline?.ru || ''} ${s.description?.uz || ''} ${s.description?.ru || ''} ${s.address?.uz || ''} ${s.address?.ru || ''}`
      ).includes(needle)
    );
  }
  const count = (s) => catMap.get(idOf(s))?.count || 0;
  const sorters = {
    recommended: (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || Number(b.isVerified) - Number(a.isVerified) || b.rating - a.rating,
    rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
    products: (a, b) => count(b) - count(a),
    name: (a, b) => a.name.localeCompare(b.name)
  };
  list = [...list].sort(sorters[sort] || sorters.recommended);
  const total = list.length;
  const items = list.slice((page - 1) * limit, page * limit).map((s) =>
    shopPublic(s, {
      productCount: count(s),
      categories: (catMap.get(idOf(s))?.categories || []).slice(0, 6).map(({ slug, name, icon }) => ({ slug, name, icon }))
    })
  );
  return { items, total, page, pages: Math.ceil(total / limit), limit };
}

async function getShop(slug, { sort = 'recommended', category } = {}) {
  const refs = await loadRefs();
  const shop = refs.shopBySlug.get(slug);
  if (!shop || shop.status !== 'approved') return null;
  const catMap = await shopCategoryMap(refs);
  const conditions = [...publicConditions(refs), { shop: shop._id }];
  if (category) {
    const scope = categoryScope(refs, category);
    if (scope) conditions.push({ category: trusted({ $in: scope.ids }) });
  }
  const [docs, reviews] = await Promise.all([
    Product.find(and(conditions)).select(LIST_FIELDS).sort(SORTS[sort] || SORTS.recommended).limit(120).lean(),
    listReviews({ target: 'shop', shopId: shop._id, page: 1, limit: 6 })
  ]);
  const entry = catMap.get(idOf(shop));
  return {
    shop: shopPublic(shop, { productCount: entry?.count || 0, categories: entry?.categories || [] }),
    products: docs.map((doc) => serializeProduct(doc, refs)),
    reviews
  };
}

/* ------------------------------------------------------------ reviews */

function reviewJson(review) {
  return {
    id: idOf(review),
    authorName: review.authorName,
    rating: review.rating,
    text: review.text,
    lang: review.lang,
    createdAt: review.createdAt
  };
}

async function listReviews({ target, productId, shopId, page = 1, limit = 10 }) {
  const filter = { target, status: 'approved' };
  if (target === 'product') filter.product = productId;
  else filter.shop = shopId;
  const [docs, total, dist] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $match: filter }, { $group: { _id: '$rating', count: { $sum: 1 } } }])
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of dist) distribution[row._id] = row.count;
  return { items: docs.map(reviewJson), total, page, pages: Math.ceil(total / limit), limit, distribution };
}

/* ---------------------------------------------------------- home page */

async function stats() {
  return memoize('stats', REFS_TTL_MS, async () => {
    const refs = await loadRefs();
    const products = await Product.countDocuments(and(publicConditions(refs)));
    return {
      products,
      shops: refs.visibleShopIds.length,
      categories: refs.categories.filter((c) => c.parent && refs.isCategoryVisible(c)).length,
      brands: refs.brands.filter((b) => b.isActive).length
    };
  });
}

async function activeBanners() {
  const now = new Date();
  const docs = await Banner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  return docs
    .filter((b) => (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt >= now))
    .map((b) => ({
      id: idOf(b),
      title: b.title,
      subtitle: b.subtitle,
      ctaLabel: b.ctaLabel,
      link: b.link,
      image: b.image,
      placement: b.placement,
      theme: b.theme
    }));
}

async function homeData() {
  return memoize('home', 15 * 1000, async () => {
    const refs = await loadRefs();
    const base = publicConditions(refs);
    const find = (extra, sort, limit) =>
      Product.find(and([...base, ...extra])).select(LIST_FIELDS).sort(sort).limit(limit).lean();
    const [categories, statistics, featured, newest, discounted, popular, shops, brands, banners] = await Promise.all([
      listCategories(),
      stats(),
      find([{ isFeatured: true }], SORTS.recommended, 12),
      find([], SORTS.newest, 10),
      find([{ discountPercent: trusted({ $gt: 0 }) }], SORTS.discount, 10),
      find([], SORTS.popular, 10),
      listShops({ featured: true, limit: 8 }),
      listBrands(),
      activeBanners()
    ]);
    const ser = (docs) => docs.map((doc) => serializeProduct(doc, refs));
    return {
      stats: statistics,
      categories,
      featured: ser(featured),
      newest: ser(newest),
      discounted: ser(discounted),
      popular: ser(popular),
      shops: shops.items.length ? shops.items : (await listShops({ limit: 8 })).items,
      brands: brands.slice(0, 16),
      banners
    };
  });
}

/* ----------------------------------------------------------- tracking */

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Count a product view, shop view or contact click (anonymous, aggregated
 * per shop per day — no personal data is stored).
 */
async function track({ type, channel, product: productId, shop: shopSlug }) {
  const refs = await loadRefs();
  let shopId = null;
  let productDoc = null;
  if (productId) {
    productDoc = await Product.findOne({ _id: productId, status: 'approved', isActive: true }).select('shop').lean();
    if (!productDoc) return false;
    shopId = productDoc.shop;
  } else if (shopSlug) {
    const shop = refs.shopBySlug.get(shopSlug);
    if (!shop || shop.status !== 'approved') return false;
    shopId = shop._id;
  }
  if (!shopId) return false;
  const inc = {};
  if (type === 'contact') {
    inc[`contacts.${channel}`] = 1;
    if (productDoc) await Product.updateOne({ _id: productDoc._id }, { $inc: { contactCount: 1 } });
  } else if (type === 'product_view' && productDoc) {
    inc.productViews = 1;
    await Product.updateOne({ _id: productDoc._id }, { $inc: { viewCount: 1 } });
  } else if (type === 'shop_view') {
    inc.shopViews = 1;
  } else {
    return false;
  }
  await ShopStat.updateOne({ shop: shopId, day: today() }, { $inc: inc }, { upsert: true });
  return true;
}

/* --------------------------------------------------------- search text */

/** Normalised text used by the catalog search (both languages + references). */
function buildSearchText(product, refs) {
  const category = refs.categoryById.get(idOf(product.category));
  const parent = category?.parent ? refs.categoryById.get(idOf(category.parent)) : null;
  const brand = product.brand ? refs.brandById.get(idOf(product.brand)) : null;
  const shop = refs.shopById.get(idOf(product.shop));
  const colorWords = (product.colors || []).flatMap((c) => [i18n.t('uz', `colors.${c}`), i18n.t('ru', `colors.${c}`)]);
  const parts = [
    product.sku,
    product.name?.uz,
    product.name?.ru,
    brand?.name,
    category?.name?.uz,
    category?.name?.ru,
    parent?.name?.uz,
    parent?.name?.ru,
    shop?.name,
    ...colorWords,
    ...(product.sizes || []),
    ...(product.specs || []).flatMap((spec) => [spec.value?.uz, spec.value?.ru])
  ];
  return normalizeForSearch(parts.filter(Boolean).join(' ')).slice(0, 3000);
}

/** Recompute searchText for products referencing a renamed category/brand/shop. */
async function refreshSearchText(filter) {
  invalidateCatalogCache();
  const refs = await loadRefs();
  const docs = await Product.find(filter).select('sku name brand category shop colors sizes specs').lean();
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
  shopPublic,
  listProducts,
  getProduct,
  lookupProducts,
  suggest,
  listCategories,
  listBrands,
  listShops,
  getShop,
  listReviews,
  stats,
  homeData,
  track,
  buildSearchText,
  refreshSearchText,
  categoryScope
};

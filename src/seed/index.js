'use strict';

const { Category, Brand, Shop, Product, Review, Banner, ShopStat, User } = require('../models');
const data = require('./data');
const { reviewPool, reviewers, shopReviewPool } = require('./data/reviews');
const { productImagePaths, shopCoverPath, shopLogoPath } = require('./images');
const { invalidateCatalogCache, loadRefs, buildSearchText } = require('../services/catalogService');
const { recompute } = require('../services/reviewService');
const { hashPassword, checkPasswordPolicy } = require('../security/password');
const { STOCK_RANK } = require('../domain/constants');
const { slugify } = require('../lib/text');

const EMPTY = { uz: '', ru: '' };
const DAY = 24 * 60 * 60 * 1000;

/** Small deterministic PRNG so every seed produces the same demo data. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demo accounts (fictional, for testing only — change or delete before going live). */
const DEMO_ADMIN = { email: 'admin@stroybazar.uz', name: 'Alisherbek Bobokulov', password: 'Sb-Control#2026' };
const DEMO_MANAGER = { email: 'manager@stroybazar.uz', name: 'Malika Moderator', password: 'Moder#Demo2026' };
const DEMO_CUSTOMER = { email: 'customer@stroybazar.uz', name: 'Javohir Karimov', password: 'Mijoz#Demo2026' };

async function upsertUser({ email, name, password, role, phone = '' }) {
  const issues = checkPasswordPolicy(password, { email, name });
  if (issues.length) throw new Error(`Demo password for ${email} violates the policy: ${issues.join(', ')}`);
  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ email });
  if (existing) {
    Object.assign(existing, { name, role, passwordHash, isActive: true, mustChangePassword: false, lockUntil: null, failedLoginAttempts: 0 });
    existing.tokenVersion = (existing.tokenVersion || 0) + 1;
    await existing.save();
    return existing;
  }
  return User.create({ email, name, role, phone, passwordHash, mustChangePassword: false });
}

function shopDoc(shop, ownerId, status = 'approved') {
  return {
    slug: shop.slug,
    name: shop.name,
    owner: ownerId,
    status,
    tagline: shop.tagline || EMPTY,
    description: shop.description || EMPTY,
    address: shop.address || EMPTY,
    landmark: shop.landmark || EMPTY,
    city: shop.city || 'tashkent_city',
    phone: shop.phone || '',
    phone2: shop.phone2 || '',
    telegram: shop.telegram || '',
    instagram: shop.instagram || '',
    whatsapp: shop.phone2 || '',
    workingHours: shop.workingHours,
    workingDays: shop.workingDays,
    deliveryAvailable: Boolean(shop.deliveryAvailable),
    deliveryNote: shop.deliveryNote || EMPTY,
    paymentMethods: shop.paymentMethods || ['cash'],
    foundedYear: shop.foundedYear || null,
    accent: shop.accent,
    logoUrl: shopLogoPath(shop),
    coverUrl: status === 'approved' ? shopCoverPath(shop) : '',
    isVerified: Boolean(shop.isVerified),
    isFeatured: Boolean(shop.isFeatured),
    isDemo: true,
    approvedAt: status === 'approved' ? new Date(Date.now() - 300 * DAY) : null
  };
}

function productDoc(p, refs, { status = 'approved', createdAt }) {
  const category = refs.categoryBySlug.get(p.category);
  const shop = refs.shopBySlug.get(p.shop);
  const brand = p.brand ? refs.brandBySlug.get(p.brand) : null;
  if (!category || !shop || (p.brand && !brand)) throw new Error(`Invalid references in seed product ${p.sku}`);
  const product = {
    sku: p.sku,
    slug: slugify(`${p.name.uz} ${p.sku}`).slice(0, 110),
    name: p.name,
    description: p.description || EMPTY,
    category: category._id,
    shop: shop._id,
    brand: brand ? brand._id : null,
    unit: p.unit,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    discountPercent: Product.discountOf(p.price, p.oldPrice),
    colors: p.colors,
    sizes: p.sizes,
    specs: p.specs,
    stock: p.stock,
    stockRank: STOCK_RANK[p.stock.status],
    leadTimeDays: p.leadTimeDays || 0,
    images: p.images || productImagePaths(p),
    status,
    moderationNote: p.moderationNote || '',
    submittedAt: status === 'pending' ? createdAt : null,
    approvedAt: status === 'approved' ? createdAt : null,
    isFeatured: Boolean(p.isFeatured),
    isActive: true,
    createdAt,
    updatedAt: createdAt
  };
  product.searchText = buildSearchText(product, refs);
  return product;
}

/**
 * Insert the demo marketplace. Existing catalog data is kept unless
 * `reset` is true (users and the audit log are never deleted).
 * `withAccounts` also creates the demo shop-owner accounts and links them to their shops.
 */
async function seedCatalog({ reset = false, withAccounts = false, log = () => {} } = {}) {
  if (reset) {
    await Promise.all([
      Product.deleteMany({}),
      Category.deleteMany({}),
      Brand.deleteMany({}),
      Shop.deleteMany({}),
      Review.deleteMany({}),
      Banner.deleteMany({}),
      ShopStat.deleteMany({})
    ]);
    log('Catalog collections cleared.');
  }
  if ((await Product.estimatedDocumentCount()) > 0 || (await Category.estimatedDocumentCount()) > 0) {
    log('Catalog already contains data — skipping (use --reset to replace it).');
    invalidateCatalogCache();
    return { skipped: true };
  }
  const random = rng(2026);

  // categories: parents first, then children
  const parents = data.categories.filter((c) => !c.parent);
  const inserted = await Category.insertMany(parents.map((c) => ({ ...c, parent: null, isActive: true })));
  const parentIds = new Map(inserted.map((c) => [c.slug, c._id]));
  await Category.insertMany(
    data.categories.filter((c) => c.parent).map((c) => ({ ...c, parent: parentIds.get(c.parent), isActive: true }))
  );
  await Brand.insertMany(data.brands.map((b) => ({ ...b, nameKey: b.name.toLowerCase(), description: EMPTY, isActive: true })));

  // shops (+ owners)
  const owners = new Map();
  if (withAccounts) {
    for (const shop of [...data.shops, data.pendingShop]) {
      // eslint-disable-next-line no-await-in-loop
      const user = await upsertUser({ ...shop.owner, role: 'shop_owner', phone: shop.phone });
      owners.set(shop.slug, user._id);
    }
  }
  await Shop.insertMany(data.shops.map((s) => shopDoc(s, owners.get(s.slug) || null, 'approved')));
  await Shop.create(shopDoc(data.pendingShop, owners.get(data.pendingShop.slug) || null, 'pending'));
  invalidateCatalogCache();
  const refs = await loadRefs();

  // products, newest last so "new" sorting shows a realistic mix
  const now = Date.now();
  const docs = data.products.map((p, index) =>
    productDoc(p, refs, { createdAt: new Date(now - (data.products.length - index) * 9.5 * 60 * 60 * 1000 - random() * 3 * 60 * 60 * 1000) })
  );
  for (const doc of docs) {
    doc.viewCount = Math.round(40 + random() * 900 + (doc.isFeatured ? 600 : 0));
    doc.contactCount = Math.round(doc.viewCount * (0.04 + random() * 0.08));
  }
  // workflow examples: products waiting for moderation, and one rejected
  const pendingDocs = data.pendingProducts.map((p, i) =>
    productDoc(p, refs, { status: p.status, createdAt: new Date(now - (i + 1) * 5 * 60 * 60 * 1000) })
  );
  await Product.insertMany([...docs, ...pendingDocs], { timestamps: false });
  invalidateCatalogCache();

  const counts = await seedReviews(random);
  await seedStats(random);
  await seedBanners();
  invalidateCatalogCache();
  log(
    `Inserted ${data.categories.length} categories, ${data.brands.length} brands, ${data.shops.length + 1} shops, ` +
      `${docs.length + pendingDocs.length} products, ${counts.reviews} reviews.`
  );
  return { skipped: false, products: docs.length };
}

async function seedReviews(random) {
  const products = await Product.find({ status: 'approved' }).select('_id shop isFeatured').lean();
  const reviews = [];
  const pick = (list) => list[Math.floor(random() * list.length)];
  const now = Date.now();
  for (const product of products) {
    const n = product.isFeatured ? 3 + Math.floor(random() * 3) : Math.floor(random() * 4);
    for (let i = 0; i < n; i += 1) {
      const rating = random() < 0.62 ? 5 : random() < 0.75 ? 4 : random() < 0.6 ? 3 : 2;
      const entry = pick(reviewPool[rating]);
      reviews.push({
        target: 'product',
        product: product._id,
        shop: product.shop,
        authorName: pick(reviewers[entry.lang]),
        rating,
        text: entry.text,
        lang: entry.lang,
        status: 'approved',
        createdAt: new Date(now - random() * 160 * DAY)
      });
    }
  }
  const shops = await Shop.find({ status: 'approved' }).select('_id').lean();
  for (const shop of shops) {
    const n = 3 + Math.floor(random() * 5);
    for (let i = 0; i < n; i += 1) {
      const rating = random() < 0.7 ? 5 : 4;
      const entry = pick(shopReviewPool[rating]);
      reviews.push({
        target: 'shop',
        product: null,
        shop: shop._id,
        authorName: pick(reviewers[entry.lang]),
        rating,
        text: entry.text,
        lang: entry.lang,
        status: 'approved',
        createdAt: new Date(now - random() * 200 * DAY)
      });
    }
  }
  // two reviews waiting for moderation
  const sample = products.slice(0, 2);
  sample.forEach((product, i) => {
    reviews.push({
      target: 'product',
      product: product._id,
      shop: product.shop,
      authorName: i ? 'Дмитрий' : 'Sanjar',
      rating: i ? 4 : 5,
      text: i ? 'Хороший товар, но доставку пришлось ждать два дня. Продавец вежливый.' : 'Juda sifatli, rasmda koʻrsatilgandek. Doʻkon xodimlari yaxshi maslahat berishdi.',
      lang: i ? 'ru' : 'uz',
      status: 'pending',
      createdAt: new Date(now - (i + 1) * 3 * 60 * 60 * 1000)
    });
  });
  await Review.insertMany(reviews, { timestamps: false });
  const touched = new Map();
  for (const r of reviews) touched.set(`${r.product || ''}:${r.shop}`, r);
  for (const review of touched.values()) {
    // eslint-disable-next-line no-await-in-loop
    await recompute(review);
  }
  return { reviews: reviews.length };
}

async function seedStats(random) {
  const shops = await Shop.find({ status: 'approved' }).select('_id isFeatured').lean();
  const rows = [];
  for (const shop of shops) {
    const scale = shop.isFeatured ? 1.6 : 1;
    for (let d = 0; d < 30; d += 1) {
      const day = new Date(Date.now() - d * DAY).toISOString().slice(0, 10);
      const weekday = new Date(Date.now() - d * DAY).getDay();
      const k = scale * (weekday === 0 ? 0.6 : 1) * (0.7 + random() * 0.6);
      rows.push({
        shop: shop._id,
        day,
        shopViews: Math.round(18 * k),
        productViews: Math.round(64 * k),
        contacts: {
          phone: Math.round(3 * k * random() * 2),
          telegram: Math.round(4 * k * random() * 2),
          instagram: Math.round(1.5 * k * random() * 2),
          whatsapp: Math.round(0.5 * k * random() * 2)
        }
      });
    }
  }
  await ShopStat.insertMany(rows);
}

async function seedBanners() {
  const L = (uz, ru) => ({ uz, ru });
  await Banner.insertMany([
    {
      title: L('Vannaxona jihozlariga 15% gacha chegirma', 'Скидки до 15% на сантехнику'),
      subtitle: L('Unitazlar, tumbalar va dush tizimlari — doʻkonlar bilan toʻgʻridan-toʻgʻri bogʻlaning.', 'Унитазы, тумбы и душевые системы — связывайтесь с магазинами напрямую.'),
      ctaLabel: L('Chegirmalarni koʻrish', 'Смотреть скидки'),
      link: '/catalog?category=bathroom&discount=true',
      image: '/img/products/bth-vm-free.webp',
      placement: 'home_promo',
      theme: 'teal',
      sortOrder: 10
    },
    {
      title: L('Yangi keramogranit kolleksiyalari', 'Новые коллекции керамогранита'),
      subtitle: L('Kalakatta, Karrara va Nero marmar effektlari — 60×120 formatda.', 'Эффекты мрамора Калакатта, Каррара и Неро — в формате 60×120.'),
      ctaLabel: L('Kafellarni tanlash', 'Выбрать плитку'),
      link: '/catalog?category=tiles',
      image: '/img/products/til-mi-cala60.webp',
      placement: 'home_promo',
      theme: 'dark',
      sortOrder: 20
    },
    {
      title: L('Doʻkoningiz bormi? Stroy Bazarga qoʻshiling', 'Есть магазин? Подключайтесь к Stroy Bazar'),
      subtitle: L('Mahsulotlaringizni minglab xaridorlarga koʻrsating — joylashtirish bepul.', 'Покажите товары тысячам покупателей — размещение бесплатно.'),
      ctaLabel: L('Doʻkon ochish', 'Открыть магазин'),
      link: '/sell',
      image: '/img/products/tls-up-drill18.webp',
      placement: 'home_promo',
      theme: 'accent',
      sortOrder: 30
    }
  ]);
}

/** Create a super-admin (or promote an existing account) with a policy-checked password. */
async function ensureSuperadmin({ email, name, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('E-mail is required.');
  const issues = checkPasswordPolicy(password, { email: normalizedEmail, name });
  if (issues.length) {
    const error = new Error(`Password does not meet the policy: ${issues.join(', ')}`);
    error.code = 'WEAK_PASSWORD';
    throw error;
  }
  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    existing.role = 'superadmin';
    existing.isActive = true;
    existing.passwordHash = passwordHash;
    existing.passwordChangedAt = new Date();
    existing.mustChangePassword = false;
    existing.lockUntil = null;
    existing.failedLoginAttempts = 0;
    existing.tokenVersion = (existing.tokenVersion || 0) + 1;
    if (name) existing.name = name;
    await existing.save();
    return { user: existing, created: false };
  }
  const user = await User.create({
    email: normalizedEmail,
    name: name || 'Super Admin',
    role: 'superadmin',
    passwordHash,
    mustChangePassword: false
  });
  return { user, created: true };
}

/** Demo staff + customer accounts with documented test passwords. */
async function seedDemoAccounts() {
  await ensureSuperadmin(DEMO_ADMIN);
  await upsertUser({ ...DEMO_MANAGER, role: 'manager' });
  const customer = await upsertUser({ ...DEMO_CUSTOMER, role: 'user', phone: '+998901234567' });
  const favorites = await Product.find({ status: 'approved', isFeatured: true }).select('_id').limit(4).lean();
  await User.updateOne({ _id: customer._id }, { $set: { favorites: favorites.map((p) => p._id) } });
  return {
    admin: DEMO_ADMIN,
    manager: DEMO_MANAGER,
    customer: DEMO_CUSTOMER,
    owners: [...data.shops, data.pendingShop].map((s) => ({ shop: s.name, status: s === data.pendingShop ? 'pending' : 'approved', ...s.owner }))
  };
}

module.exports = { seedCatalog, seedDemoAccounts, ensureSuperadmin, DEMO_ADMIN };

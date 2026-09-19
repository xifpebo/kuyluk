'use strict';

const { Category, Brand, Supplier, Product, QuoteRequest, User } = require('../models');
const data = require('./catalogData');
const { invalidateCatalogCache, loadRefs, buildSearchText } = require('../services/catalogService');
const { quoteNumber } = require('../services/quoteService');
const { normalizeTiers, unitPriceFor, lineTotal } = require('../lib/pricing');
const { hashPassword, checkPasswordPolicy } = require('../security/password');
const { STOCK_RANK } = require('../domain/constants');
const { slugify } = require('../lib/text');

const EMPTY = { uz: '', ru: '' };

/**
 * Insert the demo construction catalog. Existing catalog data is kept unless
 * `reset` is true (users and the audit log are never touched).
 */
async function seedCatalog({ reset = false, log = () => {} } = {}) {
  if (reset) {
    await Promise.all([
      Product.deleteMany({}),
      Category.deleteMany({}),
      Brand.deleteMany({}),
      Supplier.deleteMany({}),
      QuoteRequest.deleteMany({})
    ]);
    log('Catalog collections cleared.');
  }
  if ((await Product.estimatedDocumentCount()) > 0 || (await Category.estimatedDocumentCount()) > 0) {
    log('Catalog already contains data — skipping (use --reset to replace it).');
    invalidateCatalogCache();
    return { skipped: true };
  }

  await Category.insertMany(data.categories.map((c) => ({ description: EMPTY, isActive: true, ...c })));
  await Brand.insertMany(
    data.brands.map((b) => ({ ...b, nameKey: b.name.toLowerCase(), description: EMPTY, isActive: true }))
  );
  await Supplier.insertMany(
    data.suppliers.map((s) => ({
      email: '',
      whatsapp: '',
      logoUrl: '',
      address: EMPTY,
      description: EMPTY,
      deliveryNote: EMPTY,
      isActive: true,
      ...s
    }))
  );
  invalidateCatalogCache();
  const refs = await loadRefs();

  const docs = data.products.map((p) => {
    const category = refs.categoryBySlug.get(p.category);
    const supplier = refs.supplierBySlug.get(p.supplier);
    const brand = p.brand ? refs.brandBySlug.get(p.brand) : null;
    if (!category || !supplier || (p.brand && !brand)) throw new Error(`Invalid references in seed product ${p.sku}`);
    const product = {
      ...p,
      slug: slugify(`${p.name.uz} ${p.sku}`),
      category: category._id,
      supplier: supplier._id,
      brand: brand ? brand._id : null,
      description: p.description || EMPTY,
      grade: p.grade || '',
      oldPrice: p.oldPrice ?? null,
      priceTiers: normalizeTiers(p.priceTiers, p.price),
      minOrderQty: p.minOrderQty || 1,
      orderStep: p.orderStep || 1,
      unitsPerPallet: p.unitsPerPallet ?? null,
      dimensions: {
        lengthMm: null,
        widthMm: null,
        heightMm: null,
        thicknessMm: null,
        diameterMm: null,
        ...(p.dimensions || {})
      },
      weightKg: p.weightKg ?? null,
      specs: p.specs || [],
      leadTimeDays: p.leadTimeDays || 0,
      isFeatured: Boolean(p.isFeatured),
      isActive: true
    };
    product.stockRank = STOCK_RANK[product.stock.status];
    product.hasBulkPricing = product.priceTiers.length > 0;
    product.searchText = buildSearchText(product, refs);
    return product;
  });
  // Stagger creation dates so "newest" sorting is meaningful.
  const now = Date.now();
  docs.forEach((doc, index) => {
    doc.createdAt = new Date(now - (docs.length - index) * 3 * 60 * 60 * 1000);
    doc.updatedAt = doc.createdAt;
  });
  await Product.insertMany(docs, { timestamps: false });
  invalidateCatalogCache();
  log(`Inserted ${data.categories.length} categories, ${data.brands.length} brands, ${data.suppliers.length} suppliers, ${docs.length} products.`);
  return { skipped: false, products: docs.length };
}

const DEMO_CUSTOMERS = [
  { name: 'Aziz Karimov', phone: '+998900000101', company: 'Karimov Qurilish MChJ', region: 'tashkent_city' },
  { name: 'Дмитрий Соколов', phone: '+998900000102', company: 'СтройДом', region: 'tashkent_region' },
  { name: 'Nilufar Rahimova', phone: '+998900000103', company: '', region: 'samarkand' },
  { name: 'Олег Петренко', phone: '+998900000104', company: 'Petrenko Build', region: 'tashkent_city' },
  { name: 'Jasur Toʻxtayev', phone: '+998900000105', company: '', region: 'fergana' },
  { name: 'Мадина Юсупова', phone: '+998900000106', company: 'Yusupova Interior', region: 'bukhara' }
];

/** A handful of quote requests so the admin dashboard has something to show. */
async function seedDemoQuotes({ log = () => {} } = {}) {
  if ((await QuoteRequest.estimatedDocumentCount()) > 0) return;
  const products = await Product.find({ isActive: true }).lean();
  const refs = await loadRefs();
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const baskets = [
    [['CEM-M500-50', 120], ['BLK-D500-600', 12], ['MET-RB-A500-12', 2.5]],
    [['GKL-KN-125', 80], ['GKL-PR-CD60', 140], ['FST-SCR-TN25', 3]],
    [['PIP-PPR-20', 120], ['PIP-FIT-20EL', 12], ['PIP-PVC-110', 10]],
    [['WOD-BRD-50150', 6], ['WOD-OSB3-9', 40], ['ROF-C8-045', 180]],
    [['TLS-BSH-GBH226', 1], ['TLS-MKT-GA5030', 2]],
    [['PNT-TK-HRM9', 6], ['PNT-CR-CT17', 3], ['CEM-GP-ROTBAND', 40]]
  ];
  const statuses = ['new', 'new', 'in_progress', 'quoted', 'accepted', 'rejected'];
  const docs = baskets.map((basket, index) => {
    const customer = DEMO_CUSTOMERS[index];
    const items = basket
      .map(([sku, qty]) => {
        const p = bySku.get(sku);
        if (!p) return null;
        const supplier = refs.supplierById.get(String(p.supplier));
        return {
          product: p._id,
          sku: p.sku,
          slug: p.slug,
          name: p.name,
          unit: p.unit,
          qty,
          unitPrice: unitPriceFor(p, qty),
          lineTotal: lineTotal(p, qty),
          supplier: p.supplier,
          supplierName: supplier?.name || '',
          stallNumber: supplier?.stallNumber || ''
        };
      })
      .filter(Boolean);
    const createdAt = new Date(Date.now() - (baskets.length - index) * 7 * 60 * 60 * 1000);
    const estimatedTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const status = statuses[index];
    const history = [{ at: createdAt, status: 'new', byName: customer.name }];
    if (status !== 'new') history.push({ at: new Date(createdAt.getTime() + 3600e3), status, byName: 'Demo' });
    return {
      number: quoteNumber(createdAt),
      status,
      lang: /[а-я]/i.test(customer.name) ? 'ru' : 'uz',
      customer: { name: customer.name, phone: customer.phone, email: '', company: customer.company, taxId: '' },
      contactMethod: index % 2 ? 'telegram' : 'phone',
      delivery: { method: 'delivery', region: customer.region, address: 'Demo address, 1', neededBy: null },
      comment: '',
      items,
      estimatedTotal,
      quotedTotal: ['quoted', 'accepted'].includes(status) ? Math.round(estimatedTotal * 0.97) : null,
      history,
      createdAt,
      updatedAt: createdAt
    };
  });
  await QuoteRequest.insertMany(docs, { timestamps: false });
  log(`Inserted ${docs.length} demo quote requests.`);
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

module.exports = { seedCatalog, seedDemoQuotes, ensureSuperadmin };

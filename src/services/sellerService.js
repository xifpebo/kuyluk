'use strict';

/**
 * Shop-owner cabinet. Every query is scoped to the signed-in owner's shop,
 * so an owner can never read or change another shop's data.
 *
 * Workflow: new products are created as `pending`; an admin approves them
 * before they become visible. Price, old price, stock and visibility changes
 * apply immediately; content changes (name, photos, description, category…)
 * of an approved product send it back to moderation.
 */
const mongoose = require('mongoose');
const { Shop, Product, ShopStat, Review } = require('../models');
const admin = require('./adminCatalogService');
const { forbidden, notFound } = require('../lib/errors');
const { notifyProductSubmitted } = require('./notify');

const { trusted } = mongoose;

async function ownShop(req) {
  const shop = await Shop.findOne({ owner: req.auth.userId }).lean();
  if (!shop) throw forbidden('no_shop');
  return shop;
}

function shopJson(shop) {
  return { ...shop, id: String(shop._id), _id: undefined, owner: undefined, approvedBy: undefined };
}

async function getShop(req) {
  return shopJson(await ownShop(req));
}

async function updateShop(req, input) {
  const shop = await ownShop(req);
  await admin.updateShop(req, shop._id, input, { seller: true });
  return getShop(req);
}

async function listProducts(req, query) {
  const shop = await ownShop(req);
  return admin.listProducts(query, [{ shop: shop._id }]);
}

async function getProduct(req, id) {
  const shop = await ownShop(req);
  return admin.getProduct(id, { shop: shop._id });
}

async function createProduct(req, input, config) {
  const shop = await ownShop(req);
  const product = await admin.createProduct(req, { ...input, isFeatured: false }, { status: 'pending', shopId: shop._id });
  notifyProductSubmitted(config, product, shop);
  return product;
}

async function updateProduct(req, id, input, config) {
  const shop = await ownShop(req);
  const product = await admin.updateProduct(req, id, { ...input, isFeatured: false }, { extraFilter: { shop: shop._id }, seller: true });
  if (product.status === 'pending') notifyProductSubmitted(config, product, shop);
  return product;
}

async function patchProduct(req, id, input) {
  const shop = await ownShop(req);
  return admin.patchProduct(req, id, input, { extraFilter: { shop: shop._id }, seller: true });
}

async function deleteProduct(req, id) {
  const shop = await ownShop(req);
  return admin.deleteProduct(req, id, { shop: shop._id });
}

async function formOptions() {
  const options = await admin.formOptions();
  return {
    categories: options.categories.filter((c) => c.isActive),
    parents: options.parents,
    brands: options.brands.filter((b) => b.isActive)
  };
}

function lastDays(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Basic statistics for the owner's dashboard (last 30 days). */
async function stats(req) {
  const shop = await ownShop(req);
  const days = lastDays(30);
  const [rows, byStatus, top, reviews, lowStock] = await Promise.all([
    ShopStat.find({ shop: shop._id, day: trusted({ $gte: days[0] }) }).lean(),
    Product.aggregate([{ $match: { shop: shop._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Product.find({ shop: shop._id, status: 'approved' })
      .select('sku slug name images price viewCount contactCount')
      .sort({ contactCount: -1, viewCount: -1 })
      .limit(5)
      .lean(),
    Review.find({ shop: shop._id, status: 'approved' }).sort({ createdAt: -1 }).limit(5).lean(),
    Product.find({ shop: shop._id, 'stock.status': trusted({ $in: ['low_stock', 'out_of_stock'] }) })
      .select('sku name stock')
      .limit(6)
      .lean()
  ]);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const series = days.map((day) => {
    const row = byDay.get(day);
    const contacts = row ? Object.values(row.contacts || {}).reduce((a, b) => a + b, 0) : 0;
    return { day, views: (row?.productViews || 0) + (row?.shopViews || 0), contacts };
  });
  const totals = { productViews: 0, shopViews: 0, contacts: { phone: 0, telegram: 0, instagram: 0, whatsapp: 0 } };
  for (const row of rows) {
    totals.productViews += row.productViews || 0;
    totals.shopViews += row.shopViews || 0;
    for (const key of Object.keys(totals.contacts)) totals.contacts[key] += row.contacts?.[key] || 0;
  }
  return {
    shop: { id: String(shop._id), name: shop.name, slug: shop.slug, status: shop.status, statusNote: shop.statusNote, rating: shop.rating, reviewCount: shop.reviewCount },
    products: Object.fromEntries(byStatus.map((row) => [row._id, row.count])),
    totals,
    series,
    top: top.map((p) => ({ id: String(p._id), sku: p.sku, slug: p.slug, name: p.name, image: p.images?.[0] || null, price: p.price, views: p.viewCount, contacts: p.contactCount })),
    reviews: reviews.map((r) => ({ id: String(r._id), authorName: r.authorName, rating: r.rating, text: r.text, target: r.target, createdAt: r.createdAt })),
    lowStock: lowStock.map((p) => ({ id: String(p._id), sku: p.sku, name: p.name, stock: p.stock }))
  };
}

module.exports = { ownShop, getShop, updateShop, listProducts, getProduct, createProduct, updateProduct, patchProduct, deleteProduct, formOptions, stats, notFound };

'use strict';

/**
 * Reviews: signed-in customers write them, moderators publish them, and the
 * rating/review count of the product and the shop is recomputed from the
 * approved reviews.
 */
const mongoose = require('mongoose');
const { Review, Product, Shop } = require('../models');
const { recordAudit } = require('./audit');
const { invalidateCatalogCache } = require('./catalogService');
const { conflict, notFound, validationFailed } = require('../lib/errors');
const { escapeRegex } = require('../lib/text');

const { trusted } = mongoose;

async function recompute(review) {
  const round = (n) => Math.round(n * 10) / 10;
  if (review.product) {
    const [row] = await Review.aggregate([
      { $match: { target: 'product', product: review.product, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    await Product.updateOne({ _id: review.product }, { $set: { rating: row ? round(row.avg) : 0, reviewCount: row?.count || 0 } });
  }
  const [shopRow] = await Review.aggregate([
    { $match: { shop: review.shop, status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  await Shop.updateOne({ _id: review.shop }, { $set: { rating: shopRow ? round(shopRow.avg) : 0, reviewCount: shopRow?.count || 0 } });
  invalidateCatalogCache();
}

async function create(req, input) {
  let product = null;
  let shop = null;
  if (input.target === 'product') {
    product = await Product.findOne({ _id: input.product, status: 'approved', isActive: true }).select('shop').lean();
    if (!product) throw notFound();
    shop = await Shop.findOne({ _id: product.shop, status: 'approved' }).select('_id owner').lean();
  } else {
    shop = await Shop.findOne({ slug: input.shop, status: 'approved' }).select('_id owner').lean();
  }
  if (!shop) throw notFound();
  if (shop.owner && String(shop.owner) === req.auth.userId) throw conflict('own_shop_review');
  const filter = { user: req.auth.userId, target: input.target, shop: shop._id };
  if (product) filter.product = product._id;
  if (await Review.exists({ ...filter, status: trusted({ $in: ['pending', 'approved'] }) })) {
    throw conflict('already_reviewed');
  }
  const review = await Review.create({
    target: input.target,
    product: product?._id || null,
    shop: shop._id,
    user: req.auth.userId,
    authorName: req.auth.user.name,
    rating: input.rating,
    text: input.text,
    lang: req.lang,
    status: 'pending'
  });
  return { id: String(review._id), status: review.status };
}

async function listMine(userId) {
  const docs = await Review.find({ user: userId }).sort({ createdAt: -1 }).limit(50).populate('product', 'slug name').populate('shop', 'slug name').lean();
  return docs.map((r) => ({
    id: String(r._id),
    target: r.target,
    rating: r.rating,
    text: r.text,
    status: r.status,
    createdAt: r.createdAt,
    product: r.product ? { slug: r.product.slug, name: r.product.name } : null,
    shop: r.shop ? { slug: r.shop.slug, name: r.shop.name } : null
  }));
}

async function adminList(query) {
  const conditions = [];
  if (query.status) conditions.push({ status: query.status });
  if (query.target) conditions.push({ target: query.target });
  if (query.q) {
    const pattern = escapeRegex(query.q.trim());
    conditions.push({ $or: [{ text: trusted({ $regex: pattern, $options: 'i' }) }, { authorName: trusted({ $regex: pattern, $options: 'i' }) }] });
  }
  const filter = conditions.length ? { $and: conditions } : {};
  const [docs, total] = await Promise.all([
    Review.find(filter)
      .sort({ status: 1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('product', 'slug name sku')
      .populate('shop', 'slug name')
      .lean(),
    Review.countDocuments(filter)
  ]);
  return {
    items: docs.map((r) => ({
      id: String(r._id),
      target: r.target,
      rating: r.rating,
      text: r.text,
      authorName: r.authorName,
      status: r.status,
      lang: r.lang,
      createdAt: r.createdAt,
      product: r.product ? { slug: r.product.slug, name: r.product.name, sku: r.product.sku } : null,
      shop: r.shop ? { slug: r.shop.slug, name: r.shop.name } : null
    })),
    total,
    page: query.page,
    pages: Math.ceil(total / query.limit),
    limit: query.limit
  };
}

async function moderate(req, id, status) {
  const review = await Review.findById(id).lean();
  if (!review) throw notFound();
  if (!['approved', 'rejected'].includes(status)) throw validationFailed({ status: { code: 'invalid_choice', params: {} } });
  await Review.updateOne({ _id: review._id }, { $set: { status, moderatedBy: req.auth.userId, moderatedAt: new Date() } });
  await recompute(review);
  await recordAudit(req, {
    action: status === 'approved' ? 'review.approve' : 'review.reject',
    entity: { type: 'review', id: review._id, label: `${review.authorName} · ${review.rating}★` },
    changes: [{ field: 'status', from: review.status, to: status }]
  });
  return { ok: true };
}

async function remove(req, id) {
  const review = await Review.findById(id).lean();
  if (!review) throw notFound();
  await Review.deleteOne({ _id: review._id });
  await recompute(review);
  await recordAudit(req, {
    action: 'review.delete',
    entity: { type: 'review', id: review._id, label: `${review.authorName} · ${review.rating}★` },
    meta: { snapshot: { text: review.text, rating: review.rating } }
  });
}

module.exports = { create, listMine, adminList, moderate, remove, recompute };

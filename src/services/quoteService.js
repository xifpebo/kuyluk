'use strict';

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { QuoteRequest, Product, User } = require('../models');
const { loadRefs } = require('./catalogService');
const { recordAudit, diff } = require('./audit');
const { notifyNewQuote } = require('./notify');
const { unitPriceFor, lineTotal, checkQuantity, roundQty } = require('../lib/pricing');
const { conflict, notFound, validationFailed, badRequest } = require('../lib/errors');
const { escapeRegex, truncate } = require('../lib/text');
const { QUOTE_TRANSITIONS } = require('../domain/constants');
const { isStaffRole } = require('../security/rbac');

const { trusted } = mongoose;
const NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function quoteNumber(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const bytes = crypto.randomBytes(4);
  let suffix = '';
  for (const byte of bytes) suffix += NUMBER_ALPHABET[byte % NUMBER_ALPHABET.length];
  return `BB-${yy}${mm}${dd}-${suffix}`;
}

function hashIp(secret, ip) {
  return crypto.createHmac('sha256', secret).update(`ip|${ip || ''}`).digest('hex').slice(0, 32);
}

/** Merge duplicate lines (same product) by summing quantities. */
function mergeItems(items) {
  const merged = new Map();
  for (const item of items) {
    const current = merged.get(item.product);
    merged.set(item.product, current ? { ...current, qty: roundQty(current.qty + item.qty) } : { ...item, qty: roundQty(item.qty) });
  }
  return [...merged.values()];
}

/**
 * Create a quote request. Prices are always recomputed on the server from
 * the current catalog; the client only sends product ids and quantities.
 */
async function createQuote(req, config, input) {
  if (input.website) throw badRequest('bad_request');
  const items = mergeItems(input.items);
  const refs = await loadRefs();
  const ids = items.map((item) => item.product);
  const products = await Product.find({
    $and: [
      { _id: trusted({ $in: ids }) },
      { isActive: true },
      { category: trusted({ $in: refs.activeCategoryIds }) },
      { supplier: trusted({ $in: refs.activeSupplierIds }) }
    ]
  }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const unavailable = ids.filter((id) => !byId.has(id));
  if (unavailable.length) {
    throw conflict('product_unavailable', { details: { unavailable } });
  }

  const fields = {};
  const lines = items.map((item, index) => {
    const product = byId.get(item.product);
    const issue = checkQuantity(product, item.qty);
    if (issue) fields[`items.${index}.qty`] = issue;
    const supplier = refs.supplierById.get(String(product.supplier));
    return {
      product: product._id,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      unit: product.unit,
      qty: item.qty,
      unitPrice: unitPriceFor(product, item.qty),
      lineTotal: lineTotal(product, item.qty),
      supplier: product.supplier,
      supplierName: supplier?.name || '',
      stallNumber: supplier?.stallNumber || ''
    };
  });
  if (Object.keys(fields).length) throw validationFailed(fields);

  const estimatedTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const base = {
    status: 'new',
    user: req.auth?.userId || null,
    lang: req.lang,
    customer: input.customer,
    contactMethod: input.contactMethod,
    delivery: input.delivery,
    comment: input.comment,
    items: lines,
    estimatedTotal,
    history: [{ status: 'new', by: req.auth?.userId || null, byName: req.auth?.user?.name || input.customer.name }],
    source: { ipHash: hashIp(config.appSecret, req.ip), userAgent: truncate(req.get('user-agent') || '', 256) }
  };

  let quote;
  for (let attempt = 0; attempt < 5 && !quote; attempt += 1) {
    try {
      quote = await QuoteRequest.create({ ...base, number: quoteNumber() });
    } catch (error) {
      if (error?.code !== 11000 || attempt === 4) throw error;
    }
  }

  await recordAudit(req, {
    action: 'quote.create',
    entity: { type: 'quote', id: quote._id, label: quote.number },
    meta: { items: lines.length, estimatedTotal, guest: !req.auth }
  });
  notifyNewQuote(config, quote).catch(() => {});
  return quote;
}

function serializeQuote(quote, { internal = false } = {}) {
  const out = {
    id: String(quote._id),
    number: quote.number,
    status: quote.status,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    estimatedTotal: quote.estimatedTotal,
    quotedTotal: quote.quotedTotal ?? null,
    currency: quote.currency,
    customer: quote.customer,
    contactMethod: quote.contactMethod,
    delivery: quote.delivery,
    comment: quote.comment,
    lang: quote.lang,
    items: (quote.items || []).map((item) => ({
      id: String(item._id),
      product: String(item.product),
      sku: item.sku,
      slug: item.slug,
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      quotedUnitPrice: item.quotedUnitPrice ?? null,
      supplierName: item.supplierName,
      stallNumber: item.stallNumber
    })),
    history: (quote.history || []).map((entry) => ({
      at: entry.at,
      status: entry.status,
      note: internal ? entry.note : undefined,
      byName: internal ? entry.byName : undefined
    }))
  };
  if (internal) {
    out.managerNote = quote.managerNote;
    out.user = quote.user ? String(quote.user._id || quote.user) : null;
    out.assignedTo = quote.assignedTo
      ? { id: String(quote.assignedTo._id || quote.assignedTo), name: quote.assignedTo.name || '' }
      : null;
  }
  return out;
}

async function listQuotesForUser(userId) {
  const quotes = await QuoteRequest.find({ user: userId }).sort({ createdAt: -1 }).limit(100).lean();
  return quotes.map((quote) => serializeQuote(quote));
}

async function listQuotes(query, auth) {
  const conditions = [];
  if (query.status) conditions.push({ status: query.status });
  if (query.assignee === 'me') conditions.push({ assignedTo: auth.userId });
  if (query.assignee === 'none') conditions.push({ assignedTo: null });
  if (query.q) {
    const pattern = escapeRegex(query.q.trim());
    conditions.push({
      $or: [
        { number: trusted({ $regex: pattern, $options: 'i' }) },
        { 'customer.name': trusted({ $regex: pattern, $options: 'i' }) },
        { 'customer.phone': trusted({ $regex: escapeRegex(query.q.replace(/[^\d+]/g, '')) || pattern }) },
        { 'customer.company': trusted({ $regex: pattern, $options: 'i' }) }
      ]
    });
  }
  const filter = conditions.length ? { $and: conditions } : {};
  const [docs, total] = await Promise.all([
    QuoteRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('assignedTo', 'name')
      .lean(),
    QuoteRequest.countDocuments(filter)
  ]);
  return {
    items: docs.map((doc) => serializeQuote(doc, { internal: true })),
    total,
    page: query.page,
    pages: Math.ceil(total / query.limit),
    limit: query.limit
  };
}

async function getQuote(id) {
  const quote = await QuoteRequest.findById(id).populate('assignedTo', 'name').lean();
  if (!quote) throw notFound();
  return serializeQuote(quote, { internal: true });
}

const AUDITED_FIELDS = ['status', 'assignedTo', 'managerNote', 'quotedTotal', 'items'];

async function updateQuote(req, id, input) {
  const quote = await QuoteRequest.findById(id);
  if (!quote) throw notFound();
  const before = quote.toObject();
  const history = [];

  if (input.status && input.status !== quote.status) {
    const allowed = QUOTE_TRANSITIONS[quote.status] || [];
    if (!allowed.includes(input.status)) {
      throw conflict('invalid_transition', {
        params: { from: quote.status, to: input.status },
        fields: { status: { code: 'invalid_choice', params: {} } }
      });
    }
    quote.status = input.status;
    history.push({ status: input.status, by: req.auth.userId, byName: req.auth.user.name, note: input.statusNote || '' });
  }

  if (input.assignedTo !== undefined) {
    if (input.assignedTo) {
      const assignee = await User.findById(input.assignedTo).select('role isActive').lean();
      if (!assignee || !assignee.isActive || !isStaffRole(assignee.role)) {
        throw validationFailed({ assignedTo: { code: 'invalid_choice', params: {} } });
      }
    }
    quote.assignedTo = input.assignedTo || null;
  }
  if (input.managerNote !== undefined) quote.managerNote = input.managerNote;

  if (input.items) {
    const byId = new Map(quote.items.map((item) => [String(item._id), item]));
    for (const change of input.items) {
      const item = byId.get(change.id);
      if (!item) throw validationFailed({ items: { code: 'invalid_id', params: {} } });
      item.quotedUnitPrice = change.quotedUnitPrice;
    }
  }
  if (input.quotedTotal !== undefined) {
    quote.quotedTotal = input.quotedTotal;
  } else if (input.items) {
    const priced = quote.items.every((item) => typeof item.quotedUnitPrice === 'number');
    if (priced) quote.quotedTotal = quote.items.reduce((sum, item) => sum + Math.round(item.quotedUnitPrice * item.qty), 0);
  }
  if (history.length) quote.history.push(...history);

  await quote.save();
  const after = quote.toObject();
  const changes = diff(
    { ...before, items: before.items.map((i) => ({ sku: i.sku, quotedUnitPrice: i.quotedUnitPrice })) },
    { ...after, items: after.items.map((i) => ({ sku: i.sku, quotedUnitPrice: i.quotedUnitPrice })) },
    AUDITED_FIELDS
  );
  if (changes.length) {
    await recordAudit(req, {
      action: history.length ? 'quote.status' : 'quote.update',
      entity: { type: 'quote', id: quote._id, label: quote.number },
      changes
    });
  }
  return getQuote(quote._id);
}

async function deleteQuote(req, id) {
  const quote = await QuoteRequest.findById(id).lean();
  if (!quote) throw notFound();
  await QuoteRequest.deleteOne({ _id: quote._id });
  await recordAudit(req, {
    action: 'quote.delete',
    entity: { type: 'quote', id: quote._id, label: quote.number },
    meta: { status: quote.status, customer: quote.customer?.name, estimatedTotal: quote.estimatedTotal }
  });
}

module.exports = {
  quoteNumber,
  createQuote,
  serializeQuote,
  listQuotesForUser,
  listQuotes,
  getQuote,
  updateQuote,
  deleteQuote
};

'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');
const {
  QUOTE_STATUSES,
  UNITS,
  REGIONS,
  DELIVERY_METHODS,
  CONTACT_METHODS,
  LANGUAGES
} = require('../domain/constants');

const { ObjectId } = mongoose.Schema.Types;

const itemSchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true },
    slug: { type: String, default: '' },
    name: { type: localizedField({ maxlength: 160 }), required: true },
    unit: { type: String, enum: UNITS, required: true },
    qty: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    quotedUnitPrice: { type: Number, default: null, min: 0 },
    supplier: { type: ObjectId, ref: 'Supplier', default: null },
    supplierName: { type: String, default: '' },
    stallNumber: { type: String, default: '' }
  },
  { _id: true }
);

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    status: { type: String, enum: QUOTE_STATUSES, required: true },
    by: { type: ObjectId, ref: 'User', default: null },
    byName: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 1000 }
  },
  { _id: false }
);

const quoteRequestSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    status: { type: String, enum: QUOTE_STATUSES, default: 'new', index: true },
    user: { type: ObjectId, ref: 'User', default: null, index: true },
    lang: { type: String, enum: LANGUAGES, default: 'uz' },
    customer: {
      name: { type: String, required: true, maxlength: 100 },
      phone: { type: String, required: true, maxlength: 20 },
      email: { type: String, default: '', maxlength: 254 },
      company: { type: String, default: '', maxlength: 120 },
      taxId: { type: String, default: '', maxlength: 20 }
    },
    contactMethod: { type: String, enum: CONTACT_METHODS, default: 'phone' },
    delivery: {
      method: { type: String, enum: DELIVERY_METHODS, default: 'delivery' },
      region: { type: String, enum: [...REGIONS, ''], default: '' },
      address: { type: String, default: '', maxlength: 300 },
      neededBy: { type: Date, default: null }
    },
    comment: { type: String, default: '', maxlength: 2000 },
    items: { type: [itemSchema], default: [] },
    estimatedTotal: { type: Number, required: true, min: 0 },
    quotedTotal: { type: Number, default: null, min: 0 },
    currency: { type: String, default: 'UZS' },
    assignedTo: { type: ObjectId, ref: 'User', default: null },
    managerNote: { type: String, default: '', maxlength: 2000 },
    history: { type: [historySchema], default: [] },
    source: {
      ipHash: { type: String, default: '' },
      userAgent: { type: String, default: '' }
    }
  },
  { timestamps: true, versionKey: false }
);

quoteRequestSchema.index({ createdAt: -1 });
quoteRequestSchema.index({ status: 1, createdAt: -1 });
quoteRequestSchema.index({ 'customer.phone': 1 });

module.exports = mongoose.models.QuoteRequest || mongoose.model('QuoteRequest', quoteRequestSchema);

'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');
const { UNITS, COLORS, STOCK_STATUSES, STOCK_RANK, CURRENCIES, PRODUCT_STATUSES } = require('../domain/constants');

const { ObjectId } = mongoose.Schema.Types;

const specSchema = new mongoose.Schema(
  {
    label: { type: localizedField({ required: true, maxlength: 60 }), required: true },
    value: { type: localizedField({ required: true, maxlength: 120 }), required: true }
  },
  { _id: false }
);

/**
 * A product listed by a shop. It becomes publicly visible only when
 * status = approved, isActive = true and its shop is approved.
 */
const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 32 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    name: { type: localizedField({ required: true, maxlength: 160 }), required: true },
    description: { type: localizedField({ maxlength: 4000 }), default: () => ({}) },
    category: { type: ObjectId, ref: 'Category', required: true, index: true },
    brand: { type: ObjectId, ref: 'Brand', default: null, index: true },
    shop: { type: ObjectId, ref: 'Shop', required: true, index: true },
    unit: { type: String, enum: UNITS, default: 'piece' },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: null },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    currency: { type: String, enum: CURRENCIES, default: 'UZS' },
    colors: { type: [{ type: String, enum: COLORS }], default: [] },
    sizes: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    specs: { type: [specSchema], default: [] },
    stock: {
      status: { type: String, enum: STOCK_STATUSES, default: 'in_stock' },
      quantity: { type: Number, default: null, min: 0 }
    },
    stockRank: { type: Number, default: 0 },
    leadTimeDays: { type: Number, default: 0, min: 0, max: 365 },
    images: { type: [{ type: String, trim: true, maxlength: 1000 }], default: [] },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'pending', index: true },
    moderationNote: { type: String, trim: true, maxlength: 500, default: '' },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: ObjectId, ref: 'User', default: null },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
    contactCount: { type: Number, default: 0, min: 0 },
    searchText: { type: String, default: '', select: false },
    createdBy: { type: ObjectId, ref: 'User', default: null },
    updatedBy: { type: ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, versionKey: false, minimize: false }
);

productSchema.index({ status: 1, isActive: 1, category: 1, stockRank: 1 });
productSchema.index({ status: 1, isActive: 1, isFeatured: -1, createdAt: -1 });
productSchema.index({ status: 1, isActive: 1, price: 1 });
productSchema.index({ status: 1, isActive: 1, discountPercent: -1 });
productSchema.index({ shop: 1, status: 1 });

function discountOf(price, oldPrice) {
  if (!oldPrice || !price || oldPrice <= price) return 0;
  return Math.round((1 - price / oldPrice) * 100);
}

productSchema.pre('validate', function derivedFields(next) {
  this.stockRank = STOCK_RANK[this.stock?.status] ?? 0;
  this.discountPercent = discountOf(this.price, this.oldPrice);
  next();
});

productSchema.set('toJSON', {
  versionKey: false,
  minimize: false,
  transform(doc, ret) {
    delete ret.searchText;
    delete ret.stockRank;
    return ret;
  }
});

productSchema.statics.discountOf = discountOf;

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);

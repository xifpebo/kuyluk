'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');
const { UNITS, MATERIALS, STOCK_STATUSES, STOCK_RANK, CURRENCIES } = require('../domain/constants');

const { ObjectId } = mongoose.Schema.Types;

const priceTierSchema = new mongoose.Schema(
  {
    minQty: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const specSchema = new mongoose.Schema(
  {
    label: { type: localizedField({ required: true, maxlength: 60 }), required: true },
    value: { type: localizedField({ required: true, maxlength: 120 }), required: true }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 32 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    name: { type: localizedField({ required: true, maxlength: 160 }), required: true },
    description: { type: localizedField({ maxlength: 4000 }), default: () => ({}) },
    category: { type: ObjectId, ref: 'Category', required: true, index: true },
    brand: { type: ObjectId, ref: 'Brand', default: null, index: true },
    supplier: { type: ObjectId, ref: 'Supplier', required: true, index: true },
    materialType: { type: String, enum: MATERIALS, default: 'other', index: true },
    grade: { type: String, trim: true, maxlength: 40, default: '' },
    unit: { type: String, enum: UNITS, required: true },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: null },
    currency: { type: String, enum: CURRENCIES, default: 'UZS' },
    priceTiers: { type: [priceTierSchema], default: [] },
    minOrderQty: { type: Number, default: 1, min: 0.001 },
    orderStep: { type: Number, default: 1, min: 0.001 },
    unitsPerPallet: { type: Number, default: null, min: 0 },
    dimensions: {
      lengthMm: { type: Number, default: null, min: 0 },
      widthMm: { type: Number, default: null, min: 0 },
      heightMm: { type: Number, default: null, min: 0 },
      thicknessMm: { type: Number, default: null, min: 0 },
      diameterMm: { type: Number, default: null, min: 0 }
    },
    weightKg: { type: Number, default: null, min: 0 },
    specs: { type: [specSchema], default: [] },
    stock: {
      status: { type: String, enum: STOCK_STATUSES, default: 'in_stock' },
      quantity: { type: Number, default: null, min: 0 }
    },
    stockRank: { type: Number, default: 0 },
    leadTimeDays: { type: Number, default: 0, min: 0, max: 365 },
    images: { type: [{ type: String, trim: true, maxlength: 1000 }], default: [] },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    hasBulkPricing: { type: Boolean, default: false },
    searchText: { type: String, default: '', select: false },
    createdBy: { type: ObjectId, ref: 'User', default: null },
    updatedBy: { type: ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, versionKey: false, minimize: false }
);

productSchema.index({ isActive: 1, category: 1, stockRank: 1 });
productSchema.index({ isActive: 1, isFeatured: -1, stockRank: 1, createdAt: -1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ grade: 1 });
productSchema.index({ 'dimensions.thicknessMm': 1 });
productSchema.index({ 'dimensions.diameterMm': 1 });

productSchema.pre('validate', function derivedFields(next) {
  this.stockRank = STOCK_RANK[this.stock?.status] ?? 0;
  this.hasBulkPricing = Array.isArray(this.priceTiers) && this.priceTiers.length > 0;
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

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);

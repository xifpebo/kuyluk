'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');
const { PAYMENT_METHODS, WORKING_DAYS, SHOP_STATUSES, REGIONS } = require('../domain/constants');

/** A shop (seller) listed on the marketplace. Each shop has one owner account. */
const shopSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    status: { type: String, enum: SHOP_STATUSES, default: 'pending', index: true },
    statusNote: { type: String, trim: true, maxlength: 500, default: '' },
    tagline: { type: localizedField({ maxlength: 120 }), default: () => ({}) },
    description: { type: localizedField({ maxlength: 2000 }), default: () => ({}) },
    address: { type: localizedField({ maxlength: 200 }), default: () => ({}) },
    landmark: { type: localizedField({ maxlength: 160 }), default: () => ({}) },
    city: { type: String, enum: [...REGIONS, ''], default: 'tashkent_city' },
    mapUrl: { type: String, trim: true, maxlength: 1000, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    phone2: { type: String, trim: true, maxlength: 20, default: '' },
    telegram: { type: String, trim: true, maxlength: 40, default: '' },
    instagram: { type: String, trim: true, maxlength: 40, default: '' },
    whatsapp: { type: String, trim: true, maxlength: 20, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    website: { type: String, trim: true, maxlength: 300, default: '' },
    workingHours: { type: String, trim: true, maxlength: 40, default: '09:00–18:00' },
    workingDays: { type: String, enum: WORKING_DAYS, default: 'mon_sat' },
    deliveryAvailable: { type: Boolean, default: false },
    deliveryNote: { type: localizedField({ maxlength: 300 }), default: () => ({}) },
    paymentMethods: { type: [{ type: String, enum: PAYMENT_METHODS }], default: ['cash'] },
    foundedYear: { type: Number, min: 1900, max: 2100, default: null },
    accent: { type: String, trim: true, maxlength: 7, default: '#FF7A1A' },
    logoUrl: { type: String, trim: true, maxlength: 1000, default: '' },
    coverUrl: { type: String, trim: true, maxlength: 1000, default: '' },
    isVerified: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, versionKey: false }
);

shopSchema.index({ status: 1, isFeatured: -1 });

module.exports = mongoose.models.Shop || mongoose.model('Shop', shopSchema);

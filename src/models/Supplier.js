'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');
const { PAYMENT_METHODS, WORKING_DAYS } = require('../domain/constants');

/** A seller / stall inside the construction market. */
const supplierSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    stallNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 12 },
    description: { type: localizedField({ maxlength: 1000 }), default: () => ({}) },
    address: { type: localizedField({ maxlength: 200 }), default: () => ({}) },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    telegram: { type: String, trim: true, maxlength: 40, default: '' },
    whatsapp: { type: String, trim: true, maxlength: 20, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    workingHours: { type: String, trim: true, maxlength: 40, default: '08:00–18:00' },
    workingDays: { type: String, enum: WORKING_DAYS, default: 'mon_sat' },
    deliveryAvailable: { type: Boolean, default: false },
    deliveryNote: { type: localizedField({ maxlength: 300 }), default: () => ({}) },
    paymentMethods: { type: [{ type: String, enum: PAYMENT_METHODS }], default: ['cash'] },
    isVerified: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    logoUrl: { type: String, trim: true, maxlength: 1000, default: '' }
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);

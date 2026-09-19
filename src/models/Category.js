'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');
const { CATEGORY_ICONS } = require('../domain/constants');

const categorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100 },
    name: { type: localizedField({ required: true, maxlength: 80 }), required: true },
    description: { type: localizedField({ maxlength: 400 }), default: () => ({}) },
    icon: { type: String, enum: CATEGORY_ICONS, default: 'box' },
    sortOrder: { type: Number, default: 100, min: 0, max: 10000 },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true, versionKey: false }
);

categorySchema.index({ sortOrder: 1, 'name.uz': 1 });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);

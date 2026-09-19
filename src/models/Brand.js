'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');

const brandSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, unique: true, select: false },
    country: { type: String, trim: true, uppercase: true, maxlength: 2, default: '' },
    description: { type: localizedField({ maxlength: 400 }), default: () => ({}) },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true, versionKey: false }
);

brandSchema.pre('validate', function setNameKey(next) {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  next();
});

brandSchema.set('toJSON', {
  versionKey: false,
  transform(doc, ret) {
    delete ret.nameKey;
    return ret;
  }
});

module.exports = mongoose.models.Brand || mongoose.model('Brand', brandSchema);

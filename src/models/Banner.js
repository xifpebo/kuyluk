'use strict';

const mongoose = require('mongoose');
const { localizedField } = require('./shared');
const { BANNER_PLACEMENTS, BANNER_THEMES } = require('../domain/constants');

/** Promotional banners on the home page, managed in the admin panel. */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: localizedField({ required: true, maxlength: 120 }), required: true },
    subtitle: { type: localizedField({ maxlength: 240 }), default: () => ({}) },
    ctaLabel: { type: localizedField({ maxlength: 40 }), default: () => ({}) },
    link: { type: String, trim: true, maxlength: 500, default: '/catalog' },
    image: { type: String, trim: true, maxlength: 1000, default: '' },
    placement: { type: String, enum: BANNER_PLACEMENTS, default: 'home_promo' },
    theme: { type: String, enum: BANNER_THEMES, default: 'accent' },
    sortOrder: { type: Number, default: 100, min: 0, max: 10000 },
    isActive: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.models.Banner || mongoose.model('Banner', bannerSchema);

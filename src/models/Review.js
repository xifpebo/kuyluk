'use strict';

const mongoose = require('mongoose');
const { REVIEW_STATUSES, LANGUAGES } = require('../domain/constants');

const { ObjectId } = mongoose.Schema.Types;

/** Customer review of a product or of a shop. Published after moderation. */
const reviewSchema = new mongoose.Schema(
  {
    target: { type: String, enum: ['product', 'shop'], required: true },
    product: { type: ObjectId, ref: 'Product', default: null, index: true },
    shop: { type: ObjectId, ref: 'Shop', required: true, index: true },
    user: { type: ObjectId, ref: 'User', default: null, index: true },
    authorName: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, trim: true, maxlength: 1500, default: '' },
    lang: { type: String, enum: LANGUAGES, default: 'uz' },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending', index: true },
    moderatedBy: { type: ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

reviewSchema.index({ target: 1, product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ target: 1, shop: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);

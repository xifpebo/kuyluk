'use strict';

const mongoose = require('mongoose');

/** Fixed-window rate limit counters shared by all app instances. */
const rateLimitHitSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }
  },
  { versionKey: false }
);

rateLimitHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.RateLimitHit || mongoose.model('RateLimitHit', rateLimitHitSchema);

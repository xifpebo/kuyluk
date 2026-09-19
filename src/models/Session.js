'use strict';

const mongoose = require('mongoose');

/**
 * Server-side session. The cookie holds a random token; only its SHA-256
 * hash is stored, so a database leak does not expose live sessions.
 */
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true },
    tokenVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.Session || mongoose.model('Session', sessionSchema);

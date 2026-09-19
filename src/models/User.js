'use strict';

const mongoose = require('mongoose');
const { ROLES } = require('../security/rbac');
const { LANGUAGES } = require('../domain/constants');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    company: { type: String, trim: true, maxlength: 120, default: '' },
    role: { type: String, enum: ROLES, default: 'user', index: true },
    isActive: { type: Boolean, default: true },
    passwordHash: { type: String, required: true, select: false },
    passwordHistory: { type: [String], default: [], select: false },
    passwordChangedAt: { type: Date, default: Date.now },
    mustChangePassword: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockCount: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '' },
    tokenVersion: { type: Number, default: 0 },
    preferredLang: { type: String, enum: LANGUAGES, default: 'uz' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

userSchema.methods.isLocked = function isLocked(now = new Date()) {
  return Boolean(this.lockUntil && this.lockUntil > now);
};

/** Public-safe representation. Never includes hashes or counters. */
userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: String(this._id),
    email: this.email,
    name: this.name,
    phone: this.phone,
    company: this.company,
    role: this.role,
    isActive: this.isActive,
    mustChangePassword: this.mustChangePassword,
    preferredLang: this.preferredLang,
    locked: this.isLocked(),
    lockUntil: this.isLocked() ? this.lockUntil : null,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

userSchema.set('toJSON', {
  versionKey: false,
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.passwordHistory;
    return ret;
  }
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);

'use strict';

const mongoose = require('mongoose');

/**
 * Key/value site settings edited in the admin panel (contacts, home page
 * texts, announcement bar). Values are validated by the settings service.
 */
const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, versionKey: false, minimize: false }
);

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

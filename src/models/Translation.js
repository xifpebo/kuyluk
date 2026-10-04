'use strict';

const mongoose = require('mongoose');

/** Admin overrides of interface strings (dictionary key → { uz, ru }). */
const translationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, maxlength: 120 },
    uz: { type: String, default: '', maxlength: 2000 },
    ru: { type: String, default: '', maxlength: 2000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.models.Translation || mongoose.model('Translation', translationSchema);

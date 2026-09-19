'use strict';

const mongoose = require('mongoose');

/** Sub-schema for bilingual text. */
function localizedField({ required = false, maxlength = 200 } = {}) {
  return new mongoose.Schema(
    {
      uz: { type: String, trim: true, maxlength, default: '', required },
      ru: { type: String, trim: true, maxlength, default: '', required }
    },
    { _id: false }
  );
}

/** Remove internal fields when documents are serialised. */
function toJSONOptions(hidden = []) {
  return {
    virtuals: false,
    versionKey: false,
    transform(doc, ret) {
      for (const field of hidden) delete ret[field];
      return ret;
    }
  };
}

module.exports = { localizedField, toJSONOptions };

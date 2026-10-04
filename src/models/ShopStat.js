'use strict';

const mongoose = require('mongoose');

/** Daily counters per shop: page views, product views and contact clicks. */
const shopStatSchema = new mongoose.Schema(
  {
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    shopViews: { type: Number, default: 0 },
    productViews: { type: Number, default: 0 },
    contacts: {
      phone: { type: Number, default: 0 },
      telegram: { type: Number, default: 0 },
      instagram: { type: Number, default: 0 },
      whatsapp: { type: Number, default: 0 }
    }
  },
  { versionKey: false }
);

shopStatSchema.index({ shop: 1, day: 1 }, { unique: true });

module.exports = mongoose.models.ShopStat || mongoose.model('ShopStat', shopStatSchema);

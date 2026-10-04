'use strict';

/**
 * Enumerations shared by the models, the validators and the browser
 * (exposed through GET /api/meta). Labels live in the i18n dictionaries
 * under the same keys, e.g. `units.m2.short`, `colors.white`.
 */

const LANGUAGES = Object.freeze(['uz', 'ru']);

const UNITS = Object.freeze([
  'piece', 'set', 'm', 'm2', 'm3', 'kg', 'ton', 'sheet', 'roll', 'pack', 'bag', 'liter', 'box', 'pallet'
]);

const COLORS = Object.freeze([
  'white', 'black', 'gray', 'graphite', 'beige', 'brown', 'oak', 'walnut', 'chrome', 'silver', 'gold',
  'blue', 'green', 'red', 'yellow', 'orange', 'pink', 'terracotta', 'transparent', 'multicolor'
]);

const STOCK_STATUSES = Object.freeze(['in_stock', 'low_stock', 'on_order', 'out_of_stock']);

/** Sort rank so that items available right now come first. */
const STOCK_RANK = Object.freeze({ in_stock: 0, low_stock: 1, on_order: 2, out_of_stock: 3 });

/** Product moderation workflow: owner submits → admin approves → visible. */
const PRODUCT_STATUSES = Object.freeze(['draft', 'pending', 'approved', 'rejected']);

/** Shop workflow: application → approved (visible) / rejected; approved shops can be suspended. */
const SHOP_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'suspended']);

const REVIEW_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);

const CATEGORY_ICONS = Object.freeze([
  'bath', 'toilet', 'sink', 'shower', 'cabinet', 'faucet', 'tiles', 'door', 'paint', 'wallpaper', 'floor',
  'pipes', 'valve', 'heating', 'heater', 'electrical', 'lamp', 'cement', 'drywall', 'blocks', 'insulation',
  'tube', 'tools', 'kitchen', 'roller', 'box'
]);

const CONTACT_CHANNELS = Object.freeze(['phone', 'telegram', 'instagram', 'whatsapp']);

const REGIONS = Object.freeze([
  'tashkent_city', 'tashkent_region', 'andijan', 'bukhara', 'fergana', 'jizzakh', 'khorezm',
  'namangan', 'navoi', 'kashkadarya', 'karakalpakstan', 'samarkand', 'syrdarya', 'surkhandarya'
]);

const PAYMENT_METHODS = Object.freeze(['cash', 'card', 'transfer']);

const WORKING_DAYS = Object.freeze(['mon_fri', 'mon_sat', 'daily']);

const CURRENCIES = Object.freeze(['UZS']);

const PRODUCT_SORTS = Object.freeze(['recommended', 'popular', 'newest', 'price_asc', 'price_desc', 'discount', 'rating', 'name']);

const BANNER_PLACEMENTS = Object.freeze(['home_promo']);
const BANNER_THEMES = Object.freeze(['accent', 'dark', 'light', 'teal']);

module.exports = {
  LANGUAGES,
  UNITS,
  COLORS,
  STOCK_STATUSES,
  STOCK_RANK,
  PRODUCT_STATUSES,
  SHOP_STATUSES,
  REVIEW_STATUSES,
  CATEGORY_ICONS,
  CONTACT_CHANNELS,
  REGIONS,
  PAYMENT_METHODS,
  WORKING_DAYS,
  CURRENCIES,
  PRODUCT_SORTS,
  BANNER_PLACEMENTS,
  BANNER_THEMES
};

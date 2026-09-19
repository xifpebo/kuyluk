'use strict';

/**
 * Enumerations shared by the models, the validators and the browser
 * (exposed through GET /api/meta). Labels live in the i18n dictionaries
 * under the same keys, e.g. `units.m2.short`, `materials.cement`.
 */

const LANGUAGES = Object.freeze(['uz', 'ru']);

const UNITS = Object.freeze([
  'piece', 'bag', 'm', 'm2', 'm3', 'kg', 'ton', 'sheet', 'roll', 'pack', 'pallet', 'liter', 'set', 'box'
]);

/** Units that are commonly sold in fractional quantities. */
const FRACTIONAL_UNITS = Object.freeze(['m', 'm2', 'm3', 'kg', 'ton', 'liter']);

const MATERIALS = Object.freeze([
  'cement', 'gypsum', 'concrete', 'aerated_concrete', 'ceramic', 'wood', 'plywood', 'osb',
  'steel', 'galvanized_steel', 'pvc', 'ppr', 'hdpe', 'copper', 'mineral_wool', 'polystyrene',
  'bitumen', 'acrylic', 'composite', 'other'
]);

const STOCK_STATUSES = Object.freeze(['in_stock', 'low_stock', 'on_order', 'out_of_stock']);

/** Sort rank so that items that can ship now come first. */
const STOCK_RANK = Object.freeze({ in_stock: 0, low_stock: 1, on_order: 2, out_of_stock: 3 });

const CATEGORY_ICONS = Object.freeze([
  'cement', 'blocks', 'lumber', 'drywall', 'pipes', 'fasteners', 'rebar', 'tools',
  'roofing', 'insulation', 'paint', 'electrical', 'box'
]);

const QUOTE_STATUSES = Object.freeze(['new', 'in_progress', 'quoted', 'accepted', 'rejected', 'cancelled']);

/** Allowed status transitions for quote requests. */
const QUOTE_TRANSITIONS = Object.freeze({
  new: ['in_progress', 'quoted', 'rejected', 'cancelled'],
  in_progress: ['quoted', 'rejected', 'cancelled'],
  quoted: ['accepted', 'rejected', 'in_progress', 'cancelled'],
  accepted: ['in_progress'],
  rejected: ['in_progress'],
  cancelled: ['in_progress']
});

const DELIVERY_METHODS = Object.freeze(['delivery', 'pickup']);

const CONTACT_METHODS = Object.freeze(['phone', 'telegram', 'whatsapp', 'email']);

const REGIONS = Object.freeze([
  'tashkent_city', 'tashkent_region', 'andijan', 'bukhara', 'fergana', 'jizzakh', 'khorezm',
  'namangan', 'navoi', 'kashkadarya', 'karakalpakstan', 'samarkand', 'syrdarya', 'surkhandarya'
]);

const PAYMENT_METHODS = Object.freeze(['cash', 'card', 'transfer']);

const WORKING_DAYS = Object.freeze(['mon_fri', 'mon_sat', 'daily']);

const CURRENCIES = Object.freeze(['UZS']);

const PRODUCT_SORTS = Object.freeze(['recommended', 'newest', 'price_asc', 'price_desc', 'name']);

module.exports = {
  LANGUAGES,
  UNITS,
  FRACTIONAL_UNITS,
  MATERIALS,
  STOCK_STATUSES,
  STOCK_RANK,
  CATEGORY_ICONS,
  QUOTE_STATUSES,
  QUOTE_TRANSITIONS,
  DELIVERY_METHODS,
  CONTACT_METHODS,
  REGIONS,
  PAYMENT_METHODS,
  WORKING_DAYS,
  CURRENCIES,
  PRODUCT_SORTS
};

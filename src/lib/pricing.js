'use strict';

const EPSILON = 1e-9;

function roundQty(qty) {
  return Math.round(Number(qty) * 1000) / 1000;
}

/** Unit price for a quantity, applying the best matching bulk tier. */
function unitPriceFor(product, qty) {
  let price = product.price;
  const tiers = Array.isArray(product.priceTiers) ? product.priceTiers : [];
  for (const tier of tiers) {
    if (qty + EPSILON >= tier.minQty && tier.price < price) price = tier.price;
  }
  return price;
}

function lineTotal(product, qty) {
  return Math.round(unitPriceFor(product, qty) * qty);
}

/**
 * Check a requested quantity against the product's minimum order and
 * ordering step. Returns null when valid or an issue `{ code, params }`.
 */
function checkQuantity(product, qty) {
  const minQty = product.minOrderQty || 1;
  const step = product.orderStep || 1;
  if (!Number.isFinite(qty) || qty <= 0) return { code: 'qty_invalid', params: {} };
  if (qty + EPSILON < minQty) return { code: 'qty_below_min', params: { min: minQty } };
  const steps = qty / step;
  if (Math.abs(steps - Math.round(steps)) > 1e-6) return { code: 'qty_step', params: { step } };
  if (qty > 1_000_000) return { code: 'qty_too_large', params: { max: 1_000_000 } };
  return null;
}

/** Normalise tiers: sorted by quantity, unique quantities, cheaper than base. */
function normalizeTiers(tiers, basePrice) {
  const seen = new Set();
  return [...(tiers || [])]
    .filter((tier) => tier && tier.minQty > 1 && tier.price >= 0 && tier.price <= basePrice)
    .sort((a, b) => a.minQty - b.minQty)
    .filter((tier) => {
      if (seen.has(tier.minQty)) return false;
      seen.add(tier.minQty);
      return true;
    });
}

module.exports = { roundQty, unitPriceFor, lineTotal, checkQuantity, normalizeTiers };

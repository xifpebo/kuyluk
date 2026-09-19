/**
 * Construction-specific formatting and pricing helpers (mirror of the
 * server's pricing rules — the server remains authoritative).
 */
import { t, fmtNumber, fmtMoney, unitShort, loc } from './i18n.js';

const EPSILON = 1e-9;

export function unitPriceFor(product, qty) {
  let price = product.price;
  for (const tier of product.priceTiers || []) {
    if (qty + EPSILON >= tier.minQty && tier.price < price) price = tier.price;
  }
  return price;
}

export function lineTotal(product, qty) {
  return Math.round(unitPriceFor(product, qty) * qty);
}

export function minQty(product) {
  return product.minOrderQty || 1;
}

export function stepOf(product) {
  return product.orderStep || 1;
}

const decimals = (value) => {
  const text = String(value);
  return text.includes('.') ? text.split('.')[1].length : 0;
};

/** Snap a quantity to the product's step and minimum. */
export function normalizeQty(product, qty) {
  const step = stepOf(product);
  const min = minQty(product);
  if (!Number.isFinite(qty) || qty <= 0) return min;
  const places = Math.max(decimals(step), decimals(min), 0);
  let snapped = Math.round(qty / step) * step;
  if (snapped + EPSILON < min) snapped = Math.ceil(min / step) * step;
  return Number(snapped.toFixed(Math.min(places, 3)));
}

export function checkQty(product, qty) {
  const min = minQty(product);
  const step = stepOf(product);
  if (!Number.isFinite(qty) || qty <= 0) return t('validation.qty_invalid');
  if (qty + EPSILON < min) return t('validation.qty_below_min', { min: fmtNumber(min) });
  const steps = qty / step;
  if (Math.abs(steps - Math.round(steps)) > 1e-6) return t('validation.qty_step', { step: fmtNumber(step) });
  if (qty > 1e6) return t('validation.qty_too_large');
  return null;
}

export function qtyLabel(product, qty) {
  return `${fmtNumber(qty)} ${unitShort(product.unit)}`;
}

export function stockInfo(status) {
  const map = {
    in_stock: 'ok',
    low_stock: 'warn',
    on_order: 'info',
    out_of_stock: 'danger'
  };
  return { tone: map[status] || 'muted', label: t(`stock.${status}`) };
}

function mm(value) {
  return fmtNumber(value);
}

/** Human dimension summary, e.g. "2500×1200×12,5 mm" or "Ø20×3,4 mm". */
export function dimensionSummary(dimensions = {}) {
  const { lengthMm: l, widthMm: w, heightMm: h, thicknessMm: th, diameterMm: d } = dimensions;
  const unit = t('common.mm');
  if (d) {
    const parts = [`Ø${mm(d)}`];
    if (th) parts.push(mm(th));
    const out = `${parts.join('×')} ${unit}`;
    return l && l >= 1000 ? `${out} · ${fmtNumber(l / 1000)} m` : out;
  }
  const parts = [l, w, h, th].filter((v) => typeof v === 'number' && v > 0).map(mm);
  return parts.length ? `${parts.join('×')} ${unit}` : '';
}

export function weightLabel(kg) {
  if (!kg) return '';
  if (kg >= 1000) return `${fmtNumber(kg / 1000)} ${t('common.tonShort')}`;
  return `${fmtNumber(kg)} ${t('common.kg')}`;
}

/** Short spec chips for cards. */
export function keyChips(product) {
  const chips = [];
  if (product.grade) chips.push(product.grade);
  const dims = dimensionSummary(product.dimensions);
  if (dims) chips.push(dims);
  if (product.weightKg && !['m3', 'ton'].includes(product.unit)) chips.push(weightLabel(product.weightKg));
  return chips.slice(0, 3);
}

/** The best (largest) tier, used for "from N: price" hints. */
export function bestTier(product) {
  const tiers = product.priceTiers || [];
  return tiers.length ? tiers[tiers.length - 1] : null;
}

export function tierHint(product) {
  const tier = bestTier(product);
  if (!tier) return '';
  return `${t('product.tierOpen', { from: fmtNumber(tier.minQty), unit: unitShort(product.unit) })}: ${fmtMoney(tier.price)}`;
}

/** Rows for the tier table: [{ from, to, price, saving }]. */
export function tierRows(product) {
  const tiers = product.priceTiers || [];
  const rows = [];
  const first = { from: minQty(product), price: product.price };
  const all = [first, ...tiers.map((tier) => ({ from: tier.minQty, price: tier.price }))];
  all.forEach((row, index) => {
    const next = all[index + 1];
    rows.push({
      from: row.from,
      to: next ? next.from - stepOf(product) : null,
      price: row.price,
      saving: product.price > 0 ? Math.round((1 - row.price / product.price) * 100) : 0
    });
  });
  return rows;
}

export function productName(product) {
  return loc(product.name);
}

export function productUrl(product) {
  return `/product/${encodeURIComponent(product.slug)}`;
}

export function supplierUrl(supplier) {
  return `/supplier/${encodeURIComponent(supplier.slug)}`;
}

export function categoryUrl(category) {
  return `/catalog?category=${encodeURIComponent(category.slug)}`;
}

export const PLACEHOLDER_IMAGE = '/img/catalog/placeholder.svg';

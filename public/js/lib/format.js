/**
 * Catalog formatting helpers shared by the storefront pages.
 */
import { t, fmtMoney, unitShort, loc, fmtNumber } from './i18n.js';
import { html, icon } from './dom.js';

export function stockInfo(status) {
  const map = { in_stock: 'ok', low_stock: 'warn', on_order: 'info', out_of_stock: 'danger' };
  return { tone: map[status] || 'muted', label: t(`stock.${status}`) };
}

export function productUrl(product) {
  return `/product/${encodeURIComponent(product.slug)}`;
}

export function shopUrl(shop) {
  return `/shop/${encodeURIComponent(shop.slug)}`;
}

export function categoryUrl(category) {
  return `/catalog?category=${encodeURIComponent(category.slug)}`;
}

export function priceLabel(product) {
  const unit = product.unit && product.unit !== 'piece' ? ` / ${unitShort(product.unit)}` : '';
  return `${fmtMoney(product.price)}${unit}`;
}

export function colorName(key) {
  return t(`colors.${key}`);
}

export function swatch(key) {
  return html`<span class="swatch swatch--${key}" title="${colorName(key)}"></span>`;
}

/** Shop accent colours are applied through the CSSOM (inline style attributes are blocked by the CSP). */
export function applyAccents(root = document) {
  root.querySelectorAll('[data-accent]').forEach((element) => {
    const value = element.dataset.accent;
    if (/^#[0-9a-f]{6}$/i.test(value)) element.style.setProperty('--shop-accent', value);
  });
}

/** Five-star rating (display only). */
export function stars(rating = 0, { count = null, compact = false } = {}) {
  const value = Math.round((Number(rating) || 0) * 2) / 2;
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const items = [];
  for (let i = 0; i < 5; i += 1) {
    const kind = i < full ? 'full' : i === full && half ? 'half' : 'empty';
    items.push(html`<span class="stars__star stars__star--${kind}">${icon('star-fill')}</span>`);
  }
  const label = count !== null ? t('reviews.ratingAria', { rating: fmtNumber(value), count }) : t('reviews.ratingOnly', { rating: fmtNumber(value) });
  return html`<span class="stars ${compact ? 'stars--compact' : ''}" role="img" aria-label="${label}">
    <span class="stars__row" aria-hidden="true">${items}</span>
    ${count !== null ? html`<span class="stars__text" aria-hidden="true">${value ? fmtNumber(value) : '—'}${count ? html` <span class="stars__count">(${count})</span>` : ''}</span>` : ''}
  </span>`;
}

export function productName(product) {
  return loc(product.name);
}

export const PLACEHOLDER_IMAGE = '/img/placeholder.svg';

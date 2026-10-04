import { html, icon, safeUrl } from './dom.js';
import { t, fmtMoney, unitShort, loc } from './i18n.js';
import { stockInfo, productUrl, shopUrl, stars, swatch, PLACEHOLDER_IMAGE } from './format.js';
import { has as isFavorite } from './favorites.js';
import { badge } from './ui.js';

export function favButton(product, { large = false } = {}) {
  const active = isFavorite(product.id);
  return html`<button class="fav-btn ${large ? 'fav-btn--lg' : ''} ${active ? 'is-active' : ''}" type="button" data-fav="${product.id}"
    aria-pressed="${active ? 'true' : 'false'}" aria-label="${active ? t('favorites.remove') : t('favorites.add')}: ${loc(product.name)}"
    title="${active ? t('favorites.remove') : t('favorites.add')}">${icon(active ? 'heart-fill' : 'heart')}${large ? html`<span>${active ? t('favorites.saved') : t('favorites.add')}</span>` : ''}</button>`;
}

/** Products rendered on the page, so card buttons can open the contact sheet without a request. */
export const registry = new Map();

export function productCard(product, { compact = false } = {}) {
  registry.set(product.id, product);
  const name = loc(product.name);
  const stock = stockInfo(product.stock?.status);
  const url = productUrl(product);
  const unit = product.unit && product.unit !== 'piece' ? html`<span class="price__unit">/ ${unitShort(product.unit)}</span>` : '';
  return html`<article class="product-card ${compact ? 'product-card--compact' : ''}" data-product-id="${product.id}">
    <a class="product-card__media" href="${url}" tabindex="-1" aria-hidden="true">
      <img src="${safeUrl(product.image || PLACEHOLDER_IMAGE)}" alt="" loading="lazy" decoding="async" width="400" height="400">
    </a>
    <span class="product-card__badges">
      ${product.discountPercent ? html`<span class="badge badge--sale">−${product.discountPercent}%</span>` : ''}
      ${product.isFeatured ? html`<span class="badge badge--hazard">${icon('fire')}${t('catalog.hit')}</span>` : ''}
    </span>
    ${favButton(product)}
    <div class="product-card__body">
      <p class="product-card__meta">
        <span class="product-card__brand">${product.brand?.name || loc(product.category?.name)}</span>
        ${badge(stock.label, stock.tone, { dot: true })}
      </p>
      <h3 class="product-card__title"><a href="${url}">${name}</a></h3>
      <div class="product-card__rating">
        ${product.reviewCount ? stars(product.rating, { count: product.reviewCount, compact: true }) : html`<span class="muted small">${t('reviews.noReviewsShort')}</span>`}
        ${product.colors?.length ? html`<span class="swatches">${product.colors.slice(0, 4).map(swatch)}</span>` : ''}
      </div>
      <p class="price">
        <span class="price__value">${fmtMoney(product.price)}</span>${unit}
        ${product.oldPrice ? html`<span class="price__old">${fmtMoney(product.oldPrice)}</span>` : ''}
      </p>
      ${product.shop
        ? html`<div class="product-card__foot">
            <a class="product-card__shop" href="${shopUrl(product.shop)}">
              <img src="${safeUrl(product.shop.logoUrl || '/img/logo-mark.svg')}" alt="" width="22" height="22" loading="lazy">
              <span>${product.shop.name}</span>${product.shop.isVerified ? icon('badge-check', 'verified-icon') : ''}
            </a>
            <button class="btn btn-sm btn-accent contact-cta" type="button" data-contact-product="${product.id}" aria-label="${t('contact.cta')}: ${name}">
              ${icon('phone')}<span>${t('contact.ctaShort')}</span>
            </button>
          </div>`
        : ''}
    </div>
  </article>`;
}

export function productGrid(products, opts) {
  return html`${products.map((p) => productCard(p, opts))}`;
}

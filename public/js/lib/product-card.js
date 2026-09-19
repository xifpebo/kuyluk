import { html, icon, safeUrl } from './dom.js';
import { t, fmtMoney, unitShort, loc } from './i18n.js';
import { keyChips, stockInfo, tierHint, productUrl, PLACEHOLDER_IMAGE } from './format.js';
import { getQty } from './cart.js';
import { badge } from './ui.js';

export function addButtonContent(product, qty = getQty(product.id)) {
  return qty > 0
    ? html`${icon('check')}<span>${t('product.inQuote', { qty: `${qty} ${unitShort(product.unit)}` })}</span>`
    : html`${icon('plus')}<span>${t('product.addShort')}</span>`;
}

export function productCard(product) {
  const name = loc(product.name);
  const stock = stockInfo(product.stock?.status);
  const inCart = getQty(product.id) > 0;
  const url = productUrl(product);
  return html`<article class="product-card" data-product-id="${product.id}">
    <a class="product-card__media" href="${url}" tabindex="-1" aria-hidden="true">
      <img src="${safeUrl(product.image || PLACEHOLDER_IMAGE)}" alt="" loading="lazy" decoding="async" width="400" height="300">
      <span class="product-card__badges">
        ${badge(stock.label, stock.tone, { dot: true })}
        ${product.hasBulkPricing ? html`<span class="badge badge--hazard">${icon('tag')}${t('catalog.bulkBadge')}</span>` : ''}
      </span>
    </a>
    <div class="product-card__body">
      <p class="product-card__meta">
        <span class="product-card__brand">${product.brand?.name || loc(product.category?.name)}</span>
        <span>${product.sku}</span>
      </p>
      <h3 class="product-card__title"><a href="${url}">${name}</a></h3>
      <div class="product-card__specs">${keyChips(product).map((chip) => html`<span class="spec-chip">${chip}</span>`)}</div>
      <div>
        <p class="price">
          <span class="price__value">${fmtMoney(product.price)}</span>
          <span class="price__unit">/ ${unitShort(product.unit)}</span>
          ${product.oldPrice ? html`<span class="price__old">${fmtMoney(product.oldPrice)}</span>` : ''}
        </p>
        ${product.hasBulkPricing ? html`<p class="tier-hint">${icon('tag')}${tierHint(product)}</p>` : ''}
      </div>
      <div class="product-card__foot">
        <span class="product-card__supplier">
          ${product.supplier ? html`<span class="stall">${product.supplier.stallNumber}</span><span>${product.supplier.name}</span>` : ''}
        </span>
        <button class="btn btn-sm ${inCart ? 'btn-ghost is-added' : 'btn-accent'} add-btn" type="button"
          data-add="${product.id}" data-min="${product.minOrderQty || 1}" data-name="${name}" data-unit="${product.unit}"
          aria-label="${t('product.addToQuote')}: ${name}">${addButtonContent(product)}</button>
      </div>
    </div>
  </article>`;
}

export function productGrid(products) {
  return html`${products.map(productCard)}`;
}

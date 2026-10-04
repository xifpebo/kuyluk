import { html, icon, safeUrl, formatPhone, telHref } from './dom.js';
import { t, tn, loc } from './i18n.js';
import { shopUrl, stars, categoryUrl } from './format.js';

export function workingTime(shop) {
  const days = t(`shops.workingDays.${shop.workingDays || 'mon_sat'}`);
  return shop.workingHours ? `${days}, ${shop.workingHours}` : days;
}

export function shopCard(shop) {
  const tagline = loc(shop.tagline) || loc(shop.description);
  return html`<article class="shop-card" data-accent="${shop.accent || ''}">
    <a class="shop-card__cover" href="${shopUrl(shop)}" tabindex="-1" aria-hidden="true">
      ${shop.coverUrl ? html`<img src="${safeUrl(shop.coverUrl)}" alt="" loading="lazy" width="640" height="256">` : ''}
    </a>
    <div class="shop-card__body">
      <div class="shop-card__head">
        <img class="shop-card__logo" src="${safeUrl(shop.logoUrl || '/img/logo-mark.svg')}" alt="" width="56" height="56" loading="lazy">
        <div class="shop-card__titles">
          <h3 class="shop-card__name"><a href="${shopUrl(shop)}">${shop.name}</a>${shop.isVerified ? html`<span class="verified" title="${t('common.verified')}">${icon('badge-check')}</span>` : ''}</h3>
          ${shop.reviewCount ? stars(shop.rating, { count: shop.reviewCount, compact: true }) : html`<span class="muted small">${t('reviews.noReviewsShort')}</span>`}
        </div>
      </div>
      ${tagline ? html`<p class="shop-card__desc">${tagline}</p>` : ''}
      ${shop.categories?.length
        ? html`<div class="chip-row">${shop.categories.slice(0, 4).map((c) => html`<a class="term-chip term-chip--sm" href="${categoryUrl(c)}">${loc(c.name)}</a>`)}</div>`
        : ''}
      <ul class="meta-list">
        ${loc(shop.address) ? html`<li>${icon('pin')}<span>${loc(shop.address)}</span></li>` : ''}
        <li>${icon('clock')}<span>${workingTime(shop)}</span></li>
        <li>${icon('truck')}<span>${shop.deliveryAvailable ? t('shops.deliveryYes') : t('shops.deliveryNo')}</span></li>
      </ul>
      <div class="shop-card__foot">
        <span class="shop-card__count">${typeof shop.productCount === 'number' ? tn('common.products', shop.productCount) : ''}</span>
        <div class="shop-card__actions">
          ${shop.phone ? html`<a class="btn btn-icon btn-ghost btn-sm" href="${telHref(shop.phone)}" data-channel="phone" data-shop="${shop.slug}" aria-label="${t('contact.call')} ${formatPhone(shop.phone)}">${icon('phone')}</a>` : ''}
          ${shop.telegram ? html`<a class="btn btn-icon btn-ghost btn-sm" href="https://t.me/${shop.telegram}" target="_blank" rel="noopener noreferrer" data-channel="telegram" data-shop="${shop.slug}" aria-label="Telegram @${shop.telegram}">${icon('telegram')}</a>` : ''}
          <a class="btn btn-sm btn-accent" href="${shopUrl(shop)}">${t('shops.view')}${icon('arrow-right')}</a>
        </div>
      </div>
    </div>
  </article>`;
}

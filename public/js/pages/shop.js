/**
 * Shop page: who they are, what they sell, where they are and — above
 * all — how to contact them.
 */
import { $, html, setHTML, icon, on, readBoot, safeUrl } from '../lib/dom.js';
import { t, tn, loc, fmtDate, fmtNumber } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { productGrid } from '../lib/product-card.js';
import { workingTime } from '../lib/shop-card.js';
import { contactButtons, openContactSheet, trackView } from '../lib/contact.js';
import { emptyState, errorState, skeletonCards } from '../lib/ui.js';
import { stars, applyAccents } from '../lib/format.js';

let shop = null;
let filter = { sort: 'recommended', category: '' };

function hero(s) {
  $('[data-shop-hero]').dataset.accent = s.accent || '';
  const cover = $('[data-shop-cover]');
  if (s.coverUrl) setHTML(cover, html`<img src="${safeUrl(s.coverUrl)}" alt="" width="1600" height="640">`);
  $('[data-crumb-current]').textContent = s.name;
  const card = $('[data-shop-card]');
  setHTML(
    card,
    html`<img class="shop-hero__logo" src="${safeUrl(s.logoUrl || '/img/logo-mark.svg')}" alt="${s.name}" width="96" height="96">
      <div class="shop-hero__info">
        <div class="shop-hero__badges">
          ${s.isVerified ? html`<span class="badge badge--ok">${icon('badge-check')}${t('common.verified')}</span>` : ''}
          ${s.isDemo ? html`<span class="badge badge--muted" title="${t('shops.demoHint')}">${t('shops.demo')}</span>` : ''}
          ${s.foundedYear ? html`<span class="badge badge--muted">${t('shops.since', { year: s.foundedYear })}</span>` : ''}
        </div>
        <h1 class="shop-hero__name display">${s.name}</h1>
        ${loc(s.tagline) ? html`<p class="shop-hero__tagline">${loc(s.tagline)}</p>` : ''}
        <p class="shop-hero__meta">
          ${s.reviewCount ? html`<a href="#shop-reviews">${stars(s.rating, { count: s.reviewCount })}</a>` : ''}
          <span>${icon('package')}${tn('common.products', s.productCount)}</span>
          ${loc(s.address) ? html`<span>${icon('pin')}${loc(s.address)}</span>` : ''}
        </p>
      </div>
      <div class="shop-hero__cta">
        <button class="btn btn-accent btn-lg" type="button" data-open-contact>${icon('phone')}${t('contact.ctaShop')}</button>
        ${contactButtons(s, null, { variant: 'icons' })}
      </div>`
  );
  $('[data-shop-hero]').removeAttribute('aria-busy');
}

function side(s, reviews) {
  setHTML(
    $('[data-shop-side]'),
    html`<section class="content-block shop-contacts" aria-labelledby="shop-contacts-title">
        <h2 class="content-block__title" id="shop-contacts-title">${t('shops.contacts')}</h2>
        ${contactButtons(s)}
        <ul class="meta-list">
          ${loc(s.address) ? html`<li>${icon('pin')}<span>${loc(s.address)}${loc(s.landmark) ? html`<small>${loc(s.landmark)}</small>` : ''}</span></li>` : ''}
          <li>${icon('clock')}<span>${workingTime(s)}</span></li>
          <li>${icon('truck')}<span>${s.deliveryAvailable ? loc(s.deliveryNote) || t('shops.deliveryYes') : loc(s.deliveryNote) || t('shops.deliveryNo')}</span></li>
          ${s.paymentMethods?.length ? html`<li>${icon('tag')}<span>${s.paymentMethods.map((m) => t(`shops.paymentMethods.${m}`)).join(' · ')}</span></li>` : ''}
          ${s.email ? html`<li>${icon('mail')}<a href="mailto:${s.email}">${s.email}</a></li>` : ''}
          ${s.mapUrl ? html`<li>${icon('external')}<a href="${safeUrl(s.mapUrl)}" target="_blank" rel="noopener noreferrer">${t('shops.openMap')}</a></li>` : ''}
        </ul>
      </section>
      ${loc(s.description) ? html`<section class="content-block"><h2 class="content-block__title">${t('shops.about')}</h2><div class="prose"><p>${loc(s.description)}</p></div></section>` : ''}
      <section class="content-block" id="shop-reviews" aria-labelledby="shop-reviews-title">
        <h2 class="content-block__title" id="shop-reviews-title">${t('reviews.shopTitle')} <span class="muted">${reviews.total || ''}</span></h2>
        ${reviews.items.length
          ? html`<ul class="review-list">${reviews.items.map(
              (r) => html`<li class="review"><div class="review__head"><span class="review__avatar" aria-hidden="true">${r.authorName.slice(0, 1)}</span>
                <div><p class="review__author">${r.authorName}</p><p class="review__date">${fmtDate(r.createdAt)}</p></div>${stars(r.rating)}</div>
                ${r.text ? html`<p class="review__text" lang="${r.lang}">${r.text}</p>` : ''}</li>`
            )}</ul>`
          : html`<p class="muted">${t('reviews.empty')}</p>`}
      </section>`
  );
}

function categoryChips(s) {
  const holder = $('[data-shop-cats]');
  if (!s.categories?.length) return;
  setHTML(
    holder,
    html`<button class="chip ${!filter.category ? 'is-active' : ''}" type="button" data-cat="">${t('catalog.allCategories')} <span class="muted">${fmtNumber(s.productCount)}</span></button>
      ${s.categories.map(
        (c) => html`<button class="chip ${filter.category === c.slug ? 'is-active' : ''}" type="button" data-cat="${c.slug}">${loc(c.name)} <span class="muted">${c.count}</span></button>`
      )}`
  );
}

async function loadProducts() {
  const grid = $('[data-shop-products]');
  grid.setAttribute('aria-busy', 'true');
  const params = new URLSearchParams({ sort: filter.sort });
  if (filter.category) params.set('category', filter.category);
  try {
    const data = await api(`/api/catalog/shops/${encodeURIComponent(shop.slug)}?${params}`);
    setHTML(grid, data.products.length ? productGrid(data.products) : emptyState({ iconName: 'package', title: t('shops.noProducts') }));
    categoryChips(data.shop);
  } catch {
    setHTML(grid, errorState(t('common.errorGeneric')));
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

export default async function shopPage() {
  const { slug } = readBoot();
  setHTML($('[data-shop-products]'), skeletonCards(6));
  try {
    const data = await api(`/api/catalog/shops/${encodeURIComponent(slug)}`);
    shop = data.shop;
    hero(shop);
    side(shop, data.reviews);
    setHTML($('[data-shop-products]'), data.products.length ? productGrid(data.products) : emptyState({ iconName: 'package', title: t('shops.noProducts') }));
    $('[data-shop-products]').removeAttribute('aria-busy');
    categoryChips(shop);
    applyAccents(document);
    const bar = $('[data-buy-bar]');
    setHTML(bar, html`<div class="buy-bar__price"><span class="buy-bar__title">${shop.name}</span><span class="buy-bar__shop">${workingTime(shop)}</span></div>
      <button class="btn btn-accent" type="button" data-open-contact>${icon('phone')}${t('contact.ctaShort')}</button>`);
    bar.hidden = false;
    document.body.classList.add('has-buy-bar');
    on(document, 'click', '[data-open-contact]', () => openContactSheet(shop));
    on($('[data-shop-cats]'), 'click', '[data-cat]', (event, button) => {
      filter = { ...filter, category: button.dataset.cat };
      loadProducts();
    });
    $('[data-shop-sort]').addEventListener('change', (event) => {
      filter = { ...filter, sort: event.target.value };
      loadProducts();
    });
    trackView({ type: 'shop_view', shop: shop.slug });
  } catch (error) {
    setHTML($('[data-shop-card]'), emptyState({ iconName: 'alert', title: error.status === 404 ? t('notFound.title') : t('common.errorGeneric'), action: { href: '/shops', label: t('shops.title') } }));
  }
}

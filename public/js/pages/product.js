/**
 * Product page: gallery, price and availability, the shop selling it with
 * prominent contact buttons, specifications, reviews and related products.
 * There is no cart — customers contact the shop directly.
 */
import { $, $$, html, setHTML, icon, on, readBoot, safeUrl } from '../lib/dom.js';
import { t, tn, loc, fmtMoney, fmtNumber, unitShort, unitName, fmtDate } from '../lib/i18n.js';
import { api, getSession } from '../lib/api.js';
import { productGrid, favButton, registry } from '../lib/product-card.js';
import { workingTime } from '../lib/shop-card.js';
import { contactButtons, openContactSheet, trackView } from '../lib/contact.js';
import { badge, emptyState, toast, setBusy } from '../lib/ui.js';
import { showErrors, clearErrors } from '../lib/forms.js';
import * as recent from '../lib/recent.js';
import { stockInfo, categoryUrl, shopUrl, stars, swatch, colorName, applyAccents, PLACEHOLDER_IMAGE } from '../lib/format.js';

let product = null;

function gallery(p) {
  const images = p.images?.length ? p.images : [PLACEHOLDER_IMAGE];
  const name = loc(p.name);
  return html`<div class="product__gallery gallery">
    <div class="gallery__main">
      <img src="${safeUrl(images[0])}" alt="${t('product.imageAlt', { name, n: 1 })}" data-main-image width="900" height="900">
      <div class="gallery__corner">
        ${p.discountPercent ? html`<span class="badge badge--sale">−${p.discountPercent}%</span>` : ''}
        ${p.isFeatured ? html`<span class="badge badge--hazard">${icon('fire')}${t('catalog.hit')}</span>` : ''}
      </div>
    </div>
    ${images.length > 1
      ? html`<div class="gallery__thumbs" role="group" aria-label="${t('product.gallery')}">
          ${images.map(
            (src, index) => html`<button class="gallery__thumb" type="button" data-thumb="${safeUrl(src)}" data-index="${index + 1}"
              aria-pressed="${index === 0}" aria-label="${t('product.imageAlt', { name, n: index + 1 })}">
              <img src="${safeUrl(src)}" alt="" loading="lazy"></button>`
          )}
        </div>`
      : ''}
  </div>`;
}

function keySpecs(p) {
  const rows = [
    [t('product.brand'), p.brand?.name],
    [t('product.category'), loc(p.category?.name)],
    [t('product.unit'), unitName(p.unit)],
    [t('product.colors'), p.colors?.length ? html`<span class="swatches swatches--labels">${p.colors.map((c) => html`<span class="swatch-label">${swatch(c)}${colorName(c)}</span>`)}</span>` : ''],
    [t('product.sizes'), p.sizes?.length ? p.sizes.join(' · ') : '']
  ].filter(([, value]) => value);
  return html`<dl class="keyspecs">${rows.map(([label, value]) => html`<div class="keyspec"><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>`;
}

function availabilityLine(p) {
  const stock = stockInfo(p.stock.status);
  const parts = [badge(stock.label, stock.tone, { dot: true })];
  if (typeof p.stock.quantity === 'number' && p.stock.quantity > 0 && p.stock.status !== 'out_of_stock') {
    parts.push(html`<span>${icon('package')}${t('product.stockQty', { qty: `${fmtNumber(p.stock.quantity)} ${unitShort(p.unit)}` })}</span>`);
  }
  if (p.stock.status === 'on_order' && p.leadTimeDays) {
    parts.push(html`<span>${icon('clock')}${t('product.leadTime')}: ${tn('common.days', p.leadTimeDays)}</span>`);
  }
  if (p.shop?.deliveryAvailable) parts.push(html`<span>${icon('truck')}${t('shops.deliveryYes')}</span>`);
  return html`<p class="stock-line">${parts}</p>`;
}

/** The decisive block: price → shop → contact. */
function offerBox(p) {
  const shop = p.shop;
  const unit = p.unit !== 'piece' ? html`<span class="price__unit">/ ${unitShort(p.unit)}</span>` : '';
  return html`<section class="offer-box" aria-label="${t('product.offer')}" data-accent="${shop.accent || ''}">
    <div class="offer-box__price">
      <p class="price">
        <span class="price__value">${fmtMoney(p.price)}</span>${unit}
        ${p.oldPrice ? html`<span class="price__old">${fmtMoney(p.oldPrice)}</span>` : ''}
      </p>
      ${p.oldPrice ? html`<p class="offer-box__saving">${t('product.saving', { amount: fmtMoney(p.oldPrice - p.price), pct: p.discountPercent })}</p>` : ''}
      ${availabilityLine(p)}
    </div>
    <div class="offer-box__shop">
      <p class="offer-box__label">${t('product.availableAt')}</p>
      <a class="shop-line" href="${shopUrl(shop)}">
        <img class="shop-line__logo" src="${safeUrl(shop.logoUrl || '/img/logo-mark.svg')}" alt="" width="48" height="48">
        <span class="shop-line__text">
          <span class="shop-line__name">${shop.name}${shop.isVerified ? html`<span class="verified" title="${t('common.verified')}">${icon('badge-check')}</span>` : ''}</span>
          <span class="shop-line__meta">${shop.reviewCount ? stars(shop.rating, { count: shop.reviewCount, compact: true }) : ''}<span>${icon('clock')}${workingTime(shop)}</span></span>
        </span>
        ${icon('chevron-right')}
      </a>
    </div>
    <button class="btn btn-accent btn-lg btn-block offer-box__cta" type="button" data-open-contact>
      ${icon('phone')}<span>${t('contact.cta')}</span>
    </button>
    ${contactButtons(shop, p, { variant: 'grid' })}
    <div class="offer-box__actions">
      ${favButton(p, { large: true })}
      <button class="btn btn-ghost" type="button" data-share>${icon('share')}<span>${t('product.share')}</span></button>
    </div>
    <p class="offer-box__note">${icon('info')}${t('product.offerNote')}</p>
  </section>`;
}

function specsTable(p) {
  const rows = [[t('product.sku'), p.sku], ...(p.specs || []).map((spec) => [loc(spec.label), loc(spec.value)])];
  return html`<table class="spec-table"><tbody>${rows.map(([label, value]) => html`<tr><th scope="row">${label}</th><td>${value}</td></tr>`)}</tbody></table>`;
}

function shopPanel(shop) {
  return html`<section class="content-block shop-panel" data-accent="${shop.accent || ''}" aria-labelledby="shop-panel-title">
    <h2 class="content-block__title" id="shop-panel-title">${t('product.aboutShop')}</h2>
    <div class="shop-panel__head">
      <img src="${safeUrl(shop.logoUrl || '/img/logo-mark.svg')}" alt="" width="64" height="64">
      <div>
        <p class="shop-panel__name"><a href="${shopUrl(shop)}">${shop.name}</a>${shop.isVerified ? html`<span class="verified">${icon('badge-check')}${t('common.verified')}</span>` : ''}</p>
        ${shop.reviewCount ? stars(shop.rating, { count: shop.reviewCount }) : ''}
      </div>
    </div>
    ${loc(shop.tagline) ? html`<p class="shop-panel__tag">${loc(shop.tagline)}</p>` : ''}
    <ul class="meta-list">
      ${loc(shop.address) ? html`<li>${icon('pin')}<span>${loc(shop.address)}${loc(shop.landmark) ? html`<small>${loc(shop.landmark)}</small>` : ''}</span></li>` : ''}
      <li>${icon('clock')}<span>${workingTime(shop)}</span></li>
      <li>${icon('truck')}<span>${shop.deliveryAvailable ? loc(shop.deliveryNote) || t('shops.deliveryYes') : t('shops.deliveryNo')}</span></li>
      ${shop.paymentMethods?.length ? html`<li>${icon('tag')}<span>${shop.paymentMethods.map((m) => t(`shops.paymentMethods.${m}`)).join(' · ')}</span></li>` : ''}
    </ul>
    <a class="btn btn-ghost btn-block" href="${shopUrl(shop)}">${t('product.allShopProducts')}${icon('arrow-right')}</a>
  </section>`;
}

function reviewItem(r) {
  return html`<li class="review">
    <div class="review__head">
      <span class="review__avatar" aria-hidden="true">${(r.authorName || '?').slice(0, 1)}</span>
      <div><p class="review__author">${r.authorName}</p><p class="review__date">${fmtDate(r.createdAt)}</p></div>
      ${stars(r.rating)}
    </div>
    ${r.text ? html`<p class="review__text" lang="${r.lang}">${r.text}</p>` : ''}
  </li>`;
}

function reviewSummary(data, rating, count) {
  const total = count || 0;
  return html`<div class="review-summary">
    <div class="review-summary__score"><span class="review-summary__value">${rating ? fmtNumber(rating) : '—'}</span>${stars(rating)}<span class="muted">${tn('reviews.count', total)}</span></div>
    <ul class="review-bars">
      ${[5, 4, 3, 2, 1].map((n) => {
        const value = data.distribution?.[n] || 0;
        const pct = total ? Math.round((value / total) * 100) : 0;
        return html`<li><span>${n}${icon('star-fill')}</span><span class="review-bar"><span class="review-bar__fill review-bar__fill--${Math.round(pct / 10) * 10}"></span></span><span>${value}</span></li>`;
      })}
    </ul>
  </div>`;
}

function reviewForm() {
  return html`<form class="review-form" data-review-form novalidate>
    <h3 class="review-form__title">${t('reviews.writeTitle')}</h3>
    <fieldset class="rating-input">
      <legend class="field__label">${t('reviews.yourRating')}</legend>
      ${[5, 4, 3, 2, 1].map((n) => html`<input type="radio" name="rating" id="rate-${n}" value="${n}" ${n === 5 ? 'checked' : ''}><label for="rate-${n}" title="${n}">${icon('star-fill')}</label>`)}
    </fieldset>
    <div class="field">
      <label class="field__label" for="review-text">${t('reviews.text')}</label>
      <textarea class="control" id="review-text" name="text" rows="3" minlength="10" maxlength="1500" required placeholder="${t('reviews.textPlaceholder')}"></textarea>
    </div>
    <p class="form-error" role="alert" data-form-error hidden></p>
    <button class="btn btn-accent" type="submit">${icon('send')}${t('reviews.submit')}</button>
    <p class="muted small">${t('reviews.moderationNote')}</p>
  </form>`;
}

function reviewsBlock(p, data) {
  return html`<section class="content-block reviews-block" id="reviews" aria-labelledby="reviews-title">
    <h2 class="content-block__title" id="reviews-title">${t('reviews.title')} <span class="muted">${data.total || ''}</span></h2>
    ${reviewSummary(data, p.rating, p.reviewCount)}
    ${data.items.length ? html`<ul class="review-list" data-review-list>${data.items.map(reviewItem)}</ul>` : html`<p class="muted">${t('reviews.empty')}</p>`}
    ${data.pages > 1 ? html`<button class="btn btn-ghost" type="button" data-more-reviews data-page="2">${t('reviews.more')}</button>` : ''}
    <div data-review-form-slot></div>
  </section>`;
}

function sections(p, reviews) {
  const description = loc(p.description);
  return html`<div class="product-columns">
    <div class="product-columns__main">
      ${description ? html`<section class="content-block"><h2 class="content-block__title">${t('product.description')}</h2><div class="prose"><p>${description}</p></div></section>` : ''}
      <section class="content-block"><h2 class="content-block__title">${t('product.specs')}</h2>${specsTable(p)}</section>
      ${reviewsBlock(p, reviews)}
    </div>
    <aside class="product-columns__side">${shopPanel(p.shop)}</aside>
  </div>`;
}

function render(data) {
  const p = data.product;
  const name = loc(p.name);
  registry.set(p.id, p);
  setHTML(
    $('[data-breadcrumbs]'),
    html`<li><a href="/">${t('common.home')}</a></li>
      <li><a href="/catalog">${t('nav.catalog')}</a></li>
      ${p.category?.parent ? html`<li><a href="${categoryUrl(p.category.parent)}">${loc(p.category.parent.name)}</a></li>` : ''}
      ${p.category ? html`<li><a href="${categoryUrl(p.category)}">${loc(p.category.name)}</a></li>` : ''}
      <li aria-current="page">${name}</li>`
  );
  const article = $('[data-product]');
  article.removeAttribute('aria-busy');
  setHTML(
    article,
    html`${gallery(p)}
      <div class="product__info">
        <p class="product__meta">
          <span>${t('product.sku')}: ${p.sku}</span>
          ${p.brand ? html`<a href="/catalog?brand=${encodeURIComponent(p.brand.slug)}">${p.brand.name}</a>` : ''}
          ${p.reviewCount ? html`<a href="#reviews" class="product__rating">${stars(p.rating, { count: p.reviewCount, compact: true })}</a>` : ''}
        </p>
        <h1 class="product__title">${name}</h1>
        ${offerBox(p)}
        ${keySpecs(p)}
      </div>`
  );
  setHTML($('[data-product-sections]'), sections(p, data.reviews));
  applyAccents(document);

  const similar = $('[data-similar]');
  if (data.similar.length) {
    setHTML(similar, productGrid(data.similar));
    $('[data-similar-section]').hidden = false;
  }
  const fromShop = $('[data-from-shop]');
  if (fromShop && data.fromShop?.length) {
    setHTML(fromShop, productGrid(data.fromShop));
    $('[data-from-shop-title]').textContent = t('product.moreFromShop', { shop: p.shop.name });
    $('[data-from-shop-section]').hidden = false;
  }

  // sticky mobile bar: price + contact
  const bar = $('[data-buy-bar]');
  setHTML(
    bar,
    html`<div class="buy-bar__price"><span class="price__value">${fmtMoney(p.price)}</span><span class="buy-bar__shop">${p.shop.name}</span></div>
      <button class="btn btn-accent" type="button" data-open-contact>${icon('phone')}${t('contact.ctaShort')}</button>`
  );
  bar.hidden = false;
  document.body.classList.add('has-buy-bar');
}

async function setupReviewForm() {
  const slot = $('[data-review-form-slot]');
  if (!slot) return;
  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (!session?.user) {
    setHTML(slot, html`<p class="review-login">${icon('user')}<span>${t('reviews.loginToWrite')}</span><a class="btn btn-ghost btn-sm" href="/login?next=${encodeURIComponent(window.location.pathname)}">${t('nav.login')}</a></p>`);
    return;
  }
  if (session.isStaff) return;
  setHTML(slot, reviewForm());
  const form = $('[data-review-form]', slot);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const button = form.querySelector('[type="submit"]');
    const text = form.elements.text.value.trim();
    if (text.length < 10) {
      showErrors(form, { text: t('validation.too_short', { min: 10 }) });
      return;
    }
    setBusy(button, true);
    try {
      await api('/api/reviews', { method: 'POST', body: { target: 'product', product: product.id, rating: Number(form.elements.rating.value), text } });
      setHTML(slot, html`<p class="notice notice--ok">${icon('check-circle')}${t('reviews.thanks')}</p>`);
    } catch (error) {
      showErrors(form, error.fields || {}, error.message);
    } finally {
      setBusy(button, false);
    }
  });
}

function bind() {
  const root = $('[data-product-root]');
  on(root, 'click', '[data-thumb]', (event, button) => {
    const main = $('[data-main-image]', root);
    main.src = button.dataset.thumb;
    main.alt = t('product.imageAlt', { name: loc(product.name), n: button.dataset.index });
    $$('[data-thumb]', root).forEach((thumb) => thumb.setAttribute('aria-pressed', String(thumb === button)));
  });
  on(document, 'click', '[data-open-contact]', () => openContactSheet(product.shop, product));
  on(root, 'click', '[data-share]', async () => {
    const data = { title: loc(product.name), url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast(t('product.linkCopied'), { type: 'ok' });
      }
    } catch {
      /* share sheet dismissed */
    }
  });
  on(root, 'click', '[data-more-reviews]', async (event, button) => {
    const page = Number(button.dataset.page);
    setBusy(button, true);
    try {
      const data = await api(`/api/catalog/reviews?product=${product.id}&page=${page}`);
      const list = $('[data-review-list]', root);
      const holder = document.createElement('div');
      setHTML(holder, html`${data.items.map(reviewItem)}`);
      list.append(...holder.children);
      if (page >= data.pages) button.remove();
      else button.dataset.page = String(page + 1);
    } finally {
      setBusy(button, false);
    }
  });
}

export default async function productPage() {
  const { slug } = readBoot();
  try {
    const data = await api(`/api/catalog/products/${encodeURIComponent(slug)}`);
    product = data.product;
    render(data);
    bind();
    setupReviewForm();
    recent.add(product.id);
    trackView({ type: 'product_view', product: product.id });
  } catch (error) {
    const article = $('[data-product]');
    article.removeAttribute('aria-busy');
    setHTML(article, emptyState({ iconName: 'alert', title: error.status === 404 ? t('notFound.title') : t('common.errorGeneric'), action: { href: '/catalog', label: t('nav.catalog') } }));
  }
}

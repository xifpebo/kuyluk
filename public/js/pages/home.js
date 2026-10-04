import { $, $$, html, setHTML, icon, safeUrl } from '../lib/dom.js';
import { t, tn, loc, fmtNumber, fmtMoney, unitShort } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { productGrid, registry } from '../lib/product-card.js';
import { shopCard } from '../lib/shop-card.js';
import { skeletonCards, errorState } from '../lib/ui.js';
import { categoryUrl, productUrl, shopUrl, applyAccents, stars, PLACEHOLDER_IMAGE } from '../lib/format.js';
import * as recent from '../lib/recent.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function countUp(element, target) {
  if (reducedMotion || !target) {
    element.textContent = fmtNumber(target);
    return;
  }
  const start = performance.now();
  const duration = 900;
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = fmtNumber(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderTerms() {
  const holder = $('[data-popular-terms]');
  if (!holder) return;
  const terms = (holder.dataset.terms || '').split(',').map((term) => term.trim()).filter(Boolean);
  setHTML(holder, html`${terms.map((term) => html`<a class="term-chip" href="/catalog?q=${encodeURIComponent(term)}">${term}</a>`)}`);
}

function renderCategories(categories) {
  setHTML(
    $('[data-home-categories]'),
    html`${categories.map(
      (c, index) => html`<a class="category-tile ${c.image ? 'category-tile--image' : ''}" href="${categoryUrl(c)}">
        ${c.image ? html`<img class="category-tile__img" src="${safeUrl(c.image)}" alt="" loading="lazy" width="320" height="320">` : ''}
        <span class="category-tile__num">${String(index + 1).padStart(2, '0')}</span>
        <span class="category-tile__icon">${icon(c.icon)}</span>
        <span class="category-tile__text">
          <span class="category-tile__name">${loc(c.name)}</span>
          <span class="category-tile__count"><span>${tn('common.products', c.productCount)}</span>${icon('arrow-right')}</span>
        </span>
      </a>`
    )}`
  );
}

/** The hero shows the marketplace in one card: product → shop → contact. */
function renderHeroCard(product) {
  const holder = $('[data-hero-card]');
  if (!holder || !product) return;
  registry.set(product.id, product);
  setHTML(
    holder,
    html`<a class="hero-card__product" href="${productUrl(product)}">
        <img src="${safeUrl(product.image || PLACEHOLDER_IMAGE)}" alt="" width="120" height="120">
        <span class="hero-card__info">
          <span class="hero-card__name">${loc(product.name)}</span>
          <span class="hero-card__price">${fmtMoney(product.price)}${product.unit !== 'piece' ? ` / ${unitShort(product.unit)}` : ''}</span>
          ${product.oldPrice ? html`<span class="hero-card__old">${fmtMoney(product.oldPrice)}</span>` : ''}
        </span>
      </a>
      <div class="hero-card__shop">
        <span class="hero-card__label">${t('product.availableAt')}</span>
        <a href="${shopUrl(product.shop)}" class="hero-card__shopname">
          <img src="${safeUrl(product.shop.logoUrl || '/img/logo-mark.svg')}" alt="" width="26" height="26">${product.shop.name}
        </a>
        ${product.shop.reviewCount ? stars(product.shop.rating, { count: product.shop.reviewCount, compact: true }) : ''}
      </div>
      <button class="btn btn-accent btn-block" type="button" data-contact-product="${product.id}">${icon('phone')}${t('contact.cta')}</button>`
  );
}

function renderBanners(banners) {
  const section = $('[data-section="banners"]');
  const promo = banners.filter((b) => b.placement === 'home_promo').slice(0, 3);
  if (!promo.length) return;
  setHTML(
    $('[data-home-banners]'),
    html`${promo.map(
      (b) => html`<a class="promo promo--${b.theme}" href="${safeUrl(b.link || '/catalog')}">
        <span class="promo__copy">
          <span class="promo__title">${loc(b.title)}</span>
          ${loc(b.subtitle) ? html`<span class="promo__text">${loc(b.subtitle)}</span>` : ''}
          <span class="promo__cta">${loc(b.ctaLabel) || t('common.viewAll')}${icon('arrow-right')}</span>
        </span>
        ${b.image ? html`<img class="promo__img" src="${safeUrl(b.image)}" alt="" loading="lazy" width="240" height="240">` : ''}
      </a>`
    )}`
  );
  section.hidden = false;
}

function renderBrands(brands) {
  const holder = $('[data-home-brands]');
  if (!brands.length) {
    holder.closest('section').hidden = true;
    return;
  }
  setHTML(
    holder,
    html`${brands.map(
      (b) => html`<a class="brand-chip" href="/catalog?brand=${encodeURIComponent(b.slug)}">
        <span class="brand-chip__name">${b.name}</span>
        <span class="brand-chip__meta">${b.country ? html`<span class="brand-chip__country">${b.country}</span>` : ''}${tn('common.products', b.productCount)}</span>
      </a>`
    )}`
  );
}

function fillList(name, items) {
  const holder = $(`[data-home-list="${name}"]`);
  if (!holder) return;
  holder.removeAttribute('aria-busy');
  if (!items.length) {
    holder.closest('section').hidden = true;
    return;
  }
  setHTML(holder, productGrid(items));
}

async function renderRecent() {
  const section = $('[data-recent-section]');
  const ids = recent.list();
  if (!section || !ids.length) return;
  try {
    const { items } = await api(`/api/catalog/lookup?ids=${ids.join(',')}`);
    if (!items.length) return;
    setHTML($('[data-recent]'), productGrid(items.slice(0, 8), { compact: true }));
    section.hidden = false;
    $('[data-recent-clear]').addEventListener('click', () => {
      recent.clear();
      section.hidden = true;
    });
  } catch {
    /* optional block */
  }
}

async function load() {
  $$('[data-home-list]').forEach((el) => setHTML(el, skeletonCards(4)));
  setHTML($('[data-home-shops]'), skeletonCards(4));
  try {
    const data = await api('/api/catalog/home');
    const sections = data.settings?.sections || {};
    $$('[data-section]').forEach((section) => {
      if (sections[section.dataset.section] === false) section.remove();
    });
    for (const [key, el] of [['products', '[data-stat="products"]'], ['shops', '[data-stat="shops"]'], ['categories', '[data-stat="categories"]']]) {
      const node = $(el);
      if (node) countUp(node, data.stats[key]);
    }
    renderCategories(data.categories);
    renderHeroCard(data.discounted[0] || data.featured[0]);
    if (sections.banners !== false) renderBanners(data.banners || []);
    fillList('featured', data.featured.slice(0, 10));
    fillList('discounted', data.discounted);
    fillList('newest', data.newest);
    fillList('popular', data.popular);
    const shopsEl = $('[data-home-shops]');
    if (shopsEl) {
      shopsEl.removeAttribute('aria-busy');
      setHTML(shopsEl, html`${data.shops.slice(0, 6).map(shopCard)}`);
      applyAccents(shopsEl);
    }
    if ($('[data-home-brands]')) renderBrands(data.brands);
  } catch {
    const holder = $('[data-home-list="featured"]');
    setHTML(holder, errorState(t('common.errorGeneric')));
    holder.querySelector('[data-retry]')?.addEventListener('click', load);
  }
}

export default async function home() {
  renderTerms();
  renderRecent();
  await load();
}

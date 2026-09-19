import { $, html, setHTML, icon } from '../lib/dom.js';
import { tn, loc, fmtNumber, fmtMoney, unitShort } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { productGrid } from '../lib/product-card.js';
import { supplierCard } from '../lib/supplier-card.js';
import { skeletonCards, errorState } from '../lib/ui.js';
import { categoryUrl, lineTotal, normalizeQty } from '../lib/format.js';

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
  setHTML(
    holder,
    html`${terms.map((term) => html`<a class="term-chip" href="/catalog?q=${encodeURIComponent(term)}">${term}</a>`)}`
  );
}

function renderCategories(categories) {
  const grid = $('[data-home-categories]');
  setHTML(
    grid,
    html`${categories.map(
      (c, index) => html`<a class="category-tile" href="${categoryUrl(c)}">
        <span class="category-tile__num">${String(index + 1).padStart(2, '0')}</span>
        <span class="category-tile__icon">${icon(c.icon)}</span>
        <span>
          <span class="category-tile__name">${loc(c.name)}</span>
          <span class="category-tile__count"><span>${tn('common.products', c.productCount)}</span>${icon('arrow-right')}</span>
        </span>
      </a>`
    )}`
  );
}

function sampleQty(product) {
  const tier = product.priceTiers?.[0];
  if (tier) return tier.minQty;
  return normalizeQty(product, (product.minOrderQty || 1) * 4);
}

function renderSheet(products) {
  const rows = $('[data-sheet-rows]');
  if (!rows) return;
  const picks = products.slice(0, 4);
  let total = 0;
  setHTML(
    rows,
    html`${picks.map((product) => {
      const qty = sampleQty(product);
      const sum = lineTotal(product, qty);
      total += sum;
      return html`<li class="spec-sheet__row">
        <span><span class="spec-sheet__row-name">${loc(product.name)}</span>
        <span class="spec-sheet__row-qty">${fmtNumber(qty)} ${unitShort(product.unit)}</span></span>
        <span class="spec-sheet__row-sum">${fmtMoney(sum)}</span>
      </li>`;
    })}`
  );
  $('[data-sheet-total]').textContent = fmtMoney(total);
}

async function load() {
  const featured = $('[data-home-featured]');
  const suppliers = $('[data-home-suppliers]');
  setHTML(featured, skeletonCards(4));
  try {
    const data = await api('/api/catalog/home');
    countUp($('[data-stat="products"]'), data.stats.products);
    countUp($('[data-stat="suppliers"]'), data.stats.suppliers);
    countUp($('[data-stat="categories"]'), data.stats.categories);
    renderCategories(data.categories);
    setHTML(featured, productGrid(data.featured));
    setHTML(suppliers, html`${data.suppliers.map(supplierCard)}`);
    renderSheet(data.featured);
  } catch (error) {
    setHTML(featured, errorState(error.message));
    featured.querySelector('[data-retry]')?.addEventListener('click', load);
  } finally {
    featured.removeAttribute('aria-busy');
    suppliers.removeAttribute('aria-busy');
  }
}

export default function home() {
  renderTerms();
  return load();
}

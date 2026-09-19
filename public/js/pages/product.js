import { $, $$, html, setHTML, icon, on, readBoot, safeUrl, telHref, telegramHref, whatsappHref, formatPhone } from '../lib/dom.js';
import { t, tn, loc, fmtMoney, fmtNumber, unitShort, unitName } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import * as cart from '../lib/cart.js';
import { productGrid } from '../lib/product-card.js';
import { workingTime, paymentTags } from '../lib/supplier-card.js';
import { badge, toast, emptyState } from '../lib/ui.js';
import {
  unitPriceFor,
  lineTotal,
  normalizeQty,
  checkQty,
  stepOf,
  minQty,
  tierRows,
  stockInfo,
  dimensionSummary,
  weightLabel,
  categoryUrl,
  supplierUrl,
  PLACEHOLDER_IMAGE
} from '../lib/format.js';

let product = null;
let qty = 1;

function gallery(p) {
  const images = p.images?.length ? p.images : [PLACEHOLDER_IMAGE];
  const stock = stockInfo(p.stock.status);
  const name = loc(p.name);
  return html`<div class="product__gallery gallery">
    <div class="gallery__main">
      <img src="${safeUrl(images[0])}" alt="${t('product.imageAlt', { name, n: 1 })}" data-main-image width="800" height="600">
      <div class="gallery__corner">
        ${badge(stock.label, stock.tone, { dot: true })}
        ${p.hasBulkPricing ? html`<span class="badge badge--hazard">${icon('tag')}${t('catalog.bulkBadge')}</span>` : ''}
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
    [t('product.material'), t(`materials.${p.materialType}`)],
    [t('product.grade'), p.grade],
    [t('product.dimensions'), dimensionSummary(p.dimensions)],
    [t('product.weight', { unit: unitShort(p.unit) }), weightLabel(p.weightKg)],
    [t('product.unit'), unitName(p.unit)]
  ].filter(([, value]) => value);
  return html`<dl class="keyspecs">${rows.map(([label, value]) => html`<div class="keyspec"><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>`;
}

function tierTable(p) {
  if (!p.priceTiers?.length) return '';
  const unit = unitShort(p.unit);
  return html`<table class="tier-table" data-tier-table>
    <caption>${t('product.bulkPricing')}</caption>
    <thead><tr><th scope="col">${t('product.tierQty')}</th><th scope="col">${t('product.tierPrice')}</th><th scope="col"><span class="visually-hidden">%</span></th></tr></thead>
    <tbody>
      ${tierRows(p).map(
        (row) => html`<tr data-tier-from="${row.from}">
          <td>${row.to ? t('product.tierRange', { from: fmtNumber(row.from), to: fmtNumber(row.to), unit }) : t('product.tierOpen', { from: fmtNumber(row.from), unit })}</td>
          <td>${fmtMoney(row.price)}</td>
          <td>${row.saving > 0 ? badge(t('product.tierSaving', { pct: row.saving }), 'ok') : ''}</td>
        </tr>`
      )}
    </tbody>
  </table>`;
}

function stockLine(p) {
  const parts = [];
  parts.push(html`<span>${icon('truck')}${t('product.leadTime')}: ${p.leadTimeDays ? tn('common.days', p.leadTimeDays) : t('product.leadTimeNone')}</span>`);
  if (typeof p.stock.quantity === 'number' && p.stock.status !== 'out_of_stock') {
    parts.push(html`<span>${icon('package')}${t('product.stockQty', { qty: `${fmtNumber(p.stock.quantity)} ${unitShort(p.unit)}` })}</span>`);
  }
  if (p.unitsPerPallet) {
    parts.push(html`<span>${icon('layers')}${t('product.unitsPerPallet')}: ${fmtNumber(p.unitsPerPallet)} ${unitShort(p.unit)}</span>`);
  }
  return html`<p class="stock-line">${parts}</p>`;
}

function buyBox(p) {
  const stock = stockInfo(p.stock.status);
  const unit = unitShort(p.unit);
  const hint = [t('product.minOrder', { qty: `${fmtNumber(minQty(p))} ${unit}` })];
  if (stepOf(p) !== 1 || minQty(p) % 1 !== 0) hint.push(t('product.stepHint', { step: fmtNumber(stepOf(p)), unit }));
  return html`<section class="buy-box" aria-label="${t('product.addToQuote')}">
    <div class="buy-box__head">
      <p class="price">
        <span class="price__value">${fmtMoney(p.price)}</span>
        <span class="price__unit">/ ${unit}</span>
        ${p.oldPrice ? html`<span class="price__old">${fmtMoney(p.oldPrice)}</span>` : ''}
      </p>
      ${badge(stock.label, stock.tone, { dot: true })}
    </div>
    ${stockLine(p)}
    ${tierTable(p)}
    <div class="qty-row">
      <div class="field">
        <label class="field__label" for="qty-input">${t('product.quantity')}</label>
        <div class="stepper">
          <button class="stepper__btn" type="button" data-step="-1" aria-label="${t('product.decrease')}">${icon('minus')}</button>
          <input class="stepper__input" id="qty-input" type="text" inputmode="decimal" autocomplete="off" aria-describedby="qty-hint" data-qty>
          <button class="stepper__btn" type="button" data-step="1" aria-label="${t('product.increase')}">${icon('plus')}</button>
          <span class="stepper__unit">${unit}</span>
        </div>
        <p class="qty-hint" id="qty-hint" data-qty-hint>${hint.join(' · ')}</p>
      </div>
      <button class="btn btn-accent btn-lg" type="button" data-add-detail>${icon('clipboard')}<span data-add-label>${t('product.addToQuote')}</span></button>
    </div>
    <div class="estimate">
      <span class="estimate__label">${t('product.estimate')}</span>
      <strong class="estimate__value" data-estimate>—</strong>
      <span class="estimate__saving" data-saving hidden></span>
    </div>
    <p class="muted small">${icon('info')}${t('product.estimateNote')}</p>
    ${p.stock.status === 'out_of_stock' ? html`<p class="notice notice--warn">${t('product.unavailableNote')}</p>` : ''}
  </section>`;
}

function supplierBox(s) {
  if (!s) return '';
  return html`<section class="supplier-box" aria-label="${t('product.supplier')}">
    <div class="supplier-box__head">
      <div>
        <p class="eyebrow">${t('product.supplier')}</p>
        <p class="supplier-box__name"><a href="${supplierUrl(s)}">${s.name}</a></p>
        ${s.isVerified ? html`<span class="verified">${icon('shield')}${t('common.verified')}</span>` : ''}
      </div>
      <span class="supplier-card__stall">${s.stallNumber}</span>
    </div>
    <ul class="meta-list">
      <li>${icon('clock')}<span>${workingTime(s)}</span></li>
      <li>${icon('truck')}<span>${s.deliveryAvailable ? t('product.deliveryYes') : t('product.deliveryNo')}${loc(s.deliveryNote) ? ` — ${loc(s.deliveryNote)}` : ''}</span></li>
      ${loc(s.address) ? html`<li>${icon('pin')}<span>${loc(s.address)}</span></li>` : ''}
      ${s.paymentMethods?.length ? html`<li>${icon('tag')}${paymentTags(s.paymentMethods)}</li>` : ''}
    </ul>
    <div class="contact-buttons">
      ${s.phone ? html`<a class="btn btn-ghost btn-sm" href="${telHref(s.phone)}">${icon('phone')}${formatPhone(s.phone)}</a>` : ''}
      ${s.telegram ? html`<a class="btn btn-ghost btn-sm" href="${telegramHref(s.telegram)}" target="_blank" rel="noopener noreferrer">${icon('telegram')}Telegram</a>` : ''}
      ${s.whatsapp ? html`<a class="btn btn-ghost btn-sm" href="${whatsappHref(s.whatsapp)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}WhatsApp</a>` : ''}
    </div>
  </section>`;
}

function sections(p) {
  const rows = [
    [t('product.sku'), p.sku],
    [t('product.brand'), p.brand?.name],
    [t('product.material'), t(`materials.${p.materialType}`)],
    [t('product.grade'), p.grade],
    [t('product.unit'), unitName(p.unit)],
    [t('product.length'), p.dimensions.lengthMm ? `${fmtNumber(p.dimensions.lengthMm)} ${t('common.mm')}` : ''],
    [t('product.width'), p.dimensions.widthMm ? `${fmtNumber(p.dimensions.widthMm)} ${t('common.mm')}` : ''],
    [t('product.height'), p.dimensions.heightMm ? `${fmtNumber(p.dimensions.heightMm)} ${t('common.mm')}` : ''],
    [t('product.thickness'), p.dimensions.thicknessMm ? `${fmtNumber(p.dimensions.thicknessMm)} ${t('common.mm')}` : ''],
    [t('product.diameter'), p.dimensions.diameterMm ? `Ø${fmtNumber(p.dimensions.diameterMm)} ${t('common.mm')}` : ''],
    [t('product.weight', { unit: unitShort(p.unit) }), weightLabel(p.weightKg)],
    [t('product.unitsPerPallet'), p.unitsPerPallet ? `${fmtNumber(p.unitsPerPallet)} ${unitShort(p.unit)}` : ''],
    [t('product.minOrder', { qty: '' }).replace(/[:\s]+$/, ''), `${fmtNumber(minQty(p))} ${unitShort(p.unit)}`],
    ...p.specs.map((spec) => [loc(spec.label), loc(spec.value)])
  ].filter(([, value]) => value);
  const description = loc(p.description);
  return html`
    <section aria-labelledby="specs-title">
      <h2 class="content-block__title" id="specs-title">${t('product.specs')}</h2>
      <dl class="spec-table">${rows.map(([label, value]) => html`<dt>${label}</dt><dd>${value}</dd>`)}</dl>
    </section>
    <section aria-labelledby="desc-title">
      <h2 class="content-block__title" id="desc-title">${t('product.description')}</h2>
      <p class="prose">${description || t('product.noDescription')}</p>
    </section>`;
}

function refreshQuantity({ fromInput = false } = {}) {
  const input = $('[data-qty]');
  const hint = $('[data-qty-hint]');
  if (!fromInput) input.value = fmtNumber(qty).replace(/\s/g, '');
  const error = checkQty(product, qty);
  hint.classList.toggle('is-error', Boolean(error));
  input.setAttribute('aria-invalid', String(Boolean(error)));
  if (error) hint.textContent = error;
  else {
    const unit = unitShort(product.unit);
    const parts = [t('product.minOrder', { qty: `${fmtNumber(minQty(product))} ${unit}` })];
    if (stepOf(product) !== 1 || minQty(product) % 1 !== 0) parts.push(t('product.stepHint', { step: fmtNumber(stepOf(product)), unit }));
    hint.textContent = parts.join(' · ');
  }
  const unitPrice = unitPriceFor(product, qty);
  const total = lineTotal(product, qty);
  $('[data-estimate]').textContent = error ? '—' : fmtMoney(total);
  const saving = Math.round((product.price - unitPrice) * qty);
  const savingEl = $('[data-saving]');
  savingEl.hidden = !(saving > 0) || Boolean(error);
  savingEl.textContent = saving > 0 ? t('product.youSave', { amount: fmtMoney(saving) }) : '';
  let activeFrom = null;
  for (const row of tierRows(product)) if (qty + 1e-9 >= row.from) activeFrom = row.from;
  $$('[data-tier-from]').forEach((row) => row.classList.toggle('is-active', Number(row.dataset.tierFrom) === activeFrom));
  const inCart = cart.getQty(product.id);
  const label = $('[data-add-label]');
  label.textContent = inCart ? (inCart === qty ? t('product.inQuote', { qty: `${fmtNumber(inCart)} ${unitShort(product.unit)}` }) : t('product.updateQuote')) : t('product.addToQuote');
  const barLabel = $('[data-bar-label]');
  if (barLabel) barLabel.textContent = label.textContent;
  const barTotal = $('[data-bar-total]');
  if (barTotal) barTotal.textContent = error ? fmtMoney(product.price) : fmtMoney(total);
}

function parseQty(text) {
  const value = Number(String(text).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : NaN;
}

function addToCart() {
  const error = checkQty(product, qty);
  if (error) {
    $('[data-qty]').focus();
    return;
  }
  const before = cart.getQty(product.id);
  if (before === qty) {
    window.location.href = '/quote';
    return;
  }
  cart.setQty(product.id, qty);
  toast(before ? t('product.updated') : t('product.added', { name: loc(product.name) }), {
    type: 'ok',
    action: { href: '/quote', label: t('product.goToQuote') }
  });
  refreshQuantity();
}

function bind() {
  const root = $('[data-product]');
  on(root, 'click', '[data-step]', (event, button) => {
    const direction = Number(button.dataset.step);
    const next = qty + direction * stepOf(product);
    qty = normalizeQty(product, Math.max(minQty(product), next));
    refreshQuantity();
  });
  const input = $('[data-qty]');
  input.addEventListener('input', () => {
    qty = parseQty(input.value);
    refreshQuantity({ fromInput: true });
  });
  input.addEventListener('change', () => {
    const value = parseQty(input.value);
    qty = Number.isFinite(value) && value > 0 ? normalizeQty(product, value) : minQty(product);
    refreshQuantity();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addToCart();
  });
  on(document, 'click', '[data-add-detail]', addToCart);
  on(root, 'click', '[data-thumb]', (event, button) => {
    const main = $('[data-main-image]');
    main.src = button.dataset.thumb;
    main.alt = t('product.imageAlt', { name: loc(product.name), n: button.dataset.index });
    $$('[data-thumb]', root).forEach((thumb) => thumb.setAttribute('aria-pressed', String(thumb === button)));
  });
  document.addEventListener('cart:change', () => refreshQuantity());
}

function renderBuyBar(p) {
  const bar = $('[data-buy-bar]');
  setHTML(
    bar,
    html`<div class="buy-bar__price"><span class="price__value" data-bar-total>${fmtMoney(p.price)}</span><span class="price__unit">${t('product.estimate')}</span></div>
      <button class="btn btn-accent" type="button" data-add-detail>${icon('clipboard')}<span data-bar-label>${t('product.addToQuote')}</span></button>`
  );
  const buyBox = $('.buy-box');
  if ('IntersectionObserver' in window && buyBox) {
    const observer = new IntersectionObserver(([entry]) => {
      bar.hidden = entry.isIntersecting;
      document.body.classList.toggle('has-buy-bar', !entry.isIntersecting);
    });
    observer.observe(buyBox);
  }
}

export default async function productPage() {
  const { slug } = readBoot();
  const root = $('[data-product]');
  let similar = [];
  try {
    const data = await api(`/api/catalog/products/${encodeURIComponent(slug)}`);
    product = data.product;
    similar = data.similar || [];
  } catch (error) {
    setHTML(root, emptyState({ iconName: 'alert', title: t('product.notFound'), text: t('product.notFoundText'), action: { href: '/catalog', label: t('quote.browseCatalog') } }));
    root.removeAttribute('aria-busy');
    return;
  }
  const p = product;
  const crumbs = $('[data-breadcrumbs]');
  setHTML(
    crumbs,
    html`<li><a href="/">${t('common.home')}</a></li><li><a href="/catalog">${t('nav.catalog')}</a></li>
      ${p.category ? html`<li><a href="${categoryUrl(p.category)}">${loc(p.category.name)}</a></li>` : ''}
      <li aria-current="page">${loc(p.name)}</li>`
  );
  setHTML(
    root,
    html`${gallery(p)}
      <div class="product__info">
        <p class="product__meta">
          <span>${t('product.sku')}: ${p.sku}</span>
          ${p.brand ? html`<a href="/catalog?brand=${encodeURIComponent(p.brand.slug)}">${p.brand.name}</a>` : ''}
          ${p.category ? html`<a href="${categoryUrl(p.category)}">${loc(p.category.name)}</a>` : ''}
        </p>
        <h1 class="product__title">${loc(p.name)}</h1>
        ${keySpecs(p)}
        ${buyBox(p)}
        ${supplierBox(p.supplier)}
      </div>`
  );
  root.removeAttribute('aria-busy');
  setHTML($('[data-product-sections]'), sections(p));
  if (similar.length) {
    setHTML($('[data-similar]'), productGrid(similar));
    $('[data-similar-section]').hidden = false;
  }
  qty = cart.getQty(p.id) || normalizeQty(p, minQty(p));
  renderBuyBar(p);
  bind();
  refreshQuantity();
}

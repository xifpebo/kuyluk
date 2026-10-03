/**
 * "Contact the shop" — the core action of Stroy Bazar. Customers never buy
 * on the site: they call or message the shop directly. This module renders
 * the contact buttons/sheet, prepares a ready-made message about the
 * product and counts clicks (anonymous, per shop and day).
 */
import { html, setHTML, icon, on, safeUrl, telHref, formatPhone, telegramHref } from './dom.js';
import { t, loc } from './i18n.js';
import { copyText, toast } from './ui.js';
import { api } from './api.js';
import { priceLabel, productUrl, shopUrl, stars, applyAccents, PLACEHOLDER_IMAGE } from './format.js';

export function instagramHref(username) {
  const clean = String(username || '').replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(clean) ? `https://instagram.com/${clean}` : '#';
}

export function whatsappHref(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 9) return '#';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Message the customer can paste into Telegram / WhatsApp. */
export function inquiryText(product) {
  if (!product) return t('contact.messageShop');
  return t('contact.messageProduct', {
    name: loc(product.name),
    sku: product.sku,
    price: priceLabel(product),
    url: `${window.location.origin}${productUrl(product)}`
  });
}

function track(payload) {
  api('/api/catalog/track', { method: 'POST', body: payload }).catch(() => {});
}

export function trackView(payload) {
  track(payload);
}

/**
 * Contact buttons for a shop (used on product pages, shop pages and in the sheet).
 * `variant`: 'stack' (full width) or 'row'.
 */
export function contactButtons(shop, product = null, { variant = 'stack' } = {}) {
  if (!shop) return html``;
  const ref = product ? html`data-product="${product.id}"` : html`data-shop="${shop.slug}"`;
  const items = [];
  if (shop.phone) {
    items.push(html`<a class="contact-btn contact-btn--phone" href="${telHref(shop.phone)}" data-channel="phone" ${ref}>
      ${icon('phone')}<span class="contact-btn__text"><span class="contact-btn__label">${t('contact.call')}</span><span class="contact-btn__value">${formatPhone(shop.phone)}</span></span></a>`);
  }
  if (shop.telegram) {
    items.push(html`<a class="contact-btn contact-btn--telegram" href="${telegramHref(shop.telegram)}" target="_blank" rel="noopener noreferrer" data-channel="telegram" data-copy-message ${ref}>
      ${icon('telegram')}<span class="contact-btn__text"><span class="contact-btn__label">${t('contact.telegram')}</span><span class="contact-btn__value">@${shop.telegram}</span></span></a>`);
  }
  if (shop.whatsapp) {
    items.push(html`<a class="contact-btn contact-btn--whatsapp" href="${whatsappHref(shop.whatsapp, inquiryText(product))}" target="_blank" rel="noopener noreferrer" data-channel="whatsapp" ${ref}>
      ${icon('whatsapp')}<span class="contact-btn__text"><span class="contact-btn__label">WhatsApp</span><span class="contact-btn__value">${formatPhone(shop.whatsapp)}</span></span></a>`);
  }
  if (shop.instagram) {
    items.push(html`<a class="contact-btn contact-btn--instagram" href="${instagramHref(shop.instagram)}" target="_blank" rel="noopener noreferrer" data-channel="instagram" ${ref}>
      ${icon('instagram')}<span class="contact-btn__text"><span class="contact-btn__label">${t('contact.instagram')}</span><span class="contact-btn__value">@${shop.instagram}</span></span></a>`);
  }
  if (shop.phone2 && shop.phone2 !== shop.whatsapp) {
    items.push(html`<a class="contact-btn contact-btn--phone2" href="${telHref(shop.phone2)}" data-channel="phone" ${ref}>
      ${icon('phone')}<span class="contact-btn__text"><span class="contact-btn__label">${t('contact.call2')}</span><span class="contact-btn__value">${formatPhone(shop.phone2)}</span></span></a>`);
  }
  if (!items.length) return html`<p class="muted">${t('contact.noContacts')}</p>`;
  return html`<div class="contact-buttons contact-buttons--${variant}">${items}</div>`;
}

/** Full-screen sheet on phones, dialog on larger screens. */
export function openContactSheet(shop, product = null) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal contact-sheet';
  dialog.setAttribute('aria-label', t('contact.sheetTitle', { shop: shop.name }));
  const message = inquiryText(product);
  setHTML(
    dialog,
    html`<div class="contact-sheet__inner" data-accent="${shop.accent || ''}">
      <header class="contact-sheet__head">
        <img class="contact-sheet__logo" src="${safeUrl(shop.logoUrl || '/img/logo-mark.svg')}" alt="" width="52" height="52">
        <div class="contact-sheet__who">
          <p class="eyebrow">${t('contact.availableAt')}</p>
          <h2 class="contact-sheet__title">${shop.name} ${shop.isVerified ? html`<span class="verified" title="${t('common.verified')}">${icon('badge-check')}</span>` : ''}</h2>
          ${shop.reviewCount ? stars(shop.rating, { count: shop.reviewCount, compact: true }) : ''}
        </div>
        <button class="btn btn-icon btn-ghost contact-sheet__close" type="button" data-close aria-label="${t('common.close')}">${icon('close')}</button>
      </header>
      ${product
        ? html`<div class="contact-sheet__product">
            <img src="${safeUrl(product.image || product.images?.[0] || PLACEHOLDER_IMAGE)}" alt="" width="64" height="64">
            <div><p class="contact-sheet__pname">${loc(product.name)}</p><p class="contact-sheet__price">${priceLabel(product)}</p></div>
          </div>`
        : ''}
      <p class="contact-sheet__lead">${t('contact.sheetLead')}</p>
      ${contactButtons(shop, product)}
      <div class="contact-sheet__message">
        <p class="contact-sheet__label">${icon('chat')}${t('contact.readyMessage')}</p>
        <p class="contact-sheet__text" data-message>${message}</p>
        <button class="btn btn-ghost btn-sm" type="button" data-copy-text>${icon('copy')}${t('contact.copyMessage')}</button>
      </div>
      <ul class="contact-sheet__meta">
        ${shop.workingHours ? html`<li>${icon('clock')}${t(`shops.workingDays.${shop.workingDays || 'mon_sat'}`)}, ${shop.workingHours}</li>` : ''}
        ${shop.address && loc(shop.address) ? html`<li>${icon('pin')}${loc(shop.address)}</li>` : ''}
        <li>${icon('truck')}${shop.deliveryAvailable ? t('shops.deliveryYes') : t('shops.deliveryNo')}</li>
      </ul>
      <a class="btn btn-ghost btn-block" href="${shopUrl(shop)}">${icon('store')}${t('contact.viewShop')}</a>
      <p class="contact-sheet__note">${icon('shield')}${t('contact.safetyNote')}</p>
    </div>`
  );
  document.body.append(dialog);
  applyAccents(dialog);
  dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 50));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-copy-text]').addEventListener('click', async (event) => {
    if (await copyText(message)) {
      event.currentTarget.classList.add('is-done');
      toast(t('contact.copied'), { type: 'ok' });
    }
  });
  dialog.showModal();
}

/**
 * Global handlers: count clicks on any contact link and, for Telegram, copy
 * the ready-made message so the customer only has to paste it.
 */
export function bindContactTracking(resolveProduct = () => null) {
  on(document, 'click', '[data-channel]', (event, link) => {
    const channel = link.dataset.channel;
    if (link.dataset.product) track({ type: 'contact', channel, product: link.dataset.product });
    else if (link.dataset.shop) track({ type: 'contact', channel, shop: link.dataset.shop });
    if (link.hasAttribute('data-copy-message')) {
      const product = resolveProduct(link.dataset.product);
      copyText(inquiryText(product)).then((ok) => {
        if (ok) toast(t('contact.copiedTelegram'), { type: 'ok', timeout: 6000 });
      });
    }
  });
}

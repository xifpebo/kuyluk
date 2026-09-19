import { html, icon } from './dom.js';
import { t, tn, loc } from './i18n.js';
import { supplierUrl } from './format.js';
import { badge } from './ui.js';

export function workingTime(supplier) {
  const days = t(`suppliers.workingDays.${supplier.workingDays || 'mon_sat'}`);
  return supplier.workingHours ? `${days}, ${supplier.workingHours}` : days;
}

export function paymentTags(methods = []) {
  return html`<span class="pay-tags">${methods.map((m) => badge(t(`suppliers.paymentMethods.${m}`), 'muted'))}</span>`;
}

export function supplierCard(supplier) {
  const description = loc(supplier.description);
  return html`<article class="supplier-card">
    <div class="supplier-card__top">
      <div>
        <h3 class="supplier-card__name"><a href="${supplierUrl(supplier)}">${supplier.name}</a></h3>
        ${supplier.isVerified ? html`<span class="verified">${icon('shield')}${t('common.verified')}</span>` : ''}
      </div>
      <span class="supplier-card__stall" aria-label="${t('suppliers.stall', { number: supplier.stallNumber })}">${supplier.stallNumber}</span>
    </div>
    ${description ? html`<p class="supplier-card__desc">${description}</p>` : ''}
    <ul class="meta-list">
      <li>${icon('clock')}<span>${workingTime(supplier)}</span></li>
      <li>${icon('truck')}<span>${supplier.deliveryAvailable ? t('suppliers.deliveryYes') : t('suppliers.deliveryNo')}</span></li>
      ${supplier.paymentMethods?.length ? html`<li>${icon('tag')}${paymentTags(supplier.paymentMethods)}</li>` : ''}
    </ul>
    <div class="supplier-card__foot">
      <span>${typeof supplier.productCount === 'number' ? tn('common.products', supplier.productCount) : ''}</span>
      <span>${t('suppliers.view')} ${icon('arrow-right')}</span>
    </div>
  </article>`;
}

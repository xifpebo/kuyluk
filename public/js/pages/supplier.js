import { $, html, setHTML, icon, readBoot, telHref, telegramHref, whatsappHref, formatPhone } from '../lib/dom.js';
import { t, tn, loc } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { productGrid } from '../lib/product-card.js';
import { workingTime, paymentTags } from '../lib/supplier-card.js';
import { emptyState, skeletonCards } from '../lib/ui.js';

export default async function supplierPage() {
  const { slug } = readBoot();
  const hero = $('[data-supplier-hero]');
  const grid = $('[data-supplier-products]');
  setHTML(grid, skeletonCards(4));
  let data;
  try {
    data = await api(`/api/catalog/suppliers/${encodeURIComponent(slug)}`);
  } catch (error) {
    setHTML(hero, emptyState({ iconName: 'store', title: t('suppliers.notFound'), action: { href: '/suppliers', label: t('nav.suppliers') } }));
    setHTML(grid, '');
    return;
  }
  const s = data.supplier;
  $('[data-crumb-current]').textContent = s.name;
  const description = loc(s.description);
  setHTML(
    hero,
    html`<div>
        <p class="eyebrow">${t('suppliers.stall', { number: s.stallNumber })}</p>
        <div class="supplier-hero__title">
          <h1 class="display">${s.name}</h1>
          <span class="supplier-hero__stall">${s.stallNumber}</span>
        </div>
        ${description ? html`<p class="page-lead">${description}</p>` : ''}
        <div class="supplier-hero__tags">
          ${s.isVerified ? html`<span class="badge badge--ok">${icon('shield')}${t('common.verified')}</span>` : ''}
          <span class="badge">${tn('common.products', s.productCount || 0)}</span>
          ${s.deliveryAvailable ? html`<span class="badge badge--info">${icon('truck')}${t('suppliers.deliveryYes')}</span>` : ''}
        </div>
      </div>
      <aside class="panel">
        <h2 class="panel__title">${t('suppliers.contacts')}</h2>
        <ul class="meta-list">
          ${loc(s.address) ? html`<li>${icon('pin')}<span>${loc(s.address)}</span></li>` : ''}
          <li>${icon('clock')}<span>${workingTime(s)}</span></li>
          <li>${icon('truck')}<span>${s.deliveryAvailable ? t('suppliers.deliveryYes') : t('suppliers.deliveryNo')}${loc(s.deliveryNote) ? ` — ${loc(s.deliveryNote)}` : ''}</span></li>
          ${s.paymentMethods?.length ? html`<li>${icon('tag')}${paymentTags(s.paymentMethods)}</li>` : ''}
        </ul>
        <div class="contact-buttons">
          ${s.phone ? html`<a class="btn btn-accent" href="${telHref(s.phone)}">${icon('phone')}${formatPhone(s.phone)}</a>` : ''}
          ${s.telegram ? html`<a class="btn btn-ghost" href="${telegramHref(s.telegram)}" target="_blank" rel="noopener noreferrer">${icon('telegram')}${t('suppliers.writeTelegram')}</a>` : ''}
          ${s.whatsapp ? html`<a class="btn btn-ghost" href="${whatsappHref(s.whatsapp)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}${t('suppliers.writeWhatsapp')}</a>` : ''}
        </div>
      </aside>`
  );
  hero.removeAttribute('aria-busy');
  setHTML(
    grid,
    data.products.length ? productGrid(data.products) : emptyState({ iconName: 'package', title: t('suppliers.noProducts') })
  );
  grid.removeAttribute('aria-busy');
}

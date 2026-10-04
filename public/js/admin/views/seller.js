/**
 * Shop-owner cabinet: dashboard (30-day statistics, moderation status of
 * products, latest reviews) and the shop profile editor.
 */
import { html, setHTML, icon, safeUrl, $ } from '../../lib/dom.js';
import { t, tn, loc, fmtNumber, fmtMoney } from '../../lib/i18n.js';
import { api, getSession } from '../../lib/api.js';
import { toast } from '../../lib/ui.js';
import { formValues, showErrors, clearErrors, liveValidation } from '../../lib/forms.js';
import { PLACEHOLDER_IMAGE } from '../../lib/format.js';
import { getMeta, viewHead, statusBadge, stockBadge, timeCell, loadingBlock, normalizeNumberInputs, reportError, setDirtyCheck, bindImageFields } from '../shared.js';
import { seriesChart, sizeBars } from './dashboard.js';
import { shopFields, collectShop, checkShopForm } from './shops.js';

function kpi(label, value, iconName, href = null, tone = '') {
  const body = html`<span class="kpi__label">${label}${icon(iconName)}</span><span class="kpi__value">${value}</span>`;
  return href ? html`<a class="kpi ${tone ? `kpi--${tone}` : ''}" href="${href}">${body}</a>` : html`<div class="kpi ${tone ? `kpi--${tone}` : ''}">${body}</div>`;
}

function shopNotice(shop) {
  if (shop.status === 'approved') return '';
  return html`<div class="notice notice--${shop.status === 'pending' ? 'warn' : 'danger'}" role="status">
    ${icon(shop.status === 'pending' ? 'clock' : 'alert')}
    <div>
      <strong>${t(`seller.shopStatus.${shop.status}.title`)}</strong>
      <p>${t(`seller.shopStatus.${shop.status}.text`)}</p>
      ${shop.statusNote ? html`<p class="notice__note">${t('admin.moderation.note')}: ${shop.statusNote}</p>` : ''}
    </div>
  </div>`;
}

export async function sellerDashboardView({ root }) {
  setHTML(root, loadingBlock());
  const [data, session] = await Promise.all([api('/api/seller/stats'), getSession()]);
  const { shop, products, totals } = data;
  const contacts = Object.values(totals.contacts).reduce((a, b) => a + b, 0);
  setHTML(
    root,
    html`${viewHead({
      title: t('seller.dashboard.title', { name: session.user.name.split(' ')[0] }),
      lead: html`${shop.name}${shop.status === 'approved' ? html` · <a class="row-link" href="/shop/${shop.slug}" target="_blank" rel="noopener">${t('seller.dashboard.openShop')}${icon('external')}</a>` : ''}`,
      actions: html`<a class="btn btn-ghost" href="#/shop">${icon('store')}${t('seller.nav.shop')}</a>
        <a class="btn btn-accent" href="#/products/new">${icon('plus')}${t('admin.products.new')}</a>`
    })}
    ${shopNotice(shop)}

    <section class="kpi-grid" aria-label="${t('seller.dashboard.kpis')}">
      ${kpi(t('seller.dashboard.kpiApproved'), fmtNumber(products.approved || 0), 'package', '#/products?status=approved')}
      ${kpi(t('seller.dashboard.kpiPending'), fmtNumber(products.pending || 0), 'clock', '#/products?status=pending', products.pending ? 'accent' : '')}
      ${kpi(t('seller.dashboard.kpiRejected'), fmtNumber(products.rejected || 0), 'alert', '#/products?status=rejected', products.rejected ? 'danger' : '')}
      ${kpi(t('seller.dashboard.kpiViews'), fmtNumber(totals.productViews + totals.shopViews), 'eye')}
      ${kpi(t('seller.dashboard.kpiContacts'), fmtNumber(contacts), 'phone')}
      ${kpi(t('seller.dashboard.kpiRating'), shop.reviewCount ? `★ ${Number(shop.rating).toFixed(1)}` : '—', 'star')}
    </section>

    <section class="panel">
      <div class="panel__head"><h2 class="panel__title">${t('seller.dashboard.chart')}</h2></div>
      ${seriesChart(data.series, { label: t('seller.dashboard.chart') })}
      <ul class="channel-list">
        ${['phone', 'telegram', 'instagram', 'whatsapp'].map(
          (channel) => html`<li class="channel-list__item channel-list__item--${channel}">${icon(channel)}<span>${t(`contact.channels.${channel}`)}</span><strong>${fmtNumber(totals.contacts[channel])}</strong></li>`
        )}
      </ul>
    </section>

    <div class="dash-grid">
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">${t('seller.dashboard.top')}</h2>
          <a class="panel__link" href="#/products?sort=views">${t('common.viewAll')}${icon('arrow-right')}</a>
        </div>
        ${data.top.length
          ? html`<ul class="plain-list">${data.top.map(
              (p) => html`<li>
                <img class="thumb thumb--square" src="${safeUrl(p.image || PLACEHOLDER_IMAGE)}" alt="" width="40" height="40" loading="lazy">
                <span class="cell-main__text">
                  <a class="row-link" href="#/products/${p.id}">${loc(p.name)}</a>
                  <span class="cell-sub">${fmtMoney(p.price)}</span>
                </span>
                <span class="cell-sub nowrap">${icon('eye')} ${fmtNumber(p.views)} · ${icon('phone')} ${fmtNumber(p.contacts)}</span>
              </li>`
            )}</ul>`
          : html`<p class="muted">${t('seller.dashboard.noTop')}</p>`}
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">${t('seller.dashboard.lowStock')}</h2>
          <a class="panel__link" href="#/products?stock=low_stock">${t('common.viewAll')}${icon('arrow-right')}</a>
        </div>
        ${data.lowStock.length
          ? html`<ul class="plain-list">${data.lowStock.map(
              (p) => html`<li>
                <span class="cell-main__text"><a class="row-link" href="#/products/${p.id}">${loc(p.name)}</a><span class="cell-sub">${p.sku}</span></span>
                ${stockBadge(p.stock?.status)}
              </li>`
            )}</ul>`
          : html`<p class="muted">${icon('check-circle')} ${t('admin.dashboard.noLowStock')}</p>`}
      </section>
    </div>

    <section class="panel">
      <div class="panel__head">
        <h2 class="panel__title">${t('seller.dashboard.reviews')}</h2>
        <span class="mono-chip">${tn('reviews.count', shop.reviewCount || 0)}</span>
      </div>
      ${data.reviews.length
        ? html`<ul class="plain-list plain-list--reviews">${data.reviews.map(
            (r) => html`<li>
              <span class="mono">★ ${r.rating}</span>
              <span class="cell-main__text"><span>${r.text}</span><span class="cell-sub">${r.authorName} · ${timeCell(r.createdAt)}</span></span>
            </li>`
          )}</ul>`
        : html`<p class="muted">${t('seller.dashboard.noReviews')}</p>`}
    </section>`
  );
  sizeBars(root);
  return { title: t('seller.nav.dashboard') };
}

export async function sellerShopView({ root }) {
  setHTML(root, loadingBlock());
  const [shop, meta] = await Promise.all([api('/api/seller/shop'), getMeta()]);
  setHTML(
    root,
    html`${viewHead({
      title: t('seller.shop.title'),
      lead: t('seller.shop.lead'),
      meta: statusBadge(shop.status, 'shop'),
      actions: shop.status === 'approved' ? html`<a class="btn btn-ghost" href="/shop/${shop.slug}" target="_blank" rel="noopener">${icon('external')}${t('seller.dashboard.openShop')}</a>` : ''
    })}
    ${shopNotice(shop)}
    <form class="panel shop-form" novalidate data-shop-form>
      ${shopFields(shop, meta, { admin: false })}
      <div class="form-actions form-actions--sticky">
        <p class="form-error" role="alert" data-form-error hidden></p>
        <button class="btn btn-accent" type="submit">${icon('check')}${t('common.save')}</button>
      </div>
    </form>`
  );
  const form = $('[data-shop-form]', root);
  liveValidation(form);
  bindImageFields(form, meta);
  let dirty = false;
  form.addEventListener('input', () => (dirty = true));
  form.addEventListener('change', () => (dirty = true));
  setDirtyCheck(() => dirty);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    normalizeNumberInputs(form);
    const values = collectShop(formValues(form));
    const fields = checkShopForm(form, values);
    if (Object.keys(fields).length) {
      showErrors(form, fields, t('errors.validation_failed'));
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/seller/shop', { method: 'PUT', body: values });
      dirty = false;
      toast(t('admin.common.saved'), { type: 'ok' });
    } catch (error) {
      reportError(error, form);
    } finally {
      button.disabled = false;
    }
  });

  return {
    title: t('seller.shop.title'),
    destroy() {
      setDirtyCheck(null);
    }
  };
}

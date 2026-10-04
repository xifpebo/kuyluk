import { html, setHTML, icon, safeUrl, $$ } from '../../lib/dom.js';
import { t, tn, tIn, loc, fmtNumber, fmtDate } from '../../lib/i18n.js';
import { api, can, getSession } from '../../lib/api.js';
import { PLACEHOLDER_IMAGE } from '../../lib/format.js';
import { viewHead, timeCell, loadingBlock, displayValue } from '../shared.js';

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 22) return 'admin.dashboard.greetingEvening';
  if (hour < 12) return 'admin.dashboard.greetingMorning';
  if (hour < 18) return 'admin.dashboard.greeting';
  return 'admin.dashboard.greetingEvening';
}

function kpi({ label, value, iconName, href = null, tone = '', money = false }) {
  const body = html`<span class="kpi__label">${label}${icon(iconName)}</span><span class="kpi__value ${money ? 'kpi__value--money' : ''}">${value}</span>`;
  return href && tone !== 'static'
    ? html`<a class="kpi ${tone ? `kpi--${tone}` : ''}" href="${href}">${body}</a>`
    : html`<div class="kpi ${tone && tone !== 'static' ? `kpi--${tone}` : ''}">${body}</div>`;
}

export function auditSummary(entry) {
  const actor = entry.actor?.name || entry.actor?.email || entry.meta?.email || t('admin.audit.anonymous');
  const target = entry.entity?.label ? ` · ${entry.entity.label}` : '';
  return `${actor} — ${tIn('audit.actions', entry.action)}${target}`;
}

function activityIcon(action) {
  const [scope] = String(action).split('.');
  return (
    {
      auth: 'lock',
      access: 'shield',
      product: 'package',
      category: 'grid',
      brand: 'star',
      shop: 'store',
      review: 'chat',
      banner: 'megaphone',
      settings: 'settings',
      translation: 'globe',
      user: 'users',
      upload: 'image',
      account: 'user'
    }[scope] || 'activity'
  );
}

/** 30-day bar chart (views + contacts); bar heights are set via CSSOM. */
export function seriesChart(series, { label }) {
  const max = Math.max(1, ...series.map((d) => d.views));
  return html`<figure class="spark" aria-label="${label}">
    <div class="spark__bars">
      ${series.map(
        (d) => html`<span class="spark__col" title="${fmtDate(d.day)} · ${t('admin.dashboard.views')}: ${fmtNumber(d.views)} · ${t('admin.dashboard.contacts')}: ${fmtNumber(d.contacts)}">
          <span class="spark__bar" data-h="${d.views / max}"></span>
          <span class="spark__bar spark__bar--accent" data-h="${d.contacts / max}"></span>
        </span>`
      )}
    </div>
    <figcaption class="spark__legend">
      <span><i class="spark__key"></i>${t('admin.dashboard.views')}</span>
      <span><i class="spark__key spark__key--accent"></i>${t('admin.dashboard.contacts')}</span>
      <span class="spark__range">${series.length ? `${fmtDate(series[0].day)} — ${fmtDate(series[series.length - 1].day)}` : ''}</span>
    </figcaption>
  </figure>`;
}

export function sizeBars(root) {
  requestAnimationFrame(() => {
    $$('.spark__bar', root).forEach((bar) => bar.style.setProperty('height', `${Math.max(2, Math.round(Number(bar.dataset.h) * 100))}%`));
  });
}

function renderDashboard(root, data, user) {
  const { kpis } = data;
  const pendingTotal = kpis.pendingProducts + kpis.pendingShops + kpis.pendingReviews;
  setHTML(
    root,
    html`${viewHead({
      title: t(greetingKey(), { name: user.name.split(' ')[0] }),
      lead: t('admin.dashboard.lead'),
      actions: html`${can('products:write') ? html`<a class="btn btn-ghost" href="#/products/new">${icon('plus')}${t('admin.products.new')}</a>` : ''}
        <a class="btn btn-accent" href="#/approvals">${icon('check-circle')}${t('admin.dashboard.openQueue')}${pendingTotal ? html` <span class="btn__count">${pendingTotal}</span>` : ''}</a>`
    })}

    <section class="kpi-grid" aria-label="${t('admin.dashboard.title')}">
      ${kpi({ label: t('admin.dashboard.kpiPendingProducts'), value: fmtNumber(kpis.pendingProducts), iconName: 'inbox', href: '#/approvals', tone: kpis.pendingProducts ? 'accent' : '' })}
      ${kpi({ label: t('admin.dashboard.kpiPendingShops'), value: fmtNumber(kpis.pendingShops), iconName: 'store', href: '#/shops?status=pending', tone: kpis.pendingShops ? 'accent' : '' })}
      ${kpi({ label: t('admin.dashboard.kpiPendingReviews'), value: fmtNumber(kpis.pendingReviews), iconName: 'chat', href: '#/reviews?status=pending', tone: kpis.pendingReviews ? 'accent' : '' })}
      ${kpi({ label: t('admin.dashboard.kpiProducts'), value: fmtNumber(kpis.approvedProducts), iconName: 'package', href: '#/products?status=approved' })}
      ${kpi({ label: t('admin.dashboard.kpiShops'), value: fmtNumber(kpis.activeShops), iconName: 'store', href: '#/shops?status=approved' })}
      ${kpi({ label: t('admin.dashboard.kpiOutOfStock'), value: fmtNumber(kpis.outOfStock), iconName: 'alert', href: '#/products?stock=out_of_stock', tone: kpis.outOfStock ? 'danger' : '' })}
      ${kpi({ label: t('admin.dashboard.kpiViews30'), value: fmtNumber(kpis.views30), iconName: 'eye', tone: 'static' })}
      ${kpi({ label: t('admin.dashboard.kpiContacts30'), value: fmtNumber(kpis.contacts30), iconName: 'phone', tone: 'static' })}
      ${kpi({ label: t('admin.dashboard.kpiUsers30'), value: fmtNumber(kpis.users30), iconName: 'users', href: can('users:manage') ? '#/users' : null, tone: can('users:manage') ? '' : 'static' })}
    </section>

    <section class="panel" aria-labelledby="dash-chart">
      <div class="panel__head"><h2 class="panel__title" id="dash-chart">${t('admin.dashboard.activityChart')}</h2></div>
      ${seriesChart(data.series, { label: t('admin.dashboard.activityChart') })}
    </section>

    <div class="dash-grid">
      <section class="panel" aria-labelledby="dash-pending">
        <div class="panel__head">
          <h2 class="panel__title" id="dash-pending">${t('admin.dashboard.pendingProducts')}</h2>
          <a class="panel__link" href="#/approvals">${t('common.viewAll')}${icon('arrow-right')}</a>
        </div>
        ${data.pending.length
          ? html`<ul class="plain-list">${data.pending.map(
              (product) => html`<li>
                <img class="thumb thumb--square" src="${safeUrl(product.image || PLACEHOLDER_IMAGE)}" alt="" width="40" height="40" loading="lazy">
                <span class="cell-main__text">
                  <a class="row-link" href="#/products/${product.id}">${loc(product.name)}</a>
                  <span class="cell-sub">${product.sku} · ${product.shop}</span>
                </span>
                <span class="cell-sub nowrap">${timeCell(product.submittedAt)}</span>
              </li>`
            )}</ul>`
          : html`<p class="muted">${icon('check-circle')} ${t('admin.moderation.allClear')}</p>`}
      </section>

      <section class="panel" aria-labelledby="dash-shops">
        <div class="panel__head">
          <h2 class="panel__title" id="dash-shops">${t('admin.dashboard.topShops')}</h2>
          <a class="panel__link" href="#/shops">${t('common.viewAll')}${icon('arrow-right')}</a>
        </div>
        ${data.topShops.length
          ? html`<ol class="rank-list">${data.topShops.map(
              (shop) => html`<li>
                <a class="row-link" href="/shop/${shop.slug}" target="_blank" rel="noopener">${shop.name}</a>
                <span class="mono">★ ${Number(shop.rating || 0).toFixed(1)}</span>
                <span class="cell-sub">${tn('reviews.count', shop.reviewCount)}</span>
              </li>`
            )}</ol>`
          : html`<p class="muted">${t('admin.common.empty')}</p>`}
      </section>
    </div>

    ${can('audit:read')
      ? html`<section class="panel" aria-labelledby="dash-activity">
          <div class="panel__head">
            <h2 class="panel__title" id="dash-activity">${t('admin.dashboard.recentActivity')}</h2>
            <a class="panel__link" href="#/audit">${t('common.viewAll')}${icon('arrow-right')}</a>
          </div>
          ${data.recentActivity.length
            ? html`<ul class="activity">${data.recentActivity.map(
                (entry) => html`<li>
                  <span class="activity__icon ${entry.status === 'failure' ? 'is-failure' : ''}">${icon(entry.status === 'failure' ? 'alert' : activityIcon(entry.action))}</span>
                  <span class="activity__text">${auditSummary(entry)}
                    ${entry.changes?.length ? html`<span class="activity__meta">${entry.changes.slice(0, 2).map((c) => `${c.field}: ${displayValue(c.to)}`).join(' · ')}</span>` : ''}
                  </span>
                  <span class="activity__time">${timeCell(entry.at)}</span>
                </li>`
              )}</ul>`
            : html`<p class="muted">${t('admin.common.empty')}</p>`}
        </section>`
      : ''}`
  );
  sizeBars(root);
}

export default async function dashboardView({ root }) {
  setHTML(root, loadingBlock());
  const [data, session] = await Promise.all([api('/api/admin/dashboard'), getSession()]);
  renderDashboard(root, data, session.user);
  return { title: t('admin.dashboard.title') };
}

import { html, setHTML, icon, safeUrl, $$ } from '../../lib/dom.js';
import { t, tIn, loc, fmtMoney, fmtNumber, unitShort } from '../../lib/i18n.js';
import { api, can, getSession } from '../../lib/api.js';
import { viewHead, quoteBadge, stockBadge, timeCell, loadingBlock, QUOTE_TONES, displayValue } from '../shared.js';

const STATUS_ORDER = ['new', 'in_progress', 'quoted', 'accepted', 'rejected', 'cancelled'];

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
      supplier: 'store',
      quote: 'clipboard',
      user: 'users',
      upload: 'image',
      account: 'user'
    }[scope] || 'activity'
  );
}

function renderDashboard(root, data, user) {
  const { kpis } = data;
  const totalQuotes = Object.values(data.quotesByStatus || {}).reduce((sum, n) => sum + n, 0);
  const canQuotes = can('quotes:read');
  setHTML(
    root,
    html`${viewHead({
      title: t(greetingKey(), { name: user.name.split(' ')[0] }),
      lead: t('admin.dashboard.lead'),
      actions: html`${can('products:write') ? html`<a class="btn btn-ghost" href="#/products/new">${icon('plus')}${t('admin.products.new')}</a>` : ''}
        ${canQuotes ? html`<a class="btn btn-accent" href="#/quotes?status=new">${icon('clipboard')}${t('admin.dashboard.openNewQuotes')}</a>` : ''}`
    })}

    <section class="kpi-grid" aria-label="${t('admin.dashboard.title')}">
      ${kpi({ label: t('admin.dashboard.kpiNewQuotes'), value: fmtNumber(kpis.newQuotes), iconName: 'inbox', href: '#/quotes?status=new', tone: kpis.newQuotes ? 'accent' : '' })}
      ${kpi({ label: t('admin.dashboard.kpiPipeline'), value: fmtMoney(kpis.pipelineTotal), iconName: 'layers', href: '#/quotes', money: true })}
      ${kpi({ label: t('admin.dashboard.kpiQuotes30'), value: fmtNumber(kpis.quotes30), iconName: 'calendar', href: '#/quotes' })}
      ${kpi({ label: t('admin.dashboard.kpiProducts'), value: fmtNumber(kpis.activeProducts), iconName: 'package', href: '#/products?active=active' })}
      ${kpi({ label: t('admin.dashboard.kpiOutOfStock'), value: fmtNumber(kpis.outOfStock), iconName: 'alert', href: '#/products?stock=out_of_stock', tone: kpis.outOfStock ? 'danger' : '' })}
      ${kpi({ label: t('admin.dashboard.kpiSuppliers'), value: fmtNumber(kpis.activeSuppliers), iconName: 'store', href: '#/suppliers' })}
    </section>

    <div class="dash-grid">
      <section class="panel" aria-labelledby="dash-quotes">
        <div class="panel__head">
          <h2 class="panel__title" id="dash-quotes">${t('admin.dashboard.recentQuotes')}</h2>
          <a class="panel__link" href="#/quotes">${t('common.viewAll')}${icon('arrow-right')}</a>
        </div>
        ${data.recentQuotes.length
          ? html`<div class="table-scroll"><table class="mini-table">
              <thead><tr><th>${t('admin.quotes.number')}</th><th>${t('admin.quotes.customer')}</th><th>${t('admin.quotes.status')}</th><th class="num">${t('admin.quotes.estimated')}</th><th class="num">${t('admin.quotes.created')}</th></tr></thead>
              <tbody>${data.recentQuotes.map(
                (quote) => html`<tr>
                  <td><a class="row-link mono" href="#/quotes/${quote.id}">${quote.number}</a></td>
                  <td>${quote.customer?.name}<br><span class="cell-sub">${quote.customer?.company || quote.customer?.phone || ''}</span></td>
                  <td>${quoteBadge(quote.status)}</td>
                  <td class="num">${fmtMoney(quote.quotedTotal ?? quote.estimatedTotal)}</td>
                  <td class="num">${timeCell(quote.createdAt)}</td>
                </tr>`
              )}</tbody></table></div>`
          : html`<p class="muted">${t('admin.common.empty')}</p>`}
      </section>

      <section class="panel" aria-labelledby="dash-status">
        <div class="panel__head">
          <h2 class="panel__title" id="dash-status">${t('admin.dashboard.quotesByStatus')}</h2>
          <span class="mono-chip">${fmtNumber(totalQuotes)}</span>
        </div>
        <div class="status-bars">
          ${STATUS_ORDER.map((status) => {
            const count = data.quotesByStatus?.[status] || 0;
            return html`<a class="status-bar" href="#/quotes?status=${status}">
              <span>${t(`quoteStatus.${status}`)}</span>
              <span class="status-bar__track"><span class="status-bar__fill" data-tone="${QUOTE_TONES[status]}" data-share="${totalQuotes ? count / totalQuotes : 0}"></span></span>
              <span class="status-bar__count">${fmtNumber(count)}</span>
            </a>`;
          })}
        </div>
      </section>
    </div>

    <div class="dash-grid">
      <section class="panel" aria-labelledby="dash-stock">
        <div class="panel__head">
          <h2 class="panel__title" id="dash-stock">${t('admin.dashboard.lowStock')}</h2>
          <a class="panel__link" href="#/products?stock=low_stock">${t('common.viewAll')}${icon('arrow-right')}</a>
        </div>
        ${data.lowStock.length
          ? html`<ul class="plain-list">${data.lowStock.map(
              (product) => html`<li>
                <span class="cell-main__text">
                  <a class="row-link" href="#/products/${product.id}">${loc(product.name)}</a>
                  <span class="cell-sub">${product.sku}${product.stock?.quantity != null ? html` · ${fmtNumber(product.stock.quantity)} ${unitShort(product.unit)}` : ''}</span>
                </span>
                ${stockBadge(product.stock?.status)}
              </li>`
            )}</ul>`
          : html`<p class="muted">${icon('check-circle')} ${t('admin.dashboard.noLowStock')}</p>`}
      </section>

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
        : html`<section class="panel" aria-labelledby="dash-help">
            <h2 class="panel__title" id="dash-help">${t('admin.dashboard.shortcuts')}</h2>
            <ul class="plain-list">
              <li><a class="row-link" href="#/products">${icon('package')} ${t('admin.nav.products')}</a></li>
              <li><a class="row-link" href="#/suppliers">${icon('store')} ${t('admin.nav.suppliers')}</a></li>
              <li><a class="row-link" href="#/profile">${icon('user')} ${t('admin.nav.profile')}</a></li>
              <li><a class="row-link" href="${safeUrl('/')}" target="_blank" rel="noopener">${icon('external')} ${t('admin.nav.viewSite')}</a></li>
            </ul>
          </section>`}
    </div>`
  );
  requestAnimationFrame(() => {
    $$('.status-bar__fill', root).forEach((bar) => {
      bar.style.setProperty('width', `${Math.round(Number(bar.dataset.share) * 100)}%`);
    });
  });
}

export default async function dashboardView({ root }) {
  setHTML(root, loadingBlock());
  const [data, session] = await Promise.all([api('/api/admin/dashboard'), getSession()]);
  renderDashboard(root, data, session.user);
  return { title: t('admin.dashboard.title') };
}

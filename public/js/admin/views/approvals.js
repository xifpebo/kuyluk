/**
 * Moderation queue: products, shop applications and reviews waiting for a
 * decision, in one place. Nothing here becomes public until approved.
 */
import { html, setHTML, icon, on, safeUrl, formatPhone } from '../../lib/dom.js';
import { t, loc, fmtMoney } from '../../lib/i18n.js';
import { api, can } from '../../lib/api.js';
import { toast, noteDialog, setBusy } from '../../lib/ui.js';
import { PLACEHOLDER_IMAGE } from '../../lib/format.js';
import { viewHead, timeCell, loadingBlock, messageBlock, reportError } from '../shared.js';
import { changeShopStatus } from './shops.js';
import { reviewCard, bindReviewActions } from './reviews.js';

const TABS = ['products', 'shops', 'reviews'];

function tabPermission(tab) {
  return { products: 'products:approve', shops: 'shops:approve', reviews: 'reviews:moderate' }[tab];
}

async function loadQueue() {
  const allowed = TABS.filter((tab) => can(tabPermission(tab)));
  const requests = {
    products: () => api('/api/admin/products?status=pending&sort=submitted&limit=50'),
    shops: () => api('/api/admin/shops?status=pending&limit=50'),
    reviews: () => api('/api/admin/reviews?status=pending&limit=50')
  };
  const entries = await Promise.all(allowed.map(async (tab) => [tab, await requests[tab]()]));
  return Object.fromEntries(entries);
}

function productItem(product) {
  return html`<article class="queue-item" data-product="${product.id}">
    <img class="queue-item__img" src="${safeUrl(product.images?.[0] || PLACEHOLDER_IMAGE)}" alt="" width="96" height="96" loading="lazy">
    <div class="queue-item__body">
      <a class="queue-item__title row-link" href="#/products/${product.id}">${loc(product.name)}</a>
      <p class="cell-sub">${product.sku} · ${loc(product.categoryName)} · ${product.shopName || ''}</p>
      <p class="queue-item__price">${fmtMoney(product.price)}${product.oldPrice ? html` <s class="cell-sub">${fmtMoney(product.oldPrice)}</s>` : ''}</p>
      <p class="cell-sub">${t('admin.moderation.submitted')}: ${timeCell(product.submittedAt || product.updatedAt)}</p>
    </div>
    <div class="queue-item__actions">
      <a class="btn btn-sm btn-ghost" href="#/products/${product.id}">${icon('eye')}${t('admin.moderation.review')}</a>
      <button class="btn btn-sm btn-accent" type="button" data-approve-product="${product.id}">${icon('check')}${t('admin.moderation.approve')}</button>
      <button class="btn btn-sm btn-ghost" type="button" data-reject-product="${product.id}">${icon('x-circle')}${t('admin.moderation.reject')}</button>
    </div>
  </article>`;
}

function shopItem(shop) {
  return html`<article class="queue-item queue-item--shop" data-shop="${shop.id}">
    <span class="queue-item__img queue-item__img--icon">${shop.logoUrl ? html`<img src="${safeUrl(shop.logoUrl)}" alt="" width="64" height="64">` : icon('store')}</span>
    <div class="queue-item__body">
      <p class="queue-item__title">${shop.name}</p>
      <p class="cell-sub">${t(`regions.${shop.city}`)}${loc(shop.address) ? ` · ${loc(shop.address)}` : ''}</p>
      <p class="cell-sub">${formatPhone(shop.phone)}${shop.telegram ? ` · @${shop.telegram}` : ''}${shop.owner ? ` · ${shop.owner.name} (${shop.owner.email})` : ''}</p>
      ${loc(shop.description) ? html`<p class="queue-item__text">${loc(shop.description)}</p>` : ''}
      <p class="cell-sub">${t('admin.moderation.submitted')}: ${timeCell(shop.createdAt)}</p>
    </div>
    <div class="queue-item__actions">
      <a class="btn btn-sm btn-ghost" href="#/shops?status=pending">${icon('edit')}${t('admin.moderation.review')}</a>
      <button class="btn btn-sm btn-accent" type="button" data-shop-status="approved" data-id="${shop.id}">${icon('check')}${t('admin.moderation.approve')}</button>
      <button class="btn btn-sm btn-ghost" type="button" data-shop-status="rejected" data-id="${shop.id}">${icon('x-circle')}${t('admin.moderation.reject')}</button>
    </div>
  </article>`;
}

function section(tab, data) {
  const count = data?.total || 0;
  const heading = html`<div class="panel__head">
    <h2 class="panel__title">${icon({ products: 'package', shops: 'store', reviews: 'chat' }[tab])}${t(`admin.moderation.tabs.${tab}`)}</h2>
    <span class="mono-chip ${count ? 'mono-chip--accent' : ''}">${count}</span>
  </div>`;
  if (!count) {
    return html`<section class="panel" id="queue-${tab}">${heading}<p class="muted">${icon('check-circle')} ${t('admin.moderation.allClear')}</p></section>`;
  }
  const body =
    tab === 'products'
      ? data.items.map(productItem)
      : tab === 'shops'
        ? data.items.map(shopItem)
        : html`<div class="review-list">${data.items.map((review) => reviewCard(review))}</div>`;
  return html`<section class="panel" id="queue-${tab}">${heading}<div class="queue">${body}</div></section>`;
}

export default async function approvalsView({ root }) {
  setHTML(root, loadingBlock());
  let queue = {};

  const render = () => {
    const total = Object.values(queue).reduce((sum, data) => sum + (data?.total || 0), 0);
    const present = Object.keys(queue);
    setHTML(
      root,
      html`${viewHead({ title: t('admin.moderation.title'), lead: total ? t('admin.moderation.lead', { count: total }) : t('admin.moderation.leadEmpty') })}
      <nav class="chip-tabs" aria-label="${t('admin.moderation.title')}">
        ${present.map((tab) => html`<a class="chip-tab" href="#queue-${tab}" data-jump="${tab}">${t(`admin.moderation.tabs.${tab}`)} <span class="mono">${queue[tab]?.total || 0}</span></a>`)}
      </nav>
      <div class="stack-lg">${present.map((tab) => section(tab, queue[tab]))}</div>
      ${present.length ? '' : messageBlock({ iconName: 'lock', title: t('admin.common.forbiddenView') })}`
    );
  };

  const refresh = async () => {
    queue = await loadQueue();
    render();
  };

  on(root, 'click', '[data-jump]', (event, link) => {
    event.preventDefault();
    root.querySelector(`#queue-${link.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const moderateProduct = async (button, decision) => {
    const id = button.dataset.approveProduct || button.dataset.rejectProduct;
    let note = '';
    if (decision === 'reject') {
      note = await noteDialog({
        title: t('admin.moderation.rejectTitle'),
        text: t('admin.moderation.rejectPrompt'),
        label: t('admin.moderation.note'),
        confirmLabel: t('admin.moderation.reject'),
        danger: true,
        required: true
      });
      if (!note) return;
    }
    setBusy(button, true);
    try {
      await api(`/api/admin/products/${id}/moderate`, { method: 'POST', body: { decision, note } });
      toast(decision === 'approve' ? t('admin.moderation.approved') : t('admin.moderation.rejected'), { type: 'ok' });
      document.dispatchEvent(new CustomEvent('admin:moderation-changed'));
      await refresh();
    } catch (error) {
      reportError(error);
      setBusy(button, false);
    }
  };

  on(root, 'click', '[data-approve-product]', (event, button) => moderateProduct(button, 'approve'));
  on(root, 'click', '[data-reject-product]', (event, button) => moderateProduct(button, 'reject'));
  on(root, 'click', '[data-shop-status]', async (event, button) => {
    const shop = queue.shops?.items.find((entry) => entry.id === button.dataset.id);
    if (!shop) return;
    try {
      if (await changeShopStatus(shop, button.dataset.shopStatus)) await refresh();
    } catch (error) {
      reportError(error);
    }
  });
  bindReviewActions(root, refresh);

  await refresh();
  return { title: t('admin.moderation.title') };
}

/** Total waiting items, for the sidebar badge. */
export async function pendingTotal() {
  const queue = await loadQueue();
  return Object.values(queue).reduce((sum, data) => sum + (data?.total || 0), 0);
}

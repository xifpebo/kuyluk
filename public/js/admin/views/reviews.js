/**
 * Review moderation: customer reviews of products and shops become public
 * only after a moderator approves them.
 */
import { html, setHTML, icon, on, $ } from '../../lib/dom.js';
import { t, loc } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { toast, confirmDialog, setBusy } from '../../lib/ui.js';
import { getMeta, viewHead, statusBadge, timeCell, resultsMeta, searchInput, filterSelect, listController, reportError, skeletonTable, messageBlock } from '../shared.js';

const ENDPOINT = '/api/admin/reviews';

function starsLine(rating) {
  return html`<span class="review-stars" aria-label="${t('reviews.ratingLabel', { rating })}">${[1, 2, 3, 4, 5].map((n) => icon(n <= rating ? 'star-fill' : 'star'))}</span>`;
}

function targetLink(review) {
  if (review.target === 'product' && review.product) {
    return html`${icon('package')}<a class="row-link" href="/product/${review.product.slug}" target="_blank" rel="noopener">${loc(review.product.name)}</a>
      <span class="cell-sub">${review.product.sku}${review.shop ? ` · ${review.shop.name}` : ''}</span>`;
  }
  if (review.shop) {
    return html`${icon('store')}<a class="row-link" href="/shop/${review.shop.slug}" target="_blank" rel="noopener">${review.shop.name}</a>`;
  }
  return html`<span class="muted">${t('admin.reviews.targetRemoved')}</span>`;
}

export function reviewCard(review, { actions = true } = {}) {
  return html`<article class="review-card" data-review="${review.id}">
    <header class="review-card__head">
      ${starsLine(review.rating)}
      ${statusBadge(review.status, 'review')}
      <span class="review-card__time">${timeCell(review.createdAt)}</span>
    </header>
    <p class="review-card__target">${targetLink(review)}</p>
    <blockquote class="review-card__text" lang="${review.lang || ''}">${review.text}</blockquote>
    <footer class="review-card__foot">
      <span class="review-card__author">${icon('user')}${review.authorName}</span>
      ${actions
        ? html`<span class="review-card__actions">
            ${review.status !== 'approved' ? html`<button class="btn btn-sm btn-accent" type="button" data-review-status="approved" data-id="${review.id}">${icon('check')}${t('admin.moderation.approve')}</button>` : ''}
            ${review.status !== 'rejected' ? html`<button class="btn btn-sm btn-ghost" type="button" data-review-status="rejected" data-id="${review.id}">${icon('x-circle')}${t('admin.moderation.reject')}</button>` : ''}
            <button class="btn btn-sm btn-ghost btn-icon" type="button" data-review-delete="${review.id}" aria-label="${t('common.delete')}" title="${t('common.delete')}">${icon('trash')}</button>
          </span>`
        : ''}
    </footer>
  </article>`;
}

/** Delegated approve/reject/delete handlers; `after()` refreshes the list. */
export function bindReviewActions(root, after) {
  on(root, 'click', '[data-review-status]', async (event, button) => {
    setBusy(button, true);
    try {
      await api(`${ENDPOINT}/${button.dataset.id}`, { method: 'PATCH', body: { status: button.dataset.reviewStatus } });
      toast(button.dataset.reviewStatus === 'approved' ? t('admin.reviews.approved') : t('admin.reviews.rejected'), { type: 'ok' });
      document.dispatchEvent(new CustomEvent('admin:moderation-changed'));
      await after();
    } catch (error) {
      reportError(error);
      setBusy(button, false);
    }
  });
  on(root, 'click', '[data-review-delete]', async (event, button) => {
    const ok = await confirmDialog({ title: t('common.delete'), text: t('admin.reviews.confirmDelete'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await api(`${ENDPOINT}/${button.dataset.reviewDelete}`, { method: 'DELETE' });
      toast(t('admin.common.deleted'), { type: 'ok' });
      document.dispatchEvent(new CustomEvent('admin:moderation-changed'));
      await after();
    } catch (error) {
      reportError(error);
    }
  });
}

export default async function reviewsView({ root, query }) {
  const meta = await getMeta();
  setHTML(
    root,
    html`${viewHead({ title: t('admin.reviews.title'), lead: t('admin.reviews.lead') })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ placeholder: t('admin.reviews.searchPlaceholder') })}
      ${filterSelect({
        name: 'status',
        label: t('admin.common.status'),
        allLabel: t('admin.products.allStatuses'),
        options: meta.reviewStatuses.map((value) => ({ value, label: t(`admin.status.review.${value}`) }))
      })}
      ${filterSelect({
        name: 'target',
        label: t('admin.reviews.target'),
        allLabel: t('admin.reviews.allTargets'),
        options: [
          { value: 'product', label: t('admin.reviews.targetProduct') },
          { value: 'shop', label: t('admin.reviews.targetShop') }
        ]
      })}
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <div data-results>${skeletonTable(4)}</div>`
  );
  const results = $('[data-results]', root);
  const ctl = listController({
    root,
    path: '/reviews',
    endpoint: ENDPOINT,
    defaults: {},
    render: (data) => {
      if (!data.items.length) {
        setHTML(results, messageBlock({ iconName: 'chat', title: t('admin.common.empty'), text: t('admin.common.emptyFiltered') }));
        return;
      }
      setHTML(results, html`${resultsMeta(data)}<div class="review-list">${data.items.map((review) => reviewCard(review))}</div>${ctl.pager(data)}`);
    },
    onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
  });
  bindReviewActions(root, () => ctl.load());
  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: t('admin.reviews.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}

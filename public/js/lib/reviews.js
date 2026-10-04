/**
 * Review lists on product and shop pages. The API returns reviews written
 * in the page language; reviews in the other language load only when the
 * visitor asks for them, so a page never mixes languages by default.
 */
import { html, setHTML, on, $ } from './dom.js';
import { t, tn, fmtDate } from './i18n.js';
import { api } from './api.js';
import { setBusy } from './ui.js';
import { stars } from './format.js';

export function reviewItem(r) {
  return html`<li class="review">
    <div class="review__head">
      <span class="review__avatar" aria-hidden="true">${(r.authorName || '?').slice(0, 1)}</span>
      <div><p class="review__author">${r.authorName}</p><p class="review__date">${fmtDate(r.createdAt)}</p></div>
      ${stars(r.rating)}
    </div>
    ${r.text ? html`<p class="review__text" lang="${r.lang}">${r.text}</p>` : ''}
  </li>`;
}

/** List + "more" + "reviews in other language" controls. */
export function reviewList(data) {
  const hasOwn = data.items.length > 0;
  return html`<div class="review-feed" data-review-feed>
    ${hasOwn
      ? html`<ul class="review-list" data-review-list>${data.items.map(reviewItem)}</ul>`
      : html`<p class="muted">${data.allTotal ? t('reviews.noneInLang') : t('reviews.empty')}</p>`}
    <div class="review-feed__actions">
      ${data.pages > 1 ? html`<button class="btn btn-ghost" type="button" data-more-reviews data-page="2">${t('reviews.more')}</button>` : ''}
      ${data.otherCount ? html`<button class="btn btn-ghost" type="button" data-other-reviews>${t('reviews.otherLang', { count: data.otherCount })}</button>` : ''}
    </div>
    <div data-other-feed hidden>
      <h3 class="review-feed__subtitle">${t('reviews.otherLangTitle')}</h3>
      <ul class="review-list" data-other-list></ul>
      <button class="btn btn-ghost" type="button" data-more-other hidden>${t('reviews.more')}</button>
    </div>
  </div>`;
}

/** `query` is `product=<id>` or `shop=<slug>`. */
export function bindReviewList(root, query) {
  const load = async (button, { other, listSelector, moreButton }) => {
    const page = Number(moreButton.dataset.page || 1);
    setBusy(button, true);
    try {
      const data = await api(`/api/catalog/reviews?${query}&page=${page}${other ? '&other=1' : ''}`);
      const list = $(listSelector, root);
      const holder = document.createElement('div');
      setHTML(holder, html`${data.items.map(reviewItem)}`);
      list.append(...holder.children);
      moreButton.dataset.page = String(page + 1);
      moreButton.hidden = page >= data.pages;
    } finally {
      setBusy(button, false);
    }
  };
  on(root, 'click', '[data-more-reviews]', (event, button) =>
    load(button, { other: false, listSelector: '[data-review-list]', moreButton: button }).catch(() => {})
  );
  on(root, 'click', '[data-other-reviews]', async (event, button) => {
    const feed = $('[data-other-feed]', root);
    const more = $('[data-more-other]', root);
    more.dataset.page = '1';
    await load(button, { other: true, listSelector: '[data-other-list]', moreButton: more }).catch(() => {});
    feed.hidden = false;
    button.remove();
  });
  on(root, 'click', '[data-more-other]', (event, button) =>
    load(button, { other: true, listSelector: '[data-other-list]', moreButton: button }).catch(() => {})
  );
}

export function reviewCountLabel(data) {
  return tn('reviews.count', data.allTotal ?? data.total ?? 0);
}

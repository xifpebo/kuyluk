import { $, html, setHTML, icon, safeUrl } from '../lib/dom.js';
import { t, tn } from '../lib/i18n.js';
import { api, getSession } from '../lib/api.js';
import { productGrid } from '../lib/product-card.js';
import { emptyState, errorState, confirmDialog } from '../lib/ui.js';
import { shopUrl } from '../lib/format.js';
import * as favorites from '../lib/favorites.js';
import * as recent from '../lib/recent.js';

/** Favourites grouped by shop, so the customer can contact each shop once. */
async function render() {
  const holder = $('[data-fav-groups]');
  const ids = favorites.list();
  $('[data-fav-clear]').hidden = !ids.length;
  if (!ids.length) {
    setHTML(holder, emptyState({ iconName: 'heart', title: t('favorites.emptyTitle'), text: t('favorites.emptyText'), action: { href: '/catalog', label: t('nav.catalog') } }));
    holder.removeAttribute('aria-busy');
    return;
  }
  try {
    const { items } = await api(`/api/catalog/lookup?ids=${ids.slice(0, 100).join(',')}`);
    const groups = new Map();
    for (const item of items) {
      const key = item.shop?.slug || '_';
      if (!groups.has(key)) groups.set(key, { shop: item.shop, items: [] });
      groups.get(key).items.push(item);
    }
    setHTML(
      holder,
      html`<p class="catalog__count">${tn('favorites.count', items.length)} · ${tn('favorites.shopCount', groups.size)}</p>
        ${[...groups.values()].map(
          (group) => html`<section class="fav-group">
            <header class="fav-group__head">
              <a class="fav-group__shop" href="${shopUrl(group.shop)}"><img src="${safeUrl(group.shop.logoUrl || '/img/logo-mark.svg')}" alt="" width="36" height="36">${group.shop.name}</a>
              <span class="muted">${tn('common.products', group.items.length)}</span>
              <button class="btn btn-accent btn-sm" type="button" data-contact-product="${group.items[0].id}">${icon('phone')}${t('contact.ctaShop')}</button>
            </header>
            <div class="product-grid">${productGrid(group.items)}</div>
          </section>`
        )}`
    );
    const missing = ids.length - items.length;
    if (missing > 0) favorites.list().filter((id) => !items.some((i) => i.id === id)).forEach((id) => favorites.remove(id));
  } catch {
    setHTML(holder, errorState(t('common.errorGeneric')));
  } finally {
    holder.removeAttribute('aria-busy');
  }
}

async function renderRecent() {
  const section = $('[data-recent-section]');
  const ids = recent.list();
  if (!ids.length) return;
  try {
    const { items } = await api(`/api/catalog/lookup?ids=${ids.join(',')}`);
    if (!items.length) return;
    setHTML($('[data-recent]'), productGrid(items.slice(0, 8), { compact: true }));
    section.hidden = false;
    $('[data-recent-clear]').addEventListener('click', () => {
      recent.clear();
      section.hidden = true;
    });
  } catch {
    /* optional */
  }
}

export default async function favoritesPage() {
  getSession()
    .then((session) => {
      if (!session?.user) $('[data-fav-login]').hidden = false;
    })
    .catch(() => {});
  await favorites.initSync();
  await render();
  renderRecent();
  document.addEventListener('favorites:change', (event) => {
    // re-render when an item is removed from this page
    if (event.detail.ids.length < $('[data-fav-groups]').querySelectorAll('.product-card').length) render();
  });
  $('[data-fav-clear]').addEventListener('click', async () => {
    if (await confirmDialog({ title: t('favorites.clear'), text: t('favorites.clearConfirm'), danger: true, confirmLabel: t('favorites.clear') })) {
      favorites.clear();
      render();
    }
  });
}

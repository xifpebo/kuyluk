import { $, html, setHTML, debounce } from '../lib/dom.js';
import { t, tn, loc } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { shopCard } from '../lib/shop-card.js';
import { emptyState, errorState, skeletonCards } from '../lib/ui.js';
import { applyAccents } from '../lib/format.js';
import { loadCategories } from '../lib/chrome.js';

let requestId = 0;

function readState() {
  const params = new URLSearchParams(window.location.search);
  return { q: params.get('q') || '', category: params.get('category') || '', sort: params.get('sort') || 'recommended' };
}

async function load(state) {
  const id = ++requestId;
  const grid = $('[data-shop-grid]');
  grid.setAttribute('aria-busy', 'true');
  setHTML(grid, skeletonCards(6));
  const params = new URLSearchParams({ limit: '48' });
  for (const [key, value] of Object.entries(state)) if (value) params.set(key, value);
  try {
    const data = await api(`/api/catalog/shops?${params}`);
    if (id !== requestId) return;
    $('[data-shop-count]').textContent = tn('shops.count', data.total);
    setHTML(
      grid,
      data.items.length
        ? html`${data.items.map(shopCard)}`
        : emptyState({ iconName: 'store', title: t('shops.emptyTitle'), text: t('shops.emptyText'), action: { href: '/shops', label: t('catalog.resetFilters') } })
    );
    applyAccents(grid);
  } catch {
    setHTML(grid, errorState(t('common.errorGeneric')));
    grid.querySelector('[data-retry]')?.addEventListener('click', () => load(state));
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

export default async function shopsPage() {
  const form = $('[data-shop-filter]');
  const state = readState();
  form.elements.q.value = state.q;
  form.elements.sort.value = state.sort;
  const select = $('[data-shop-category]');
  try {
    const categories = await loadCategories();
    for (const c of categories) {
      const option = document.createElement('option');
      option.value = c.slug;
      option.textContent = loc(c.name);
      select.append(option);
    }
    select.value = state.category;
  } catch {
    /* category filter is optional */
  }
  const apply = () => {
    const next = { q: form.elements.q.value.trim(), category: select.value, sort: form.elements.sort.value };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value && !(key === 'sort' && value === 'recommended')) params.set(key, value);
    window.history.replaceState(null, '', params.toString() ? `/shops?${params}` : '/shops');
    load(next);
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply();
  });
  form.elements.q.addEventListener('input', debounce(apply, 350));
  select.addEventListener('change', apply);
  form.elements.sort.addEventListener('change', apply);
  await load(state);
}

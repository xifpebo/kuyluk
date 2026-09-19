import { $, html, setHTML, on } from '../lib/dom.js';
import { t } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { supplierCard } from '../lib/supplier-card.js';
import { emptyState, errorState, pagination, skeletonCards } from '../lib/ui.js';

let state = readState();

function readState() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: (params.get('q') || '').slice(0, 60),
    page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1)
  };
}

function urlFor(patch) {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query ? `/suppliers?${query}` : '/suppliers';
}

async function load() {
  const grid = $('[data-supplier-grid]');
  const count = $('[data-supplier-count]');
  const pager = $('[data-pagination]');
  grid.setAttribute('aria-busy', 'true');
  setHTML(grid, skeletonCards(6));
  try {
    const params = new URLSearchParams({ page: String(state.page), limit: '24' });
    if (state.q) params.set('q', state.q);
    const result = await api(`/api/catalog/suppliers?${params}`);
    setHTML(count, html`${t('nav.suppliers')}: <strong>${result.total}</strong>`);
    setHTML(
      grid,
      result.items.length
        ? html`${result.items.map(supplierCard)}`
        : emptyState({ iconName: 'store', title: t('suppliers.empty') })
    );
    setHTML(pager, pagination({ page: result.page, pages: result.pages, hrefFor: (page) => urlFor({ page }) }));
    pager.hidden = result.pages <= 1;
  } catch (error) {
    setHTML(grid, errorState(error.message));
    grid.querySelector('[data-retry]')?.addEventListener('click', load);
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

export default function suppliers() {
  const form = $('[data-supplier-search]');
  const input = $('#supplier-q');
  input.value = state.q;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state = { q: input.value.trim(), page: 1 };
    window.history.pushState(null, '', urlFor({}));
    load();
  });
  on($('[data-pagination]'), 'click', 'a[data-page]', (event, link) => {
    event.preventDefault();
    state = { ...state, page: Number(link.dataset.page) };
    window.history.pushState(null, '', urlFor({}));
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('popstate', () => {
    state = readState();
    input.value = state.q;
    load();
  });
  return load();
}

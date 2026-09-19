/**
 * Catalog: faceted filters (brand, material, grade, availability, unit,
 * supplier, thickness, diameter, price, bulk pricing), search, sorting and
 * pagination, all mirrored in the URL.
 */
import { $, $$, html, setHTML, icon, on, debounce, readBoot } from '../lib/dom.js';
import { t, tn, loc, fmtNumber, unitName } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { productGrid } from '../lib/product-card.js';
import { drawer, emptyState, errorState, pagination, skeletonCards } from '../lib/ui.js';
import { loadCategories } from '../lib/chrome.js';

const MULTI = ['stock', 'brand', 'material', 'grade', 'unit', 'supplier', 'thickness', 'diameter'];
const PAGE_SIZE = 24;
const FACET_PREVIEW = 6;

let state = readState();
let categories = [];
let lastResult = null;
let requestId = 0;
const expanded = new Set();

function readState() {
  const params = new URLSearchParams(window.location.search);
  const next = {
    q: (params.get('q') || '').slice(0, 100),
    category: params.get('category') || '',
    sort: params.get('sort') || 'recommended',
    page: Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
    priceMin: params.get('priceMin') || '',
    priceMax: params.get('priceMax') || '',
    bulk: params.get('bulk') === 'true',
    featured: params.get('featured') === 'true'
  };
  for (const key of MULTI) {
    next[key] = (params.get(key) || '').split(',').map((v) => v.trim()).filter(Boolean);
  }
  return next;
}

function toParams(source = state) {
  const params = new URLSearchParams();
  if (source.q) params.set('q', source.q);
  if (source.category) params.set('category', source.category);
  for (const key of MULTI) if (source[key].length) params.set(key, source[key].join(','));
  if (source.priceMin) params.set('priceMin', source.priceMin);
  if (source.priceMax) params.set('priceMax', source.priceMax);
  if (source.bulk) params.set('bulk', 'true');
  if (source.featured) params.set('featured', 'true');
  if (source.sort && source.sort !== 'recommended') params.set('sort', source.sort);
  if (source.page > 1) params.set('page', String(source.page));
  return params;
}

function urlFor(patch) {
  const params = toParams({ ...state, ...patch });
  const query = params.toString();
  return query ? `/catalog?${query}` : '/catalog';
}

function activeFilterCount() {
  let total = MULTI.reduce((sum, key) => sum + state[key].length, 0);
  if (state.priceMin || state.priceMax) total += 1;
  if (state.bulk) total += 1;
  if (state.featured) total += 1;
  if (state.category) total += 1;
  return total;
}

/* ----------------------------------------------------------- labels */
function valueLabel(key, value, facets) {
  switch (key) {
    case 'stock':
      return t(`stock.${value}`);
    case 'material':
      return t(`materials.${value}`);
    case 'unit':
      return unitName(value);
    case 'thickness':
      return `${fmtNumber(value)} ${t('common.mm')}`;
    case 'diameter':
      return `Ø${fmtNumber(value)} ${t('common.mm')}`;
    case 'brand':
      return facets?.brands?.find((b) => b.slug === value)?.name || value;
    case 'supplier': {
      const supplier = facets?.suppliers?.find((s) => s.slug === value);
      return supplier ? `${supplier.stallNumber} · ${supplier.name}` : value;
    }
    default:
      return value;
  }
}

const GROUP_TITLES = {
  stock: 'catalog.availability',
  brand: 'catalog.brand',
  material: 'catalog.material',
  grade: 'catalog.grade',
  unit: 'catalog.unit',
  supplier: 'catalog.supplier',
  thickness: 'catalog.thickness',
  diameter: 'catalog.diameter'
};

function facetOptions(key, facets) {
  const source = {
    stock: facets.stock,
    brand: facets.brands.map((b) => ({ value: b.slug, count: b.count })),
    material: facets.materials,
    grade: facets.grades,
    unit: facets.units,
    supplier: facets.suppliers.map((s) => ({ value: s.slug, count: s.count })),
    thickness: facets.thickness.map((row) => ({ value: String(row.value), count: row.count })),
    diameter: facets.diameter.map((row) => ({ value: String(row.value), count: row.count }))
  }[key] || [];
  const options = source.map((row) => ({ value: String(row.value), count: row.count }));
  if (key === 'stock') {
    const order = ['in_stock', 'low_stock', 'on_order', 'out_of_stock'];
    options.sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
  }
  for (const selected of state[key]) {
    if (!options.some((option) => option.value === selected)) options.push({ value: selected, count: 0 });
  }
  return options;
}

/* ---------------------------------------------------------- filters */
function categoryGroup() {
  const current = state.category;
  return html`<details class="filter-group" open>
    <summary class="filter-group__title">${t('catalog.category')}${icon('chevron-down')}</summary>
    <ul class="category-links">
      <li><a href="${urlFor({ category: '', page: 1 })}" data-category="" ${!current ? html`aria-current="true"` : ''}>
        ${icon('grid')}<span>${t('catalog.allCategories')}</span></a></li>
      ${categories.map(
        (c) => html`<li><a href="${urlFor({ category: c.slug, page: 1 })}" data-category="${c.slug}" ${c.slug === current ? html`aria-current="true"` : ''}>
          ${icon(c.icon)}<span>${loc(c.name)}</span><span class="facet__count">${c.productCount}</span></a></li>`
      )}
    </ul>
  </details>`;
}

function checkboxGroup(key, facets) {
  const options = facetOptions(key, facets);
  if (!options.length) return '';
  const open = state[key].length > 0 || ['stock', 'brand', 'material'].includes(key);
  const showAll = expanded.has(key) || options.length <= FACET_PREVIEW + 1;
  const visible = showAll ? options : options.slice(0, FACET_PREVIEW);
  return html`<details class="filter-group" ${open ? 'open' : ''} data-group="${key}">
    <summary class="filter-group__title">${t(GROUP_TITLES[key])}${icon('chevron-down')}</summary>
    <div class="facet-list">
      ${visible.map((option) => {
        const checked = state[key].includes(option.value);
        return html`<label class="facet ${option.count === 0 && !checked ? 'is-empty' : ''}">
          <input type="checkbox" data-facet="${key}" value="${option.value}" ${checked ? 'checked' : ''}>
          <span class="checkbox__box" aria-hidden="true">${icon('check')}</span>
          <span class="facet__label">${valueLabel(key, option.value, facets)}</span>
          <span class="facet__count">${option.count}</span>
        </label>`;
      })}
    </div>
    ${showAll ? '' : html`<button class="facet-more" type="button" data-expand="${key}">${t('catalog.facetMore', { count: options.length - FACET_PREVIEW })}</button>`}
  </details>`;
}

function priceGroup(facets) {
  const range = facets.price;
  return html`<details class="filter-group" open>
    <summary class="filter-group__title">${t('catalog.price')}${icon('chevron-down')}</summary>
    <div class="range">
      <label><span class="visually-hidden">${t('catalog.price')} ${t('catalog.priceMin')}</span>
        <input class="control control--compact" type="text" inputmode="numeric" data-price="priceMin" value="${state.priceMin}"
          placeholder="${t('catalog.priceMin')} ${range ? fmtNumber(range.min) : ''}"></label>
      <label><span class="visually-hidden">${t('catalog.price')} ${t('catalog.priceMax')}</span>
        <input class="control control--compact" type="text" inputmode="numeric" data-price="priceMax" value="${state.priceMax}"
          placeholder="${t('catalog.priceMax')} ${range ? fmtNumber(range.max) : ''}"></label>
    </div>
  </details>`;
}

function togglesGroup() {
  return html`<div class="filter-group">
    <label class="toggle-row"><span>${t('catalog.bulkOnly')}</span>
      <span class="switch"><input type="checkbox" data-toggle="bulk" ${state.bulk ? 'checked' : ''}><span class="switch__track"></span></span>
    </label>
    <label class="toggle-row"><span>${t('catalog.featuredOnly')}</span>
      <span class="switch"><input type="checkbox" data-toggle="featured" ${state.featured ? 'checked' : ''}><span class="switch__track"></span></span>
    </label>
  </div>`;
}

function renderFilters(facets) {
  const holder = $('[data-filter-groups]');
  const openState = new Map($$('details[data-group]', holder).map((el) => [el.dataset.group, el.open]));
  setHTML(
    holder,
    html`${categoryGroup()}
      ${checkboxGroup('stock', facets)}
      ${checkboxGroup('brand', facets)}
      ${checkboxGroup('material', facets)}
      ${checkboxGroup('grade', facets)}
      ${checkboxGroup('thickness', facets)}
      ${checkboxGroup('diameter', facets)}
      ${checkboxGroup('unit', facets)}
      ${checkboxGroup('supplier', facets)}
      ${priceGroup(facets)}
      ${togglesGroup()}`
  );
  for (const [key, open] of openState) {
    const el = holder.querySelector(`details[data-group="${key}"]`);
    if (el) el.open = open;
  }
  const qInput = $('#filter-q');
  if (qInput && document.activeElement !== qInput) qInput.value = state.q;
}

function renderChips(facets) {
  const chips = [];
  const chip = (label, value, patch) =>
    html`<span class="chip"><span class="chip__label">${label}:</span> ${value}
      <button class="chip__remove" type="button" data-remove='${JSON.stringify(patch)}' aria-label="${t('catalog.removeFilter', { name: value })}">${icon('close')}</button></span>`;
  if (state.q) chips.push(chip(t('common.search'), state.q, { q: '' }));
  if (state.category) {
    const category = categories.find((c) => c.slug === state.category);
    chips.push(chip(t('catalog.category'), category ? loc(category.name) : state.category, { category: '' }));
  }
  for (const key of MULTI) {
    for (const value of state[key]) {
      chips.push(chip(t(GROUP_TITLES[key]), valueLabel(key, value, facets), { [key]: state[key].filter((v) => v !== value) }));
    }
  }
  if (state.priceMin || state.priceMax) {
    const text = `${state.priceMin ? fmtNumber(state.priceMin) : '0'} – ${state.priceMax ? fmtNumber(state.priceMax) : '∞'}`;
    chips.push(chip(t('catalog.price'), text, { priceMin: '', priceMax: '' }));
  }
  if (state.bulk) chips.push(chip(t('catalog.bulkBadge'), t('common.yes'), { bulk: false }));
  if (state.featured) chips.push(chip(t('catalog.featuredOnly'), t('common.yes'), { featured: false }));
  if (chips.length > 1) {
    chips.push(html`<button class="chip chip--clear" type="button" data-clear-all>${t('catalog.clearAll')}</button>`);
  }
  setHTML($('[data-active-filters]'), html`${chips}`);
}

function renderHeading() {
  const category = categories.find((c) => c.slug === state.category);
  const title = $('[data-catalog-title]');
  const lead = $('[data-catalog-lead]');
  const crumb = $('[data-crumb-current]');
  let heading = t('catalog.title');
  if (category) heading = loc(category.name);
  title.textContent = heading;
  const leadText = state.q ? t('catalog.searchResultsFor', { q: state.q }) : category ? loc(category.description) : '';
  lead.textContent = leadText;
  lead.hidden = !leadText;
  crumb.textContent = category ? loc(category.name) : '';
  crumb.hidden = !category;
  const siteName = readBoot().siteName || '';
  document.title = `${state.q ? t('catalog.searchResultsFor', { q: state.q }) : heading} — ${siteName}`;
  const count = activeFilterCount();
  $('[data-filters-label]').textContent = count ? t('catalog.filtersCount', { count }) : t('catalog.filters');
}

function renderResults(result) {
  const grid = $('[data-product-grid]');
  const counter = $('[data-result-count]');
  setHTML(counter, html`<strong>${tn('catalog.results', result.total)}</strong>`);
  if (!result.items.length) {
    setHTML(
      grid,
      emptyState({ iconName: 'search', title: t('catalog.emptyTitle'), text: t('catalog.emptyText'), action: { href: '/catalog', label: t('catalog.resetFilters') } })
    );
  } else {
    setHTML(grid, productGrid(result.items));
  }
  const pager = $('[data-pagination]');
  setHTML(pager, pagination({ page: result.page, pages: result.pages, hrefFor: (page) => urlFor({ page }) }));
  pager.hidden = result.pages <= 1;
  const apply = $('[data-filters-apply]');
  if (apply) apply.textContent = tn('catalog.showResults', result.total);
}

async function load({ scroll = false } = {}) {
  const id = ++requestId;
  const grid = $('[data-product-grid]');
  grid.setAttribute('aria-busy', 'true');
  if (!lastResult) setHTML(grid, skeletonCards(8));
  else grid.style.setProperty('opacity', '0.55');
  renderHeading();
  const params = toParams();
  params.set('facets', 'true');
  params.set('limit', String(PAGE_SIZE));
  try {
    const result = await api(`/api/catalog/products?${params.toString()}`);
    if (id !== requestId) return;
    lastResult = result;
    if (result.pages && state.page > result.pages) {
      update({ page: result.pages });
      return;
    }
    renderFilters(result.facets);
    renderChips(result.facets);
    renderResults(result);
    if (scroll) $('.catalog__results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (id !== requestId) return;
    setHTML(grid, errorState(t('catalog.loadError')));
    $('[data-result-count]').textContent = '';
  } finally {
    if (id === requestId) {
      grid.removeAttribute('aria-busy');
      grid.style.removeProperty('opacity');
    }
  }
}

function update(patch, { push = true, scroll = false } = {}) {
  const resetsPage = Object.keys(patch).some((key) => key !== 'page');
  state = { ...state, ...patch };
  if (resetsPage && patch.page === undefined) state.page = 1;
  const url = urlFor({});
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
  load({ scroll });
}

const debouncedUpdate = debounce((patch) => update(patch), 250);

function bindEvents(filterDrawer) {
  const form = $('[data-filter-form]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    update({ q: $('#filter-q').value.trim() });
  });
  $('#filter-q').addEventListener('input', debounce((event) => {
    const value = event.target.value.trim();
    if (value !== state.q && (value.length === 0 || value.length >= 2)) update({ q: value }, { push: false });
  }, 450));

  on(form, 'change', '[data-facet]', (event, input) => {
    const key = input.dataset.facet;
    const values = new Set(state[key]);
    if (input.checked) values.add(input.value);
    else values.delete(input.value);
    debouncedUpdate({ [key]: [...values] });
  });
  on(form, 'change', '[data-toggle]', (event, input) => update({ [input.dataset.toggle]: input.checked }));
  on(form, 'change', '[data-price]', (event, input) => {
    const digits = input.value.replace(/[^\d]/g, '');
    update({ [input.dataset.price]: digits });
  });
  on(form, 'keydown', '[data-price]', (event, input) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  on(form, 'click', '[data-category]', (event, link) => {
    event.preventDefault();
    update({ category: link.dataset.category });
  });
  on(form, 'click', '[data-expand]', (event, button) => {
    expanded.add(button.dataset.expand);
    if (lastResult) renderFilters(lastResult.facets);
  });

  const chips = $('[data-active-filters]');
  on(chips, 'click', '[data-remove]', (event, button) => update(JSON.parse(button.dataset.remove)));
  on(chips, 'click', '[data-clear-all]', () => {
    const reset = { q: '', category: '', priceMin: '', priceMax: '', bulk: false, featured: false };
    for (const key of MULTI) reset[key] = [];
    update(reset);
  });

  $('[data-sort]').addEventListener('change', (event) => update({ sort: event.target.value }));
  $('[data-filters-reset]').addEventListener('click', () => {
    const reset = { q: '', priceMin: '', priceMax: '', bulk: false, featured: false };
    for (const key of MULTI) reset[key] = [];
    update(reset);
  });

  on($('[data-pagination]'), 'click', 'a[data-page]', (event, link) => {
    event.preventDefault();
    const page = Number(link.dataset.page);
    if (page !== state.page) update({ page }, { scroll: true });
  });

  const openButton = $('[data-filters-open]');
  openButton.addEventListener('click', () => {
    openButton.setAttribute('aria-expanded', 'true');
    filterDrawer.open(openButton);
  });
  $('[data-filters-apply]').addEventListener('click', () => filterDrawer.close());

  window.addEventListener('popstate', () => {
    state = readState();
    $('[data-sort]').value = state.sort;
    load();
  });
}

export default async function catalog() {
  const root = $('[data-filters]');
  const filterDrawer = drawer(root, {
    openClass: 'is-open',
    panel: $('.filters__panel', root),
    onClose: () => $('[data-filters-open]').setAttribute('aria-expanded', 'false')
  });
  $$('[data-filters-close]', root).forEach((el) => el.addEventListener('click', () => filterDrawer.close()));
  $('[data-sort]').value = state.sort;
  bindEvents(filterDrawer);
  try {
    categories = await loadCategories();
  } catch {
    categories = [];
  }
  await load();
}

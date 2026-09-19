/**
 * Shared admin building blocks: data loading caches, list state kept in the
 * URL hash, form controls (incl. bilingual inputs), tables, slide-over
 * panels and the unsaved-changes guard.
 *
 * Everything renders through the escaping `html` template; no inline
 * styles or handlers (the CSP forbids both).
 */
import { SafeHtml, html, setHTML, icon, on, debounce, escapeHtml, uniqueId, $$ } from '../lib/dom.js';
import { t, fmtDateTime, fmtRelative } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { badge, pagination, confirmDialog, toast } from '../lib/ui.js';
import { showErrors } from '../lib/forms.js';

export const LANGS = ['uz', 'ru'];

export const STOCK_TONES = { in_stock: 'ok', low_stock: 'warn', on_order: 'info', out_of_stock: 'danger' };
export const QUOTE_TONES = {
  new: 'info',
  in_progress: 'warn',
  quoted: 'accent',
  accepted: 'ok',
  rejected: 'danger',
  cancelled: 'muted'
};
export const ROLE_TONES = { superadmin: 'hazard', manager: 'info', user: 'muted' };

/* ------------------------------------------------------------ caches */
let metaPromise = null;
let optionsPromise = null;

/** Enumerations shared with the server (units, materials, statuses…). */
export function getMeta() {
  if (!metaPromise) {
    metaPromise = api('/api/meta').catch((error) => {
      metaPromise = null;
      throw error;
    });
  }
  return metaPromise;
}

/** Categories, brands, suppliers and staff for form selects. */
export function getOptions({ force = false } = {}) {
  if (force || !optionsPromise) {
    optionsPromise = api('/api/admin/options').catch((error) => {
      optionsPromise = null;
      throw error;
    });
  }
  return optionsPromise;
}

export function invalidateOptions() {
  optionsPromise = null;
}

/* ---------------------------------------------------------- hash URLs */
export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '');
  const [path, search = ''] = raw.split('?');
  return { path: path || '/dashboard', query: new URLSearchParams(search) };
}

export function buildHash(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (key === 'page' && Number(value) <= 1) continue;
    query.set(key, String(value));
  }
  const search = query.toString();
  return `#${path}${search ? `?${search}` : ''}`;
}

/* ----------------------------------------------------- dirty guard */
let dirtyCheck = null;

export function setDirtyCheck(fn) {
  dirtyCheck = fn;
}

export function isDirty() {
  try {
    return Boolean(dirtyCheck && dirtyCheck());
  } catch {
    return false;
  }
}

export async function confirmDiscard() {
  if (!isDirty()) return true;
  const ok = await confirmDialog({
    title: t('admin.common.confirmTitle'),
    text: t('admin.common.unsaved'),
    confirmLabel: t('admin.common.discard'),
    danger: true
  });
  if (ok) dirtyCheck = null;
  return ok;
}

/* ------------------------------------------------------------ markup */

/** Attribute list from a plain object; `true` renders a bare attribute. */
export function attrs(map = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined || value === null || value === false) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(key)) continue;
    parts.push(value === true ? key : `${key}="${escapeHtml(value)}"`);
  }
  return new SafeHtml(parts.join(' '));
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((part) => Array.from(part)[0] || '').join('').toUpperCase() || '?';
}

export function stockBadge(status) {
  return badge(t(`stock.${status}`), STOCK_TONES[status] || 'muted', { dot: true });
}

export function quoteBadge(status) {
  return badge(t(`quoteStatus.${status}`), QUOTE_TONES[status] || 'muted', { dot: status !== 'quoted' });
}

export function roleBadge(role) {
  return badge(t(`admin.roles.${role}`), ROLE_TONES[role] || 'muted');
}

export function activeBadge(active) {
  return active
    ? badge(t('admin.common.active'), 'ok', { dot: true })
    : badge(t('admin.common.inactive'), 'muted', { dot: true });
}

export function timeCell(value) {
  if (!value) return html`<span class="muted">${t('admin.common.none')}</span>`;
  return html`<time datetime="${new Date(value).toISOString()}" title="${fmtDateTime(value)}">${fmtRelative(value)}</time>`;
}

export function viewHead({ title, lead = '', actions = '', back = null, meta = '' }) {
  return html`<header class="view-head">
    <div class="view-head__text">
      ${back ? html`<a class="back-link" href="${back.href}">${icon('chevron-left')}${back.label}</a>` : ''}
      <h1 class="view-title">${title}</h1>
      ${lead ? html`<p class="view-lead">${lead}</p>` : ''}
      ${meta ? html`<div class="view-meta">${meta}</div>` : ''}
    </div>
    ${actions ? html`<div class="view-head__actions">${actions}</div>` : ''}
  </header>`;
}

export function sectionTitle(text, { iconName = '', num = '', aside = '' } = {}) {
  return html`<h2 class="section-title">
    ${num ? html`<span class="section-title__num">${num}</span>` : ''}${iconName ? icon(iconName) : ''}<span>${text}</span>
    ${aside ? html`<span class="section-title__aside">${aside}</span>` : ''}
  </h2>`;
}

export function loadingBlock() {
  return html`<div class="admin-loading"><span class="spinner" aria-hidden="true"></span>${t('common.loading')}</div>`;
}

export function skeletonTable(rows = 6) {
  return html`<div class="table-wrap skeleton-table" aria-hidden="true">
    ${Array.from({ length: rows }, () => html`<div class="skeleton skeleton-line"></div>`)}
  </div>`;
}

export function messageBlock({ iconName = 'info', title, text = '', action = null }) {
  return html`<div class="empty-state view-message">
    <span class="empty-state__icon">${icon(iconName)}</span>
    <h2 class="empty-state__title">${title}</h2>
    ${text ? html`<p>${text}</p>` : ''}
    ${action ? html`<a class="btn btn-ghost" href="${action.href}">${action.label}</a>` : ''}
  </div>`;
}

/* ------------------------------------------------------ form controls */
function labelFor(id, label, { required = false, optional = false } = {}) {
  return html`<label class="field__label" for="${id}">${label}${
    optional && !required ? html` <span class="field__optional">(${t('common.optional')})</span>` : ''
  }</label>`;
}

/**
 * Text-like input. `attributes` passes through (maxlength, pattern, min,
 * step, inputmode, autocomplete, data-*…).
 */
export function inputField({
  name,
  label,
  value = '',
  type = 'text',
  required = false,
  optional = false,
  hint = '',
  className = '',
  attributes = {},
  disabled = false
}) {
  const id = uniqueId('fld');
  const shown = value === null || value === undefined ? '' : value;
  return html`<div class="field ${className}">
    ${labelFor(id, label, { required, optional })}
    <input class="control" id="${id}" name="${name}" type="${type}" value="${shown}"
      ${attrs({ required, disabled, ...attributes })}>
    ${hint ? html`<p class="field__hint">${hint}</p>` : ''}
  </div>`;
}

export function numberField({ name, label, value = null, min = 0, max, step = 'any', integer = false, ...rest }) {
  return inputField({
    name,
    label,
    value: value ?? '',
    type: 'text',
    ...rest,
    attributes: {
      inputmode: integer ? 'numeric' : 'decimal',
      'data-type': 'number',
      'data-min': min,
      'data-max': max,
      'data-step': step,
      autocomplete: 'off',
      ...(rest.attributes || {})
    }
  });
}

export function textareaField({ name, label, value = '', rows = 4, required = false, optional = false, hint = '', className = '', attributes = {} }) {
  const id = uniqueId('fld');
  return html`<div class="field ${className}">
    ${labelFor(id, label, { required, optional })}
    <textarea class="control" id="${id}" name="${name}" rows="${rows}" ${attrs({ required, ...attributes })}>${value || ''}</textarea>
    ${hint ? html`<p class="field__hint">${hint}</p>` : ''}
  </div>`;
}

/** `options`: [{ value, label, disabled }] */
export function selectField({ name, label, options, value = '', required = false, optional = false, placeholder = null, hint = '', className = '', attributes = {} }) {
  const id = uniqueId('fld');
  return html`<div class="field ${className}">
    ${labelFor(id, label, { required, optional })}
    <select class="control" id="${id}" name="${name}" ${attrs({ required, ...attributes })}>
      ${placeholder !== null ? html`<option value="">${placeholder}</option>` : ''}
      ${options.map(
        (option) =>
          html`<option value="${option.value}" ${attrs({ selected: String(option.value) === String(value ?? ''), disabled: option.disabled })}>${option.label}</option>`
      )}
    </select>
    ${hint ? html`<p class="field__hint">${hint}</p>` : ''}
  </div>`;
}

export function switchField({ name, label, checked = false, hint = '', disabled = false }) {
  return html`<label class="switch-row ${disabled ? 'is-disabled' : ''}">
    <span class="switch-row__text">${label}${hint ? html`<span class="switch-row__hint">${hint}</span>` : ''}</span>
    <span class="switch"><input type="checkbox" name="${name}" ${attrs({ checked, disabled })}><span class="switch__track"></span></span>
  </label>`;
}

export function checkbox({ name, label, value = '', checked = false, multi = false }) {
  return html`<label class="checkbox">
    <input type="checkbox" name="${name}" value="${value}" ${attrs({ checked, 'data-multi': multi })}>
    <span class="checkbox__box">${icon('check')}</span><span>${label}</span>
  </label>`;
}

/** Bilingual text input pair: `${name}.uz` / `${name}.ru`. */
export function locField({ name, label, value = null, required = false, multiline = false, rows = 3, max = 200, min = 0, hint = '', stacked = false, className = '' }) {
  const current = value || {};
  return html`<fieldset class="loc-field ${stacked || multiline ? 'loc-field--stacked' : ''} ${className}">
    <legend class="field__label">${label}${required ? '' : html` <span class="field__optional">(${t('common.optional')})</span>`}</legend>
    <div class="loc-field__grid">
      ${LANGS.map((lang) => {
        const id = uniqueId('loc');
        const common = attrs({
          required,
          maxlength: max,
          minlength: min || undefined,
          lang,
          'aria-label': `${label} — ${t(`admin.common.${lang}`)}`
        });
        return html`<div class="field">
          <div class="loc-input">
            <span class="loc-tag" aria-hidden="true">${lang.toUpperCase()}</span>
            ${multiline
              ? html`<textarea class="control" id="${id}" name="${name}.${lang}" rows="${rows}" ${common}>${current[lang] || ''}</textarea>`
              : html`<input class="control" id="${id}" name="${name}.${lang}" type="text" value="${current[lang] || ''}" ${common}>`}
          </div>
        </div>`;
      })}
    </div>
    ${hint ? html`<p class="field__hint">${hint}</p>` : ''}
  </fieldset>`;
}

/** Turn `{ 0: {...}, 1: {...} }` (from dotted names) into an array. */
export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key]);
}

/** Client-side check for numeric text inputs marked data-type="number". */
export function validateNumbers(form) {
  const fields = {};
  for (const element of form.elements) {
    if (element.dataset.type !== 'number' || !element.name || element.disabled) continue;
    const raw = element.value.trim();
    if (!raw) continue;
    const number = Number(raw.replace(',', '.').replace(/\s+/g, ''));
    if (!Number.isFinite(number)) fields[element.name] = t('validation.invalid_number');
    else if (element.dataset.min !== undefined && element.dataset.min !== '' && number < Number(element.dataset.min)) {
      fields[element.name] = t('validation.too_small', { min: element.dataset.min });
    } else if (element.dataset.max !== undefined && element.dataset.max !== '' && number > Number(element.dataset.max)) {
      fields[element.name] = t('validation.too_big', { max: element.dataset.max });
    } else if (element.inputMode === 'numeric' && !Number.isInteger(number)) {
      fields[element.name] = t('validation.not_integer');
    }
  }
  return fields;
}

/** Normalise "12 500,5" style input before formValues() reads it. */
export function normalizeNumberInputs(form) {
  for (const element of form.elements) {
    if (element.dataset.type === 'number' && element.value) {
      element.value = element.value.trim().replace(/\s+/g, '').replace(',', '.');
    }
  }
}

export function reportError(error, form = null) {
  if (error?.name === 'AbortError') return;
  if (error?.code === 'password_change_required') {
    document.dispatchEvent(new CustomEvent('admin:password-required'));
    return;
  }
  if (form) {
    showErrors(form, error.fields || {}, error.message);
    if (!form.querySelector('[data-form-error]')) toast(error.message, { type: 'error' });
  } else {
    toast(error.message || t('common.errorGeneric'), { type: 'error' });
  }
}

/* --------------------------------------------------------- data table */
/**
 * `columns`: [{ label, className, primary, render(row) }]
 * Rows become cards on narrow screens (data-label on each cell).
 */
export function dataTable({ columns, rows, rowAttrs = () => ({}), className = '' }) {
  return html`<div class="table-wrap">
    <table class="data-table data-table--cards ${className}">
      <thead><tr>${columns.map((column) => html`<th class="${column.className || ''}" scope="col">${column.label}</th>`)}</tr></thead>
      <tbody>
        ${rows.map(
          (row) => html`<tr ${attrs(rowAttrs(row))}>
            ${columns.map(
              (column) =>
                html`<td class="${column.className || ''} ${column.primary ? 'cell-primary' : ''}" data-label="${column.label}">${column.render(row)}</td>`
            )}
          </tr>`
        )}
      </tbody>
    </table>
  </div>`;
}

export function resultsMeta(data) {
  const from = data.total ? (data.page - 1) * data.limit + 1 : 0;
  const to = Math.min(data.total, data.page * data.limit);
  return html`<p class="results-meta"><span>${t('admin.common.showing', { from, to })}</span>
    <span>${html`${t('admin.common.totalLabel')}: <strong>${data.total}</strong>`}</span></p>`;
}

export function searchInput({ name = 'q', placeholder = t('admin.common.search'), value = '' }) {
  return html`<label class="input-icon">
    <span class="visually-hidden">${placeholder}</span>
    ${icon('search')}
    <input class="control control--compact" type="search" name="${name}" value="${value}" placeholder="${placeholder}" autocomplete="off" maxlength="100">
  </label>`;
}

export function filterSelect({ name, label, options, value = '', allLabel }) {
  return html`<select class="control control--compact" name="${name}" aria-label="${label}">
    <option value="">${allLabel}</option>
    ${options.map((option) => html`<option value="${option.value}" ${attrs({ selected: String(option.value) === String(value) })}>${option.label}</option>`)}
  </select>`;
}

/**
 * List state mirrored into the hash query. Filter controls live in
 * `[data-filters]`; results render into `[data-results]`.
 */
export function listController({ root, path, endpoint, defaults = {}, render, onError }) {
  const state = { ...defaults };
  let controller = null;
  const form = root.querySelector('[data-filters]');
  const results = root.querySelector('[data-results]');

  function syncControls() {
    if (!form) return;
    for (const element of form.elements) {
      if (!element.name || element === document.activeElement) continue;
      element.value = state[element.name] ?? '';
    }
  }

  function fromQuery(query) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, defaults);
    for (const [key, value] of query) {
      if (value === '') continue;
      state[key] = key === 'page' ? Math.max(1, Number.parseInt(value, 10) || 1) : value;
    }
    syncControls();
  }

  function currentHash() {
    return buildHash(path, state);
  }

  async function load() {
    controller?.abort();
    controller = new AbortController();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
    }
    results?.setAttribute('aria-busy', 'true');
    try {
      const data = await api(`${endpoint}?${params}`, { signal: controller.signal });
      if (data.pages && state.page > data.pages) {
        state.page = data.pages;
        window.history.replaceState(null, '', currentHash());
        await load();
        return;
      }
      render(data, state);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (onError) onError(error);
      else reportError(error);
    } finally {
      results?.removeAttribute('aria-busy');
    }
  }

  function set(changes, { push = false } = {}) {
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined) delete state[key];
      else state[key] = value;
    }
    if (!('page' in changes)) state.page = 1;
    const target = currentHash();
    if (push) window.history.pushState(null, '', target);
    else window.history.replaceState(null, '', target);
    return load();
  }

  if (form) {
    const typed = debounce((name, value) => set({ [name]: value }), 320);
    form.addEventListener('input', (event) => {
      if (event.target.type === 'search') typed(event.target.name, event.target.value.trim());
    });
    form.addEventListener('change', (event) => {
      if (event.target.type === 'search' || !event.target.name) return;
      set({ [event.target.name]: event.target.value });
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      typed.cancel();
      const search = form.querySelector('input[type="search"]');
      if (search) set({ [search.name]: search.value.trim() });
    });
    form.querySelector('[data-reset]')?.addEventListener('click', () => {
      typed.cancel();
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, defaults);
      for (const element of form.elements) if (element.name) element.value = defaults[element.name] ?? '';
      window.history.replaceState(null, '', currentHash());
      load();
    });
  }

  on(root, 'click', '[data-page]', (event, link) => {
    if (!link.closest('.pagination')) return;
    event.preventDefault();
    if (link.getAttribute('aria-disabled') === 'true') return;
    const page = Number(link.dataset.page);
    if (page === state.page) return;
    set({ page }, { push: true }).then(() => root.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  });

  function pager(data) {
    return html`<nav class="pagination" aria-label="${t('admin.common.pagination')}">${pagination({
      page: data.page,
      pages: data.pages,
      hrefFor: (page) => buildHash(path, { ...state, page })
    })}</nav>`;
  }

  return { state, fromQuery, load, set, pager, syncControls };
}

/* --------------------------------------------------------- slide-over */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-hand form panel. `onSubmit(form, panel)` may throw an ApiError; its
 * field messages are shown inside the form. Closing with unsaved edits asks
 * for confirmation.
 */
export function openPanel({ title, body, submitLabel = t('common.save'), onSubmit, readOnly = false, extraActions = '' }) {
  const root = document.createElement('div');
  root.className = 'drawer admin-drawer';
  const titleId = uniqueId('panel-title');
  setHTML(
    root,
    html`<div class="drawer__backdrop" data-panel-dismiss></div>
    <section class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <form class="drawer__form" novalidate>
        <div class="drawer__head">
          <h2 class="drawer__title" id="${titleId}">${title}</h2>
          <button class="btn btn-icon btn-ghost" type="button" data-panel-dismiss aria-label="${t('common.close')}">${icon('close')}</button>
        </div>
        <div class="drawer__body">
          ${body}
          <p class="form-error" role="alert" data-form-error hidden></p>
        </div>
        <div class="drawer__foot">
          ${extraActions}
          <button class="btn btn-ghost" type="button" data-panel-dismiss>${readOnly ? t('common.close') : t('common.cancel')}</button>
          ${readOnly ? '' : html`<button class="btn btn-accent" type="submit">${icon('check')}${submitLabel}</button>`}
        </div>
      </form>
    </section>`
  );
  document.body.append(root);
  const form = root.querySelector('form');
  if (readOnly) $$('input, select, textarea', form).forEach((element) => (element.disabled = true));
  const lastFocus = document.activeElement;
  let dirty = false;
  let closed = false;
  form.addEventListener('input', () => (dirty = true));
  form.addEventListener('change', () => (dirty = true));

  const previousCheck = dirtyCheck;
  setDirtyCheck(() => dirty);

  function close({ force = false } = {}) {
    if (closed) return Promise.resolve(true);
    const proceed = force || !dirty ? Promise.resolve(true) : confirmDiscard();
    return proceed.then((ok) => {
      if (!ok) return false;
      closed = true;
      document.removeEventListener('keydown', keydown, true);
      document.documentElement.style.removeProperty('overflow');
      root.remove();
      setDirtyCheck(previousCheck);
      if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) lastFocus.focus();
      return true;
    });
  }

  function keydown(event) {
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = $$(FOCUSABLE, root).filter((element) => element.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', keydown, true);
  document.documentElement.style.setProperty('overflow', 'hidden');
  on(root, 'click', '[data-panel-dismiss]', () => close());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (readOnly || !onSubmit) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.classList.add('is-busy');
    try {
      const keepOpen = await onSubmit(form, { close });
      if (keepOpen !== true) await close({ force: true });
    } catch (error) {
      reportError(error, form);
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
    }
  });

  setTimeout(() => {
    const target = form.querySelector('.drawer__body input:not([type="hidden"]):not([disabled]), .drawer__body select, .drawer__body textarea');
    (target || form.querySelector('[data-panel-dismiss]'))?.focus();
  }, 40);

  return { root, form, close, markClean: () => (dirty = false) };
}

function closeMenus(except = null) {
  for (const menu of $$('details.menu[open]')) {
    if (menu !== except) menu.open = false;
  }
}

function placeMenu(menu) {
  const list = menu.querySelector('.menu__list');
  const summary = menu.querySelector('summary');
  if (!list || !summary) return;
  const rect = summary.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  list.style.setProperty('position', 'fixed');
  list.style.setProperty('right', `${Math.max(8, viewportWidth - rect.right)}px`);
  list.style.setProperty('top', `${rect.bottom + 4}px`);
  const height = list.offsetHeight;
  if (rect.bottom + 4 + height > window.innerHeight - 8) {
    list.style.setProperty('top', `${Math.max(8, rect.top - 4 - height)}px`);
  }
}

let menusBound = false;

/**
 * Row action menus are <details> elements. Their lists are positioned
 * `fixed` so scrolling table containers never clip them; they close on
 * outside click, Escape, scroll and resize.
 */
export function bindMenus() {
  if (menusBound) return;
  menusBound = true;
  document.addEventListener(
    'toggle',
    (event) => {
      const menu = event.target;
      if (!(menu instanceof HTMLDetailsElement) || !menu.classList.contains('menu') || !menu.open) return;
      closeMenus(menu);
      placeMenu(menu);
      menu.querySelector('.menu__item')?.focus({ preventScroll: true });
    },
    true
  );
  document.addEventListener('click', (event) => {
    const inside = event.target instanceof Element ? event.target.closest('details.menu') : null;
    if (!inside) closeMenus();
    else if (event.target.closest('.menu__item')) inside.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = event.target instanceof Element ? event.target.closest('details.menu[open]') : null;
    if (menu) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
  window.addEventListener('scroll', () => closeMenus(), { passive: true, capture: true });
  window.addEventListener('resize', () => closeMenus());
}

export function rowMenu(items) {
  const visible = items.filter(Boolean);
  if (!visible.length) return '';
  return html`<details class="menu">
    <summary class="btn btn-icon btn-sm btn-ghost" aria-label="${t('admin.common.actions')}">${icon('more')}</summary>
    <div class="menu__list" role="menu">
      ${visible.map((item) =>
        item === 'sep'
          ? html`<div class="menu__sep" role="separator"></div>`
          : item.href
            ? html`<a class="menu__item" role="menuitem" href="${item.href}" ${attrs(item.attrs || {})}>${icon(item.icon)}${item.label}</a>`
            : html`<button class="menu__item ${item.danger ? 'menu__item--danger' : ''}" role="menuitem" type="button" ${attrs(item.attrs || {})}>${icon(item.icon)}${item.label}</button>`
      )}
    </div>
  </details>`;
}

/** Pretty-print a value from an audit diff. */
export function displayValue(value) {
  if (value === null || value === undefined || value === '') return t('admin.common.none');
  if (typeof value === 'boolean') return value ? t('admin.common.yesShort') : t('admin.common.noShort');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Short "Browser · OS" label from a user agent string. */
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  const browser =
    (/Edg\//.test(ua) && 'Edge') ||
    (/OPR\//.test(ua) && 'Opera') ||
    (/YaBrowser\//.test(ua) && 'Yandex') ||
    (/Firefox\//.test(ua) && 'Firefox') ||
    (/Chrome\//.test(ua) && 'Chrome') ||
    (/Safari\//.test(ua) && 'Safari') ||
    (/curl|node|undici/i.test(ua) && 'API client') ||
    '';
  const os =
    (/Windows/.test(ua) && 'Windows') ||
    (/Android/.test(ua) && 'Android') ||
    (/iPhone|iPad/.test(ua) && 'iOS') ||
    (/Mac OS X/.test(ua) && 'macOS') ||
    (/Linux/.test(ua) && 'Linux') ||
    '';
  return [browser, os].filter(Boolean).join(' · ') || t('admin.common.none');
}

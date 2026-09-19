/**
 * Shared UI pieces: toasts, confirm dialogs, drawers, pagination,
 * empty states and busy buttons.
 */
import { html, setHTML, icon, safeUrl, $, $$ } from './dom.js';
import { t } from './i18n.js';

/* ------------------------------------------------------------ toasts */
export function toast(message, { type = 'info', action = null, timeout = 4800 } = {}) {
  const region = $('[data-toasts]');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const iconName = type === 'ok' ? 'check-circle' : type === 'error' ? 'alert' : 'info';
  setHTML(
    node,
    html`${icon(iconName)}<span class="toast__text">${message}</span>
      ${action ? html`<a class="toast__action" href="${safeUrl(action.href)}">${action.label}</a>` : ''}
      <button class="toast__close" type="button" aria-label="${t('common.close')}">${icon('close')}</button>`
  );
  const dismiss = () => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  };
  node.querySelector('.toast__close').addEventListener('click', dismiss);
  region.append(node);
  while (region.children.length > 4) region.firstElementChild.remove();
  if (timeout) setTimeout(dismiss, timeout);
}

/* ----------------------------------------------------------- dialogs */
function buildDialog({ title, body, danger }) {
  const dialog = document.createElement('dialog');
  dialog.className = `modal${danger ? ' modal--danger' : ''}`;
  setHTML(dialog, body);
  dialog.setAttribute('aria-label', title);
  document.body.append(dialog);
  dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 50));
  return dialog;
}

export function confirmDialog({ title = t('admin.common.confirmTitle'), text = '', confirmLabel = t('common.confirm'), danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = buildDialog({
      title,
      danger,
      body: html`<form method="dialog">
        <div class="modal__body">
          <h2 class="modal__title">${title}</h2>
          <p class="modal__text">${text}</p>
        </div>
        <div class="modal__foot">
          <button class="btn btn-ghost" value="cancel" type="submit">${t('common.cancel')}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" value="ok" type="submit" data-confirm>${confirmLabel}</button>
        </div>
      </form>`
    });
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'));
    dialog.showModal();
    dialog.querySelector(danger ? '.btn-ghost' : '[data-confirm]').focus();
  });
}

/** Show a one-time secret (e.g. a temporary password) with a copy button. */
export function secretDialog({ title, text, secret }) {
  return new Promise((resolve) => {
    const dialog = buildDialog({
      title,
      body: html`<form method="dialog">
        <div class="modal__body">
          <h2 class="modal__title">${title}</h2>
          <p class="modal__text">${text}</p>
          <div class="secret-box"><span data-secret>${secret}</span>
            <button class="btn btn-ghost btn-sm" type="button" data-copy>${icon('copy')}${t('common.copy')}</button>
          </div>
        </div>
        <div class="modal__foot"><button class="btn btn-accent" value="ok" type="submit">${t('common.close')}</button></div>
      </form>`
    });
    dialog.querySelector('[data-copy]').addEventListener('click', async (event) => {
      if (await copyText(secret)) {
        event.currentTarget.textContent = t('common.copied');
      }
    });
    dialog.addEventListener('close', () => resolve());
    dialog.showModal();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- drawers */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible off-canvas panel. `openClass` toggles CSS state; when omitted the
 * `hidden` attribute is used. Returns { open, close }.
 */
export function drawer(root, { openClass = null, panel = root, onClose } = {}) {
  let lastFocus = null;
  const isOpen = () => (openClass ? root.classList.contains(openClass) : !root.hidden);

  function keydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = $$(FOCUSABLE, panel).filter((el) => el.offsetParent !== null);
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

  function open(trigger) {
    if (isOpen()) return;
    lastFocus = trigger || document.activeElement;
    if (openClass) root.classList.add(openClass);
    else root.hidden = false;
    document.documentElement.style.setProperty('overflow', 'hidden');
    document.addEventListener('keydown', keydown);
    const target = $(FOCUSABLE, panel);
    if (target) setTimeout(() => target.focus(), 30);
  }

  function close() {
    if (!isOpen()) return;
    if (openClass) root.classList.remove(openClass);
    else root.hidden = true;
    document.documentElement.style.removeProperty('overflow');
    document.removeEventListener('keydown', keydown);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    if (onClose) onClose();
  }

  $$('[data-drawer-close]', root).forEach((el) => el.addEventListener('click', close));
  return { open, close, isOpen };
}

/* ------------------------------------------------------------ states */
export function emptyState({ iconName = 'inbox', title, text = '', action = null }) {
  return html`<div class="empty-state">
    <span class="empty-state__icon">${icon(iconName)}</span>
    <h2 class="empty-state__title">${title}</h2>
    ${text ? html`<p>${text}</p>` : ''}
    ${action ? html`<a class="btn btn-accent" href="${safeUrl(action.href)}">${action.label}</a>` : ''}
  </div>`;
}

export function errorState(message, retryLabel = t('common.retry')) {
  return html`<div class="empty-state">
    <span class="empty-state__icon">${icon('alert')}</span>
    <h2 class="empty-state__title">${message}</h2>
    <button class="btn btn-ghost" type="button" data-retry>${icon('refresh')}${retryLabel}</button>
  </div>`;
}

export function skeletonCards(count = 8) {
  return html`${Array.from({ length: count }, () => html`<div class="skeleton skeleton-card" aria-hidden="true"></div>`)}`;
}

export function setBusy(button, busy) {
  if (!button) return;
  button.classList.toggle('is-busy', busy);
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

/* -------------------------------------------------------- pagination */
function pageList(page, pages) {
  const list = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => list.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => list.add(n));
  return [...list].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
}

export function pagination({ page, pages, hrefFor }) {
  if (!pages || pages <= 1) return html``;
  const items = [];
  const numbers = pageList(page, pages);
  let previous = 0;
  for (const number of numbers) {
    if (number - previous > 1) items.push(html`<span class="pagination__gap" aria-hidden="true">…</span>`);
    items.push(
      number === page
        ? html`<a class="pagination__link" href="${hrefFor(number)}" aria-current="page" data-page="${number}">${number}</a>`
        : html`<a class="pagination__link" href="${hrefFor(number)}" data-page="${number}" aria-label="${t('catalog.page', { page: number })}">${number}</a>`
    );
    previous = number;
  }
  return html`
    <a class="pagination__link" href="${hrefFor(Math.max(1, page - 1))}" data-page="${Math.max(1, page - 1)}"
      aria-label="${t('catalog.prevPage')}" ${page <= 1 ? html`aria-disabled="true" tabindex="-1"` : ''}>${icon('chevron-left')}</a>
    ${items}
    <a class="pagination__link" href="${hrefFor(Math.min(pages, page + 1))}" data-page="${Math.min(pages, page + 1)}"
      aria-label="${t('catalog.nextPage')}" ${page >= pages ? html`aria-disabled="true" tabindex="-1"` : ''}>${icon('chevron-right')}</a>`;
}

export function badge(text, tone = 'muted', { dot = false } = {}) {
  return html`<span class="badge badge--${tone}${dot ? ' badge--dot' : ''}">${text}</span>`;
}

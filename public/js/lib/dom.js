/**
 * DOM helpers with XSS-safe rendering.
 *
 * All markup goes through the `html` tagged template, which escapes every
 * interpolated value. `setHTML` is the only innerHTML sink in the app and it
 * uses the `sb-html` Trusted Types policy required by the CSP.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export function escapeHtml(value) {
  if (value === undefined || value === null || value === false) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => ESCAPES[ch]);
}

function interpolate(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += interpolate(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Join rendered fragments. */
export function join(parts) {
  return new SafeHtml(parts.map(interpolate).join(''));
}

let policy = null;
try {
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    policy = window.trustedTypes.createPolicy('sb-html', { createHTML: (value) => value });
  }
} catch {
  policy = null;
}

export function setHTML(element, content) {
  if (!element) return;
  const markup = content instanceof SafeHtml ? content.value : escapeHtml(content);
  element.innerHTML = policy ? policy.createHTML(markup) : markup;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Delegated event listener. */
export function on(root, type, selector, handler, options) {
  root.addEventListener(
    type,
    (event) => {
      const target = event.target instanceof Element ? event.target.closest(selector) : null;
      if (target && root.contains(target)) handler(event, target);
    },
    options
  );
}

/** Allow only same-origin paths and http(s)/tel/mailto URLs in links and images. */
export function safeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return '#';
  const value = url.trim();
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (['http:', 'https:', 'tel:', 'mailto:'].includes(parsed.protocol)) return parsed.href;
  } catch {
    return '#';
  }
  return '#';
}

export function icon(name, className = '') {
  return html`<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function debounce(fn, wait = 200) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function readBoot() {
  try {
    return JSON.parse(document.getElementById('boot')?.textContent || '{}');
  } catch {
    return {};
  }
}

/** localStorage wrapper that tolerates private mode / blocked storage. */
export function storage(kind = 'local') {
  try {
    const store = kind === 'session' ? window.sessionStorage : window.localStorage;
    const probe = '__sb_probe__';
    store.setItem(probe, probe);
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '#';
}

export function telegramHref(username) {
  const clean = String(username || '').replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(clean) ? `https://t.me/${clean}` : '#';
}

export function whatsappHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 9 ? `https://wa.me/${digits}` : '#';
}

export function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  return phone || '';
}

export function uniqueId(prefix = 'id') {
  uniqueId.counter = (uniqueId.counter || 0) + 1;
  return `${prefix}-${uniqueId.counter}`;
}

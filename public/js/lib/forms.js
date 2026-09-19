/**
 * Form helpers: nested value extraction (dotted names), localized
 * client-side validation that mirrors the server rules, and rendering of
 * server-side field errors.
 */
import { html, setHTML, icon, $, $$ } from './dom.js';
import { t } from './i18n.js';

function setPath(target, path, value) {
  const parts = path.split('.');
  let node = target;
  parts.slice(0, -1).forEach((part) => {
    if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
    node = node[part];
  });
  node[parts[parts.length - 1]] = value;
}

/** Collect form values into a nested object. */
export function formValues(form) {
  const values = {};
  for (const element of form.elements) {
    if (!element.name || element.disabled || element.dataset.ignore !== undefined) continue;
    if (element.type === 'radio') {
      if (element.checked) setPath(values, element.name, element.value);
      continue;
    }
    if (element.type === 'checkbox') {
      if (element.dataset.multi !== undefined) {
        const current = element.name.split('.').reduce((node, key) => node?.[key], values) || [];
        if (element.checked) current.push(element.value);
        setPath(values, element.name, current);
      } else {
        setPath(values, element.name, element.checked);
      }
      continue;
    }
    if (element.tagName === 'BUTTON' || element.type === 'file') continue;
    let value = element.value;
    if (element.type === 'number' || element.dataset.type === 'number') {
      value = value.trim() === '' ? null : Number(value.replace(',', '.'));
    } else if (typeof value === 'string' && element.type !== 'password') {
      value = value.trim();
    }
    setPath(values, element.name, value);
  }
  return values;
}

const PASSWORD_RULES = {
  length: (v) => [...v].length >= 12,
  lower: (v) => /\p{Ll}/u.test(v),
  upper: (v) => /\p{Lu}/u.test(v),
  digit: (v) => /\p{Nd}/u.test(v),
  symbol: (v) => /[^\p{L}\p{Nd}\s]/u.test(v)
};

export function passwordChecks(value) {
  return Object.fromEntries(Object.entries(PASSWORD_RULES).map(([key, test]) => [key, test(value || '')]));
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

function fieldError(element, form) {
  const value = element.type === 'checkbox' ? element.checked : String(element.value || '').trim();
  const visible = element.offsetParent !== null || element.type === 'checkbox' || element.type === 'radio';
  if (!visible || element.disabled) return null;
  if (element.required && (value === '' || value === false)) {
    return t(element.type === 'checkbox' && element.name.match(/consent|terms/) ? 'validation.consent_required' : 'validation.required');
  }
  if (value === '' || value === false) return null;
  const length = [...String(value)].length;
  if (element.minLength > 0 && length < element.minLength && element.type !== 'password') {
    return t('validation.too_short', { min: element.minLength });
  }
  if (element.maxLength > 0 && length > element.maxLength) return t('validation.too_long', { max: element.maxLength });
  if (element.type === 'email' && !EMAIL.test(value)) return t('validation.invalid_email');
  if (element.type === 'tel') {
    const digits = value.replace(/\D/g, '');
    const ok = /^\+?[\d\s()-]{7,25}$/.test(value) && (digits.length === 9 || (digits.length >= 10 && digits.length <= 15));
    if (!ok) return t('validation.invalid_phone');
  }
  if (element.pattern && !new RegExp(`^(?:${element.pattern})$`, 'u').test(value)) {
    return t(`validation.${element.dataset.patternCode || 'invalid_format'}`);
  }
  if (element.type === 'number' || element.dataset.type === 'number') {
    const number = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(number)) return t('validation.invalid_number');
    if (element.min !== '' && number < Number(element.min)) return t('validation.too_small', { min: element.min });
    if (element.max !== '' && number > Number(element.max)) return t('validation.too_big', { max: element.max });
  }
  if (element.dataset.passwordPolicy !== undefined) {
    const checks = passwordChecks(value);
    if (!checks.length) return t('validation.password_too_short');
    if (!checks.lower) return t('validation.password_lowercase');
    if (!checks.upper) return t('validation.password_uppercase');
    if (!checks.digit) return t('validation.password_digit');
    if (!checks.symbol) return t('validation.password_symbol');
  }
  if (element.dataset.match) {
    const other = form.elements.namedItem(element.dataset.match);
    if (other && other.value !== element.value) return t('validation.mismatch');
  }
  return null;
}

function errorId(element) {
  if (!element.id) element.id = `f-${Math.random().toString(36).slice(2, 9)}`;
  return `${element.id}-error`;
}

function container(element) {
  return element.closest('.field') || element.parentElement;
}

export function setFieldError(element, message) {
  if (!element) return;
  const box = container(element);
  const id = errorId(element);
  box.querySelector(`#${CSS.escape(id)}`)?.remove();
  const described = (element.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== id);
  if (message) {
    element.setAttribute('aria-invalid', 'true');
    const node = document.createElement('p');
    node.className = 'field__error';
    node.id = id;
    setHTML(node, html`${icon('alert')}<span>${message}</span>`);
    box.append(node);
    described.push(id);
  } else {
    element.removeAttribute('aria-invalid');
  }
  if (described.length) element.setAttribute('aria-describedby', described.join(' '));
  else element.removeAttribute('aria-describedby');
}

export function clearErrors(form) {
  $$('[aria-invalid="true"]', form).forEach((element) => setFieldError(element, null));
  const summary = $('[data-form-error]', form);
  if (summary) {
    summary.hidden = true;
    summary.textContent = '';
  }
}

function findField(form, path) {
  const direct = form.elements.namedItem(path);
  if (direct) return direct instanceof RadioNodeList ? direct[0] : direct;
  return form.querySelector(`[data-error-for="${CSS.escape(path)}"]`);
}

/** Show errors from the API (`fields` = { path: message }) or client validation. */
export function showErrors(form, fields = {}, message = '') {
  clearErrors(form);
  let first = null;
  const unmatched = [];
  for (const [path, text] of Object.entries(fields || {})) {
    const element = findField(form, path);
    if (element) {
      setFieldError(element, text);
      if (!first) first = element;
    } else {
      unmatched.push(text);
    }
  }
  const summary = $('[data-form-error]', form);
  const summaryText = [message, ...unmatched].filter(Boolean).join(' ');
  if (summary && summaryText) {
    summary.textContent = summaryText;
    summary.hidden = false;
  }
  if (first && typeof first.focus === 'function') first.focus({ preventScroll: false });
  else if (summary && summaryText) summary.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function validateForm(form) {
  const fields = {};
  for (const element of form.elements) {
    if (!element.name || element.type === 'hidden' || element.tagName === 'BUTTON') continue;
    if (element.type === 'radio' && fields[element.name]) continue;
    const message = fieldError(element, form);
    if (message) fields[element.name] = message;
  }
  return fields;
}

/** Validate on blur, clear on input. */
export function liveValidation(form) {
  form.addEventListener(
    'blur',
    (event) => {
      const element = event.target;
      if (!element.name || !('value' in element) || element.type === 'radio') return;
      if (element.value === '' && !element.hasAttribute('aria-invalid')) return;
      setFieldError(element, fieldError(element, form));
    },
    true
  );
  form.addEventListener('input', (event) => {
    if (event.target.getAttribute('aria-invalid') === 'true') setFieldError(event.target, null);
  });
  form.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox' && event.target.checked) setFieldError(event.target, null);
  });
}

export function bindPasswordToggles(root = document) {
  $$('[data-password-toggle]', root).forEach((button) => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    if (!input) return;
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      const label = show ? button.dataset.labelHide : button.dataset.labelShow;
      setHTML(button, html`${icon(show ? 'eye-off' : 'eye')}<span class="visually-hidden">${label}</span>`);
    });
  });
}

export function bindPasswordMeters(root = document) {
  $$('[data-password-policy]', root).forEach((input) => {
    const meter = input.closest('.field')?.querySelector('[data-password-meter]');
    if (!meter) return;
    const update = () => {
      const value = input.value;
      meter.hidden = value.length === 0;
      const checks = passwordChecks(value);
      let score = Object.values(checks).filter(Boolean).length;
      if ([...value].length >= 16 && score === 5) score = 6;
      const level = score <= 2 ? 'weak' : score <= 4 ? 'fair' : score === 5 ? 'good' : 'strong';
      meter.dataset.level = level;
      meter.querySelector('[data-meter-fill]').style.setProperty('width', `${Math.min(100, (score / 6) * 100)}%`);
      meter.querySelector('[data-meter-label]').textContent = t('auth.strengthLabel', { level: t(`auth.strength.${level}`) });
      for (const [rule, ok] of Object.entries(checks)) {
        meter.querySelector(`[data-rule="${rule}"]`)?.classList.toggle('is-met', ok);
      }
    };
    input.addEventListener('input', update);
    update();
  });
}

/** Set min date = today for [data-min-today] date inputs. */
export function bindDateMin(root = document) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  $$('input[type="date"][data-min-today]', root).forEach((input) => {
    input.min = today;
  });
}

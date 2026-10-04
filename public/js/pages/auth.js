import { $, readBoot } from '../lib/dom.js';
import { t } from '../lib/i18n.js';
import { api, applySession } from '../lib/api.js';
import { setBusy } from '../lib/ui.js';
import {
  formValues,
  validateForm,
  showErrors,
  clearErrors,
  liveValidation,
  bindPasswordToggles,
  bindPasswordMeters
} from '../lib/forms.js';

function safeNext(value, fallback) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

export function loginPage() {
  const form = $('[data-login-form]');
  if (!form) return;
  const surface = form.dataset.surface === 'admin' ? 'admin' : 'site';
  const boot = readBoot();
  const params = new URLSearchParams(window.location.search);
  const notice = $('[data-session-notice]');
  if (notice && params.get('expired') === '1') {
    notice.textContent = t('auth.sessionExpired');
    notice.hidden = false;
  }
  liveValidation(form);
  bindPasswordToggles(form);
  const submit = form.querySelector('[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const fields = validateForm(form);
    if (Object.keys(fields).length) {
      showErrors(form, fields);
      return;
    }
    const { email, password } = formValues(form);
    setBusy(submit, true);
    try {
      const endpoint = surface === 'admin' ? '/api/auth/admin/login' : '/api/auth/login';
      const result = await api(endpoint, { method: 'POST', body: { email, password } });
      applySession(result);
      const fallback = result.redirect || (surface === 'admin' ? '/admin' : '/account');
      const target = surface === 'admin' ? safeNext(boot.next, '/admin') : result.isStaff ? '/admin' : boot.next === '/seller' && !result.isSeller ? fallback : safeNext(boot.next, fallback);
      window.location.assign(target);
    } catch (error) {
      form.elements.namedItem('password').value = '';
      showErrors(form, error.fields || {}, error.message);
      setBusy(submit, false);
    }
  });
}

export function registerPage() {
  const form = $('[data-register-form]');
  if (!form) return;
  liveValidation(form);
  bindPasswordToggles(form);
  bindPasswordMeters(form);
  const submit = form.querySelector('[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const fields = validateForm(form);
    if (Object.keys(fields).length) {
      showErrors(form, fields, t('errors.validation_failed'));
      return;
    }
    const values = formValues(form);
    setBusy(submit, true);
    try {
      const result = await api('/api/auth/register', { method: 'POST', body: values });
      applySession(result);
      window.location.assign(result.redirect || '/account');
    } catch (error) {
      showErrors(form, error.fields || {}, error.message);
      setBusy(submit, false);
    }
  });
}

/** "Open a shop": owner account + shop application (pending admin approval). */
export function sellPage() {
  const form = $('[data-sell-form]');
  if (!form) return;
  const select = form.querySelector('[data-regions]');
  const regions = ['tashkent_city', 'tashkent_region', 'samarkand', 'bukhara', 'andijan', 'fergana', 'namangan', 'kashkadarya', 'surkhandarya', 'khorezm', 'navoi', 'jizzakh', 'syrdarya', 'karakalpakstan'];
  for (const region of regions) {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = t(`regions.${region}`);
    select.append(option);
  }
  liveValidation(form);
  bindPasswordToggles(form);
  bindPasswordMeters(form);
  const submit = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const fields = validateForm(form);
    if (Object.keys(fields).length) {
      showErrors(form, fields, t('errors.validation_failed'));
      return;
    }
    setBusy(submit, true);
    try {
      const result = await api('/api/auth/register-shop', { method: 'POST', body: formValues(form) });
      applySession(result);
      window.location.assign('/seller#/dashboard');
    } catch (error) {
      showErrors(form, error.fields || {}, error.message);
      setBusy(submit, false);
    }
  });
}

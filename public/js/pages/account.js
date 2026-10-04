import { $, html, setHTML, icon } from '../lib/dom.js';
import { t, loc, fmtDate } from '../lib/i18n.js';
import { api, getSession, applySession, logout } from '../lib/api.js';
import { badge, emptyState, errorState, setBusy, toast, confirmDialog } from '../lib/ui.js';
import {
  formValues,
  validateForm,
  showErrors,
  clearErrors,
  liveValidation,
  bindPasswordToggles,
  bindPasswordMeters
} from '../lib/forms.js';
import { productUrl, shopUrl, stars } from '../lib/format.js';
import { productGrid } from '../lib/product-card.js';
import * as favorites from '../lib/favorites.js';

const REVIEW_TONE = { pending: 'warn', approved: 'ok', rejected: 'danger' };

function reviewRow(review) {
  const target = review.product
    ? html`<a href="${productUrl(review.product)}">${loc(review.product.name)}</a>`
    : review.shop
      ? html`<a href="${shopUrl(review.shop)}">${review.shop.name}</a>`
      : '';
  return html`<li class="my-review">
    <div class="my-review__head">${target}${badge(t(`reviews.status.${review.status}`), REVIEW_TONE[review.status] || 'muted', { dot: true })}</div>
    <div class="my-review__body">${stars(review.rating)}<span class="muted small">${fmtDate(review.createdAt)}</span></div>
    ${review.text ? html`<p>${review.text}</p>` : ''}
  </li>`;
}

async function loadFavorites() {
  const holder = $('[data-account-favorites]');
  const ids = favorites.list();
  try {
    if (!ids.length) {
      setHTML(holder, emptyState({ iconName: 'heart', title: t('favorites.emptyTitle'), text: t('favorites.emptyText'), action: { href: '/catalog', label: t('nav.catalog') } }));
      return;
    }
    const { items } = await api(`/api/catalog/lookup?ids=${ids.slice(0, 8).join(',')}`);
    setHTML(holder, html`<div class="product-grid product-grid--compact">${productGrid(items, { compact: true })}</div>
      <a class="btn btn-ghost btn-sm" href="/favorites">${t('favorites.openAll', { count: ids.length })}${icon('arrow-right')}</a>`);
  } catch (error) {
    setHTML(holder, errorState(error.message));
  } finally {
    holder.removeAttribute('aria-busy');
  }
}

async function loadReviews() {
  const holder = $('[data-account-reviews]');
  try {
    const { items } = await api('/api/account/reviews');
    setHTML(holder, items.length ? html`<ul class="my-reviews">${items.map(reviewRow)}</ul>` : html`<p class="muted">${t('account.noReviews')}</p>`);
  } catch (error) {
    setHTML(holder, errorState(error.message));
  } finally {
    holder.removeAttribute('aria-busy');
  }
}

function bindProfile(user) {
  const form = $('[data-profile-form]');
  form.elements.namedItem('name').value = user.name || '';
  form.elements.namedItem('phone').value = user.phone || '';
  liveValidation(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const fields = validateForm(form);
    if (Object.keys(fields).length) return showErrors(form, fields);
    const button = form.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      const result = await api('/api/account/profile', { method: 'PATCH', body: formValues(form) });
      applySession({ user: result.user });
      $('[data-account-greeting]').textContent = t('account.greeting', { name: result.user.name.split(' ')[0] });
      toast(t('account.profileSaved'), { type: 'ok' });
    } catch (error) {
      showErrors(form, error.fields || {}, error.message);
    } finally {
      setBusy(button, false);
    }
    return undefined;
  });
}

function bindPassword(user) {
  const form = $('[data-password-form]');
  form.querySelector('[data-username]').value = user.email;
  liveValidation(form);
  bindPasswordToggles(form);
  bindPasswordMeters(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const fields = validateForm(form);
    if (Object.keys(fields).length) return showErrors(form, fields);
    const button = form.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      const { currentPassword, newPassword } = formValues(form);
      await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      form.reset();
      form.querySelector('[data-password-meter]').hidden = true;
      toast(t('auth.passwordChanged'), { type: 'ok' });
    } catch (error) {
      showErrors(form, error.fields || {}, error.message);
    } finally {
      setBusy(button, false);
    }
    return undefined;
  });
}

export default async function accountPage() {
  let session;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (!session?.user) {
    window.location.assign('/login?next=%2Faccount');
    return;
  }
  const { user } = session;
  $('[data-account-greeting]').textContent = t('account.greeting', { name: user.name.split(' ')[0] });
  $('[data-account-email]').textContent = user.email;
  bindProfile(user);
  bindPassword(user);
  $('[data-logout]').addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true);
    try {
      await logout();
    } finally {
      window.location.assign('/');
    }
  });
  $('[data-logout-others]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(await confirmDialog({ title: t('account.logoutEverywhere'), text: t('account.logoutEverywhereText') }))) return;
    setBusy(button, true);
    try {
      await api('/api/auth/logout-others', { method: 'POST' });
      toast(t('account.logoutEverywhereDone'), { type: 'ok' });
    } catch (error) {
      toast(error.message, { type: 'error' });
    } finally {
      setBusy(button, false);
    }
  });
  favorites.initSync().finally(loadFavorites);
  await loadReviews();
}

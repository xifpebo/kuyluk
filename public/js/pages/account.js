import { $, html, setHTML, icon } from '../lib/dom.js';
import { t, tn, loc, fmtMoney, fmtNumber, fmtDate, unitShort } from '../lib/i18n.js';
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
import { productUrl } from '../lib/format.js';

const STATUS_TONE = {
  new: 'info',
  in_progress: 'warn',
  quoted: 'accent',
  accepted: 'ok',
  rejected: 'danger',
  cancelled: 'muted'
};

export function quoteStatusBadge(status) {
  return badge(t(`quoteStatus.${status}`), STATUS_TONE[status] || 'muted', { dot: status !== 'quoted' });
}

function quoteRow(quote) {
  return html`<li>
    <details class="quote-row">
      <summary class="quote-row__summary">
        <span>
          <span class="quote-row__number">${quote.number}</span><br>
          <span class="quote-row__date">${fmtDate(quote.createdAt)} · ${tn('common.positions', quote.items.length)}</span>
        </span>
        ${quoteStatusBadge(quote.status)}
        <span class="quote-row__total">${fmtMoney(quote.quotedTotal ?? quote.estimatedTotal)}</span>
        ${icon('chevron-down')}
      </summary>
      <div class="quote-row__body table-scroll">
        <table class="mini-table">
          <thead><tr><th>${t('account.product')}</th><th class="num">${t('account.qty')}</th><th class="num">${t('quote.unitPrice')}</th><th class="num">${t('quote.lineTotal')}</th></tr></thead>
          <tbody>
            ${quote.items.map(
              (item) => html`<tr>
                <td><a href="${productUrl(item)}">${loc(item.name)}</a><br><span class="muted small">${item.sku}</span></td>
                <td class="num">${fmtNumber(item.qty)} ${unitShort(item.unit)}</td>
                <td class="num">${fmtMoney(item.quotedUnitPrice ?? item.unitPrice)}</td>
                <td class="num">${fmtMoney(item.quotedUnitPrice != null ? Math.round(item.quotedUnitPrice * item.qty) : item.lineTotal)}</td>
              </tr>`
            )}
          </tbody>
        </table>
        <p class="muted small">${t('account.total')}: ${fmtMoney(quote.estimatedTotal)}${quote.quotedTotal != null ? html` · ${t('account.quotedTotal')}: <strong>${fmtMoney(quote.quotedTotal)}</strong>` : ''}</p>
      </div>
    </details>
  </li>`;
}

async function loadQuotes() {
  const holder = $('[data-account-quotes]');
  try {
    const { items } = await api('/api/account/quotes');
    setHTML(
      holder,
      items.length
        ? html`<ul class="quote-list">${items.map(quoteRow)}</ul>`
        : emptyState({ iconName: 'clipboard', title: t('account.noQuotes'), action: { href: '/catalog', label: t('quote.browseCatalog') } })
    );
  } catch (error) {
    setHTML(holder, errorState(error.message));
    holder.querySelector('[data-retry]')?.addEventListener('click', loadQuotes);
  } finally {
    holder.removeAttribute('aria-busy');
  }
}

function bindProfile(user) {
  const form = $('[data-profile-form]');
  form.elements.namedItem('name').value = user.name || '';
  form.elements.namedItem('phone').value = user.phone || '';
  form.elements.namedItem('company').value = user.company || '';
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
  await loadQuotes();
}

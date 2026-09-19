/**
 * Forced password change for staff created with a temporary password (or
 * after a reset). The API refuses every admin call until this is done.
 */
import { html, setHTML, icon, $ } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api, getSession } from '../../lib/api.js';
import { setBusy } from '../../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation, bindPasswordToggles, bindPasswordMeters } from '../../lib/forms.js';
import { reportError } from '../shared.js';
import { passwordInput } from './users.js';

export function passwordGate({ outlet, user }) {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.className = 'gate';
    outlet.replaceChildren(container);
    setHTML(
      container,
      html`<section class="panel gate__card" aria-labelledby="gate-title">
        <span class="gate__icon">${icon('lock')}</span>
        <div>
          <h1 class="view-title" id="gate-title">${t('auth.mustChangeTitle')}</h1>
          <p class="view-lead">${t('auth.mustChangeLead')}</p>
        </div>
        <form class="stack" novalidate data-gate-form>
          <input type="text" name="username" autocomplete="username" value="${user.email}" hidden data-ignore>
          ${passwordInput({ name: 'currentPassword', label: t('admin.gate.temporary'), id: 'gate-current', autocomplete: 'current-password', policy: false })}
          ${passwordInput({ name: 'newPassword', label: t('auth.newPassword'), id: 'gate-new' })}
          <div class="field">
            <label class="field__label" for="gate-confirm">${t('auth.passwordConfirm')}</label>
            <input class="control" id="gate-confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="128" data-match="newPassword" data-ignore>
          </div>
          <p class="form-error" role="alert" data-form-error hidden></p>
          <button class="btn btn-accent btn-lg" type="submit">${icon('check')}${t('auth.changePasswordButton')}</button>
        </form>
      </section>`
    );
    const form = $('[data-gate-form]', container);
    liveValidation(form);
    bindPasswordToggles(form);
    bindPasswordMeters(form);
    setTimeout(() => form.querySelector('#gate-current')?.focus(), 30);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors(form);
      const fields = validateForm(form);
      if (Object.keys(fields).length) {
        showErrors(form, fields);
        return;
      }
      const button = form.querySelector('[type="submit"]');
      setBusy(button, true);
      try {
        const { currentPassword, newPassword } = formValues(form);
        await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
        await getSession(true);
        resolve();
      } catch (error) {
        reportError(error, form);
        setBusy(button, false);
      }
    });
  });
}

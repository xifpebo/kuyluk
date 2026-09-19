import { html, setHTML, icon, on, $, formatPhone } from '../../lib/dom.js';
import { t, fmtDateTime } from '../../lib/i18n.js';
import { api, getSession, applySession } from '../../lib/api.js';
import { toast, confirmDialog, setBusy, badge } from '../../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation, bindPasswordToggles, bindPasswordMeters } from '../../lib/forms.js';
import { viewHead, sectionTitle, roleBadge, timeCell, dataTable, reportError, loadingBlock, deviceLabel, initials } from '../shared.js';
import { passwordInput } from './users.js';

async function renderSessions(box) {
  try {
    const { items } = await api('/api/auth/sessions');
    setHTML(
      box,
      dataTable({
        rows: items,
        columns: [
          {
            label: t('admin.profile.device'),
            primary: true,
            render: (s) => html`<span title="${s.userAgent}">${deviceLabel(s.userAgent)}</span> ${s.current ? badge(t('admin.profile.current'), 'accent') : ''}`
          },
          { label: t('admin.profile.ip'), render: (s) => html`<span class="ip">${s.ip || ''}</span>` },
          { label: t('admin.profile.started'), className: 'nowrap', render: (s) => html`<span title="${fmtDateTime(s.createdAt)}">${fmtDateTime(s.createdAt)}</span>` },
          { label: t('admin.profile.lastActive'), className: 'nowrap', render: (s) => timeCell(s.lastSeenAt) },
          {
            label: t('admin.common.actions'),
            className: 'actions',
            render: (s) => html`<button class="btn btn-sm ${s.current ? 'btn-danger' : 'btn-ghost'}" type="button" data-end-session="${s.id}" data-current="${String(s.current)}">${icon('logout')}${t('admin.profile.endSession')}</button>`
          }
        ]
      })
    );
  } catch (error) {
    reportError(error);
  }
}

export default async function profileView({ root }) {
  setHTML(root, loadingBlock());
  const session = await getSession(true);
  const user = session.user;

  setHTML(
    root,
    html`${viewHead({ title: t('admin.profile.title'), lead: user.email })}
    <div class="two-col">
      <section class="panel">
        ${sectionTitle(t('admin.profile.details'), { iconName: 'user' })}
        <div class="cell-main">
          <span class="avatar">${initials(user.name)}</span>
          <span class="cell-main__text"><strong data-profile-name>${user.name}</strong><span class="cell-sub">${user.email}</span></span>
          ${roleBadge(user.role)}
        </div>
        <dl class="kv contact-row">
          <div><dt>${t('admin.users.phone')}</dt><dd>${user.phone ? formatPhone(user.phone) : t('admin.common.none')}</dd></div>
          <div><dt>${t('admin.users.lastLogin')}</dt><dd>${user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : t('admin.users.never')}</dd></div>
          <div><dt>${t('admin.common.createdAt')}</dt><dd>${fmtDateTime(user.createdAt)}</dd></div>
          <div><dt>${t('admin.profile.permissions')}</dt><dd class="cell-tags">${session.permissions.map((p) => html`<span class="mono-chip">${p}</span>`)}</dd></div>
        </dl>
        <hr class="divider">
        <form class="stack" data-profile-form novalidate>
          <div class="field">
            <label class="field__label" for="pf-name">${t('admin.users.name')}</label>
            <input class="control" id="pf-name" name="name" value="${user.name}" required minlength="2" maxlength="100" autocomplete="name">
          </div>
          <div class="field">
            <label class="field__label" for="pf-phone">${t('admin.users.phone')}</label>
            <input class="control" id="pf-phone" name="phone" type="tel" value="${user.phone || ''}" maxlength="25" autocomplete="tel">
          </div>
          <p class="form-error" role="alert" data-form-error hidden></p>
          <button class="btn btn-ghost" type="submit">${icon('check')}${t('common.save')}</button>
        </form>
      </section>

      <section class="panel">
        ${sectionTitle(t('auth.changePasswordTitle'), { iconName: 'lock' })}
        <form class="stack" data-password-form novalidate>
          <input type="text" name="username" autocomplete="username" value="${user.email}" hidden data-ignore>
          ${passwordInput({ name: 'currentPassword', label: t('auth.currentPassword'), id: 'pf-current', autocomplete: 'current-password', policy: false })}
          ${passwordInput({ name: 'newPassword', label: t('auth.newPassword'), id: 'pf-new' })}
          <p class="form-error" role="alert" data-form-error hidden></p>
          <button class="btn btn-accent" type="submit">${icon('check')}${t('auth.changePasswordButton')}</button>
        </form>
        <p class="notice notice--info contact-row">${icon('shield')} ${t('admin.common.sessionTimeout')}</p>
      </section>
    </div>

    <section class="panel contact-row">
      <div class="panel__head">
        <h2 class="panel__title">${t('admin.profile.sessions')}</h2>
        <button class="btn btn-ghost btn-sm" type="button" data-logout-others>${icon('logout')}${t('account.logoutEverywhere')}</button>
      </div>
      <div data-sessions>${loadingBlock()}</div>
    </section>`
  );

  const sessionsBox = $('[data-sessions]', root);
  renderSessions(sessionsBox);

  const profileForm = $('[data-profile-form]', root);
  liveValidation(profileForm);
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(profileForm);
    const fields = validateForm(profileForm);
    if (Object.keys(fields).length) return showErrors(profileForm, fields);
    const button = profileForm.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      const result = await api('/api/account/profile', { method: 'PATCH', body: formValues(profileForm) });
      applySession({ user: result.user });
      $('[data-profile-name]', root).textContent = result.user.name;
      document.dispatchEvent(new CustomEvent('admin:user-changed'));
      toast(t('admin.common.saved'), { type: 'ok' });
    } catch (error) {
      reportError(error, profileForm);
    } finally {
      setBusy(button, false);
    }
    return undefined;
  });

  const passwordForm = $('[data-password-form]', root);
  liveValidation(passwordForm);
  bindPasswordToggles(passwordForm);
  bindPasswordMeters(passwordForm);
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(passwordForm);
    const fields = validateForm(passwordForm);
    if (Object.keys(fields).length) return showErrors(passwordForm, fields);
    const button = passwordForm.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      const { currentPassword, newPassword } = formValues(passwordForm);
      await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      passwordForm.reset();
      passwordForm.querySelector('[data-password-meter]').hidden = true;
      toast(t('auth.passwordChanged'), { type: 'ok' });
      renderSessions(sessionsBox);
    } catch (error) {
      reportError(error, passwordForm);
    } finally {
      setBusy(button, false);
    }
    return undefined;
  });

  on(sessionsBox, 'click', '[data-end-session]', async (event, button) => {
    const current = button.dataset.current === 'true';
    if (current && !(await confirmDialog({ title: t('admin.profile.endSession'), text: t('admin.profile.endCurrent'), danger: true }))) return;
    setBusy(button, true);
    try {
      const result = await api(`/api/auth/sessions/${button.dataset.endSession}`, { method: 'DELETE' });
      if (result.endedCurrent) {
        window.location.replace('/admin/login');
        return;
      }
      toast(t('admin.profile.sessionEnded'), { type: 'ok' });
      renderSessions(sessionsBox);
    } catch (error) {
      reportError(error);
      setBusy(button, false);
    }
  });

  $('[data-logout-others]', root).addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(await confirmDialog({ title: t('account.logoutEverywhere'), text: t('account.logoutEverywhereText') }))) return;
    setBusy(button, true);
    try {
      await api('/api/auth/logout-others', { method: 'POST' });
      toast(t('account.logoutEverywhereDone'), { type: 'ok' });
      renderSessions(sessionsBox);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(button, false);
    }
  });

  return { title: t('admin.profile.title') };
}

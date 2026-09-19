import { html, setHTML, icon, on, $, formatPhone } from '../../lib/dom.js';
import { t, fmtNumber } from '../../lib/i18n.js';
import { api, getSession } from '../../lib/api.js';
import { toast, confirmDialog, secretDialog, badge } from '../../lib/ui.js';
import {
  formValues,
  validateForm,
  showErrors,
  clearErrors,
  liveValidation,
  bindPasswordToggles,
  bindPasswordMeters
} from '../../lib/forms.js';
import {
  getMeta,
  viewHead,
  roleBadge,
  activeBadge,
  timeCell,
  dataTable,
  resultsMeta,
  searchInput,
  filterSelect,
  listController,
  rowMenu,
  inputField,
  selectField,
  switchField,
  reportError,
  openPanel,
  skeletonTable,
  messageBlock,
  initials,
  attrs,
  invalidateOptions
} from '../shared.js';

const PATH = '/users';

function passwordRules() {
  return html`<div class="password-meter" data-password-meter hidden>
    <div class="password-meter__bar" aria-hidden="true"><span data-meter-fill></span></div>
    <p class="password-meter__label" aria-live="polite" data-meter-label></p>
    <ul class="password-rules" aria-label="${t('auth.passwordRules')}">
      ${['length', 'lower', 'upper', 'digit', 'symbol'].map((rule) => html`<li data-rule="${rule}">${t(`auth.rules.${rule}`)}</li>`)}
    </ul>
  </div>`;
}

export function passwordInput({ name, label, id, autocomplete = 'new-password', policy = true }) {
  return html`<div class="field">
    <label class="field__label" for="${id}">${label}</label>
    <div class="password-input">
      <input class="control" id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" required maxlength="128" ${attrs({ minlength: policy ? 12 : undefined, 'data-password-policy': policy })}>
      <button class="password-input__toggle" type="button" data-password-toggle aria-pressed="false" aria-controls="${id}" data-label-show="${t('auth.showPassword')}" data-label-hide="${t('auth.hidePassword')}">
        ${icon('eye')}<span class="visually-hidden">${t('auth.showPassword')}</span>
      </button>
    </div>
    ${policy ? passwordRules() : ''}
  </div>`;
}

function roleCards(meta, current) {
  return html`<fieldset class="plain">
    <legend class="field__label">${t('admin.users.role')}</legend>
    <div class="choice-cards role-cards" data-error-for="role">
      ${meta.roles.map(
        (role) => html`<label class="choice-card">
          <input type="radio" name="role" value="${role}" ${attrs({ checked: current === role })}>
          <span class="choice-card__body">${icon(role === 'superadmin' ? 'shield' : role === 'manager' ? 'users' : 'user')}
            <span class="choice-card__text">${t(`admin.roles.${role}`)}<small>${t(`admin.roleHelp.${role}`)}</small></span>
          </span>
        </label>`
      )}
    </div>
  </fieldset>`;
}

const langOptions = () => [
  { value: 'uz', label: t('common.langNames.uz') },
  { value: 'ru', label: t('common.langNames.ru') }
];

export default async function usersView({ root, query }) {
  const [meta, session] = await Promise.all([getMeta(), getSession()]);
  const me = session.user;

  setHTML(
    root,
    html`${viewHead({
      title: t('admin.users.title'),
      lead: t('admin.users.lead'),
      actions: html`<button class="btn btn-accent" type="button" data-create>${icon('plus')}${t('admin.users.new')}</button>`
    })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ placeholder: t('admin.users.searchPlaceholder') })}
      ${filterSelect({ name: 'role', label: t('admin.users.role'), allLabel: t('admin.users.allRoles'), options: meta.roles.map((r) => ({ value: r, label: t(`admin.roles.${r}`) })) })}
      ${filterSelect({
        name: 'status',
        label: t('admin.users.status'),
        allLabel: t('admin.users.allStatuses'),
        options: [
          { value: 'active', label: t('admin.common.active') },
          { value: 'inactive', label: t('admin.common.inactive') },
          { value: 'locked', label: t('admin.users.locked') }
        ]
      })}
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <div data-results>${skeletonTable()}</div>`
  );

  const results = $('[data-results]', root);
  let items = [];

  const ctl = listController({
    root,
    path: PATH,
    endpoint: '/api/admin/users',
    render: (data) => {
      items = data.items;
      if (!items.length) {
        setHTML(results, messageBlock({ iconName: 'users', title: t('admin.common.empty'), text: t('admin.common.emptyFiltered') }));
        return;
      }
      setHTML(
        results,
        html`${resultsMeta(data)}
        ${dataTable({
          rows: items,
          rowAttrs: (user) => ({ class: user.isActive ? '' : 'is-muted' }),
          columns: [
            {
              label: t('admin.users.name'),
              primary: true,
              render: (user) => html`<div class="cell-main">
                <span class="avatar ${user.role === 'user' ? 'avatar--muted' : ''}">${initials(user.name)}</span>
                <span class="cell-main__text">
                  <button class="row-link btn-reset" type="button" data-edit="${user.id}">${user.name}</button>
                  <span class="cell-sub">${user.email}${user.phone ? ` · ${formatPhone(user.phone)}` : ''}</span>
                  ${user.id === me.id ? html`<span class="cell-tags">${badge(t('admin.users.you'), 'accent')}</span>` : ''}
                </span>
              </div>`
            },
            { label: t('admin.users.role'), render: (user) => roleBadge(user.role) },
            {
              label: t('admin.users.status'),
              render: (user) => html`${activeBadge(user.isActive)} ${user.locked ? badge(t('admin.users.locked'), 'danger', { dot: true }) : ''}
                ${user.mustChangePassword ? html`<br><span class="cell-sub">${t('admin.users.mustChange')}</span>` : ''}`
            },
            { label: t('admin.users.lastLogin'), className: 'nowrap', render: (user) => (user.lastLoginAt ? timeCell(user.lastLoginAt) : html`<span class="muted">${t('admin.users.never')}</span>`) },
            { label: t('admin.users.sessions'), className: 'num', render: (user) => html`<span class="mono">${fmtNumber(user.activeSessions || 0)}</span>` },
            {
              label: t('admin.common.actions'),
              className: 'actions',
              render: (user) => {
                const self = user.id === me.id;
                return rowMenu([
                  { icon: 'edit', label: t('common.edit'), attrs: { 'data-edit': user.id } },
                  !self && user.isActive && { icon: 'lock', label: t('admin.users.deactivate'), attrs: { 'data-active': user.id, 'data-value': 'false' } },
                  !self && !user.isActive && { icon: 'check-circle', label: t('admin.users.activate'), attrs: { 'data-active': user.id, 'data-value': 'true' } },
                  user.locked && { icon: 'refresh', label: t('admin.users.unlock'), attrs: { 'data-unlock': user.id } },
                  !self && { icon: 'shield', label: t('admin.users.resetPassword'), attrs: { 'data-reset-password': user.id } },
                  user.activeSessions > 0 && { icon: 'logout', label: t('admin.users.revokeSessions'), attrs: { 'data-revoke': user.id } },
                  { href: `#/audit?entityType=user&entityId=${user.id}`, icon: 'history', label: t('admin.common.history') },
                  !self && 'sep',
                  !self && { icon: 'trash', label: t('common.delete'), danger: true, attrs: { 'data-delete': user.id } }
                ]);
              }
            }
          ]
        })}
        ${ctl.pager(data)}`
      );
    },
    onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
  });

  const find = (id) => items.find((user) => user.id === id);
  const afterChange = () => {
    invalidateOptions();
    return ctl.load();
  };

  function openCreate() {
    const panel = openPanel({
      title: t('admin.users.new'),
      submitLabel: t('common.create'),
      body: html`<div class="grid-2">
          ${inputField({ name: 'name', label: t('admin.users.name'), required: true, attributes: { minlength: 2, maxlength: 100, autocomplete: 'off' } })}
          ${inputField({ name: 'email', label: t('admin.users.email'), type: 'email', required: true, attributes: { maxlength: 254, autocomplete: 'off' } })}
          ${inputField({ name: 'phone', label: t('admin.users.phone'), type: 'tel', optional: true, hint: t('quote.phoneHint'), attributes: { maxlength: 25 } })}
          ${selectField({ name: 'preferredLang', label: t('admin.users.language'), options: langOptions(), value: 'uz' })}
        </div>
        ${roleCards(meta, 'manager')}
        <fieldset class="plain">
          <legend class="field__label">${t('admin.users.passwordMode')}</legend>
          <div class="segmented">
            <label class="segmented__option"><input type="radio" name="passwordMode" value="generate" data-ignore checked><span>${t('admin.users.generatePassword')}</span></label>
            <label class="segmented__option"><input type="radio" name="passwordMode" value="manual" data-ignore><span>${t('admin.users.setPassword')}</span></label>
          </div>
        </fieldset>
        <div data-manual-password hidden>${passwordInput({ name: 'password', label: t('auth.password'), id: 'new-user-password' })}</div>
        <p class="notice notice--info">${icon('info')} ${t('admin.users.createNote')}</p>`,
      onSubmit: async (form, { close }) => {
        clearErrors(form);
        const fields = validateForm(form);
        if (Object.keys(fields).length) {
          showErrors(form, fields, t('errors.validation_failed'));
          return true;
        }
        const values = formValues(form);
        const manual = form.querySelector('input[name="passwordMode"]:checked')?.value === 'manual';
        const body = { name: values.name, email: values.email, phone: values.phone, role: values.role, preferredLang: values.preferredLang };
        if (manual) body.password = values.password;
        const result = await api('/api/admin/users', { method: 'POST', body });
        toast(t('admin.users.created'), { type: 'ok' });
        await close({ force: true });
        await afterChange();
        if (result.temporaryPassword) {
          await secretDialog({ title: t('admin.users.tempPassword'), text: `${result.user.email}\n${t('admin.users.tempPasswordNote')}`, secret: result.temporaryPassword });
        }
        return undefined;
      }
    });
    const box = $('[data-manual-password]', panel.form);
    const input = box.querySelector('input');
    input.disabled = true;
    panel.form.addEventListener('change', (event) => {
      if (event.target.name !== 'passwordMode') return;
      const manual = event.target.value === 'manual';
      box.hidden = !manual;
      input.disabled = !manual;
      if (manual) input.focus();
    });
    liveValidation(panel.form);
    bindPasswordToggles(panel.form);
    bindPasswordMeters(panel.form);
  }

  function openEdit(user) {
    const self = user.id === me.id;
    const panel = openPanel({
      title: `${t('admin.users.edit')}: ${user.email}`,
      body: html`<div class="grid-2">
          ${inputField({ name: 'name', label: t('admin.users.name'), value: user.name, required: true, attributes: { minlength: 2, maxlength: 100 } })}
          ${inputField({ name: 'email', label: t('admin.users.email'), value: user.email, attributes: { disabled: true, 'data-ignore': true } })}
          ${inputField({ name: 'phone', label: t('admin.users.phone'), value: user.phone || '', type: 'tel', optional: true, attributes: { maxlength: 25 } })}
          ${selectField({ name: 'preferredLang', label: t('admin.users.language'), options: langOptions(), value: user.preferredLang || 'uz' })}
        </div>
        ${self ? html`<p class="notice notice--warn">${icon('alert')} ${t('errors.cannot_modify_self')}</p>` : ''}
        ${roleCards(meta, user.role)}
        ${switchField({ name: 'isActive', label: t('admin.common.active'), hint: t('admin.users.activeHint'), checked: user.isActive, disabled: self })}
        <dl class="kv">
          <div><dt>${t('admin.users.lastLogin')}</dt><dd>${user.lastLoginAt ? timeCell(user.lastLoginAt) : t('admin.users.never')}</dd></div>
          <div><dt>${t('admin.common.createdAt')}</dt><dd>${timeCell(user.createdAt)}</dd></div>
        </dl>`,
      onSubmit: async (form) => {
        clearErrors(form);
        const fields = validateForm(form);
        if (Object.keys(fields).length) {
          showErrors(form, fields, t('errors.validation_failed'));
          return true;
        }
        const values = formValues(form);
        const body = { name: values.name, phone: values.phone, preferredLang: values.preferredLang };
        if (!self) {
          body.role = values.role;
          body.isActive = Boolean(values.isActive);
        }
        if (!self && (body.role !== user.role || body.isActive !== user.isActive)) {
          const ok = await confirmDialog({ title: t('admin.users.edit'), text: t('admin.users.confirmRoleChange', { email: user.email }) });
          if (!ok) return true;
        }
        await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body });
        toast(t('admin.common.saved'), { type: 'ok' });
        if (self) document.dispatchEvent(new CustomEvent('admin:user-changed'));
        await afterChange();
        return undefined;
      }
    });
    if (self) panel.form.querySelectorAll('input[name="role"]').forEach((input) => (input.disabled = true));
    liveValidation(panel.form);
  }

  async function action(fn, message) {
    try {
      const result = await fn();
      if (message) toast(typeof message === 'function' ? message(result) : message, { type: 'ok' });
      await afterChange();
      return result;
    } catch (error) {
      reportError(error);
      return null;
    }
  }

  on(root, 'click', '[data-create]', openCreate);
  on(root, 'click', '[data-edit]', (event, button) => {
    const user = find(button.dataset.edit);
    if (user) openEdit(user);
  });
  on(results, 'click', '[data-active]', async (event, button) => {
    const user = find(button.dataset.active);
    const value = button.dataset.value === 'true';
    if (!value && !(await confirmDialog({ title: t('admin.users.deactivate'), text: t('admin.users.confirmDeactivate', { email: user.email }), danger: true, confirmLabel: t('admin.users.deactivate') }))) return;
    action(() => api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { isActive: value } }), value ? t('admin.users.activated') : t('admin.users.deactivated'));
  });
  on(results, 'click', '[data-unlock]', (event, button) => {
    action(() => api(`/api/admin/users/${button.dataset.unlock}/unlock`, { method: 'POST' }), t('admin.users.unlocked'));
  });
  on(results, 'click', '[data-reset-password]', async (event, button) => {
    const user = find(button.dataset.resetPassword);
    if (!(await confirmDialog({ title: t('admin.users.resetPassword'), text: t('admin.users.confirmReset', { email: user.email }), danger: true, confirmLabel: t('admin.users.resetPassword') }))) return;
    const result = await action(() => api(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' }));
    if (result?.temporaryPassword) {
      await secretDialog({ title: t('admin.users.tempPassword'), text: `${user.email}\n${t('admin.users.tempPasswordNote')}`, secret: result.temporaryPassword });
    }
  });
  on(results, 'click', '[data-revoke]', async (event, button) => {
    const user = find(button.dataset.revoke);
    if (!(await confirmDialog({ title: t('admin.users.revokeSessions'), text: t('admin.users.confirmRevoke', { email: user.email }), danger: true, confirmLabel: t('admin.users.revokeSessions') }))) return;
    action(() => api(`/api/admin/users/${user.id}/revoke-sessions`, { method: 'POST' }), (result) => t('admin.users.sessionsRevoked', { count: result.revoked }));
  });
  on(results, 'click', '[data-delete]', async (event, button) => {
    const user = find(button.dataset.delete);
    if (!(await confirmDialog({ title: t('common.delete'), text: t('admin.common.confirmDelete', { name: user.email }), danger: true, confirmLabel: t('common.delete') }))) return;
    action(() => api(`/api/admin/users/${user.id}`, { method: 'DELETE' }), t('admin.common.deleted'));
  });

  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: t('admin.users.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}

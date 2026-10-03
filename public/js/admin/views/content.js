/**
 * Site content: home-page promo banners, and site settings (public
 * contacts, hero texts, announcement bar, which home sections are shown).
 */
import { html, setHTML, icon, on, $, safeUrl } from '../../lib/dom.js';
import { t, loc, fmtDate } from '../../lib/i18n.js';
import { api, can } from '../../lib/api.js';
import { toast, confirmDialog } from '../../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation } from '../../lib/forms.js';
import {
  getMeta,
  viewHead,
  sectionTitle,
  activeBadge,
  dataTable,
  rowMenu,
  inputField,
  numberField,
  selectField,
  switchField,
  locField,
  imageField,
  bindImageFields,
  validateNumbers,
  normalizeNumberInputs,
  reportError,
  openPanel,
  loadingBlock,
  messageBlock,
  setDirtyCheck
} from '../shared.js';

const SECTIONS = ['banners', 'featured', 'discounts', 'shops', 'newest', 'popular', 'brands', 'recent'];
const TELEGRAM_PATTERN = '@?[A-Za-z][A-Za-z0-9_]{4,31}';

/* ------------------------------------------------------------- banners */

function dateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function bannerForm(banner, meta) {
  const b = banner || {};
  return html`
    ${locField({ name: 'title', label: t('admin.banners.titleField'), value: b.title, required: true, min: 2, max: 120 })}
    ${locField({ name: 'subtitle', label: t('admin.banners.subtitle'), value: b.subtitle, max: 240 })}
    <div class="grid-2">
      ${inputField({
        name: 'link',
        label: t('admin.banners.link'),
        value: b.link || '/catalog',
        required: true,
        hint: t('admin.banners.linkHint'),
        attributes: { maxlength: 500, autocomplete: 'off', spellcheck: 'false' }
      })}
      ${selectField({
        name: 'theme',
        label: t('admin.banners.theme'),
        options: meta.bannerThemes.map((value) => ({ value, label: t(`admin.banners.themes.${value}`) })),
        value: b.theme || 'accent'
      })}
    </div>
    ${locField({ name: 'ctaLabel', label: t('admin.banners.ctaLabel'), value: b.ctaLabel, max: 40 })}
    ${imageField({ name: 'image', label: t('admin.banners.image'), value: b.image || '', hint: t('admin.banners.imageHint'), canUpload: can('uploads:write') })}
    <div class="grid-2">
      ${inputField({ name: 'startsAt', label: t('admin.banners.startsAt'), value: dateInput(b.startsAt), type: 'date', optional: true })}
      ${inputField({ name: 'endsAt', label: t('admin.banners.endsAt'), value: dateInput(b.endsAt), type: 'date', optional: true })}
    </div>
    ${numberField({ name: 'sortOrder', label: t('admin.categories.sortOrder'), value: b.sortOrder ?? 100, integer: true, max: 10000, hint: t('admin.categories.sortHint') })}
    <input type="hidden" name="placement" value="${b.placement || meta.bannerPlacements[0]}">
    ${switchField({ name: 'isActive', label: t('admin.banners.isActive'), checked: banner ? b.isActive : true })}`;
}

function collectBanner(values) {
  return {
    title: values.title,
    subtitle: values.subtitle,
    ctaLabel: values.ctaLabel,
    link: values.link,
    image: values.image || '',
    placement: values.placement,
    theme: values.theme,
    sortOrder: values.sortOrder ?? 100,
    isActive: Boolean(values.isActive),
    startsAt: values.startsAt ? new Date(`${values.startsAt}T00:00:00`).toISOString() : null,
    endsAt: values.endsAt ? new Date(`${values.endsAt}T23:59:59`).toISOString() : null
  };
}

function scheduleText(banner) {
  if (!banner.startsAt && !banner.endsAt) return t('admin.banners.always');
  const from = banner.startsAt ? fmtDate(banner.startsAt) : '…';
  const to = banner.endsAt ? fmtDate(banner.endsAt) : '…';
  return `${from} — ${to}`;
}

export async function bannersView({ root }) {
  const meta = await getMeta();
  let items = [];

  const load = async () => {
    const data = await api('/api/admin/banners');
    items = data.items;
    const results = $('[data-results]', root);
    if (!items.length) {
      setHTML(results, messageBlock({ iconName: 'megaphone', title: t('admin.common.empty'), text: t('admin.banners.emptyText') }));
      return;
    }
    setHTML(
      results,
      dataTable({
        rows: items,
        rowAttrs: (banner) => ({ class: banner.isActive ? '' : 'is-muted' }),
        columns: [
          {
            label: t('admin.banners.titleField'),
            primary: true,
            render: (banner) => html`<div class="cell-main">
              <span class="banner-swatch banner-swatch--${banner.theme}">${banner.image ? html`<img src="${safeUrl(banner.image)}" alt="" width="44" height="44" loading="lazy">` : icon('megaphone')}</span>
              <span class="cell-main__text">
                <button class="row-link btn-reset" type="button" data-edit="${banner.id}">${loc(banner.title)}</button>
                <span class="cell-sub">${loc(banner.subtitle)}</span>
              </span>
            </div>`
          },
          { label: t('admin.banners.link'), render: (banner) => html`<a class="mono small row-link" href="${safeUrl(banner.link)}" target="_blank" rel="noopener">${banner.link}</a>` },
          { label: t('admin.banners.schedule'), render: (banner) => html`<span class="small">${scheduleText(banner)}</span>` },
          { label: t('admin.categories.sortOrder'), className: 'num', render: (banner) => html`<span class="mono">${banner.sortOrder}</span>` },
          { label: t('admin.common.status'), render: (banner) => activeBadge(banner.isActive) },
          {
            label: t('admin.common.actions'),
            className: 'actions',
            render: (banner) =>
              rowMenu([
                { icon: 'edit', label: t('common.edit'), attrs: { 'data-edit': banner.id } },
                can('audit:read') && { href: `#/audit?entityType=banner&entityId=${banner.id}`, icon: 'history', label: t('admin.common.history') },
                'sep',
                { icon: 'trash', label: t('common.delete'), danger: true, attrs: { 'data-delete': banner.id, 'data-name': loc(banner.title) } }
              ])
          }
        ]
      })
    );
  };

  setHTML(
    root,
    html`${viewHead({
      title: t('admin.banners.title'),
      lead: t('admin.banners.lead'),
      actions: html`<a class="btn btn-ghost" href="/" target="_blank" rel="noopener">${icon('external')}${t('admin.nav.viewSite')}</a>
        <button class="btn btn-accent" type="button" data-create>${icon('plus')}${t('admin.banners.new')}</button>`
    })}
    <div data-results>${loadingBlock()}</div>`
  );

  const openEditor = (banner) => {
    const panel = openPanel({
      title: banner ? `${t('admin.banners.edit')}: ${loc(banner.title)}` : t('admin.banners.new'),
      body: bannerForm(banner, meta),
      submitLabel: banner ? t('common.save') : t('common.create'),
      onSubmit: async (form) => {
        clearErrors(form);
        normalizeNumberInputs(form);
        const fields = { ...validateForm(form), ...validateNumbers(form) };
        if (Object.keys(fields).length) {
          showErrors(form, fields, t('errors.validation_failed'));
          return true;
        }
        const body = collectBanner(formValues(form));
        if (banner) await api(`/api/admin/banners/${banner.id}`, { method: 'PUT', body });
        else await api('/api/admin/banners', { method: 'POST', body });
        toast(banner ? t('admin.common.saved') : t('admin.common.createdToast'), { type: 'ok' });
        await load();
        return undefined;
      }
    });
    liveValidation(panel.form);
    bindImageFields(panel.form, meta);
  };

  on(root, 'click', '[data-create]', () => openEditor(null));
  on(root, 'click', '[data-edit]', (event, button) => openEditor(items.find((b) => b.id === button.dataset.edit)));
  on(root, 'click', '[data-delete]', async (event, button) => {
    const ok = await confirmDialog({
      title: t('common.delete'),
      text: t('admin.common.confirmDelete', { name: button.dataset.name }),
      confirmLabel: t('common.delete'),
      danger: true
    });
    if (!ok) return;
    try {
      await api(`/api/admin/banners/${button.dataset.delete}`, { method: 'DELETE' });
      toast(t('admin.common.deleted'), { type: 'ok' });
      await load();
    } catch (error) {
      reportError(error);
    }
  });

  await load();
  return { title: t('admin.banners.title') };
}

/* ------------------------------------------------------------ settings */

function settingsForm(settings, { full }) {
  const { contact, home, announcement, sections } = settings;
  return html`
    ${full
      ? html`<section class="panel">
          ${sectionTitle(t('admin.content.contactTitle'), { iconName: 'phone' })}
          <p class="muted small">${t('admin.content.contactLead')}</p>
          <div class="grid-2">
            ${inputField({ name: 'contact.ownerName', label: t('admin.content.ownerName'), value: contact.ownerName, required: true, attributes: { minlength: 2, maxlength: 100 } })}
            ${inputField({ name: 'contact.phone', label: t('admin.shops.phone'), value: contact.phone, type: 'tel', required: true, attributes: { minlength: 7, maxlength: 30 } })}
            ${inputField({
              name: 'contact.telegram',
              label: t('admin.shops.telegram'),
              value: contact.telegram,
              optional: true,
              attributes: { maxlength: 40, pattern: TELEGRAM_PATTERN, 'data-pattern-code': 'invalid_telegram', spellcheck: 'false' }
            })}
            ${inputField({ name: 'contact.instagram', label: t('admin.shops.instagram'), value: contact.instagram, optional: true, attributes: { maxlength: 40, spellcheck: 'false' } })}
            ${inputField({ name: 'contact.email', label: t('admin.shops.email'), value: contact.email, type: 'email', optional: true, attributes: { maxlength: 254 } })}
          </div>
          ${locField({ name: 'contact.address', label: t('admin.shops.address'), value: contact.address, max: 200 })}
          ${locField({ name: 'contact.hours', label: t('admin.content.hours'), value: contact.hours, max: 120 })}
        </section>`
      : ''}

    <section class="panel">
      ${sectionTitle(t('admin.content.heroTitle'), { iconName: 'home' })}
      <p class="muted small">${t('admin.content.heroLead')}</p>
      ${locField({ name: 'home.eyebrow', label: t('admin.content.eyebrow'), value: home.eyebrow, max: 80 })}
      ${locField({ name: 'home.title', label: t('admin.content.headline'), value: home.title, max: 80 })}
      ${locField({ name: 'home.accent', label: t('admin.content.accentLine'), value: home.accent, max: 80 })}
      ${locField({ name: 'home.lead', label: t('admin.content.leadText'), value: home.lead, multiline: true, rows: 3, max: 300 })}
      ${locField({ name: 'home.popularTerms', label: t('admin.content.popularTerms'), value: home.popularTerms, max: 300, hint: t('admin.content.popularTermsHint') })}
    </section>

    <section class="panel">
      ${sectionTitle(t('admin.content.announcementTitle'), { iconName: 'megaphone' })}
      ${switchField({ name: 'announcement.isActive', label: t('admin.content.announcementActive'), checked: Boolean(announcement.isActive) })}
      ${locField({ name: 'announcement.text', label: t('admin.content.announcementText'), value: announcement.text, max: 200 })}
      ${inputField({ name: 'announcement.link', label: t('admin.banners.link'), value: announcement.link, optional: true, hint: t('admin.banners.linkHint'), attributes: { maxlength: 500, spellcheck: 'false' } })}
    </section>

    <section class="panel">
      ${sectionTitle(t('admin.content.sectionsTitle'), { iconName: 'layers' })}
      <p class="muted small">${t('admin.content.sectionsLead')}</p>
      <div class="stack">
        ${SECTIONS.map((key) => switchField({ name: `sections.${key}`, label: t(`admin.content.sections.${key}`), checked: sections[key] !== false }))}
      </div>
    </section>`;
}

function collectSettings(values, { full }) {
  const body = {
    home: values.home,
    announcement: { isActive: Boolean(values.announcement?.isActive), text: values.announcement?.text, link: values.announcement?.link || '' },
    sections: Object.fromEntries(SECTIONS.map((key) => [key, Boolean(values.sections?.[key])]))
  };
  if (full) body.contact = { ...values.contact, telegram: (values.contact.telegram || '').replace(/^@/, ''), instagram: (values.contact.instagram || '').replace(/^@/, '') };
  return body;
}

export async function settingsView({ root }) {
  const full = can('settings:write');
  const settings = await api('/api/admin/settings');
  setHTML(
    root,
    html`${viewHead({
      title: t('admin.content.title'),
      lead: t('admin.content.lead'),
      actions: html`<a class="btn btn-ghost" href="/" target="_blank" rel="noopener">${icon('external')}${t('admin.nav.viewSite')}</a>`
    })}
    <form class="settings-form stack-lg" novalidate data-settings>
      ${settingsForm(settings, { full })}
      <div class="form-actions form-actions--sticky">
        <p class="form-error" role="alert" data-form-error hidden></p>
        <button class="btn btn-accent" type="submit">${icon('check')}${t('common.save')}</button>
      </div>
    </form>`
  );
  const form = $('[data-settings]', root);
  liveValidation(form);
  let dirty = false;
  form.addEventListener('input', () => (dirty = true));
  form.addEventListener('change', () => (dirty = true));
  setDirtyCheck(() => dirty);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const fields = validateForm(form);
    if (Object.keys(fields).length) {
      showErrors(form, fields, t('errors.validation_failed'));
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const body = collectSettings(formValues(form), { full });
      if (full) await api('/api/admin/settings', { method: 'PUT', body });
      else await api('/api/admin/settings/home', { method: 'PATCH', body });
      dirty = false;
      toast(t('admin.common.saved'), { type: 'ok' });
    } catch (error) {
      reportError(error, form);
    } finally {
      button.disabled = false;
    }
  });

  return {
    title: t('admin.content.title'),
    destroy() {
      setDirtyCheck(null);
    }
  };
}


/**
 * Shops: admin list (approval workflow, featured/verified flags, owner
 * assignment) and the shop form shared with the shop-owner cabinet.
 */
import { html, setHTML, icon, on, $, safeUrl, formatPhone } from '../../lib/dom.js';
import { t, fmtNumber } from '../../lib/i18n.js';
import { api, can } from '../../lib/api.js';
import { toast, confirmDialog, noteDialog, badge } from '../../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation } from '../../lib/forms.js';
import {
  getMeta,
  invalidateOptions,
  viewHead,
  sectionTitle,
  statusBadge,
  timeCell,
  dataTable,
  resultsMeta,
  searchInput,
  filterSelect,
  listController,
  rowMenu,
  inputField,
  numberField,
  selectField,
  switchField,
  checkbox,
  locField,
  imageField,
  bindImageFields,
  validateNumbers,
  normalizeNumberInputs,
  reportError,
  openPanel,
  skeletonTable,
  messageBlock
} from '../shared.js';

const ENDPOINT = '/api/admin/shops';
const HOURS_PATTERN = '\\d{2}:\\d{2}\\s?[\\u2013\\-]\\s?\\d{2}:\\d{2}';
const SLUG_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';
const TELEGRAM_PATTERN = '@?[A-Za-z][A-Za-z0-9_]{4,31}';
const INSTAGRAM_PATTERN = '@?[A-Za-z0-9._]{1,30}';

/* ------------------------------------------------------------ the form */

/**
 * Shop fields grouped into sections. `admin` adds slug, owner and flags;
 * the owner cabinet edits only the public profile.
 */
export function shopFields(shop, meta, { admin = false, canUpload = true } = {}) {
  const s = shop || {};
  return html`
    <section class="form-section">
      ${sectionTitle(t('admin.shops.sections.profile'), { iconName: 'store' })}
      <div class="grid-2">
        ${inputField({ name: 'name', label: t('admin.shops.name'), value: s.name, required: true, attributes: { minlength: 2, maxlength: 100 } })}
        ${admin
          ? inputField({
              name: 'slug',
              label: t('admin.products.slug'),
              value: s.slug || '',
              optional: true,
              hint: t('admin.products.slugHint'),
              attributes: { maxlength: 100, pattern: SLUG_PATTERN, 'data-pattern-code': 'invalid_slug', autocomplete: 'off', spellcheck: 'false' }
            })
          : numberField({ name: 'foundedYear', label: t('admin.shops.foundedYear'), value: s.foundedYear, optional: true, integer: true, min: 1900, max: 2100 })}
      </div>
      ${locField({ name: 'tagline', label: t('admin.shops.tagline'), value: s.tagline, max: 120, hint: t('admin.shops.taglineHint') })}
      ${locField({ name: 'description', label: t('admin.shops.description'), value: s.description, multiline: true, rows: 4, max: 2000 })}
      <div class="grid-2">
        ${imageField({ name: 'logoUrl', label: t('admin.shops.logo'), value: s.logoUrl || '', hint: t('admin.shops.logoHint'), canUpload })}
        ${imageField({ name: 'coverUrl', label: t('admin.shops.cover'), value: s.coverUrl || '', hint: t('admin.shops.coverHint'), canUpload })}
      </div>
      <div class="grid-2">
        ${inputField({ name: 'accent', label: t('admin.shops.accent'), value: s.accent || '#FF7A1A', type: 'color', hint: t('admin.shops.accentHint') })}
        ${admin ? numberField({ name: 'foundedYear', label: t('admin.shops.foundedYear'), value: s.foundedYear, optional: true, integer: true, min: 1900, max: 2100 }) : ''}
      </div>
    </section>

    <section class="form-section">
      ${sectionTitle(t('admin.shops.sections.contacts'), { iconName: 'phone' })}
      <div class="grid-2">
        ${inputField({ name: 'phone', label: t('admin.shops.phone'), value: s.phone || '', type: 'tel', required: true, hint: t('admin.shops.phoneHint'), attributes: { maxlength: 25, inputmode: 'tel', autocomplete: 'off' } })}
        ${inputField({ name: 'phone2', label: t('admin.shops.phone2'), value: s.phone2 || '', type: 'tel', optional: true, attributes: { maxlength: 25, inputmode: 'tel', autocomplete: 'off' } })}
        ${inputField({
          name: 'telegram',
          label: t('admin.shops.telegram'),
          value: s.telegram || '',
          optional: true,
          hint: t('admin.shops.telegramHint'),
          attributes: { maxlength: 40, pattern: TELEGRAM_PATTERN, 'data-pattern-code': 'invalid_telegram', autocomplete: 'off', spellcheck: 'false' }
        })}
        ${inputField({
          name: 'instagram',
          label: t('admin.shops.instagram'),
          value: s.instagram || '',
          optional: true,
          hint: t('admin.shops.instagramHint'),
          attributes: { maxlength: 40, pattern: INSTAGRAM_PATTERN, 'data-pattern-code': 'invalid_instagram', autocomplete: 'off', spellcheck: 'false' }
        })}
        ${inputField({ name: 'whatsapp', label: t('admin.shops.whatsapp'), value: s.whatsapp || '', type: 'tel', optional: true, attributes: { maxlength: 25, inputmode: 'tel', autocomplete: 'off' } })}
        ${inputField({ name: 'email', label: t('admin.shops.email'), value: s.email || '', type: 'email', optional: true, attributes: { maxlength: 254 } })}
        ${inputField({ name: 'website', label: t('admin.shops.website'), value: s.website || '', type: 'url', optional: true, attributes: { maxlength: 300, inputmode: 'url' } })}
      </div>
    </section>

    <section class="form-section">
      ${sectionTitle(t('admin.shops.sections.location'), { iconName: 'pin' })}
      ${selectField({
        name: 'city',
        label: t('admin.shops.city'),
        options: meta.regions.map((value) => ({ value, label: t(`regions.${value}`) })),
        value: s.city || 'tashkent_city',
        required: true
      })}
      ${locField({ name: 'address', label: t('admin.shops.address'), value: s.address, max: 200 })}
      ${locField({ name: 'landmark', label: t('admin.shops.landmark'), value: s.landmark, max: 160 })}
      ${inputField({ name: 'mapUrl', label: t('admin.shops.mapUrl'), value: s.mapUrl || '', type: 'url', optional: true, hint: t('admin.shops.mapUrlHint'), attributes: { maxlength: 500, inputmode: 'url' } })}
    </section>

    <section class="form-section">
      ${sectionTitle(t('admin.shops.sections.service'), { iconName: 'clock' })}
      <div class="grid-2">
        ${inputField({
          name: 'workingHours',
          label: t('admin.shops.workingHours'),
          value: s.workingHours || '09:00–18:00',
          required: true,
          hint: t('admin.shops.hoursHint'),
          attributes: { maxlength: 40, pattern: HOURS_PATTERN, 'data-pattern-code': 'invalid_hours' }
        })}
        ${selectField({
          name: 'workingDays',
          label: t('admin.shops.workingDays'),
          options: meta.workingDays.map((value) => ({ value, label: t(`shops.workingDays.${value}`) })),
          value: s.workingDays || 'mon_sat'
        })}
      </div>
      <fieldset class="plain">
        <legend class="field__label">${t('admin.shops.paymentMethods')}</legend>
        <div class="check-grid" data-error-for="paymentMethods">
          ${meta.paymentMethods.map((value) =>
            checkbox({ name: 'paymentMethods', value, label: t(`shops.paymentMethods.${value}`), multi: true, checked: (s.paymentMethods || ['cash']).includes(value) })
          )}
        </div>
      </fieldset>
      ${switchField({ name: 'deliveryAvailable', label: t('admin.shops.deliveryAvailable'), checked: Boolean(s.deliveryAvailable) })}
      ${locField({ name: 'deliveryNote', label: t('admin.shops.deliveryNote'), value: s.deliveryNote, max: 300 })}
    </section>

    ${admin
      ? html`<section class="form-section">
          ${sectionTitle(t('admin.shops.sections.management'), { iconName: 'shield' })}
          ${inputField({
            name: 'ownerEmail',
            label: t('admin.shops.ownerEmail'),
            value: s.owner?.email || '',
            type: 'email',
            optional: true,
            hint: t('admin.shops.ownerEmailHint'),
            attributes: { maxlength: 254, autocomplete: 'off' }
          })}
          <div class="stack">
            ${switchField({ name: 'isVerified', label: t('admin.shops.isVerified'), hint: t('admin.shops.isVerifiedHint'), checked: Boolean(s.isVerified) })}
            ${switchField({ name: 'isFeatured', label: t('admin.shops.isFeatured'), hint: t('admin.shops.isFeaturedHint'), checked: Boolean(s.isFeatured) })}
          </div>
        </section>`
      : ''}`;
}

export function collectShop(values, { admin = false } = {}) {
  const body = {
    name: values.name,
    tagline: values.tagline,
    description: values.description,
    address: values.address,
    landmark: values.landmark,
    city: values.city,
    mapUrl: values.mapUrl || '',
    phone: values.phone,
    phone2: values.phone2 || '',
    telegram: (values.telegram || '').replace(/^@/, ''),
    instagram: (values.instagram || '').replace(/^@/, ''),
    whatsapp: values.whatsapp || '',
    email: values.email || '',
    website: values.website || '',
    workingHours: values.workingHours,
    workingDays: values.workingDays,
    deliveryAvailable: Boolean(values.deliveryAvailable),
    deliveryNote: values.deliveryNote,
    paymentMethods: values.paymentMethods || [],
    foundedYear: values.foundedYear ?? null,
    accent: (values.accent || '#FF7A1A').toUpperCase(),
    logoUrl: values.logoUrl || '',
    coverUrl: values.coverUrl || ''
  };
  if (admin) {
    body.slug = values.slug || undefined;
    body.ownerEmail = values.ownerEmail || '';
    body.isVerified = Boolean(values.isVerified);
    body.isFeatured = Boolean(values.isFeatured);
  }
  return body;
}

/** Client-side checks; returns field → message (empty when valid). */
export function checkShopForm(form, values) {
  const fields = { ...validateForm(form), ...validateNumbers(form) };
  if (!values.paymentMethods.length) fields.paymentMethods = t('validation.required');
  return fields;
}

/* ------------------------------------------------------- status actions */

const STATUS_ACTIONS = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  rejected: ['approved'],
  suspended: ['approved']
};

const ACTION_ICONS = { approved: 'check-circle', rejected: 'x-circle', suspended: 'pause' };

/** Ask for a note when needed and post the new status. Returns the saved shop or null. */
export async function changeShopStatus(shop, status) {
  const needsNote = status !== 'approved';
  let note = '';
  if (needsNote) {
    note = await noteDialog({
      title: t(`admin.shops.action.${status}`),
      text: t(`admin.shops.actionText.${status}`, { name: shop.name }),
      label: t('admin.moderation.note'),
      confirmLabel: t(`admin.shops.action.${status}`),
      danger: true,
      required: status === 'rejected'
    });
    if (note === null) return null;
  } else {
    const ok = await confirmDialog({
      title: t('admin.shops.action.approved'),
      text: t('admin.shops.actionText.approved', { name: shop.name }),
      confirmLabel: t('admin.shops.action.approved')
    });
    if (!ok) return null;
  }
  const saved = await api(`${ENDPOINT}/${shop.id}/status`, { method: 'POST', body: { status, note } });
  toast(t(`admin.shops.toast.${status}`), { type: 'ok' });
  invalidateOptions();
  document.dispatchEvent(new CustomEvent('admin:moderation-changed'));
  return saved;
}

/* ---------------------------------------------------------------- list */

function shopCell(shop) {
  return html`<div class="cell-main">
    ${shop.logoUrl ? html`<img class="thumb thumb--square" src="${safeUrl(shop.logoUrl)}" alt="" width="44" height="44" loading="lazy">` : html`<span class="icon-box">${icon('store')}</span>`}
    <span class="cell-main__text">
      <button class="row-link btn-reset" type="button" data-edit="${shop.id}">${shop.name}</button>
      <span class="cell-sub">${t(`regions.${shop.city}`)}${shop.foundedYear ? ` · ${t('shops.since', { year: shop.foundedYear })}` : ''}</span>
      <span class="cell-tags">
        ${statusBadge(shop.status, 'shop')}
        ${shop.isVerified ? badge(t('common.verified'), 'ok') : ''}
        ${shop.isFeatured ? badge(t('admin.products.featuredBadge'), 'hazard') : ''}
        ${shop.isDemo ? badge(t('shops.demo'), 'muted') : ''}
      </span>
    </span>
  </div>`;
}

export async function shopListView({ root, query }) {
  const meta = await getMeta();
  const canWrite = can('shops:write');
  const canApprove = can('shops:approve');
  const canDelete = can('shops:delete');

  setHTML(
    root,
    html`${viewHead({
      title: t('admin.shops.title'),
      lead: t('admin.shops.lead'),
      actions: canWrite ? html`<button class="btn btn-accent" type="button" data-create>${icon('plus')}${t('admin.shops.new')}</button>` : ''
    })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ placeholder: t('admin.shops.searchPlaceholder') })}
      ${filterSelect({
        name: 'status',
        label: t('admin.common.status'),
        allLabel: t('admin.products.allStatuses'),
        options: meta.shopStatuses.map((value) => ({ value, label: t(`admin.status.shop.${value}`) }))
      })}
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <div data-results>${skeletonTable()}</div>`
  );

  const results = $('[data-results]', root);
  let items = [];

  const ctl = listController({
    root,
    path: '/shops',
    endpoint: ENDPOINT,
    defaults: {},
    render: (data) => {
      items = data.items;
      if (!items.length) {
        setHTML(results, messageBlock({ iconName: 'store', title: t('admin.common.empty'), text: t('admin.common.emptyFiltered') }));
        return;
      }
      setHTML(
        results,
        html`${resultsMeta(data)}
        ${dataTable({
          rows: items,
          rowAttrs: (shop) => ({ class: shop.status === 'approved' ? '' : 'is-muted' }),
          columns: [
            { label: t('admin.shops.colShop'), primary: true, render: shopCell },
            {
              label: t('admin.shops.colOwner'),
              render: (shop) =>
                shop.owner
                  ? html`${shop.owner.name}<br><span class="cell-sub">${shop.owner.email}</span>`
                  : html`<span class="muted">${t('admin.shops.noOwner')}</span>`
            },
            {
              label: t('admin.shops.colContacts'),
              render: (shop) => html`<a class="row-link mono small nowrap" href="tel:${shop.phone}">${formatPhone(shop.phone)}</a>
                ${shop.telegram ? html`<br><span class="cell-sub cell-ellipsis">@${shop.telegram}</span>` : ''}`
            },
            {
              label: t('admin.shops.colProducts'),
              className: 'num',
              render: (shop) => html`<a class="row-link mono" href="#/products?shop=${shop.id}">${fmtNumber(shop.products?.approved || 0)}</a>
                ${shop.products?.pending ? html`<br><a class="cell-sub" href="#/products?shop=${shop.id}&status=pending">${t('admin.shops.pendingCount', { count: shop.products.pending })}</a>` : ''}`
            },
            {
              label: t('admin.shops.colRating'),
              className: 'num',
              render: (shop) => (shop.reviewCount ? html`<span class="mono">★ ${shop.rating.toFixed(1)}</span><br><span class="cell-sub">${fmtNumber(shop.reviewCount)}</span>` : html`<span class="muted">—</span>`)
            },
            { label: t('admin.products.colUpdated'), className: 'nowrap', render: (shop) => timeCell(shop.updatedAt) },
            {
              label: t('admin.common.actions'),
              className: 'actions',
              render: (shop) =>
                rowMenu([
                  { icon: canWrite ? 'edit' : 'eye', label: canWrite ? t('common.edit') : t('admin.common.open'), attrs: { 'data-edit': shop.id } },
                  shop.status === 'approved' && { href: `/shop/${shop.slug}`, icon: 'external', label: t('admin.products.viewOnSite'), attrs: { target: '_blank', rel: 'noopener' } },
                  { href: `#/products?shop=${shop.id}`, icon: 'package', label: t('admin.shops.products') },
                  ...(canApprove
                    ? (STATUS_ACTIONS[shop.status] || []).map((status) => ({
                        icon: ACTION_ICONS[status],
                        label: t(`admin.shops.action.${status}`),
                        danger: status !== 'approved',
                        attrs: { 'data-status': status, 'data-id': shop.id }
                      }))
                    : []),
                  can('audit:read') && { href: `#/audit?entityType=shop&entityId=${shop.id}`, icon: 'history', label: t('admin.common.history') },
                  canDelete && 'sep',
                  canDelete && { icon: 'trash', label: t('common.delete'), danger: true, attrs: { 'data-delete': shop.id, 'data-name': shop.name } }
                ])
            }
          ]
        })}
        ${ctl.pager(data)}`
      );
    },
    onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
  });

  function openEditor(shop) {
    const statusInfo = shop
      ? html`<div class="note-box note-box--${shop.status}">
          ${statusBadge(shop.status, 'shop')}
          ${shop.statusNote ? html`<p>${shop.statusNote}</p>` : ''}
          ${shop.products ? html`<p class="cell-sub">${t('admin.shops.productSummary', { approved: shop.products.approved, pending: shop.products.pending, total: shop.products.total })}</p>` : ''}
        </div>`
      : html`${selectField({
          name: 'status',
          label: t('admin.common.status'),
          options: ['approved', 'pending'].map((value) => ({ value, label: t(`admin.status.shop.${value}`) })),
          value: 'approved'
        })}`;
    const panel = openPanel({
      title: shop ? `${t('admin.shops.edit')}: ${shop.name}` : t('admin.shops.new'),
      body: html`${statusInfo}${shopFields(shop, meta, { admin: true, canUpload: can('uploads:write') })}`,
      submitLabel: shop ? t('common.save') : t('common.create'),
      readOnly: !canWrite,
      onSubmit: async (form) => {
        clearErrors(form);
        normalizeNumberInputs(form);
        const raw = formValues(form);
        const values = collectShop(raw, { admin: true });
        if (!shop) values.status = raw.status || 'approved';
        const fields = checkShopForm(form, values);
        if (Object.keys(fields).length) {
          showErrors(form, fields, t('errors.validation_failed'));
          return true;
        }
        if (shop) await api(`${ENDPOINT}/${shop.id}`, { method: 'PUT', body: values });
        else await api(ENDPOINT, { method: 'POST', body: values });
        invalidateOptions();
        toast(shop ? t('admin.common.saved') : t('admin.common.createdToast'), { type: 'ok' });
        await ctl.load();
        return undefined;
      }
    });
    liveValidation(panel.form);
    bindImageFields(panel.form, meta);
  }

  on(root, 'click', '[data-create]', () => openEditor(null));
  on(root, 'click', '[data-edit]', async (event, button) => {
    try {
      openEditor(await api(`${ENDPOINT}/${button.dataset.edit}`));
    } catch (error) {
      reportError(error);
    }
  });
  on(root, 'click', '[data-status]', async (event, button) => {
    const shop = items.find((entry) => entry.id === button.dataset.id);
    if (!shop) return;
    try {
      if (await changeShopStatus(shop, button.dataset.status)) await ctl.load();
    } catch (error) {
      reportError(error);
    }
  });
  on(root, 'click', '[data-delete]', async (event, button) => {
    const ok = await confirmDialog({
      title: t('common.delete'),
      text: t('admin.shops.confirmDelete', { name: button.dataset.name }),
      confirmLabel: t('common.delete'),
      danger: true
    });
    if (!ok) return;
    try {
      await api(`${ENDPOINT}/${button.dataset.delete}`, { method: 'DELETE' });
      invalidateOptions();
      toast(t('admin.common.deleted'), { type: 'ok' });
      ctl.load();
    } catch (error) {
      reportError(error);
    }
  });

  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: t('admin.shops.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}


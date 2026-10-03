/**
 * Generic list + slide-over editor for categories (two levels: parent
 * groups and the subcategories that hold products) and brands.
 */
import { html, setHTML, icon, on, $, safeUrl } from '../../lib/dom.js';
import { t, loc, fmtNumber } from '../../lib/i18n.js';
import { api, can } from '../../lib/api.js';
import { toast, confirmDialog, badge } from '../../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation } from '../../lib/forms.js';
import {
  getMeta,
  getOptions,
  invalidateOptions,
  imageField,
  bindImageFields,
  viewHead,
  activeBadge,
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
  locField,
  validateNumbers,
  normalizeNumberInputs,
  reportError,
  openPanel,
  skeletonTable,
  messageBlock,
  attrs
} from '../shared.js';

const SLUG_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';

function slugField(item) {
  return inputField({
    name: 'slug',
    label: t('admin.products.slug'),
    value: item?.slug || '',
    optional: true,
    hint: t('admin.products.slugHint'),
    attributes: { maxlength: 100, pattern: SLUG_PATTERN, 'data-pattern-code': 'invalid_slug', autocomplete: 'off', spellcheck: 'false' }
  });
}

function productCount(item, type) {
  const count = item.productCount || 0;
  if (!count) return html`<span class="muted">0</span>`;
  if (type === 'categories' && !item.parent) return html`<span class="mono">${fmtNumber(count)}</span>`;
  const param = type === 'categories' ? 'category' : null;
  return param
    ? html`<a class="row-link mono" href="#/products?${param}=${item.id}">${fmtNumber(count)}</a>`
    : html`<span class="mono">${fmtNumber(count)}</span>`;
}

const CONFIG = {
  categories: {
    endpoint: '/api/admin/categories',
    title: 'admin.categories.title',
    lead: 'admin.categories.lead',
    newLabel: 'admin.categories.new',
    editLabel: 'admin.categories.edit',
    writePermission: 'taxonomy:write',
    deletePermission: 'taxonomy:delete',
    entity: 'category',
    label: (item) => loc(item.name),
    viewUrl: (item) => (item.isActive ? `/catalog?category=${item.slug}` : null),
    /** Parents first, each followed by its subcategories. */
    arrange: (list) => {
      const roots = list.filter((c) => !c.parent || !list.some((p) => p.id === c.parent));
      return roots.flatMap((root) => [root, ...list.filter((c) => c.parent === root.id)]);
    },
    columns: (type) => [
      {
        label: t('admin.categories.name'),
        primary: true,
        render: (item) => html`<div class="cell-main ${item.parent ? 'cell-main--child' : ''}">
          ${item.image
            ? html`<img class="thumb thumb--square" src="${safeUrl(item.image)}" alt="" width="44" height="44" loading="lazy">`
            : html`<span class="icon-box">${icon(item.icon || 'box')}</span>`}
          <span class="cell-main__text">
            <button class="row-link btn-reset" type="button" data-edit="${item.id}">${loc(item.name)}</button>
            <span class="cell-sub">UZ: ${item.name.uz} · RU: ${item.name.ru}</span>
            <span class="cell-tags">${item.parent ? badge(t('admin.categories.subcategory'), 'muted') : badge(t('admin.categories.group'), 'info')}</span>
          </span>
        </div>`
      },
      { label: t('admin.categories.slug'), render: (item) => html`<span class="mono small">${item.slug}</span>` },
      { label: t('admin.categories.products'), className: 'num', render: (item) => productCount(item, type) },
      { label: t('admin.categories.sortOrder'), className: 'num', render: (item) => html`<span class="mono">${item.sortOrder}</span>` },
      { label: t('admin.common.status'), render: (item) => activeBadge(item.isActive) }
    ],
    form: (item, meta, options) => html`
      ${locField({ name: 'name', label: t('admin.categories.name'), value: item?.name, required: true, min: 2, max: 80 })}
      ${selectField({
        name: 'parent',
        label: t('admin.categories.parent'),
        options: options.parents.filter((p) => p.id !== item?.id).map((p) => ({ value: p.id, label: loc(p.name) })),
        value: item?.parent || '',
        placeholder: t('admin.categories.noParent'),
        hint: t('admin.categories.parentHint')
      })}
      ${imageField({ name: 'image', label: t('admin.categories.image'), value: item?.image || '', hint: t('admin.categories.imageHint'), canUpload: can('uploads:write') })}
      ${locField({ name: 'description', label: t('admin.categories.description'), value: item?.description, multiline: true, rows: 3, max: 400 })}
      <fieldset class="plain">
        <legend class="field__label">${t('admin.categories.icon')}</legend>
        <div class="icon-select">
          ${meta.categoryIcons.map(
            (name) => html`<label class="icon-select__option" title="${name}">
              <input type="radio" name="icon" value="${name}" ${attrs({ checked: (item?.icon || 'box') === name })}>
              <span>${icon(name)}<span class="visually-hidden">${name}</span></span>
            </label>`
          )}
        </div>
      </fieldset>
      <div class="grid-2">
        ${numberField({ name: 'sortOrder', label: t('admin.categories.sortOrder'), value: item?.sortOrder ?? 100, integer: true, max: 10000, hint: t('admin.categories.sortHint') })}
        ${slugField(item)}
      </div>
      ${switchField({ name: 'isActive', label: t('admin.categories.isActive'), hint: t('admin.categories.isActiveHint'), checked: item ? item.isActive : true })}`,
    collect: (values) => ({
      slug: values.slug || undefined,
      name: values.name,
      description: values.description,
      parent: values.parent || null,
      image: values.image || '',
      icon: values.icon || 'box',
      sortOrder: values.sortOrder ?? 100,
      isActive: Boolean(values.isActive)
    })
  },

  brands: {
    endpoint: '/api/admin/brands',
    title: 'admin.brands.title',
    lead: 'admin.brands.lead',
    newLabel: 'admin.brands.new',
    editLabel: 'admin.brands.edit',
    writePermission: 'taxonomy:write',
    deletePermission: 'taxonomy:delete',
    entity: 'brand',
    label: (item) => item.name,
    viewUrl: (item) => (item.isActive ? `/catalog?brand=${item.slug}` : null),
    columns: (type) => [
      {
        label: t('admin.brands.name'),
        primary: true,
        render: (item) => html`<div class="cell-main">
          <span class="icon-box">${icon('star')}</span>
          <span class="cell-main__text">
            <button class="row-link btn-reset" type="button" data-edit="${item.id}">${item.name}</button>
            <span class="cell-sub">${item.slug}</span>
          </span>
        </div>`
      },
      { label: t('admin.brands.country'), render: (item) => (item.country ? html`<span class="mono-chip">${item.country}</span>` : html`<span class="muted">${t('admin.common.none')}</span>`) },
      { label: t('admin.brands.products'), className: 'num', render: (item) => productCount(item, type) },
      { label: t('admin.common.status'), render: (item) => activeBadge(item.isActive) }
    ],
    form: (item) => html`
      <div class="grid-2">
        ${inputField({ name: 'name', label: t('admin.brands.name'), value: item?.name, required: true, attributes: { maxlength: 80 } })}
        ${inputField({
          name: 'country',
          label: t('admin.brands.country'),
          value: item?.country || '',
          optional: true,
          hint: t('admin.brands.countryHint'),
          attributes: { maxlength: 2, pattern: '[A-Za-z]{2}', 'data-pattern-code': 'invalid_country', autocomplete: 'off' }
        })}
      </div>
      ${locField({ name: 'description', label: t('admin.brands.description'), value: item?.description, multiline: true, rows: 3, max: 400 })}
      ${slugField(item)}
      ${switchField({ name: 'isActive', label: t('admin.brands.isActive'), checked: item ? item.isActive : true })}`,
    collect: (values) => ({
      slug: values.slug || undefined,
      name: values.name,
      country: (values.country || '').toUpperCase(),
      description: values.description,
      isActive: Boolean(values.isActive)
    })
  }
};

export function taxonomyView(type) {
  const config = CONFIG[type];
  const path = `/${type}`;

  return async function view({ root, query }) {
    const [meta, options] = await Promise.all([getMeta(), type === 'categories' ? getOptions({ force: true }) : Promise.resolve(null)]);
    const canWrite = can(config.writePermission);
    const canDelete = can(config.deletePermission);

    setHTML(
      root,
      html`${viewHead({
        title: t(config.title),
        lead: t(config.lead),
        actions: canWrite ? html`<button class="btn btn-accent" type="button" data-create>${icon('plus')}${t(config.newLabel)}</button>` : ''
      })}
      <form class="filter-bar" data-filters role="search">
        ${searchInput({})}
        ${filterSelect({
          name: 'active',
          label: t('admin.common.status'),
          allLabel: t('admin.products.allStatuses'),
          options: [
            { value: 'active', label: t('admin.common.active') },
            { value: 'inactive', label: t('admin.common.inactive') }
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
      path,
      endpoint: config.endpoint,
      defaults: type === 'categories' ? { limit: 200 } : {},
      render: (data) => {
        items = config.arrange ? config.arrange(data.items) : data.items;
        if (!items.length) {
          setHTML(results, messageBlock({ iconName: 'inbox', title: t('admin.common.empty'), text: t('admin.common.emptyFiltered') }));
          return;
        }
        setHTML(
          results,
          html`${resultsMeta(data)}
          ${dataTable({
            rows: items,
            rowAttrs: (item) => ({ class: item.isActive ? '' : 'is-muted' }),
            columns: [
              ...config.columns(type),
              {
                label: t('admin.common.actions'),
                className: 'actions',
                render: (item) => rowMenu([
                  { icon: canWrite ? 'edit' : 'eye', label: canWrite ? t('common.edit') : t('admin.common.open'), attrs: { 'data-edit': item.id } },
                  config.viewUrl?.(item) && { href: config.viewUrl(item), icon: 'external', label: t('admin.products.viewOnSite'), attrs: { target: '_blank', rel: 'noopener' } },
                  can('audit:read') && { href: `#/audit?entityType=${config.entity}&entityId=${item.id}`, icon: 'history', label: t('admin.common.history') },
                  canDelete && 'sep',
                  canDelete && {
                    icon: 'trash',
                    label: t('common.delete'),
                    danger: true,
                    attrs: { 'data-delete': item.id, 'data-name': config.label(item) }
                  }
                ])
              }
            ]
          })}
          ${ctl.pager(data)}`
        );
      },
      onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
    });

    function openEditor(item) {
      const panel = openPanel({
        title: item ? `${t(config.editLabel)}: ${config.label(item)}` : t(config.newLabel),
        body: config.form(item, meta, options),
        submitLabel: item ? t('common.save') : t('common.create'),
        readOnly: !canWrite,
        onSubmit: async (form) => {
          clearErrors(form);
          normalizeNumberInputs(form);
          const values = config.collect(formValues(form));
          const fields = { ...validateForm(form), ...validateNumbers(form), ...(config.check ? config.check(values) : {}) };
          if (Object.keys(fields).length) {
            showErrors(form, fields, t('errors.validation_failed'));
            return true;
          }
          const saved = item
            ? await api(`${config.endpoint}/${item.id}`, { method: 'PUT', body: values })
            : await api(config.endpoint, { method: 'POST', body: values });
          invalidateOptions();
          if (type === 'categories') Object.assign(options, await getOptions({ force: true }));
          toast(item ? t('admin.common.saved') : t('admin.common.createdToast'), { type: 'ok' });
          await ctl.load();
          return saved ? undefined : true;
        }
      });
      liveValidation(panel.form);
      bindImageFields(panel.form, meta);
    }

    on(root, 'click', '[data-create]', () => openEditor(null));
    on(root, 'click', '[data-edit]', async (event, button) => {
      const cached = items.find((entry) => entry.id === button.dataset.edit);
      try {
        const item = cached || (await api(`${config.endpoint}/${button.dataset.edit}`));
        openEditor(item);
      } catch (error) {
        reportError(error);
      }
    });
    on(root, 'click', '[data-delete]', async (event, button) => {
      const ok = await confirmDialog({
        title: t('common.delete'),
        text: t('admin.common.confirmDelete', { name: button.dataset.name }),
        confirmLabel: t('common.delete'),
        danger: true
      });
      if (!ok) return;
      try {
        await api(`${config.endpoint}/${button.dataset.delete}`, { method: 'DELETE' });
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
      title: t(config.title),
      update(next) {
        ctl.fromQuery(next);
        ctl.load();
      }
    };
  };
}

import { html, setHTML, icon, on, safeUrl, $, $$ } from '../../lib/dom.js';
import { t, loc, fmtMoney, fmtNumber, fmtDateTime, unitShort } from '../../lib/i18n.js';
import { api, can } from '../../lib/api.js';
import { toast, confirmDialog, badge, setBusy } from '../../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation } from '../../lib/forms.js';
import { PLACEHOLDER_IMAGE } from '../../lib/format.js';
import {
  getMeta,
  getOptions,
  viewHead,
  sectionTitle,
  stockBadge,
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
  locField,
  toArray,
  validateNumbers,
  normalizeNumberInputs,
  reportError,
  setDirtyCheck,
  loadingBlock,
  skeletonTable,
  messageBlock,
  attrs
} from '../shared.js';

const PATH = '/products';
const MAX_IMAGES = 8;

function optionName(option) {
  return typeof option.name === 'string' ? option.name : loc(option.name);
}

function supplierLabel(supplier) {
  return `${supplier.stallNumber} · ${supplier.name}`;
}

/* ================================================================ list */

function productRow(product) {
  const canWrite = can('products:write');
  const canDelete = can('products:delete');
  const cover = product.images?.[0] || PLACEHOLDER_IMAGE;
  return {
    cells: product,
    menu: rowMenu([
      { href: `#/products/${product.id}`, icon: 'edit', label: t('common.edit') },
      canWrite && { icon: 'copy', label: t('admin.products.duplicate'), attrs: { 'data-duplicate': product.id } },
      product.isActive && { href: `/product/${product.slug}`, icon: 'external', label: t('admin.products.viewOnSite'), attrs: { target: '_blank', rel: 'noopener' } },
      can('audit:read') && { href: `#/audit?entityType=product&entityId=${product.id}`, icon: 'history', label: t('admin.common.history') },
      canWrite && 'sep',
      canWrite && {
        icon: 'star',
        label: product.isFeatured ? t('admin.products.unfeature') : t('admin.products.feature'),
        attrs: { 'data-feature': product.id, 'data-value': String(!product.isFeatured) }
      },
      canDelete && { icon: 'trash', label: t('common.delete'), danger: true, attrs: { 'data-delete': product.id, 'data-name': loc(product.name) } }
    ]),
    cover
  };
}

function renderProducts(container, data, ctl) {
  if (!data.items.length) {
    setHTML(container, messageBlock({ iconName: 'package', title: t('admin.common.empty'), text: t('admin.common.emptyFiltered') }));
    return;
  }
  const canWrite = can('products:write');
  const rows = data.items.map(productRow);
  setHTML(
    container,
    html`${resultsMeta(data)}
    ${dataTable({
      rows,
      rowAttrs: (row) => ({ class: row.cells.isActive ? '' : 'is-muted', 'data-id': row.cells.id }),
      columns: [
        {
          label: t('admin.products.colProduct'),
          primary: true,
          render: (row) => html`<div class="cell-main">
            <img class="thumb" src="${safeUrl(row.cover)}" alt="" width="56" height="42" loading="lazy">
            <div class="cell-main__text">
              <a class="row-link" href="#/products/${row.cells.id}">${loc(row.cells.name)}</a>
              <span class="cell-sub">${row.cells.sku}${row.cells.brandName ? ` · ${row.cells.brandName}` : ''}</span>
              <span class="cell-tags">
                ${row.cells.isFeatured ? badge(t('admin.products.featuredBadge'), 'hazard') : ''}
                ${row.cells.isActive ? '' : badge(t('admin.products.draft'), 'muted')}
              </span>
            </div>
          </div>`
        },
        {
          label: t('admin.products.colCategory'),
          render: (row) => html`${loc(row.cells.categoryName)}<br><span class="cell-sub">${row.cells.supplierName || ''}</span>`
        },
        {
          label: t('admin.products.colPrice'),
          className: 'num',
          render: (row) => html`<span class="price-cell"><strong>${fmtMoney(row.cells.price)}</strong><br>
            <span class="cell-sub">/ ${unitShort(row.cells.unit)}${row.cells.hasBulkPricing ? ` · ${t('admin.products.tiersShort', { count: row.cells.priceTiers.length })}` : ''}</span></span>`
        },
        {
          label: t('admin.products.colStock'),
          render: (row) => html`${stockBadge(row.cells.stock?.status)}${
            row.cells.stock?.quantity != null ? html`<br><span class="cell-sub">${fmtNumber(row.cells.stock.quantity)} ${unitShort(row.cells.unit)}</span>` : ''
          }`
        },
        {
          label: t('admin.products.published'),
          render: (row) => html`<label class="switch switch--table" title="${t('admin.products.isActive')}">
            <input type="checkbox" data-toggle-active="${row.cells.id}" ${attrs({ checked: row.cells.isActive, disabled: !canWrite })} aria-label="${t('admin.products.isActive')}: ${loc(row.cells.name)}">
            <span class="switch__track"></span>
          </label>`
        },
        { label: t('admin.products.colUpdated'), className: 'nowrap', render: (row) => timeCell(row.cells.updatedAt) },
        { label: t('admin.common.actions'), className: 'actions', render: (row) => row.menu }
      ]
    })}
    ${ctl.pager(data)}`
  );
}

export async function productListView({ root, query }) {
  const [options, meta] = await Promise.all([getOptions(), getMeta()]);
  setHTML(
    root,
    html`${viewHead({
      title: t('admin.products.title'),
      lead: t('admin.products.lead'),
      actions: can('products:write') ? html`<a class="btn btn-accent" href="#/products/new">${icon('plus')}${t('admin.products.new')}</a>` : ''
    })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ placeholder: t('admin.products.searchPlaceholder') })}
      ${filterSelect({ name: 'category', label: t('admin.products.category'), allLabel: t('admin.products.allCategories'), options: options.categories.map((c) => ({ value: c.id, label: optionName(c) })) })}
      ${filterSelect({ name: 'supplier', label: t('admin.products.supplier'), allLabel: t('admin.products.allSuppliers'), options: options.suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) })) })}
      ${filterSelect({ name: 'stock', label: t('admin.products.stockStatus'), allLabel: t('admin.products.allStock'), options: meta.stockStatuses.map((s) => ({ value: s, label: t(`stock.${s}`) })) })}
      ${filterSelect({
        name: 'active',
        label: t('admin.common.status'),
        allLabel: t('admin.products.allStatuses'),
        options: [
          { value: 'active', label: t('admin.products.published') },
          { value: 'inactive', label: t('admin.products.draft') }
        ]
      })}
      <select class="control control--compact" name="sort" aria-label="${t('admin.common.sort')}">
        ${['updated', 'name', 'sku', 'price_asc', 'price_desc'].map((value) => html`<option value="${value}">${t(`admin.products.sort.${value}`)}</option>`)}
      </select>
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <div data-results>${skeletonTable()}</div>`
  );
  const results = $('[data-results]', root);
  const ctl = listController({
    root,
    path: PATH,
    endpoint: '/api/admin/products',
    defaults: { sort: 'updated' },
    render: (data) => renderProducts(results, data, ctl),
    onError: (error) => {
      setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }));
    }
  });

  on(results, 'change', '[data-toggle-active]', async (event, input) => {
    const { toggleActive: id } = input.dataset;
    input.disabled = true;
    try {
      await api(`/api/admin/products/${id}`, { method: 'PATCH', body: { isActive: input.checked } });
      input.closest('tr')?.classList.toggle('is-muted', !input.checked);
      toast(input.checked ? t('admin.products.publishedToast') : t('admin.products.hiddenToast'), { type: 'ok' });
    } catch (error) {
      input.checked = !input.checked;
      reportError(error);
    } finally {
      input.disabled = false;
    }
  });

  on(results, 'click', '[data-feature]', async (event, button) => {
    try {
      await api(`/api/admin/products/${button.dataset.feature}`, { method: 'PATCH', body: { isFeatured: button.dataset.value === 'true' } });
      toast(t('admin.common.saved'), { type: 'ok' });
      ctl.load();
    } catch (error) {
      reportError(error);
    }
  });

  on(results, 'click', '[data-duplicate]', (event, button) => {
    window.location.hash = `#/products/new?from=${button.dataset.duplicate}`;
  });

  on(results, 'click', '[data-delete]', async (event, button) => {
    const ok = await confirmDialog({
      title: t('common.delete'),
      text: t('admin.common.confirmDelete', { name: button.dataset.name }),
      confirmLabel: t('common.delete'),
      danger: true
    });
    if (!ok) return;
    try {
      await api(`/api/admin/products/${button.dataset.delete}`, { method: 'DELETE' });
      toast(t('admin.common.deleted'), { type: 'ok' });
      ctl.load();
    } catch (error) {
      reportError(error);
    }
  });

  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: t('admin.products.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}

/* ================================================================ form */

function tierRow(tier = {}, index = 0) {
  return html`<div class="repeater__row" data-tier>
    ${numberField({ name: `priceTiers.${index}.minQty`, label: t('admin.products.tierMinQty'), value: tier.minQty, min: 0.001, required: true, className: 'tier-qty' })}
    ${numberField({ name: `priceTiers.${index}.price`, label: t('admin.products.tierPrice'), value: tier.price, min: 0, required: true })}
    <button class="btn btn-icon btn-ghost" type="button" data-remove-row aria-label="${t('admin.products.removeTier')}">${icon('trash')}</button>
  </div>`;
}

function specRow(spec = {}, index = 0) {
  return html`<div class="repeater__row repeater__row--spec" data-spec>
    <div class="repeater__stack">
      ${locField({ name: `specs.${index}.label`, label: t('admin.products.specLabel'), value: spec.label, required: true, max: 60, stacked: true })}
    </div>
    <div class="repeater__stack">
      ${locField({ name: `specs.${index}.value`, label: t('admin.products.specValue'), value: spec.value, required: true, max: 120, stacked: true })}
    </div>
    <button class="btn btn-icon btn-ghost" type="button" data-remove-row aria-label="${t('admin.products.removeSpec')}">${icon('trash')}</button>
  </div>`;
}

/** Keep dotted names in sync with row order after add/remove. */
function renumber(container, prefix) {
  $$(':scope > .repeater__row', container).forEach((row, index) => {
    $$('[name]', row).forEach((element) => {
      element.name = element.name.replace(new RegExp(`^${prefix}\\.\\d+\\.`), `${prefix}.${index}.`);
    });
  });
}

function imageTiles(images) {
  if (!images.length) return html`<p class="repeater__empty">${t('admin.products.noImages')}</p>`;
  return html`<div class="image-grid">${images.map(
    (src, index) => html`<figure class="image-tile ${index === 0 ? 'is-cover' : ''}">
      <img src="${safeUrl(src)}" alt="" loading="lazy">
      ${index === 0 ? html`<span class="image-tile__badge badge badge--accent">${t('admin.products.cover')}</span>` : ''}
      <figcaption class="image-tile__actions">
        <button class="btn btn-icon btn-sm btn-ghost" type="button" data-image-cover="${index}" ${attrs({ disabled: index === 0 })} aria-label="${t('admin.products.makeCover')}" title="${t('admin.products.makeCover')}">${icon('star')}</button>
        <a class="btn btn-icon btn-sm btn-ghost" href="${safeUrl(src)}" target="_blank" rel="noopener" aria-label="${t('admin.common.open')}" title="${t('admin.common.open')}">${icon('external')}</a>
        <button class="btn btn-icon btn-sm btn-ghost" type="button" data-image-remove="${index}" aria-label="${t('admin.products.removeImage')}" title="${t('admin.products.removeImage')}">${icon('trash')}</button>
      </figcaption>
    </figure>`
  )}</div>`;
}

function blankProduct(options) {
  return {
    sku: '',
    slug: '',
    name: { uz: '', ru: '' },
    description: { uz: '', ru: '' },
    category: '',
    brand: null,
    supplier: '',
    materialType: 'other',
    grade: '',
    unit: 'piece',
    price: null,
    oldPrice: null,
    priceTiers: [],
    minOrderQty: 1,
    orderStep: 1,
    unitsPerPallet: null,
    dimensions: {},
    weightKg: null,
    specs: [],
    stock: { status: 'in_stock', quantity: null },
    leadTimeDays: 0,
    images: [],
    isFeatured: false,
    isActive: true,
    _options: options
  };
}

function formMarkup(product, { options, meta, isNew, readOnly }) {
  const d = product.dimensions || {};
  const categoryOptions = options.categories.map((c) => ({ value: c.id, label: `${optionName(c)}${c.isActive ? '' : ` (${t('admin.common.inactive')})`}` }));
  const brandOptions = options.brands.map((b) => ({ value: b.id, label: b.name }));
  const supplierOptions = options.suppliers.map((s) => ({ value: s.id, label: `${supplierLabel(s)}${s.isActive ? '' : ` (${t('admin.common.inactive')})`}` }));
  const skuPattern = '[A-Za-z0-9][A-Za-z0-9\\-]{2,31}';

  return html`<form class="product-form" novalidate data-product-form>
    <div class="form-layout">
      <div class="form-main">
        <section class="panel">
          ${sectionTitle(t('admin.products.sections.basic'), { num: '01' })}
          <div class="grid-2">
            ${locField({ name: 'name', label: t('admin.products.name'), value: product.name, required: true, min: 2, max: 160, className: 'span-all' })}
            ${inputField({
              name: 'sku',
              label: t('admin.products.sku'),
              value: product.sku,
              required: true,
              hint: t('admin.products.skuHint'),
              attributes: { maxlength: 32, pattern: skuPattern, 'data-pattern-code': 'invalid_sku', autocomplete: 'off', spellcheck: 'false' }
            })}
            ${inputField({
              name: 'slug',
              label: t('admin.products.slug'),
              value: isNew ? '' : product.slug,
              optional: true,
              hint: t('admin.products.slugHint'),
              attributes: { maxlength: 100, pattern: '[a-z0-9]+(?:-[a-z0-9]+)*', 'data-pattern-code': 'invalid_slug', autocomplete: 'off', spellcheck: 'false' }
            })}
            ${locField({ name: 'description', label: t('admin.products.description'), value: product.description, multiline: true, rows: 5, max: 4000, className: 'span-all' })}
          </div>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.classification'), { num: '02' })}
          <div class="grid-2">
            ${selectField({ name: 'category', label: t('admin.products.category'), options: categoryOptions, value: product.category, required: true, placeholder: t('admin.common.choose') })}
            ${selectField({ name: 'supplier', label: t('admin.products.supplier'), options: supplierOptions, value: product.supplier, required: true, placeholder: t('admin.common.choose') })}
            ${selectField({ name: 'brand', label: t('admin.products.brand'), options: brandOptions, value: product.brand || '', placeholder: t('admin.products.noBrand') })}
            ${selectField({
              name: 'materialType',
              label: t('admin.products.material'),
              options: meta.materials.map((m) => ({ value: m, label: t(`materials.${m}`) })),
              value: product.materialType
            })}
            ${inputField({ name: 'grade', label: t('admin.products.grade'), value: product.grade, optional: true, hint: t('admin.products.gradeHint'), attributes: { maxlength: 40 } })}
          </div>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.pricing'), { num: '03' })}
          <div class="grid-3">
            ${selectField({
              name: 'unit',
              label: t('admin.products.unit'),
              options: meta.units.map((u) => ({ value: u, label: `${t(`units.${u}.name`)} (${t(`units.${u}.short`)})` })),
              value: product.unit,
              required: true
            })}
            ${numberField({ name: 'price', label: t('admin.products.price'), value: product.price, required: true, min: 0 })}
            ${numberField({ name: 'oldPrice', label: t('admin.products.oldPrice'), value: product.oldPrice, optional: true, min: 0 })}
            ${numberField({ name: 'minOrderQty', label: t('admin.products.minOrderQty'), value: product.minOrderQty, min: 0.001 })}
            ${numberField({ name: 'orderStep', label: t('admin.products.orderStep'), value: product.orderStep, min: 0.001, hint: t('admin.products.orderStepHint') })}
            ${numberField({ name: 'unitsPerPallet', label: t('admin.products.unitsPerPallet'), value: product.unitsPerPallet, optional: true, min: 0 })}
          </div>
          <hr class="divider">
          <fieldset class="plain">
            <legend class="field__label">${t('admin.products.tiers')}</legend>
            <p class="field__hint">${t('admin.products.tiersHint')}</p>
            <div class="repeater" data-tiers>
              ${product.priceTiers.map((tier, index) => tierRow(tier, index))}
            </div>
            <p class="repeater__empty" data-tiers-empty ${attrs({ hidden: product.priceTiers.length > 0 })}>${t('admin.products.noTiers')}</p>
            <p class="form-error" data-error-for="priceTiers" hidden></p>
            <button class="btn btn-ghost btn-sm" type="button" data-add-tier>${icon('plus')}${t('admin.products.addTier')}</button>
          </fieldset>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.dimensions'), { num: '04' })}
          <div class="grid-3">
            ${numberField({ name: 'dimensions.lengthMm', label: t('admin.products.lengthMm'), value: d.lengthMm, optional: true })}
            ${numberField({ name: 'dimensions.widthMm', label: t('admin.products.widthMm'), value: d.widthMm, optional: true })}
            ${numberField({ name: 'dimensions.heightMm', label: t('admin.products.heightMm'), value: d.heightMm, optional: true })}
            ${numberField({ name: 'dimensions.thicknessMm', label: t('admin.products.thicknessMm'), value: d.thicknessMm, optional: true })}
            ${numberField({ name: 'dimensions.diameterMm', label: t('admin.products.diameterMm'), value: d.diameterMm, optional: true })}
            ${numberField({ name: 'weightKg', label: t('admin.products.weightKg'), value: product.weightKg, optional: true })}
          </div>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.specs'), { num: '05', aside: t('admin.products.specsHint') })}
          <div class="repeater" data-specs>
            ${product.specs.map((spec, index) => specRow(spec, index))}
          </div>
          <p class="repeater__empty" data-specs-empty ${attrs({ hidden: product.specs.length > 0 })}>${t('admin.products.noSpecs')}</p>
          <button class="btn btn-ghost btn-sm" type="button" data-add-spec>${icon('plus')}${t('admin.products.addSpec')}</button>
        </section>
      </div>

      <aside class="form-side">
        <section class="panel">
          ${sectionTitle(t('admin.products.sections.visibility'), { iconName: 'eye' })}
          <div class="stack">
            ${switchField({ name: 'isActive', label: t('admin.products.isActive'), hint: t('admin.products.isActiveHint'), checked: product.isActive })}
            ${switchField({ name: 'isFeatured', label: t('admin.products.isFeatured'), checked: product.isFeatured })}
          </div>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.stock'), { iconName: 'box' })}
          <div class="stack">
            ${selectField({
              name: 'stock.status',
              label: t('admin.products.stockStatus'),
              options: meta.stockStatuses.map((s) => ({ value: s, label: t(`stock.${s}`) })),
              value: product.stock?.status,
              required: true
            })}
            ${numberField({ name: 'stock.quantity', label: t('admin.products.stockQty'), value: product.stock?.quantity, optional: true })}
            ${numberField({ name: 'leadTimeDays', label: t('admin.products.leadTimeDays'), value: product.leadTimeDays, integer: true, max: 365 })}
          </div>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.media'), { iconName: 'image' })}
          <div class="stack">
            <div data-images></div>
            <p class="form-error" data-error-for="images" hidden></p>
            ${can('uploads:write') && !readOnly
              ? html`<label class="dropzone" data-dropzone>
                  ${icon('upload')}
                  <strong>${t('admin.products.upload')}</strong>
                  <span class="field__hint">${t('admin.products.imagesHint')}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" data-upload data-ignore multiple>
                </label>`
              : ''}
            <div class="inline-add">
              <input class="control control--compact" type="url" inputmode="url" placeholder="${t('admin.products.imageUrl')}" aria-label="${t('admin.products.imageUrl')}" data-image-url data-ignore maxlength="1000">
              <button class="btn btn-ghost btn-sm" type="button" data-add-image>${icon('plus')}${t('common.add')}</button>
            </div>
          </div>
        </section>

        ${isNew
          ? ''
          : html`<section class="panel">
              ${sectionTitle(t('admin.products.sections.meta'), { iconName: 'info' })}
              <dl class="kv">
                <div><dt>${t('admin.common.createdAt')}</dt><dd>${fmtDateTime(product.createdAt)}</dd></div>
                <div><dt>${t('admin.common.updatedAt')}</dt><dd>${fmtDateTime(product.updatedAt)}</dd></div>
                <div><dt>ID</dt><dd class="mono small">${product.id}</dd></div>
              </dl>
              <div class="button-row contact-row">
                ${product.isActive ? html`<a class="btn btn-ghost btn-sm" href="/product/${product.slug}" target="_blank" rel="noopener">${icon('external')}${t('admin.products.viewOnSite')}</a>` : ''}
                ${can('audit:read') ? html`<a class="btn btn-ghost btn-sm" href="#/audit?entityType=product&entityId=${product.id}">${icon('history')}${t('admin.common.history')}</a>` : ''}
              </div>
            </section>`}
      </aside>
    </div>

    <div class="action-bar">
      <span class="action-bar__status" data-dirty-status>${isNew ? t('admin.products.newHint') : t('admin.common.noChanges')}</span>
      <p class="form-error" role="alert" data-form-error hidden></p>
      <a class="btn btn-ghost" href="#/products">${t('common.cancel')}</a>
      ${!isNew && can('products:delete') ? html`<button class="btn btn-danger" type="button" data-delete-product>${icon('trash')}${t('common.delete')}</button>` : ''}
      ${readOnly ? '' : html`<button class="btn btn-accent" type="submit">${icon('check')}${isNew ? t('admin.products.create') : t('common.save')}</button>`}
    </div>
  </form>`;
}

function collect(form, images) {
  normalizeNumberInputs(form);
  const v = formValues(form);
  const tiers = toArray(v.priceTiers).filter((tier) => tier && (tier.minQty !== null || tier.price !== null));
  const specs = toArray(v.specs).filter(
    (spec) => spec && [spec.label?.uz, spec.label?.ru, spec.value?.uz, spec.value?.ru].some((part) => part)
  );
  return {
    sku: (v.sku || '').toUpperCase(),
    slug: v.slug || undefined,
    name: v.name,
    description: v.description,
    category: v.category,
    brand: v.brand || null,
    supplier: v.supplier,
    materialType: v.materialType,
    grade: v.grade,
    unit: v.unit,
    price: v.price,
    oldPrice: v.oldPrice,
    priceTiers: tiers,
    minOrderQty: v.minOrderQty ?? undefined,
    orderStep: v.orderStep ?? undefined,
    unitsPerPallet: v.unitsPerPallet,
    dimensions: v.dimensions,
    weightKg: v.weightKg,
    specs,
    stock: { status: v.stock?.status, quantity: v.stock?.quantity ?? null },
    leadTimeDays: v.leadTimeDays ?? 0,
    images,
    isFeatured: Boolean(v.isFeatured),
    isActive: Boolean(v.isActive)
  };
}

function clientChecks(values) {
  const fields = {};
  const sorted = values.priceTiers.map((tier, index) => ({ ...tier, index })).sort((a, b) => a.minQty - b.minQty);
  for (const tier of sorted) {
    if (values.price !== null && tier.price !== null && tier.price > values.price) {
      fields[`priceTiers.${tier.index}.price`] = t('validation.tier_price_high');
    }
  }
  if (values.oldPrice !== null && values.price !== null && values.oldPrice <= values.price) {
    fields.oldPrice = t('admin.products.oldPriceHint');
  }
  return fields;
}

async function uploadFile(file, meta) {
  const maxBytes = meta.uploads?.maxBytes || 5 * 1024 * 1024;
  const types = meta.uploads?.types || ['image/jpeg', 'image/png', 'image/webp'];
  if (!types.includes(file.type)) throw Object.assign(new Error(t('errors.invalid_image', { max: Math.round(maxBytes / 1048576) })), { code: 'invalid_image' });
  if (file.size > maxBytes) throw Object.assign(new Error(t('errors.payload_too_large')), { code: 'payload_too_large' });
  const result = await api('/api/admin/uploads', { method: 'POST', body: file });
  return result.url;
}

export async function productFormView({ root, params, query }) {
  const isNew = !params.id || params.id === 'new';
  setHTML(root, loadingBlock());
  const sourceId = isNew ? query.get('from') : params.id;
  const [options, meta, loaded] = await Promise.all([
    getOptions(),
    getMeta(),
    sourceId && /^[a-f0-9]{24}$/.test(sourceId) ? api(`/api/admin/products/${sourceId}`) : Promise.resolve(null)
  ]);

  let product = loaded ? { ...blankProduct(options), ...loaded } : blankProduct(options);
  if (isNew && loaded) {
    // Duplicate: copy everything except identity fields.
    product = {
      ...product,
      id: undefined,
      sku: '',
      slug: '',
      name: { uz: `${loaded.name.uz} ${t('admin.products.copySuffix')}`.trim(), ru: `${loaded.name.ru} ${t('admin.products.copySuffix')}`.trim() },
      isActive: false
    };
  }
  const readOnly = !can('products:write');
  const title = isNew ? t('admin.products.new') : loc(product.name) || t('admin.products.edit');

  setHTML(
    root,
    html`${viewHead({
      title,
      back: { href: '#/products', label: t('admin.common.backToList') },
      meta: isNew
        ? ''
        : html`<span class="mono-chip">${product.sku}</span>${stockBadge(product.stock?.status)}${product.isActive ? badge(t('admin.products.published'), 'ok', { dot: true }) : badge(t('admin.products.draft'), 'muted', { dot: true })}`
    })}
    ${formMarkup(product, { options, meta, isNew, readOnly })}`
  );

  const form = $('[data-product-form]', root);
  const tiersBox = $('[data-tiers]', form);
  const specsBox = $('[data-specs]', form);
  const imagesBox = $('[data-images]', form);
  const status = $('[data-dirty-status]', form);
  let images = [...(product.images || [])];
  let dirty = false;

  if (readOnly) $$('input, select, textarea', form).forEach((element) => (element.disabled = true));

  const markDirty = () => {
    if (dirty || readOnly) return;
    dirty = true;
    status.textContent = t('admin.common.unsavedShort');
    status.classList.add('is-dirty');
  };
  const markClean = () => {
    dirty = false;
    status.textContent = t('admin.common.allSaved');
    status.classList.remove('is-dirty');
  };
  setDirtyCheck(() => dirty);
  form.addEventListener('input', (event) => {
    if (event.target.dataset.ignore === undefined) markDirty();
  });
  form.addEventListener('change', (event) => {
    if (event.target.dataset.ignore === undefined) markDirty();
  });
  liveValidation(form);

  const drawImages = () => {
    setHTML(imagesBox, imageTiles(images));
    const addButton = $('[data-add-image]', form);
    const dropzone = $('[data-dropzone]', form);
    const full = images.length >= MAX_IMAGES;
    if (addButton) addButton.disabled = full || readOnly;
    dropzone?.classList.toggle('is-busy', full);
  };
  drawImages();

  const syncEmpty = () => {
    $('[data-tiers-empty]', form).hidden = tiersBox.children.length > 0;
    $('[data-specs-empty]', form).hidden = specsBox.children.length > 0;
  };

  on(form, 'click', '[data-add-tier]', () => {
    if (tiersBox.children.length >= 10) return;
    const holder = document.createElement('div');
    setHTML(holder, tierRow({}, tiersBox.children.length));
    const row = holder.firstElementChild;
    tiersBox.append(row);
    row.querySelector('input')?.focus();
    syncEmpty();
    markDirty();
  });

  on(form, 'click', '[data-add-spec]', () => {
    if (specsBox.children.length >= 20) return;
    const holder = document.createElement('div');
    setHTML(holder, specRow({}, specsBox.children.length));
    const row = holder.firstElementChild;
    specsBox.append(row);
    row.querySelector('input')?.focus();
    syncEmpty();
    markDirty();
  });

  on(form, 'click', '[data-remove-row]', (event, button) => {
    const row = button.closest('.repeater__row');
    const box = row.parentElement;
    row.remove();
    renumber(box, box === tiersBox ? 'priceTiers' : 'specs');
    syncEmpty();
    markDirty();
  });

  on(form, 'click', '[data-image-remove]', (event, button) => {
    images.splice(Number(button.dataset.imageRemove), 1);
    drawImages();
    markDirty();
  });

  on(form, 'click', '[data-image-cover]', (event, button) => {
    const [picked] = images.splice(Number(button.dataset.imageCover), 1);
    images.unshift(picked);
    drawImages();
    markDirty();
  });

  const urlInput = $('[data-image-url]', form);
  const addUrl = () => {
    const value = urlInput.value.trim();
    if (!value) return;
    const valid = /^https?:\/\/[^\s<>"'`\\]+$/i.test(value) || /^\/(?!\/)[A-Za-z0-9._~\-/%]+$/.test(value);
    if (!valid || value.includes('..')) {
      toast(t('validation.invalid_url'), { type: 'error' });
      urlInput.focus();
      return;
    }
    if (images.includes(value)) return;
    if (images.length >= MAX_IMAGES) return;
    images.push(value);
    urlInput.value = '';
    drawImages();
    markDirty();
  };
  on(form, 'click', '[data-add-image]', addUrl);
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addUrl();
    }
  });

  const dropzone = $('[data-dropzone]', form);
  const uploadInput = $('[data-upload]', form);
  const uploadAll = async (files) => {
    const list = Array.from(files).slice(0, MAX_IMAGES - images.length);
    if (!list.length) return;
    dropzone.classList.add('is-busy');
    const label = dropzone.querySelector('strong');
    label.textContent = t('admin.products.uploading');
    try {
      for (const file of list) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadFile(file, meta);
        images.push(url);
        drawImages();
        markDirty();
      }
      toast(t('admin.products.uploaded'), { type: 'ok' });
    } catch (error) {
      reportError(error);
    } finally {
      label.textContent = t('admin.products.upload');
      dropzone.classList.toggle('is-busy', images.length >= MAX_IMAGES);
      uploadInput.value = '';
    }
  };
  if (dropzone && uploadInput) {
    uploadInput.addEventListener('change', () => uploadAll(uploadInput.files));
    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('is-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-over');
      uploadAll(event.dataTransfer?.files || []);
    });
  }

  on(form, 'click', '[data-delete-product]', async (event, button) => {
    const ok = await confirmDialog({
      title: t('common.delete'),
      text: t('admin.common.confirmDelete', { name: loc(product.name) }),
      confirmLabel: t('common.delete'),
      danger: true
    });
    if (!ok) return;
    setBusy(button, true);
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
      dirty = false;
      toast(t('admin.common.deleted'), { type: 'ok' });
      window.location.hash = '#/products';
    } catch (error) {
      reportError(error);
      setBusy(button, false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (readOnly) return;
    clearErrors(form);
    const values = collect(form, images);
    const fields = { ...validateForm(form), ...validateNumbers(form), ...clientChecks(values) };
    if (Object.keys(fields).length) {
      showErrors(form, fields, t('errors.validation_failed'));
      return;
    }
    const button = form.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      const saved = isNew
        ? await api('/api/admin/products', { method: 'POST', body: values })
        : await api(`/api/admin/products/${product.id}`, { method: 'PUT', body: values });
      markClean();
      toast(isNew ? t('admin.common.createdToast') : t('admin.common.saved'), { type: 'ok' });
      if (isNew) {
        window.history.replaceState(null, '', `#/products/${saved.id}`);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        return;
      }
      product = { ...product, ...saved };
      $('.view-title', root).textContent = loc(saved.name);
      images = [...saved.images];
      drawImages();
    } catch (error) {
      reportError(error, form);
    } finally {
      setBusy(button, false);
    }
  });

  return {
    title,
    destroy() {
      setDirtyCheck(null);
    }
  };
}

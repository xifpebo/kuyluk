/**
 * Product list + editor, shared by the admin panel and the shop-owner
 * cabinet (`appContext.mode`). In seller mode every request goes to
 * /api/seller/* (scoped to the owner's shop on the server), the shop and
 * "featured" fields are hidden, and saving content sends the product to
 * moderation.
 */
import { html, setHTML, icon, on, safeUrl, $, $$ } from '../../lib/dom.js';
import { t, loc, fmtMoney, fmtNumber, fmtDateTime, unitShort } from '../../lib/i18n.js';
import { api, can } from '../../lib/api.js';
import { toast, confirmDialog, noteDialog, badge, setBusy } from '../../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation } from '../../lib/forms.js';
import { PLACEHOLDER_IMAGE } from '../../lib/format.js';
import {
  appContext,
  apiBase,
  getMeta,
  getOptions,
  viewHead,
  sectionTitle,
  stockBadge,
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
  toArray,
  validateNumbers,
  normalizeNumberInputs,
  reportError,
  setDirtyCheck,
  loadingBlock,
  skeletonTable,
  messageBlock,
  uploadFile,
  attrs
} from '../shared.js';

const PATH = '/products';
const MAX_IMAGES = 10;

const isSeller = () => appContext.mode === 'seller';
const canWrite = () => isSeller() || can('products:write');
const canDelete = () => isSeller() || can('products:delete');
const canModerate = () => !isSeller() && can('products:approve');

function optionName(option) {
  return typeof option.name === 'string' ? option.name : loc(option.name);
}

/** Subcategory <select> grouped by parent category. */
function categorySelect(options, value) {
  const parents = options.categories.filter((c) => !c.parent);
  return html`<div class="field">
    <label class="field__label" for="product-category">${t('admin.products.category')}</label>
    <select class="control" id="product-category" name="category" required>
      <option value="">${t('admin.common.choose')}</option>
      ${parents.map(
        (parent) => html`<optgroup label="${optionName(parent)}">
          ${options.categories
            .filter((c) => c.parent === parent.id)
            .map((c) => html`<option value="${c.id}" ${attrs({ selected: c.id === value })}>${optionName(c)}${c.isActive ? '' : ` (${t('admin.common.inactive')})`}</option>`)}
        </optgroup>`
      )}
    </select>
  </div>`;
}

/* ================================================================ list */

function productRow(product, meta) {
  return {
    cells: product,
    cover: product.images?.[0] || PLACEHOLDER_IMAGE,
    menu: rowMenu([
      { href: `#/products/${product.id}`, icon: 'edit', label: t('common.edit') },
      canWrite() && { icon: 'copy', label: t('admin.products.duplicate'), attrs: { 'data-duplicate': product.id } },
      product.status === 'approved' && product.isActive && { href: `/product/${product.slug}`, icon: 'external', label: t('admin.products.viewOnSite'), attrs: { target: '_blank', rel: 'noopener' } },
      canModerate() && product.status !== 'approved' && { icon: 'check-circle', label: t('admin.moderation.approve'), attrs: { 'data-approve': product.id } },
      !isSeller() && can('audit:read') && { href: `#/audit?entityType=product&entityId=${product.id}`, icon: 'history', label: t('admin.common.history') },
      !isSeller() && canWrite() && 'sep',
      !isSeller() && canWrite() && {
        icon: 'star',
        label: product.isFeatured ? t('admin.products.unfeature') : t('admin.products.feature'),
        attrs: { 'data-feature': product.id, 'data-value': String(!product.isFeatured) }
      },
      canDelete() && { icon: 'trash', label: t('common.delete'), danger: true, attrs: { 'data-delete': product.id, 'data-name': loc(product.name) } }
    ]),
    meta
  };
}

function renderProducts(container, data, ctl, meta) {
  if (!data.items.length) {
    setHTML(
      container,
      messageBlock({
        iconName: 'package',
        title: t('admin.common.empty'),
        text: isSeller() ? t('seller.products.emptyText') : t('admin.common.emptyFiltered'),
        action: isSeller() ? { href: '#/products/new', label: t('admin.products.new') } : null
      })
    );
    return;
  }
  const rows = data.items.map((p) => productRow(p, meta));
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
            <img class="thumb thumb--square" src="${safeUrl(row.cover)}" alt="" width="52" height="52" loading="lazy">
            <div class="cell-main__text">
              <a class="row-link" href="#/products/${row.cells.id}">${loc(row.cells.name)}</a>
              <span class="cell-sub">${row.cells.sku}${row.cells.brandName ? ` · ${row.cells.brandName}` : ''}</span>
              <span class="cell-tags">
                ${statusBadge(row.cells.status)}
                ${row.cells.isFeatured ? badge(t('admin.products.featuredBadge'), 'hazard') : ''}
                ${row.cells.discountPercent ? badge(`−${row.cells.discountPercent}%`, 'danger') : ''}
              </span>
            </div>
          </div>`
        },
        {
          label: t('admin.products.colCategory'),
          render: (row) => html`${loc(row.cells.categoryName)}${isSeller() ? '' : html`<br><span class="cell-sub">${row.cells.shopName || ''}</span>`}`
        },
        {
          label: t('admin.products.colPrice'),
          className: 'num',
          render: (row) => html`<span class="price-cell"><strong>${fmtMoney(row.cells.price)}</strong>
            ${row.cells.oldPrice ? html`<br><s class="cell-sub">${fmtMoney(row.cells.oldPrice)}</s>` : ''}
            ${row.cells.unit !== 'piece' ? html`<br><span class="cell-sub">/ ${unitShort(row.cells.unit)}</span>` : ''}</span>`
        },
        {
          label: t('admin.products.colStock'),
          render: (row) => (canWrite()
            ? html`<select class="control control--compact stock-select" data-stock-select="${row.cells.id}" aria-label="${t('admin.products.stockStatus')}: ${loc(row.cells.name)}">
                ${meta.stockStatuses.map((s) => html`<option value="${s}" ${attrs({ selected: row.cells.stock?.status === s })}>${t(`stock.${s}`)}</option>`)}
              </select>`
            : stockBadge(row.cells.stock?.status))
        },
        {
          label: t('admin.products.published'),
          render: (row) => html`<label class="switch switch--table" title="${t('admin.products.isActive')}">
            <input type="checkbox" data-toggle-active="${row.cells.id}" ${attrs({ checked: row.cells.isActive, disabled: !canWrite() })} aria-label="${t('admin.products.isActive')}: ${loc(row.cells.name)}">
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
  const subcategories = options.categories.filter((c) => c.parent);
  setHTML(
    root,
    html`${viewHead({
      title: isSeller() ? t('seller.products.title') : t('admin.products.title'),
      lead: isSeller() ? t('seller.products.lead') : t('admin.products.lead'),
      actions: canWrite() ? html`<a class="btn btn-accent" href="#/products/new">${icon('plus')}${t('admin.products.new')}</a>` : ''
    })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ placeholder: t('admin.products.searchPlaceholder') })}
      ${filterSelect({ name: 'category', label: t('admin.products.category'), allLabel: t('admin.products.allCategories'), options: subcategories.map((c) => ({ value: c.id, label: optionName(c) })) })}
      ${isSeller() ? '' : filterSelect({ name: 'shop', label: t('admin.products.shop'), allLabel: t('admin.products.allShops'), options: options.shops.map((s) => ({ value: s.id, label: s.name })) })}
      ${filterSelect({ name: 'status', label: t('admin.products.moderation'), allLabel: t('admin.products.allModeration'), options: meta.productStatuses.map((s) => ({ value: s, label: t(`admin.status.product.${s}`) })) })}
      ${filterSelect({ name: 'stock', label: t('admin.products.stockStatus'), allLabel: t('admin.products.allStock'), options: meta.stockStatuses.map((s) => ({ value: s, label: t(`stock.${s}`) })) })}
      ${filterSelect({
        name: 'active',
        label: t('admin.common.status'),
        allLabel: t('admin.products.allStatuses'),
        options: [
          { value: 'active', label: t('admin.products.published') },
          { value: 'inactive', label: t('admin.products.hidden') }
        ]
      })}
      <select class="control control--compact" name="sort" aria-label="${t('admin.common.sort')}">
        ${['updated', 'name', 'sku', 'price_asc', 'price_desc', 'discount', 'views'].map((value) => html`<option value="${value}">${t(`admin.products.sort.${value}`)}</option>`)}
      </select>
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <div data-results>${skeletonTable()}</div>`
  );
  const results = $('[data-results]', root);
  const endpoint = `${apiBase()}/products`;
  const ctl = listController({
    root,
    path: PATH,
    endpoint,
    defaults: { sort: 'updated' },
    render: (data) => renderProducts(results, data, ctl, meta),
    onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
  });

  const patch = async (id, body, okText = t('admin.common.saved')) => {
    await api(`${endpoint}/${id}`, { method: 'PATCH', body });
    toast(okText, { type: 'ok' });
  };

  on(results, 'change', '[data-toggle-active]', async (event, input) => {
    input.disabled = true;
    try {
      await patch(input.dataset.toggleActive, { isActive: input.checked }, input.checked ? t('admin.products.publishedToast') : t('admin.products.hiddenToast'));
      input.closest('tr')?.classList.toggle('is-muted', !input.checked);
    } catch (error) {
      input.checked = !input.checked;
      reportError(error);
    } finally {
      input.disabled = false;
    }
  });

  on(results, 'change', '[data-stock-select]', async (event, select) => {
    select.disabled = true;
    try {
      await patch(select.dataset.stockSelect, { stockStatus: select.value }, t('admin.products.stockUpdated'));
    } catch (error) {
      reportError(error);
      ctl.load();
    } finally {
      select.disabled = false;
    }
  });

  on(results, 'click', '[data-feature]', async (event, button) => {
    try {
      await patch(button.dataset.feature, { isFeatured: button.dataset.value === 'true' });
      ctl.load();
    } catch (error) {
      reportError(error);
    }
  });

  on(results, 'click', '[data-approve]', async (event, button) => {
    try {
      await api(`/api/admin/products/${button.dataset.approve}/moderate`, { method: 'POST', body: { decision: 'approve' } });
      toast(t('admin.moderation.approved'), { type: 'ok' });
      document.dispatchEvent(new CustomEvent('admin:moderation-changed'));
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
      await api(`${endpoint}/${button.dataset.delete}`, { method: 'DELETE' });
      toast(t('admin.common.deleted'), { type: 'ok' });
      ctl.load();
    } catch (error) {
      reportError(error);
    }
  });

  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: isSeller() ? t('seller.products.title') : t('admin.products.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}

/* ================================================================ form */

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

function blankProduct() {
  return {
    sku: '',
    slug: '',
    name: { uz: '', ru: '' },
    description: { uz: '', ru: '' },
    category: '',
    brand: null,
    shop: '',
    unit: 'piece',
    price: null,
    oldPrice: null,
    colors: [],
    sizes: [],
    specs: [],
    stock: { status: 'in_stock', quantity: null },
    leadTimeDays: 0,
    images: [],
    status: 'draft',
    isFeatured: false,
    isActive: true
  };
}

function moderationPanel(product, isNew) {
  if (isNew) {
    return isSeller()
      ? html`<section class="panel panel--note">${sectionTitle(t('admin.products.moderation'), { iconName: 'shield' })}<p class="muted small">${t('seller.products.newNote')}</p></section>`
      : '';
  }
  return html`<section class="panel">
    ${sectionTitle(t('admin.products.moderation'), { iconName: 'shield' })}
    <div class="stack">
      <p>${statusBadge(product.status)}</p>
      ${product.moderationNote ? html`<p class="notice notice--warn small">${icon('alert')}${product.moderationNote}</p>` : ''}
      ${isSeller() ? html`<p class="muted small">${t('seller.products.editNote')}</p>` : ''}
      ${canModerate()
        ? html`<div class="button-row">
            ${product.status !== 'approved' ? html`<button class="btn btn-accent btn-sm" type="button" data-moderate="approve">${icon('check')}${t('admin.moderation.approve')}</button>` : ''}
            ${product.status !== 'rejected' ? html`<button class="btn btn-danger btn-sm" type="button" data-moderate="reject">${icon('close')}${t('admin.moderation.reject')}</button>` : ''}
          </div>`
        : ''}
    </div>
  </section>`;
}

function formMarkup(product, { options, meta, isNew, readOnly }) {
  const brandOptions = options.brands.map((b) => ({ value: b.id, label: b.name }));
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
            ${categorySelect(options, product.category)}
            ${isSeller()
              ? ''
              : selectField({ name: 'shop', label: t('admin.products.shop'), options: options.shops.map((s) => ({ value: s.id, label: `${s.name}${s.status === 'approved' ? '' : ` (${t(`admin.status.shop.${s.status}`)})`}` })), value: product.shop, required: true, placeholder: t('admin.common.choose') })}
            ${selectField({ name: 'brand', label: t('admin.products.brand'), options: brandOptions, value: product.brand || '', placeholder: t('admin.products.noBrand') })}
          </div>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.pricing'), { num: '03' })}
          <div class="grid-3">
            ${numberField({ name: 'price', label: t('admin.products.price'), value: product.price, required: true, min: 0 })}
            ${numberField({ name: 'oldPrice', label: t('admin.products.oldPrice'), value: product.oldPrice, optional: true, min: 0, hint: t('admin.products.oldPriceHint') })}
            ${selectField({
              name: 'unit',
              label: t('admin.products.unit'),
              options: meta.units.map((u) => ({ value: u, label: `${t(`units.${u}.name`)} (${t(`units.${u}.short`)})` })),
              value: product.unit,
              required: true
            })}
          </div>
          <p class="field__hint" data-discount-hint></p>
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.products.sections.variants'), { num: '04' })}
          <fieldset class="plain">
            <legend class="field__label">${t('admin.products.colors')}</legend>
            <div class="checkbox-grid">
              ${meta.colors.map((c) => checkbox({ name: 'colors', label: t(`colors.${c}`), value: c, checked: (product.colors || []).includes(c), multi: true }))}
            </div>
          </fieldset>
          ${inputField({ name: 'sizes', label: t('admin.products.sizes'), value: (product.sizes || []).join('; '), optional: true, hint: t('admin.products.sizesHint'), attributes: { maxlength: 400 } })}
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
        ${moderationPanel(product, isNew)}
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
          ${sectionTitle(t('admin.products.sections.visibility'), { iconName: 'eye' })}
          <div class="stack">
            ${switchField({ name: 'isActive', label: t('admin.products.isActive'), hint: t('admin.products.isActiveHint'), checked: product.isActive })}
            ${isSeller() ? '' : switchField({ name: 'isFeatured', label: t('admin.products.isFeatured'), checked: product.isFeatured })}
          </div>
        </section>

        ${isNew
          ? ''
          : html`<section class="panel">
              ${sectionTitle(t('admin.products.sections.meta'), { iconName: 'info' })}
              <dl class="kv">
                <div><dt>${t('admin.products.views')}</dt><dd>${fmtNumber(product.viewCount || 0)}</dd></div>
                <div><dt>${t('admin.products.contacts')}</dt><dd>${fmtNumber(product.contactCount || 0)}</dd></div>
                <div><dt>${t('admin.common.createdAt')}</dt><dd>${fmtDateTime(product.createdAt)}</dd></div>
                <div><dt>${t('admin.common.updatedAt')}</dt><dd>${fmtDateTime(product.updatedAt)}</dd></div>
              </dl>
              <div class="button-row contact-row">
                ${product.status === 'approved' && product.isActive ? html`<a class="btn btn-ghost btn-sm" href="/product/${product.slug}" target="_blank" rel="noopener">${icon('external')}${t('admin.products.viewOnSite')}</a>` : ''}
                ${!isSeller() && can('audit:read') ? html`<a class="btn btn-ghost btn-sm" href="#/audit?entityType=product&entityId=${product.id}">${icon('history')}${t('admin.common.history')}</a>` : ''}
              </div>
            </section>`}
      </aside>
    </div>

    <div class="action-bar">
      <span class="action-bar__status" data-dirty-status>${isNew ? t('admin.products.newHint') : t('admin.common.noChanges')}</span>
      <p class="form-error" role="alert" data-form-error hidden></p>
      <a class="btn btn-ghost" href="#/products">${t('common.cancel')}</a>
      ${!isNew && canDelete() ? html`<button class="btn btn-danger" type="button" data-delete-product>${icon('trash')}${t('common.delete')}</button>` : ''}
      ${readOnly ? '' : html`<button class="btn btn-accent" type="submit">${icon('check')}${isNew ? (isSeller() ? t('seller.products.submit') : t('admin.products.create')) : t('common.save')}</button>`}
    </div>
  </form>`;
}

function collect(form, images) {
  normalizeNumberInputs(form);
  const v = formValues(form);
  const specs = toArray(v.specs).filter((spec) => spec && [spec.label?.uz, spec.label?.ru, spec.value?.uz, spec.value?.ru].some(Boolean));
  const sizes = String(v.sizes || '')
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const body = {
    sku: (v.sku || '').toUpperCase(),
    slug: v.slug || undefined,
    name: v.name,
    description: v.description,
    category: v.category,
    brand: v.brand || null,
    unit: v.unit,
    price: v.price,
    oldPrice: v.oldPrice,
    colors: Array.isArray(v.colors) ? v.colors : [],
    sizes: [...new Set(sizes)].slice(0, 12),
    specs,
    stock: { status: v.stock?.status, quantity: v.stock?.quantity ?? null },
    leadTimeDays: v.leadTimeDays ?? 0,
    images,
    isActive: Boolean(v.isActive)
  };
  if (!isSeller()) {
    body.shop = v.shop;
    body.isFeatured = Boolean(v.isFeatured);
  }
  return body;
}

function clientChecks(values) {
  const fields = {};
  if (values.oldPrice !== null && values.price !== null && values.oldPrice <= values.price) fields.oldPrice = t('validation.old_price_low');
  if (!values.images.length) fields.images = t('admin.products.imageRequired');
  return fields;
}

export async function productFormView({ root, params, query }) {
  const isNew = !params.id || params.id === 'new';
  const endpoint = `${apiBase()}/products`;
  setHTML(root, loadingBlock());
  const sourceId = isNew ? query.get('from') : params.id;
  const [options, meta, loaded] = await Promise.all([
    getOptions(),
    getMeta(),
    sourceId && /^[a-f0-9]{24}$/.test(sourceId) ? api(`${endpoint}/${sourceId}`) : Promise.resolve(null)
  ]);

  let product = loaded ? { ...blankProduct(), ...loaded } : blankProduct();
  if (isNew && loaded) {
    product = {
      ...product,
      id: undefined,
      sku: '',
      slug: '',
      status: 'draft',
      moderationNote: '',
      name: { uz: `${loaded.name.uz} ${t('admin.products.copySuffix')}`.trim(), ru: `${loaded.name.ru} ${t('admin.products.copySuffix')}`.trim() }
    };
  }
  const readOnly = !canWrite();
  const title = isNew ? t('admin.products.new') : loc(product.name) || t('admin.products.edit');

  setHTML(
    root,
    html`${viewHead({
      title,
      back: { href: '#/products', label: t('admin.common.backToList') },
      meta: isNew ? '' : html`<span class="mono-chip">${product.sku}</span>${statusBadge(product.status)}${stockBadge(product.stock?.status)}`
    })}
    ${formMarkup(product, { options, meta, isNew, readOnly })}`
  );

  const form = $('[data-product-form]', root);
  const specsBox = $('[data-specs]', form);
  const imagesBox = $('[data-images]', form);
  const status = $('[data-dirty-status]', form);
  const discountHint = $('[data-discount-hint]', form);
  let images = [...(product.images || [])];
  let dirty = false;

  if (readOnly) $$('input, select, textarea', form).forEach((element) => (element.disabled = true));

  const updateDiscount = () => {
    const price = Number(String(form.elements.price.value).replace(/\s/g, '').replace(',', '.'));
    const old = Number(String(form.elements.oldPrice.value).replace(/\s/g, '').replace(',', '.'));
    discountHint.textContent = price > 0 && old > price ? t('admin.products.discountHint', { pct: Math.round((1 - price / old) * 100) }) : '';
  };
  updateDiscount();

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
    if (['price', 'oldPrice'].includes(event.target.name)) updateDiscount();
  });
  form.addEventListener('change', (event) => {
    if (event.target.dataset.ignore === undefined) markDirty();
  });
  liveValidation(form);

  const drawImages = () => {
    setHTML(imagesBox, imageTiles(images));
    const addButton = $('[data-add-image]', form);
    const full = images.length >= MAX_IMAGES;
    if (addButton) addButton.disabled = full || readOnly;
    $('[data-dropzone]', form)?.classList.toggle('is-busy', full);
  };
  drawImages();

  const syncEmpty = () => {
    $('[data-specs-empty]', form).hidden = specsBox.children.length > 0;
  };

  on(form, 'click', '[data-add-spec]', () => {
    if (specsBox.children.length >= 24) return;
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
    renumber(box, 'specs');
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
    if (images.includes(value) || images.length >= MAX_IMAGES) return;
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
        images.push(await uploadFile(file, meta));
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

  on(form, 'click', '[data-moderate]', async (event, button) => {
    const decision = button.dataset.moderate;
    let note = '';
    if (decision === 'reject') {
      note = await noteDialog({
        title: t('admin.moderation.rejectTitle'),
        text: t('admin.moderation.rejectPrompt'),
        label: t('admin.moderation.note'),
        confirmLabel: t('admin.moderation.reject'),
        danger: true,
        required: true
      });
      if (!note) return;
    }
    setBusy(button, true);
    try {
      const saved = await api(`/api/admin/products/${product.id}/moderate`, { method: 'POST', body: { decision, note: note.trim() } });
      toast(decision === 'approve' ? t('admin.moderation.approved') : t('admin.moderation.rejected'), { type: 'ok' });
      document.dispatchEvent(new CustomEvent('admin:moderation-changed'));
      product = { ...product, ...saved };
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      reportError(error);
      setBusy(button, false);
    }
  });

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
      await api(`${endpoint}/${product.id}`, { method: 'DELETE' });
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
        ? await api(endpoint, { method: 'POST', body: values })
        : await api(`${endpoint}/${product.id}`, { method: 'PUT', body: values });
      markClean();
      const sentToReview = isSeller() && saved.status === 'pending' && (isNew || product.status !== 'pending');
      toast(sentToReview ? t('seller.products.sentToReview') : isNew ? t('admin.common.createdToast') : t('admin.common.saved'), { type: 'ok', timeout: 6000 });
      if (isNew || saved.status !== product.status) {
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

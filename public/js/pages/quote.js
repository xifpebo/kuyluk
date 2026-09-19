/**
 * Quote-request flow: review the list (quantities, tier prices, estimate),
 * enter contact & delivery details, submit, see the request number.
 */
import { $, $$, html, setHTML, icon, on, safeUrl } from '../lib/dom.js';
import { t, tn, loc, fmtMoney, fmtNumber, unitShort } from '../lib/i18n.js';
import { api, getSession } from '../lib/api.js';
import * as cart from '../lib/cart.js';
import { confirmDialog, copyText, setBusy, toast } from '../lib/ui.js';
import { formValues, validateForm, showErrors, clearErrors, liveValidation, bindDateMin } from '../lib/forms.js';
import {
  unitPriceFor,
  lineTotal,
  normalizeQty,
  checkQty,
  stepOf,
  minQty,
  productUrl,
  bestTier,
  PLACEHOLDER_IMAGE
} from '../lib/format.js';

const products = new Map();
let submitting = false;

function setStep(step) {
  const order = ['list', 'details', 'done'];
  const index = order.indexOf(step);
  $$('[data-step]').forEach((el) => {
    const position = order.indexOf(el.dataset.step);
    if (position === index) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
    el.classList.toggle('is-done', position < index);
  });
}

function itemRow(product, qty) {
  const name = loc(product.name);
  const unit = unitShort(product.unit);
  const unitPrice = unitPriceFor(product, qty);
  const error = checkQty(product, qty);
  const tier = bestTier(product);
  return html`<li class="quote-item" data-item="${product.id}">
    <img class="quote-item__thumb" src="${safeUrl(product.image || PLACEHOLDER_IMAGE)}" alt="" width="76" height="64" loading="lazy">
    <div>
      <p class="quote-item__name"><a href="${productUrl(product)}">${name}</a></p>
      <p class="quote-item__meta">
        <span>${product.sku}</span>
        ${product.supplier ? html`<span><span class="stall">${product.supplier.stallNumber}</span> ${product.supplier.name}</span>` : ''}
      </p>
      <p class="quote-item__price">
        ${fmtMoney(unitPrice)} / ${unit}
        ${unitPrice < product.price ? html` · <span class="price__old">${fmtMoney(product.price)}</span>` : ''}
        ${tier && qty < tier.minQty ? html` · <span class="tier-hint">${icon('tag')}${t('product.tierOpen', { from: fmtNumber(tier.minQty), unit })}: ${fmtMoney(tier.price)}</span>` : ''}
      </p>
    </div>
    <div class="quote-item__qty">
      <div class="stepper stepper--sm">
        <button class="stepper__btn" type="button" data-qty-step="-1" aria-label="${t('product.decrease')}">${icon('minus')}</button>
        <input class="stepper__input" type="text" inputmode="decimal" value="${fmtNumber(qty).replace(/\s/g, '')}"
          aria-label="${t('product.quantity')}: ${name}" data-qty-input ${error ? html`aria-invalid="true"` : ''}>
        <button class="stepper__btn" type="button" data-qty-step="1" aria-label="${t('product.increase')}">${icon('plus')}</button>
        <span class="stepper__unit">${unit}</span>
      </div>
      <span class="qty-hint ${error ? 'is-error' : ''}">${error || t('product.minOrder', { qty: `${fmtNumber(minQty(product))} ${unit}` })}</span>
    </div>
    <div class="quote-item__total">
      <span class="quote-item__sum">${fmtMoney(lineTotal(product, qty))}</span>
      <button class="btn btn-ghost btn-sm" type="button" data-remove-item aria-label="${t('quote.removeItem', { name })}">${icon('trash')}<span>${t('quote.remove')}</span></button>
    </div>
  </li>`;
}

function render() {
  const items = cart.getItems().filter((item) => products.has(item.id));
  const empty = items.length === 0;
  $('[data-quote-empty]').hidden = !empty;
  $('[data-quote-layout]').hidden = empty;
  if (empty) {
    setStep('list');
    return;
  }
  const list = $('[data-quote-items]');
  const focused = document.activeElement?.closest?.('[data-item]')?.dataset.item;
  const focusedInput = document.activeElement?.matches?.('[data-qty-input]');
  setHTML(list, html`${items.map((item) => itemRow(products.get(item.id), item.qty))}`);
  list.removeAttribute('aria-busy');
  if (focused && focusedInput) {
    const input = list.querySelector(`[data-item="${focused}"] [data-qty-input]`);
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  const total = items.reduce((sum, item) => sum + lineTotal(products.get(item.id), item.qty), 0);
  $('[data-summary-count]').textContent = tn('common.positions', items.length);
  $('[data-summary-total]').textContent = fmtMoney(total);
}

function showNotice(text) {
  const notice = $('[data-quote-notice]');
  notice.textContent = text;
  notice.hidden = !text;
}

async function loadProducts() {
  const items = cart.getItems();
  if (!items.length) {
    render();
    return;
  }
  const ids = items.map((item) => item.id);
  const { items: found } = await api(`/api/catalog/lookup?ids=${ids.join(',')}`);
  products.clear();
  for (const product of found) products.set(product.id, product);
  const missing = ids.filter((id) => !products.has(id));
  if (missing.length) {
    cart.removeMany(missing);
    showNotice(t('quote.itemsChanged'));
  }
  render();
}

function parseQty(text) {
  const value = Number(String(text).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : NaN;
}

function bindItems() {
  const list = $('[data-quote-items]');
  on(list, 'click', '[data-qty-step]', (event, button) => {
    const id = button.closest('[data-item]').dataset.item;
    const product = products.get(id);
    const current = cart.getQty(id);
    const next = normalizeQty(product, Math.max(minQty(product), current + Number(button.dataset.qtyStep) * stepOf(product)));
    cart.setQty(id, next);
  });
  on(list, 'change', '[data-qty-input]', (event, input) => {
    const id = input.closest('[data-item]').dataset.item;
    const product = products.get(id);
    const value = parseQty(input.value);
    cart.setQty(id, Number.isFinite(value) && value > 0 ? normalizeQty(product, value) : minQty(product));
  });
  on(list, 'keydown', '[data-qty-input]', (event, input) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  on(list, 'click', '[data-remove-item]', (event, button) => {
    cart.remove(button.closest('[data-item]').dataset.item);
    toast(t('quote.removed'));
  });
  $('[data-quote-clear]').addEventListener('click', async () => {
    if (await confirmDialog({ title: t('quote.clear'), text: t('quote.clearConfirm'), confirmLabel: t('quote.clear'), danger: true })) {
      cart.clear();
    }
  });
  document.addEventListener('cart:change', () => {
    if (!submitting) render();
  });
}

function toggleDelivery(form) {
  const delivery = form.elements.namedItem('delivery.method').value === 'delivery';
  $$('[data-delivery-only]', form).forEach((field) => {
    field.hidden = !delivery;
    $$('input, select', field).forEach((control) => {
      control.disabled = !delivery;
    });
  });
}

async function prefill(form) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user) {
      $('[data-login-hint]').hidden = false;
      return;
    }
    const setIfEmpty = (name, value) => {
      const field = form.elements.namedItem(name);
      if (field && !field.value && value) field.value = value;
    };
    setIfEmpty('customer.name', user.name);
    setIfEmpty('customer.phone', user.phone);
    setIfEmpty('customer.email', user.email);
    setIfEmpty('customer.company', user.company);
  } catch {
    /* anonymous */
  }
}

function showSuccess(result, tracked) {
  $('[data-quote-layout]').hidden = true;
  $('[data-quote-empty]').hidden = true;
  const success = $('[data-quote-success]');
  success.hidden = false;
  $('[data-quote-number]').textContent = result.number;
  $('[data-track-link]').hidden = !tracked;
  setStep('done');
  success.focus();
  success.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('[data-copy-number]').addEventListener('click', async () => {
    if (await copyText(result.number)) toast(t('common.copied'), { type: 'ok' });
  });
}

function bindForm() {
  const form = $('[data-quote-form]');
  const submit = $('[data-quote-submit]');
  liveValidation(form);
  bindDateMin(form);
  toggleDelivery(form);
  prefill(form);
  on(form, 'change', '[name="delivery.method"]', () => toggleDelivery(form));
  form.addEventListener('focusin', () => setStep('details'), { once: true });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    clearErrors(form);
    showNotice('');
    const items = cart.getItems().filter((item) => products.has(item.id));
    const qtyProblem = items.find((item) => checkQty(products.get(item.id), item.qty));
    const fields = validateForm(form);
    if (qtyProblem) {
      const product = products.get(qtyProblem.id);
      showNotice(`${loc(product.name)}: ${checkQty(product, qtyProblem.qty)}`);
    }
    if (Object.keys(fields).length || qtyProblem) {
      showErrors(form, fields, t('errors.validation_failed'));
      return;
    }
    const values = formValues(form);
    const payload = {
      items: items.map((item) => ({ product: item.id, qty: item.qty })),
      customer: values.customer,
      contactMethod: values.contactMethod,
      delivery: {
        method: values.delivery.method,
        region: values.delivery.region || '',
        address: values.delivery.address || '',
        neededBy: values.delivery.neededBy || null
      },
      comment: values.comment || '',
      consent: values.consent === true,
      website: values.website || ''
    };
    submitting = true;
    setBusy(submit, true);
    try {
      const session = await getSession();
      const result = await api('/api/quotes', { method: 'POST', body: payload });
      cart.clear();
      showSuccess(result, Boolean(session.user) && !session.isStaff);
    } catch (error) {
      if (error.code === 'product_unavailable' && error.details?.unavailable) {
        cart.removeMany(error.details.unavailable);
        showNotice(t('quote.itemsChanged'));
        render();
      } else if (error.fields) {
        const itemMessages = Object.entries(error.fields).filter(([key]) => key.startsWith('items'));
        if (itemMessages.length) showNotice(itemMessages.map(([, message]) => message).join(' '));
        showErrors(form, Object.fromEntries(Object.entries(error.fields).filter(([key]) => !key.startsWith('items'))), error.message);
      } else {
        showErrors(form, {}, error.message);
      }
    } finally {
      submitting = false;
      setBusy(submit, false);
    }
  });
}

export default async function quotePage() {
  bindItems();
  bindForm();
  try {
    await loadProducts();
  } catch (error) {
    showNotice(error.message);
    $('[data-quote-layout]').hidden = false;
  }
}

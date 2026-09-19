import { html, setHTML, icon, on, $, $$, formatPhone, telHref, whatsappHref, safeUrl } from '../../lib/dom.js';
import { t, tn, loc, fmtMoney, fmtNumber, fmtDate, fmtDateTime, unitShort } from '../../lib/i18n.js';
import { api, can, getSession } from '../../lib/api.js';
import { toast, confirmDialog, setBusy } from '../../lib/ui.js';
import {
  getMeta,
  getOptions,
  viewHead,
  sectionTitle,
  quoteBadge,
  dataTable,
  resultsMeta,
  searchInput,
  filterSelect,
  listController,
  rowMenu,
  reportError,
  loadingBlock,
  skeletonTable,
  messageBlock,
  setDirtyCheck,
  attrs,
  initials
} from '../shared.js';

const PATH = '/quotes';

function changed() {
  document.dispatchEvent(new CustomEvent('admin:quotes-changed'));
}

/* ================================================================ list */

export async function quoteListView({ root, query }) {
  const meta = await getMeta();
  setHTML(
    root,
    html`${viewHead({ title: t('admin.quotes.title'), lead: t('admin.quotes.lead') })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ placeholder: t('admin.quotes.searchPlaceholder') })}
      ${filterSelect({
        name: 'status',
        label: t('admin.quotes.status'),
        allLabel: t('admin.quotes.allStatuses'),
        options: meta.quoteStatuses.map((status) => ({ value: status, label: t(`quoteStatus.${status}`) }))
      })}
      ${filterSelect({
        name: 'assignee',
        label: t('admin.quotes.assignee'),
        allLabel: t('admin.quotes.allAssignees'),
        options: [
          { value: 'me', label: t('admin.quotes.mine') },
          { value: 'none', label: t('admin.quotes.unassigned') }
        ]
      })}
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <div data-results>${skeletonTable()}</div>`
  );
  const results = $('[data-results]', root);
  const canDelete = can('quotes:delete');

  const ctl = listController({
    root,
    path: PATH,
    endpoint: '/api/admin/quotes',
    render: (data) => {
      if (!data.items.length) {
        setHTML(results, messageBlock({ iconName: 'clipboard', title: t('admin.quotes.empty'), text: t('admin.common.emptyFiltered') }));
        return;
      }
      setHTML(
        results,
        html`${resultsMeta(data)}
        ${dataTable({
          rows: data.items,
          rowAttrs: (quote) => ({ class: ['cancelled', 'rejected'].includes(quote.status) ? 'is-muted' : '' }),
          columns: [
            {
              label: t('admin.quotes.number'),
              primary: true,
              render: (quote) => html`<div class="cell-main">
                <span class="cell-main__text">
                  <a class="row-link mono" href="#/quotes/${quote.id}">${quote.number}</a>
                  <span class="cell-sub">${fmtDateTime(quote.createdAt)}</span>
                </span>
              </div>`
            },
            {
              label: t('admin.quotes.customer'),
              render: (quote) => html`${quote.customer.name}${quote.customer.company ? html` <span class="muted">· ${quote.customer.company}</span>` : ''}
                <br><span class="cell-sub">${formatPhone(quote.customer.phone)}${quote.user ? ` · ${t('admin.quotes.registered')}` : ''}</span>`
            },
            {
              label: t('admin.quotes.items'),
              className: 'num',
              render: (quote) => html`<span class="mono">${quote.items.length}</span>`
            },
            {
              label: t('admin.quotes.estimated'),
              className: 'num',
              render: (quote) => html`${fmtMoney(quote.estimatedTotal)}${
                quote.quotedTotal != null ? html`<br><span class="cell-sub">${t('admin.quotes.quoted')}: ${fmtMoney(quote.quotedTotal)}</span>` : ''
              }`
            },
            { label: t('admin.quotes.status'), render: (quote) => quoteBadge(quote.status) },
            {
              label: t('admin.quotes.assignee'),
              render: (quote) =>
                quote.assignedTo
                  ? html`<span class="nowrap">${quote.assignedTo.name}</span>`
                  : html`<span class="muted">${t('admin.quotes.unassigned')}</span>`
            },
            {
              label: t('admin.common.actions'),
              className: 'actions',
              render: (quote) => rowMenu([
                { href: `#/quotes/${quote.id}`, icon: 'eye', label: t('admin.common.open') },
                { href: telHref(quote.customer.phone), icon: 'phone', label: t('admin.quotes.call') },
                canDelete && 'sep',
                canDelete && { icon: 'trash', label: t('common.delete'), danger: true, attrs: { 'data-delete': quote.id, 'data-name': quote.number } }
              ])
            }
          ]
        })}
        ${ctl.pager(data)}`
      );
    },
    onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
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
      await api(`/api/admin/quotes/${button.dataset.delete}`, { method: 'DELETE' });
      toast(t('admin.common.deleted'), { type: 'ok' });
      changed();
      ctl.load();
    } catch (error) {
      reportError(error);
    }
  });

  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: t('admin.quotes.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}

/* ============================================================== detail */

function contactButtons(customer, method) {
  const buttons = [html`<a class="btn btn-sm ${method === 'phone' ? 'btn-accent' : 'btn-ghost'}" href="${telHref(customer.phone)}">${icon('phone')}${t('admin.quotes.call')}</a>`];
  if (method === 'telegram') buttons.push(html`<a class="btn btn-sm btn-accent" href="${safeUrl(`https://t.me/+${customer.phone.replace(/\D/g, '')}`)}" target="_blank" rel="noopener">${icon('telegram')}Telegram</a>`);
  if (method === 'whatsapp') buttons.push(html`<a class="btn btn-sm btn-accent" href="${whatsappHref(customer.phone)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>`);
  if (customer.email) buttons.push(html`<a class="btn btn-sm ${method === 'email' ? 'btn-accent' : 'btn-ghost'}" href="${safeUrl(`mailto:${customer.email}`)}">${icon('send')}${t('quote.contactMethods.email')}</a>`);
  return html`<div class="contact-row">${buttons}</div>`;
}

function itemsTable(quote, canWrite) {
  return html`<div class="table-scroll">
    <table class="mini-table quote-items-table">
      <thead>
        <tr>
          <th>${t('admin.quotes.product')}</th>
          <th class="num">${t('admin.quotes.qty')}</th>
          <th class="num">${t('admin.quotes.unitPrice')}</th>
          <th class="num">${t('admin.quotes.lineTotal')}</th>
          <th class="num">${t('admin.quotes.quotedPrice')}</th>
          <th class="num">${t('admin.quotes.quotedLine')}</th>
        </tr>
      </thead>
      <tbody>
        ${quote.items.map(
          (item) => html`<tr data-item="${item.id}" data-qty="${item.qty}">
            <td>
              <a class="row-link" href="/product/${item.slug}" target="_blank" rel="noopener">${loc(item.name)}</a>
              <br><span class="cell-sub">${item.sku}${item.stallNumber ? html` · <span class="stall">${item.stallNumber}</span> ${item.supplierName}` : ''}</span>
            </td>
            <td class="num">${fmtNumber(item.qty)} ${unitShort(item.unit)}</td>
            <td class="num">${fmtMoney(item.unitPrice)}</td>
            <td class="num">${fmtMoney(item.lineTotal)}</td>
            <td class="num">
              ${canWrite
                ? html`<input class="control qp-input" type="text" inputmode="decimal" data-quoted-price="${item.id}" value="${item.quotedUnitPrice ?? ''}" placeholder="${fmtNumber(item.unitPrice)}" aria-label="${t('admin.quotes.quotedPrice')}: ${loc(item.name)}" autocomplete="off">`
                : item.quotedUnitPrice != null
                  ? fmtMoney(item.quotedUnitPrice)
                  : html`<span class="muted">${t('admin.common.none')}</span>`}
            </td>
            <td class="num" data-quoted-line="${item.id}">${item.quotedUnitPrice != null ? fmtMoney(Math.round(item.quotedUnitPrice * item.qty)) : html`<span class="muted">${t('admin.common.none')}</span>`}</td>
          </tr>`
        )}
      </tbody>
    </table>
  </div>`;
}

function historyList(quote) {
  const entries = [...quote.history].reverse();
  return html`<ol class="history">${entries.map(
    (entry) => html`<li>
      ${quoteBadge(entry.status)}
      <p class="history__meta">${fmtDateTime(entry.at)}${entry.byName ? ` · ${entry.byName}` : ''}</p>
      ${entry.note ? html`<p class="history__note">${entry.note}</p>` : ''}
    </li>`
  )}</ol>`;
}

function parseMoney(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

function detailMarkup(quote, { meta, options, me }) {
  const canWrite = can('quotes:write');
  const transitions = meta.quoteTransitions[quote.status] || [];
  const delivery = quote.delivery || {};
  const staff = options.staff || [];

  return html`${viewHead({
    title: t('admin.quotes.detailTitle', { number: quote.number }),
    back: { href: '#/quotes', label: t('admin.common.backToList') },
    meta: html`${quoteBadge(quote.status)}<span>${t('admin.quotes.created')}: ${fmtDateTime(quote.createdAt)}</span>
      <span>${quote.user ? t('admin.quotes.registered') : t('admin.quotes.guest')}</span>
      <span class="mono-chip">${(quote.lang || 'uz').toUpperCase()}</span>`,
    actions: html`<button class="btn btn-ghost" type="button" data-print>${icon('clipboard')}${t('admin.quotes.print')}</button>
      ${can('quotes:delete') ? html`<button class="btn btn-danger" type="button" data-delete-quote>${icon('trash')}${t('common.delete')}</button>` : ''}`
  })}

  <div class="quote-detail">
    <div class="quote-main">
      <section class="panel">
        ${sectionTitle(t('admin.quotes.items'), { iconName: 'package', aside: tn('common.positions', quote.items.length) })}
        <form data-pricing-form novalidate>
          ${itemsTable(quote, canWrite)}
          <dl class="totals">
            <div><dt>${t('admin.quotes.estimated')}</dt><dd>${fmtMoney(quote.estimatedTotal)}</dd></div>
            <div class="is-quoted">
              <dt>${t('admin.quotes.quoted')}</dt>
              <dd data-quoted-total>${quote.quotedTotal != null ? fmtMoney(quote.quotedTotal) : t('admin.common.none')}</dd>
            </div>
            ${canWrite
              ? html`<div>
                  <label class="checkbox">
                    <input type="checkbox" data-auto-total ${attrs({ checked: true })}>
                    <span class="checkbox__box">${icon('check')}</span><span>${t('admin.quotes.quotedTotalAuto')}</span>
                  </label>
                  <input class="control control--compact" type="text" inputmode="decimal" data-manual-total value="${quote.quotedTotal ?? ''}" aria-label="${t('admin.quotes.quoted')}" hidden autocomplete="off">
                </div>`
              : ''}
          </dl>
          ${canWrite
            ? html`<p class="form-error" role="alert" data-form-error hidden></p>
              <div class="button-row contact-row">
                <button class="btn btn-accent" type="submit">${icon('check')}${t('admin.quotes.saveQuote')}</button>
                ${transitions.includes('quoted') ? html`<button class="btn btn-ghost" type="button" data-save-and-quote>${icon('send')}${t('admin.quotes.saveAndMark')}</button>` : ''}
              </div>`
            : ''}
        </form>
      </section>

      <div class="two-col">
        <section class="panel">
          ${sectionTitle(t('admin.quotes.customer'), { iconName: 'user' })}
          <dl class="kv">
            <div><dt>${t('quote.name')}</dt><dd>${quote.customer.name}</dd></div>
            <div><dt>${t('quote.phone')}</dt><dd><a class="mono" href="${telHref(quote.customer.phone)}">${formatPhone(quote.customer.phone)}</a></dd></div>
            ${quote.customer.email ? html`<div><dt>${t('quote.email')}</dt><dd><a href="${safeUrl(`mailto:${quote.customer.email}`)}">${quote.customer.email}</a></dd></div>` : ''}
            ${quote.customer.company ? html`<div><dt>${t('quote.company')}</dt><dd>${quote.customer.company}</dd></div>` : ''}
            ${quote.customer.taxId ? html`<div><dt>${t('quote.taxId')}</dt><dd class="mono">${quote.customer.taxId}</dd></div>` : ''}
            <div><dt>${t('admin.quotes.contactVia')}</dt><dd>${t(`quote.contactMethods.${quote.contactMethod}`)}</dd></div>
            <div><dt>${t('admin.quotes.lang')}</dt><dd>${t(`common.langNames.${quote.lang || 'uz'}`)}</dd></div>
          </dl>
          ${contactButtons(quote.customer, quote.contactMethod)}
        </section>

        <section class="panel">
          ${sectionTitle(t('admin.quotes.delivery'), { iconName: 'truck' })}
          <dl class="kv">
            <div><dt>${t('quote.deliveryMethod')}</dt><dd>${t(`quote.deliveryMethods.${delivery.method}`)}</dd></div>
            ${delivery.region ? html`<div><dt>${t('quote.region')}</dt><dd>${t(`regions.${delivery.region}`)}</dd></div>` : ''}
            ${delivery.address ? html`<div><dt>${t('quote.address')}</dt><dd>${delivery.address}</dd></div>` : ''}
            <div><dt>${t('admin.quotes.neededBy')}</dt><dd>${delivery.neededBy ? fmtDate(delivery.neededBy) : t('admin.common.none')}</dd></div>
          </dl>
          <p class="detail-title contact-row">${t('admin.quotes.customerComment')}</p>
          ${quote.comment ? html`<p class="comment-box">${quote.comment}</p>` : html`<p class="muted small">${t('admin.quotes.noNote')}</p>`}
        </section>
      </div>
    </div>

    <aside class="quote-side">
      <section class="panel">
        ${sectionTitle(t('admin.quotes.status'), { iconName: 'activity' })}
        <p class="button-row">${quoteBadge(quote.status)}</p>
        ${canWrite && transitions.length
          ? html`<form class="stack contact-row" data-status-form novalidate>
              <div class="field">
                <label class="field__label" for="status-note">${t('admin.quotes.statusNote')}</label>
                <textarea class="control" id="status-note" name="statusNote" rows="2" maxlength="1000"></textarea>
              </div>
              <div class="status-actions">
                ${transitions.map(
                  (status) => html`<button class="btn btn-sm ${['rejected', 'cancelled'].includes(status) ? 'btn-danger' : status === 'quoted' || status === 'accepted' ? 'btn-accent' : 'btn-ghost'}" type="button" data-transition="${status}">
                    ${t('admin.quotes.moveTo', { status: t(`quoteStatus.${status}`) })}
                  </button>`
                )}
              </div>
            </form>`
          : ''}
      </section>

      <section class="panel">
        ${sectionTitle(t('admin.quotes.assignee'), { iconName: 'users' })}
        ${canWrite
          ? html`<div class="stack">
              <select class="control" data-assignee aria-label="${t('admin.quotes.assignee')}">
                <option value="">${t('admin.quotes.unassigned')}</option>
                ${staff.map((person) => html`<option value="${person.id}" ${attrs({ selected: quote.assignedTo?.id === person.id })}>${person.name} · ${t(`admin.roles.${person.role}`)}</option>`)}
              </select>
              ${quote.assignedTo?.id !== me.id ? html`<button class="btn btn-ghost btn-sm" type="button" data-assign-me>${icon('user')}${t('admin.quotes.assignToMe')}</button>` : ''}
            </div>`
          : html`<p>${quote.assignedTo ? html`<span class="avatar avatar--muted">${initials(quote.assignedTo.name)}</span> ${quote.assignedTo.name}` : t('admin.quotes.unassigned')}</p>`}
      </section>

      <section class="panel">
        ${sectionTitle(t('admin.quotes.managerNote'), { iconName: 'edit', aside: t('admin.quotes.managerNoteHint') })}
        ${canWrite
          ? html`<form class="stack" data-note-form novalidate>
              <textarea class="control" name="managerNote" rows="4" maxlength="2000" aria-label="${t('admin.quotes.managerNote')}">${quote.managerNote || ''}</textarea>
              <button class="btn btn-ghost btn-sm" type="submit">${icon('check')}${t('admin.quotes.saveNote')}</button>
            </form>`
          : html`<p class="comment-box">${quote.managerNote || t('admin.quotes.noNote')}</p>`}
      </section>

      <section class="panel">
        ${sectionTitle(t('admin.quotes.history'), { iconName: 'history' })}
        ${historyList(quote)}
        ${can('audit:read') ? html`<p class="contact-row"><a class="panel__link" href="#/audit?entityType=quote&entityId=${quote.id}">${t('admin.common.history')}${icon('arrow-right')}</a></p>` : ''}
      </section>
    </aside>
  </div>`;
}

export async function quoteDetailView({ root, params }) {
  setHTML(root, loadingBlock());
  const [meta, options, session] = await Promise.all([getMeta(), getOptions(), getSession()]);
  let quote = await api(`/api/admin/quotes/${params.id}`);
  let pricingDirty = false;
  let noteDirty = false;
  setDirtyCheck(() => pricingDirty || noteDirty);

  const patch = async (body, button) => {
    setBusy(button, true);
    try {
      quote = await api(`/api/admin/quotes/${quote.id}`, { method: 'PATCH', body });
      pricingDirty = false;
      noteDirty = false;
      changed();
      render();
      return true;
    } catch (error) {
      reportError(error, button?.closest('form') || null);
      return false;
    } finally {
      if (document.contains(button)) setBusy(button, false);
    }
  };

  function render() {
    setHTML(root, detailMarkup(quote, { meta, options, me: session.user }));
    bind();
  }

  function recalc(form) {
    let total = 0;
    let complete = true;
    let invalid = false;
    $$('[data-quoted-price]', form).forEach((input) => {
      const row = input.closest('tr');
      const qty = Number(row.dataset.qty);
      const price = parseMoney(input.value);
      const cell = $(`[data-quoted-line="${CSS.escape(input.dataset.quotedPrice)}"]`, form);
      if (Number.isNaN(price)) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (Number.isNaN(price)) invalid = true;
      if (price === null || Number.isNaN(price)) {
        complete = false;
        setHTML(cell, html`<span class="muted">${t('admin.common.none')}</span>`);
      } else {
        const line = Math.round(price * qty);
        total += line;
        setHTML(cell, fmtMoney(line));
      }
    });
    const auto = $('[data-auto-total]', form);
    const manual = $('[data-manual-total]', form);
    const out = $('[data-quoted-total]', form);
    if (auto?.checked) {
      out.textContent = complete ? fmtMoney(total) : quote.quotedTotal != null ? fmtMoney(quote.quotedTotal) : t('admin.common.none');
    } else if (manual) {
      const value = parseMoney(manual.value);
      out.textContent = value === null || Number.isNaN(value) ? t('admin.common.none') : fmtMoney(value);
    }
    return { invalid, complete, total };
  }

  function pricingBody(form) {
    const items = $$('[data-quoted-price]', form).map((input) => ({ id: input.dataset.quotedPrice, quotedUnitPrice: parseMoney(input.value) }));
    const body = { items };
    const auto = $('[data-auto-total]', form);
    if (auto && !auto.checked) {
      const value = parseMoney($('[data-manual-total]', form).value);
      body.quotedTotal = Number.isNaN(value) ? undefined : value;
    }
    return body;
  }

  function bind() {
    const pricing = $('[data-pricing-form]', root);
    if (pricing && can('quotes:write')) {
      pricing.addEventListener('input', () => {
        pricingDirty = true;
        recalc(pricing);
      });
      const auto = $('[data-auto-total]', pricing);
      const manual = $('[data-manual-total]', pricing);
      auto?.addEventListener('change', () => {
        manual.hidden = auto.checked;
        if (!auto.checked) manual.focus();
        recalc(pricing);
      });
      const submitPricing = async (button, extra = {}) => {
        const { invalid } = recalc(pricing);
        if (invalid) {
          toast(t('validation.invalid_number'), { type: 'error' });
          return;
        }
        const ok = await patch({ ...pricingBody(pricing), ...extra }, button);
        if (ok) toast(t('admin.quotes.pricesSaved'), { type: 'ok' });
      };
      pricing.addEventListener('submit', (event) => {
        event.preventDefault();
        submitPricing(pricing.querySelector('[type="submit"]'));
      });
      $('[data-save-and-quote]', pricing)?.addEventListener('click', (event) => {
        const { complete } = recalc(pricing);
        if (!complete) {
          toast(t('admin.quotes.fillAllPrices'), { type: 'error' });
          return;
        }
        submitPricing(event.currentTarget, { status: 'quoted' });
      });
    }

    const assignee = $('[data-assignee]', root);
    assignee?.addEventListener('change', async () => {
      if (await patch({ assignedTo: assignee.value || null }, assignee)) toast(t('admin.common.saved'), { type: 'ok' });
    });
    $('[data-assign-me]', root)?.addEventListener('click', async (event) => {
      if (await patch({ assignedTo: session.user.id }, event.currentTarget)) toast(t('admin.common.saved'), { type: 'ok' });
    });

    const noteForm = $('[data-note-form]', root);
    noteForm?.addEventListener('input', () => {
      noteDirty = true;
    });
    noteForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = noteForm.elements.namedItem('managerNote').value.trim();
      if (await patch({ managerNote: value }, noteForm.querySelector('[type="submit"]'))) toast(t('admin.common.saved'), { type: 'ok' });
    });

    $('[data-print]', root)?.addEventListener('click', () => window.print());

    $('[data-delete-quote]', root)?.addEventListener('click', async (event) => {
      const ok = await confirmDialog({
        title: t('common.delete'),
        text: t('admin.common.confirmDelete', { name: quote.number }),
        confirmLabel: t('common.delete'),
        danger: true
      });
      if (!ok) return;
      const button = event.currentTarget;
      setBusy(button, true);
      try {
        await api(`/api/admin/quotes/${quote.id}`, { method: 'DELETE' });
        pricingDirty = false;
        noteDirty = false;
        changed();
        toast(t('admin.common.deleted'), { type: 'ok' });
        window.location.hash = '#/quotes';
      } catch (error) {
        reportError(error);
        setBusy(button, false);
      }
    });
  }

  // Delegated once: the root survives re-renders.
  on(root, 'click', '[data-transition]', async (event, button) => {
    const target = button.dataset.transition;
    if (['rejected', 'cancelled'].includes(target)) {
      const ok = await confirmDialog({
        title: t('admin.quotes.moveTo', { status: t(`quoteStatus.${target}`) }),
        text: t('admin.quotes.confirmStatus', { number: quote.number, status: t(`quoteStatus.${target}`) }),
        confirmLabel: t('common.confirm'),
        danger: true
      });
      if (!ok) return;
    }
    const statusForm = $('[data-status-form]', root);
    const note = statusForm?.elements.namedItem('statusNote')?.value.trim() || '';
    if (await patch({ status: target, statusNote: note }, button)) {
      toast(t('admin.quotes.statusChanged', { status: t(`quoteStatus.${target}`) }), { type: 'ok' });
    }
  });

  render();
  return {
    title: quote.number,
    destroy() {
      setDirtyCheck(null);
    }
  };
}

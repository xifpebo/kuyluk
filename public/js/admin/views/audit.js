import { html, setHTML, icon, on, $ } from '../../lib/dom.js';
import { t, tIn, keysOf, fmtDateTime } from '../../lib/i18n.js';
import {
  viewHead,
  roleBadge,
  timeCell,
  resultsMeta,
  searchInput,
  filterSelect,
  listController,
  skeletonTable,
  messageBlock,
  displayValue,
  deviceLabel
} from '../shared.js';
import { badge } from '../../lib/ui.js';

const PATH = '/audit';
const ENTITIES = ['product', 'category', 'brand', 'supplier', 'quote', 'user', 'upload', 'session'];
const ENTITY_ROUTES = { product: '#/products/', quote: '#/quotes/' };

function entityCell(entry) {
  const entity = entry.entity || {};
  if (!entity.type) return html`<span class="muted">${t('admin.common.none')}</span>`;
  const label = entity.label || entity.id;
  const href = ENTITY_ROUTES[entity.type] && /^[a-f0-9]{24}$/.test(entity.id) && !/\.delete$/.test(entry.action) ? `${ENTITY_ROUTES[entity.type]}${entity.id}` : null;
  return html`<span class="cell-sub">${t(`audit.entities.${entity.type}`)}</span><br>
    ${href ? html`<a class="row-link" href="${href}">${label}</a>` : html`<span>${label}</span>`}`;
}

function actorCell(entry) {
  const actor = entry.actor || {};
  if (!actor.email && !actor.name) {
    const email = entry.meta?.email;
    return html`<span class="muted">${email || t('admin.audit.anonymous')}</span>`;
  }
  return html`<span>${actor.name || actor.email}</span><br>
    <span class="cell-sub">${actor.email}</span> ${actor.role ? roleBadge(actor.role) : ''}`;
}

function details(entry) {
  const meta = entry.meta && Object.keys(entry.meta).length ? JSON.stringify(entry.meta, null, 2) : '';
  return html`<div class="audit-details__grid">
    <div>
      <p class="detail-title">${t('admin.audit.changes')}</p>
      ${entry.changes.length
        ? html`<div class="table-scroll"><table class="mini-table">
            <thead><tr><th>${t('admin.audit.field')}</th><th>${t('admin.audit.before')}</th><th>${t('admin.audit.after')}</th></tr></thead>
            <tbody>${entry.changes.map(
              (change) => html`<tr>
                <td class="mono small">${change.field}</td>
                <td class="diff-before">${displayValue(change.from)}</td>
                <td class="diff-after">${displayValue(change.to)}</td>
              </tr>`
            )}</tbody></table></div>`
        : html`<p class="muted small">${t('admin.audit.noChanges')}</p>`}
    </div>
    <div class="stack">
      <dl class="kv">
        <div><dt>${t('admin.audit.time')}</dt><dd>${fmtDateTime(entry.at)}</dd></div>
        <div><dt>${t('admin.audit.ip')}</dt><dd class="ip">${entry.ip || t('admin.common.none')}</dd></div>
        <div><dt>${t('admin.audit.userAgent')}</dt><dd title="${entry.userAgent}">${deviceLabel(entry.userAgent)}</dd></div>
        <div><dt>${t('admin.audit.requestId')}</dt><dd class="mono small">${entry.requestId || t('admin.common.none')}</dd></div>
        ${entry.entity?.id ? html`<div><dt>ID</dt><dd class="mono small">${entry.entity.id}</dd></div>` : ''}
      </dl>
      ${meta ? html`<div><p class="detail-title">${t('admin.audit.meta')}</p><pre class="code-block">${meta}</pre></div>` : ''}
    </div>
  </div>`;
}

export default async function auditView({ root, query }) {
  const actions = keysOf('audit.actions').sort();
  setHTML(
    root,
    html`${viewHead({ title: t('admin.audit.title'), lead: t('admin.audit.lead') })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ name: 'actor', placeholder: t('admin.audit.actorEmail') })}
      ${filterSelect({ name: 'action', label: t('admin.audit.action'), allLabel: t('admin.audit.allActions'), options: actions.map((a) => ({ value: a, label: tIn('audit.actions', a) })) })}
      ${filterSelect({ name: 'entityType', label: t('admin.audit.entityType'), allLabel: t('admin.audit.allEntities'), options: ENTITIES.map((e) => ({ value: e, label: t(`audit.entities.${e}`) })) })}
      ${filterSelect({
        name: 'status',
        label: t('admin.audit.result'),
        allLabel: t('admin.audit.allResults'),
        options: [
          { value: 'success', label: t('admin.audit.success') },
          { value: 'failure', label: t('admin.audit.failure') }
        ]
      })}
      <label class="filter-bar__label">${t('admin.audit.from')}<input class="control control--compact" type="date" name="from"></label>
      <label class="filter-bar__label">${t('admin.audit.to')}<input class="control control--compact" type="date" name="to"></label>
      <input type="hidden" name="entityId">
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <p class="notice notice--info" data-entity-filter hidden></p>
    <div data-results>${skeletonTable()}</div>`
  );

  const results = $('[data-results]', root);
  const entityNotice = $('[data-entity-filter]', root);
  let entries = [];

  const ctl = listController({
    root,
    path: PATH,
    endpoint: '/api/admin/audit',
    render: (data, state) => {
      entries = data.items;
      entityNotice.hidden = !state.entityId;
      if (state.entityId) {
        setHTML(
          entityNotice,
          html`${icon('info')} ${t('admin.audit.entityFilter', { id: state.entityId })}
            <button class="btn btn-ghost btn-sm" type="button" data-clear-entity>${icon('close')}${t('admin.common.reset')}</button>`
        );
      }
      if (!entries.length) {
        setHTML(results, messageBlock({ iconName: 'activity', title: t('admin.common.empty'), text: t('admin.common.emptyFiltered') }));
        return;
      }
      setHTML(
        results,
        html`${resultsMeta(data)}
        <div class="table-wrap">
          <table class="data-table data-table--cards audit-table">
            <thead><tr>
              <th>${t('admin.audit.time')}</th><th>${t('admin.audit.actor')}</th><th>${t('admin.audit.action')}</th>
              <th>${t('admin.audit.entity')}</th><th>${t('admin.audit.result')}</th><th>${t('admin.audit.ip')}</th><th class="actions"><span class="visually-hidden">${t('admin.audit.details')}</span></th>
            </tr></thead>
            <tbody>
              ${entries.map(
                (entry) => html`<tr>
                  <td class="nowrap cell-primary" data-label="${t('admin.audit.time')}">${timeCell(entry.at)}<br><span class="cell-sub">${fmtDateTime(entry.at)}</span></td>
                  <td data-label="${t('admin.audit.actor')}">${actorCell(entry)}</td>
                  <td data-label="${t('admin.audit.action')}"><span class="audit-action">${tIn('audit.actions', entry.action)}<span class="audit-code">${entry.action}${entry.changes.length ? ` · ${entry.changes.length}Δ` : ''}</span></span></td>
                  <td data-label="${t('admin.audit.entity')}">${entityCell(entry)}</td>
                  <td data-label="${t('admin.audit.result')}">${entry.status === 'failure' ? badge(t('admin.audit.failure'), 'danger', { dot: true }) : badge(t('admin.audit.success'), 'ok', { dot: true })}</td>
                  <td data-label="${t('admin.audit.ip')}"><span class="ip">${entry.ip || ''}</span></td>
                  <td class="actions">
                    <button class="btn btn-icon btn-sm btn-ghost expand-btn" type="button" aria-expanded="false" aria-controls="audit-${entry.id}" data-expand="${entry.id}" aria-label="${t('admin.audit.details')}">${icon('chevron-down')}</button>
                  </td>
                </tr>
                <tr class="audit-details" id="audit-${entry.id}" hidden><td colspan="7" data-details="${entry.id}"></td></tr>`
              )}
            </tbody>
          </table>
        </div>
        ${ctl.pager(data)}`
      );
    },
    onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
  });

  on(results, 'click', '[data-expand]', (event, button) => {
    const id = button.dataset.expand;
    const row = $(`#audit-${CSS.escape(id)}`, results);
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    row.hidden = !open;
    const cell = row.querySelector('[data-details]');
    if (open && !cell.childElementCount) {
      const entry = entries.find((item) => item.id === id);
      if (entry) setHTML(cell, details(entry));
    }
  });
  on(entityNotice, 'click', '[data-clear-entity]', () => ctl.set({ entityId: '', entityType: '' }));

  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: t('admin.audit.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}

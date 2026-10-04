/**
 * Interface texts: every public UI string can be overridden per language
 * without a deploy. An empty override falls back to the built-in text.
 */
import { html, setHTML, icon, on, $ } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { toast, setBusy } from '../../lib/ui.js';
import { viewHead, resultsMeta, searchInput, listController, reportError, skeletonTable, messageBlock, attrs } from '../shared.js';

const ENDPOINT = '/api/admin/translations';

function row(item) {
  const overridden = Boolean(item.override.uz || item.override.ru);
  return html`<form class="tr-row ${overridden ? 'is-overridden' : ''}" data-key="${item.key}" novalidate>
    <div class="tr-row__key"><code>${item.key}</code>${overridden ? html`<span class="badge badge--accent">${t('admin.translations.overridden')}</span>` : ''}</div>
    ${['uz', 'ru'].map(
      (lang) => html`<label class="tr-row__cell">
        <span class="tr-row__base"><span class="loc-tag">${lang.toUpperCase()}</span>${item.base[lang]}</span>
        <textarea class="control" name="${lang}" rows="${item.base[lang].length > 80 ? 3 : 1}" maxlength="2000" lang="${lang}" placeholder="${t('admin.translations.placeholder')}">${item.override[lang] || ''}</textarea>
      </label>`
    )}
    <div class="tr-row__actions">
      <button class="btn btn-sm btn-accent" type="submit" disabled>${icon('check')}${t('common.save')}</button>
      <button class="btn btn-sm btn-ghost" type="button" data-reset-key ${attrs({ disabled: !overridden })}>${icon('refresh')}${t('admin.translations.reset')}</button>
    </div>
  </form>`;
}

export default async function translationsView({ root, query }) {
  setHTML(
    root,
    html`${viewHead({ title: t('admin.translations.title'), lead: t('admin.translations.lead') })}
    <form class="filter-bar" data-filters role="search">
      ${searchInput({ placeholder: t('admin.translations.searchPlaceholder') })}
      <div class="field field--inline">
        <label class="visually-hidden" for="tr-ns">${t('admin.translations.namespace')}</label>
        <select class="control control--compact" id="tr-ns" name="namespace" data-namespaces><option value="">${t('admin.translations.allNamespaces')}</option></select>
      </div>
      <div class="field field--inline">
        <label class="visually-hidden" for="tr-ov">${t('admin.translations.onlyOverridden')}</label>
        <select class="control control--compact" id="tr-ov" name="overridden">
          <option value="">${t('admin.translations.allKeys')}</option>
          <option value="true">${t('admin.translations.onlyOverridden')}</option>
        </select>
      </div>
      <button class="btn btn-ghost btn-sm filter-bar__reset" type="button" data-reset>${icon('refresh')}${t('admin.common.reset')}</button>
    </form>
    <div data-results>${skeletonTable()}</div>`
  );
  const results = $('[data-results]', root);
  const nsSelect = $('[data-namespaces]', root);
  let namespacesFilled = false;

  const ctl = listController({
    root,
    path: '/translations',
    endpoint: ENDPOINT,
    defaults: {},
    render: (data) => {
      if (!namespacesFilled && data.namespaces) {
        namespacesFilled = true;
        for (const ns of data.namespaces) {
          const option = document.createElement('option');
          option.value = ns;
          option.textContent = ns;
          nsSelect.append(option);
        }
        ctl.syncControls();
      }
      if (!data.items.length) {
        setHTML(results, messageBlock({ iconName: 'globe', title: t('admin.common.empty'), text: t('admin.common.emptyFiltered') }));
        return;
      }
      setHTML(results, html`${resultsMeta(data)}<div class="tr-list">${data.items.map(row)}</div>${ctl.pager(data)}`);
    },
    onError: (error) => setHTML(results, messageBlock({ iconName: 'alert', title: t('admin.common.loadFailed'), text: error.message }))
  });

  const save = async (form, body) => {
    const button = form.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      const saved = await api(ENDPOINT, { method: 'PUT', body: { key: form.dataset.key, ...body } });
      toast(t('admin.common.saved'), { type: 'ok' });
      const fresh = document.createElement('div');
      setHTML(fresh, row(saved));
      form.replaceWith(fresh.firstElementChild);
    } catch (error) {
      reportError(error, form);
      setBusy(button, false);
    }
  };

  results.addEventListener('input', (event) => {
    const form = event.target.closest('.tr-row');
    if (form) form.querySelector('[type="submit"]').disabled = false;
  });
  results.addEventListener('submit', (event) => {
    const form = event.target.closest('.tr-row');
    if (!form) return;
    event.preventDefault();
    save(form, { uz: form.elements.uz.value.trim(), ru: form.elements.ru.value.trim() });
  });
  on(results, 'click', '[data-reset-key]', (event, button) => {
    const form = button.closest('.tr-row');
    save(form, { uz: '', ru: '' });
  });

  ctl.fromQuery(query);
  await ctl.load();
  return {
    title: t('admin.translations.title'),
    update(next) {
      ctl.fromQuery(next);
      ctl.load();
    }
  };
}

/**
 * Minimal hash router for the admin SPA.
 *
 * A route renders into a fresh container so delegated listeners die with the
 * view. When only the query string changes, the mounted view's `update()`
 * is called instead of re-rendering (keeps focus in filter inputs).
 * Permission checks here are for UX only — the API enforces them again.
 */
import { html, setHTML } from '../lib/dom.js';
import { t } from '../lib/i18n.js';
import { can } from '../lib/api.js';
import { parseHash, isDirty, confirmDiscard, messageBlock } from './shared.js';

function compile(pattern) {
  const names = [];
  const source = pattern.replace(/:([a-zA-Z]+)/g, (match, name) => {
    names.push(name);
    return '([a-f0-9]{24}|new)';
  });
  return { regex: new RegExp(`^${source}$`), names };
}

export function createRouter({ routes, outlet, onRoute }) {
  const table = routes.map((route) => ({ ...route, ...compile(route.path) }));
  let current = null;
  let lastHash = window.location.hash;
  let suppress = false;

  function match(path) {
    for (const route of table) {
      const found = route.regex.exec(path);
      if (found) {
        const params = {};
        route.names.forEach((name, index) => {
          params[name] = found[index + 1];
        });
        return { route, params };
      }
    }
    return null;
  }

  function allowed(route) {
    if (route.permission && !can(route.permission)) return false;
    if (route.anyPermission && !route.anyPermission.some((permission) => can(permission))) return false;
    return true;
  }

  async function mount(found, path, query) {
    if (current?.instance?.destroy) {
      try {
        current.instance.destroy();
      } catch {
        /* ignore */
      }
    }
    const container = document.createElement('div');
    container.className = 'view';
    outlet.replaceChildren(container);
    current = { key: path, route: found?.route || null, instance: null, container };

    if (!found) {
      setHTML(container, messageBlock({ iconName: 'alert', title: t('admin.common.notFoundView'), action: { href: '#/dashboard', label: t('admin.nav.dashboard') } }));
      onRoute?.({ title: t('admin.common.notFoundView'), nav: null });
      return;
    }
    if (!allowed(found.route)) {
      setHTML(container, messageBlock({ iconName: 'lock', title: t('admin.common.forbiddenView'), action: { href: '#/dashboard', label: t('admin.nav.dashboard') } }));
      onRoute?.({ title: t('admin.common.forbiddenView'), nav: found.route.nav });
      return;
    }

    onRoute?.({ title: found.route.title ? t(found.route.title) : '', nav: found.route.nav, loading: true });
    try {
      const instance = (await found.route.view({ root: container, params: found.params, query })) || {};
      if (current?.container !== container) {
        instance.destroy?.();
        return;
      }
      current.instance = instance;
      if (instance.title) onRoute?.({ title: instance.title, nav: found.route.nav });
    } catch (error) {
      if (current?.container !== container) return;
      if (error?.code === 'password_change_required') {
        document.dispatchEvent(new CustomEvent('admin:password-required'));
        return;
      }
      const title = error?.status === 404 ? t('admin.common.notFoundView') : error?.status === 403 ? t('admin.common.forbiddenView') : t('admin.common.loadFailed');
      setHTML(
        container,
        html`${messageBlock({ iconName: error?.status === 403 ? 'lock' : 'alert', title, text: error?.status && error.status < 500 ? '' : error?.message || '' })}`
      );
    }
  }

  async function resolve() {
    const { path, query } = parseHash();
    const found = match(path);
    if (current && found && current.key === path && current.instance?.update) {
      current.instance.update(query);
      return;
    }
    await mount(found, path, query);
  }

  async function onHashChange() {
    if (suppress) {
      suppress = false;
      lastHash = window.location.hash;
      return;
    }
    const target = window.location.hash;
    const { path } = parseHash(target);
    const samePath = current && current.key === path;
    if (!samePath && isDirty()) {
      suppress = true;
      window.history.replaceState(null, '', lastHash || '#/dashboard');
      suppress = false;
      if (!(await confirmDiscard())) return;
      window.history.pushState(null, '', target);
    }
    lastHash = target;
    await resolve();
  }

  function start() {
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', (event) => {
      if (isDirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      window.history.replaceState(null, '', '#/dashboard');
    }
    lastHash = window.location.hash;
    return resolve();
  }

  /** Programmatic navigation (respects the unsaved-changes guard). */
  function go(hash, { replace = false } = {}) {
    if (replace) {
      window.history.replaceState(null, '', hash);
      lastHash = hash;
      return resolve();
    }
    if (window.location.hash === hash) return resolve();
    window.location.hash = hash;
    return Promise.resolve();
  }

  /** Re-render the current route from scratch. */
  function reload() {
    const { path, query } = parseHash();
    return mount(match(path), path, query);
  }

  return { start, go, reload };
}

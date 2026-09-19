/**
 * Admin panel bootstrap: session & permission checks, navigation shell,
 * idle-timeout warning, forced password change and the hash router.
 */
import { $, $$, on, readBoot, storage } from '../lib/dom.js';
import { loadDictionary, t } from '../lib/i18n.js';
import { api, can, getSession, logout } from '../lib/api.js';
import { confirmDialog, setBusy, toast } from '../lib/ui.js';
import { createRouter } from './router.js';
import { bindMenus, confirmDiscard, initials, setDirtyCheck } from './shared.js';
import dashboardView from './views/dashboard.js';
import { productListView, productFormView } from './views/products.js';
import { taxonomyView } from './views/taxonomy.js';
import { quoteListView, quoteDetailView } from './views/quotes.js';
import usersView from './views/users.js';
import auditView from './views/audit.js';
import profileView from './views/profile.js';
import { passwordGate } from './views/password-gate.js';

const boot = readBoot();
const RETURN_KEY = 'bb.admin.return';
const session = storage('session');

const ROUTES = [
  { path: '/dashboard', view: dashboardView, permission: 'dashboard:view', nav: 'dashboard', title: 'admin.nav.dashboard' },
  { path: '/products', view: productListView, permission: 'products:read', nav: 'products', title: 'admin.products.title' },
  { path: '/products/new', view: productFormView, permission: 'products:write', nav: 'products', title: 'admin.products.new' },
  { path: '/products/:id', view: productFormView, permission: 'products:read', nav: 'products', title: 'admin.products.edit' },
  { path: '/categories', view: taxonomyView('categories'), permission: 'products:read', nav: 'categories', title: 'admin.categories.title' },
  { path: '/brands', view: taxonomyView('brands'), permission: 'products:read', nav: 'brands', title: 'admin.brands.title' },
  { path: '/suppliers', view: taxonomyView('suppliers'), permission: 'products:read', nav: 'suppliers', title: 'admin.suppliers.title' },
  { path: '/quotes', view: quoteListView, permission: 'quotes:read', nav: 'quotes', title: 'admin.quotes.title' },
  { path: '/quotes/:id', view: quoteDetailView, permission: 'quotes:read', nav: 'quotes', title: 'admin.quotes.title' },
  { path: '/users', view: usersView, permission: 'users:manage', nav: 'users', title: 'admin.users.title' },
  { path: '/audit', view: auditView, permission: 'audit:read', nav: 'audit', title: 'admin.audit.title' },
  { path: '/profile', view: profileView, nav: 'profile', title: 'admin.profile.title' }
];

let leaving = false;

function toLogin({ expired = false } = {}) {
  if (leaving) return;
  leaving = true;
  setDirtyCheck(null);
  const hash = window.location.hash;
  if (hash && hash !== '#/dashboard') session?.setItem(RETURN_KEY, hash);
  window.location.replace(`/admin/login${expired ? '?expired=1' : ''}`);
}

function restoreReturnHash() {
  const saved = session?.getItem(RETURN_KEY);
  session?.removeItem(RETURN_KEY);
  if (saved && /^#\/[\w/?=&%.-]*$/.test(saved) && (!window.location.hash || window.location.hash === '#/dashboard')) {
    window.history.replaceState(null, '', saved);
  }
}

/* ---------------------------------------------------------------- shell */
function applyPermissions() {
  $$('[data-permission]').forEach((element) => {
    element.hidden = !can(element.dataset.permission);
  });
  $$('[data-permission-any]').forEach((element) => {
    const list = element.dataset.permissionAny.split(/\s+/).filter(Boolean);
    element.hidden = !list.some((permission) => can(permission));
  });
}

function renderUser(user) {
  $('[data-user-initials]').textContent = initials(user.name);
  $('[data-user-name]').textContent = user.name;
  $('[data-user-role]').textContent = t(`admin.roles.${user.role}`);
}

function setupSidebar() {
  const sidebar = $('[data-sidebar]');
  const backdrop = $('.admin-backdrop');
  const opener = $('[data-sidebar-open]');
  const mobile = window.matchMedia('(max-width: 1023px)');

  const setInert = () => {
    if (mobile.matches && !sidebar.classList.contains('is-open')) sidebar.setAttribute('inert', '');
    else sidebar.removeAttribute('inert');
  };

  const close = () => {
    if (!sidebar.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open');
    backdrop.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    setInert();
    if (mobile.matches) opener.focus();
  };
  const open = () => {
    sidebar.classList.add('is-open');
    backdrop.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    setInert();
    sidebar.querySelector('.admin-nav__link:not([hidden])')?.focus();
  };

  opener.addEventListener('click', open);
  $$('[data-sidebar-close]').forEach((element) => element.addEventListener('click', close));
  on(sidebar, 'click', 'a', () => close());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) close();
  });
  mobile.addEventListener('change', () => {
    if (!mobile.matches) close();
    setInert();
  });
  setInert();
}

function setupLanguageSwitch() {
  on(document, 'click', '.lang-switch__item', async (event, link) => {
    event.preventDefault();
    if (!(await confirmDiscard())) return;
    setDirtyCheck(null);
    window.location.href = `${link.getAttribute('href')}${window.location.hash}`;
  });
}

function setupLogout() {
  $$('[data-logout]').forEach((button) =>
    button.addEventListener('click', async () => {
      if (!(await confirmDiscard())) return;
      setBusy(button, true);
      try {
        await logout();
      } catch {
        /* the session may already be gone */
      }
      leaving = true;
      setDirtyCheck(null);
      session?.removeItem(RETURN_KEY);
      window.location.replace('/admin/login');
    })
  );
}

function highlightNav(nav) {
  $$('[data-route]').forEach((link) => {
    if (link.dataset.route === nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

let badgeCheckedAt = 0;

async function refreshQuoteBadge(force = false) {
  if (!can('quotes:read')) return;
  if (!force && Date.now() - badgeCheckedAt < 30 * 1000) return;
  badgeCheckedAt = Date.now();
  try {
    const data = await api('/api/admin/quotes?status=new&limit=1');
    const badge = $('[data-new-quotes]');
    badge.textContent = data.total > 99 ? '99+' : String(data.total);
    badge.hidden = data.total === 0;
    badge.setAttribute('aria-label', `${t('quoteStatus.new')}: ${data.total}`);
  } catch {
    /* non-critical */
  }
}

/* --------------------------------------------------------- idle timer */
function setupIdleWatch(info) {
  const idleSeconds = Number(info?.idleSeconds) || 0;
  if (!idleSeconds) return;
  const absolute = info.absoluteExpiresAt ? new Date(info.absoluteExpiresAt).getTime() : Infinity;
  // The server refreshes its sliding window at most once a minute.
  const margin = 60;
  const warnAt = Math.max(idleSeconds - Math.min(180, idleSeconds / 4), idleSeconds / 2);
  let lastActivity = Date.now();
  let warning = false;

  document.addEventListener('api:activity', () => {
    lastActivity = Date.now();
  });

  setInterval(async () => {
    if (leaving) return;
    const now = Date.now();
    const elapsed = (now - lastActivity) / 1000 + margin;
    if (elapsed >= idleSeconds || now >= absolute) {
      toLogin({ expired: true });
      return;
    }
    if (elapsed >= warnAt && !warning) {
      warning = true;
      const minutes = Math.max(1, Math.round((idleSeconds - elapsed) / 60));
      const stay = await confirmDialog({
        title: t('admin.session.expiringTitle'),
        text: t('admin.session.expiringText', { minutes }),
        confirmLabel: t('admin.session.stay')
      });
      warning = false;
      if (leaving) return;
      if ((Date.now() - lastActivity) / 1000 + margin >= idleSeconds) {
        toLogin({ expired: true });
        return;
      }
      if (stay) {
        getSession(true).catch(() => {});
      }
    }
  }, 15 * 1000);
}

/* --------------------------------------------------------------- main */
async function main() {
  await loadDictionary();
  bindMenus();

  let current;
  try {
    current = await getSession(true);
  } catch {
    toLogin({ expired: true });
    return;
  }
  if (!current?.user || !current.isStaff) {
    toLogin({ expired: false });
    return;
  }

  document.addEventListener('session:unauthorized', () => toLogin({ expired: true }));
  renderUser(current.user);
  applyPermissions();
  setupSidebar();
  setupLanguageSwitch();
  setupLogout();
  setupIdleWatch(current.session);
  restoreReturnHash();

  const outlet = $('[data-view]');
  const titleEl = $('[data-view-title]');
  let first = true;

  const router = createRouter({
    routes: ROUTES,
    outlet,
    onRoute: ({ title, nav, loading }) => {
      if (title) {
        titleEl.textContent = title;
        document.title = `${title} — ${boot.siteName || 'Big Bazaar Build'}`;
      }
      highlightNav(nav);
      if (loading) {
        if (!first) {
          window.scrollTo({ top: 0 });
          outlet.focus({ preventScroll: true });
        }
        first = false;
        refreshQuoteBadge();
      }
    }
  });

  document.addEventListener('admin:quotes-changed', () => refreshQuoteBadge(true));
  document.addEventListener('admin:user-changed', async () => {
    try {
      const fresh = await getSession(true);
      if (fresh?.user) renderUser(fresh.user);
    } catch {
      /* ignore */
    }
  });

  const gate = async () => {
    const shell = $('[data-admin]');
    shell.classList.add('is-gated');
    titleEl.textContent = t('auth.mustChangeTitle');
    await passwordGate({ outlet, user: current.user });
    shell.classList.remove('is-gated');
    toast(t('auth.passwordChanged'), { type: 'ok' });
    await router.reload();
  };

  let gating = false;
  document.addEventListener('admin:password-required', async () => {
    if (gating) return;
    gating = true;
    try {
      await gate();
    } finally {
      gating = false;
    }
  });

  if (current.mustChangePassword) {
    gating = true;
    try {
      const shell = $('[data-admin]');
      shell.classList.add('is-gated');
      titleEl.textContent = t('auth.mustChangeTitle');
      await passwordGate({ outlet, user: current.user });
      shell.classList.remove('is-gated');
      toast(t('auth.passwordChanged'), { type: 'ok' });
    } finally {
      gating = false;
    }
  }
  await router.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  const outlet = document.querySelector('[data-view]');
  if (outlet) outlet.textContent = t('admin.common.loadFailed');
});

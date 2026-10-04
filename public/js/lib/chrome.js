/**
 * Site chrome shared by every storefront page: header menu, account link,
 * favourites badge and buttons, category navigation, search suggestions,
 * language switch and the global "Contact shop" buttons.
 */
import { $, $$, html, setHTML, icon, on, debounce, safeUrl, storage } from './dom.js';
import { t, lang, loc, fmtMoney, unitShort } from './i18n.js';
import { api, getSession } from './api.js';
import * as favorites from './favorites.js';
import { drawer, toast } from './ui.js';
import { registry } from './product-card.js';
import { openContactSheet, bindContactTracking } from './contact.js';
import { categoryUrl, productUrl, shopUrl, PLACEHOLDER_IMAGE } from './format.js';

const cache = storage('session');

export async function loadCategories() {
  const key = `sb.categories.${lang}`;
  try {
    const cached = cache && JSON.parse(cache.getItem(key) || 'null');
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.items;
  } catch {
    /* ignore */
  }
  const { items } = await api('/api/catalog/categories');
  try {
    cache?.setItem(key, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* ignore */
  }
  return items;
}

function renderCategoryNavs(categories) {
  const params = new URLSearchParams(window.location.search);
  const activeSlug = window.location.pathname === '/catalog' ? params.get('category') : null;
  const nav = $('[data-category-nav]');
  if (nav) {
    setHTML(
      nav,
      html`<a class="catnav__link catnav__link--all" href="/catalog">${icon('grid')}${t('nav.allCategories')}</a>
        <a class="catnav__link catnav__link--sale" href="/catalog?discount=true">${icon('percent')}${t('nav.discounts')}</a>
        ${categories.map(
          (c) => html`<a class="catnav__link" href="${categoryUrl(c)}" ${c.slug === activeSlug ? html`aria-current="page"` : ''}>${loc(c.name)}</a>`
        )}`
    );
  }
  const mobile = $('[data-category-list]');
  if (mobile) {
    setHTML(mobile, html`${categories.map((c) => html`<li><a href="${categoryUrl(c)}">${icon(c.icon)}${loc(c.name)}</a></li>`)}`);
  }
  const footer = $('[data-footer-categories]');
  if (footer) {
    setHTML(
      footer,
      html`${categories.slice(0, 8).map((c) => html`<li><a href="${categoryUrl(c)}">${loc(c.name)}</a></li>`)}
        <li><a href="/catalog">${t('nav.allCategories')} →</a></li>`
    );
  }
}

function updateFavBadges() {
  const total = favorites.count();
  $$('[data-fav-count]').forEach((badgeEl) => {
    badgeEl.textContent = total > 99 ? '99+' : String(total);
    badgeEl.hidden = total === 0;
  });
  $$('[data-fav]').forEach((button) => {
    const active = favorites.has(button.dataset.fav);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    const use = button.querySelector('use');
    if (use) use.setAttribute('href', `#i-${active ? 'heart-fill' : 'heart'}`);
    const label = button.querySelector('span');
    if (label) label.textContent = active ? t('favorites.saved') : t('favorites.add');
  });
}

function setupFavorites() {
  on(document, 'click', '[data-fav]', (event, button) => {
    event.preventDefault();
    const added = favorites.toggle(button.dataset.fav);
    button.classList.remove('is-pop');
    void button.offsetWidth;
    button.classList.add('is-pop');
    toast(added ? t('favorites.added') : t('favorites.removed'), {
      type: added ? 'ok' : 'info',
      action: added ? { href: '/favorites', label: t('favorites.open') } : null,
      timeout: 2600
    });
  });
  document.addEventListener('favorites:change', updateFavBadges);
  window.addEventListener('storage', (event) => {
    if (event.key === 'sb.favorites') updateFavBadges();
  });
  updateFavBadges();
}

function setupContact() {
  on(document, 'click', '[data-contact-product]', (event, button) => {
    event.preventDefault();
    const product = registry.get(button.dataset.contactProduct);
    if (product?.shop) openContactSheet(product.shop, product);
  });
  bindContactTracking((id) => registry.get(id) || null);
}

function updateAccountLinks(session) {
  const user = session?.user;
  const home = session?.home || '/account';
  $$('[data-account-link]').forEach((link) => {
    link.href = user ? home : '/login';
  });
  const label = !user ? t('nav.login') : session.isStaff ? t('nav.admin') : session.isSeller ? t('nav.myShop') : user.name.split(' ')[0] || t('nav.account');
  $$('[data-account-label]').forEach((el) => {
    el.textContent = label;
  });
  $$('[data-account-short]').forEach((el) => {
    el.textContent = user ? (session.isSeller ? t('nav.myShop') : t('nav.profile')) : t('nav.login');
  });
}

function setupMenu() {
  const toggle = $('[data-menu-toggle]');
  const panel = $('#mobile-nav');
  if (!toggle || !panel) return;
  const menu = drawer(panel, {
    panel: $('.drawer__panel', panel),
    onClose: () => toggle.setAttribute('aria-expanded', 'false')
  });
  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'true');
    menu.open(toggle);
  });
  on(panel, 'click', 'a', () => menu.close());
}

function setupSuggest() {
  const form = $('[data-search]');
  if (!form) return;
  const input = $('input[name="q"]', form);
  const list = $('.suggest', form);
  const current = new URLSearchParams(window.location.search).get('q');
  if (current && window.location.pathname === '/catalog') input.value = current;
  let controller = null;
  let options = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const highlight = (index) => {
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    active = index;
    if (options[index]) {
      input.setAttribute('aria-activedescendant', options[index].id);
      options[index].scrollIntoView({ block: 'nearest' });
    }
  };

  const render = (q, data) => {
    const products = data.products || [];
    const categories = data.categories || [];
    const shops = data.shops || [];
    const allHref = `/catalog?q=${encodeURIComponent(q)}`;
    setHTML(
      list,
      html`${categories.length ? html`<p class="suggest__group" role="presentation">${t('nav.suggestCategories')}</p>` : ''}
        ${categories.map(
          (c, i) => html`<a class="suggest__item" role="option" id="sg-c${i}" href="${categoryUrl(c)}" aria-selected="false">
            <span class="suggest__icon">${icon(c.icon)}</span><span class="suggest__text"><span class="suggest__name">${loc(c.name)}</span>
            ${c.parent ? html`<span class="suggest__meta">${loc(c.parent.name)}</span>` : ''}</span></a>`
        )}
        ${shops.length ? html`<p class="suggest__group" role="presentation">${t('nav.suggestShops')}</p>` : ''}
        ${shops.map(
          (s, i) => html`<a class="suggest__item" role="option" id="sg-s${i}" href="${shopUrl(s)}" aria-selected="false">
            <img class="suggest__thumb" src="${safeUrl(s.logoUrl || '/img/logo-mark.svg')}" alt="" width="44" height="44">
            <span class="suggest__text"><span class="suggest__name">${s.name}</span><span class="suggest__meta">${t('nav.shop')}</span></span></a>`
        )}
        ${products.length ? html`<p class="suggest__group" role="presentation">${t('nav.suggestProducts')}</p>` : ''}
        ${products.map(
          (p, i) => html`<a class="suggest__item" role="option" id="sg-p${i}" href="${productUrl(p)}" aria-selected="false">
            <img class="suggest__thumb" src="${safeUrl(p.image || PLACEHOLDER_IMAGE)}" alt="" width="44" height="44">
            <span class="suggest__text"><span class="suggest__name">${loc(p.name)}</span>
            <span class="suggest__meta">${fmtMoney(p.price)}${p.unit !== 'piece' ? ` / ${unitShort(p.unit)}` : ''} · ${p.shop}</span></span></a>`
        )}
        ${!products.length && !categories.length && !shops.length ? html`<p class="suggest__empty">${t('nav.noSuggestions')}</p>` : ''}
        <a class="suggest__all" role="option" id="sg-all" href="${allHref}" aria-selected="false">${t('nav.seeAllResults', { q })}${icon('arrow-right')}</a>`
    );
    options = $$('[role="option"]', list);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  };

  const lookup = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      close();
      return;
    }
    controller?.abort();
    controller = new AbortController();
    try {
      const data = await api(`/api/catalog/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (input.value.trim() === q && document.activeElement === input) render(q, data);
    } catch (error) {
      if (error.name !== 'AbortError') close();
    }
  }, 180);

  input.addEventListener('input', lookup);
  input.addEventListener('keydown', (event) => {
    if (list.hidden) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlight((active + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(active <= 0 ? options.length - 1 : active - 1);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      window.location.href = options[active].href;
    } else if (event.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  form.addEventListener('submit', (event) => {
    if (!input.value.trim()) {
      event.preventDefault();
      window.location.href = '/catalog';
    }
  });
}

/** Hide the mobile tab bar while typing, show a compact header on scroll. */
function setupScrollState() {
  let last = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    document.body.classList.toggle('is-scrolled', y > 40);
    document.body.classList.toggle('is-scrolling-down', y > last && y > 160);
    last = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

export async function initChrome() {
  setupMenu();
  setupSuggest();
  setupFavorites();
  setupContact();
  setupScrollState();
  document.addEventListener('session:change', (event) => updateAccountLinks(event.detail));
  getSession()
    .then(() => favorites.initSync())
    .catch(() => {});
  loadCategories()
    .then(renderCategoryNavs)
    .catch(() => {});
}

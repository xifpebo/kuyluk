/**
 * Site chrome shared by every storefront page: header menu, account link,
 * quote badge, category navigation, search suggestions, language switch and
 * the global "add to quote" buttons.
 */
import { $, $$, html, setHTML, icon, on, debounce, safeUrl, storage } from './dom.js';
import { t, lang, loc, fmtMoney, unitShort } from './i18n.js';
import { api, getSession } from './api.js';
import * as cart from './cart.js';
import { drawer, toast } from './ui.js';
import { addButtonContent } from './product-card.js';
import { categoryUrl, productUrl, PLACEHOLDER_IMAGE } from './format.js';

const cache = storage('session');

export async function loadCategories() {
  const key = `bb.categories.${lang}`;
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
      html`<a class="catnav__link catnav__link--all" href="/catalog">${t('nav.allCategories')}</a>
        ${categories.map(
          (c) =>
            html`<a class="catnav__link" href="${categoryUrl(c)}" ${c.slug === activeSlug ? html`aria-current="page"` : ''}>${loc(c.name)}</a>`
        )}`
    );
  }
  const mobile = $('[data-category-list]');
  if (mobile) {
    setHTML(
      mobile,
      html`${categories.map((c) => html`<li><a href="${categoryUrl(c)}">${icon(c.icon)}${loc(c.name)}</a></li>`)}`
    );
  }
  const footer = $('[data-footer-categories]');
  if (footer) {
    setHTML(
      footer,
      html`${categories.slice(0, 7).map((c) => html`<li><a href="${categoryUrl(c)}">${loc(c.name)}</a></li>`)}
        <li><a href="/catalog">${t('nav.allCategories')} →</a></li>`
    );
  }
}

function updateCartBadge(animate = false) {
  const total = cart.count();
  $$('[data-cart-count]').forEach((badgeEl) => {
    badgeEl.textContent = String(total);
    badgeEl.hidden = total === 0;
    if (animate) {
      badgeEl.classList.remove('is-bump');
      void badgeEl.offsetWidth;
      badgeEl.classList.add('is-bump');
    }
  });
  $$('[data-quote-link]').forEach((link) => link.setAttribute('aria-label', t('nav.quoteAria', { count: total })));
}

function updateAccountLinks(session) {
  const user = session?.user;
  $$('[data-account-link]').forEach((link) => {
    if (!user) {
      link.href = '/login';
      return;
    }
    link.href = session.isStaff ? '/admin' : '/account';
    if (window.location.pathname === link.getAttribute('href')) link.setAttribute('aria-current', 'page');
  });
  $$('[data-account-label]').forEach((label) => {
    if (!user) label.textContent = t('nav.login');
    else label.textContent = session.isStaff ? t('nav.admin') : user.name.split(' ')[0] || t('nav.account');
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

/** Keep the current hash (e.g. admin routes) when switching language. */
function setupLanguageSwitch() {
  on(document, 'click', '.lang-switch__item', (event, link) => {
    if (!window.location.hash) return;
    event.preventDefault();
    window.location.href = `${link.getAttribute('href')}${window.location.hash}`;
  });
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
    const allHref = `/catalog?q=${encodeURIComponent(q)}`;
    setHTML(
      list,
      html`${categories.length ? html`<p class="suggest__group" role="presentation">${t('nav.suggestCategories')}</p>` : ''}
        ${categories.map(
          (c, i) => html`<a class="suggest__item" role="option" id="sg-c${i}" href="${categoryUrl(c)}" aria-selected="false">
            <span class="suggest__icon">${icon(c.icon)}</span><span class="suggest__text"><span class="suggest__name">${loc(c.name)}</span></span></a>`
        )}
        ${products.length ? html`<p class="suggest__group" role="presentation">${t('nav.suggestProducts')}</p>` : ''}
        ${products.map(
          (p, i) => html`<a class="suggest__item" role="option" id="sg-p${i}" href="${productUrl(p)}" aria-selected="false">
            <img class="suggest__thumb" src="${safeUrl(p.image || PLACEHOLDER_IMAGE)}" alt="" width="44" height="44">
            <span class="suggest__text"><span class="suggest__name">${loc(p.name)}</span>
            <span class="suggest__meta">${p.sku} · ${fmtMoney(p.price)} / ${unitShort(p.unit)}</span></span></a>`
        )}
        ${!products.length && !categories.length ? html`<p class="suggest__empty">${t('nav.noSuggestions')}</p>` : ''}
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

function setupAddButtons() {
  on(document, 'click', '[data-add]', (event, button) => {
    event.preventDefault();
    const id = button.dataset.add;
    const minQty = Number(button.dataset.min) || 1;
    const wasInCart = cart.getQty(id) > 0;
    if (!wasInCart) cart.add(id, minQty);
    const product = { id, unit: button.dataset.unit };
    setHTML(button, addButtonContent(product));
    button.classList.remove('btn-accent');
    button.classList.add('btn-ghost', 'is-added');
    if (wasInCart) {
      window.location.href = '/quote';
      return;
    }
    toast(t('product.added', { name: button.dataset.name }), {
      type: 'ok',
      action: { href: '/quote', label: t('product.goToQuote') }
    });
  });
}

export async function initChrome() {
  setupMenu();
  setupLanguageSwitch();
  setupSuggest();
  setupAddButtons();
  updateCartBadge();
  document.addEventListener('cart:change', () => updateCartBadge(true));
  document.addEventListener('session:change', (event) => updateAccountLinks(event.detail));
  getSession().catch(() => {});
  loadCategories()
    .then(renderCategoryNavs)
    .catch(() => {});
}

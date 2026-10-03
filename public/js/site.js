import { loadDictionary } from './lib/i18n.js';
import { initChrome } from './lib/chrome.js';
import { PLACEHOLDER_IMAGE } from './lib/format.js';
import home from './pages/home.js';
import catalog from './pages/catalog.js';
import product from './pages/product.js';
import shops from './pages/shops.js';
import shop from './pages/shop.js';
import favorites from './pages/favorites.js';
import { loginPage, registerPage, sellPage } from './pages/auth.js';
import account from './pages/account.js';

const PAGES = {
  home,
  catalog,
  product,
  shops,
  shop,
  favorites,
  sell: sellPage,
  login: loginPage,
  'admin-login': loginPage,
  register: registerPage,
  account
};

/**
 * A missing or broken image (e.g. a deleted upload) falls back to the neutral
 * placeholder instead of the browser's broken-image icon. Decorative covers
 * are hidden instead.
 */
function imageFallback() {
  document.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (img?.tagName !== 'IMG' || img.dataset.fallback) return;
      img.dataset.fallback = '1';
      if (img.closest('.shop-card__cover, [data-shop-cover]')) img.hidden = true;
      else img.src = PLACEHOLDER_IMAGE;
    },
    true
  );
}

async function main() {
  imageFallback();
  await loadDictionary();
  const page = document.documentElement.dataset.page;
  if (page !== 'admin-login') initChrome();
  const init = PAGES[page];
  if (init) await init();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
});

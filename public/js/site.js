import { loadDictionary } from './lib/i18n.js';
import { initChrome } from './lib/chrome.js';
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

async function main() {
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

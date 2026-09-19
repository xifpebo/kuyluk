import { loadDictionary } from './lib/i18n.js';
import { initChrome } from './lib/chrome.js';
import home from './pages/home.js';
import catalog from './pages/catalog.js';
import product from './pages/product.js';
import suppliers from './pages/suppliers.js';
import supplier from './pages/supplier.js';
import quote from './pages/quote.js';
import { loginPage, registerPage } from './pages/auth.js';
import account from './pages/account.js';

const PAGES = {
  home,
  catalog,
  product,
  suppliers,
  supplier,
  quote,
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

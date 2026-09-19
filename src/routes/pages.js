'use strict';

const express = require('express');
const i18n = require('../i18n');
const catalog = require('../services/catalogService');
const { asyncHandler } = require('../lib/errors');

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){0,20}$/;

/** Only allow same-site relative redirect targets (prevents open redirects). */
function safeNext(value, fallback) {
  if (typeof value !== 'string' || value.length > 300) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

function createPageRenderer({ config, engine }) {
  function context(req, opts) {
    const lang = req.lang;
    const scope = opts.layout === 'admin' ? 'admin' : 'public';
    const bundle = i18n.clientBundle(lang, scope);
    const heading = opts.title || i18n.t(lang, opts.titleKey || 'home.metaTitle');
    const title = opts.page === 'home' ? `${config.siteName} — ${heading}` : `${heading} — ${config.siteName}`;
    const current = new URL(req.originalUrl, config.appOrigin);
    current.searchParams.delete('lang');
    const langUrl = (target) => {
      const url = new URL(current);
      url.searchParams.set('lang', target);
      return `${url.pathname}${url.search}`;
    };
    const canonicalQuery = opts.canonicalQuery === false ? '' : current.search;
    return {
      lang,
      page: opts.page,
      section: opts.section || opts.page,
      layout: opts.layout || 'site',
      title,
      heading,
      description: opts.description || i18n.t(lang, opts.descriptionKey || 'home.metaDescription'),
      siteName: config.siteName,
      supportPhone: config.supportPhone,
      supportPhoneHref: `tel:${config.supportPhone.replace(/[^\d+]/g, '')}`,
      year: new Date().getFullYear(),
      isUz: lang === 'uz',
      isRu: lang === 'ru',
      langUrls: { uz: langUrl('uz'), ru: langUrl('ru') },
      alternateUz: `${config.appOrigin}${langUrl('uz')}`,
      alternateRu: `${config.appOrigin}${langUrl('ru')}`,
      canonical: `${config.appOrigin}${current.pathname}${canonicalQuery}`,
      googleFonts: config.fontProvider === 'google',
      localFonts: config.fontProvider === 'local',
      noindex: Boolean(opts.noindex),
      jsonLd: opts.jsonLd || null,
      boot: {
        lang,
        page: opts.page,
        i18nUrl: `/i18n/${scope}/${lang}.json?v=${bundle.hash}`,
        siteName: config.siteName,
        supportPhone: config.supportPhone,
        ...(opts.boot || {})
      }
    };
  }

  function render(req, res, page, opts = {}) {
    res.setHeader('Cache-Control', 'no-cache, private');
    res.setHeader('Vary', 'Cookie');
    if (opts.noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(engine.renderPage(page, context(req, { page, ...opts })));
  }

  function renderErrorPage(req, res, status) {
    const page = status === 404 ? 'not-found' : 'server-error';
    return engine.renderPage(
      page,
      context(req, {
        page,
        titleKey: status === 404 ? 'notFound.metaTitle' : 'serverError.metaTitle',
        noindex: true
      })
    );
  }

  return { render, renderErrorPage };
}

function productJsonLd(product, lang, config) {
  const name = i18n.pick(lang, product.name);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: product.sku,
    description: i18n.pick(lang, product.description).slice(0, 500) || undefined,
    image: (product.images || []).map((src) => (src.startsWith('/') ? `${config.appOrigin}${src}` : src)),
    brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
    category: i18n.pick(lang, product.category?.name),
    offers: {
      '@type': 'Offer',
      priceCurrency: product.currency,
      price: product.price,
      availability:
        product.stock.status === 'out_of_stock'
          ? 'https://schema.org/OutOfStock'
          : product.stock.status === 'on_order'
            ? 'https://schema.org/PreOrder'
            : 'https://schema.org/InStock',
      url: `${config.appOrigin}/product/${product.slug}`,
      seller: { '@type': 'Organization', name: product.supplier?.name }
    }
  };
}

function createPagesRouter({ config, renderer }) {
  const router = express.Router();
  const { render } = renderer;
  const notFoundPage = (req, res) => res.status(404).type('html').send(renderer.renderErrorPage(req, res, 404));

  const legacy = {
    '/index.html': '/',
    '/products.html': '/catalog',
    '/product.html': '/catalog',
    '/shops.html': '/suppliers',
    '/shop.html': '/suppliers',
    '/admin.html': '/admin'
  };
  for (const [from, to] of Object.entries(legacy)) {
    router.get(from, (req, res) => res.redirect(301, to));
  }

  router.get('/', (req, res) =>
    render(req, res, 'home', { titleKey: 'home.metaTitle', descriptionKey: 'home.metaDescription' })
  );

  router.get('/catalog', (req, res) =>
    render(req, res, 'catalog', { titleKey: 'catalog.metaTitle', descriptionKey: 'catalog.metaDescription' })
  );

  router.get(
    '/product/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug);
      const result = slug.length <= 120 && SLUG.test(slug) ? await catalog.getProduct(slug) : null;
      if (!result) return notFoundPage(req, res);
      const { product } = result;
      const lang = req.lang;
      const name = i18n.pick(lang, product.name);
      return render(req, res, 'product', {
        section: 'catalog',
        title: name,
        description: i18n.t(lang, 'product.metaDescription', {
          name,
          price: i18n.formatMoney(lang, product.price),
          supplier: product.supplier?.name || ''
        }),
        canonicalQuery: false,
        jsonLd: productJsonLd(product, lang, config),
        boot: { slug }
      });
    })
  );

  router.get('/suppliers', (req, res) =>
    render(req, res, 'suppliers', { titleKey: 'suppliers.metaTitle', descriptionKey: 'suppliers.metaDescription' })
  );

  router.get(
    '/supplier/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug);
      const result = slug.length <= 120 && SLUG.test(slug) ? await catalog.getSupplier(slug) : null;
      if (!result) return notFoundPage(req, res);
      const { supplier } = result;
      return render(req, res, 'supplier', {
        section: 'suppliers',
        title: `${supplier.name} · ${i18n.t(req.lang, 'suppliers.stall', { number: supplier.stallNumber })}`,
        description: i18n.pick(req.lang, supplier.description) || i18n.t(req.lang, 'suppliers.metaDescription'),
        canonicalQuery: false,
        boot: { slug }
      });
    })
  );

  router.get('/quote', (req, res) => render(req, res, 'quote', { titleKey: 'quote.metaTitle', noindex: true }));

  router.get('/login', (req, res) => {
    if (req.auth) return res.redirect(302, req.auth.isStaff ? '/admin' : '/account');
    return render(req, res, 'login', {
      titleKey: 'auth.loginMetaTitle',
      noindex: true,
      boot: { next: safeNext(req.query.next, '/account') }
    });
  });

  router.get('/register', (req, res) => {
    if (req.auth) return res.redirect(302, req.auth.isStaff ? '/admin' : '/account');
    return render(req, res, 'register', { titleKey: 'auth.registerMetaTitle', noindex: true });
  });

  router.get('/account', (req, res) => {
    if (!req.auth) return res.redirect(302, '/login?next=%2Faccount');
    if (req.auth.isStaff) return res.redirect(302, '/admin');
    return render(req, res, 'account', { titleKey: 'account.metaTitle', noindex: true });
  });

  router.get('/admin/login', (req, res) => {
    if (req.auth?.isStaff) return res.redirect(302, '/admin');
    return render(req, res, 'admin-login', {
      titleKey: 'auth.adminMetaTitle',
      layout: 'auth',
      noindex: true,
      boot: { next: safeNext(req.query.next, '/admin') }
    });
  });

  router.get('/admin', (req, res) => {
    if (!req.auth?.isStaff) return res.redirect(302, '/admin/login');
    return render(req, res, 'admin', { titleKey: 'admin.metaTitle', layout: 'admin', noindex: true });
  });

  return router;
}

module.exports = { createPagesRouter, createPageRenderer, safeNext };

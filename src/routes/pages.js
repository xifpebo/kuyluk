'use strict';

const express = require('express');
const i18n = require('../i18n');
const catalog = require('../services/catalogService');
const content = require('../services/contentService');
const { homeFor } = require('../security/rbac');
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
    const settings = content.currentSettings(config);
    const contact = settings.contact;
    const phoneHref = `tel:${String(contact.phone).replace(/[^\d+]/g, '')}`;
    const announcement = settings.announcement?.isActive ? i18n.pick(lang, settings.announcement.text) : '';
    return {
      ...(opts.extra || {}),
      lang,
      page: opts.page,
      section: opts.section || opts.page,
      layout: opts.layout || 'site',
      title,
      heading,
      description: opts.description || i18n.t(lang, opts.descriptionKey || 'home.metaDescription'),
      siteName: config.siteName,
      supportPhone: contact.phone,
      supportPhoneHref: phoneHref,
      contact: {
        ownerName: contact.ownerName,
        phone: contact.phone,
        phoneHref,
        telegram: contact.telegram,
        telegramHref: contact.telegram ? `https://t.me/${contact.telegram}` : '',
        instagram: contact.instagram,
        instagramHref: contact.instagram ? `https://instagram.com/${contact.instagram}` : '',
        email: contact.email,
        emailHref: contact.email ? `mailto:${contact.email}` : '',
        address: i18n.pick(lang, contact.address),
        hours: i18n.pick(lang, contact.hours)
      },
      announcement,
      announcementLink: settings.announcement?.link || '',
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
      ogImage: opts.ogImage || `${config.appOrigin}/img/og-image${lang === 'ru' ? '-ru' : ''}.png`,
      boot: {
        lang,
        page: opts.page,
        i18nUrl: `/i18n/${scope}/${lang}.json?v=${bundle.hash}`,
        siteName: config.siteName,
        supportPhone: contact.phone,
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
    aggregateRating: product.reviewCount
      ? { '@type': 'AggregateRating', ratingValue: product.rating, reviewCount: product.reviewCount }
      : undefined,
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
      seller: { '@type': 'Organization', name: product.shop?.name }
    }
  };
}

function shopJsonLd(shop, lang, config) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HardwareStore',
    name: shop.name,
    description: i18n.pick(lang, shop.description).slice(0, 500) || undefined,
    telephone: shop.phone || undefined,
    address: i18n.pick(lang, shop.address) || undefined,
    url: `${config.appOrigin}/shop/${shop.slug}`,
    image: shop.coverUrl ? `${config.appOrigin}${shop.coverUrl}` : undefined,
    aggregateRating: shop.reviewCount ? { '@type': 'AggregateRating', ratingValue: shop.rating, reviewCount: shop.reviewCount } : undefined
  };
}

function createPagesRouter({ config, renderer }) {
  const router = express.Router();
  const { render } = renderer;
  const notFoundPage = (req, res) => res.status(404).type('html').send(renderer.renderErrorPage(req, res, 404));
  const validSlug = (slug) => slug.length <= 120 && SLUG.test(slug);

  const legacy = {
    '/index.html': '/',
    '/products.html': '/catalog',
    '/product.html': '/catalog',
    '/shops.html': '/shops',
    '/shop.html': '/shops',
    '/suppliers': '/shops',
    '/quote': '/favorites',
    '/admin.html': '/admin'
  };
  for (const [from, to] of Object.entries(legacy)) {
    router.get(from, (req, res) => res.redirect(301, to));
  }
  router.get('/supplier/:slug', (req, res) => {
    const slug = String(req.params.slug);
    res.redirect(301, validSlug(slug) ? `/shop/${slug}` : '/shops');
  });

  router.get('/', (req, res) => {
    const home = content.currentSettings(config).home || {};
    const homeText = {};
    for (const key of ['eyebrow', 'title', 'accent', 'lead', 'popularTerms']) homeText[key] = i18n.pick(req.lang, home[key]);
    render(req, res, 'home', { titleKey: 'home.metaTitle', descriptionKey: 'home.metaDescription', extra: { homeText } });
  });

  router.get('/catalog', (req, res) =>
    render(req, res, 'catalog', { titleKey: 'catalog.metaTitle', descriptionKey: 'catalog.metaDescription' })
  );

  router.get(
    '/category/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug);
      if (!validSlug(slug)) return notFoundPage(req, res);
      const refs = await catalog.loadRefs();
      const category = refs.categoryBySlug.get(slug);
      if (!category || !refs.isCategoryVisible(category)) return notFoundPage(req, res);
      const url = new URL(req.originalUrl, config.appOrigin);
      url.searchParams.set('category', slug);
      url.searchParams.delete('lang');
      return res.redirect(301, `/catalog${url.search}`);
    })
  );

  router.get(
    '/product/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug);
      const result = validSlug(slug) ? await catalog.getProduct(slug) : null;
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
          shop: product.shop?.name || ''
        }),
        canonicalQuery: false,
        ogImage: product.images?.[0] ? `${config.appOrigin}${product.images[0]}` : null,
        jsonLd: productJsonLd(product, lang, config),
        boot: { slug }
      });
    })
  );

  router.get('/shops', (req, res) =>
    render(req, res, 'shops', { titleKey: 'shops.metaTitle', descriptionKey: 'shops.metaDescription' })
  );

  router.get(
    '/shop/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug);
      const refs = validSlug(slug) ? await catalog.loadRefs() : null;
      const shop = refs?.shopBySlug.get(slug);
      if (!shop || shop.status !== 'approved') return notFoundPage(req, res);
      const lang = req.lang;
      return render(req, res, 'shop', {
        section: 'shops',
        title: shop.name,
        description: i18n.pick(lang, shop.tagline) || i18n.pick(lang, shop.description).slice(0, 160) || i18n.t(lang, 'shops.metaDescription'),
        canonicalQuery: false,
        ogImage: shop.coverUrl ? `${config.appOrigin}${shop.coverUrl}` : null,
        jsonLd: shopJsonLd(shop, lang, config),
        boot: { slug }
      });
    })
  );

  router.get('/favorites', (req, res) =>
    render(req, res, 'favorites', { titleKey: 'favorites.metaTitle', noindex: true })
  );
  router.get('/about', (req, res) =>
    render(req, res, 'about', { titleKey: 'about.metaTitle', descriptionKey: 'about.metaDescription' })
  );
  router.get('/contact', (req, res) =>
    render(req, res, 'contact', { titleKey: 'contact.metaTitle', descriptionKey: 'contact.metaDescription' })
  );
  router.get('/sell', (req, res) => {
    if (req.auth?.isSeller) return res.redirect(302, '/seller');
    return render(req, res, 'sell', { titleKey: 'sell.metaTitle', descriptionKey: 'sell.metaDescription' });
  });

  router.get('/login', (req, res) => {
    if (req.auth) return res.redirect(302, homeFor(req.auth.role));
    return render(req, res, 'login', {
      titleKey: 'auth.loginMetaTitle',
      noindex: true,
      boot: { next: safeNext(req.query.next, '') }
    });
  });

  router.get('/register', (req, res) => {
    if (req.auth) return res.redirect(302, homeFor(req.auth.role));
    return render(req, res, 'register', { titleKey: 'auth.registerMetaTitle', noindex: true });
  });

  router.get('/account', (req, res) => {
    if (!req.auth) return res.redirect(302, '/login?next=%2Faccount');
    if (req.auth.isStaff) return res.redirect(302, '/admin');
    if (req.auth.isSeller) return res.redirect(302, '/seller');
    return render(req, res, 'account', { titleKey: 'account.metaTitle', noindex: true });
  });

  router.get('/seller', (req, res) => {
    if (!req.auth) return res.redirect(302, '/login?next=%2Fseller');
    if (!req.auth.isSeller) return res.redirect(302, homeFor(req.auth.role));
    return render(req, res, 'seller', { titleKey: 'seller.metaTitle', layout: 'admin', noindex: true, boot: { app: 'seller' } });
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
    return render(req, res, 'admin', { titleKey: 'admin.metaTitle', layout: 'admin', noindex: true, boot: { app: 'admin' } });
  });

  return router;
}

module.exports = { createPagesRouter, createPageRenderer, safeNext };

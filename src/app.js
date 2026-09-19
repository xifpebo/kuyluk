'use strict';

const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const i18n = require('./i18n');
const { securityHeaders } = require('./security/headers');
const { cookieParser } = require('./security/cookies');
const { createCsrf } = require('./security/csrf');
const { createSessionManager } = require('./security/session');
const { createRateLimiter } = require('./security/rateLimit');
const { requestContext } = require('./middleware/requestContext');
const { locale } = require('./middleware/locale');
const { createErrorHandler, notFoundHandler } = require('./middleware/errors');
const { createEngine } = require('./views/engine');
const { createApiRouter } = require('./routes/api');
const { createPagesRouter, createPageRenderer } = require('./routes/pages');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;

function staticAssets() {
  return express.static(PUBLIC_DIR, {
    index: false,
    dotfiles: 'ignore',
    redirect: false,
    cacheControl: false,
    setHeaders(res) {
      const versioned = Boolean(res.req?.query?.v);
      res.setHeader('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
    }
  });
}

function uploadedFiles(config) {
  const serve = express.static(config.uploads.dir, {
    index: false,
    dotfiles: 'deny',
    redirect: false,
    fallthrough: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
  });
  return (req, res, next) => {
    if (!UPLOAD_EXTENSIONS.test(req.path) || req.path.includes('..')) return res.status(404).end();
    return serve(req, res, (error) => {
      if (error && error.status === 404) return res.status(404).end();
      return next(error);
    });
  };
}

function dictionaries(req, res) {
  const { scope, lang } = req.params;
  if (!['public', 'admin'].includes(scope) || !i18n.isSupported(lang)) return res.status(404).end();
  const bundle = i18n.clientBundle(lang, scope);
  const versioned = req.query.v === bundle.hash;
  res.setHeader('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('ETag', `"${bundle.hash}"`);
  if (req.get('if-none-match') === `"${bundle.hash}"`) return res.status(304).end();
  return res.type('application/json').send(bundle.json);
}

/**
 * Build the Express application. Pure factory: no network or DB connection
 * is opened here, which keeps it easy to test.
 */
function createApp({ config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.set('etag', 'strong');

  const sessions = createSessionManager(config);
  const csrf = createCsrf(config);
  const limiter = createRateLimiter(config);
  const engine = createEngine({ cache: !config.isDevelopment, assetRoot: PUBLIC_DIR });
  const renderer = createPageRenderer({ config, engine });
  app.locals.services = { sessions, csrf, limiter, engine };

  app.use(requestContext);
  app.use(securityHeaders(config));

  app.get('/healthz', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.setHeader('Cache-Control', 'no-store');
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded' });
  });

  app.use(staticAssets());
  app.use('/uploads', uploadedFiles(config));
  app.use(cookieParser);
  app.use(locale(config));
  app.get('/i18n/:scope/:lang.json', dictionaries);

  app.use(express.json({ limit: '200kb', strict: true, type: 'application/json' }));
  app.use(sessions.load);
  app.use('/api', csrf.protect, createApiRouter({ config, sessions, csrf, limiter }));
  app.use(createPagesRouter({ config, renderer }));
  app.use(notFoundHandler);
  app.use(createErrorHandler({ config, renderErrorPage: renderer.renderErrorPage }));
  return app;
}

module.exports = { createApp, PUBLIC_DIR };

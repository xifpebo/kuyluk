'use strict';

const { isSupported } = require('../i18n');

const LANG_COOKIE = 'sb_lang';

/**
 * Resolve the request language: ?lang= (also persisted) → X-Lang header →
 * sb_lang cookie → configured default (Uzbek).
 */
function locale(config) {
  return function localeMiddleware(req, res, next) {
    let lang = null;
    const fromQuery = typeof req.query?.lang === 'string' ? req.query.lang : null;
    if (fromQuery && isSupported(fromQuery)) {
      lang = fromQuery;
      if (req.cookies?.[LANG_COOKIE] !== fromQuery) {
        res.cookie(LANG_COOKIE, fromQuery, {
          httpOnly: false,
          secure: config.cookieSecure,
          sameSite: 'lax',
          path: '/',
          maxAge: 365 * 24 * 60 * 60 * 1000
        });
      }
    }
    if (!lang) {
      const header = req.get('x-lang');
      if (header && isSupported(header)) lang = header;
    }
    if (!lang && isSupported(req.cookies?.[LANG_COOKIE])) lang = req.cookies[LANG_COOKIE];
    req.lang = lang || config.defaultLang;
    res.locals.lang = req.lang;
    res.setHeader('Content-Language', req.lang);
    next();
  };
}

module.exports = { locale, LANG_COOKIE };

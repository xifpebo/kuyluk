'use strict';

const crypto = require('node:crypto');
const uz = require('./locales/uz.json');
const ru = require('./locales/ru.json');
const { LANGUAGES } = require('../domain/constants');

const DICTIONARIES = { uz, ru };
const INTL_LOCALES = { uz: 'uz-Latn-UZ', ru: 'ru-RU' };
/** Namespaces only the admin panel needs; kept out of the public bundle. */
const ADMIN_NAMESPACES = ['admin', 'audit'];

function isSupported(lang) {
  return LANGUAGES.includes(lang);
}

function otherLang(lang) {
  return lang === 'uz' ? 'ru' : 'uz';
}

function lookup(dict, key) {
  let node = dict;
  for (const part of String(key).split('.')) {
    if (node === null || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) {
      return undefined;
    }
    node = node[part];
  }
  return node;
}

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name])
  );
}

function t(lang, key, params) {
  const primary = isSupported(lang) ? lang : 'uz';
  let value = lookup(DICTIONARIES[primary], key);
  if (typeof value !== 'string') value = lookup(DICTIONARIES[otherLang(primary)], key);
  if (typeof value !== 'string') return key;
  return interpolate(value, params);
}

const pluralRules = {
  uz: new Intl.PluralRules('uz'),
  ru: new Intl.PluralRules('ru')
};

/** Plural-aware lookup: `key.one|few|many|other`. */
function tn(lang, key, count, params = {}) {
  const primary = isSupported(lang) ? lang : 'uz';
  const category = pluralRules[primary].select(Number(count));
  const forms = lookup(DICTIONARIES[primary], key);
  let template;
  if (forms && typeof forms === 'object') template = forms[category] ?? forms.other;
  if (typeof template !== 'string') return t(primary, `${key}.other`, { count, ...params });
  return interpolate(template, { count, ...params });
}

function formatNumber(lang, value, options) {
  return new Intl.NumberFormat(INTL_LOCALES[lang] || INTL_LOCALES.uz, options).format(Number(value) || 0);
}

function formatMoney(lang, value) {
  return `${formatNumber(lang, Math.round(Number(value) || 0))} ${t(lang, 'common.currency')}`;
}

/** Pick the requested translation of a `{ uz, ru }` field with fallback. */
function pick(lang, field) {
  if (!field || typeof field !== 'object') return typeof field === 'string' ? field : '';
  return field[lang] || field[otherLang(lang)] || '';
}

const bundleCache = new Map();

/** JSON dictionary served to the browser, with a content hash for caching. */
function clientBundle(lang, scope = 'public') {
  const cacheKey = `${lang}:${scope}`;
  if (!bundleCache.has(cacheKey)) {
    const source = DICTIONARIES[lang];
    const data = {};
    for (const [namespace, value] of Object.entries(source)) {
      if (scope !== 'admin' && ADMIN_NAMESPACES.includes(namespace)) continue;
      data[namespace] = value;
    }
    const json = JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 12);
    bundleCache.set(cacheKey, { json, hash });
  }
  return bundleCache.get(cacheKey);
}

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

function isPluralNode(value) {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.includes('other') && keys.every((key) => PLURAL_CATEGORIES.has(key));
}

/** Every key present in one dictionary must exist in the other (plural forms count as one key). */
function missingKeys() {
  const collect = (node, prefix, out) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !isPluralNode(value)) collect(value, path, out);
      else out.add(path);
    }
    return out;
  };
  const uzKeys = collect(uz, '', new Set());
  const ruKeys = collect(ru, '', new Set());
  return {
    missingInRu: [...uzKeys].filter((key) => !ruKeys.has(key)),
    missingInUz: [...ruKeys].filter((key) => !uzKeys.has(key))
  };
}

module.exports = {
  LANGUAGES,
  INTL_LOCALES,
  isSupported,
  otherLang,
  t,
  tn,
  formatNumber,
  formatMoney,
  pick,
  clientBundle,
  missingKeys,
  lookup: (lang, key) => lookup(DICTIONARIES[lang], key)
};

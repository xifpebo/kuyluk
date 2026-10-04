'use strict';

const crypto = require('node:crypto');
const uz = require('./locales/uz.json');
const ru = require('./locales/ru.json');
const { LANGUAGES } = require('../domain/constants');

const BASE = { uz, ru };
/** Effective dictionaries = shipped JSON + admin overrides (see setOverrides). */
let DICTIONARIES = { uz, ru };
let overrideMap = new Map();
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setPath(target, key, value) {
  const parts = key.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') return false;
    node = node[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (typeof node[last] !== 'string') return false;
  node[last] = value;
  return true;
}

/**
 * Apply admin overrides: rows of { key, uz, ru }. Only existing string keys
 * can be overridden; empty values fall back to the shipped text.
 */
function setOverrides(rows = []) {
  const next = { uz: deepClone(BASE.uz), ru: deepClone(BASE.ru) };
  const map = new Map();
  for (const row of rows) {
    for (const lang of LANGUAGES) {
      const value = typeof row[lang] === 'string' ? row[lang].trim() : '';
      if (value && setPath(next[lang], row.key, value)) map.set(`${lang}:${row.key}`, value);
    }
  }
  DICTIONARIES = next;
  overrideMap = map;
  bundleCache.clear();
}

/** Flat list of every overridable key with its shipped and effective text. */
function flatKeys(scope = 'all') {
  const out = [];
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        out.push({
          key: path,
          base: { uz: lookup(BASE.uz, path) ?? '', ru: lookup(BASE.ru, path) ?? '' },
          override: { uz: overrideMap.get(`uz:${path}`) || '', ru: overrideMap.get(`ru:${path}`) || '' }
        });
      } else if (value && typeof value === 'object') {
        walk(value, path);
      }
    }
  };
  walk(BASE.uz, '');
  return scope === 'all' ? out : out.filter((row) => row.key.startsWith(`${scope}.`));
}

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
  const uzKeys = collect(BASE.uz, '', new Set());
  const ruKeys = collect(BASE.ru, '', new Set());
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
  setOverrides,
  flatKeys,
  isOverridableKey: (key) => typeof lookup(BASE.uz, key) === 'string' && typeof lookup(BASE.ru, key) === 'string',
  lookup: (lang, key) => lookup(DICTIONARIES[lang], key)
};

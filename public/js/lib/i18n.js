/**
 * Client-side translations. Static page text is rendered by the server;
 * this module translates dynamic content with the same dictionaries.
 */
import { readBoot } from './dom.js';

const boot = readBoot();

export const lang = document.documentElement.lang === 'ru' ? 'ru' : 'uz';
export const otherLang = lang === 'uz' ? 'ru' : 'uz';
const locale = lang === 'ru' ? 'ru-RU' : 'uz-Latn-UZ';

let dictionary = {};

export async function loadDictionary(url = boot.i18nUrl) {
  if (!url) return;
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Dictionary request failed (${response.status})`);
  dictionary = await response.json();
}

function lookup(key) {
  let node = dictionary;
  for (const part of String(key).split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name])
  );
}

export function t(key, params = {}) {
  const value = lookup(key);
  return typeof value === 'string' ? fill(value, params) : key;
}

/** True when a translation exists. */
export function has(key) {
  return typeof lookup(key) === 'string';
}

/**
 * Translate an entry whose own name contains dots, e.g. the audit action
 * `auth.login` stored under `audit.actions`. Falls back to the raw name.
 */
export function tIn(base, name, params = {}) {
  const node = lookup(base);
  const value = node && typeof node === 'object' ? node[name] : undefined;
  return typeof value === 'string' ? fill(value, params) : name;
}

/** Own keys of a dictionary object (e.g. every known audit action). */
export function keysOf(base) {
  const node = lookup(base);
  return node && typeof node === 'object' ? Object.keys(node) : [];
}

const pluralRules = new Intl.PluralRules(lang);

/**
 * Some browsers ship without Uzbek CLDR data and silently fall back to
 * English patterns ("Sep", "-7 h", "1,000"). Detect that and use the
 * conventions used in Uzbekistan instead (space grouping, dd.mm.yyyy).
 */
function hasLocaleData() {
  if (lang !== 'uz') return true;
  try {
    const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2020, 0, 15));
    return /yanvar/i.test(month);
  } catch {
    return false;
  }
}

const nativeData = hasLocaleData();
const numberLocale = nativeData ? locale : 'ru-RU';
const numberFormat = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 3 });
const moneyFormat = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 });
const dateOptions = nativeData ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric' };
const dateFormat = new Intl.DateTimeFormat(nativeData ? locale : 'ru-RU', dateOptions);
const dateTimeFormat = new Intl.DateTimeFormat(nativeData ? locale : 'ru-RU', {
  ...dateOptions,
  hour: '2-digit',
  minute: '2-digit'
});

export function fmtNumber(value) {
  return numberFormat.format(Number(value) || 0);
}

export function tn(key, count, params = {}) {
  const forms = lookup(key);
  if (!forms || typeof forms !== 'object') return key;
  const template = forms[pluralRules.select(Number(count))] ?? forms.other;
  return typeof template === 'string' ? fill(template, { ...params, count: fmtNumber(count) }) : key;
}

export function fmtMoney(value) {
  return `${moneyFormat.format(Math.round(Number(value) || 0))} ${t('common.currency')}`;
}

export function fmtDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

export function fmtDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date);
}

let relativeFormat = null;
try {
  if (nativeData) relativeFormat = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
} catch {
  relativeFormat = null;
}

const UZ_UNITS = { second: 'soniya', minute: 'daqiqa', hour: 'soat', day: 'kun', week: 'hafta', month: 'oy', year: 'yil' };

function uzRelative(amount, unit) {
  if (unit === 'second' && Math.abs(amount) < 45) return 'hozirgina';
  if (unit === 'day' && amount === -1) return 'kecha';
  if (unit === 'day' && amount === 1) return 'ertaga';
  const n = Math.abs(amount);
  return amount < 0 ? `${n} ${UZ_UNITS[unit]} oldin` : `${n} ${UZ_UNITS[unit]}dan soʻng`;
}

const RELATIVE_STEPS = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity]
];

/** "5 min ago" style label; falls back to an absolute date. */
export function fmtRelative(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (!relativeFormat && lang !== 'uz') return dateTimeFormat.format(date);
  let amount = (date.getTime() - Date.now()) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(amount) < size) {
      const rounded = Math.round(amount);
      return relativeFormat ? relativeFormat.format(rounded, unit) : uzRelative(rounded, unit);
    }
    amount /= size;
  }
  return dateFormat.format(date);
}

/** Pick the current-language value of a `{ uz, ru }` field (with fallback). */
export function loc(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field[otherLang] || '';
}

export function unitShort(unit) {
  return t(`units.${unit}.short`);
}

export function unitName(unit) {
  return t(`units.${unit}.name`);
}

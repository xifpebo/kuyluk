'use strict';

const crypto = require('node:crypto');

// C0 control characters except TAB (\x09) and LF (\x0A); CR is normalised separately.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
// Zero-width characters and bidi overrides (used in "trojan source" / spoofing attacks).
const INVISIBLE_CHARS = /[\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FEFF}]/gu;
const HTML_COMMENT = /<!--[\s\S]*?(-->|$)/g;
const HTML_TAG = /<\/?[A-Za-z][^<>]*>?/g;
const TAG_OPENERS = /<(?=[A-Za-z!/?])/g;

/**
 * Normalise untrusted text and remove markup.
 *
 * Output encoding in the browser is still the primary XSS defence; this is
 * defence in depth so stored data never contains HTML. A lone "<" that
 * cannot start a tag (e.g. "t < 5°C") is preserved.
 */
function cleanText(value, { multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  let text = String(value).normalize('NFC');
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '');
  let previous;
  do {
    previous = text;
    text = text.replace(HTML_COMMENT, '').replace(HTML_TAG, '');
  } while (text !== previous);
  text = text.replace(TAG_OPENERS, '');
  if (multiline) {
    text = text
      .split('\n')
      .map((line) => line.replace(/[\t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\s+/g, ' ');
  }
  return text.trim();
}

const APOSTROPHES = /['`\u{00B4}\u{2018}\u{2019}\u{02B9}\u{02BB}\u{02BC}\u{02BD}]/gu;

/**
 * Lower-case and drop Uzbek apostrophes (oʻ / o' / o‘ → o), ё→е, × → x, so
 * "gʻisht", "g'isht" and "gisht" all match the same product.
 */
function normalizeForSearch(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/ё/g, 'е')
    .replace(/[×*]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split a search query into at most `max` escaped tokens. */
function searchTokens(query, max = 6) {
  return normalizeForSearch(query)
    .split(' ')
    .filter((token) => token.length > 0)
    .slice(0, max)
    .map(escapeRegex);
}

const CYRILLIC_MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h'
};

function slugify(value, { maxLength = 80 } = {}) {
  const base = cleanText(value)
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/[а-яёўқғҳ]/g, (ch) => CYRILLIC_MAP[ch] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return base || 'item';
}

function randomSuffix(length = 4) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function truncate(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

module.exports = {
  cleanText,
  normalizeForSearch,
  escapeRegex,
  searchTokens,
  slugify,
  randomSuffix,
  truncate
};

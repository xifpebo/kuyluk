'use strict';

/**
 * Small declarative validator (no external dependency).
 *
 * Every schema returns a *new* sanitised value built only from declared
 * fields, which prevents mass-assignment and prototype pollution. Issues are
 * reported as `{ path, code, params }` and translated by the i18n layer
 * (`validation.<code>`), so API clients get localised field messages.
 */
const { cleanText } = require('./text');
const { validationFailed } = require('./errors');

const INVALID = Symbol('invalid');
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class Schema {
  constructor(kind, check) {
    this.kind = kind;
    this.check = check;
    this.isOptional = false;
    this.isNullable = false;
    this.defaultValue = undefined;
    this.refinements = [];
    this.transforms = [];
  }

  with(patch) {
    return Object.assign(Object.create(Schema.prototype), this, patch);
  }

  optional() {
    return this.with({ isOptional: true });
  }

  nullable() {
    return this.with({ isNullable: true, isOptional: true });
  }

  default(value) {
    return this.with({ isOptional: true, defaultValue: value });
  }

  /** Accept an explicit empty string (e.g. to clear a text field in an update). */
  allowEmpty() {
    return this.with({ acceptsEmpty: true, isOptional: true });
  }

  /** `fn(value)` returns true, or an issue code string / `{ code, params }`. */
  refine(fn) {
    return this.with({ refinements: [...this.refinements, fn] });
  }

  transform(fn) {
    return this.with({ transforms: [...this.transforms, fn] });
  }

  emptyResult(path, issues) {
    if (this.isOptional) {
      return typeof this.defaultValue === 'function' ? this.defaultValue() : this.defaultValue;
    }
    issues.push({ path, code: 'required', params: {} });
    return INVALID;
  }

  run(input, path, issues) {
    if (input === null && this.isNullable) return null;
    if (input === '' && this.acceptsEmpty) return '';
    if (input === undefined || input === null || input === '') return this.emptyResult(path, issues);
    const ctx = { path, issues, empty: false };
    let value = this.check(input, ctx);
    if (value === INVALID) return INVALID;
    if (ctx.empty) return this.acceptsEmpty ? '' : this.emptyResult(path, issues);
    for (const fn of this.transforms) value = fn(value);
    for (const fn of this.refinements) {
      const result = fn(value);
      if (result === true || result === undefined) continue;
      const issue = typeof result === 'string' ? { code: result, params: {} } : result;
      const issuePath = issue.path ? (path ? `${path}.${issue.path}` : issue.path) : path;
      issues.push({ path: issuePath, code: issue.code, params: issue.params || {} });
      return INVALID;
    }
    return value;
  }
}

function fail(ctx, code, params = {}) {
  ctx.issues.push({ path: ctx.path, code, params });
  return INVALID;
}

function codePointLength(value) {
  let n = 0;
  for (const _ of value) n += 1; // eslint-disable-line no-unused-vars
  return n;
}

function string({
  min = 0,
  max = 500,
  pattern,
  patternCode = 'invalid_format',
  multiline = false,
  clean = true,
  lower = false,
  upper = false,
  coerce = false
} = {}) {
  return new Schema('string', (input, ctx) => {
    let raw = input;
    if (typeof raw !== 'string') {
      if (coerce && (typeof raw === 'number' || typeof raw === 'boolean')) raw = String(raw);
      else return fail(ctx, 'invalid_type', { expected: 'string' });
    }
    if (raw.length > max * 4 + 256) return fail(ctx, 'too_long', { max });
    let value = clean ? cleanText(raw, { multiline }) : raw.trim();
    if (lower) value = value.toLowerCase();
    if (upper) value = value.toUpperCase();
    if (value.length === 0) {
      ctx.empty = true;
      return value;
    }
    const length = codePointLength(value);
    if (length < min) return fail(ctx, 'too_short', { min });
    if (length > max) return fail(ctx, 'too_long', { max });
    if (pattern && !pattern.test(value)) return fail(ctx, patternCode);
    return value;
  });
}

const NUMERIC = /^-?\d{1,15}(?:[.,]\d{1,6})?$/;

function number({ min, max, integer = false, coerce = false } = {}) {
  return new Schema('number', (input, ctx) => {
    let value = input;
    if (typeof value === 'string' && coerce) {
      const trimmed = value.trim().replace(/\s+/g, '');
      if (!NUMERIC.test(trimmed)) return fail(ctx, 'invalid_number');
      value = Number(trimmed.replace(',', '.'));
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail(ctx, 'invalid_number');
    if (integer && !Number.isInteger(value)) return fail(ctx, 'not_integer');
    if (min !== undefined && value < min) return fail(ctx, 'too_small', { min });
    if (max !== undefined && value > max) return fail(ctx, 'too_big', { max });
    return value;
  });
}

const TRUE_VALUES = new Set(['true', '1', 'on', 'yes']);
const FALSE_VALUES = new Set(['false', '0', 'off', 'no']);

function boolean({ coerce = false } = {}) {
  return new Schema('boolean', (input, ctx) => {
    if (typeof input === 'boolean') return input;
    if (coerce && (typeof input === 'string' || typeof input === 'number')) {
      const text = String(input).trim().toLowerCase();
      if (TRUE_VALUES.has(text)) return true;
      if (FALSE_VALUES.has(text)) return false;
    }
    return fail(ctx, 'invalid_type', { expected: 'boolean' });
  });
}

function enumeration(values) {
  const allowed = new Set(values);
  return new Schema('enum', (input, ctx) => {
    if (typeof input !== 'string' || !allowed.has(input)) return fail(ctx, 'invalid_choice');
    return input;
  });
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function objectId() {
  return new Schema('objectId', (input, ctx) => {
    if (typeof input !== 'string' || !OBJECT_ID.test(input)) return fail(ctx, 'invalid_id');
    return input.toLowerCase();
  });
}

function canonical(value) {
  return JSON.stringify(value);
}

function array(item, { min = 0, max = 100, unique = false, csv = false } = {}) {
  return new Schema('array', (input, ctx) => {
    let list = input;
    if (csv && typeof list === 'string') {
      list = list
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(list)) return fail(ctx, 'invalid_type', { expected: 'array' });
    if (list.length > max) return fail(ctx, 'too_many_items', { max });
    const out = [];
    let invalid = false;
    list.forEach((element, index) => {
      const value = item.run(element, ctx.path ? `${ctx.path}.${index}` : String(index), ctx.issues);
      if (value === INVALID) invalid = true;
      else if (value !== undefined) out.push(value);
    });
    if (invalid) return INVALID;
    if (out.length < min) return fail(ctx, min === 1 ? 'required' : 'too_few_items', { min });
    if (unique && new Set(out.map(canonical)).size !== out.length) return fail(ctx, 'duplicate_items');
    return out;
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function object(shape, { unknown = 'strip' } = {}) {
  const keys = Object.keys(shape);
  const schema = new Schema('object', (input, ctx) => {
    if (!isPlainObject(input)) return fail(ctx, 'invalid_type', { expected: 'object' });
    let invalid = false;
    for (const key of Object.keys(input)) {
      const childPath = ctx.path ? `${ctx.path}.${key}` : key;
      if (FORBIDDEN_KEYS.has(key) || key.startsWith('$') || key.includes('.') || key.includes('\0')) {
        ctx.issues.push({ path: childPath, code: 'forbidden_field', params: {} });
        invalid = true;
      } else if (unknown === 'reject' && !Object.prototype.hasOwnProperty.call(shape, key)) {
        ctx.issues.push({ path: childPath, code: 'unknown_field', params: {} });
        invalid = true;
      }
    }
    const out = {};
    for (const key of keys) {
      const childPath = ctx.path ? `${ctx.path}.${key}` : key;
      const raw = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined;
      const value = shape[key].run(raw, childPath, ctx.issues);
      if (value === INVALID) invalid = true;
      else if (value !== undefined) out[key] = value;
    }
    return invalid ? INVALID : out;
  });
  schema.shape = shape;
  return schema;
}

/**
 * Bilingual text `{ uz, ru }`. `required: 'both' | 'any' | 'none'`.
 * Missing optional translations are stored as empty strings.
 */
function localized({ min = 1, max = 200, multiline = false, required = 'both' } = {}) {
  const part = string({ min, max, multiline });
  const inner = object({
    uz: required === 'both' ? part : part.default(''),
    ru: required === 'both' ? part : part.default('')
  });
  return new Schema('localized', (input, ctx) => {
    const value = inner.run(input, ctx.path, ctx.issues);
    if (value === INVALID) return INVALID;
    if (required === 'any' && !value.uz && !value.ru) {
      ctx.issues.push({ path: `${ctx.path}.uz`, code: 'required', params: {} });
      return INVALID;
    }
    return { uz: value.uz || '', ru: value.ru || '' };
  });
}

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

function email() {
  return string({ max: 254, lower: true, clean: false }).refine((value) => (EMAIL.test(value) ? true : 'invalid_email'));
}

function phone() {
  return new Schema('phone', (input, ctx) => {
    if (typeof input !== 'string' && typeof input !== 'number') return fail(ctx, 'invalid_phone');
    const raw = String(input).trim();
    if (!raw) {
      ctx.empty = true;
      return raw;
    }
    if (!/^\+?[\d\s()-]{7,25}$/.test(raw)) return fail(ctx, 'invalid_phone');
    const digits = raw.replace(/\D/g, '');
    let normalized;
    if (digits.length === 9) normalized = `+998${digits}`;
    else if (digits.length === 12 && digits.startsWith('998')) normalized = `+${digits}`;
    else if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) normalized = `+${digits}`;
    else return fail(ctx, 'invalid_phone');
    return normalized;
  });
}

const RELATIVE_URL = /^\/(?!\/)[A-Za-z0-9._~\-/%]*$/;

function url({ allowRelative = true, max = 1000 } = {}) {
  return new Schema('url', (input, ctx) => {
    if (typeof input !== 'string') return fail(ctx, 'invalid_url');
    const value = input.trim();
    if (!value) {
      ctx.empty = true;
      return value;
    }
    if (value.length > max || /[\s<>"'`\\]/.test(value)) return fail(ctx, 'invalid_url');
    if (value.startsWith('/')) {
      if (allowRelative && RELATIVE_URL.test(value) && !value.includes('..')) return value;
      return fail(ctx, 'invalid_url');
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return fail(ctx, 'invalid_url');
    }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return fail(ctx, 'invalid_url');
    }
    return parsed.href;
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function date({ min, max } = {}) {
  return new Schema('date', (input, ctx) => {
    let value;
    if (input instanceof Date) value = input;
    else if (typeof input === 'string' && ISO_DATE.test(input.trim())) value = new Date(input.trim());
    else return fail(ctx, 'invalid_date');
    if (Number.isNaN(value.getTime())) return fail(ctx, 'invalid_date');
    const minValue = typeof min === 'function' ? min() : min;
    const maxValue = typeof max === 'function' ? max() : max;
    if (minValue && value < minValue) return fail(ctx, 'date_too_early');
    if (maxValue && value > maxValue) return fail(ctx, 'date_too_late');
    return value;
  });
}

function telegram() {
  return string({ max: 40, clean: false })
    .transform((value) => value.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, ''))
    .refine((value) => (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value) ? true : 'invalid_telegram'));
}

function slug() {
  return string({ max: 100, lower: true, clean: false }).refine((value) =>
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? true : 'invalid_slug'
  );
}

function password() {
  // Never cleaned or trimmed: the exact characters matter.
  return new Schema('password', (input, ctx) => {
    if (typeof input !== 'string') return fail(ctx, 'invalid_type', { expected: 'string' });
    if (input.length > 256) return fail(ctx, 'too_long', { max: 128 });
    return input;
  });
}

function validate(schema, input) {
  const issues = [];
  const value = schema.run(input, '', issues);
  return { ok: value !== INVALID && issues.length === 0, value, issues };
}

function issuesToFields(issues) {
  const fields = {};
  for (const issue of issues) {
    const key = issue.path || '_';
    if (!fields[key]) fields[key] = { code: issue.code, params: issue.params || {} };
  }
  return fields;
}

function parse(schema, input) {
  const result = validate(schema, input);
  if (!result.ok) throw validationFailed(issuesToFields(result.issues));
  return result.value;
}

/** Express middleware: validates req.body / req.query / req.params into req.valid. */
function validateRequest(schemas) {
  return function validationMiddleware(req, res, next) {
    const issues = [];
    const valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const input = req[part] === undefined ? {} : req[part];
      const value = schemas[part].run(input, '', issues);
      if (value !== INVALID) valid[part] = value;
    }
    if (issues.length) return next(validationFailed(issuesToFields(issues)));
    req.valid = valid;
    return next();
  };
}

const s = {
  string,
  number,
  boolean,
  enum: enumeration,
  objectId,
  array,
  object,
  localized,
  email,
  phone,
  url,
  date,
  telegram,
  slug,
  password
};

module.exports = { s, Schema, INVALID, validate, parse, validateRequest, issuesToFields };

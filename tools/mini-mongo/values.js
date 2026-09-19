'use strict';

/**
 * Value helpers for MiniMongo: cloning, dotted-path access and BSON ordering.
 */
const BSON = require('bson');

const { EJSON } = BSON;

const DESERIALIZE_OPTIONS = Object.freeze({
  promoteLongs: true,
  promoteValues: true,
  promoteBuffers: false,
  bsonRegExp: false
});

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isOperatorObject(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys[0].startsWith('$');
}

function clone(value) {
  if (value === undefined) return undefined;
  const bytes = BSON.serialize({ v: value }, { ignoreUndefined: true });
  return BSON.deserialize(bytes, DESERIALIZE_OPTIONS).v;
}

function isNumeric(segment) {
  return /^\d+$/.test(segment);
}

/**
 * Resolve a dotted path. When an intermediate value is an array and the next
 * segment is not an index, the lookup fans out over the array elements
 * (MongoDB "multikey" semantics). Returns undefined for missing values.
 */
function getPath(doc, path) {
  const segments = Array.isArray(path) ? path : String(path).split('.');
  let current = doc;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      if (isNumeric(segment)) {
        current = current[Number(segment)];
        continue;
      }
      const rest = segments.slice(i);
      const values = [];
      for (const item of current) {
        const v = getPath(item, rest);
        if (v === undefined) continue;
        if (Array.isArray(v)) values.push(...v);
        else values.push(v);
      }
      return values.length ? values : undefined;
    }
    if (typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

function setPath(doc, path, value) {
  const segments = String(path).split('.');
  let current = doc;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const nextIsIndex = isNumeric(segments[i + 1]);
    let next = Array.isArray(current) ? current[Number(segment)] : current[segment];
    if (next === null || next === undefined || typeof next !== 'object') {
      next = nextIsIndex ? [] : {};
      if (Array.isArray(current)) current[Number(segment)] = next;
      else current[segment] = next;
    }
    current = next;
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(current) && isNumeric(last)) {
    const index = Number(last);
    while (current.length < index) current.push(null);
    current[index] = value;
  } else {
    current[last] = value;
  }
}

function unsetPath(doc, path) {
  const segments = String(path).split('.');
  let current = doc;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (current === null || current === undefined || typeof current !== 'object') return;
    current = Array.isArray(current) ? current[Number(segments[i])] : current[segments[i]];
  }
  if (current === null || current === undefined || typeof current !== 'object') return;
  const last = segments[segments.length - 1];
  if (Array.isArray(current) && isNumeric(last)) {
    current[Number(last)] = null;
  } else {
    delete current[last];
  }
}

/** Direct (non fan-out) lookup used by update operators. */
function getOwnPath(doc, path) {
  const segments = String(path).split('.');
  let current = doc;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = Array.isArray(current) ? current[Number(segment)] : current[segment];
  }
  return current;
}

function bsonType(value) {
  return value && typeof value === 'object' ? value._bsontype : undefined;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const type = bsonType(value);
  if (type === 'Long') return value.toNumber();
  if (type === 'Double' || type === 'Int32') return value.valueOf();
  if (type === 'Decimal128') return Number(value.toString());
  return Number(value);
}

function typeRank(value) {
  if (value === undefined || value === null) return 1;
  if (typeof value === 'number' || typeof value === 'bigint') return 2;
  const type = bsonType(value);
  if (type === 'MinKey') return 0;
  if (type === 'MaxKey') return 13;
  if (type === 'Long' || type === 'Double' || type === 'Int32' || type === 'Decimal128') return 2;
  if (typeof value === 'string' || type === 'BSONSymbol') return 3;
  if (Array.isArray(value)) return 5;
  if (type === 'Binary' || Buffer.isBuffer(value)) return 6;
  if (type === 'ObjectId') return 7;
  if (typeof value === 'boolean') return 8;
  if (value instanceof Date) return 9;
  if (type === 'Timestamp') return 10;
  if (value instanceof RegExp || type === 'BSONRegExp') return 11;
  if (typeof value === 'object') return 4;
  return 12;
}

function sign(n) {
  if (n < 0) return -1;
  if (n > 0) return 1;
  return 0;
}

function compareValues(a, b) {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return sign(ra - rb);
  switch (ra) {
    case 0:
    case 1:
    case 13:
      return 0;
    case 2:
      return sign(toNumber(a) - toNumber(b));
    case 3: {
      const sa = String(a);
      const sb = String(b);
      if (sa < sb) return -1;
      if (sa > sb) return 1;
      return 0;
    }
    case 4: {
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      for (let i = 0; i < Math.min(ka.length, kb.length); i += 1) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        const c = compareValues(a[ka[i]], b[kb[i]]);
        if (c !== 0) return c;
      }
      return sign(ka.length - kb.length);
    }
    case 5: {
      for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
        const c = compareValues(a[i], b[i]);
        if (c !== 0) return c;
      }
      return sign(a.length - b.length);
    }
    case 6: {
      const ba = Buffer.isBuffer(a) ? a : Buffer.from(a.buffer);
      const bb = Buffer.isBuffer(b) ? b : Buffer.from(b.buffer);
      return sign(Buffer.compare(ba, bb));
    }
    case 7: {
      const ha = a.toHexString();
      const hb = b.toHexString();
      if (ha < hb) return -1;
      if (ha > hb) return 1;
      return 0;
    }
    case 8:
      return sign(Number(a) - Number(b));
    case 9:
      return sign(a.getTime() - b.getTime());
    case 10:
      return a.compare(b);
    default:
      return 0;
  }
}

function canonicalKey(value) {
  if (value === undefined) return 'null';
  if (typeof value === 'number') return `n:${value}`;
  if (typeof value === 'bigint') return `n:${Number(value)}`;
  const type = bsonType(value);
  if (type === 'Long' || type === 'Double' || type === 'Int32') return `n:${toNumber(value)}`;
  return EJSON.stringify({ v: value === null ? null : value }, { relaxed: false });
}

function valuesEqual(a, b) {
  return canonicalKey(a) === canonicalKey(b);
}

module.exports = {
  DESERIALIZE_OPTIONS,
  isPlainObject,
  isOperatorObject,
  clone,
  getPath,
  getOwnPath,
  setPath,
  unsetPath,
  toNumber,
  compareValues,
  canonicalKey,
  valuesEqual
};

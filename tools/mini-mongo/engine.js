'use strict';

/**
 * Query, projection, update and aggregation engine for MiniMongo.
 * Query matching is delegated to `sift` (already a Mongoose dependency).
 */
const sift = require('sift');
const { ObjectId } = require('bson');
const {
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
} = require('./values');

class CommandError extends Error {
  constructor(code, codeName, message, extra = {}) {
    super(message);
    this.code = code;
    this.codeName = codeName;
    this.extra = extra;
  }
}

const UNSUPPORTED_QUERY_OPERATORS = new Set(['$where', '$expr', '$text', '$jsonSchema', '$function', '$accumulator']);

function assertSupportedQuery(value) {
  if (Array.isArray(value)) {
    value.forEach(assertSupportedQuery);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (UNSUPPORTED_QUERY_OPERATORS.has(key)) {
      throw new CommandError(2, 'BadValue', `MiniMongo does not support ${key}`);
    }
    assertSupportedQuery(value[key]);
  }
}

function compileFilter(filter) {
  if (!filter || (isPlainObject(filter) && Object.keys(filter).length === 0)) return () => true;
  assertSupportedQuery(filter);
  try {
    return sift.default(filter);
  } catch (error) {
    throw new CommandError(2, 'BadValue', error.message);
  }
}

/* ------------------------------------------------------------------ sort */

function sortKeyValue(doc, path, direction) {
  const value = getPath(doc, path);
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value.reduce((best, item) => {
      const c = compareValues(item, best);
      return (direction > 0 ? c < 0 : c > 0) ? item : best;
    });
  }
  return value;
}

function sortDocuments(docs, sortSpec) {
  if (!sortSpec || Object.keys(sortSpec).length === 0) return docs;
  const keys = Object.entries(sortSpec).map(([path, dir]) => {
    if (isPlainObject(dir)) {
      throw new CommandError(2, 'BadValue', 'MiniMongo does not support $meta sorting');
    }
    return [path, toNumber(dir) < 0 ? -1 : 1];
  });
  return docs
    .map((doc, index) => ({ doc, index }))
    .sort((a, b) => {
      for (const [path, dir] of keys) {
        const c = compareValues(sortKeyValue(a.doc, path, dir), sortKeyValue(b.doc, path, dir));
        if (c !== 0) return c * dir;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.doc);
}

/* ------------------------------------------------------------ projection */

function isInclusionValue(value) {
  if (isPlainObject(value)) return true;
  if (typeof value === 'boolean') return value;
  return toNumber(value) !== 0;
}

function includePath(src, dst, segments) {
  if (src === null || src === undefined || typeof src !== 'object') return;
  const [head, ...rest] = segments;
  if (Array.isArray(src)) return;
  if (!(head in src)) return;
  const value = src[head];
  if (rest.length === 0) {
    dst[head] = clone(value);
    return;
  }
  if (Array.isArray(value)) {
    const existing = Array.isArray(dst[head]) ? dst[head] : [];
    const out = value.map((item, i) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
      const target = isPlainObject(existing[i]) ? existing[i] : {};
      includePath(item, target, rest);
      return target;
    });
    dst[head] = out.filter((item) => item !== undefined);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (!isPlainObject(dst[head])) dst[head] = {};
  includePath(value, dst[head], rest);
}

function applyProjection(doc, projection) {
  if (!projection || Object.keys(projection).length === 0) return doc;
  const entries = Object.entries(projection);
  const inclusion = entries.some(([key, value]) => key !== '_id' && isInclusionValue(value));
  if (inclusion) {
    const out = {};
    const excludeId = '_id' in projection && !isInclusionValue(projection._id);
    if (!excludeId && doc._id !== undefined) out._id = doc._id;
    for (const [key, value] of entries) {
      if (key === '_id' || !isInclusionValue(value)) continue;
      if (isPlainObject(value) && ('$meta' in value)) continue;
      includePath(doc, out, key.split('.'));
    }
    return out;
  }
  const out = clone(doc);
  for (const [key, value] of entries) {
    if (!isInclusionValue(value)) unsetPath(out, key);
  }
  return out;
}

/* ---------------------------------------------------------------- update */

function isUpdateOperatorDocument(update) {
  return isPlainObject(update) && Object.keys(update).some((key) => key.startsWith('$'));
}

function assertNotId(path) {
  if (path === '_id' || path.startsWith('_id.')) {
    throw new CommandError(66, 'ImmutableField', "Performing an update on the path '_id' would modify the immutable field '_id'");
  }
}

function eachModifier(value) {
  if (isPlainObject(value) && Array.isArray(value.$each)) return value;
  return { $each: [value] };
}

function applyUpdate(doc, update, { isInsert = false } = {}) {
  if (Array.isArray(update)) {
    throw new CommandError(2, 'BadValue', 'MiniMongo does not support pipeline updates');
  }
  if (!isUpdateOperatorDocument(update)) {
    const replacement = clone(update);
    const id = doc._id;
    for (const key of Object.keys(doc)) delete doc[key];
    if (id !== undefined) doc._id = id;
    if (replacement._id !== undefined && id !== undefined && !valuesEqual(replacement._id, id)) {
      throw new CommandError(66, 'ImmutableField', "After applying the update, the (immutable) field '_id' was found to have been altered");
    }
    delete replacement._id;
    Object.assign(doc, replacement);
    return;
  }
  for (const [operator, fields] of Object.entries(update)) {
    if (!isPlainObject(fields)) {
      throw new CommandError(9, 'FailedToParse', `Modifiers operate on fields but we found type ${typeof fields} instead`);
    }
    for (const [path, rawValue] of Object.entries(fields)) {
      const value = clone(rawValue);
      switch (operator) {
        case '$set':
          if (path === '_id' || path.startsWith('_id.')) {
            if (!valuesEqual(getOwnPath(doc, path), value) && !isInsert) assertNotId(path);
          }
          setPath(doc, path, value);
          break;
        case '$setOnInsert':
          if (isInsert) setPath(doc, path, value);
          break;
        case '$unset':
          assertNotId(path);
          unsetPath(doc, path);
          break;
        case '$inc': {
          const current = getOwnPath(doc, path);
          setPath(doc, path, (current === undefined || current === null ? 0 : toNumber(current)) + toNumber(value));
          break;
        }
        case '$mul': {
          const current = getOwnPath(doc, path);
          setPath(doc, path, (current === undefined || current === null ? 0 : toNumber(current)) * toNumber(value));
          break;
        }
        case '$min': {
          const current = getOwnPath(doc, path);
          if (current === undefined || compareValues(value, current) < 0) setPath(doc, path, value);
          break;
        }
        case '$max': {
          const current = getOwnPath(doc, path);
          if (current === undefined || compareValues(value, current) > 0) setPath(doc, path, value);
          break;
        }
        case '$currentDate':
          setPath(doc, path, new Date());
          break;
        case '$rename': {
          const current = getOwnPath(doc, path);
          if (current !== undefined) {
            unsetPath(doc, path);
            setPath(doc, String(rawValue), current);
          }
          break;
        }
        case '$push': {
          let arr = getOwnPath(doc, path);
          if (arr === undefined || arr === null) {
            arr = [];
            setPath(doc, path, arr);
          }
          if (!Array.isArray(arr)) throw new CommandError(2, 'BadValue', `The field '${path}' must be an array`);
          const mod = eachModifier(value);
          const items = mod.$each;
          if (typeof mod.$position === 'number') arr.splice(mod.$position, 0, ...items);
          else arr.push(...items);
          if (isPlainObject(mod.$sort) || typeof mod.$sort === 'number') {
            const sorted = typeof mod.$sort === 'number'
              ? [...arr].sort((a, b) => compareValues(a, b) * mod.$sort)
              : sortDocuments(arr, mod.$sort);
            arr.splice(0, arr.length, ...sorted);
          }
          if (typeof mod.$slice === 'number') {
            const sliced = mod.$slice >= 0 ? arr.slice(0, mod.$slice) : arr.slice(mod.$slice);
            arr.splice(0, arr.length, ...sliced);
          }
          break;
        }
        case '$addToSet': {
          let arr = getOwnPath(doc, path);
          if (arr === undefined || arr === null) {
            arr = [];
            setPath(doc, path, arr);
          }
          if (!Array.isArray(arr)) throw new CommandError(2, 'BadValue', `The field '${path}' must be an array`);
          for (const item of eachModifier(value).$each) {
            if (!arr.some((existing) => valuesEqual(existing, item))) arr.push(item);
          }
          break;
        }
        case '$pull': {
          const arr = getOwnPath(doc, path);
          if (!Array.isArray(arr)) break;
          let test;
          if (isPlainObject(value)) {
            const keys = Object.keys(value);
            const isOperator = keys.length > 0 && keys.every((k) => k.startsWith('$'));
            test = isOperator ? compileFilter({ v: value }) : compileFilter(value);
            if (isOperator) {
              const inner = test;
              test = (item) => inner({ v: item });
            }
          } else {
            test = (item) => valuesEqual(item, value);
          }
          const kept = arr.filter((item) => !test(item));
          arr.splice(0, arr.length, ...kept);
          break;
        }
        case '$pullAll': {
          const arr = getOwnPath(doc, path);
          if (!Array.isArray(arr)) break;
          const kept = arr.filter((item) => !value.some((v) => valuesEqual(v, item)));
          arr.splice(0, arr.length, ...kept);
          break;
        }
        case '$pop': {
          const arr = getOwnPath(doc, path);
          if (!Array.isArray(arr) || arr.length === 0) break;
          if (toNumber(value) < 0) arr.shift();
          else arr.pop();
          break;
        }
        default:
          throw new CommandError(9, 'FailedToParse', `Unknown modifier: ${operator}`);
      }
    }
  }
}

/** Build the base document for an upsert from the equality parts of a filter. */
function upsertSeed(filter) {
  const seed = {};
  const visit = (query) => {
    if (!isPlainObject(query)) return;
    for (const [key, value] of Object.entries(query)) {
      if (key === '$and' && Array.isArray(value)) {
        value.forEach(visit);
        continue;
      }
      if (key.startsWith('$')) continue;
      if (isOperatorObject(value)) {
        if ('$eq' in value) setPath(seed, key, clone(value.$eq));
        continue;
      }
      if (value instanceof RegExp) continue;
      setPath(seed, key, clone(value));
    }
  };
  visit(filter);
  return seed;
}

/* ----------------------------------------------------------- aggregation */

function evalExpression(expr, doc, vars = {}) {
  if (typeof expr === 'string') {
    if (expr.startsWith('$$')) {
      const [name, ...rest] = expr.slice(2).split('.');
      let base;
      if (name === 'ROOT') base = vars.ROOT ?? doc;
      else if (name === 'CURRENT') base = doc;
      else if (name === 'NOW') base = new Date();
      else if (name === 'REMOVE') return undefined;
      else base = vars[name];
      return rest.length ? getPath(base, rest) : base;
    }
    if (expr.startsWith('$')) return getPath(doc, expr.slice(1));
    return expr;
  }
  if (Array.isArray(expr)) return expr.map((item) => evalExpression(item, doc, vars));
  if (isPlainObject(expr)) {
    const keys = Object.keys(expr);
    if (keys.length === 1 && keys[0].startsWith('$')) {
      return evalOperator(keys[0], expr[keys[0]], doc, vars);
    }
    const out = {};
    for (const key of keys) {
      const value = evalExpression(expr[key], doc, vars);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  return expr;
}

function args(value, doc, vars) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => evalExpression(item, doc, vars));
}

function isNil(value) {
  return value === null || value === undefined;
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function evalOperator(op, value, doc, vars) {
  switch (op) {
    case '$literal':
      return value;
    case '$cond': {
      const spec = Array.isArray(value) ? { if: value[0], then: value[1], else: value[2] } : value;
      return truthy(evalExpression(spec.if, doc, vars))
        ? evalExpression(spec.then, doc, vars)
        : evalExpression(spec.else, doc, vars);
    }
    case '$ifNull': {
      const values = Array.isArray(value) ? value : [value];
      for (let i = 0; i < values.length - 1; i += 1) {
        const v = evalExpression(values[i], doc, vars);
        if (!isNil(v)) return v;
      }
      return evalExpression(values[values.length - 1], doc, vars);
    }
    case '$eq':
    case '$ne':
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$cmp': {
      const [a, b] = args(value, doc, vars);
      const c = compareValues(a, b);
      if (op === '$eq') return c === 0;
      if (op === '$ne') return c !== 0;
      if (op === '$gt') return c > 0;
      if (op === '$gte') return c >= 0;
      if (op === '$lt') return c < 0;
      if (op === '$lte') return c <= 0;
      return c;
    }
    case '$and':
      return args(value, doc, vars).every(truthy);
    case '$or':
      return args(value, doc, vars).some(truthy);
    case '$not':
      return !truthy(args(value, doc, vars)[0]);
    case '$in': {
      const [needle, haystack] = args(value, doc, vars);
      if (!Array.isArray(haystack)) throw new CommandError(40081, 'Location40081', '$in requires an array as a second argument');
      return haystack.some((item) => valuesEqual(item, needle));
    }
    case '$size': {
      const [arr] = args(value, doc, vars);
      if (!Array.isArray(arr)) throw new CommandError(17124, 'Location17124', 'The argument to $size must be an array');
      return arr.length;
    }
    case '$isArray':
      return Array.isArray(args(value, doc, vars)[0]);
    case '$add': {
      const list = args(value, doc, vars);
      if (list.some(isNil)) return null;
      const date = list.find((item) => item instanceof Date);
      const total = list.reduce((sum, item) => sum + (item instanceof Date ? item.getTime() : toNumber(item)), 0);
      return date ? new Date(total) : total;
    }
    case '$subtract': {
      const [a, b] = args(value, doc, vars);
      if (isNil(a) || isNil(b)) return null;
      if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
      if (a instanceof Date) return new Date(a.getTime() - toNumber(b));
      return toNumber(a) - toNumber(b);
    }
    case '$multiply': {
      const list = args(value, doc, vars);
      if (list.some(isNil)) return null;
      return list.reduce((acc, item) => acc * toNumber(item), 1);
    }
    case '$divide': {
      const [a, b] = args(value, doc, vars);
      if (isNil(a) || isNil(b)) return null;
      if (toNumber(b) === 0) throw new CommandError(2, 'BadValue', "can't $divide by zero");
      return toNumber(a) / toNumber(b);
    }
    case '$mod': {
      const [a, b] = args(value, doc, vars);
      if (isNil(a) || isNil(b)) return null;
      return toNumber(a) % toNumber(b);
    }
    case '$round': {
      const [n, places = 0] = args(value, doc, vars);
      if (isNil(n)) return null;
      const factor = 10 ** toNumber(places);
      return Math.round(toNumber(n) * factor) / factor;
    }
    case '$abs': {
      const [n] = args(value, doc, vars);
      return isNil(n) ? null : Math.abs(toNumber(n));
    }
    case '$toLower':
    case '$toUpper': {
      const [s] = args(value, doc, vars);
      if (isNil(s)) return '';
      return op === '$toLower' ? String(s).toLowerCase() : String(s).toUpperCase();
    }
    case '$toString': {
      const [s] = args(value, doc, vars);
      if (isNil(s)) return null;
      if (s instanceof ObjectId) return s.toHexString();
      if (s instanceof Date) return s.toISOString();
      return String(s);
    }
    case '$concat': {
      const list = args(value, doc, vars);
      if (list.some(isNil)) return null;
      return list.map(String).join('');
    }
    case '$strLenCP': {
      const [s] = args(value, doc, vars);
      return [...String(s ?? '')].length;
    }
    case '$regexMatch': {
      const input = evalExpression(value.input, doc, vars);
      const regex = evalExpression(value.regex, doc, vars);
      const options = value.options ? evalExpression(value.options, doc, vars) : '';
      if (isNil(input)) return false;
      const re = regex instanceof RegExp ? regex : new RegExp(String(regex), options);
      return re.test(String(input));
    }
    case '$arrayElemAt': {
      const [arr, idx] = args(value, doc, vars);
      if (!Array.isArray(arr)) return null;
      const i = toNumber(idx);
      return i >= 0 ? arr[i] : arr[arr.length + i];
    }
    case '$first':
    case '$last': {
      const [arr] = args(value, doc, vars);
      if (!Array.isArray(arr)) return undefined;
      return op === '$first' ? arr[0] : arr[arr.length - 1];
    }
    case '$sum':
    case '$avg':
    case '$min':
    case '$max': {
      let list = args(value, doc, vars);
      if (list.length === 1 && Array.isArray(list[0])) [list] = list;
      const numbers = list.filter((item) => typeof item === 'number' || (item && item._bsontype));
      if (op === '$sum') return numbers.reduce((sum, item) => sum + toNumber(item), 0);
      if (op === '$avg') return numbers.length ? numbers.reduce((s, i) => s + toNumber(i), 0) / numbers.length : null;
      const present = list.filter((item) => !isNil(item));
      if (!present.length) return null;
      return present.reduce((best, item) => {
        const c = compareValues(item, best);
        return (op === '$min' ? c < 0 : c > 0) ? item : best;
      });
    }
    case '$dateToString': {
      const date = evalExpression(value.date, doc, vars);
      if (!(date instanceof Date)) return null;
      const format = value.format || '%Y-%m-%dT%H:%M:%S.%LZ';
      return format
        .replace(/%Y/g, String(date.getUTCFullYear()))
        .replace(/%m/g, pad(date.getUTCMonth() + 1))
        .replace(/%d/g, pad(date.getUTCDate()))
        .replace(/%H/g, pad(date.getUTCHours()))
        .replace(/%M/g, pad(date.getUTCMinutes()))
        .replace(/%S/g, pad(date.getUTCSeconds()))
        .replace(/%L/g, pad(date.getUTCMilliseconds(), 3));
    }
    case '$type': {
      const [v] = args(value, doc, vars);
      if (v === undefined) return 'missing';
      if (v === null) return 'null';
      if (Array.isArray(v)) return 'array';
      if (v instanceof Date) return 'date';
      if (v instanceof ObjectId) return 'objectId';
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
      if (typeof v === 'boolean') return 'bool';
      if (typeof v === 'string') return 'string';
      return 'object';
    }
    case '$filter': {
      const input = evalExpression(value.input, doc, vars);
      if (!Array.isArray(input)) return null;
      const name = value.as || 'this';
      return input.filter((item) => truthy(evalExpression(value.cond, doc, { ...vars, [name]: item })));
    }
    case '$map': {
      const input = evalExpression(value.input, doc, vars);
      if (!Array.isArray(input)) return null;
      const name = value.as || 'this';
      return input.map((item) => evalExpression(value.in, doc, { ...vars, [name]: item }));
    }
    default:
      throw new CommandError(168, 'InvalidPipelineOperator', `MiniMongo does not support expression ${op}`);
  }
}

function truthy(value) {
  return !(value === false || value === null || value === undefined || value === 0);
}

function isExpression(value) {
  return (typeof value === 'string' && value.startsWith('$')) || isOperatorObject(value);
}

function runGroup(docs, spec) {
  const groups = new Map();
  const accumulators = Object.entries(spec).filter(([key]) => key !== '_id');
  for (const doc of docs) {
    const id = evalExpression(spec._id, doc);
    const key = canonicalKey(id);
    let group = groups.get(key);
    if (!group) {
      group = { _id: id === undefined ? null : id, state: {} };
      groups.set(key, group);
    }
    for (const [field, accSpec] of accumulators) {
      const [accOp] = Object.keys(accSpec);
      const expr = accSpec[accOp];
      const state = group.state;
      const v = accOp === '$count' ? 1 : evalExpression(expr, doc);
      switch (accOp) {
        case '$sum':
        case '$count':
          state[field] = (state[field] || 0) + (typeof v === 'number' || (v && v._bsontype) ? toNumber(v) : 0);
          break;
        case '$avg':
          state[field] = state[field] || { sum: 0, n: 0 };
          if (typeof v === 'number' || (v && v._bsontype)) {
            state[field].sum += toNumber(v);
            state[field].n += 1;
          }
          break;
        case '$min':
        case '$max':
          if (!isNil(v)) {
            if (!(field in state)) state[field] = v;
            else {
              const c = compareValues(v, state[field]);
              if (accOp === '$min' ? c < 0 : c > 0) state[field] = v;
            }
          }
          break;
        case '$first':
          if (!(field in state)) state[field] = v === undefined ? null : v;
          break;
        case '$last':
          state[field] = v === undefined ? null : v;
          break;
        case '$push':
          state[field] = state[field] || [];
          if (v !== undefined) state[field].push(v);
          break;
        case '$addToSet':
          state[field] = state[field] || [];
          if (v !== undefined && !state[field].some((item) => valuesEqual(item, v))) state[field].push(v);
          break;
        default:
          throw new CommandError(15952, 'Location15952', `MiniMongo does not support accumulator ${accOp}`);
      }
    }
  }
  return [...groups.values()].map((group) => {
    const out = { _id: group._id };
    for (const [field, accSpec] of accumulators) {
      const [accOp] = Object.keys(accSpec);
      const state = group.state[field];
      if (accOp === '$avg') out[field] = state && state.n ? state.sum / state.n : null;
      else if (accOp === '$sum' || accOp === '$count') out[field] = state || 0;
      else if (accOp === '$push' || accOp === '$addToSet') out[field] = state || [];
      else out[field] = state === undefined ? null : state;
    }
    return out;
  });
}

function runProjectStage(docs, spec) {
  const entries = Object.entries(spec);
  const computed = entries.filter(([key, value]) => key !== '_id' && isExpression(value));
  const plain = Object.fromEntries(entries.filter(([key, value]) => key === '_id' || !isExpression(value)));
  return docs.map((doc) => {
    const hasInclusion = Object.entries(plain).some(([key, value]) => key !== '_id' && isInclusionValue(value));
    let out;
    if (hasInclusion || computed.length) {
      out = {};
      const excludeId = '_id' in plain && !isInclusionValue(plain._id);
      if (!excludeId) out._id = doc._id;
      for (const [key, value] of Object.entries(plain)) {
        if (key !== '_id' && isInclusionValue(value)) includePath(doc, out, key.split('.'));
      }
      if ('_id' in spec && isExpression(spec._id)) out._id = evalExpression(spec._id, doc);
    } else {
      out = applyProjection(doc, plain);
    }
    for (const [key, value] of computed) {
      const v = evalExpression(value, doc);
      if (v !== undefined) setPath(out, key, v);
    }
    return out;
  });
}

function runPipeline(docs, pipeline, context) {
  let current = docs;
  for (const stage of pipeline) {
    const [name] = Object.keys(stage);
    const spec = stage[name];
    switch (name) {
      case '$match': {
        const test = compileFilter(spec);
        current = current.filter((doc) => test(doc));
        break;
      }
      case '$sort':
        current = sortDocuments(current, spec);
        break;
      case '$skip':
        current = current.slice(toNumber(spec));
        break;
      case '$limit':
        current = current.slice(0, toNumber(spec));
        break;
      case '$project':
        current = runProjectStage(current, spec);
        break;
      case '$unset': {
        const fields = Array.isArray(spec) ? spec : [spec];
        current = current.map((doc) => {
          const out = clone(doc);
          fields.forEach((field) => unsetPath(out, field));
          return out;
        });
        break;
      }
      case '$addFields':
      case '$set':
        current = current.map((doc) => {
          const out = clone(doc);
          for (const [key, expr] of Object.entries(spec)) {
            const v = evalExpression(expr, doc);
            if (v === undefined) unsetPath(out, key);
            else setPath(out, key, v);
          }
          return out;
        });
        break;
      case '$group':
        current = runGroup(current, spec);
        break;
      case '$unwind': {
        const opts = typeof spec === 'string' ? { path: spec } : spec;
        const path = opts.path.slice(1);
        const next = [];
        for (const doc of current) {
          const value = getOwnPath(doc, path);
          if (Array.isArray(value) && value.length) {
            value.forEach((item, index) => {
              const copy = clone(doc);
              setPath(copy, path, clone(item));
              if (opts.includeArrayIndex) setPath(copy, opts.includeArrayIndex, index);
              next.push(copy);
            });
          } else if (value !== undefined && value !== null && !Array.isArray(value)) {
            const copy = clone(doc);
            if (opts.includeArrayIndex) setPath(copy, opts.includeArrayIndex, null);
            next.push(copy);
          } else if (opts.preserveNullAndEmptyArrays) {
            const copy = clone(doc);
            if (Array.isArray(value)) unsetPath(copy, path);
            if (opts.includeArrayIndex) setPath(copy, opts.includeArrayIndex, null);
            next.push(copy);
          }
        }
        current = next;
        break;
      }
      case '$count':
        current = current.length ? [{ [spec]: current.length }] : [];
        break;
      case '$sortByCount':
        current = sortDocuments(runGroup(current, { _id: spec, count: { $sum: 1 } }), { count: -1 });
        break;
      case '$facet': {
        const out = {};
        for (const [key, subPipeline] of Object.entries(spec)) {
          out[key] = runPipeline(current, subPipeline, context);
        }
        current = [out];
        break;
      }
      case '$replaceRoot':
      case '$replaceWith': {
        const expr = name === '$replaceRoot' ? spec.newRoot : spec;
        current = current.map((doc) => {
          const v = evalExpression(expr, doc);
          if (!isPlainObject(v)) {
            throw new CommandError(40228, 'Location40228', "'newRoot' expression must evaluate to an object");
          }
          return v;
        });
        break;
      }
      case '$lookup': {
        if (spec.pipeline) throw new CommandError(2, 'BadValue', 'MiniMongo does not support $lookup pipelines');
        const foreign = context.getCollectionDocs(spec.from);
        current = current.map((doc) => {
          const local = getPath(doc, spec.localField);
          const localValues = Array.isArray(local) ? local : [local === undefined ? null : local];
          const matches = foreign.filter((fdoc) => {
            const fv = getPath(fdoc, spec.foreignField);
            const fvalues = Array.isArray(fv) ? fv : [fv === undefined ? null : fv];
            return fvalues.some((a) => localValues.some((b) => valuesEqual(a, b)));
          });
          const out = clone(doc);
          setPath(out, spec.as, clone(matches));
          return out;
        });
        break;
      }
      default:
        throw new CommandError(40324, 'Location40324', `MiniMongo does not support stage ${name}`);
    }
  }
  return current;
}

module.exports = {
  CommandError,
  compileFilter,
  sortDocuments,
  applyProjection,
  applyUpdate,
  isUpdateOperatorDocument,
  upsertSeed,
  runPipeline,
  evalExpression
};

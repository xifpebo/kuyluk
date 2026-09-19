'use strict';

const AuditLog = require('../models/AuditLog');
const { truncate } = require('../lib/text');
const { logger } = require('../logger');

const REDACTED_FIELDS = new Set(['password', 'passwordHash', 'passwordHistory', 'tokenHash', 'token', 'csrf', 'secret']);
const MAX_VALUE_LENGTH = 300;

function simplify(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value._bsontype === 'ObjectId') return String(value);
  if (Array.isArray(value)) {
    const json = JSON.stringify(value.map(simplify));
    return json.length > MAX_VALUE_LENGTH ? truncate(json, MAX_VALUE_LENGTH) : JSON.parse(json);
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value, (key, v) => (REDACTED_FIELDS.has(key) ? '[redacted]' : v));
    return json.length > MAX_VALUE_LENGTH ? truncate(json, MAX_VALUE_LENGTH) : JSON.parse(json);
  }
  if (typeof value === 'string') return truncate(value, MAX_VALUE_LENGTH);
  return value;
}

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && value._bsontype !== 'ObjectId') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '_id' && prefix) continue;
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out[prefix] = value;
  return out;
}

/**
 * Field-level diff between two plain objects, limited to `fields` (top-level
 * names). Sensitive fields are redacted.
 */
function diff(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const a = flatten(before?.[field], field);
    const b = flatten(after?.[field], field);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const from = simplify(a[key]);
      const to = simplify(b[key]);
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      const redact = key.split('.').some((part) => REDACTED_FIELDS.has(part));
      changes.push({ field: key, from: redact ? '[redacted]' : from, to: redact ? '[redacted]' : to });
    }
  }
  return changes.slice(0, 100);
}

/**
 * Persist an audit entry. Never throws: audit failures are logged loudly but
 * must not break the request that triggered them.
 */
async function recordAudit(req, { action, status = 'success', entity, changes, meta, actor } = {}) {
  try {
    const user = actor || req?.auth?.user || null;
    const entry = {
      action,
      status,
      actor: user
        ? { id: user._id || null, email: user.email || '', name: user.name || '', role: user.role || '' }
        : { id: null, email: '', name: '', role: '' },
      entity: entity
        ? { type: entity.type || '', id: entity.id ? String(entity.id) : '', label: truncate(entity.label || '', 160) }
        : { type: '', id: '', label: '' },
      changes: changes || [],
      meta: meta ? JSON.parse(JSON.stringify(meta, (key, v) => (REDACTED_FIELDS.has(key) ? '[redacted]' : v))) : {},
      ip: req?.ip || '',
      userAgent: truncate(req?.get?.('user-agent') || '', 256),
      requestId: req?.id || ''
    };
    await AuditLog.create(entry);
  } catch (error) {
    logger.error('Failed to write audit log entry', { err: error, action });
  }
}

module.exports = { recordAudit, diff };

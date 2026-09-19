'use strict';

const { unauthorized, forbidden } = require('../lib/errors');
const { recordAudit } = require('../services/audit');

function requireAuth(req, res, next) {
  if (!req.auth) return next(unauthorized('auth_required'));
  return next();
}

function requireStaff(req, res, next) {
  if (!req.auth) return next(unauthorized('auth_required'));
  if (!req.auth.isStaff) {
    recordAudit(req, {
      action: 'access.denied',
      status: 'failure',
      meta: { method: req.method, path: req.originalUrl.split('?')[0], reason: 'not_staff' }
    });
    return next(forbidden('forbidden'));
  }
  return next();
}

/** Every listed permission is required. */
function requirePermission(...permissions) {
  return function permissionGuard(req, res, next) {
    if (!req.auth) return next(unauthorized('auth_required'));
    const missing = permissions.filter((permission) => !req.auth.permissions.includes(permission));
    if (missing.length) {
      recordAudit(req, {
        action: 'access.denied',
        status: 'failure',
        meta: { method: req.method, path: req.originalUrl.split('?')[0], missing }
      });
      return next(forbidden('forbidden'));
    }
    return next();
  };
}

/** Staff flagged with mustChangePassword may only change their password or log out. */
function requireFreshPassword(req, res, next) {
  if (req.auth?.mustChangePassword) return next(forbidden('password_change_required'));
  return next();
}

module.exports = { requireAuth, requireStaff, requirePermission, requireFreshPassword };

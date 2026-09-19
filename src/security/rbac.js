'use strict';

/**
 * Role-based access control.
 *
 * Roles map to explicit permissions; route guards check permissions, never
 * role names, so the matrix below is the single source of truth.
 */

const ROLES = Object.freeze(['superadmin', 'manager', 'user']);
const STAFF_ROLES = Object.freeze(['superadmin', 'manager']);

const P = Object.freeze({
  ADMIN_ACCESS: 'admin:access',
  DASHBOARD_VIEW: 'dashboard:view',
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',
  PRODUCTS_DELETE: 'products:delete',
  TAXONOMY_WRITE: 'taxonomy:write',
  TAXONOMY_DELETE: 'taxonomy:delete',
  SUPPLIERS_WRITE: 'suppliers:write',
  SUPPLIERS_DELETE: 'suppliers:delete',
  QUOTES_READ: 'quotes:read',
  QUOTES_WRITE: 'quotes:write',
  QUOTES_DELETE: 'quotes:delete',
  UPLOADS_WRITE: 'uploads:write',
  USERS_MANAGE: 'users:manage',
  AUDIT_READ: 'audit:read',
  ACCOUNT_SELF: 'account:self'
});

const ALL_PERMISSIONS = Object.freeze(Object.values(P));

const ROLE_PERMISSIONS = Object.freeze({
  superadmin: ALL_PERMISSIONS,
  manager: Object.freeze([
    P.ADMIN_ACCESS,
    P.DASHBOARD_VIEW,
    P.PRODUCTS_READ,
    P.PRODUCTS_WRITE,
    P.PRODUCTS_DELETE,
    P.TAXONOMY_WRITE,
    P.SUPPLIERS_WRITE,
    P.QUOTES_READ,
    P.QUOTES_WRITE,
    P.UPLOADS_WRITE,
    P.ACCOUNT_SELF
  ]),
  user: Object.freeze([P.ACCOUNT_SELF])
});

function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function can(role, permission) {
  return permissionsFor(role).includes(permission);
}

module.exports = {
  ROLES,
  STAFF_ROLES,
  PERMISSIONS: P,
  ROLE_PERMISSIONS,
  isStaffRole,
  permissionsFor,
  can
};

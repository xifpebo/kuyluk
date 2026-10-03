'use strict';

/**
 * Role-based access control.
 *
 * Roles map to explicit permissions; route guards check permissions, never
 * role names, so the matrix below is the single source of truth.
 *
 *  - superadmin / manager: staff, use the admin panel (/admin)
 *  - shop_owner: manages only their own shop and products (/seller)
 *  - user: a customer (favourites, reviews, profile)
 */

const ROLES = Object.freeze(['superadmin', 'manager', 'shop_owner', 'user']);
const STAFF_ROLES = Object.freeze(['superadmin', 'manager']);

const P = Object.freeze({
  ADMIN_ACCESS: 'admin:access',
  DASHBOARD_VIEW: 'dashboard:view',
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',
  PRODUCTS_DELETE: 'products:delete',
  PRODUCTS_APPROVE: 'products:approve',
  TAXONOMY_WRITE: 'taxonomy:write',
  TAXONOMY_DELETE: 'taxonomy:delete',
  SHOPS_WRITE: 'shops:write',
  SHOPS_DELETE: 'shops:delete',
  SHOPS_APPROVE: 'shops:approve',
  REVIEWS_MODERATE: 'reviews:moderate',
  CONTENT_WRITE: 'content:write',
  SETTINGS_WRITE: 'settings:write',
  TRANSLATIONS_WRITE: 'translations:write',
  UPLOADS_WRITE: 'uploads:write',
  USERS_MANAGE: 'users:manage',
  AUDIT_READ: 'audit:read',
  SELLER_ACCESS: 'seller:access',
  REVIEWS_WRITE: 'reviews:write',
  ACCOUNT_SELF: 'account:self'
});

const ALL_PERMISSIONS = Object.freeze(Object.values(P).filter((p) => p !== P.SELLER_ACCESS));

const ROLE_PERMISSIONS = Object.freeze({
  superadmin: ALL_PERMISSIONS,
  manager: Object.freeze([
    P.ADMIN_ACCESS,
    P.DASHBOARD_VIEW,
    P.PRODUCTS_READ,
    P.PRODUCTS_WRITE,
    P.PRODUCTS_DELETE,
    P.PRODUCTS_APPROVE,
    P.TAXONOMY_WRITE,
    P.SHOPS_WRITE,
    P.SHOPS_APPROVE,
    P.REVIEWS_MODERATE,
    P.CONTENT_WRITE,
    P.UPLOADS_WRITE,
    P.REVIEWS_WRITE,
    P.ACCOUNT_SELF
  ]),
  shop_owner: Object.freeze([P.SELLER_ACCESS, P.UPLOADS_WRITE, P.REVIEWS_WRITE, P.ACCOUNT_SELF]),
  user: Object.freeze([P.REVIEWS_WRITE, P.ACCOUNT_SELF])
});

function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

function isSellerRole(role) {
  return role === 'shop_owner';
}

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function can(role, permission) {
  return permissionsFor(role).includes(permission);
}

/** Where a role lands after signing in. */
function homeFor(role) {
  if (isStaffRole(role)) return '/admin';
  if (isSellerRole(role)) return '/seller';
  return '/account';
}

module.exports = {
  ROLES,
  STAFF_ROLES,
  PERMISSIONS: P,
  ROLE_PERMISSIONS,
  isStaffRole,
  isSellerRole,
  permissionsFor,
  can,
  homeFor
};

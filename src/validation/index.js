'use strict';

/**
 * Request schemas. Every API input passes through one of these before it
 * reaches a service, so services only ever see typed, cleaned values.
 */
const { s } = require('../lib/schema');
const { checkPasswordPolicy } = require('../security/password');
const { ROLES } = require('../security/rbac');
const C = require('../domain/constants');

const emptyLocalized = () => ({ uz: '', ru: '' });
const optionalLocalized = (max, multiline = false) =>
  s.localized({ min: 0, max, multiline, required: 'none' }).default(emptyLocalized);

const page = s.number({ coerce: true, integer: true, min: 1, max: 10000 }).default(1);
const limit = (max = 50, fallback = 20) => s.number({ coerce: true, integer: true, min: 1, max }).default(fallback);
const idParams = s.object({ id: s.objectId() });
const slugParams = s.object({ slug: s.slug() });

const SKU = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const STALL = /^[A-Z0-9][A-Z0-9-]{0,11}$/;
const HOURS = /^\d{2}:\d{2}\s?[–-]\s?\d{2}:\d{2}$/;

/* ------------------------------------------------------------- auth */

const login = s.object({
  email: s.email(),
  password: s.password()
});

/** Field-level password rules (policy, confirmation) for registration. */
function registerCrossChecks(value) {
  const fields = {};
  const policy = checkPasswordPolicy(value.password, { email: value.email, name: value.name });
  if (policy.length) fields.password = { code: policy[0], params: {} };
  if (value.password !== value.passwordConfirm) fields.passwordConfirm = { code: 'mismatch', params: {} };
  if (value.terms !== true) fields.terms = { code: 'consent_required', params: {} };
  return fields;
}

const register = s.object({
  name: s.string({ min: 2, max: 100 }),
  email: s.email(),
  phone: s.phone().default(''),
  company: s.string({ max: 120 }).default(''),
  password: s.password(),
  passwordConfirm: s.password(),
  terms: s.boolean({ coerce: true })
});

const changePassword = s.object({
  currentPassword: s.password(),
  newPassword: s.password()
});

const profile = s.object({
  name: s.string({ min: 2, max: 100 }).optional(),
  phone: s.phone().allowEmpty(),
  company: s.string({ max: 120 }).allowEmpty(),
  preferredLang: s.enum(C.LANGUAGES).optional()
});

/* ---------------------------------------------------------- catalog */

const csv = (item, max = 20) => s.array(item, { csv: true, max, unique: true }).optional();

const productListQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  category: s.slug().optional(),
  brand: csv(s.slug()),
  material: csv(s.enum(C.MATERIALS)),
  grade: csv(s.string({ max: 40 })),
  stock: csv(s.enum(C.STOCK_STATUSES), 4),
  unit: csv(s.enum(C.UNITS), 14),
  supplier: csv(s.slug()),
  thickness: csv(s.number({ coerce: true, min: 0, max: 100000 })),
  diameter: csv(s.number({ coerce: true, min: 0, max: 100000 })),
  priceMin: s.number({ coerce: true, min: 0, max: 1e12 }).optional(),
  priceMax: s.number({ coerce: true, min: 0, max: 1e12 }).optional(),
  bulk: s.boolean({ coerce: true }).optional(),
  featured: s.boolean({ coerce: true }).optional(),
  sort: s.enum(C.PRODUCT_SORTS).default('recommended'),
  page,
  limit: limit(48, 24),
  facets: s.boolean({ coerce: true }).default(false)
});

const lookupQuery = s.object({
  ids: s.array(s.objectId(), { csv: true, min: 1, max: 100, unique: true })
});

const suggestQuery = s.object({
  q: s.string({ min: 1, max: 60 })
});

const supplierListQuery = s.object({
  q: s.string({ max: 60 }).optional(),
  featured: s.boolean({ coerce: true }).optional(),
  page,
  limit: limit(48, 24)
});

/* ------------------------------------------------------- admin catalog */

const nullableNumber = (max) => s.number({ min: 0, max }).nullable().default(null);

const productBody = s
  .object({
    sku: s.string({ max: 32, upper: true, clean: false }).refine((v) => (SKU.test(v) ? true : 'invalid_sku')),
    slug: s.slug().optional(),
    name: s.localized({ min: 2, max: 160 }),
    description: optionalLocalized(4000, true),
    category: s.objectId(),
    brand: s.objectId().nullable().default(null),
    supplier: s.objectId(),
    materialType: s.enum(C.MATERIALS).default('other'),
    grade: s.string({ max: 40 }).default(''),
    unit: s.enum(C.UNITS),
    price: s.number({ min: 0, max: 1e12 }),
    oldPrice: nullableNumber(1e12),
    priceTiers: s
      .array(s.object({ minQty: s.number({ min: 0.001, max: 1e7 }), price: s.number({ min: 0, max: 1e12 }) }), { max: 10 })
      .default(() => []),
    minOrderQty: s.number({ min: 0.001, max: 1e6 }).default(1),
    orderStep: s.number({ min: 0.001, max: 1e6 }).default(1),
    unitsPerPallet: nullableNumber(1e6),
    dimensions: s
      .object({
        lengthMm: nullableNumber(1e6),
        widthMm: nullableNumber(1e6),
        heightMm: nullableNumber(1e6),
        thicknessMm: nullableNumber(1e6),
        diameterMm: nullableNumber(1e6)
      })
      .default(() => ({ lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: null })),
    weightKg: nullableNumber(1e6),
    specs: s
      .array(s.object({ label: s.localized({ min: 1, max: 60 }), value: s.localized({ min: 1, max: 120 }) }), { max: 20 })
      .default(() => []),
    stock: s.object({
      status: s.enum(C.STOCK_STATUSES),
      quantity: nullableNumber(1e9)
    }),
    leadTimeDays: s.number({ integer: true, min: 0, max: 365 }).default(0),
    images: s.array(s.url(), { max: 8, unique: true }).default(() => []),
    isFeatured: s.boolean().default(false),
    isActive: s.boolean().default(true)
  })
  .refine((value) => {
    const tiers = value.priceTiers.map((tier, index) => ({ ...tier, index })).sort((a, b) => a.minQty - b.minQty);
    for (const tier of tiers) {
      if (tier.price > value.price) return { code: 'tier_price_high', path: `priceTiers.${tier.index}.price` };
    }
    for (let i = 1; i < tiers.length; i += 1) {
      if (tiers[i].price > tiers[i - 1].price) return { code: 'tiers_order', path: `priceTiers.${tiers[i].index}.price` };
    }
    return true;
  });

const productPatch = s.object({
  isActive: s.boolean().optional(),
  isFeatured: s.boolean().optional(),
  stockStatus: s.enum(C.STOCK_STATUSES).optional(),
  price: s.number({ min: 0, max: 1e12 }).optional()
});

const adminProductQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  category: s.objectId().optional(),
  supplier: s.objectId().optional(),
  stock: s.enum(C.STOCK_STATUSES).optional(),
  active: s.enum(['active', 'inactive']).optional(),
  sort: s.enum(['updated', 'name', 'price_asc', 'price_desc', 'sku']).default('updated'),
  page,
  limit: limit(100, 25)
});

const categoryBody = s.object({
  slug: s.slug().optional(),
  name: s.localized({ min: 2, max: 80 }),
  description: optionalLocalized(400, true),
  icon: s.enum(C.CATEGORY_ICONS).default('box'),
  sortOrder: s.number({ integer: true, min: 0, max: 10000 }).default(100),
  isActive: s.boolean().default(true)
});

const brandBody = s.object({
  slug: s.slug().optional(),
  name: s.string({ min: 1, max: 80 }),
  country: s.string({ max: 2, upper: true, pattern: /^[A-Z]{2}$/, patternCode: 'invalid_country' }).default(''),
  description: optionalLocalized(400, true),
  isActive: s.boolean().default(true)
});

const supplierBody = s.object({
  slug: s.slug().optional(),
  name: s.string({ min: 2, max: 100 }),
  stallNumber: s.string({ min: 1, max: 12, upper: true, pattern: STALL, patternCode: 'invalid_format' }),
  description: optionalLocalized(1000, true),
  address: optionalLocalized(200),
  phone: s.phone().default(''),
  telegram: s.telegram().default(''),
  whatsapp: s.phone().default(''),
  email: s.email().default(''),
  workingHours: s
    .string({ max: 40, pattern: HOURS, patternCode: 'invalid_hours' })
    .transform((v) => v.replace(/\s*[–-]\s*/, '–'))
    .default('08:00–18:00'),
  workingDays: s.enum(C.WORKING_DAYS).default('mon_sat'),
  deliveryAvailable: s.boolean().default(false),
  deliveryNote: optionalLocalized(300),
  paymentMethods: s.array(s.enum(C.PAYMENT_METHODS), { max: 3, unique: true }).default(() => ['cash']),
  isVerified: s.boolean().default(false),
  isFeatured: s.boolean().default(false),
  isActive: s.boolean().default(true),
  logoUrl: s.url().default('')
});

const listQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  active: s.enum(['active', 'inactive']).optional(),
  page,
  limit: limit(200, 50)
});

/* ------------------------------------------------------------ quotes */

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function inOneYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

const quoteCreate = s
  .object({
    items: s.array(
      s.object({
        product: s.objectId(),
        qty: s.number({ coerce: true, min: 0.001, max: 1e6 })
      }),
      { min: 1, max: 100 }
    ),
    customer: s.object({
      name: s.string({ min: 2, max: 100 }),
      phone: s.phone(),
      email: s.email().default(''),
      company: s.string({ max: 120 }).default(''),
      taxId: s
        .string({ max: 9, clean: false, pattern: /^\d{9}$/, patternCode: 'invalid_tax_id' })
        .default('')
    }),
    contactMethod: s.enum(C.CONTACT_METHODS).default('phone'),
    delivery: s.object({
      method: s.enum(C.DELIVERY_METHODS),
      region: s.enum(C.REGIONS).default(''),
      address: s.string({ max: 300 }).default(''),
      neededBy: s.date({ min: startOfToday, max: inOneYear }).nullable().default(null)
    }),
    comment: s.string({ max: 2000, multiline: true }).default(''),
    consent: s.boolean({ coerce: true }),
    website: s.string({ max: 200, clean: false }).default('')
  });

/** Cross-field rules that produce field-level issues. */
function quoteCrossChecks(value) {
  const fields = {};
  if (value.consent !== true) fields.consent = { code: 'consent_required', params: {} };
  if (value.delivery.method === 'delivery') {
    if (!value.delivery.region) fields['delivery.region'] = { code: 'required', params: {} };
    if (!value.delivery.address || value.delivery.address.length < 5) {
      fields['delivery.address'] = value.delivery.address
        ? { code: 'too_short', params: { min: 5 } }
        : { code: 'required', params: {} };
    }
  }
  if (value.contactMethod === 'email' && !value.customer.email) {
    fields['customer.email'] = { code: 'required', params: {} };
  }
  return fields;
}

const adminQuoteQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  status: s.enum(C.QUOTE_STATUSES).optional(),
  assignee: s.enum(['me', 'none']).optional(),
  page,
  limit: limit(100, 25)
});

const quoteUpdate = s.object({
  status: s.enum(C.QUOTE_STATUSES).optional(),
  statusNote: s.string({ max: 1000, multiline: true }).default(''),
  assignedTo: s.objectId().nullable(),
  managerNote: s.string({ max: 2000, multiline: true }).allowEmpty(),
  quotedTotal: s.number({ min: 0, max: 1e13 }).nullable(),
  items: s
    .array(
      s.object({
        id: s.objectId(),
        quotedUnitPrice: s.number({ min: 0, max: 1e12 }).nullable().default(null)
      }),
      { max: 100 }
    )
    .optional()
});

/* ------------------------------------------------------------- users */

const userCreate = s.object({
  email: s.email(),
  name: s.string({ min: 2, max: 100 }),
  phone: s.phone().default(''),
  role: s.enum(ROLES),
  password: s.password().optional(),
  preferredLang: s.enum(C.LANGUAGES).default('uz')
});

const userUpdate = s.object({
  name: s.string({ min: 2, max: 100 }).optional(),
  phone: s.phone().allowEmpty(),
  role: s.enum(ROLES).optional(),
  isActive: s.boolean().optional(),
  preferredLang: s.enum(C.LANGUAGES).optional()
});

const userListQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  role: s.enum(ROLES).optional(),
  status: s.enum(['active', 'inactive', 'locked']).optional(),
  page,
  limit: limit(100, 25)
});

/* ------------------------------------------------------------- audit */

const AUDIT_ENTITIES = ['product', 'category', 'brand', 'supplier', 'quote', 'user', 'upload', 'session'];

const auditQuery = s.object({
  action: s.string({ max: 64, clean: false, pattern: /^[a-z_]+\.[a-z_]+$/ }).optional(),
  actor: s.string({ max: 254 }).optional(),
  entityType: s.enum(AUDIT_ENTITIES).optional(),
  entityId: s.string({ max: 64, clean: false, pattern: /^[A-Za-z0-9-]+$/ }).optional(),
  status: s.enum(['success', 'failure']).optional(),
  from: s.date().optional(),
  to: s.date().optional(),
  page,
  limit: limit(100, 50)
});

module.exports = {
  idParams,
  slugParams,
  login,
  register,
  registerCrossChecks,
  changePassword,
  profile,
  productListQuery,
  lookupQuery,
  suggestQuery,
  supplierListQuery,
  productBody,
  productPatch,
  adminProductQuery,
  categoryBody,
  brandBody,
  supplierBody,
  listQuery,
  quoteCreate,
  quoteCrossChecks,
  adminQuoteQuery,
  quoteUpdate,
  userCreate,
  userUpdate,
  userListQuery,
  auditQuery,
  AUDIT_ENTITIES
};

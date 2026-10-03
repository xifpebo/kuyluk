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
const HOURS = /^\d{2}:\d{2}\s?[–-]\s?\d{2}:\d{2}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;

const instagram = () =>
  s
    .string({ max: 60, clean: false })
    .transform((v) => v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, ''))
    .refine((v) => (INSTAGRAM.test(v) ? true : 'invalid_instagram'));

/* ------------------------------------------------------------- auth */

const login = s.object({
  email: s.email(),
  password: s.password()
});

function passwordChecks(value, fields = {}) {
  const policy = checkPasswordPolicy(value.password, { email: value.email, name: value.name });
  if (policy.length) fields.password = { code: policy[0], params: {} };
  if (value.password !== value.passwordConfirm) fields.passwordConfirm = { code: 'mismatch', params: {} };
  if (value.terms !== true) fields.terms = { code: 'consent_required', params: {} };
  return fields;
}

/** Field-level password rules (policy, confirmation) for registration. */
function registerCrossChecks(value) {
  return passwordChecks(value);
}

const register = s.object({
  name: s.string({ min: 2, max: 100 }),
  email: s.email(),
  phone: s.phone().default(''),
  password: s.password(),
  passwordConfirm: s.password(),
  terms: s.boolean({ coerce: true })
});

/** "Open a shop": owner account + shop application in one step. */
const registerShop = s.object({
  name: s.string({ min: 2, max: 100 }),
  email: s.email(),
  phone: s.phone(),
  password: s.password(),
  passwordConfirm: s.password(),
  terms: s.boolean({ coerce: true }),
  shop: s.object({
    name: s.string({ min: 2, max: 100 }),
    description: s.string({ min: 20, max: 2000, multiline: true }),
    address: s.string({ min: 5, max: 200 }),
    city: s.enum(C.REGIONS),
    phone: s.phone(),
    telegram: s.telegram().default(''),
    instagram: instagram().default(''),
    workingHours: s
      .string({ max: 40, pattern: HOURS, patternCode: 'invalid_hours' })
      .transform((v) => v.replace(/\s*[–-]\s*/, '–'))
      .default('09:00–18:00'),
    deliveryAvailable: s.boolean({ coerce: true }).default(false)
  }),
  website: s.string({ max: 200, clean: false }).default('')
});

const registerShopCrossChecks = passwordChecks;

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

const favorites = s.object({
  products: s.array(s.objectId(), { max: 200, unique: true }).default(() => []),
  merge: s.boolean().default(false)
});

/* ---------------------------------------------------------- catalog */

const csv = (item, max = 20) => s.array(item, { csv: true, max, unique: true }).optional();

const productListQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  category: s.slug().optional(),
  sub: csv(s.slug(), 40),
  brand: csv(s.slug()),
  shop: csv(s.slug()),
  color: csv(s.enum(C.COLORS)),
  stock: csv(s.enum(C.STOCK_STATUSES), 4),
  priceMin: s.number({ coerce: true, min: 0, max: 1e12 }).optional(),
  priceMax: s.number({ coerce: true, min: 0, max: 1e12 }).optional(),
  discount: s.boolean({ coerce: true }).optional(),
  featured: s.boolean({ coerce: true }).optional(),
  rating: s.number({ coerce: true, integer: true, min: 1, max: 5 }).optional(),
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

const shopListQuery = s.object({
  q: s.string({ max: 60 }).optional(),
  featured: s.boolean({ coerce: true }).optional(),
  category: s.slug().optional(),
  city: s.enum(C.REGIONS).optional(),
  sort: s.enum(['recommended', 'rating', 'products', 'name']).default('recommended'),
  page,
  limit: limit(48, 24)
});

const shopDetailQuery = s.object({
  sort: s.enum(C.PRODUCT_SORTS).default('recommended'),
  category: s.slug().optional()
});

const reviewListQuery = s.object({
  product: s.objectId().optional(),
  shop: s.slug().optional(),
  page,
  limit: limit(20, 10)
});

const track = s
  .object({
    type: s.enum(['contact', 'product_view', 'shop_view']),
    channel: s.enum(C.CONTACT_CHANNELS).optional(),
    product: s.objectId().optional(),
    shop: s.slug().optional()
  })
  .refine((v) => (v.product || v.shop ? true : 'required'))
  .refine((v) => (v.type !== 'contact' || v.channel ? true : { code: 'required', path: 'channel' }));

const reviewCreate = s
  .object({
    target: s.enum(['product', 'shop']),
    product: s.objectId().optional(),
    shop: s.slug().optional(),
    rating: s.number({ integer: true, min: 1, max: 5 }),
    text: s.string({ min: 10, max: 1500, multiline: true })
  })
  .refine((v) => (v.target === 'product' ? (v.product ? true : { code: 'required', path: 'product' }) : v.shop ? true : { code: 'required', path: 'shop' }));

/* ------------------------------------------------------- catalog admin */

const nullableNumber = (max) => s.number({ min: 0, max }).nullable().default(null);

const productFields = {
  sku: s.string({ max: 32, upper: true, clean: false }).refine((v) => (SKU.test(v) ? true : 'invalid_sku')),
  slug: s.slug().optional(),
  name: s.localized({ min: 2, max: 160 }),
  description: optionalLocalized(4000, true),
  category: s.objectId(),
  brand: s.objectId().nullable().default(null),
  unit: s.enum(C.UNITS).default('piece'),
  price: s.number({ min: 0, max: 1e12 }),
  oldPrice: nullableNumber(1e12),
  colors: s.array(s.enum(C.COLORS), { max: 10, unique: true }).default(() => []),
  sizes: s.array(s.string({ min: 1, max: 40 }), { max: 12, unique: true }).default(() => []),
  specs: s
    .array(s.object({ label: s.localized({ min: 1, max: 60 }), value: s.localized({ min: 1, max: 120 }) }), { max: 24 })
    .default(() => []),
  stock: s.object({
    status: s.enum(C.STOCK_STATUSES),
    quantity: nullableNumber(1e9)
  }),
  leadTimeDays: s.number({ integer: true, min: 0, max: 365 }).default(0),
  images: s.array(s.url(), { min: 1, max: 10, unique: true }),
  isFeatured: s.boolean().default(false),
  isActive: s.boolean().default(true)
};

const productBody = s.object({ ...productFields, shop: s.objectId() });
const sellerProductBody = s.object(productFields);

const productPatch = s.object({
  isActive: s.boolean().optional(),
  isFeatured: s.boolean().optional(),
  stockStatus: s.enum(C.STOCK_STATUSES).optional(),
  stockQuantity: s.number({ min: 0, max: 1e9 }).nullable().optional(),
  price: s.number({ min: 0, max: 1e12 }).optional(),
  oldPrice: s.number({ min: 0, max: 1e12 }).nullable().optional()
});

const moderation = s.object({
  decision: s.enum(['approve', 'reject']),
  note: s.string({ max: 500, multiline: true }).default('')
});

const adminProductQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  category: s.objectId().optional(),
  shop: s.objectId().optional(),
  stock: s.enum(C.STOCK_STATUSES).optional(),
  status: s.enum(C.PRODUCT_STATUSES).optional(),
  active: s.enum(['active', 'inactive']).optional(),
  featured: s.boolean({ coerce: true }).optional(),
  discounted: s.boolean({ coerce: true }).optional(),
  sort: s.enum(['updated', 'name', 'price_asc', 'price_desc', 'sku', 'discount', 'views', 'submitted']).default('updated'),
  page,
  limit: limit(100, 25)
});

const categoryBody = s.object({
  slug: s.slug().optional(),
  name: s.localized({ min: 2, max: 80 }),
  description: optionalLocalized(400, true),
  parent: s.objectId().nullable().default(null),
  icon: s.enum(C.CATEGORY_ICONS).default('box'),
  image: s.url().default(''),
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

/** Shop fields editable by the owner (contacts, texts, hours, media). */
const shopOwnerFields = {
  name: s.string({ min: 2, max: 100 }),
  tagline: optionalLocalized(120),
  description: optionalLocalized(2000, true),
  address: optionalLocalized(200),
  landmark: optionalLocalized(160),
  city: s.enum(C.REGIONS).default('tashkent_city'),
  mapUrl: s.url({ allowRelative: false }).default(''),
  phone: s.phone(),
  phone2: s.phone().default(''),
  telegram: s.telegram().default(''),
  instagram: instagram().default(''),
  whatsapp: s.phone().default(''),
  email: s.email().default(''),
  website: s.url({ allowRelative: false }).default(''),
  workingHours: s
    .string({ max: 40, pattern: HOURS, patternCode: 'invalid_hours' })
    .transform((v) => v.replace(/\s*[–-]\s*/, '–'))
    .default('09:00–18:00'),
  workingDays: s.enum(C.WORKING_DAYS).default('mon_sat'),
  deliveryAvailable: s.boolean().default(false),
  deliveryNote: optionalLocalized(300),
  paymentMethods: s.array(s.enum(C.PAYMENT_METHODS), { max: 3, unique: true }).default(() => ['cash']),
  foundedYear: s.number({ integer: true, min: 1900, max: 2100 }).nullable().default(null),
  accent: s.string({ max: 7, clean: false, pattern: HEX_COLOR, patternCode: 'invalid_format' }).default('#FF7A1A'),
  logoUrl: s.url().default(''),
  coverUrl: s.url().default('')
};

const sellerShopBody = s.object(shopOwnerFields);

const shopBody = s.object({
  ...shopOwnerFields,
  slug: s.slug().optional(),
  ownerEmail: s.email().allowEmpty(),
  status: s.enum(C.SHOP_STATUSES).optional(),
  isVerified: s.boolean().default(false),
  isFeatured: s.boolean().default(false)
});

const shopStatus = s.object({
  status: s.enum(C.SHOP_STATUSES),
  note: s.string({ max: 500, multiline: true }).default('')
});

const listQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  active: s.enum(['active', 'inactive']).optional(),
  page,
  limit: limit(200, 50)
});

const shopListAdminQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  status: s.enum(C.SHOP_STATUSES).optional(),
  page,
  limit: limit(200, 50)
});

const reviewAdminQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  status: s.enum(C.REVIEW_STATUSES).optional(),
  target: s.enum(['product', 'shop']).optional(),
  page,
  limit: limit(100, 25)
});

const reviewModeration = s.object({ status: s.enum(['approved', 'rejected']) });

/* ------------------------------------------------------------ content */

const relativeOrHttps = s.url();

const bannerBody = s.object({
  title: s.localized({ min: 2, max: 120 }),
  subtitle: optionalLocalized(240),
  ctaLabel: optionalLocalized(40),
  link: relativeOrHttps.default('/catalog'),
  image: s.url().default(''),
  placement: s.enum(C.BANNER_PLACEMENTS).default('home_promo'),
  theme: s.enum(C.BANNER_THEMES).default('accent'),
  sortOrder: s.number({ integer: true, min: 0, max: 10000 }).default(100),
  isActive: s.boolean().default(true),
  startsAt: s.date().nullable().default(null),
  endsAt: s.date().nullable().default(null)
});

const settingsBody = s.object({
  contact: s
    .object({
      ownerName: s.string({ min: 2, max: 100 }),
      phone: s.string({ min: 7, max: 30 }),
      telegram: s.telegram().default(''),
      instagram: instagram().default(''),
      email: s.email().default(''),
      address: optionalLocalized(200),
      hours: optionalLocalized(120)
    })
    .optional(),
  home: s
    .object({
      eyebrow: optionalLocalized(80),
      title: optionalLocalized(80),
      accent: optionalLocalized(80),
      lead: optionalLocalized(300, true),
      popularTerms: optionalLocalized(300)
    })
    .optional(),
  announcement: s
    .object({
      isActive: s.boolean().default(false),
      text: optionalLocalized(200),
      link: relativeOrHttps.default('')
    })
    .optional(),
  sections: s
    .object({
      banners: s.boolean().default(true),
      featured: s.boolean().default(true),
      discounts: s.boolean().default(true),
      newest: s.boolean().default(true),
      popular: s.boolean().default(true),
      shops: s.boolean().default(true),
      brands: s.boolean().default(true),
      recent: s.boolean().default(true)
    })
    .optional()
});

const translationQuery = s.object({
  q: s.string({ max: 100 }).optional(),
  namespace: s.string({ max: 40, clean: false, pattern: /^[a-zA-Z]+$/ }).optional(),
  overridden: s.boolean({ coerce: true }).optional(),
  page,
  limit: limit(100, 40)
});

const translationBody = s.object({
  key: s.string({ max: 120, clean: false, pattern: /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/ }),
  uz: s.string({ max: 2000, multiline: true }).allowEmpty().default(''),
  ru: s.string({ max: 2000, multiline: true }).allowEmpty().default('')
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

const AUDIT_ENTITIES = ['product', 'category', 'brand', 'shop', 'review', 'banner', 'settings', 'translation', 'user', 'upload', 'session'];

const auditQuery = s.object({
  action: s.string({ max: 64, clean: false, pattern: /^[a-z_]+\.[a-z_]+$/ }).optional(),
  actor: s.string({ max: 254 }).optional(),
  entityType: s.enum(AUDIT_ENTITIES).optional(),
  entityId: s.string({ max: 64, clean: false, pattern: /^[A-Za-z0-9-._]+$/ }).optional(),
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
  registerShop,
  registerShopCrossChecks,
  changePassword,
  profile,
  favorites,
  productListQuery,
  lookupQuery,
  suggestQuery,
  shopListQuery,
  shopDetailQuery,
  reviewListQuery,
  track,
  reviewCreate,
  productBody,
  sellerProductBody,
  productPatch,
  moderation,
  adminProductQuery,
  categoryBody,
  brandBody,
  shopBody,
  sellerShopBody,
  shopStatus,
  listQuery,
  shopListAdminQuery,
  reviewAdminQuery,
  reviewModeration,
  bannerBody,
  settingsBody,
  translationQuery,
  translationBody,
  userCreate,
  userUpdate,
  userListQuery,
  auditQuery,
  AUDIT_ENTITIES
};

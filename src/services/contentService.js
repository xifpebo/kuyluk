'use strict';

/**
 * Editable site content: settings (contacts, home page texts, announcement,
 * home sections), promotional banners and interface translation overrides.
 *
 * Settings are cached in memory so server-rendered pages can read them
 * synchronously; the cache refreshes after every update and at most every
 * 60 seconds (for multi-instance deployments).
 */
const { Setting, Banner, Translation } = require('../models');
const { recordAudit, diff } = require('./audit');
const { invalidateCatalogCache } = require('./catalogService');
const { notFound, validationFailed } = require('../lib/errors');
const i18n = require('../i18n');
const SITE_KEY = 'site';
const REFRESH_MS = 60 * 1000;

const L = (uz = '', ru = '') => ({ uz, ru });

function defaults(config) {
  return {
    contact: {
      ownerName: config.ownerName,
      phone: config.supportPhone,
      telegram: config.supportTelegram,
      instagram: config.supportInstagram,
      email: '',
      address: L('Toshkent, Oʻzbekiston', 'Ташкент, Узбекистан'),
      hours: L('Har kuni 09:00–20:00', 'Ежедневно 09:00–20:00')
    },
    home: { eyebrow: L(), title: L(), accent: L(), lead: L(), popularTerms: L() },
    announcement: { isActive: false, text: L(), link: '' },
    sections: { banners: true, featured: true, discounts: true, newest: true, popular: true, shops: true, brands: true, recent: true }
  };
}

let cache = null;
let cacheAt = 0;
let defaultsCache = null;

function merge(base, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value === undefined ? base : value;
  const out = { ...base };
  for (const [key, child] of Object.entries(value)) {
    out[key] = base && typeof base[key] === 'object' && !Array.isArray(base[key]) ? merge(base[key], child) : child;
  }
  return out;
}

async function loadSettings(config) {
  defaultsCache = defaults(config);
  const doc = await Setting.findById(SITE_KEY).lean();
  cache = merge(defaultsCache, doc?.value || {});
  cacheAt = Date.now();
  return cache;
}

/** Synchronous accessor used by the page renderer. */
function currentSettings(config) {
  if (!cache) return defaults(config);
  if (Date.now() - cacheAt > REFRESH_MS) {
    cacheAt = Date.now();
    loadSettings(config).catch(() => {});
  }
  return cache;
}

async function getSettings(config) {
  return loadSettings(config);
}

async function updateSettings(req, config, input) {
  const before = await loadSettings(config);
  const value = merge(before, input);
  await Setting.updateOne({ _id: SITE_KEY }, { $set: { value, updatedBy: req.auth.userId } }, { upsert: true });
  const after = await loadSettings(config);
  invalidateCatalogCache();
  const changes = diff(before, after, ['contact', 'home', 'announcement', 'sections']);
  if (changes.length) await recordAudit(req, { action: 'settings.update', entity: { type: 'settings', id: SITE_KEY, label: 'site' }, changes });
  return after;
}

/** Public subset (no internal fields). */
function publicSettings(config) {
  const s = currentSettings(config);
  return { contact: s.contact, home: s.home, announcement: s.announcement, sections: s.sections };
}

/* -------------------------------------------------------------- banners */

function bannerJson(doc) {
  return { ...doc, id: String(doc._id), _id: undefined };
}

async function listBanners() {
  const docs = await Banner.find({}).sort({ placement: 1, sortOrder: 1, createdAt: -1 }).lean();
  return { items: docs.map(bannerJson), total: docs.length, page: 1, pages: 1, limit: docs.length };
}

async function getBanner(id) {
  const doc = await Banner.findById(id).lean();
  if (!doc) throw notFound();
  return bannerJson(doc);
}

function checkDates(input) {
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
    throw validationFailed({ endsAt: { code: 'date_too_early', params: {} } });
  }
}

async function createBanner(req, input) {
  checkDates(input);
  const doc = await Banner.create(input);
  invalidateCatalogCache();
  await recordAudit(req, { action: 'banner.create', entity: { type: 'banner', id: doc._id, label: doc.title.uz } });
  return bannerJson(doc.toObject());
}

async function updateBanner(req, id, input) {
  checkDates(input);
  const before = await Banner.findById(id).lean();
  if (!before) throw notFound();
  await Banner.updateOne({ _id: before._id }, { $set: input }, { runValidators: true });
  const after = await Banner.findById(before._id).lean();
  invalidateCatalogCache();
  const changes = diff(before, after, ['title', 'subtitle', 'ctaLabel', 'link', 'image', 'placement', 'theme', 'sortOrder', 'isActive', 'startsAt', 'endsAt']);
  if (changes.length) await recordAudit(req, { action: 'banner.update', entity: { type: 'banner', id: before._id, label: after.title.uz }, changes });
  return bannerJson(after);
}

async function removeBanner(req, id) {
  const doc = await Banner.findById(id).lean();
  if (!doc) throw notFound();
  await Banner.deleteOne({ _id: doc._id });
  invalidateCatalogCache();
  await recordAudit(req, { action: 'banner.delete', entity: { type: 'banner', id: doc._id, label: doc.title.uz } });
}

/* --------------------------------------------------------- translations */

async function loadTranslations() {
  const rows = await Translation.find({}).lean();
  i18n.setOverrides(rows);
  return rows.length;
}

async function listTranslations(query) {
  let rows = i18n.flatKeys(query.namespace || 'all');
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter((row) =>
      [row.key, row.base.uz, row.base.ru, row.override.uz, row.override.ru].some((text) => String(text).toLowerCase().includes(needle))
    );
  }
  if (query.overridden) rows = rows.filter((row) => row.override.uz || row.override.ru);
  const total = rows.length;
  const items = rows.slice((query.page - 1) * query.limit, query.page * query.limit);
  const namespaces = [...new Set(i18n.flatKeys('all').map((row) => row.key.split('.')[0]))];
  return { items, total, page: query.page, pages: Math.ceil(total / query.limit), limit: query.limit, namespaces };
}

async function saveTranslation(req, input) {
  if (!i18n.isOverridableKey(input.key)) throw validationFailed({ key: { code: 'invalid_choice', params: {} } });
  const before = await Translation.findOne({ key: input.key }).lean();
  if (!input.uz && !input.ru) {
    await Translation.deleteOne({ key: input.key });
  } else {
    await Translation.updateOne(
      { key: input.key },
      { $set: { uz: input.uz, ru: input.ru, updatedBy: req.auth.userId } },
      { upsert: true }
    );
  }
  await loadTranslations();
  await recordAudit(req, {
    action: 'translation.update',
    entity: { type: 'translation', id: input.key, label: input.key },
    changes: [
      { field: 'uz', from: before?.uz || null, to: input.uz || null },
      { field: 'ru', from: before?.ru || null, to: input.ru || null }
    ]
  });
  return i18n.flatKeys('all').find((row) => row.key === input.key);
}

/** Load settings and translation overrides into memory (call at startup). */
async function prepareContent(config) {
  await loadSettings(config);
  await loadTranslations();
}

module.exports = {
  prepareContent,
  loadSettings,
  currentSettings,
  getSettings,
  updateSettings,
  publicSettings,
  listBanners,
  getBanner,
  createBanner,
  updateBanner,
  removeBanner,
  loadTranslations,
  listTranslations,
  saveTranslation
};

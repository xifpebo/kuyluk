'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function int(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Build a frozen configuration object from environment variables.
 * Throws on unsafe production settings so misconfiguration fails fast.
 */
function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const port = int(env.PORT, 5000, { min: 0, max: 65535 });
  const errors = [];
  const warnings = [];

  let appSecret = env.APP_SECRET || '';
  let ephemeralSecret = false;
  if (!appSecret) {
    if (isProduction) errors.push('APP_SECRET is required in production (run `npm run setup` to generate one).');
    appSecret = crypto.randomBytes(32).toString('hex');
    ephemeralSecret = true;
    if (!isTest) warnings.push('APP_SECRET is not set; using a temporary secret. CSRF tokens reset on every restart.');
  } else if (appSecret.length < 32) {
    errors.push('APP_SECRET must be at least 32 characters long.');
  }

  const appOrigin = (env.APP_ORIGIN || `http://localhost:${port || 5000}`).replace(/\/+$/, '');
  let originUrl;
  try {
    originUrl = new URL(appOrigin);
  } catch {
    errors.push(`APP_ORIGIN is not a valid URL: ${appOrigin}`);
    originUrl = new URL('http://localhost');
  }
  const extraOrigins = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const cookieSecureSetting = (env.COOKIE_SECURE || 'auto').toLowerCase();
  const cookieSecure = cookieSecureSetting === 'auto' ? originUrl.protocol === 'https:' : bool(cookieSecureSetting, false);
  if (isProduction && !cookieSecure && !bool(env.ALLOW_INSECURE_COOKIES, false)) {
    errors.push('Production requires HTTPS cookies: set APP_ORIGIN to an https:// URL (or COOKIE_SECURE=true).');
  }

  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  if (trustProxy === true) {
    warnings.push('TRUST_PROXY=true trusts every hop; prefer a hop count (e.g. 1) or explicit proxy addresses.');
  }

  const defaultLang = ['uz', 'ru'].includes(env.DEFAULT_LANG) ? env.DEFAULT_LANG : 'uz';
  const fontProvider = ['google', 'system', 'local'].includes(env.FONT_PROVIDER) ? env.FONT_PROVIDER : 'local';

  const flag = (value, fallback) => (value === undefined || value === '' ? fallback : /^(1|true|yes|on)$/i.test(value));
  // An empty database is filled with the demo marketplace on start-up, so a
  // new installation never shows an empty site. Demo accounts (published test
  // passwords) are created automatically only outside production.
  const seedDemoData = flag(env.SEED_DEMO_DATA, !isTest);
  const seedDemoAccounts = flag(env.SEED_DEMO_ACCOUNTS, !isProduction && !isTest);
  if (isProduction && seedDemoAccounts) {
    warnings.push('SEED_DEMO_ACCOUNTS=true in production: demo accounts with published passwords will be created. Delete them before going live.');
  }

  const config = {
    rootDir: ROOT_DIR,
    env: nodeEnv,
    isProduction,
    isTest,
    isDevelopment: !isProduction && !isTest,
    port,
    host: env.HOST || '0.0.0.0',
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stroy-bazar',
    appSecret,
    ephemeralSecret,
    appOrigin: originUrl.origin,
    allowedOrigins: [originUrl.origin, ...extraOrigins],
    siteName: env.SITE_NAME || 'Stroy Bazar',
    supportPhone: env.SUPPORT_PHONE || '+998 90 098 00 23',
    supportTelegram: (env.SUPPORT_TELEGRAM || 'iafys').replace(/^@/, ''),
    supportInstagram: (env.SUPPORT_INSTAGRAM || 'xifpebo').replace(/^@/, ''),
    ownerName: env.OWNER_NAME || 'Alisherbek Bobokulov',
    seedDemoData,
    seedDemoAccounts,
    trustProxy,
    cookieSecure,
    defaultLang,
    fontProvider,
    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
    session: {
      staffIdleMinutes: int(env.SESSION_IDLE_MINUTES_STAFF, 30, { min: 5, max: 24 * 60 }),
      staffAbsoluteHours: int(env.SESSION_ABSOLUTE_HOURS_STAFF, 12, { min: 1, max: 24 * 7 }),
      sellerIdleHours: int(env.SESSION_IDLE_HOURS_SELLER, 8, { min: 1, max: 72 }),
      sellerAbsoluteDays: int(env.SESSION_ABSOLUTE_DAYS_SELLER, 7, { min: 1, max: 30 }),
      userIdleDays: int(env.SESSION_IDLE_DAYS_USER, 14, { min: 1, max: 90 }),
      userAbsoluteDays: int(env.SESSION_ABSOLUTE_DAYS_USER, 30, { min: 1, max: 365 })
    },
    auth: {
      maxFailedAttempts: int(env.LOGIN_MAX_ATTEMPTS, 5, { min: 3, max: 20 }),
      lockMinutes: int(env.LOGIN_LOCK_MINUTES, 15, { min: 1, max: 24 * 60 }),
      passwordHistory: int(env.PASSWORD_HISTORY, 5, { min: 0, max: 24 })
    },
    rateLimit: {
      store: env.RATE_LIMIT_STORE === 'memory' ? 'memory' : 'mongo',
      disabled: bool(env.RATE_LIMIT_DISABLED, false) && !isProduction
    },
    uploads: {
      dir: path.resolve(ROOT_DIR, env.UPLOAD_DIR || 'uploads'),
      maxBytes: int(env.UPLOAD_MAX_MB, 5, { min: 1, max: 20 }) * 1024 * 1024
    },
    auditRetentionDays: int(env.AUDIT_RETENTION_DAYS, 365, { min: 0, max: 3650 }),
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || '',
      chatId: env.TELEGRAM_CHAT_ID || ''
    },
    warnings
  };

  if (errors.length) {
    const error = new Error(`Invalid configuration:\n - ${errors.join('\n - ')}`);
    error.code = 'CONFIG_INVALID';
    throw error;
  }
  return Object.freeze(config);
}

module.exports = { loadConfig, ROOT_DIR };

'use strict';

/**
 * Integration test harness: an in-memory MongoDB (tools/mini-mongo), the real
 * Express app on a random port and a tiny fetch client with a cookie jar and
 * automatic CSRF tokens.
 */
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { startMiniMongo } = require('../tools/mini-mongo');

const PASSWORDS = {
  admin: 'Toshkent#Kran2026!',
  manager: 'Olma$Daraxt2026?',
  customer: 'Qizil&Tosh2026*'
};

async function startTestApp({ env = {} } = {}) {
  const mongo = await startMiniMongo();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.uriFor(`bbb-test-${crypto.randomBytes(4).toString('hex')}`),
    APP_SECRET: crypto.randomBytes(32).toString('hex'),
    APP_ORIGIN: 'http://127.0.0.1',
    UPLOAD_DIR: path.join(os.tmpdir(), `bbb-test-uploads-${process.pid}`),
    RATE_LIMIT_STORE: 'memory',
    FONT_PROVIDER: 'system',
    LOG_LEVEL: 'silent',
    ...env
  });

  try {
    return await boot(mongo);
  } catch (error) {
    await mongo.stop().catch(() => {});
    throw error;
  }
}

async function boot(mongo) {
  const { loadConfig } = require('../src/config');
  const { createLogger, setLogger } = require('../src/logger');
  const config = loadConfig();
  setLogger(createLogger({ level: 'silent' }));
  const { connectDatabase, disconnectDatabase } = require('../src/db');
  const { createApp } = require('../src/app');
  const { seedCatalog, seedDemoQuotes } = require('../src/seed');
  const { createUser } = require('../src/services/authService');

  await connectDatabase(config.mongoUri);
  await seedCatalog({ log: () => {} });
  await seedDemoQuotes({ log: () => {} });
  const users = {
    admin: await createUser({ email: 'admin@test.local', name: 'Test Admin', role: 'superadmin', password: PASSWORDS.admin }),
    manager: await createUser({ email: 'manager@test.local', name: 'Test Manager', role: 'manager', password: PASSWORDS.manager }),
    customer: await createUser({ email: 'customer@test.local', name: 'Test Customer', role: 'user', password: PASSWORDS.customer })
  };

  const app = createApp({ config });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
    await mongo.stop();
  }

  return { config, baseUrl, users, stop, client: (options) => createClient(baseUrl, options) };
}

function createClient(baseUrl, { lang = 'uz' } = {}) {
  const jar = new Map();
  let csrfToken = null;

  function storeCookies(response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((a) => /^\s*expires=/i.test(a) && new Date(a.split('=')[1]) < new Date()) || value === '';
      if (expired) jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function request(method, url, { body, headers = {}, csrf = true, raw = false } = {}) {
    const init = { method, headers: { Accept: 'application/json', ...(lang ? { 'X-Lang': lang } : {}), ...headers }, redirect: 'manual' };
    if (jar.size) init.headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) init.body = body;
      else {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
      }
    }
    if (csrf && !['GET', 'HEAD'].includes(method)) {
      if (!csrfToken) await refresh();
      init.headers['X-CSRF-Token'] = init.headers['X-CSRF-Token'] ?? csrfToken;
      if (jar.size) init.headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const response = await fetch(`${baseUrl}${url}`, init);
    storeCookies(response);
    const type = response.headers.get('content-type') || '';
    const data = raw ? await response.text() : type.includes('json') ? await response.json() : await response.text();
    if (data && typeof data === 'object' && typeof data.csrfToken === 'string') csrfToken = data.csrfToken;
    return { status: response.status, headers: response.headers, data };
  }

  async function refresh() {
    const result = await request('GET', '/api/auth/session');
    csrfToken = result.data.csrfToken;
    return result.data;
  }

  return {
    jar,
    get: (url, options) => request('GET', url, options),
    post: (url, body, options) => request('POST', url, { ...options, body }),
    put: (url, body, options) => request('PUT', url, { ...options, body }),
    patch: (url, body, options) => request('PATCH', url, { ...options, body }),
    del: (url, options) => request('DELETE', url, options),
    session: refresh,
    async login(email, password, surface = 'site') {
      const path = surface === 'admin' ? '/api/auth/admin/login' : '/api/auth/login';
      return request('POST', path, { body: { email, password } });
    }
  };
}

module.exports = { startTestApp, PASSWORDS };

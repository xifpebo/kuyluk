'use strict';

/**
 * Offline demo without a MongoDB installation.
 *
 *   npm run demo              # keeps data between restarts in .data/demo-db.json
 *   npm run demo -- --fresh   # start again from the original demo data
 *
 * Starts the bundled MiniMongo server (tools/mini-mongo), seeds the demo
 * marketplace (shops, products, reviews, banners) and the demo accounts, and
 * starts the app. Not for production use — use a real MongoDB there.
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { startMiniMongo } = require('../tools/mini-mongo');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, '.data');

function demoSecret() {
  // A stable secret keeps CSRF tokens valid across demo restarts.
  const file = path.join(DATA_DIR, 'demo-secret');
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  const persistFile = path.join(DATA_DIR, 'demo-db.json');
  if (fresh && fs.existsSync(persistFile)) fs.rmSync(persistFile);
  const mongo = await startMiniMongo({ persistFile });
  const port = process.env.PORT || '5000';
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGODB_URI: mongo.uriFor('stroy-bazar-demo'),
    APP_SECRET: demoSecret(),
    APP_ORIGIN: process.env.APP_ORIGIN || `http://localhost:${port}`,
    PORT: port,
    UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads'),
    RATE_LIMIT_STORE: 'memory',
    LOG_LEVEL: process.env.LOG_LEVEL || 'warn'
  });

  const { loadConfig } = require('../src/config');
  const { createLogger, setLogger } = require('../src/logger');
  const config = loadConfig();
  setLogger(createLogger({ level: config.logLevel }));
  const { connectDatabase } = require('../src/db');
  const { createApp } = require('../src/app');
  const { seedCatalog, seedDemoAccounts } = require('../src/seed');
  const { prepareContent } = require('../src/services/contentService');

  fs.mkdirSync(config.uploads.dir, { recursive: true });
  await connectDatabase(config.mongoUri);
  const seeded = await seedCatalog({ withAccounts: true });
  const accounts = seeded.skipped ? null : await seedDemoAccounts();
  await prepareContent(config);

  const app = createApp({ config });
  app.listen(config.port, () => {
    const line = '─'.repeat(72);
    const rows = [
      line,
      ` ${config.siteName} — demo (data kept in .data/demo-db.json; --fresh to reset)`,
      line,
      ` Site:          ${config.appOrigin}`,
      ` Admin panel:   ${config.appOrigin}/admin`,
      ` Seller panel:  ${config.appOrigin}/seller`,
      ''
    ];
    if (accounts) {
      rows.push(` Admin         ${accounts.admin.email.padEnd(28)} ${accounts.admin.password}`);
      rows.push(` Manager       ${accounts.manager.email.padEnd(28)} ${accounts.manager.password}`);
      rows.push(` Customer      ${accounts.customer.email.padEnd(28)} ${accounts.customer.password}`);
      for (const owner of accounts.owners) rows.push(` Shop owner    ${owner.email.padEnd(28)} ${owner.password}   (${owner.shop})`);
    } else {
      rows.push(' Demo accounts: see README.md → "Demo accounts"');
    }
    rows.push(line, '');
    process.stdout.write(rows.join('\n'));
  });

  const stop = async () => {
    await mongo.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  process.stderr.write(`Demo failed to start: ${error.stack || error.message}\n`);
  process.exit(1);
});

'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const { loadConfig } = require('./src/config');
const { createLogger, setLogger } = require('./src/logger');

/** First start on an empty database: load the demo shops, products and accounts. */
async function seedIfEmpty(config, logger) {
  if (!config.seedDemoData) return;
  const { Product, Category } = require('./src/models');
  if ((await Product.estimatedDocumentCount()) > 0 || (await Category.estimatedDocumentCount()) > 0) return;
  const { seedCatalog, seedDemoAccounts } = require('./src/seed');
  await seedCatalog({ withAccounts: config.seedDemoAccounts, log: (message) => logger.info(message) });
  logger.info('Empty database: demo marketplace loaded (set SEED_DEMO_DATA=false to disable)');
  if (config.seedDemoAccounts) {
    await seedDemoAccounts();
    logger.info('Demo accounts created — see README.md → "Demo accounts" (set SEED_DEMO_ACCOUNTS=false to disable)');
  }
}

/**
 * Make sure someone can always sign in to /admin:
 *  - ADMIN_EMAIL + ADMIN_PASSWORD in the environment: that super-admin is
 *    created, or repaired (password, role, active, lockout) when it does not
 *    match. Remove the variables once you have signed in.
 *  - otherwise, when no super-admin exists and demo accounts are enabled, the
 *    demo accounts from the README are created.
 */
async function ensureAdminAccess(config, logger) {
  const { User } = require('./src/models');
  const { ensureSuperadmin, seedDemoAccounts } = require('./src/seed');
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && password) {
    const { verifyPassword } = require('./src/security/password');
    const user = await User.findOne({ email }).select('+passwordHash').lean();
    const usable =
      user && user.role === 'superadmin' && user.isActive !== false && !(user.lockUntil > new Date()) && (await verifyPassword(password, user.passwordHash));
    if (!usable) {
      try {
        await ensureSuperadmin({ email, name: process.env.ADMIN_NAME || config.ownerName, password });
        logger.warn(`Super-admin ${email} is ready (from ADMIN_EMAIL/ADMIN_PASSWORD). Remove ADMIN_PASSWORD from the environment after signing in.`);
      } catch (error) {
        logger.error(`ADMIN_EMAIL/ADMIN_PASSWORD ignored: ${error.message}`);
      }
    }
    return;
  }
  if (await User.exists({ role: 'superadmin', isActive: true })) return;
  if (config.seedDemoAccounts) {
    await seedDemoAccounts();
    logger.info('No super-admin found: demo accounts created — admin@stroybazar.uz (password in README.md → "Demo accounts")');
  } else {
    logger.warn('No super-admin account exists. Run `npm run create-admin`, or set ADMIN_EMAIL and ADMIN_PASSWORD and restart.');
  }
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  const logger = createLogger({ level: config.logLevel, json: config.isProduction });
  setLogger(logger);
  config.warnings.forEach((warning) => logger.warn(warning));

  // Loaded after the logger is configured so modules pick it up.
  const { connectDatabase, disconnectDatabase } = require('./src/db');
  const { createApp } = require('./src/app');

  fs.mkdirSync(config.uploads.dir, { recursive: true });
  await connectDatabase(config.mongoUri);
  await seedIfEmpty(config, logger);
  await ensureAdminAccess(config, logger);
  await require('./src/services/contentService').prepareContent(config);

  const app = createApp({ config });
  const server = app.listen(config.port, config.host, () => {
    logger.info(`${config.siteName} listening`, { url: config.appOrigin, port: config.port, env: config.env });
  });
  server.requestTimeout = 60 * 1000;
  server.headersTimeout = 20 * 1000;
  server.keepAliveTimeout = 5 * 1000;

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });
    const force = setTimeout(() => process.exit(1), 10 * 1000);
    force.unref();
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { err: reason instanceof Error ? reason : new Error(String(reason)) });
  });
}

main().catch((error) => {
  process.stderr.write(`Failed to start: ${error.stack || error.message}\n`);
  process.exit(1);
});

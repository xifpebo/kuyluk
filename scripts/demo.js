'use strict';

/**
 * Offline preview without a MongoDB installation.
 *
 * Starts the bundled in-memory MiniMongo server (tools/mini-mongo), seeds the
 * demo catalog and quote requests, creates a super-admin and a manager with
 * random one-time passwords (printed below) and starts the app.
 * Everything is lost when the process stops. Not for production use.
 */
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { startMiniMongo } = require('../tools/mini-mongo');

async function main() {
  const mongo = await startMiniMongo();
  const port = process.env.PORT || '5000';
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGODB_URI: mongo.uriFor('big-bazaar-build-demo'),
    APP_SECRET: process.env.APP_SECRET || crypto.randomBytes(32).toString('hex'),
    APP_ORIGIN: process.env.APP_ORIGIN || `http://localhost:${port}`,
    PORT: port,
    UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'big-bazaar-build-demo-uploads'),
    LOG_LEVEL: process.env.LOG_LEVEL || 'warn'
  });

  const { loadConfig } = require('../src/config');
  const { createLogger, setLogger } = require('../src/logger');
  const config = loadConfig();
  setLogger(createLogger({ level: config.logLevel }));
  const { connectDatabase } = require('../src/db');
  const { createApp } = require('../src/app');
  const { seedCatalog, seedDemoQuotes, ensureSuperadmin } = require('../src/seed');
  const { createUser } = require('../src/services/authService');
  const { generateTemporaryPassword } = require('../src/security/password');

  await connectDatabase(config.mongoUri);
  await seedCatalog();
  await seedDemoQuotes();
  const adminPassword = generateTemporaryPassword();
  const managerPassword = generateTemporaryPassword();
  await ensureSuperadmin({ email: 'admin@demo.local', name: 'Demo Super Admin', password: adminPassword });
  await createUser({
    email: 'manager@demo.local',
    name: 'Demo Manager',
    role: 'manager',
    password: managerPassword
  });

  const app = createApp({ config });
  app.listen(config.port, () => {
    const line = '─'.repeat(64);
    process.stdout.write(
      [
        line,
        ` ${config.siteName} — offline demo (in-memory data, resets on exit)`,
        line,
        ` Site:        ${config.appOrigin}`,
        ` Admin panel: ${config.appOrigin}/admin`,
        '',
        ` Super-admin  admin@demo.local    ${adminPassword}`,
        ` Manager      manager@demo.local  ${managerPassword}`,
        line,
        ''
      ].join('\n')
    );
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

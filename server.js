'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const { loadConfig } = require('./src/config');
const { createLogger, setLogger } = require('./src/logger');

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

'use strict';

/**
 * Seed the construction catalog.
 *   npm run seed                 # only if the catalog is empty
 *   npm run seed -- --reset      # replace catalog + quote requests (users/audit untouched)
 *   npm run seed -- --demo-quotes
 */
require('dotenv').config({ quiet: true });

const { loadConfig } = require('../src/config');
const { connectDatabase, disconnectDatabase } = require('../src/db');
const { seedCatalog, seedDemoQuotes } = require('../src/seed');

async function main() {
  const args = new Set(process.argv.slice(2));
  const config = loadConfig({ ...process.env, NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development' });
  await connectDatabase(config.mongoUri);
  const log = (message) => process.stdout.write(`${message}\n`);
  await seedCatalog({ reset: args.has('--reset'), log });
  if (args.has('--demo-quotes')) await seedDemoQuotes({ log });
  await disconnectDatabase();
}

main().catch(async (error) => {
  process.stderr.write(`Seeding failed: ${error.message}\n`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});

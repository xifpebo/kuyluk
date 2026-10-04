'use strict';

/**
 * Seed the demo marketplace.
 *   npm run seed                          # only if the catalog is empty
 *   npm run seed -- --reset               # replace catalog data (users/audit untouched)
 *   npm run seed -- --demo-accounts       # also create the demo admin, owners and customer
 */
require('dotenv').config({ quiet: true });

const { loadConfig } = require('../src/config');
const { connectDatabase, disconnectDatabase } = require('../src/db');
const { seedCatalog, seedDemoAccounts } = require('../src/seed');

async function main() {
  const args = new Set(process.argv.slice(2));
  const config = loadConfig({ ...process.env, NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development' });
  const withAccounts = args.has('--demo-accounts');
  if (withAccounts && config.isProduction) {
    throw new Error('Refusing to create demo accounts with known passwords in production.');
  }
  await connectDatabase(config.mongoUri);
  const log = (message) => process.stdout.write(`${message}\n`);
  await seedCatalog({ reset: args.has('--reset'), withAccounts, log });
  if (withAccounts) {
    const accounts = await seedDemoAccounts();
    log(`Demo accounts ready (admin: ${accounts.admin.email}). See README.md for every password.`);
  }
  await disconnectDatabase();
}

main().catch(async (error) => {
  process.stderr.write(`Seeding failed: ${error.message}\n`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});

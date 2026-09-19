'use strict';

/**
 * Create (or promote) a super-admin account.
 *
 * Interactive:      npm run create-admin
 * Non-interactive:  ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin
 *
 * The password must satisfy the policy (12+ chars, upper, lower, digit, symbol).
 * No default credentials exist anywhere in the project.
 */
require('dotenv').config({ quiet: true });

const readline = require('node:readline');
const { loadConfig } = require('../src/config');
const { connectDatabase, disconnectDatabase } = require('../src/db');
const { ensureSuperadmin } = require('../src/seed');
const { recordAudit } = require('../src/services/audit');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (text) => {
        if (text.includes(question)) rl.output.write(text);
        else rl.output.write('*');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main() {
  const config = loadConfig({ ...process.env, NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development' });
  let email = process.env.ADMIN_EMAIL;
  let name = process.env.ADMIN_NAME;
  let password = process.env.ADMIN_PASSWORD;
  if (!email) email = await ask('Super-admin e-mail: ');
  if (!name) name = (await ask('Full name: ')) || 'Super Admin';
  if (!password) {
    password = await ask('Password (min 12 chars, upper/lower/digit/symbol): ', { hidden: true });
    const confirm = await ask('Repeat password: ', { hidden: true });
    if (password !== confirm) throw new Error('Passwords do not match.');
  }
  await connectDatabase(config.mongoUri);
  const { user, created } = await ensureSuperadmin({ email, name, password });
  await recordAudit(null, {
    action: created ? 'user.create' : 'user.update',
    actor: { _id: null, email: 'cli', name: 'create-superadmin', role: 'system' },
    entity: { type: 'user', id: user._id, label: user.email },
    meta: { role: 'superadmin', source: 'cli' }
  });
  process.stdout.write(`${created ? 'Created' : 'Updated'} super-admin ${user.email}\n`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  process.stderr.write(`${error.message}\n`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});

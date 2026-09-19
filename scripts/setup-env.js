'use strict';

/**
 * Create .env from .env.example with a freshly generated APP_SECRET.
 * Never overwrites an existing .env.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, '.env');
const example = path.join(root, '.env.example');

if (fs.existsSync(target)) {
  process.stdout.write('.env already exists — leaving it unchanged.\n');
  process.exit(0);
}

const secret = crypto.randomBytes(48).toString('base64url');
const content = fs
  .readFileSync(example, 'utf8')
  .replace(/^APP_SECRET=.*$/m, `APP_SECRET=${secret}`);
fs.writeFileSync(target, content, { mode: 0o600 });
process.stdout.write('Created .env with a new APP_SECRET.\n');

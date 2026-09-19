'use strict';

/**
 * Password hashing (scrypt, Node built-in) and the password policy.
 *
 * Hash format: scrypt$<log2 N>$<r>$<p>$<salt b64url>$<hash b64url>
 * Parameters follow the OWASP Password Storage Cheat Sheet
 * (N=2^15, r=8, p=3 — 32 MiB per hash).
 */
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// The test suite uses cheaper parameters so hundreds of logins stay fast.
const PARAMS = Object.freeze(
  process.env.NODE_ENV === 'test'
    ? { logN: 12, r: 8, p: 1, keyLength: 64, saltLength: 16 }
    : { logN: 15, r: 8, p: 3, keyLength: 64, saltLength: 16 }
);
const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

function toB64(buf) {
  return buf.toString('base64url');
}

async function derive(password, salt, { logN, r, p, keyLength }) {
  const N = 2 ** logN;
  return scrypt(password.normalize('NFKC'), salt, keyLength, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(PARAMS.saltLength);
  const hash = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.logN, PARAMS.r, PARAMS.p, toB64(salt), toB64(hash)].join('$');
}

function parseHash(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, logN, r, p, salt, hash] = parts;
  const params = { logN: Number(logN), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.logN) || params.logN < 10 || params.logN > 20) return null;
  if (!Number.isInteger(params.r) || params.r < 1 || params.r > 32) return null;
  if (!Number.isInteger(params.p) || params.p < 1 || params.p > 16) return null;
  const saltBuf = Buffer.from(salt, 'base64url');
  const hashBuf = Buffer.from(hash, 'base64url');
  if (saltBuf.length < 16 || hashBuf.length < 32) return null;
  return { ...params, keyLength: hashBuf.length, salt: saltBuf, hash: hashBuf };
}

let dummyHashPromise = null;

/** A valid hash of a random secret, used to equalise timing for unknown users. */
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(24).toString('hex'));
  return dummyHashPromise;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_LENGTH * 2) {
    return false;
  }
  const parsed = parseHash(stored);
  if (!parsed) {
    // Still spend comparable time so malformed records do not leak via timing.
    await derive(password, crypto.randomBytes(16), PARAMS);
    return false;
  }
  const candidate = await derive(password, parsed.salt, parsed);
  return candidate.length === parsed.hash.length && crypto.timingSafeEqual(candidate, parsed.hash);
}

function needsRehash(stored) {
  const parsed = parseHash(stored);
  if (!parsed) return true;
  return parsed.logN !== PARAMS.logN || parsed.r !== PARAMS.r || parsed.p !== PARAMS.p || parsed.keyLength !== PARAMS.keyLength;
}

// Frequently breached passwords and patterns (compared after normalisation).
const COMMON = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'letmein', 'welcome', 'admin',
  'administrator', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'master', 'sunshine', 'princess',
  'superman', 'batman', 'trustno', 'starwars', 'whatever', 'freedom', 'shadow', 'michael', 'secret',
  'changeme', 'default', 'login', 'access', 'root', 'toor', 'test', 'tester', 'guest', 'user', 'manager',
  'superadmin', 'bigbazaar', 'bazaar', 'build', 'building', 'stroy', 'qurilish', 'toshkent', 'tashkent',
  'uzbekistan', 'ozbekiston', 'parol', 'parol123', 'пароль', 'йцукен', 'qazwsx', 'abcdef', 'abcdefgh',
  'abc', 'company', 'summer', 'winter', 'spring', 'autumn', 'january', 'december', 'ninja', 'mustang',
  'jordan', 'hunter', 'ranger', 'hello', 'charlie', 'donald', 'soccer', 'hockey', 'killer', 'pepper',
  'cheese', 'computer', 'internet', 'service', 'samsung', 'apple', 'google', 'microsoft', 'windows',
  'zaq', 'qweasdzxc', 'asdasd', 'qwe', 'aaa', 'love', 'lovely', 'flower', 'baby', 'angel', 'family'
]);

// Context-specific words that must not appear anywhere in a password.
const CONTEXT_WORDS = ['bigbazaar', 'bazaar', 'bazar', 'qurilish', 'password', 'parol', 'пароль', 'admin', 'qwerty', 'йцукен'];

const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1q2w3e4r5t'];

function hasSequence(lower, length = 5) {
  for (const seq of SEQUENCES) {
    for (let i = 0; i + length <= seq.length; i += 1) {
      const chunk = seq.slice(i, i + length);
      const reversed = [...chunk].reverse().join('');
      if (lower.includes(chunk) || lower.includes(reversed)) return true;
    }
  }
  return false;
}

/**
 * Returns a list of policy violation codes (empty when the password is acceptable).
 * Codes map to `validation.password_*` translations.
 */
function checkPasswordPolicy(password, { email = '', name = '' } = {}) {
  const issues = [];
  if (typeof password !== 'string') return ['password_too_short'];
  const length = [...password].length;
  if (length < MIN_LENGTH) issues.push('password_too_short');
  if (length > MAX_LENGTH) issues.push('password_too_long');
  if (!/\p{Ll}/u.test(password)) issues.push('password_lowercase');
  if (!/\p{Lu}/u.test(password)) issues.push('password_uppercase');
  if (!/\p{Nd}/u.test(password)) issues.push('password_digit');
  if (!/[^\p{L}\p{Nd}\s]/u.test(password)) issues.push('password_symbol');
  if (/(.)\1{3,}/u.test(password)) issues.push('password_repeated');

  const lower = password.toLowerCase();
  const lettersOnly = lower.replace(/[^\p{L}]/gu, '');
  if (
    COMMON.has(lower) ||
    COMMON.has(lettersOnly) ||
    hasSequence(lower) ||
    CONTEXT_WORDS.some((word) => lettersOnly.includes(word))
  ) {
    issues.push('password_common');
  }

  const personal = [];
  const localPart = String(email).toLowerCase().split('@')[0] || '';
  if (localPart.length >= 3) personal.push(localPart);
  for (const part of String(name).toLowerCase().split(/\s+/)) {
    if (part.length >= 3) personal.push(part);
  }
  if (personal.some((token) => lower.includes(token))) issues.push('password_personal');
  return [...new Set(issues)];
}

/** Random password that satisfies the policy (for staff onboarding / resets). */
function generateTemporaryPassword(length = 18) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#%^*-_=+?'];
  const all = sets.join('');
  const pick = (chars) => chars[crypto.randomInt(chars.length)];
  for (;;) {
    const chars = sets.map(pick);
    while (chars.length < length) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join('');
    if (checkPasswordPolicy(candidate).length === 0) return candidate;
  }
}

module.exports = {
  PARAMS,
  MIN_LENGTH,
  MAX_LENGTH,
  hashPassword,
  verifyPassword,
  needsRehash,
  dummyHash,
  checkPasswordPolicy,
  generateTemporaryPassword
};

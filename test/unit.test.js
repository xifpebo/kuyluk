'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkPasswordPolicy, hashPassword, verifyPassword } = require('../src/security/password');
const { unitPriceFor, lineTotal, checkQuantity } = require('../src/lib/pricing');
const { cleanText, normalizeForSearch, slugify } = require('../src/lib/text');
const { s, validate } = require('../src/lib/schema');

const NUL = String.fromCharCode(0);
const RLO = String.fromCharCode(0x202e);

describe('password policy', () => {
  it('accepts strong passphrases', () => {
    assert.deepEqual(checkPasswordPolicy('Gazobeton#Blok2026'), []);
  });

  it('rejects weak, common and personal passwords', () => {
    assert.ok(checkPasswordPolicy('short').includes('password_too_short'));
    assert.ok(checkPasswordPolicy('Password123!').includes('password_common'));
    assert.ok(checkPasswordPolicy('Aziz#Karimov2026', { name: 'Aziz Karimov' }).includes('password_personal'));
    assert.ok(checkPasswordPolicy('alllowercase123!').includes('password_uppercase'));
  });

  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('Gazobeton#Blok2026');
    const b = await hashPassword('Gazobeton#Blok2026');
    assert.notEqual(a, b);
    assert.match(a, /^scrypt\$/);
    assert.ok(await verifyPassword('Gazobeton#Blok2026', a));
    assert.ok(!(await verifyPassword('gazobeton#blok2026', a)));
  });
});

describe('bulk pricing', () => {
  const product = {
    price: 1000,
    minOrderQty: 2,
    orderStep: 2,
    unit: 'bag',
    priceTiers: [
      { minQty: 10, price: 900 },
      { minQty: 50, price: 800 }
    ]
  };

  it('applies the best tier', () => {
    assert.equal(unitPriceFor(product, 4), 1000);
    assert.equal(unitPriceFor(product, 10), 900);
    assert.equal(unitPriceFor(product, 60), 800);
    assert.equal(lineTotal(product, 60), 48000);
  });

  it('checks minimum order and step', () => {
    assert.ok(checkQuantity(product, 1));
    assert.ok(checkQuantity(product, 3));
    assert.equal(checkQuantity(product, 4), null);
  });
});

describe('text helpers', () => {
  it('removes markup and control characters', () => {
    assert.equal(cleanText(`<b>Sement</b>${NUL} M500`), 'Sement M500');
    assert.ok(!cleanText(`a${RLO}b`).includes(RLO));
  });

  it('normalises Uzbek apostrophes for search', () => {
    assert.equal(normalizeForSearch('G\u{02BB}isht'), normalizeForSearch("G'isht"));
    assert.equal(normalizeForSearch('\u{0401}лка'), 'елка');
  });

  it('transliterates slugs', () => {
    assert.match(slugify('Цемент М500'), /^[a-z0-9-]+$/);
    assert.match(slugify('Цемент М500'), /m500$/);
  });
});

describe('schema validator', () => {
  const schema = s.object({ name: s.string({ min: 2 }), qty: s.number({ coerce: true, min: 1 }) });

  it('strips unknown keys and coerces numbers', () => {
    const result = validate(schema, { name: 'Blok', qty: '5', admin: true });
    assert.ok(result.ok);
    assert.deepEqual(result.value, { name: 'Blok', qty: 5 });
  });

  it('rejects prototype pollution and operators', () => {
    const polluted = validate(schema, JSON.parse('{"name":"Blok","qty":1,"__proto__":{"x":1}}'));
    assert.ok(!polluted.ok);
    const operator = validate(schema, { name: { $gt: '' }, qty: 1 });
    assert.ok(!operator.ok);
    const dollarKey = validate(schema, { name: 'Blok', qty: 1, $where: 'x' });
    assert.ok(!dollarKey.ok);
  });
});

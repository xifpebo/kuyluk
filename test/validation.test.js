'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, PASSWORDS } = require('./helpers');

describe('input validation and injection defences', () => {
  let ctx;
  let admin;
  let options;
  before(async () => {
    ctx = await startTestApp();
    admin = ctx.client();
    await admin.login('admin@test.local', PASSWORDS.admin, 'admin');
    options = (await admin.get('/api/admin/options')).data;
  });
  after(() => ctx?.stop());

  function productBody(overrides = {}) {
    return {
      sku: 'TEST-001',
      name: { uz: 'Sinov mahsuloti', ru: 'Тестовый товар' },
      category: options.categories.find((c) => c.parent).id,
      shop: options.shops[0].id,
      unit: 'piece',
      price: 50000,
      images: ['/img/placeholder.svg'],
      stock: { status: 'in_stock', quantity: 100 },
      ...overrides
    };
  }

  it('rejects NoSQL operator injection in login', async () => {
    const client = ctx.client();
    const res = await client.post('/api/auth/login', { email: { $gt: '' }, password: { $ne: null } });
    assert.equal(res.status, 422);
    const extra = await client.post('/api/auth/login', { email: 'admin@test.local', password: PASSWORDS.admin, $where: '1' });
    assert.equal(extra.status, 422);
  });

  it('treats query strings as plain text', async () => {
    const plain = await ctx.client().get('/api/catalog/products');
    const res = await ctx.client().get('/api/catalog/products?category[$ne]=x&brand[$regex]=.*');
    // The "simple" query parser never builds objects: the bracketed keys are unknown and dropped.
    assert.equal(res.status, 200);
    assert.equal(res.data.total, plain.data.total);
    const array = await ctx.client().get('/api/catalog/products?q=a&q=b');
    assert.ok([200, 422].includes(array.status), `status ${array.status}`);
    const regex = await ctx.client().get('/api/catalog/products?q=.*%5B(');
    assert.equal(regex.status, 200, 'regex characters are escaped, not executed');
  });

  it('strips markup from stored text (XSS)', async () => {
    const res = await admin.post(
      '/api/admin/products',
      productBody({ sku: 'XSS-001', name: { uz: '<script>alert(1)</script>Sement <b>M500</b>', ru: '<img src=x onerror=alert(1)>Цемент' } })
    );
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.ok(!/[<>]/.test(res.data.name.uz), res.data.name.uz);
    assert.ok(!/[<>]/.test(res.data.name.ru), res.data.name.ru);
  });

  it('rejects javascript: URLs for images', async () => {
    const res = await admin.post('/api/admin/products', productBody({ sku: 'URL-001', images: ['javascript:alert(1)'] }));
    assert.equal(res.status, 422);
    assert.ok(res.data.error.fields['images.0']);
  });

  it('ignores unknown fields (mass assignment)', async () => {
    const res = await admin.post('/api/admin/products', productBody({ sku: 'MASS-001', createdBy: '000000000000000000000000', _id: 'abc' }));
    assert.equal(res.status, 201);
    assert.notEqual(res.data.id, 'abc');
    const reg = await ctx.client().post('/api/auth/register', {
      name: 'Sneaky User',
      email: 'sneaky@test.local',
      password: 'Sariq#Gisht2026',
      passwordConfirm: 'Sariq#Gisht2026',
      terms: true,
      role: 'superadmin',
      isStaff: true
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    assert.equal(reg.data.user.role, 'user');
    assert.equal(reg.data.isStaff, false);
  });

  it('requires the old price to be above the price (discounts)', async () => {
    const bad = await admin.post('/api/admin/products', productBody({ sku: 'SALE-001', oldPrice: 40000 }));
    assert.equal(bad.status, 422);
    assert.ok(bad.data.error.fields.oldPrice);
    const good = await admin.post('/api/admin/products', productBody({ sku: 'SALE-002', oldPrice: 62500 }));
    assert.equal(good.status, 201, JSON.stringify(good.data));
    assert.equal(good.data.discountPercent, 20);
  });

  it('only attaches products to subcategories', async () => {
    const parent = options.categories.find((c) => !c.parent) || options.parents[0];
    const res = await admin.post('/api/admin/products', productBody({ sku: 'CAT-001', category: parent.id }));
    assert.equal(res.status, 422);
    assert.ok(res.data.error.fields.category);
  });

  it('rejects duplicate SKUs with a field error', async () => {
    const first = await admin.post('/api/admin/products', productBody({ sku: 'DUP-001' }));
    assert.equal(first.status, 201);
    const second = await admin.post('/api/admin/products', productBody({ sku: 'dup-001' }));
    assert.equal(second.status, 422);
    assert.ok(second.data.error.fields.sku);
  });

  it('returns validation messages in the requested language', async () => {
    const uz = await ctx.client({ lang: 'uz' }).post('/api/auth/register', { email: 'x' });
    const ru = await ctx.client({ lang: 'ru' }).post('/api/auth/register', { email: 'x' });
    assert.equal(uz.status, 422);
    assert.equal(ru.status, 422);
    assert.notEqual(uz.data.error.message, ru.data.error.message);
    assert.match(ru.data.error.message, /[А-Яа-я]/);
  });

  it('only accepts real images for upload', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const fake = await admin.post('/api/uploads', Buffer.from('<svg onload=alert(1)>'), { headers: { 'Content-Type': 'image/png' } });
    assert.ok([400, 415, 422].includes(fake.status), `status ${fake.status}`);
    const svg = await admin.post('/api/uploads', Buffer.from('<svg/>'), { headers: { 'Content-Type': 'image/svg+xml' } });
    assert.ok([400, 415].includes(svg.status), `status ${svg.status}`);
    const ok = await admin.post('/api/uploads', Buffer.concat([png, Buffer.alloc(64)]), { headers: { 'Content-Type': 'image/png' } });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.match(ok.data.url, /^\/uploads\/[\w/-]+\.png$/i);
    const served = await fetch(`${ctx.baseUrl}${ok.data.url}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.match(served.headers.get('content-security-policy'), /sandbox/);
  });
});

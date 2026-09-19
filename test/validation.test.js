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
      category: options.categories[0].id,
      supplier: options.suppliers[0].id,
      unit: 'bag',
      price: 50000,
      priceTiers: [{ minQty: 10, price: 48000 }],
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

  it('validates bulk pricing tiers', async () => {
    const res = await admin.post('/api/admin/products', productBody({ sku: 'TIER-001', priceTiers: [{ minQty: 10, price: 60000 }] }));
    assert.equal(res.status, 422);
    assert.ok(res.data.error.fields['priceTiers.0.price']);
  });

  it('rejects duplicate SKUs with a field error', async () => {
    const first = await admin.post('/api/admin/products', productBody({ sku: 'DUP-001' }));
    assert.equal(first.status, 201);
    const second = await admin.post('/api/admin/products', productBody({ sku: 'dup-001' }));
    assert.equal(second.status, 422);
    assert.ok(second.data.error.fields.sku);
  });

  it('returns validation messages in the requested language', async () => {
    const uz = await ctx.client({ lang: 'uz' }).post('/api/quotes', { items: [] });
    const ru = await ctx.client({ lang: 'ru' }).post('/api/quotes', { items: [] });
    assert.equal(uz.status, 422);
    assert.equal(ru.status, 422);
    assert.notEqual(uz.data.error.message, ru.data.error.message);
    assert.match(ru.data.error.message, /[А-Яа-я]/);
  });

  it('only accepts real images for upload', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const fake = await admin.post('/api/admin/uploads', Buffer.from('<svg onload=alert(1)>'), { headers: { 'Content-Type': 'image/png' } });
    assert.ok([400, 415, 422].includes(fake.status), `status ${fake.status}`);
    const svg = await admin.post('/api/admin/uploads', Buffer.from('<svg/>'), { headers: { 'Content-Type': 'image/svg+xml' } });
    assert.ok([400, 415].includes(svg.status), `status ${svg.status}`);
    const ok = await admin.post('/api/admin/uploads', Buffer.concat([png, Buffer.alloc(64)]), { headers: { 'Content-Type': 'image/png' } });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.match(ok.data.url, /^\/uploads\/[\w/-]+\.png$/i);
    const served = await fetch(`${ctx.baseUrl}${ok.data.url}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.match(served.headers.get('content-security-policy'), /sandbox/);
  });
});

describe('quote requests', () => {
  let ctx;
  before(async () => {
    ctx = await startTestApp();
  });
  after(() => ctx?.stop());

  async function firstProduct(client) {
    const res = await client.get('/api/catalog/products?limit=5&stock=in_stock');
    return res.data.items[0];
  }

  const customer = { name: 'Aziz Karimov', phone: '+998 90 123 45 67' };

  it('recomputes prices on the server and ignores client prices', async () => {
    const client = ctx.client();
    const product = await firstProduct(client);
    const qty = product.minOrderQty;
    const res = await client.post('/api/quotes', {
      items: [{ product: product.id, qty, unitPrice: 1, lineTotal: 1 }],
      customer,
      delivery: { method: 'pickup' },
      consent: true,
      estimatedTotal: 1
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.match(res.data.number, /^BB-\d{6}-[A-Z0-9]{4}$/);
    assert.ok(res.data.estimatedTotal > 1, 'server price used');
  });

  it('rejects bots filling the honeypot field', async () => {
    const client = ctx.client();
    const product = await firstProduct(client);
    const res = await client.post('/api/quotes', {
      items: [{ product: product.id, qty: product.minOrderQty }],
      customer,
      delivery: { method: 'pickup' },
      consent: true,
      website: 'http://spam.example'
    });
    assert.equal(res.status, 400);
  });

  it('requires delivery details and consent', async () => {
    const client = ctx.client();
    const product = await firstProduct(client);
    const res = await client.post('/api/quotes', {
      items: [{ product: product.id, qty: product.minOrderQty }],
      customer,
      delivery: { method: 'delivery' },
      consent: false
    });
    assert.equal(res.status, 422);
    assert.ok(res.data.error.fields.consent);
    assert.ok(res.data.error.fields['delivery.region']);
    assert.ok(res.data.error.fields['delivery.address']);
  });

  it('lets staff price a quote and enforces status transitions', async () => {
    const admin = ctx.client();
    await admin.login('admin@test.local', PASSWORDS.admin, 'admin');
    const list = await admin.get('/api/admin/quotes?status=new');
    const quote = list.data.items[0];
    const items = quote.items.map((item) => ({ id: item.id, quotedUnitPrice: 1000 }));
    const priced = await admin.patch(`/api/admin/quotes/${quote.id}`, { items, status: 'quoted', statusNote: 'Narxlar yuborildi' });
    assert.equal(priced.status, 200, JSON.stringify(priced.data));
    assert.equal(priced.data.status, 'quoted');
    assert.equal(priced.data.quotedTotal, quote.items.reduce((sum, item) => sum + Math.round(1000 * item.qty), 0));
    const illegal = await admin.patch(`/api/admin/quotes/${quote.id}`, { status: 'new' });
    assert.ok([409, 422].includes(illegal.status), `status ${illegal.status}`);
    const audit = await admin.get(`/api/admin/audit?entityType=quote&entityId=${quote.id}`);
    assert.ok(audit.data.items.some((entry) => entry.action === 'quote.status' && entry.changes.some((c) => c.field === 'status')));
  });
});

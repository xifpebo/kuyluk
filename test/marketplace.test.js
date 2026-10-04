'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, PASSWORDS, OWNERS } = require('./helpers');

describe('marketplace workflow', () => {
  let ctx;
  let admin;
  let owner;
  let customer;
  let options;

  before(async () => {
    ctx = await startTestApp();
    admin = ctx.client();
    owner = ctx.client();
    customer = ctx.client();
    await admin.login('admin@test.local', PASSWORDS.admin, 'admin');
    await owner.login(OWNERS.aqualux.email, OWNERS.aqualux.password);
    await customer.login('customer@test.local', PASSWORDS.customer);
    options = (await owner.get('/api/seller/options')).data;
  });
  after(() => ctx?.stop());

  const isPublic = async (slug) => (await ctx.client().get(`/api/catalog/products/${slug}`)).status === 200;

  function sellerProduct(overrides = {}) {
    return {
      sku: 'AQ-TEST-001',
      name: { uz: 'Sinov unitazi', ru: 'Тестовый унитаз' },
      description: { uz: 'Sinov uchun mahsulot tavsifi.', ru: 'Описание тестового товара.' },
      category: options.categories.find((c) => c.parent).id,
      unit: 'piece',
      price: 1500000,
      images: ['/img/placeholder.svg'],
      stock: { status: 'in_stock', quantity: 5 },
      ...overrides
    };
  }

  it('hides products that are not approved', async () => {
    const pending = await admin.get('/api/admin/products?status=pending&limit=1');
    assert.ok(pending.data.total > 0, 'seed has pending products');
    assert.equal(await isPublic(pending.data.items[0].slug), false);
    const list = await ctx.client().get(`/api/catalog/products?q=${encodeURIComponent(pending.data.items[0].sku)}`);
    assert.equal(list.status, 200);
    assert.ok(list.data.items.every((p) => p.id !== pending.data.items[0].id));
  });

  it('sends a shop owner’s new product to moderation, then publishes it on approval', async () => {
    const created = await owner.post('/api/seller/products', sellerProduct({ isFeatured: true }));
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.status, 'pending');
    assert.equal(created.data.isFeatured, false, 'owners cannot feature their own products');
    assert.equal(await isPublic(created.data.slug), false);

    const queue = await admin.get('/api/admin/products?status=pending&limit=100');
    assert.ok(queue.data.items.some((p) => p.id === created.data.id));

    const approved = await admin.post(`/api/admin/products/${created.data.id}/moderate`, { decision: 'approve' });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.status, 'approved');
    assert.equal(await isPublic(created.data.slug), true);

    // Price and stock changes apply immediately…
    const repriced = await owner.patch(`/api/seller/products/${created.data.id}`, { price: 1400000, stockStatus: 'low_stock' });
    assert.equal(repriced.status, 200);
    assert.equal(repriced.data.status, 'approved');
    // …while content changes go back to moderation.
    const renamed = await owner.put(`/api/seller/products/${created.data.id}`, sellerProduct({ name: { uz: 'Yangi nom', ru: 'Новое название' }, price: 1400000 }));
    assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
    assert.equal(renamed.data.status, 'pending');
    assert.equal(await isPublic(created.data.slug), false);
  });

  it('requires a reason to reject and shows it to the owner', async () => {
    const created = await owner.post('/api/seller/products', sellerProduct({ sku: 'AQ-TEST-002' }));
    const noNote = await admin.post(`/api/admin/products/${created.data.id}/moderate`, { decision: 'reject' });
    assert.equal(noNote.status, 422);
    const rejected = await admin.post(`/api/admin/products/${created.data.id}/moderate`, { decision: 'reject', note: 'Rasm mahsulotga mos emas' });
    assert.equal(rejected.status, 200);
    const mine = await owner.get(`/api/seller/products/${created.data.id}`);
    assert.equal(mine.data.status, 'rejected');
    assert.equal(mine.data.moderationNote, 'Rasm mahsulotga mos emas');
  });

  it('accepts shop applications as pending and publishes them after approval', async () => {
    const applicant = ctx.client();
    const res = await applicant.post('/api/auth/register-shop', {
      name: 'Laylo Rahimova',
      email: 'laylo.shop@test.local',
      phone: '+998 90 555 44 33',
      password: 'Moviy#Kafel2026',
      passwordConfirm: 'Moviy#Kafel2026',
      terms: true,
      shop: {
        name: 'Sinov Kafel Uyi',
        description: 'Kafel va keramogranit, oʻlchov va maslahat bepul.',
        address: 'Toshkent, Chilonzor 5',
        city: 'tashkent_city',
        phone: '+998 90 555 44 33',
        workingHours: '09:00-18:00'
      }
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.user.role, 'shop_owner');
    const shop = (await applicant.get('/api/seller/shop')).data;
    assert.equal(shop.status, 'pending');
    assert.equal((await ctx.client().get(`/api/catalog/shops/${shop.slug}`)).status, 404);

    const approved = await admin.post(`/api/admin/shops/${shop.id}/status`, { status: 'approved' });
    assert.equal(approved.status, 200);
    assert.equal((await ctx.client().get(`/api/catalog/shops/${shop.slug}`)).status, 200);
  });

  it('hides a suspended shop together with its products', async () => {
    const shops = await admin.get('/api/admin/shops?q=keramika');
    const shop = shops.data.items[0];
    const product = (await admin.get(`/api/admin/products?shop=${shop.id}&status=approved&limit=1`)).data.items[0];
    assert.equal(await isPublic(product.slug), true);
    await admin.post(`/api/admin/shops/${shop.id}/status`, { status: 'suspended', note: 'Tekshiruv' });
    assert.equal(await isPublic(product.slug), false);
    assert.equal((await ctx.client().get(`/api/catalog/shops/${shop.slug}`)).status, 404);
    await admin.post(`/api/admin/shops/${shop.id}/status`, { status: 'approved' });
    assert.equal(await isPublic(product.slug), true);
  });

  it('publishes customer reviews only after moderation and updates the rating', async () => {
    const product = (await ctx.client().get('/api/catalog/products?limit=1&sort=newest')).data.items[0];
    const before = (await ctx.client().get(`/api/catalog/products/${product.slug}`)).data.product;
    const created = await customer.post('/api/reviews', { target: 'product', product: product.id, rating: 1, text: 'Sinov sharhi: sifat kutganimdan past chiqdi.' });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.status, 'pending');
    const duplicate = await customer.post('/api/reviews', { target: 'product', product: product.id, rating: 5, text: 'Ikkinchi sharh yozib koʻraman.' });
    assert.equal(duplicate.status, 409);

    const pendingList = await ctx.client().get(`/api/catalog/reviews?product=${product.id}`);
    assert.ok(pendingList.data.items.every((r) => r.id !== created.data.id));

    const moderated = await admin.patch(`/api/admin/reviews/${created.data.id}`, { status: 'approved' });
    assert.equal(moderated.status, 200);
    const after = (await ctx.client().get(`/api/catalog/products/${product.slug}`)).data.product;
    assert.equal(after.reviewCount, before.reviewCount + 1);
    const list = await ctx.client({ lang: 'uz' }).get(`/api/catalog/reviews?product=${product.id}`);
    assert.ok(list.data.items.some((r) => r.id === created.data.id));
  });

  it('keeps review lists in the page language unless asked for others', async () => {
    const product = (await ctx.client().get('/api/catalog/products?limit=48&sort=popular')).data.items.find((p) => p.reviewCount >= 2);
    const uz = await ctx.client({ lang: 'uz' }).get(`/api/catalog/reviews?product=${product.id}&limit=20`);
    const other = await ctx.client({ lang: 'uz' }).get(`/api/catalog/reviews?product=${product.id}&limit=20&other=1`);
    assert.ok(uz.data.items.every((r) => r.lang === 'uz'));
    assert.ok(other.data.items.every((r) => r.lang !== 'uz'));
    assert.equal(uz.data.total + other.data.total, uz.data.allTotal);
    assert.equal(uz.data.otherCount, other.data.total);
  });

  it('counts contact clicks for shop statistics', async () => {
    const product = (await ctx.client().get('/api/catalog/products?limit=1')).data.items[0];
    const res = await ctx.client().post('/api/catalog/track', { type: 'contact', channel: 'telegram', product: product.id });
    assert.equal(res.status, 204);
    const bad = await ctx.client().post('/api/catalog/track', { type: 'contact', channel: 'fax', product: product.id });
    assert.equal(bad.status, 422);
  });

  it('never exposes cart, checkout or payment endpoints', async () => {
    for (const url of ['/api/cart', '/api/checkout', '/api/orders', '/api/payments', '/api/quotes']) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await ctx.client().get(url)).status, 404, url);
    }
  });
});

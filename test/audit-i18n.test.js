'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, PASSWORDS } = require('./helpers');

describe('audit log', () => {
  let ctx;
  let admin;
  before(async () => {
    ctx = await startTestApp();
    admin = ctx.client();
    await admin.login('admin@test.local', PASSWORDS.admin, 'admin');
  });
  after(() => ctx?.stop());

  it('records logins and failed logins', async () => {
    await ctx.client().login('admin@test.local', 'Wrong#Password123', 'admin');
    const logins = await admin.get('/api/admin/audit?action=auth.login');
    assert.ok(logins.data.items.some((e) => e.actor.email === 'admin@test.local'));
    const failures = await admin.get('/api/admin/audit?action=auth.login_failed');
    assert.ok(failures.data.items.length >= 1);
    assert.equal(failures.data.items[0].status, 'failure');
    assert.ok(failures.data.items[0].ip);
  });

  it('records field-level changes and deletions', async () => {
    const list = await admin.get('/api/admin/products?limit=1');
    const product = list.data.items[0];
    const patched = await admin.patch(`/api/admin/products/${product.id}`, { price: product.price + 1000 });
    assert.equal(patched.status, 200);
    const updates = await admin.get(`/api/admin/audit?entityType=product&entityId=${product.id}`);
    const entry = updates.data.items.find((e) => e.action === 'product.update');
    assert.ok(entry);
    const change = entry.changes.find((c) => c.field === 'price');
    assert.deepEqual([change.from, change.to], [product.price, product.price + 1000]);

    await admin.del(`/api/admin/products/${product.id}`);
    const deletions = await admin.get('/api/admin/audit?action=product.delete');
    assert.equal(deletions.data.items[0].entity.id, product.id);
    assert.equal(deletions.data.items[0].meta.snapshot.sku, product.sku);
  });

  it('never stores secrets', async () => {
    const created = await admin.post('/api/admin/users', { email: 'secret@test.local', name: 'Secret Person', role: 'manager' });
    const reset = await admin.post(`/api/admin/users/${created.data.user.id}/reset-password`, {});
    const entries = await admin.get('/api/admin/audit?entityType=user&limit=100');
    const dump = JSON.stringify(entries.data);
    assert.ok(!dump.includes(created.data.temporaryPassword));
    assert.ok(!dump.includes(reset.data.temporaryPassword));
    assert.ok(!/scrypt\$/.test(dump));
  });

  it('is append-only', async () => {
    const { AuditLog } = require('../src/models');
    await assert.rejects(() => AuditLog.updateOne({}, { $set: { action: 'x.y' } }));
    await assert.rejects(() => AuditLog.deleteMany({}));
  });
});

describe('internationalisation', () => {
  let ctx;
  before(async () => {
    ctx = await startTestApp();
  });
  after(() => ctx?.stop());

  it('has matching uz and ru dictionaries', () => {
    const { missingKeys } = require('../src/i18n');
    assert.deepEqual(missingKeys(), { missingInRu: [], missingInUz: [] });
  });

  it('defaults to Uzbek and remembers the language switch', async () => {
    const client = ctx.client({ lang: null });
    const uz = await client.get('/catalog');
    assert.match(uz.data, /<html lang="uz"/);
    const ru = await client.get('/catalog?lang=ru');
    assert.match(ru.data, /<html lang="ru"/);
    assert.ok(ru.headers.getSetCookie().some((c) => c.startsWith('sb_lang=')));
    const again = await client.get('/catalog');
    assert.match(again.data, /<html lang="ru"/, 'choice remembered');
    assert.match(again.data, /hreflang="uz"/);
  });

  it('serves bilingual catalog data and searches in both languages', async () => {
    const res = await ctx.client().get('/api/catalog/products?limit=3');
    for (const product of res.data.items) assert.ok(product.name.uz && product.name.ru);
    const ru = await ctx.client().get(`/api/catalog/products?q=${encodeURIComponent('цемент')}`);
    assert.ok(ru.data.total > 0, 'Russian search works');
    const uz = await ctx.client().get('/api/catalog/products?q=sement');
    assert.ok(uz.data.total > 0, 'Uzbek search works');
  });

  it('keeps the admin dictionary out of the public bundle', async () => {
    const pub = await ctx.client().get('/i18n/public/uz.json');
    const adm = await ctx.client().get('/i18n/admin/uz.json');
    assert.equal(pub.data.admin, undefined);
    assert.ok(adm.data.admin.nav.dashboard);
  });

  it('redirects anonymous visitors from /admin to the staff login', async () => {
    const res = await ctx.client().get('/admin');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin/login');
    const login = await ctx.client().get('/admin/login');
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('x-robots-tag'), 'noindex, nofollow');
  });
});

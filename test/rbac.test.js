'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, PASSWORDS, OWNERS } = require('./helpers');
const { can, permissionsFor } = require('../src/security/rbac');

describe('role-based access control', () => {
  let ctx;
  let admin;
  let manager;
  let customer;
  before(async () => {
    ctx = await startTestApp();
    admin = ctx.client();
    manager = ctx.client();
    customer = ctx.client();
    await admin.login('admin@test.local', PASSWORDS.admin, 'admin');
    await manager.login('manager@test.local', PASSWORDS.manager, 'admin');
    await customer.login('customer@test.local', PASSWORDS.customer);
  });
  after(() => ctx?.stop());

  it('has a sane permission matrix', () => {
    assert.ok(can('superadmin', 'users:manage'));
    assert.ok(can('superadmin', 'audit:read'));
    assert.ok(can('manager', 'products:write'));
    assert.ok(!can('manager', 'users:manage'));
    assert.ok(!can('manager', 'audit:read'));
    assert.ok(!can('manager', 'taxonomy:delete'));
    assert.ok(!can('manager', 'shops:delete'));
    assert.ok(can('manager', 'products:approve'));
    assert.ok(!can('superadmin', 'seller:access'), 'staff never act as a shop owner');
    assert.deepEqual([...permissionsFor('shop_owner')].sort(), ['account:self', 'reviews:write', 'seller:access', 'uploads:write']);
    assert.deepEqual([...permissionsFor('user')].sort(), ['account:self', 'reviews:write']);
    assert.deepEqual(permissionsFor('hacker'), []);
  });

  const adminEndpoints = [
    ['GET', '/api/admin/dashboard'],
    ['GET', '/api/admin/products'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/audit'],
    ['GET', '/api/admin/shops'],
    ['GET', '/api/admin/reviews'],
    ['GET', '/api/admin/settings'],
    ['POST', '/api/admin/categories']
  ];

  it('requires authentication on every admin endpoint', async () => {
    const anonymous = ctx.client();
    for (const [method, url] of adminEndpoints) {
      // eslint-disable-next-line no-await-in-loop
      const res = method === 'GET' ? await anonymous.get(url) : await anonymous.post(url, {});
      assert.equal(res.status, 401, `${method} ${url}`);
    }
  });

  it('refuses customers on every admin endpoint', async () => {
    for (const [method, url] of adminEndpoints) {
      // eslint-disable-next-line no-await-in-loop
      const res = method === 'GET' ? await customer.get(url) : await customer.post(url, {});
      assert.equal(res.status, 403, `${method} ${url}`);
    }
  });

  it('refuses shop owners on every admin endpoint', async () => {
    const owner = ctx.client();
    await owner.login(OWNERS.aqualux.email, OWNERS.aqualux.password);
    for (const [method, url] of adminEndpoints) {
      // eslint-disable-next-line no-await-in-loop
      const res = method === 'GET' ? await owner.get(url) : await owner.post(url, {});
      assert.equal(res.status, 403, `${method} ${url}`);
    }
  });

  it('keeps the seller cabinet for shop owners only', async () => {
    assert.equal((await ctx.client().get('/api/seller/products')).status, 401);
    assert.equal((await customer.get('/api/seller/products')).status, 403);
    assert.equal((await admin.get('/api/seller/products')).status, 403);
  });

  it('lets managers run the catalog and moderation but not users, audit or deletions', async () => {
    assert.equal((await manager.get('/api/admin/dashboard')).status, 200);
    assert.equal((await manager.get('/api/admin/products')).status, 200);
    assert.equal((await manager.get('/api/admin/shops')).status, 200);
    assert.equal((await manager.get('/api/admin/reviews')).status, 200);
    assert.equal((await manager.get('/api/admin/users')).status, 403);
    assert.equal((await manager.get('/api/admin/audit')).status, 403);
    const categories = await manager.get('/api/admin/categories');
    assert.equal((await manager.del(`/api/admin/categories/${categories.data.items[0].id}`)).status, 403);
    const shops = await manager.get('/api/admin/shops');
    assert.equal((await manager.del(`/api/admin/shops/${shops.data.items[0].id}`)).status, 403);
    assert.equal((await manager.put('/api/admin/settings', {})).status, 403, 'site settings are super-admin only');
    const dashboard = await manager.get('/api/admin/dashboard');
    assert.deepEqual(dashboard.data.recentActivity, [], 'no audit data leaks to managers');
  });

  it('records denied access in the audit log', async () => {
    const res = await admin.get('/api/admin/audit?action=access.denied');
    assert.equal(res.status, 200);
    assert.ok(res.data.items.some((entry) => entry.actor.email === 'manager@test.local'));
  });

  it('lets super-admins manage users but never lock themselves out', async () => {
    const list = await admin.get('/api/admin/users');
    assert.equal(list.status, 200);
    const me = list.data.items.find((u) => u.email === 'admin@test.local');
    const demote = await admin.patch(`/api/admin/users/${me.id}`, { role: 'manager' });
    assert.equal(demote.status, 403);
    assert.equal(demote.data.error.code, 'cannot_modify_self');
    assert.equal((await admin.del(`/api/admin/users/${me.id}`)).status, 403);
  });

  it('revokes sessions immediately when a role changes', async () => {
    const list = await admin.get('/api/admin/users?q=manager%40test.local');
    const target = list.data.items[0];
    const other = ctx.client();
    await other.login('manager@test.local', PASSWORDS.manager, 'admin');
    assert.equal((await other.get('/api/admin/products')).status, 200);
    const res = await admin.patch(`/api/admin/users/${target.id}`, { role: 'user' });
    assert.equal(res.status, 200);
    assert.equal((await other.get('/api/admin/products')).status, 401);
    await admin.patch(`/api/admin/users/${target.id}`, { role: 'manager' });
  });

  it('keeps customers inside their own data', async () => {
    const own = await customer.get('/api/account/reviews');
    assert.equal(own.status, 200);
    assert.ok(Array.isArray(own.data.items));
    const favorites = await customer.get('/api/account/favorites');
    assert.equal(favorites.status, 200);
  });

  it('scopes shop owners to their own shop', async () => {
    const owner = ctx.client();
    await owner.login(OWNERS.aqualux.email, OWNERS.aqualux.password);
    const shop = await owner.get('/api/seller/shop');
    assert.equal(shop.data.slug, OWNERS.aqualux.slug);
    const mine = await owner.get('/api/seller/products?limit=100');
    assert.ok(mine.data.items.length > 0);
    assert.ok(mine.data.items.every((p) => p.shop === shop.data.id));
    const foreign = (await admin.get('/api/admin/products?limit=100')).data.items.find((p) => p.shop !== shop.data.id);
    assert.equal((await owner.get(`/api/seller/products/${foreign.id}`)).status, 404);
    assert.equal((await owner.patch(`/api/seller/products/${foreign.id}`, { price: 1 })).status, 404);
    assert.equal((await owner.del(`/api/seller/products/${foreign.id}`)).status, 404);
  });
});

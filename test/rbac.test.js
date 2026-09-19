'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, PASSWORDS } = require('./helpers');
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
    assert.ok(!can('manager', 'quotes:delete'));
    assert.deepEqual(permissionsFor('user'), ['account:self']);
    assert.deepEqual(permissionsFor('hacker'), []);
  });

  const adminEndpoints = [
    ['GET', '/api/admin/dashboard'],
    ['GET', '/api/admin/products'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/audit'],
    ['GET', '/api/admin/quotes'],
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

  it('lets managers run the catalog and quotes but not users, audit or taxonomy deletion', async () => {
    assert.equal((await manager.get('/api/admin/dashboard')).status, 200);
    assert.equal((await manager.get('/api/admin/products')).status, 200);
    assert.equal((await manager.get('/api/admin/quotes')).status, 200);
    assert.equal((await manager.get('/api/admin/users')).status, 403);
    assert.equal((await manager.get('/api/admin/audit')).status, 403);
    const categories = await manager.get('/api/admin/categories');
    assert.equal((await manager.del(`/api/admin/categories/${categories.data.items[0].id}`)).status, 403);
    const quotes = await manager.get('/api/admin/quotes');
    assert.equal((await manager.del(`/api/admin/quotes/${quotes.data.items[0].id}`)).status, 403);
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
    const own = await customer.get('/api/account/quotes');
    assert.equal(own.status, 200);
    assert.ok(Array.isArray(own.data.items));
  });
});

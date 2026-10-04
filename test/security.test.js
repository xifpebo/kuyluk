'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, PASSWORDS } = require('./helpers');

describe('authentication, sessions and CSRF', () => {
  let ctx;
  before(async () => {
    ctx = await startTestApp();
  });
  after(() => ctx?.stop());

  it('sends strict security headers', async () => {
    const res = await ctx.client().get('/');
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /require-trusted-types-for 'script'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('rejects state-changing requests without a valid CSRF token', async () => {
    const client = ctx.client();
    await client.session();
    const body = { email: 'admin@test.local', password: PASSWORDS.admin };
    const missing = await client.post('/api/auth/login', body, { csrf: false });
    assert.equal(missing.status, 403);
    assert.equal(missing.data.error.code, 'csrf_failed');
    const forged = await client.post('/api/auth/login', body, { headers: { 'X-CSRF-Token': 'forged' } });
    assert.equal(forged.status, 403);
  });

  it('rejects cross-site requests even with a token', async () => {
    const client = ctx.client();
    await client.session();
    const res = await client.post('/api/reviews', {}, { headers: { Origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'csrf_failed');
  });

  it('issues an HttpOnly, SameSite=Strict session cookie to staff', async () => {
    const client = ctx.client();
    const res = await client.login('admin@test.local', PASSWORDS.admin, 'admin');
    assert.equal(res.status, 200);
    assert.equal(res.data.isStaff, true);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('sb_sid='));
    assert.ok(cookie, 'session cookie set');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    const session = await client.get('/api/auth/session');
    assert.equal(session.data.user.email, 'admin@test.local');
    assert.equal(session.data.user.passwordHash, undefined);
    assert.equal(session.data.session.idleSeconds, 30 * 60);
  });

  it('gives customers a SameSite=Lax cookie and refuses them on the admin login', async () => {
    const site = await ctx.client().login('customer@test.local', PASSWORDS.customer);
    assert.equal(site.status, 200);
    assert.match(site.headers.getSetCookie().find((c) => c.startsWith('sb_sid=')), /SameSite=Lax/i);
    const admin = await ctx.client().login('customer@test.local', PASSWORDS.customer, 'admin');
    assert.equal(admin.status, 401);
    assert.equal(admin.data.error.code, 'invalid_credentials');
  });

  it('does not reveal whether an account exists', async () => {
    const unknown = await ctx.client().login('nobody@test.local', 'Wrong#Password123');
    const wrong = await ctx.client().login('manager@test.local', 'Wrong#Password123');
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.data.error.message, wrong.data.error.message);
  });

  it('locks an account after repeated failures', async () => {
    const { createUser } = require('../src/services/authService');
    await createUser({ email: 'victim@test.local', name: 'Victim User', role: 'manager', password: 'Temir#Beton2026!' });
    const client = ctx.client();
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await client.login('victim@test.local', `Wrong#Pass${i}word1`);
      statuses.push(res.status);
    }
    assert.deepEqual(statuses.slice(0, 4), [401, 401, 401, 401]);
    assert.equal(statuses[4], 429);
    assert.equal(statuses[5], 429);
    const correct = await ctx.client().login('victim@test.local', 'Temir#Beton2026!');
    assert.equal(correct.status, 429, 'even the right password is refused while locked');
    assert.equal(correct.data.error.code, 'account_locked');
  });

  it('logs out and invalidates the server-side session', async () => {
    const client = ctx.client();
    await client.login('manager@test.local', PASSWORDS.manager);
    const stolen = client.jar.get('sb_sid');
    assert.ok(stolen);
    const out = await client.post('/api/auth/logout', {});
    assert.equal(out.status, 200);
    const replay = await fetch(`${ctx.baseUrl}/api/admin/dashboard`, { headers: { Cookie: `sb_sid=${stolen}` } });
    assert.equal(replay.status, 401);
  });

  it('enforces the password policy and history on change', async () => {
    const { createUser } = require('../src/services/authService');
    await createUser({ email: 'changer@test.local', name: 'Password Changer', role: 'user', password: 'Birinchi#Sement2026' });
    const client = ctx.client({ lang: 'ru' });
    await client.login('changer@test.local', 'Birinchi#Sement2026');
    const weak = await client.post('/api/auth/password', { currentPassword: 'Birinchi#Sement2026', newPassword: 'password123' });
    assert.equal(weak.status, 422);
    assert.match(weak.data.error.fields.newPassword, /[А-Яа-я]/, 'message is localized in Russian');
    const reused = await client.post('/api/auth/password', { currentPassword: 'Birinchi#Sement2026', newPassword: 'Birinchi#Sement2026' });
    assert.equal(reused.status, 422);
    const wrong = await client.post('/api/auth/password', { currentPassword: 'nope', newPassword: 'Ikkinchi#Sement2026' });
    assert.equal(wrong.status, 422);
    assert.ok(wrong.data.error.fields.currentPassword);
    const ok = await client.post('/api/auth/password', { currentPassword: 'Birinchi#Sement2026', newPassword: 'Ikkinchi#Sement2026' });
    assert.equal(ok.status, 200);
    const still = await client.get('/api/auth/session');
    assert.equal(still.data.user.email, 'changer@test.local', 'current session survives');
  });

  it('forces staff with a temporary password to change it first', async () => {
    const admin = ctx.client();
    await admin.login('admin@test.local', PASSWORDS.admin, 'admin');
    const created = await admin.post('/api/admin/users', { email: 'newbie@test.local', name: 'New Manager', role: 'manager' });
    assert.equal(created.status, 201);
    const temp = created.data.temporaryPassword;
    assert.ok(temp && temp.length >= 12);
    const newbie = ctx.client();
    const login = await newbie.login('newbie@test.local', temp, 'admin');
    assert.equal(login.data.mustChangePassword, true);
    const blocked = await newbie.get('/api/admin/products');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.error.code, 'password_change_required');
    const changed = await newbie.post('/api/auth/password', { currentPassword: temp, newPassword: 'Yangi#Menejer2026' });
    assert.equal(changed.status, 200);
    const allowed = await newbie.get('/api/admin/products');
    assert.equal(allowed.status, 200);
  });

  it('rate-limits the admin login endpoint per IP', async () => {
    const client = ctx.client();
    let limited = null;
    for (let i = 0; i < 15 && !limited; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await client.login(`probe${i}@test.local`, 'Wrong#Password123', 'admin');
      if (res.status === 429) limited = res;
    }
    assert.ok(limited, 'eventually rate limited');
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  });
});

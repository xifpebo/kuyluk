'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { Session } = require('../../models');
const { asyncHandler, validationFailed, notFound } = require('../../lib/errors');
const { parse, validateRequest } = require('../../lib/schema');
const v = require('../../validation');
const { requireAuth } = require('../../middleware/auth');
const { authenticate, changePassword, createUser, lockedError } = require('../../services/authService');
const { recordAudit } = require('../../services/audit');
const { isStaffRole } = require('../../security/rbac');
const { truncate } = require('../../lib/text');

const { trusted } = mongoose;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function emailKey(req) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
  return email || 'none';
}

function sessionPayload(req, res, csrfToken) {
  const auth = req.auth;
  return {
    user: auth ? auth.user.toSafeJSON() : null,
    permissions: auth ? auth.permissions : [],
    isStaff: Boolean(auth?.isStaff),
    mustChangePassword: Boolean(auth?.mustChangePassword),
    session: auth ? { idleSeconds: auth.idleSeconds, absoluteExpiresAt: auth.absoluteExpiresAt } : null,
    csrfToken
  };
}

function createAuthRouter({ config, sessions, csrf, limiter }) {
  const router = express.Router();

  // Per-email lockout that looks identical to the account lock, so the
  // response does not reveal whether the account exists.
  const emailLimiter = (name) => {
    const limit = limiter.limit({
      name,
      windowMs: FIFTEEN_MINUTES,
      max: config.auth.maxFailedAttempts,
      key: emailKey,
      skipSuccessful: true,
      failClosed: true
    });
    return (req, res, next) =>
      limit(req, res, (error) => {
        if (error?.code === 'rate_limited') return next(lockedError(Math.max(1, error.params.minutes)));
        return next(error);
      });
  };

  router.get('/session', (req, res) => {
    res.json(sessionPayload(req, res, csrf.issueToken(req, res)));
  });

  async function login(req, res, surface) {
    const input = parse(v.login, req.body);
    const user = await authenticate(req, config, { ...input, surface });
    const session = await sessions.create(req, res, user);
    const csrfToken = csrf.rotate(req, res, String(session._id));
    await recordAudit(req, {
      action: 'auth.login',
      actor: user,
      entity: { type: 'user', id: user._id, label: user.email },
      meta: { surface, sessionId: String(session._id) }
    });
    const payload = sessionPayload(req, res, csrfToken);
    payload.redirect = isStaffRole(user.role) ? '/admin' : '/account';
    res.json(payload);
  }

  router.post(
    '/login',
    limiter.limit({ name: 'login-ip', windowMs: FIFTEEN_MINUTES, max: 30, failClosed: true }),
    emailLimiter('login-email'),
    asyncHandler((req, res) => login(req, res, 'site'))
  );

  router.post(
    '/admin/login',
    limiter.limit({ name: 'admin-login-ip', windowMs: FIFTEEN_MINUTES, max: 10, failClosed: true }),
    emailLimiter('admin-login-email'),
    asyncHandler((req, res) => login(req, res, 'admin'))
  );

  router.post(
    '/register',
    limiter.limit({ name: 'register-ip', windowMs: 60 * 60 * 1000, max: 5, failClosed: true }),
    asyncHandler(async (req, res) => {
      const input = parse(v.register, req.body);
      const fields = v.registerCrossChecks(input);
      if (Object.keys(fields).length) throw validationFailed(fields);
      const user = await createUser({
        email: input.email,
        name: input.name,
        phone: input.phone,
        company: input.company,
        password: input.password,
        preferredLang: req.lang,
        role: 'user'
      });
      await recordAudit(req, {
        action: 'auth.register',
        actor: user,
        entity: { type: 'user', id: user._id, label: user.email }
      });
      const session = await sessions.create(req, res, user);
      const csrfToken = csrf.rotate(req, res, String(session._id));
      res.status(201).json({ ...sessionPayload(req, res, csrfToken), redirect: '/account' });
    })
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const auth = req.auth;
      await sessions.destroy(req, res);
      if (auth) {
        await recordAudit(req, {
          action: 'auth.logout',
          actor: auth.user,
          entity: { type: 'user', id: auth.userId, label: auth.user.email }
        });
      }
      const csrfToken = csrf.rotate(req, res, null);
      res.json({ ok: true, csrfToken });
    })
  );

  router.post(
    '/password',
    requireAuth,
    limiter.limit({
      name: 'password-change',
      windowMs: 60 * 60 * 1000,
      max: 10,
      key: (req) => req.auth.userId,
      failClosed: true
    }),
    asyncHandler(async (req, res) => {
      const input = parse(v.changePassword, req.body);
      await changePassword(req, config, input);
      res.json({ ok: true });
    })
  );

  router.get(
    '/sessions',
    requireAuth,
    asyncHandler(async (req, res) => {
      const list = await Session.find({ user: req.auth.userId, expiresAt: trusted({ $gt: new Date() }) })
        .sort({ lastSeenAt: -1 })
        .lean();
      res.json({
        items: list.map((s) => ({
          id: String(s._id),
          current: String(s._id) === req.auth.sessionId,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          expiresAt: s.expiresAt,
          ip: s.ip,
          userAgent: truncate(s.userAgent, 160)
        }))
      });
    })
  );

  router.delete(
    '/sessions/:id',
    requireAuth,
    validateRequest({ params: v.idParams }),
    asyncHandler(async (req, res) => {
      const result = await Session.deleteOne({ _id: req.valid.params.id, user: req.auth.userId });
      if (!result.deletedCount) throw notFound();
      await recordAudit(req, {
        action: 'auth.sessions_revoked',
        entity: { type: 'session', id: req.valid.params.id, label: req.auth.user.email },
        meta: { count: 1 }
      });
      const endedCurrent = req.valid.params.id === req.auth.sessionId;
      if (endedCurrent) await sessions.destroy(req, res);
      res.json({ ok: true, endedCurrent });
    })
  );

  router.post(
    '/logout-others',
    requireAuth,
    asyncHandler(async (req, res) => {
      const revoked = await sessions.revokeUserSessions(req.auth.userId, { exceptSessionId: req.auth.sessionId });
      await recordAudit(req, {
        action: 'auth.sessions_revoked',
        entity: { type: 'user', id: req.auth.userId, label: req.auth.user.email },
        meta: { count: revoked }
      });
      res.json({ ok: true, revoked });
    })
  );

  return router;
}

module.exports = { createAuthRouter };

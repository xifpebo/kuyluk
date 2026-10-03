'use strict';

/**
 * Server-side sessions in HTTP-only cookies.
 *
 * - 256-bit random token in the cookie; only SHA-256(token) is stored.
 * - Idle (sliding) and absolute timeouts, shorter for staff and shop owners.
 * - Staff and shop-owner cookies use SameSite=Strict, customer cookies SameSite=Lax.
 * - `tokenVersion` on the user invalidates every session at once
 *   (password change, role change, deactivation, forced logout).
 */
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const User = require('../models/User');
const { isStaffRole, isSellerRole, permissionsFor } = require('./rbac');
const { cookieName, baseOptions } = require('./cookies');
const { truncate } = require('../lib/text');
const { logger } = require('../logger');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOUCH_INTERVAL_MS = 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSessionManager(config) {
  const name = cookieName(config, 'sb_sid');

  function lifetimes(role) {
    if (isStaffRole(role)) {
      return {
        idleMs: config.session.staffIdleMinutes * 60 * 1000,
        absoluteMs: config.session.staffAbsoluteHours * 60 * 60 * 1000,
        sameSite: 'strict'
      };
    }
    if (isSellerRole(role)) {
      return {
        idleMs: config.session.sellerIdleHours * 60 * 60 * 1000,
        absoluteMs: config.session.sellerAbsoluteDays * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      };
    }
    return {
      idleMs: config.session.userIdleDays * 24 * 60 * 60 * 1000,
      absoluteMs: config.session.userAbsoluteDays * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    };
  }

  function writeCookie(res, token, role, expiresAt) {
    const { sameSite } = lifetimes(role);
    res.cookie(name, token, { ...baseOptions(config), sameSite, expires: expiresAt });
  }

  function clearCookie(res) {
    res.clearCookie(name, { ...baseOptions(config), sameSite: 'lax' });
  }

  async function create(req, res, user) {
    // Drop the pre-login session (if any) to prevent session fixation.
    await destroy(req, res, { keepCookie: true });
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const { idleMs, absoluteMs } = lifetimes(user.role);
    const absoluteExpiresAt = new Date(now + absoluteMs);
    const expiresAt = new Date(Math.min(now + idleMs, absoluteExpiresAt.getTime()));
    const session = await Session.create({
      tokenHash: hashToken(token),
      user: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
      expiresAt,
      absoluteExpiresAt,
      lastSeenAt: new Date(now),
      ip: req.ip || '',
      userAgent: truncate(req.get('user-agent') || '', 256)
    });
    writeCookie(res, token, user.role, absoluteExpiresAt);
    req.auth = buildAuth(session, user);
    return session;
  }

  async function destroy(req, res, { keepCookie = false } = {}) {
    const token = req.cookies?.[name];
    if (token && TOKEN_PATTERN.test(token)) {
      await Session.deleteOne({ tokenHash: hashToken(token) });
    }
    if (!keepCookie) clearCookie(res);
    req.auth = null;
  }

  async function revokeUserSessions(userId, { exceptSessionId } = {}) {
    const filter = { user: userId };
    if (exceptSessionId) filter._id = mongoose.trusted({ $ne: exceptSessionId });
    const result = await Session.deleteMany(filter);
    return result.deletedCount || 0;
  }

  function buildAuth(session, user) {
    return {
      sessionId: String(session._id),
      userId: String(user._id),
      role: user.role,
      isStaff: isStaffRole(user.role),
      isSeller: isSellerRole(user.role),
      permissions: permissionsFor(user.role),
      mustChangePassword: Boolean(user.mustChangePassword),
      idleSeconds: Math.round(lifetimes(user.role).idleMs / 1000),
      absoluteExpiresAt: session.absoluteExpiresAt,
      user
    };
  }

  /** Middleware: resolve the session cookie into `req.auth` (or null). */
  async function load(req, res, next) {
    req.auth = null;
    const token = req.cookies?.[name];
    if (!token) return next();
    if (!TOKEN_PATTERN.test(token)) {
      clearCookie(res);
      return next();
    }
    try {
      const now = Date.now();
      const session = await Session.findOne({ tokenHash: hashToken(token) }).lean();
      if (!session || session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
        if (session) await Session.deleteOne({ _id: session._id });
        clearCookie(res);
        return next();
      }
      const user = await User.findById(session.user);
      const valid =
        user &&
        user.isActive &&
        user.role === session.role &&
        (user.tokenVersion || 0) === session.tokenVersion &&
        !user.isLocked(new Date(now));
      if (!valid) {
        await Session.deleteOne({ _id: session._id });
        clearCookie(res);
        return next();
      }
      if (now - new Date(session.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
        const { idleMs } = lifetimes(user.role);
        const expiresAt = new Date(Math.min(now + idleMs, session.absoluteExpiresAt.getTime()));
        await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date(now), expiresAt } });
      }
      req.auth = buildAuth(session, user);
      return next();
    } catch (error) {
      logger.error('Session lookup failed', { err: error });
      return next(error);
    }
  }

  return { load, create, destroy, revokeUserSessions, cookie: name, hashToken };
}

module.exports = { createSessionManager, hashToken };

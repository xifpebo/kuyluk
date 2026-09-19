'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const { HttpError, unauthorized, forbidden, validationFailed } = require('../lib/errors');
const { hashPassword, verifyPassword, needsRehash, dummyHash, checkPasswordPolicy } = require('../security/password');
const { isStaffRole } = require('../security/rbac');
const { recordAudit } = require('./audit');

function lockedError(minutes) {
  return new HttpError(429, 'account_locked', {
    params: { minutes },
    headers: { 'Retry-After': String(minutes * 60) }
  });
}

function minutesUntil(date) {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 60000));
}

/**
 * Verify credentials with lockout and constant-ish timing.
 * Unknown users, wrong passwords and (for the admin surface) non-staff
 * accounts all produce the same `invalid_credentials` response.
 */
async function authenticate(req, config, { email, password, surface }) {
  const auditBase = { action: 'auth.login_failed', status: 'failure' };
  const user = await User.findOne({ email }).select('+passwordHash +passwordHistory');

  if (!user) {
    await verifyPassword(password, await dummyHash());
    await recordAudit(req, { ...auditBase, meta: { email, surface, reason: 'unknown_user' } });
    throw unauthorized('invalid_credentials');
  }

  if (user.isLocked()) {
    await verifyPassword(password, await dummyHash());
    await recordAudit(req, {
      ...auditBase,
      actor: user,
      entity: { type: 'user', id: user._id, label: user.email },
      meta: { surface, reason: 'locked' }
    });
    throw lockedError(minutesUntil(user.lockUntil));
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { failedLoginAttempts: 1 } },
      { new: true }
    );
    let locked = false;
    if (updated.failedLoginAttempts >= config.auth.maxFailedAttempts) {
      const minutes = config.auth.lockMinutes * 2 ** Math.min(updated.lockCount || 0, 4);
      await User.updateOne(
        { _id: user._id },
        { $set: { lockUntil: new Date(Date.now() + minutes * 60000), failedLoginAttempts: 0 }, $inc: { lockCount: 1 } }
      );
      locked = true;
      await recordAudit(req, {
        action: 'auth.locked',
        status: 'failure',
        actor: user,
        entity: { type: 'user', id: user._id, label: user.email },
        meta: { surface, minutes }
      });
    }
    await recordAudit(req, {
      ...auditBase,
      actor: user,
      entity: { type: 'user', id: user._id, label: user.email },
      meta: { surface, reason: 'bad_password', attempts: updated.failedLoginAttempts }
    });
    if (locked) throw lockedError(config.auth.lockMinutes);
    throw unauthorized('invalid_credentials');
  }

  if (surface === 'admin' && !isStaffRole(user.role)) {
    await recordAudit(req, {
      ...auditBase,
      actor: user,
      entity: { type: 'user', id: user._id, label: user.email },
      meta: { surface, reason: 'not_staff' }
    });
    throw unauthorized('invalid_credentials');
  }

  if (!user.isActive) {
    await recordAudit(req, {
      ...auditBase,
      actor: user,
      entity: { type: 'user', id: user._id, label: user.email },
      meta: { surface, reason: 'disabled' }
    });
    throw forbidden('account_disabled');
  }

  const update = {
    failedLoginAttempts: 0,
    lockCount: 0,
    lockUntil: null,
    lastLoginAt: new Date(),
    lastLoginIp: req.ip || ''
  };
  if (needsRehash(user.passwordHash)) update.passwordHash = await hashPassword(password);
  await User.updateOne({ _id: user._id }, { $set: update });
  Object.assign(user, update);
  return user;
}

function policyFields(field, issues) {
  return { [field]: { code: issues[0], params: {} } };
}

/**
 * Change the signed-in user's password. Enforces the policy and password
 * history, bumps tokenVersion (killing other sessions) and keeps the current one.
 */
async function changePassword(req, config, { currentPassword, newPassword }) {
  const user = await User.findById(req.auth.userId).select('+passwordHash +passwordHistory');
  if (!user) throw unauthorized('auth_required');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    await recordAudit(req, {
      action: 'auth.password_changed',
      status: 'failure',
      entity: { type: 'user', id: user._id, label: user.email },
      meta: { reason: 'wrong_current_password' }
    });
    throw validationFailed({ currentPassword: { code: 'wrong_password', params: {} } });
  }

  const issues = checkPasswordPolicy(newPassword, { email: user.email, name: user.name });
  if (issues.length) throw validationFailed(policyFields('newPassword', issues));

  const previous = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, Math.max(1, config.auth.passwordHistory));
  const reusedChecks = await Promise.all(previous.map((hash) => verifyPassword(newPassword, hash)));
  if (reusedChecks.some(Boolean)) {
    throw validationFailed({ newPassword: { code: 'password_reused', params: {} } });
  }

  const passwordHash = await hashPassword(newPassword);
  const tokenVersion = (user.tokenVersion || 0) + 1;
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        passwordHistory: previous.slice(0, config.auth.passwordHistory),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        tokenVersion
      }
    }
  );
  await Session.updateOne({ _id: req.auth.sessionId }, { $set: { tokenVersion } });
  const revoked = await Session.deleteMany({ user: user._id, _id: mongoose.trusted({ $ne: req.auth.sessionId }) });

  await recordAudit(req, {
    action: 'auth.password_changed',
    entity: { type: 'user', id: user._id, label: user.email },
    meta: { revokedSessions: revoked.deletedCount || 0 }
  });
}

/** Create an account with a policy-checked password. */
async function createUser({ email, name, phone = '', company = '', role = 'user', password, preferredLang = 'uz', createdBy = null, mustChangePassword = false }) {
  const issues = checkPasswordPolicy(password, { email, name });
  if (issues.length) throw validationFailed(policyFields('password', issues));
  const existing = await User.exists({ email });
  if (existing) throw validationFailed({ email: { code: 'already_exists', params: {} } });
  const passwordHash = await hashPassword(password);
  return User.create({
    email,
    name,
    phone,
    company,
    role,
    passwordHash,
    preferredLang,
    createdBy,
    mustChangePassword
  });
}

module.exports = { authenticate, changePassword, createUser, lockedError };

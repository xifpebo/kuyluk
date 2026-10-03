'use strict';

/**
 * User & role management (super-admin only). Guards prevent self-lockout
 * and removal of the last active super-admin; any change to role or status
 * invalidates the target's sessions via tokenVersion.
 */
const mongoose = require('mongoose');
const { User, Session, Shop } = require('../models');
const { recordAudit, diff } = require('./audit');
const { createUser } = require('./authService');
const { hashPassword, generateTemporaryPassword } = require('../security/password');
const { forbidden, notFound, conflict } = require('../lib/errors');
const { escapeRegex } = require('../lib/text');

const { trusted } = mongoose;

async function sessionCounts(userIds) {
  const rows = await Session.aggregate([
    { $match: { user: trusted({ $in: userIds }), expiresAt: trusted({ $gt: new Date() }) } },
    { $group: { _id: '$user', count: { $sum: 1 } } }
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function listUsers(query) {
  const conditions = [];
  if (query.q) {
    const pattern = escapeRegex(query.q.trim());
    conditions.push({
      $or: ['email', 'name', 'phone', 'company'].map((field) => ({ [field]: trusted({ $regex: pattern, $options: 'i' }) }))
    });
  }
  if (query.role) conditions.push({ role: query.role });
  if (query.status === 'active') conditions.push({ isActive: true });
  if (query.status === 'inactive') conditions.push({ isActive: false });
  if (query.status === 'locked') conditions.push({ lockUntil: trusted({ $gt: new Date() }) });
  const filter = conditions.length ? { $and: conditions } : {};
  const [docs, total] = await Promise.all([
    User.find(filter)
      .sort({ role: 1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    User.countDocuments(filter)
  ]);
  const counts = await sessionCounts(docs.map((doc) => doc._id));
  return {
    items: docs.map((doc) => ({ ...doc.toSafeJSON(), activeSessions: counts.get(String(doc._id)) || 0 })),
    total,
    page: query.page,
    pages: Math.ceil(total / query.limit),
    limit: query.limit
  };
}

async function loadTarget(id) {
  const user = await User.findById(id);
  if (!user) throw notFound();
  return user;
}

async function activeSuperadminCount(excludeId) {
  return User.countDocuments({ role: 'superadmin', isActive: true, _id: trusted({ $ne: excludeId }) });
}

async function create(req, input) {
  const temporary = !input.password;
  const password = input.password || generateTemporaryPassword();
  const user = await createUser({
    email: input.email,
    name: input.name,
    phone: input.phone,
    role: input.role,
    password,
    preferredLang: input.preferredLang,
    createdBy: req.auth.userId,
    mustChangePassword: true
  });
  await recordAudit(req, {
    action: 'user.create',
    entity: { type: 'user', id: user._id, label: user.email },
    meta: { role: user.role, temporaryPassword: temporary }
  });
  return { user: user.toSafeJSON(), temporaryPassword: temporary ? password : undefined };
}

async function update(req, id, input) {
  const user = await loadTarget(id);
  const isSelf = String(user._id) === req.auth.userId;
  const roleChanging = input.role !== undefined && input.role !== user.role;
  const statusChanging = input.isActive !== undefined && input.isActive !== user.isActive;
  if (isSelf && (roleChanging || statusChanging)) throw forbidden('cannot_modify_self');
  if (user.role === 'superadmin' && user.isActive && (roleChanging || input.isActive === false)) {
    if ((await activeSuperadminCount(user._id)) === 0) throw conflict('last_superadmin');
  }
  const before = user.toObject();
  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.preferredLang !== undefined) user.preferredLang = input.preferredLang;
  if (roleChanging) user.role = input.role;
  if (statusChanging) user.isActive = input.isActive;
  if (roleChanging || statusChanging) user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  let revoked = 0;
  if (roleChanging || statusChanging) {
    revoked = (await Session.deleteMany({ user: user._id })).deletedCount || 0;
  }
  const changes = diff(before, user.toObject(), ['name', 'phone', 'role', 'isActive', 'preferredLang']);
  if (changes.length) {
    await recordAudit(req, {
      action: 'user.update',
      entity: { type: 'user', id: user._id, label: user.email },
      changes,
      meta: revoked ? { revokedSessions: revoked } : undefined
    });
  }
  return user.toSafeJSON();
}

async function resetPassword(req, id) {
  const user = await loadTarget(id);
  if (String(user._id) === req.auth.userId) throw forbidden('cannot_modify_self');
  const password = generateTemporaryPassword();
  const passwordHash = await hashPassword(password);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockUntil: null
      },
      $inc: { tokenVersion: 1 }
    }
  );
  const revoked = (await Session.deleteMany({ user: user._id })).deletedCount || 0;
  await recordAudit(req, {
    action: 'user.password_reset',
    entity: { type: 'user', id: user._id, label: user.email },
    meta: { revokedSessions: revoked }
  });
  return { temporaryPassword: password };
}

async function unlock(req, id) {
  const user = await loadTarget(id);
  await User.updateOne({ _id: user._id }, { $set: { lockUntil: null, failedLoginAttempts: 0, lockCount: 0 } });
  await recordAudit(req, { action: 'user.unlock', entity: { type: 'user', id: user._id, label: user.email } });
}

async function revokeSessions(req, id) {
  const user = await loadTarget(id);
  const isSelf = String(user._id) === req.auth.userId;
  const filter = { user: user._id };
  if (isSelf) filter._id = trusted({ $ne: req.auth.sessionId });
  if (!isSelf) await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  const revoked = (await Session.deleteMany(filter)).deletedCount || 0;
  await recordAudit(req, {
    action: 'user.sessions_revoked',
    entity: { type: 'user', id: user._id, label: user.email },
    meta: { revokedSessions: revoked }
  });
  return { revoked };
}

async function remove(req, id) {
  const user = await loadTarget(id);
  if (String(user._id) === req.auth.userId) throw forbidden('cannot_modify_self');
  if (user.role === 'superadmin' && user.isActive && (await activeSuperadminCount(user._id)) === 0) {
    throw conflict('last_superadmin');
  }
  const ownedShop = await Shop.findOne({ owner: user._id }).select('name').lean();
  if (ownedShop) throw conflict('owns_shop', { params: { shop: ownedShop.name } });
  await Session.deleteMany({ user: user._id });
  await User.deleteOne({ _id: user._id });
  await recordAudit(req, {
    action: 'user.delete',
    entity: { type: 'user', id: user._id, label: user.email },
    meta: { role: user.role, name: user.name }
  });
}

module.exports = { listUsers, create, update, resetPassword, unlock, revokeSessions, remove };

'use strict';

const mongoose = require('mongoose');

const retentionDays = Number.parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10);

const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed, default: null },
    to: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { _id: false }
);

/**
 * Append-only administrative activity log. The application never updates or
 * deletes entries; the hooks below make accidental mutation fail loudly.
 */
const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true, maxlength: 64 },
    status: { type: String, enum: ['success', 'failure'], default: 'success' },
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      email: { type: String, default: '' },
      name: { type: String, default: '' },
      role: { type: String, default: '' }
    },
    entity: {
      type: { type: String, default: '' },
      id: { type: String, default: '' },
      label: { type: String, default: '' }
    },
    changes: { type: [changeSchema], default: [] },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    requestId: { type: String, default: '' }
  },
  { versionKey: false, minimize: false }
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ 'actor.id': 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ 'entity.type': 1, 'entity.id': 1, at: -1 });
if (Number.isFinite(retentionDays) && retentionDays > 0) {
  auditLogSchema.index({ at: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60, name: 'audit_retention' });
}

function immutable() {
  throw new Error('Audit log entries are append-only');
}

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditLogSchema.pre(op, immutable);
}
auditLogSchema.pre('save', function preventUpdate(next) {
  if (!this.isNew) return next(new Error('Audit log entries are append-only'));
  return next();
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

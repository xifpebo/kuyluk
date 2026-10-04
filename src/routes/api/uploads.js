'use strict';

/**
 * Image uploads for staff and shop owners. The raw image body is validated
 * by size, declared type and magic bytes before it is stored under a random name.
 */
const express = require('express');
const { asyncHandler } = require('../../lib/errors');
const { requireAuth, requirePermission, requireFreshPassword } = require('../../middleware/auth');
const { PERMISSIONS: P } = require('../../security/rbac');
const { saveImage, IMAGE_TYPES } = require('../../services/uploadService');
const { recordAudit } = require('../../services/audit');

function createUploadsRouter({ config, limiter }) {
  const router = express.Router();
  router.post(
    '/',
    requireAuth,
    requirePermission(P.UPLOADS_WRITE),
    requireFreshPassword,
    limiter.limit({ name: 'uploads', windowMs: 60 * 60 * 1000, max: 150, key: (req) => req.auth.userId }),
    express.raw({ type: IMAGE_TYPES, limit: config.uploads.maxBytes }),
    asyncHandler(async (req, res) => {
      const saved = await saveImage(config, req.body, req.get('content-type'));
      await recordAudit(req, {
        action: 'upload.create',
        entity: { type: 'upload', id: saved.url.split('/').pop().split('.')[0], label: saved.url },
        meta: { size: saved.size, type: saved.type }
      });
      res.status(201).json(saved);
    })
  );
  return router;
}

module.exports = { createUploadsRouter };

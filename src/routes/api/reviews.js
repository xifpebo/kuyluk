'use strict';

const express = require('express');
const { asyncHandler } = require('../../lib/errors');
const { validateRequest } = require('../../lib/schema');
const v = require('../../validation');
const reviews = require('../../services/reviewService');
const { requireAuth, requireFreshPassword, requirePermission } = require('../../middleware/auth');
const { PERMISSIONS: P } = require('../../security/rbac');

/** Signed-in users submit reviews; they are published after moderation. */
function createReviewsRouter({ limiter }) {
  const router = express.Router();
  router.post(
    '/',
    requireAuth,
    requireFreshPassword,
    requirePermission(P.REVIEWS_WRITE),
    limiter.limit({ name: 'review-create', windowMs: 60 * 60 * 1000, max: 10, key: (req) => req.auth.userId }),
    validateRequest({ body: v.reviewCreate }),
    asyncHandler(async (req, res) => res.status(201).json(await reviews.create(req, req.valid.body)))
  );
  return router;
}

module.exports = { createReviewsRouter };

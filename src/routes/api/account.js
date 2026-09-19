'use strict';

const express = require('express');
const { User } = require('../../models');
const { asyncHandler } = require('../../lib/errors');
const { parse } = require('../../lib/schema');
const v = require('../../validation');
const quotes = require('../../services/quoteService');
const { recordAudit, diff } = require('../../services/audit');
const { requireAuth, requireFreshPassword } = require('../../middleware/auth');

/** Endpoints for the signed-in customer (own data only). */
function createAccountRouter() {
  const router = express.Router();
  router.use(requireAuth, requireFreshPassword);

  router.get(
    '/quotes',
    asyncHandler(async (req, res) => {
      res.json({ items: await quotes.listQuotesForUser(req.auth.userId) });
    })
  );

  router.patch(
    '/profile',
    asyncHandler(async (req, res) => {
      const input = parse(v.profile, req.body);
      const user = await User.findById(req.auth.userId);
      const before = user.toObject();
      for (const field of ['name', 'phone', 'company', 'preferredLang']) {
        if (input[field] !== undefined) user[field] = input[field];
      }
      await user.save();
      const changes = diff(before, user.toObject(), ['name', 'phone', 'company', 'preferredLang']);
      if (changes.length) {
        await recordAudit(req, {
          action: 'account.update',
          entity: { type: 'user', id: user._id, label: user.email },
          changes
        });
      }
      res.json({ user: user.toSafeJSON() });
    })
  );

  return router;
}

module.exports = { createAccountRouter };

'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { User, Product } = require('../../models');
const { asyncHandler } = require('../../lib/errors');
const { parse, validateRequest } = require('../../lib/schema');
const v = require('../../validation');
const reviews = require('../../services/reviewService');
const { recordAudit, diff } = require('../../services/audit');
const { requireAuth, requireFreshPassword } = require('../../middleware/auth');

const { trusted } = mongoose;
const MAX_FAVORITES = 200;

/** Endpoints for the signed-in user (own data only). */
function createAccountRouter() {
  const router = express.Router();
  router.use(requireAuth, requireFreshPassword);

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

  /** Favourites are kept in the browser and synced here when signed in. */
  router.get(
    '/favorites',
    asyncHandler(async (req, res) => {
      const user = await User.findById(req.auth.userId).select('favorites').lean();
      res.json({ products: (user?.favorites || []).map(String) });
    })
  );

  router.put(
    '/favorites',
    validateRequest({ body: v.favorites }),
    asyncHandler(async (req, res) => {
      const { products, merge } = req.valid.body;
      const user = await User.findById(req.auth.userId).select('favorites').lean();
      const wanted = merge ? [...new Set([...(user?.favorites || []).map(String), ...products])] : products;
      const existing = await Product.find({ _id: trusted({ $in: wanted.slice(0, MAX_FAVORITES * 2) }) }).select('_id').lean();
      const valid = new Set(existing.map((p) => String(p._id)));
      const list = wanted.filter((id) => valid.has(id)).slice(0, MAX_FAVORITES);
      await User.updateOne({ _id: req.auth.userId }, { $set: { favorites: list } });
      res.json({ products: list });
    })
  );

  router.get(
    '/reviews',
    asyncHandler(async (req, res) => res.json({ items: await reviews.listMine(req.auth.userId) }))
  );

  return router;
}

module.exports = { createAccountRouter };

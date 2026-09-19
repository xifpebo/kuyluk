'use strict';

const express = require('express');
const { asyncHandler, validationFailed } = require('../../lib/errors');
const { parse } = require('../../lib/schema');
const v = require('../../validation');
const quotes = require('../../services/quoteService');

function createQuotesRouter({ config, limiter }) {
  const router = express.Router();

  router.post(
    '/',
    limiter.limit({ name: 'quote-create', windowMs: 60 * 60 * 1000, max: 15, failClosed: true }),
    asyncHandler(async (req, res) => {
      const input = parse(v.quoteCreate, req.body);
      const fields = v.quoteCrossChecks(input);
      if (Object.keys(fields).length) throw validationFailed(fields);
      const quote = await quotes.createQuote(req, config, input);
      res.status(201).json({
        number: quote.number,
        status: quote.status,
        estimatedTotal: quote.estimatedTotal,
        items: quote.items.length,
        tracked: Boolean(req.auth)
      });
    })
  );

  return router;
}

module.exports = { createQuotesRouter };

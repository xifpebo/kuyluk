'use strict';

const User = require('./User');
const Session = require('./Session');
const AuditLog = require('./AuditLog');
const RateLimitHit = require('./RateLimitHit');
const Category = require('./Category');
const Brand = require('./Brand');
const Supplier = require('./Supplier');
const Product = require('./Product');
const QuoteRequest = require('./QuoteRequest');

const models = { User, Session, AuditLog, RateLimitHit, Category, Brand, Supplier, Product, QuoteRequest };

/** Ensure collections and indexes exist (unique constraints must be in place before traffic). */
async function initModels() {
  await Promise.all(Object.values(models).map((model) => model.init()));
}

module.exports = { ...models, models, initModels };

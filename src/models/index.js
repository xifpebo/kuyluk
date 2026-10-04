'use strict';

const User = require('./User');
const Session = require('./Session');
const AuditLog = require('./AuditLog');
const RateLimitHit = require('./RateLimitHit');
const Category = require('./Category');
const Brand = require('./Brand');
const Shop = require('./Shop');
const Product = require('./Product');
const Review = require('./Review');
const Banner = require('./Banner');
const Setting = require('./Setting');
const Translation = require('./Translation');
const ShopStat = require('./ShopStat');

const models = { User, Session, AuditLog, RateLimitHit, Category, Brand, Shop, Product, Review, Banner, Setting, Translation, ShopStat };

/** Ensure collections and indexes exist (unique constraints must be in place before traffic). */
async function initModels() {
  await Promise.all(Object.values(models).map((model) => model.init()));
}

module.exports = { ...models, models, initModels };

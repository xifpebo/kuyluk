'use strict';

const mongoose = require('mongoose');
const { initModels } = require('./models');
const { logger } = require('./logger');

// Query hardening: unknown filter paths are dropped and any operator object
// that is not explicitly wrapped with mongoose.trusted() is neutralised with $eq.
mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);
mongoose.set('autoIndex', true);

async function connectDatabase(uri, { serverSelectionTimeoutMS = 10000 } = {}) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS, maxPoolSize: 20 });
  await initModels();
  logger.info('MongoDB connected', { db: mongoose.connection.name });
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, mongoose };

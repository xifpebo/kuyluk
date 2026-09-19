'use strict';

/**
 * MiniMongo — a small in-memory server that speaks the MongoDB wire protocol.
 *
 * It exists so the test suite and the offline demo (`npm run demo`) can run
 * the real Mongoose/driver code without a MongoDB installation. It supports
 * the subset of commands this application uses. It is NOT a database: no
 * persistence, no auth, no transactions. Never use it in production.
 */
const net = require('node:net');
const BSON = require('bson');
const { ObjectId, Long, Double } = BSON;
const { DESERIALIZE_OPTIONS, clone, getPath, canonicalKey, isPlainObject, toNumber } = require('./values');
const {
  CommandError,
  compileFilter,
  sortDocuments,
  applyProjection,
  applyUpdate,
  isUpdateOperatorDocument,
  upsertSeed,
  runPipeline
} = require('./engine');

const OP_REPLY = 1;
const OP_QUERY = 2004;
const OP_MSG = 2013;
const MAX_WIRE_VERSION = 21;

class Collection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
    this.docs = [];
    this.indexes = [{ v: 2, key: { _id: 1 }, name: '_id_' }];
  }

  get ns() {
    return `${this.db.name}.${this.name}`;
  }

  indexKeys(doc, index) {
    const fields = Object.keys(index.key);
    if (index.partialFilterExpression && !compileFilter(index.partialFilterExpression)(doc)) return [];
    const perField = fields.map((field) => {
      const value = getPath(doc, field);
      if (Array.isArray(value)) return value.length ? value : [undefined];
      return [value];
    });
    if (index.sparse && perField.every((values) => values.every((v) => v === undefined))) return [];
    let combos = [[]];
    for (const values of perField) {
      const next = [];
      for (const combo of combos) for (const v of values) next.push([...combo, v]);
      combos = next;
    }
    return combos.map((combo) => ({
      key: combo.map((v) => canonicalKey(v)).join('|'),
      values: combo
    }));
  }

  assertUnique(doc, ignore) {
    for (const index of this.indexes) {
      const unique = index.name === '_id_' || index.unique;
      if (!unique) continue;
      const keys = this.indexKeys(doc, index);
      if (!keys.length) continue;
      const wanted = new Set(keys.map((k) => k.key));
      for (const other of this.docs) {
        if (other === ignore) continue;
        const clash = this.indexKeys(other, index).find((k) => wanted.has(k.key));
        if (clash) {
          const fields = Object.keys(index.key);
          const mine = keys.find((k) => k.key === clash.key);
          const keyValue = {};
          fields.forEach((field, i) => {
            keyValue[field] = mine.values[i] === undefined ? null : mine.values[i];
          });
          const shown = fields
            .map((field) => `${field}: ${JSON.stringify(keyValue[field] instanceof ObjectId ? keyValue[field].toHexString() : keyValue[field])}`)
            .join(', ');
          throw new CommandError(11000, 'DuplicateKey', `E11000 duplicate key error collection: ${this.ns} index: ${index.name} dup key: { ${shown} }`, {
            keyPattern: { ...index.key },
            keyValue
          });
        }
      }
    }
  }

  insert(doc) {
    const stored = clone(doc);
    if (stored._id === undefined) {
      const withId = { _id: new ObjectId(), ...stored };
      this.assertUnique(withId);
      this.docs.push(withId);
      return withId;
    }
    this.assertUnique(stored);
    this.docs.push(stored);
    return stored;
  }

  find(filter) {
    const test = compileFilter(filter);
    return this.docs.filter((doc) => test(doc));
  }

  replaceDoc(original, updated) {
    this.assertUnique(updated, original);
    const idx = this.docs.indexOf(original);
    this.docs[idx] = updated;
  }

  removeDocs(toRemove) {
    const set = new Set(toRemove);
    this.docs = this.docs.filter((doc) => !set.has(doc));
  }

  sweepTtl(now) {
    for (const index of this.indexes) {
      if (typeof index.expireAfterSeconds !== 'number') continue;
      const [field] = Object.keys(index.key);
      const limit = now - index.expireAfterSeconds * 1000;
      this.docs = this.docs.filter((doc) => {
        const value = getPath(doc, field);
        const dates = (Array.isArray(value) ? value : [value]).filter((v) => v instanceof Date);
        if (!dates.length) return true;
        return !dates.some((d) => d.getTime() <= limit);
      });
    }
  }
}

class Database {
  constructor(name) {
    this.name = name;
    this.collections = new Map();
  }

  get(name, create = true) {
    let coll = this.collections.get(name);
    if (!coll && create) {
      coll = new Collection(this, name);
      this.collections.set(name, coll);
    }
    return coll;
  }
}

function cursorReply(ns, docs, key = 'firstBatch') {
  return { cursor: { [key]: docs, id: Long.ZERO, ns }, ok: new Double(1) };
}

function commandName(cmd) {
  return Object.keys(cmd)[0];
}

class MiniMongoServer {
  constructor({ host = '127.0.0.1', port = 0, ttlIntervalMs = 1000 } = {}) {
    this.host = host;
    this.port = port;
    this.ttlIntervalMs = ttlIntervalMs;
    this.databases = new Map();
    this.sockets = new Set();
    this.connectionCounter = 0;
    this.server = null;
    this.ttlTimer = null;
  }

  db(name) {
    let db = this.databases.get(name);
    if (!db) {
      db = new Database(name);
      this.databases.set(name, db);
    }
    return db;
  }

  async start() {
    this.server = net.createServer((socket) => this.onConnection(socket));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, resolve);
    });
    this.port = this.server.address().port;
    this.ttlTimer = setInterval(() => this.sweepTtl(), this.ttlIntervalMs);
    this.ttlTimer.unref();
    return this;
  }

  get uri() {
    return `mongodb://${this.host}:${this.port}`;
  }

  uriFor(dbName) {
    return `${this.uri}/${dbName}?directConnection=true`;
  }

  async stop() {
    clearInterval(this.ttlTimer);
    for (const socket of this.sockets) socket.destroy();
    if (this.server) await new Promise((resolve) => this.server.close(() => resolve()));
    this.server = null;
  }

  sweepTtl() {
    const now = Date.now();
    for (const db of this.databases.values()) {
      for (const coll of db.collections.values()) coll.sweepTtl(now);
    }
  }

  onConnection(socket) {
    const connectionId = ++this.connectionCounter;
    this.sockets.add(socket);
    let buffer = Buffer.alloc(0);
    let chain = Promise.resolve();
    socket.on('data', (chunk) => {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      while (buffer.length >= 4) {
        const length = buffer.readInt32LE(0);
        if (buffer.length < length) break;
        const message = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        chain = chain
          .then(() => this.onMessage(socket, message, connectionId))
          .catch(() => socket.destroy());
      }
    });
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => socket.destroy());
  }

  async onMessage(socket, message, connectionId) {
    const requestId = message.readInt32LE(4);
    const opCode = message.readInt32LE(12);
    if (opCode === OP_QUERY) {
      let offset = 20;
      const nameEnd = message.indexOf(0, offset);
      const fullName = message.toString('utf8', offset, nameEnd);
      offset = nameEnd + 1 + 8;
      const docSize = message.readInt32LE(offset);
      const query = BSON.deserialize(message.subarray(offset, offset + docSize), DESERIALIZE_OPTIONS);
      const dbName = fullName.split('.')[0];
      const reply = this.execute(dbName, query, {}, connectionId);
      this.writeReply(socket, requestId, reply);
      return;
    }
    if (opCode !== OP_MSG) {
      socket.destroy();
      return;
    }
    const flags = message.readUInt32LE(16);
    const checksumPresent = (flags & 1) !== 0;
    const moreToCome = (flags & 2) !== 0;
    const end = message.length - (checksumPresent ? 4 : 0);
    let offset = 20;
    let body = null;
    const sequences = {};
    while (offset < end) {
      const kind = message[offset];
      offset += 1;
      if (kind === 0) {
        const size = message.readInt32LE(offset);
        body = BSON.deserialize(message.subarray(offset, offset + size), DESERIALIZE_OPTIONS);
        offset += size;
      } else if (kind === 1) {
        const size = message.readInt32LE(offset);
        const sectionEnd = offset + size;
        let cursor = offset + 4;
        const idEnd = message.indexOf(0, cursor);
        const identifier = message.toString('utf8', cursor, idEnd);
        cursor = idEnd + 1;
        const docs = [];
        while (cursor < sectionEnd) {
          const docSize = message.readInt32LE(cursor);
          docs.push(BSON.deserialize(message.subarray(cursor, cursor + docSize), DESERIALIZE_OPTIONS));
          cursor += docSize;
        }
        sequences[identifier] = docs;
        offset = sectionEnd;
      } else {
        throw new Error(`Unsupported OP_MSG section kind ${kind}`);
      }
    }
    const dbName = body.$db || 'admin';
    const reply = this.execute(dbName, body, sequences, connectionId);
    if (!moreToCome) this.writeMsg(socket, requestId, reply);
  }

  writeReply(socket, responseTo, doc) {
    const payload = BSON.serialize(doc, { ignoreUndefined: true });
    const header = Buffer.alloc(36);
    header.writeInt32LE(36 + payload.length, 0);
    header.writeInt32LE(0, 4);
    header.writeInt32LE(responseTo, 8);
    header.writeInt32LE(OP_REPLY, 12);
    header.writeInt32LE(0, 16);
    header.writeBigInt64LE(0n, 20);
    header.writeInt32LE(0, 28);
    header.writeInt32LE(1, 32);
    socket.write(Buffer.concat([header, payload]));
  }

  writeMsg(socket, responseTo, doc) {
    const payload = BSON.serialize(doc, { ignoreUndefined: true });
    const header = Buffer.alloc(21);
    header.writeInt32LE(21 + payload.length, 0);
    header.writeInt32LE(0, 4);
    header.writeInt32LE(responseTo, 8);
    header.writeInt32LE(OP_MSG, 12);
    header.writeUInt32LE(0, 16);
    header.writeUInt8(0, 20);
    socket.write(Buffer.concat([header, payload]));
  }

  execute(dbName, cmd, sequences, connectionId) {
    try {
      return this.dispatch(dbName, { ...cmd, ...sequences }, connectionId);
    } catch (error) {
      if (error instanceof CommandError) {
        return { ok: new Double(0), errmsg: error.message, code: error.code, codeName: error.codeName, ...error.extra };
      }
      return { ok: new Double(0), errmsg: `MiniMongo internal error: ${error.message}`, code: 1, codeName: 'InternalError' };
    }
  }

  hello(connectionId) {
    return {
      helloOk: true,
      ismaster: true,
      isWritablePrimary: true,
      maxBsonObjectSize: 16 * 1024 * 1024,
      maxMessageSizeBytes: 48000000,
      maxWriteBatchSize: 100000,
      localTime: new Date(),
      logicalSessionTimeoutMinutes: 30,
      connectionId,
      minWireVersion: 0,
      maxWireVersion: MAX_WIRE_VERSION,
      readOnly: false,
      ok: new Double(1)
    };
  }

  dispatch(dbName, cmd, connectionId) {
    const name = commandName(cmd);
    const lower = name.toLowerCase();
    const db = this.db(dbName);
    switch (lower) {
      case 'hello':
      case 'ismaster':
        return this.hello(connectionId);
      case 'ping':
      case 'endsessions':
      case 'killallsessions':
      case 'getparameter':
      case 'collmod':
      case 'setparameter':
        return { ok: new Double(1) };
      case 'buildinfo':
        return { version: '7.0.0-minimongo', versionArray: [7, 0, 0, 0], ok: new Double(1) };
      case 'serverstatus':
        return { host: `${this.host}:${this.port}`, version: '7.0.0-minimongo', ok: new Double(1) };
      case 'listdatabases':
        return {
          databases: [...this.databases.keys()].map((n) => ({ name: n, sizeOnDisk: 0, empty: false })),
          totalSize: 0,
          ok: new Double(1)
        };
      case 'dropdatabase':
        this.databases.delete(dbName);
        return { dropped: dbName, ok: new Double(1) };
      case 'create': {
        if (db.collections.has(cmd[name])) {
          throw new CommandError(48, 'NamespaceExists', `Collection ${dbName}.${cmd[name]} already exists.`);
        }
        db.get(cmd[name]);
        return { ok: new Double(1) };
      }
      case 'drop': {
        if (!db.collections.has(cmd[name])) {
          throw new CommandError(26, 'NamespaceNotFound', 'ns not found');
        }
        db.collections.delete(cmd[name]);
        return { ns: `${dbName}.${cmd[name]}`, nIndexesWas: 1, ok: new Double(1) };
      }
      case 'listcollections': {
        const test = compileFilter(cmd.filter);
        const docs = [...db.collections.keys()]
          .map((n) => ({ name: n, type: 'collection', options: {}, info: { readOnly: false } }))
          .filter((doc) => test(doc));
        return cursorReply(`${dbName}.$cmd.listCollections`, cmd.nameOnly ? docs.map((d) => ({ name: d.name, type: d.type })) : docs);
      }
      case 'createindexes':
        return this.createIndexes(db, cmd, name);
      case 'listindexes': {
        const coll = db.get(cmd[name], false);
        if (!coll) throw new CommandError(26, 'NamespaceNotFound', `ns does not exist: ${dbName}.${cmd[name]}`);
        return cursorReply(coll.ns, coll.indexes.map((index) => ({ ...index })));
      }
      case 'dropindexes': {
        const coll = db.get(cmd[name], false);
        if (!coll) throw new CommandError(26, 'NamespaceNotFound', 'ns not found');
        const target = cmd.index;
        const before = coll.indexes.length;
        if (target === '*') coll.indexes = coll.indexes.filter((i) => i.name === '_id_');
        else {
          const names = Array.isArray(target) ? target : [target];
          coll.indexes = coll.indexes.filter((i) => {
            if (i.name === '_id_') return true;
            if (typeof target === 'object' && !Array.isArray(target)) return canonicalKey(i.key) !== canonicalKey(target);
            return !names.includes(i.name);
          });
        }
        return { nIndexesWas: before, ok: new Double(1) };
      }
      case 'insert':
        return this.insert(db, cmd, name);
      case 'find':
        return this.find(db, cmd, name);
      case 'getmore':
        return cursorReply(`${dbName}.${cmd.collection}`, [], 'nextBatch');
      case 'killcursors':
        return { cursorsKilled: cmd.cursors || [], cursorsNotFound: [], cursorsAlive: [], cursorsUnknown: [], ok: new Double(1) };
      case 'count': {
        const coll = db.get(cmd[name], false);
        let docs = coll ? coll.find(cmd.query) : [];
        if (cmd.skip) docs = docs.slice(toNumber(cmd.skip));
        if (cmd.limit) docs = docs.slice(0, Math.abs(toNumber(cmd.limit)));
        return { n: docs.length, ok: new Double(1) };
      }
      case 'distinct': {
        const coll = db.get(cmd[name], false);
        const docs = coll ? coll.find(cmd.query) : [];
        const seen = new Map();
        for (const doc of docs) {
          const value = getPath(doc, cmd.key);
          const values = Array.isArray(value) ? value : [value];
          for (const v of values) {
            if (v === undefined) continue;
            const key = canonicalKey(v);
            if (!seen.has(key)) seen.set(key, v);
          }
        }
        return { values: [...seen.values()], ok: new Double(1) };
      }
      case 'update':
        return this.update(db, cmd, name);
      case 'delete':
        return this.remove(db, cmd, name);
      case 'findandmodify':
        return this.findAndModify(db, cmd, name);
      case 'aggregate':
        return this.aggregate(db, cmd, name);
      case 'dbstats':
        return {
          db: dbName,
          collections: db.collections.size,
          objects: [...db.collections.values()].reduce((n, c) => n + c.docs.length, 0),
          ok: new Double(1)
        };
      default:
        throw new CommandError(59, 'CommandNotFound', `no such command: '${name}'`);
    }
  }

  createIndexes(db, cmd, name) {
    const existed = db.collections.has(cmd[name]);
    const coll = db.get(cmd[name]);
    const before = coll.indexes.length;
    for (const spec of cmd.indexes || []) {
      const existing = coll.indexes.find((i) => i.name === spec.name);
      if (existing) {
        if (canonicalKey(existing.key) !== canonicalKey(spec.key)) {
          throw new CommandError(86, 'IndexKeySpecsConflict', `An existing index has the same name as the requested index: ${spec.name}`);
        }
        continue;
      }
      const index = { v: 2, ...spec };
      if (Object.values(index.key).some((v) => typeof v === 'string' && v !== 'hashed')) {
        // text / geo indexes are accepted but not used for querying.
        index.unsupported = true;
      }
      if (index.unique && !index.unsupported) {
        const seen = new Map();
        for (const doc of coll.docs) {
          for (const { key } of coll.indexKeys(doc, index)) {
            if (seen.has(key) && seen.get(key) !== doc) {
              throw new CommandError(11000, 'DuplicateKey', `E11000 duplicate key error collection: ${coll.ns} index: ${index.name}`);
            }
            seen.set(key, doc);
          }
        }
      }
      coll.indexes.push(index);
    }
    return {
      createdCollectionAutomatically: !existed,
      numIndexesBefore: before,
      numIndexesAfter: coll.indexes.length,
      ok: new Double(1)
    };
  }

  insert(db, cmd, name) {
    const coll = db.get(cmd[name]);
    const docs = cmd.documents || [];
    const ordered = cmd.ordered !== false;
    const writeErrors = [];
    let n = 0;
    docs.forEach((doc, index) => {
      if (ordered && writeErrors.length) return;
      try {
        coll.insert(doc);
        n += 1;
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        writeErrors.push({ index, code: error.code, errmsg: error.message, ...error.extra });
      }
    });
    const reply = { n, ok: new Double(1) };
    if (writeErrors.length) reply.writeErrors = writeErrors;
    return reply;
  }

  find(db, cmd, name) {
    const coll = db.get(cmd[name], false);
    const ns = `${db.name}.${cmd[name]}`;
    if (!coll) return cursorReply(ns, []);
    let docs = sortDocuments(coll.find(cmd.filter), cmd.sort);
    if (cmd.skip) docs = docs.slice(toNumber(cmd.skip));
    if (cmd.limit) docs = docs.slice(0, Math.abs(toNumber(cmd.limit)));
    docs = docs.map((doc) => applyProjection(clone(doc), cmd.projection));
    return cursorReply(ns, docs);
  }

  update(db, cmd, name) {
    const coll = db.get(cmd[name]);
    const ordered = cmd.ordered !== false;
    const writeErrors = [];
    const upserted = [];
    let n = 0;
    let nModified = 0;
    (cmd.updates || []).forEach((spec, index) => {
      if (ordered && writeErrors.length) return;
      try {
        const matches = coll.find(spec.q);
        const targets = spec.multi ? matches : matches.slice(0, 1);
        if (!targets.length && spec.upsert) {
          const doc = isUpdateOperatorDocument(spec.u) ? upsertSeed(spec.q) : {};
          const seedId = upsertSeed(spec.q)._id;
          if (!isUpdateOperatorDocument(spec.u) && seedId !== undefined) doc._id = seedId;
          applyUpdate(doc, spec.u, { isInsert: true });
          const stored = coll.insert(doc);
          upserted.push({ index, _id: stored._id });
          n += 1;
          return;
        }
        for (const target of targets) {
          const updated = clone(target);
          applyUpdate(updated, spec.u);
          n += 1;
          if (canonicalKey(updated) !== canonicalKey(target)) {
            coll.replaceDoc(target, updated);
            nModified += 1;
          }
        }
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        writeErrors.push({ index, code: error.code, errmsg: error.message, ...error.extra });
      }
    });
    const reply = { n, nModified, ok: new Double(1) };
    if (upserted.length) reply.upserted = upserted;
    if (writeErrors.length) reply.writeErrors = writeErrors;
    return reply;
  }

  remove(db, cmd, name) {
    const coll = db.get(cmd[name], false);
    let n = 0;
    for (const spec of cmd.deletes || []) {
      if (!coll) break;
      const matches = coll.find(spec.q);
      const targets = toNumber(spec.limit || 0) === 1 ? matches.slice(0, 1) : matches;
      coll.removeDocs(targets);
      n += targets.length;
    }
    return { n, ok: new Double(1) };
  }

  findAndModify(db, cmd, name) {
    const coll = db.get(cmd[name]);
    const matches = sortDocuments(coll.find(cmd.query), cmd.sort);
    const target = matches[0];
    const project = (doc) => (doc ? applyProjection(clone(doc), cmd.fields) : null);
    if (cmd.remove) {
      if (target) coll.removeDocs([target]);
      return { lastErrorObject: { n: target ? 1 : 0 }, value: project(target), ok: new Double(1) };
    }
    const update = cmd.update;
    if (!target) {
      if (!cmd.upsert) {
        return { lastErrorObject: { n: 0, updatedExisting: false }, value: null, ok: new Double(1) };
      }
      const doc = isUpdateOperatorDocument(update) ? upsertSeed(cmd.query) : {};
      const seedId = upsertSeed(cmd.query)._id;
      if (!isUpdateOperatorDocument(update) && seedId !== undefined) doc._id = seedId;
      applyUpdate(doc, update, { isInsert: true });
      const stored = coll.insert(doc);
      return {
        lastErrorObject: { n: 1, updatedExisting: false, upserted: stored._id },
        value: cmd.new ? project(stored) : null,
        ok: new Double(1)
      };
    }
    const updated = clone(target);
    applyUpdate(updated, update);
    coll.replaceDoc(target, updated);
    return {
      lastErrorObject: { n: 1, updatedExisting: true },
      value: project(cmd.new ? updated : target),
      ok: new Double(1)
    };
  }

  aggregate(db, cmd, name) {
    const source = cmd[name];
    const ns = `${db.name}.${source}`;
    const coll = typeof source === 'string' ? db.get(source, false) : null;
    const docs = coll ? coll.docs.map((doc) => doc) : [];
    const pipeline = cmd.pipeline || [];
    const outStage = pipeline.find((stage) => isPlainObject(stage) && ('$out' in stage || '$merge' in stage));
    if (outStage) throw new CommandError(2, 'BadValue', 'MiniMongo does not support $out/$merge');
    const result = runPipeline(docs, pipeline, {
      getCollectionDocs: (collName) => {
        const other = db.get(collName, false);
        return other ? other.docs : [];
      }
    });
    return cursorReply(ns, result.map((doc) => clone(doc)));
  }
}

async function startMiniMongo(options) {
  const server = new MiniMongoServer(options);
  await server.start();
  return server;
}

module.exports = { MiniMongoServer, startMiniMongo };

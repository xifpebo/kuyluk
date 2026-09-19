'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Minimal structured logger. JSON lines in production, readable lines otherwise.
 * Never pass secrets, passwords, cookies or request bodies to it.
 */
function createLogger({ level = 'info', json = false } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const write = (lvl, message, meta) => {
    if (LEVELS[lvl] < threshold) return;
    const stream = LEVELS[lvl] >= LEVELS.warn ? process.stderr : process.stdout;
    if (json) {
      const entry = { time: new Date().toISOString(), level: lvl, msg: message, ...meta };
      if (meta && meta.err instanceof Error) {
        entry.err = { name: meta.err.name, message: meta.err.message, stack: meta.err.stack };
      }
      stream.write(`${JSON.stringify(entry)}\n`);
      return;
    }
    let line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${message}`;
    if (meta) {
      const { err, ...rest } = meta;
      if (Object.keys(rest).length) line += ` ${JSON.stringify(rest)}`;
      if (err instanceof Error) line += `\n${err.stack}`;
    }
    stream.write(`${line}\n`);
  };

  return {
    level,
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta)
  };
}

let current = createLogger({ level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' });

module.exports = {
  createLogger,
  get logger() {
    return current;
  },
  setLogger(next) {
    current = next;
  }
};

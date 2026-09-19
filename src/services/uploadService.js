'use strict';

/**
 * Image uploads without multipart parsing: the browser sends one raw image
 * per request. The declared Content-Type must match the file signature
 * (magic bytes); files get random names and are served with `nosniff` and a
 * sandboxing CSP. SVG and other active formats are rejected.
 */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { HttpError } = require('../lib/errors');

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function saveImage(config, buffer, declaredType) {
  const maxMb = Math.round(config.uploads.maxBytes / (1024 * 1024));
  const type = String(declaredType || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[type]) throw new HttpError(415, 'invalid_image', { params: { max: maxMb } });
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, 'invalid_image', { params: { max: maxMb } });
  if (buffer.length > config.uploads.maxBytes) throw new HttpError(413, 'invalid_image', { params: { max: maxMb } });
  if (detectImageType(buffer) !== type) throw new HttpError(415, 'invalid_image', { params: { max: maxMb } });

  const now = new Date();
  const folder = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'));
  const name = `${crypto.randomBytes(16).toString('hex')}.${TYPES[type]}`;
  const dir = path.join(config.uploads.dir, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer, { flag: 'wx', mode: 0o644 });
  return {
    url: `/uploads/${folder.split(path.sep).join('/')}/${name}`,
    size: buffer.length,
    type
  };
}

module.exports = { saveImage, detectImageType, IMAGE_TYPES: Object.keys(TYPES) };

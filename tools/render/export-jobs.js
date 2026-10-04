'use strict';

/**
 * Write tools/render/jobs.json from the seed catalog so Blender can render one
 * studio photo per product (plus extra angles and shop covers).
 *   node tools/render/export-jobs.js [--only SKU,SKU] [--missing]
 */
const fs = require('node:fs');
const path = require('node:path');
const { products } = require('../../src/seed/data');
const { shops } = require('../../src/seed/data/shops');
const { productImagePaths, shopCoverPath } = require('../../src/seed/images');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const missing = args.includes('--missing');

const jobs = [];
for (const product of products) {
  if (only && !only.has(product.sku)) continue;
  const shots = [product.photo, ...(product.photos || [])];
  productImagePaths(product).forEach((url, index) => {
    const shot = shots[index];
    if (!shot) return;
    jobs.push({ out: path.join(ROOT, 'public', url), ...shot });
  });
}
for (const shop of shops) {
  if (only && !only.has(shop.slug)) continue;
  jobs.push({ out: path.join(ROOT, 'public', shopCoverPath(shop)), cover: shop.cover.models, bg: shop.cover.bg });
}
const list = missing ? jobs.filter((job) => !fs.existsSync(job.out)) : jobs;
fs.writeFileSync(path.join(__dirname, 'jobs.json'), JSON.stringify(list, null, 1));
process.stdout.write(`${list.length} render jobs written\n`);

'use strict';

/**
 * Generates the Stroy Bazar brand mark (favicon/logo SVG) and a monogram
 * logo for every demo shop (public/img/shops/<slug>-logo.svg).
 *   node tools/generate-brand-assets.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { shops, pendingShop } = require('../src/seed/data/shops');

const ROOT = path.join(__dirname, '..', 'public', 'img');

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <defs><linearGradient id="sb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9A3D"/><stop offset="1" stop-color="#F0640A"/></linearGradient></defs>
  <rect x="2" y="2" width="44" height="44" rx="11" fill="url(#sb)"/>
  <path d="M10.5 22.5 24 11.5l13.5 11" fill="none" stroke="#14110E" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="12" y="26" width="15" height="6.2" rx="1.6" fill="#14110E"/>
  <rect x="29" y="26" width="7" height="6.2" rx="1.6" fill="#14110E" fill-opacity=".55"/>
  <rect x="12" y="34" width="7" height="6.2" rx="1.6" fill="#14110E" fill-opacity=".55"/>
  <rect x="21" y="34" width="15" height="6.2" rx="1.6" fill="#14110E"/>
</svg>
`;

function initials(name) {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const SHAPES = [
  (c) => `<rect x="4" y="4" width="112" height="112" rx="28" fill="${c}"/>`,
  (c) => `<circle cx="60" cy="60" r="56" fill="${c}"/>`,
  (c) => `<path d="M60 4 108.5 32v56L60 116 11.5 88V32z" fill="${c}"/>`,
  (c) => `<rect x="4" y="4" width="112" height="112" rx="10" fill="${c}"/>`
];

function shopLogo(shop, index) {
  const accent = shop.accent || '#FF7A1A';
  const dark = shade(accent, -48);
  const shape = SHAPES[index % SHAPES.length];
  const text = initials(shop.name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(accent, 26)}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
  ${shape('url(#g)')}
  <path d="M30 86h60" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>
  <text x="60" y="${text.length > 1 ? 72 : 74}" text-anchor="middle" font-family="Oswald, 'Arial Narrow', Arial, sans-serif" font-weight="700" font-size="${text.length > 1 ? 44 : 52}" letter-spacing="1" fill="#fff">${text}</text>
</svg>
`;
}

fs.writeFileSync(path.join(ROOT, 'favicon.svg'), MARK);
fs.writeFileSync(path.join(ROOT, 'logo-mark.svg'), MARK);
[...shops, pendingShop].forEach((shop, index) => {
  fs.writeFileSync(path.join(ROOT, 'shops', `${shop.slug}-logo.svg`), shopLogo(shop, index));
});
process.stdout.write(`Wrote brand mark and ${shops.length + 1} shop logos\n`);

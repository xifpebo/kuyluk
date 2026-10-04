'use strict';

/**
 * Raster brand assets rendered with headless Chromium:
 *   public/img/favicon-32.png, apple-touch-icon.png, icon-192.png,
 *   icon-512.png and og-image.png / og-image-ru.png (1200×630 social previews).
 * Run `node tools/generate-brand-assets.js` first. Requires `playwright`
 * (dev-only); set PLAYWRIGHT_MODULE to use a global install.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..', 'public');
const IMG = path.join(ROOT, 'img');
const mark = fs.readFileSync(path.join(IMG, 'logo-mark.svg'), 'utf8');
const fontsCss = fs.readFileSync(path.join(ROOT, 'fonts', 'fonts.css'), 'utf8').replace(/url\("([^"]+)"\)/g, (m, file) => `url("${pathToFileURL(path.join(ROOT, 'fonts', file)).href}")`);

const icon = (size, { pad = 0, bg = 'transparent' } = {}) => `<!doctype html><html><head><style>
  html,body{margin:0;background:${bg}}
  .wrap{width:${size}px;height:${size}px;display:grid;place-items:center}
  svg{width:${size - pad * 2}px;height:${size - pad * 2}px;display:block}
</style></head><body><div class="wrap">${mark}</div></body></html>`;

const og = ({ title, accent, rest, lead }) => `<!doctype html><html><head><style>
${fontsCss}
html,body{margin:0}
body{width:1200px;height:630px;overflow:hidden;position:relative;background:#0d0f12;color:#eceff3;font-family:"IBM Plex Sans",sans-serif;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),
  linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);
  background-size:24px 24px,24px 24px,120px 120px,120px 120px}
.glow{position:absolute;inset:-200px -100px auto auto;width:700px;height:700px;background:radial-gradient(circle,rgba(255,122,26,.28),transparent 65%)}
.stripe{position:absolute;left:0;right:0;bottom:0;height:18px;background:repeating-linear-gradient(-45deg,#ffc933 0 16px,#111 16px 32px)}
.brand{position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:22px}
.brand svg{width:84px;height:84px;filter:drop-shadow(0 8px 24px rgba(255,122,26,.35))}
.name{font:700 64px/1 "Oswald";letter-spacing:.05em;text-transform:uppercase}
.name span{color:#ff7a1a}
h1{position:absolute;left:80px;top:212px;margin:0;font:600 76px/1.02 "Oswald";text-transform:uppercase;letter-spacing:.01em;max-width:900px}
h1 em{font-style:normal;color:#ff7a1a}
p{position:absolute;left:80px;top:470px;margin:0;font:400 28px/1.4 "IBM Plex Sans";color:#b9c1cc;max-width:860px}
</style></head><body>
<div class="glow"></div>
<div class="brand">${mark}<div class="name">Stroy<span>Bazar</span></div></div>
<h1>${title} <em>${accent}</em> ${rest}</h1>
<p>${lead}</p>
<div class="stripe"></div>
</body></html>`;

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch();
  const shot = async (html, file, w, h, transparent = true) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const tmp = path.join(os.tmpdir(), `sb-brand-${process.pid}.html`);
    fs.writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    fs.unlinkSync(tmp);
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.screenshot({ path: path.join(IMG, file), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
  };
  await shot(icon(32), 'favicon-32.png', 32, 32);
  await shot(icon(180, { pad: 18, bg: '#0d0f12' }), 'apple-touch-icon.png', 180, 180, false);
  await shot(icon(192, { pad: 16, bg: '#0d0f12' }), 'icon-192.png', 192, 192, false);
  await shot(icon(512, { pad: 44, bg: '#0d0f12' }), 'icon-512.png', 512, 512, false);
  await shot(
    og({
      title: 'Qurilish va taʼmir',
      accent: 'mahsulotlari',
      rest: 'katalogi',
      lead: 'Toshkent doʻkonlari bir joyda — narxlarni solishtiring va doʻkon bilan toʻgʻridan-toʻgʻri bogʻlaning.'
    }),
    'og-image.png',
    1200,
    630,
    false
  );
  await shot(
    og({
      title: 'Каталог товаров',
      accent: 'для стройки',
      rest: 'и ремонта',
      lead: 'Магазины Ташкента в одном месте — сравнивайте цены и связывайтесь с магазином напрямую.'
    }),
    'og-image-ru.png',
    1200,
    630,
    false
  );
  await browser.close();
  process.stdout.write('Wrote favicon-32, apple-touch-icon, icon-192/512 and og-image (uz, ru) PNGs\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});

'use strict';

/**
 * Rasterise SVG files with headless Chromium (used for wallpaper textures,
 * shop logos previews and the favicon PNGs). Usage: node svg2png.js in.svg out.png [width] [height]
 * Requires the `playwright` package (dev-only; not a runtime dependency).
 */
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const [input, output, w = '512', h = w] = process.argv.slice(2);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
  const svg = fs.readFileSync(path.resolve(input), 'utf8');
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="width:${w}px;height:${h}px;display:block" `)}</body></html>`);
  await page.screenshot({ path: path.resolve(output), omitBackground: true, clip: { x: 0, y: 0, width: Number(w), height: Number(h) } });
  await browser.close();
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});

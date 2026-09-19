'use strict';

/**
 * Generates the isometric catalog illustrations in public/img/catalog.
 * Text-free so they work for both languages. Run: npm run generate:illustrations
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'public', 'img', 'catalog');
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const r = (n) => Math.round(n * 10) / 10;

function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Bounding box of a rectangle rotated around (cx, cy), like SVG rotate(angle cx cy). */
function rotBounds([x0, y0, x1, y1], angle, cx, cy) {
  const a = (angle * Math.PI) / 180;
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ].map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

class Scene {
  constructor({ ox = 200, oy = 150, s = 1, shadow = true } = {}) {
    this.ox = ox;
    this.oy = oy;
    this.s = s;
    this.parts = [];
    this.defs = [];
    this.gradients = 0;
    this.bounds = null;
    this.withShadow = shadow;
  }

  p(x, y, z) {
    return [this.ox + (x - y) * COS * this.s, this.oy + (x + y) * SIN * this.s - z * this.s];
  }

  pts(points) {
    return points.map(([a, b]) => `${r(a)},${r(b)}`).join(' ');
  }

  /** Grow the content bounding box (used to frame the drawing and place its shadow). */
  hint(minX, minY, maxX, maxY) {
    if (!this.bounds) this.bounds = [minX, minY, maxX, maxY];
    else {
      this.bounds = [
        Math.min(this.bounds[0], minX),
        Math.min(this.bounds[1], minY),
        Math.max(this.bounds[2], maxX),
        Math.max(this.bounds[3], maxY)
      ];
    }
  }

  track(points, pad = 0) {
    for (const [x, y] of points) this.hint(x - pad, y - pad, x + pad, y + pad);
  }

  poly(points, fill, extra = '') {
    this.track(points);
    this.parts.push(`<polygon points="${this.pts(points)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`);
  }

  raw(markup, bounds = null) {
    if (bounds) this.hint(...bounds);
    this.parts.push(markup);
  }

  line3(a, b, stroke, width = 1, extra = '') {
    const [x1, y1] = this.p(...a);
    const [x2, y2] = this.p(...b);
    this.track(
      [
        [x1, y1],
        [x2, y2]
      ],
      width / 2
    );
    this.parts.push(
      `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${extra ? ` ${extra}` : ''}/>`
    );
  }

  gradient(stops, [x1, y1, x2, y2]) {
    this.gradients += 1;
    const id = `g${this.gradients}`;
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}">${stops
        .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
        .join('')}</linearGradient>`
    );
    return `url(#${id})`;
  }

  /** Soft ground shadow under the content; drawn first so it sits behind everything. */
  shadowMarkup([minX, , maxX, maxY]) {
    const width = maxX - minX;
    const rx = width * 0.56;
    const ry = Math.max(14, width * 0.13);
    const cx = (minX + maxX) / 2;
    const cy = maxY - ry * 0.35;
    const markup =
      `<radialGradient id="shade"><stop offset="0" stop-color="#000" stop-opacity="0.5"/>` +
      `<stop offset="0.6" stop-color="#000" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    return {
      def: markup,
      part: `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(ry)}" fill="url(#shade)"/>`,
      bounds: [cx - rx * 0.8, cy - ry, cx + rx * 0.8, cy + ry * 0.8]
    };
  }

  /** Axis-aligned box. c = { top, left, right, edge } */
  box(x, y, z, w, d, h, c) {
    const P = (...a) => this.p(...a);
    const edge = c.edge ? `stroke="${c.edge}" stroke-width="${c.edgeWidth || 0.8}" stroke-linejoin="round"` : '';
    this.poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], c.top, edge);
    this.poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], c.left, edge);
    this.poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], c.right, edge);
  }

  circleX(x, cy, cz, radius, n = 28) {
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return this.p(x, cy + radius * Math.cos(a), cz + radius * Math.sin(a));
    });
  }

  circleZ(cx, cy, z, radius, n = 32) {
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return this.p(cx + radius * Math.cos(a), cy + radius * Math.sin(a), z);
    });
  }

  /** Cylinder along the x axis (pipes, rebar, rolls lying down). */
  cylX(x0, x1, cy, cz, radius, colors, { hollow = 0, cap = null, stripe = null } = {}) {
    const back = this.circleX(x0, cy, cz, radius);
    const front = this.circleX(x1, cy, cz, radius);
    const body = hull([...back, ...front]);
    const mid = this.p((x0 + x1) / 2, cy, cz);
    const perp = [-SIN * radius * this.s * 1.15, COS * radius * this.s * 1.15];
    const fill = this.gradient(
      [
        [0, colors.dark],
        [0.35, colors.light],
        [0.6, colors.mid],
        [1, colors.dark]
      ],
      [mid[0] - perp[0], mid[1] - perp[1], mid[0] + perp[0], mid[1] + perp[1]]
    );
    this.poly(body, fill);
    if (stripe) {
      const a = this.p(x0 + 4, cy - radius * 0.72, cz + radius * 0.72);
      const b = this.p(x1 - 2, cy - radius * 0.72, cz + radius * 0.72);
      this.parts.push(`<line x1="${r(a[0])}" y1="${r(a[1])}" x2="${r(b[0])}" y2="${r(b[1])}" stroke="${stripe}" stroke-width="${r(Math.max(1.2, radius * 0.22 * this.s))}" stroke-linecap="round"/>`);
    }
    this.poly(front, cap || colors.cap || colors.light, `stroke="${colors.dark}" stroke-width="0.8"`);
    if (hollow) this.poly(this.circleX(x1, cy, cz, radius * hollow), colors.inner || '#1b1f25');
  }

  /** Vertical cylinder (buckets, standing rolls). */
  cylZ(cx, cy, z0, z1, radius, colors, { topFill = null } = {}) {
    const bottom = this.circleZ(cx, cy, z0, radius);
    const top = this.circleZ(cx, cy, z1, radius);
    const body = hull([...bottom, ...top]);
    const left = this.p(cx - radius, cy + radius, z0);
    const right = this.p(cx + radius, cy - radius, z0);
    const fill = this.gradient(
      [
        [0, colors.mid],
        [0.3, colors.light],
        [0.75, colors.mid],
        [1, colors.dark]
      ],
      [left[0], left[1], right[0], right[1]]
    );
    this.poly(body, fill);
    this.poly(top, topFill || colors.top || colors.light, `stroke="${colors.dark}" stroke-width="0.8"`);
    return { top, bottom };
  }

  /** Label band wrapped around the visible (front) half of a vertical cylinder. */
  bandZ(cx, cy, z0, z1, radius, fill, extra = '', { from = -40, to = 130 } = {}) {
    const steps = 18;
    const arc = (z) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
        return this.p(cx + radius * Math.cos(a), cy + radius * Math.sin(a), z);
      });
    this.poly([...arc(z0), ...arc(z1).reverse()], fill, extra);
  }

  /**
   * Frames the drawing: the viewBox is fitted around the content (plus its shadow)
   * with even padding at a 4:3 ratio, so every product sits centred in its card.
   */
  render({ padding = 0.08 } = {}) {
    const content = this.bounds || [0, 0, 400, 300];
    const defs = [...this.defs];
    const parts = [...this.parts];
    let [minX, minY, maxX, maxY] = content;
    if (this.withShadow) {
      const shadow = this.shadowMarkup(content);
      defs.unshift(shadow.def);
      parts.unshift(shadow.part);
      minX = Math.min(minX, shadow.bounds[0]);
      minY = Math.min(minY, shadow.bounds[1]);
      maxX = Math.max(maxX, shadow.bounds[2]);
      maxY = Math.max(maxY, shadow.bounds[3]);
    }
    let width = maxX - minX;
    let height = maxY - minY;
    const pad = Math.max(width, height * (4 / 3)) * padding;
    minX -= pad;
    minY -= pad;
    width += pad * 2;
    height += pad * 2;
    if (width / height > 4 / 3) {
      const target = width * 0.75;
      minY -= (target - height) / 2;
      height = target;
    } else {
      const target = height * (4 / 3);
      minX -= (target - width) / 2;
      width = target;
    }
    const viewBox = [minX, minY, width, height].map((n) => r(n)).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="400" height="300" role="img" aria-hidden="true"><defs>${defs.join('')}</defs>${parts.join('')}</svg>\n`;
  }
}

/* --------------------------------------------------------------- palettes */
const PAL = {
  kraft: { top: '#dcbb82', left: '#c4a064', right: '#a88550', edge: '#8a6a3c' },
  pallet: { top: '#b98a57', left: '#8f6639', right: '#77532d', edge: '#5e4122' },
  aac: { top: '#eceae3', left: '#d2cfc6', right: '#b7b4ab', edge: '#9d9a92' },
  aacDark: { top: '#dcd9d0', left: '#c3c0b7', right: '#a7a49c', edge: '#8e8b84' },
  brick: { top: '#c9603f', left: '#a9482c', right: '#8d3a22', edge: '#6e2c19' },
  brickLight: { top: '#e0a36f', left: '#c8875a', right: '#ad7048', edge: '#8c5937' },
  cinder: { top: '#9ba1a8', left: '#80868d', right: '#6a7077', edge: '#555a60' },
  wood: { top: '#e2b47a', left: '#c79159', right: '#a97845', edge: '#8a5f33' },
  woodLight: { top: '#eed2a3', left: '#d9b681', right: '#c19d69', edge: '#a18152' },
  birch: { top: '#f0dcb4', left: '#d9c296', right: '#bfa77a', edge: '#9b865d' },
  osb: { top: '#d7ad6b', left: '#bb9153', right: '#a07a43', edge: '#836236' },
  drywall: { top: '#eef0f2', left: '#b8c4cf', right: '#9fadbb', edge: '#7e8c99' },
  drywallGreen: { top: '#e3eee6', left: '#9cc7a8', right: '#81ae8f', edge: '#628f71' },
  galv: { top: '#d5dbe2', left: '#aeb7c1', right: '#8f99a5', edge: '#6f7883' },
  steel: { light: '#aab3bf', mid: '#6d7682', dark: '#3d444d', cap: '#8a939f', inner: '#23272d' },
  rebar: { light: '#9c8f86', mid: '#6b5e56', dark: '#3b332e', cap: '#85776e', inner: '#2a2420' },
  pvcWhite: { light: '#ffffff', mid: '#dfe3e8', dark: '#a9b1bb', cap: '#f4f6f8', inner: '#6a737d' },
  pvcGray: { light: '#c9ced4', mid: '#9aa2ab', dark: '#5f6771', cap: '#b7bdc4', inner: '#2c3137' },
  pvcOrange: { light: '#ffb07a', mid: '#f07b35', dark: '#a84a14', cap: '#ff9a55', inner: '#5a2508' },
  bitumen: { light: '#5a6068', mid: '#33383e', dark: '#15181c', top: '#2a2e33' },
  bucket: { light: '#ffffff', mid: '#dde2e7', dark: '#9aa3ad', top: '#c6ccd3' },
  xps: { top: '#bfe0f2', left: '#94c4dd', right: '#79acc8', edge: '#5d91ad' },
  wool: { top: '#f3d98a', left: '#dcbf6b', right: '#c3a656', edge: '#a48a3f' },
  card: { top: '#cfa877', left: '#b48d5c', right: '#9a7648', edge: '#7c5d36' }
};

const ORANGE = '#ff7a1a';
const HAZARD = '#ffc933';

function pallet(scene, x, y, w, d) {
  const slat = PAL.pallet;
  for (let i = 0; i < 3; i += 1) scene.box(x + (i * (w - 10)) / 2, y, 0, 10, d, 8, slat);
  const boards = 5;
  for (let i = 0; i < boards; i += 1) scene.box(x, y + (i * (d - 12)) / (boards - 1), 8, w, 12, 4, slat);
}

/* --------------------------------------------------------------- drawings */
const drawings = {
  'cement-bag': (band = ORANGE, band2 = '#1f2328') => {
    const s = new Scene({ ox: 205, oy: 118, s: 1.28 });
    pallet(s, -64, -44, 128, 88);
    const layout = [
      [-60, -40, 12], [-60, 2, 12], [2, -40, 12], [2, 2, 12],
      [-44, -26, 34], [-4, -10, 34]
    ];
    for (const [x, y, z] of layout) {
      s.box(x, y, z, 58, 38, 22, { ...PAL.kraft, edgeWidth: 0.6 });
      const P = (...a) => s.p(...a);
      s.poly([P(x + 58, y + 6, z + 5), P(x + 58, y + 32, z + 5), P(x + 58, y + 32, z + 16), P(x + 58, y + 6, z + 16)], band);
      s.poly([P(x + 58, y + 10, z + 8), P(x + 58, y + 18, z + 8), P(x + 58, y + 18, z + 13), P(x + 58, y + 10, z + 13)], band2);
      s.poly([P(x + 8, y + 38, z + 5), P(x + 50, y + 38, z + 5), P(x + 50, y + 38, z + 16), P(x + 8, y + 38, z + 16)], band, 'opacity="0.9"');
      s.line3([x + 4, y + 4, z + 22], [x + 54, y + 4, z + 22], 'rgba(255,255,255,0.35)', 1.2);
    }
    return s.render();
  },
  'cement-bag-gray': () => drawings['cement-bag']('#9aa3ad', '#1f2328'),
  'mix-bag-yellow': () => drawings['cement-bag'](HAZARD, '#1f2328'),
  'mix-bag-blue': () => drawings['cement-bag']('#4d8fd6', '#f2f4f7'),
  'mix-bag-teal': () => drawings['cement-bag']('#2bb3a3', '#f2f4f7'),

  'sand-heap': () => {
    const s = new Scene({ ox: 200, oy: 150, s: 1 });
    s.raw(
      `<path d="M40 222 C 90 120, 150 70, 205 66 C 262 70, 318 130, 364 222 Z" fill="${s.gradient(
        [
          [0, '#f0d8a4'],
          [0.55, '#d9b877'],
          [1, '#b89457']
        ],
        [150, 70, 300, 220]
      )}"/>`,
      [40, 66, 364, 222]
    );
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 160; i += 1) {
      const x = 60 + rand() * 290;
      const top = 222 - Math.max(0, 150 - Math.abs(x - 205) * 1.05) * (0.1 + rand() * 0.9);
      s.raw(`<circle cx="${r(x)}" cy="${r(top)}" r="${r(0.7 + rand() * 1.2)}" fill="${rand() > 0.5 ? '#a6824a' : '#f7e6c1'}" opacity="0.8"/>`);
    }
    s.raw(`<path d="M270 222 l 26 -40 l 26 40 z" fill="#c9a263" opacity="0.6"/>`);
    return s.render();
  },

  'aac-block': (thin = false) => {
    const s = new Scene({ ox: 205, oy: 112, s: 1.25 });
    pallet(s, -62, -46, 124, 92);
    const bw = 60;
    const bd = thin ? 10 : 30;
    const bh = thin ? 25 : 20;
    const rows = thin ? 9 : 3;
    const layers = thin ? 2 : 3;
    for (let z = 0; z < layers; z += 1) {
      for (let x = 0; x < 2; x += 1) {
        for (let y = 0; y < rows; y += 1) {
          s.box(-60 + x * (bw + 1), -44 + y * (bd + 0.5), 12 + z * (bh + 0.5), bw, bd, bh, PAL.aac);
        }
      }
    }
    return s.render();
  },
  'aac-block-thin': () => drawings['aac-block'](true),

  'brick-red': (palette = PAL.brick) => {
    const s = new Scene({ ox: 205, oy: 120, s: 1.3 });
    pallet(s, -56, -40, 112, 80);
    const bw = 25;
    const bd = 12;
    const bh = 7;
    for (let z = 0; z < 6; z += 1) {
      const offset = z % 2 ? 6 : 0;
      for (let x = 0; x < 4; x += 1) {
        for (let y = 0; y < 6; y += 1) {
          const bx = -54 + x * (bw + 1.5) + (z % 2 ? 0 : 0);
          const by = -38 + y * (bd + 1) + offset * 0;
          if (z % 2 && x === 3) continue;
          s.box(bx + (z % 2 ? 13 : 0), by, 12 + z * (bh + 1), bw, bd, bh, palette);
        }
      }
    }
    return s.render();
  },
  'brick-face': () => drawings['brick-red'](PAL.brickLight),

  'cinder-block': () => {
    const s = new Scene({ ox: 205, oy: 118, s: 1.35 });
    pallet(s, -58, -42, 116, 84);
    for (let z = 0; z < 3; z += 1) {
      for (let x = 0; x < 3; x += 1) {
        for (let y = 0; y < 2; y += 1) {
          const bx = -56 + x * 38;
          const by = -40 + y * 40;
          const bz = 12 + z * 19;
          s.box(bx, by, bz, 37, 39, 18, PAL.cinder);
          if (z === 2) {
            const P = (...a) => s.p(...a);
            for (const hx of [5, 20]) {
              s.poly([P(bx + hx, by + 6, bz + 18), P(bx + hx + 12, by + 6, bz + 18), P(bx + hx + 12, by + 33, bz + 18), P(bx + hx, by + 33, bz + 18)], '#3f444a');
            }
          }
        }
      }
    }
    return s.render();
  },

  boards: (palette = PAL.wood, thin = false) => {
    const s = new Scene({ ox: 190, oy: 142, s: 0.95 });
    const len = 220;
    const bw = 30;
    const bh = thin ? 6 : 12;
    for (let z = 0; z < (thin ? 6 : 4); z += 1) {
      for (let y = 0; y < 4; y += 1) {
        const x = -110 + (z % 2) * 4 + y * 2;
        const by = -60 + y * (bw + 2);
        const bz = z * (bh + (thin ? 3 : 4));
        s.box(x, by, bz, len, bw, bh, palette);
        const P = (...a) => s.p(...a);
        const ex = x + len;
        s.line3([ex, by + 6, bz + bh * 0.5], [ex, by + bw - 6, bz + bh * 0.5], palette.edge, 0.7, 'opacity="0.6"');
        if (z % 2 === 0) {
          const [cx, cy] = P(ex, by + bw * 0.4, bz + bh * 0.5);
          s.raw(`<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(3 * s.s)}" ry="${r(1.6 * s.s)}" fill="none" stroke="${palette.edge}" stroke-width="0.6" opacity="0.7"/>`);
        }
      }
      if (!thin) {
        for (let k = 0; k < 3; k += 1) s.box(-80 + k * 80, -62, z * (bh + 4) + bh, 8, 132, 4, PAL.pallet);
      }
    }
    return s.render();
  },
  'boards-light': () => drawings.boards(PAL.woodLight, true),

  beam: () => {
    const s = new Scene({ ox: 190, oy: 140, s: 0.95 });
    for (let z = 0; z < 3; z += 1) {
      for (let y = 0; y < 3; y += 1) {
        const x = -110 + ((y + z) % 2) * 6;
        const by = -50 + y * 34;
        const bz = z * 34;
        s.box(x, by, bz, 220, 32, 32, PAL.wood);
        const P = (...a) => s.p(...a);
        const [cx, cy] = P(x + 220, by + 16, bz + 16);
        for (const rr of [3, 7, 11]) {
          s.raw(`<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rr * COS * s.s)}" ry="${r(rr * s.s * 0.95)}" fill="none" stroke="${PAL.wood.edge}" stroke-width="0.6" opacity="0.55" transform="rotate(-30 ${r(cx)} ${r(cy)})"/>`);
        }
      }
    }
    return s.render();
  },

  plywood: () => {
    const s = new Scene({ ox: 200, oy: 118, s: 1.05 });
    for (let i = 0; i < 9; i += 1) {
      s.box(-80 + (i % 3), -80 + (i % 2), i * 8, 160, 160, 7, PAL.birch);
      const P = (...a) => s.p(...a);
      for (let k = 1; k < 4; k += 1) {
        s.line3([-80 + (i % 3), 80 + (i % 2), i * 8 + k * 1.75], [80 + (i % 3), 80 + (i % 2), i * 8 + k * 1.75], PAL.birch.edge, 0.4, 'opacity="0.8"');
        s.line3([80 + (i % 3), -80 + (i % 2), i * 8 + k * 1.75], [80 + (i % 3), 80 + (i % 2), i * 8 + k * 1.75], PAL.birch.edge, 0.4, 'opacity="0.8"');
      }
      void P;
    }
    const P = (...a) => s.p(...a);
    for (let k = 0; k < 7; k += 1) {
      const y = -70 + k * 22;
      s.raw(`<path d="M${s.pts([P(-78, y, 72)])} Q ${s.pts([P(0, y + 8, 72)])} ${s.pts([P(80, y - 4, 72)])}" stroke="#cdb487" stroke-width="1" fill="none" opacity="0.7"/>`);
    }
    return s.render();
  },

  osb: () => {
    const s = new Scene({ ox: 200, oy: 118, s: 1.02 });
    for (let i = 0; i < 8; i += 1) s.box(-82 + (i % 2) * 2, -82, i * 9, 164, 164, 8, PAL.osb);
    let seed = 11;
    const rand = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const top = 8 * 9;
    for (let k = 0; k < 90; k += 1) {
      const x = -76 + rand() * 146;
      const y = -76 + rand() * 146;
      const w = 10 + rand() * 18;
      const h = 3 + rand() * 4;
      const P = (...a) => s.p(...a);
      const colors = ['#c49656', '#e0bb7f', '#b98b4d', '#ecc98f'];
      s.poly([P(x, y, top), P(x + w, y, top), P(x + w, y + h, top), P(x, y + h, top)], colors[k % 4], 'opacity="0.85"');
    }
    return s.render();
  },

  drywall: (palette = PAL.drywall) => {
    const s = new Scene({ ox: 196, oy: 132, s: 0.98 });
    pallet(s, -100, -60, 200, 120);
    for (let i = 0; i < 12; i += 1) s.box(-100 + (i % 2), -60, 12 + i * 5, 200, 120, 4.4, palette);
    const P = (...a) => s.p(...a);
    const zTop = 12 + 12 * 5 - 0.6;
    s.poly([P(-100, -60, zTop), P(100, -60, zTop), P(100, 60, zTop), P(-100, 60, zTop)], palette.top);
    s.line3([-100, 0, zTop], [100, 0, zTop], '#c3cad2', 0.8);
    s.poly([P(-10, -40, zTop), P(40, -40, zTop), P(40, -12, zTop), P(-10, -12, zTop)], ORANGE, 'opacity="0.9"');
    return s.render();
  },
  'drywall-green': () => drawings.drywall(PAL.drywallGreen),

  profile: () => {
    const s = new Scene({ ox: 186, oy: 150, s: 0.9 });
    for (let z = 0; z < 3; z += 1) {
      for (let y = 0; y < 5; y += 1) {
        const x = -130 + y * 3;
        const by = -60 + y * 26;
        const bz = z * 14;
        s.box(x, by, bz, 250, 22, 10, PAL.galv);
        const P = (...a) => s.p(...a);
        s.poly([P(x + 4, by + 5, bz + 10), P(x + 250, by + 5, bz + 10), P(x + 250, by + 17, bz + 10), P(x + 4, by + 17, bz + 10)], '#8c96a2');
        s.poly([P(x + 250, by + 5, bz + 3), P(x + 250, by + 17, bz + 3), P(x + 250, by + 17, bz + 10), P(x + 250, by + 5, bz + 10)], '#5d6670');
      }
    }
    return s.render();
  },

  'pipe-ppr': (stripe = '#2e9e57', palette = PAL.pvcWhite) => {
    const s = new Scene({ ox: 186, oy: 140, s: 0.95 });
    const layout = [
      [0, -30, 10], [0, 0, 10], [0, 30, 10], [0, -15, 34], [0, 15, 34], [0, 0, 58]
    ];
    for (const [, y, z] of layout) s.cylX(-120, 130, y, z, 12, palette, { hollow: 0.62, stripe });
    return s.render();
  },
  'pipe-ppr-al': () => drawings['pipe-ppr']('#8a939f', PAL.pvcGray),

  'pipe-sewer': () => {
    const s = new Scene({ ox: 180, oy: 138, s: 0.9 });
    const pipes = [
      [-40, 20, PAL.pvcGray],
      [-2, 20, PAL.pvcOrange],
      [-21, 54, PAL.pvcGray]
    ];
    for (const [y, z, palette] of pipes) {
      s.cylX(-130, 104, y, z, 18, palette, { hollow: 0.82 });
      s.cylX(104, 140, y, z, 22, palette, { hollow: 0.8 });
    }
    return s.render();
  },

  'fitting-elbow': () => {
    const s = new Scene();
    const g = s.gradient(
      [
        [0, '#a9b1bb'],
        [0.4, '#ffffff'],
        [1, '#c4cbd3']
      ],
      [120, 80, 280, 220]
    );
    s.raw(`<path d="M110 205 L110 170 Q110 110 170 110 L250 110" fill="none" stroke="#7d8793" stroke-width="58" stroke-linecap="butt"/>`);
    s.raw(`<path d="M110 205 L110 170 Q110 110 170 110 L250 110" fill="none" stroke="${g}" stroke-width="52"/>`);
    s.raw(`<rect x="76" y="186" width="68" height="36" rx="6" fill="${g}" stroke="#7d8793" stroke-width="2"/>`);
    s.raw(`<ellipse cx="110" cy="222" rx="34" ry="10" fill="#e9edf1" stroke="#7d8793" stroke-width="2"/>`);
    s.raw(`<ellipse cx="110" cy="222" rx="22" ry="6" fill="#5b646e"/>`);
    s.raw(`<rect x="236" y="76" width="36" height="68" rx="6" fill="${g}" stroke="#7d8793" stroke-width="2"/>`);
    s.raw(`<ellipse cx="272" cy="110" rx="10" ry="34" fill="#e9edf1" stroke="#7d8793" stroke-width="2"/>`);
    s.raw(`<ellipse cx="272" cy="110" rx="6" ry="22" fill="#5b646e"/>`);
    s.raw(`<path d="M126 150 Q140 128 160 124" stroke="#2e9e57" stroke-width="4" fill="none" stroke-linecap="round"/>`, [74, 74, 284, 234]);
    return s.render();
  },

  'screws-box': (screw = '#3a3f46', head = '#6d7580') => {
    const s = new Scene({ ox: 200, oy: 118, s: 1.15 });
    s.box(-60, -45, 0, 120, 90, 56, PAL.card);
    const P = (...a) => s.p(...a);
    s.poly([P(-54, -39, 56), P(54, -39, 56), P(54, 39, 56), P(-54, 39, 56)], '#2b2f35');
    let seed = 3;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 70; k += 1) {
      const x = -50 + rand() * 100;
      const y = -35 + rand() * 70;
      const a = rand() * Math.PI;
      const [x1, y1] = P(x, y, 57);
      const x2 = x1 + Math.cos(a) * 12;
      const y2 = y1 + Math.sin(a) * 6;
      s.raw(`<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${screw}" stroke-width="2.2" stroke-linecap="round"/><circle cx="${r(x1)}" cy="${r(y1)}" r="2.3" fill="${head}"/>`);
    }
    s.poly([P(60, -30, 14), P(60, 30, 14), P(60, 30, 40), P(60, -30, 40)], ORANGE);
    s.poly([P(-40, 45, 16), P(40, 45, 16), P(40, 45, 38), P(-40, 45, 38)], '#f3efe6');
    for (let k = 0; k < 3; k += 1) {
      const bx = 300 - k * 14;
      const by = 240 - k * 8;
      const angle = -20 + k * 6;
      s.raw(
        `<g transform="rotate(${angle} ${bx} ${by})"><rect x="${bx}" y="${by - 2}" width="46" height="4" rx="2" fill="${screw}"/>` +
          `<path d="M${bx} ${by - 2} l -5 2 l 5 2 z" fill="${screw}"/><rect x="${bx + 44}" y="${by - 6}" width="5" height="12" rx="2" fill="${head}"/>` +
          Array.from({ length: 7 }, (_, i) => `<line x1="${bx + 4 + i * 5.5}" y1="${by - 3}" x2="${bx + 6 + i * 5.5}" y2="${by + 3}" stroke="${head}" stroke-width="0.9"/>`).join('') +
          `</g>`,
        rotBounds([bx - 5, by - 6, bx + 49, by + 6], angle, bx, by)
      );
    }
    return s.render();
  },
  'screws-box-gold': () => drawings['screws-box']('#b5892c', '#e2bf5a'),

  anchor: () => {
    const s = new Scene();
    const steel = s.gradient(
      [
        [0, '#6f7883'],
        [0.45, '#e3e8ee'],
        [1, '#8a939f']
      ],
      [0, 150, 0, 190]
    );
    s.raw(`<g transform="rotate(-18 200 170)">
      <rect x="70" y="160" width="250" height="18" rx="4" fill="${steel}"/>
      ${Array.from({ length: 22 }, (_, i) => `<line x1="${120 + i * 9}" y1="160" x2="${126 + i * 9}" y2="178" stroke="#5d6670" stroke-width="1.2"/>`).join('')}
      <rect x="70" y="150" width="130" height="38" rx="5" fill="${steel}" stroke="#5d6670" stroke-width="1.5"/>
      <rect x="96" y="150" width="4" height="38" fill="#4c545e"/><rect x="150" y="150" width="4" height="38" fill="#4c545e"/>
      <path d="M52 150 L70 150 L70 188 L52 188 L40 176 L40 162 Z" fill="${steel}" stroke="#5d6670" stroke-width="1.5"/>
      <rect x="236" y="138" width="16" height="62" rx="3" fill="#aab3bf" stroke="#5d6670" stroke-width="1.5"/>
      <path d="M262 136 h40 l10 12 v42 l-10 12 h-40 l-10 -12 v-42 z" fill="${steel}" stroke="#5d6670" stroke-width="1.5"/>
      <line x1="262" y1="136" x2="262" y2="202" stroke="#5d6670" stroke-width="1"/><line x1="302" y1="136" x2="302" y2="202" stroke="#5d6670" stroke-width="1"/>
      </g>`, rotBounds([40, 136, 320, 202], -18, 200, 170));
    return s.render();
  },

  dowels: () => {
    const s = new Scene();
    const colors = ['#e9edf1', '#d6dbe1', '#f5f7f9'];
    for (let k = 0; k < 6; k += 1) {
      const x = 90 + k * 36;
      const y = 120 + (k % 2) * 30;
      const c = colors[k % 3];
      const angle = -30 + k * 4;
      s.raw(`<g transform="rotate(${angle} ${x + 20} ${y + 40})">
        <rect x="${x}" y="${y}" width="30" height="88" rx="6" fill="${c}" stroke="#8d96a1" stroke-width="1.5"/>
        <rect x="${x - 6}" y="${y - 6}" width="42" height="10" rx="3" fill="${c}" stroke="#8d96a1" stroke-width="1.5"/>
        <rect x="${x + 12}" y="${y + 18}" width="6" height="66" fill="#aab2bc"/>
        ${Array.from({ length: 5 }, (_, i) => `<path d="M${x} ${y + 24 + i * 12} l6 5 M${x + 30} ${y + 24 + i * 12} l-6 5" stroke="#8d96a1" stroke-width="1.5"/>`).join('')}
      </g>`, rotBounds([x - 7, y - 7, x + 37, y + 89], angle, x + 20, y + 40));
    }
    return s.render();
  },

  bolt: () => {
    const s = new Scene();
    const steel = s.gradient(
      [
        [0, '#59616b'],
        [0.5, '#c9d0d8'],
        [1, '#6d7580']
      ],
      [0, 140, 0, 186]
    );
    s.raw(`<g transform="rotate(-20 200 165)">
      <rect x="110" y="150" width="200" height="30" fill="${steel}"/>
      ${Array.from({ length: 26 }, (_, i) => `<line x1="${150 + i * 6}" y1="150" x2="${154 + i * 6}" y2="180" stroke="#4b535c" stroke-width="1.1"/>`).join('')}
      <path d="M70 136 h40 l12 14 v30 l-12 14 h-40 l-12 -14 v-30 z" fill="${steel}" stroke="#454c55" stroke-width="1.6"/>
      <line x1="70" y1="136" x2="70" y2="194" stroke="#454c55"/><line x1="110" y1="136" x2="110" y2="194" stroke="#454c55"/>
      <path d="M262 138 h36 l10 12 v30 l-10 12 h-36 l-10 -12 v-30 z" fill="#8f98a3" stroke="#454c55" stroke-width="1.6"/>
      <text x="82" y="170" font-family="monospace" font-size="11" fill="#2d3238">8.8</text>
      </g>`, rotBounds([57, 135, 310, 195], -20, 200, 165));
    return s.render();
  },

  nails: () => {
    const s = new Scene();
    let seed = 5;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 34; k += 1) {
      const x = 90 + rand() * 200;
      const y = 150 + rand() * 60;
      const a = -60 + rand() * 120;
      s.raw(
        `<g transform="rotate(${r(a)} ${r(x)} ${r(y)})"><rect x="${r(x - 44)}" y="${r(y - 1.6)}" width="88" height="3.2" rx="1.2" fill="${rand() > 0.5 ? '#9aa3ae' : '#7c8591'}"/><path d="M${r(x + 44)} ${r(y - 1.6)} l8 1.6 l-8 1.6z" fill="#7c8591"/><rect x="${r(x - 47)}" y="${r(y - 5)}" width="3.5" height="10" rx="1" fill="#b7bec8"/></g>`,
        rotBounds([x - 47, y - 5, x + 52, y + 5], r(a), r(x), r(y))
      );
    }
    return s.render();
  },

  rebar: () => {
    const s = new Scene({ ox: 176, oy: 146, s: 0.9 });
    const positions = [];
    for (let z = 0; z < 4; z += 1) for (let y = 0; y < 6 - z; y += 1) positions.push([-50 + y * 14 + z * 7, 7 + z * 12]);
    for (const [y, z] of positions) {
      s.cylX(-150, 150, y, z, 6, PAL.rebar);
      for (let k = -140; k < 150; k += 12) s.line3([k, y - 6, z + 3], [k + 4, y - 6, z - 3], '#2a2420', 0.9, 'opacity="0.55"');
    }
    const [bx, by] = s.p(-60, -30, 60);
    s.raw(
      `<rect x="${r(bx)}" y="${r(by)}" width="16" height="30" fill="${HAZARD}" transform="rotate(-30 ${r(bx)} ${r(by)})"/>`,
      rotBounds([r(bx), r(by), r(bx) + 16, r(by) + 30], -30, r(bx), r(by))
    );
    return s.render();
  },

  mesh: () => {
    const s = new Scene({ ox: 200, oy: 110, s: 1.05 });
    for (let layer = 0; layer < 6; layer += 1) {
      const z = layer * 5;
      for (let k = 0; k <= 10; k += 1) {
        s.line3([-110 + k * 22, -60, z], [-110 + k * 22, 60, z], layer === 5 ? '#aab2bc' : '#6b737d', 1.8);
      }
      for (let k = 0; k <= 6; k += 1) {
        s.line3([-110, -60 + k * 20, z + 1], [110, -60 + k * 20, z + 1], layer === 5 ? '#c4cbd3' : '#7c8591', 1.8);
      }
    }
    return s.render();
  },

  'profile-pipe': () => {
    const s = new Scene({ ox: 180, oy: 140, s: 0.92 });
    for (let z = 0; z < 3; z += 1) {
      for (let y = 0; y < 4; y += 1) {
        const by = -50 + y * 30;
        const bz = z * 16;
        const x = -130 + ((y + z) % 2) * 5;
        s.box(x, by, bz, 250, 28, 14, { top: '#8e97a2', left: '#6d7580', right: '#565d66', edge: '#3f454c' });
        const P = (...a) => s.p(...a);
        s.poly([P(x + 250, by + 3, bz + 3), P(x + 250, by + 25, bz + 3), P(x + 250, by + 25, bz + 11), P(x + 250, by + 3, bz + 11)], '#1f2328');
      }
    }
    return s.render();
  },

  'rotary-hammer': (body = ORANGE) => {
    const s = new Scene();
    const metal = s.gradient(
      [
        [0, '#8a939f'],
        [0.45, '#d5dbe2'],
        [1, '#59616b']
      ],
      [0, 104, 0, 162]
    );
    const shell = s.gradient(
      [
        [0, '#ffb27a'],
        [0.35, body],
        [1, '#c85a0c']
      ],
      [0, 96, 0, 168]
    );
    const flutes = Array.from({ length: 9 }, (_, i) => `<path d="M${30 + i * 7} 130 l5 10" stroke="#6d7580" stroke-width="1.4"/>`).join('');
    const vents = Array.from({ length: 5 }, (_, i) => `<rect x="${204 + i * 9}" y="112" width="4" height="24" rx="2" fill="#1f2328" opacity="0.55"/>`).join('');
    s.raw(
      `<g>
      <path d="M16 135 l10 -5 h70 v10 h-70 z" fill="#aab3bf"/>${flutes}
      <path d="M241 234 q 8 22 44 20 q 32 -2 56 -18" stroke="#1f2328" stroke-width="6" fill="none" stroke-linecap="round"/>
      <rect x="94" y="121" width="30" height="28" rx="7" fill="#2d3238"/>
      <rect x="101" y="121" width="3" height="28" fill="#454c55"/><rect x="109" y="121" width="3" height="28" fill="#454c55"/>
      <rect x="120" y="113" width="18" height="44" rx="5" fill="#1f2328"/>
      <path d="M142 104 h40 v58 h-40 a8 8 0 0 1 -8 -8 v-42 a8 8 0 0 1 8 -8z" fill="${metal}"/>
      <path d="M232 166 h52 l-8 60 a9 9 0 0 1 -9 8 h-32 a9 9 0 0 1 -9 -9z" fill="#2d3238"/>
      <path d="M244 176 h28 l-5 44 h-23z" fill="#3d444d"/>
      <path d="M216 166 h14 v26 a7 7 0 0 1 -14 0z" fill="#1f2328"/>
      <path d="M180 96 h100 a24 24 0 0 1 24 24 v30 a18 18 0 0 1 -18 18 h-106 z" fill="${shell}"/>
      <path d="M180 96 h100 a24 24 0 0 1 22 14 h-122z" fill="#fff" opacity="0.18"/>
      ${vents}
      <rect x="262" y="140" width="30" height="8" rx="3" fill="#1f2328" opacity="0.45"/>
      <g transform="rotate(22 160 160)"><rect x="152" y="158" width="17" height="66" rx="8" fill="#2d3238"/><rect x="147" y="154" width="27" height="11" rx="4" fill="#1f2328"/></g>
    </g>`,
      [14, 96, 344, 256]
    );
    s.hint(...rotBounds([147, 154, 174, 224], 22, 160, 160));
    return s.render();
  },

  grinder: () => {
    const s = new Scene();
    const disc = s.gradient(
      [
        [0, '#6d7580'],
        [0.45, '#d5dbe2'],
        [1, '#7c8591']
      ],
      [36, 0, 188, 0]
    );
    const metal = s.gradient(
      [
        [0, '#8a939f'],
        [0.45, '#d5dbe2'],
        [1, '#59616b']
      ],
      [0, 130, 0, 168]
    );
    const shell = s.gradient(
      [
        [0, '#ffb27a'],
        [0.35, ORANGE],
        [1, '#c85a0c']
      ],
      [0, 122, 0, 178]
    );
    const vents = Array.from({ length: 4 }, (_, i) => `<rect x="${278 + i * 7}" y="134" width="3.5" height="30" rx="1.75" fill="#454c55"/>`).join('');
    s.raw(
      `<g>
      <path d="M322 152 q 30 2 40 30" stroke="#1f2328" stroke-width="6" fill="none" stroke-linecap="round"/>
      <ellipse cx="112" cy="192" rx="76" ry="15" fill="#3a4047"/>
      <ellipse cx="112" cy="188" rx="76" ry="15" fill="${disc}"/>
      <ellipse cx="112" cy="188" rx="46" ry="9" fill="none" stroke="#8a939f" stroke-width="1"/>
      <ellipse cx="112" cy="188" rx="16" ry="4" fill="#2d3238"/>
      <path d="M40 186 A 74 14 0 0 1 184 186" fill="none" stroke="#2d3238" stroke-width="9"/>
      <rect x="106" y="160" width="12" height="28" fill="#59616b"/>
      <path d="M92 132 h60 v36 h-60 a10 10 0 0 1 -10 -10 v-16 a10 10 0 0 1 10 -10z" fill="${metal}"/>
      <g transform="rotate(-14 118 134)"><rect x="110" y="70" width="17" height="66" rx="8" fill="#2d3238"/></g>
      <path d="M150 124 h150 a28 28 0 0 1 0 56 h-150 z" fill="${shell}"/>
      <path d="M150 124 h150 a28 28 0 0 1 24 14 h-174z" fill="#fff" opacity="0.18"/>
      <path d="M262 124 h38 a28 28 0 0 1 0 56 h-38 z" fill="#2d3238"/>
      ${vents}
      <rect x="182" y="117" width="54" height="10" rx="5" fill="#1f2328"/>
      <rect x="196" y="148" width="44" height="6" rx="3" fill="#1f2328" opacity="0.5"/>
    </g>`,
      [34, 64, 366, 208]
    );
    s.hint(...rotBounds([110, 70, 127, 136], -14, 118, 134));
    return s.render();
  },

  drill: () => {
    const s = new Scene();
    const shell = s.gradient(
      [
        [0, '#ffe08a'],
        [0.4, HAZARD],
        [1, '#d49a12']
      ],
      [0, 88, 0, 152]
    );
    const flutes = Array.from({ length: 7 }, (_, i) => `<path d="M${50 + i * 6.5} 114 l4 8" stroke="#6d7580" stroke-width="1.3"/>`).join('');
    const ridges = Array.from({ length: 4 }, (_, i) => `<rect x="${136 + i * 4}" y="96" width="1.6" height="48" fill="#59616b"/>`).join('');
    s.raw(
      `<g>
      <path d="M36 118 l10 -4 h52 v8 h-52 z" fill="#aab3bf"/>${flutes}
      <path d="M98 106 h28 l8 -4 v36 l-8 -4 h-28 a7 7 0 0 1 -7 -7 v-14 a7 7 0 0 1 7 -7z" fill="#2d3238"/>
      <rect x="104" y="106" width="2.5" height="28" fill="#454c55"/><rect x="112" y="106" width="2.5" height="28" fill="#454c55"/>
      <rect x="132" y="96" width="20" height="48" rx="6" fill="#3d444d"/>${ridges}
      <path d="M192 150 h56 l-9 58 h-45 z" fill="#2d3238"/>
      <path d="M204 158 h30 l-6 44 h-25 z" fill="#3d444d"/>
      <path d="M176 152 h15 v26 a7.5 7.5 0 0 1 -15 0z" fill="#1f2328"/>
      <path d="M150 88 h110 a30 30 0 0 1 30 30 v4 a30 30 0 0 1 -30 30 h-110 z" fill="${shell}"/>
      <path d="M150 88 h110 a30 30 0 0 1 24 12 h-134z" fill="#fff" opacity="0.28"/>
      <path d="M254 88 h6 a30 30 0 0 1 30 30 v4 a30 30 0 0 1 -30 30 h-6 z" fill="#2d3238"/>
      <rect x="262" y="104" width="12" height="3" rx="1.5" fill="#59616b"/><rect x="262" y="112" width="14" height="3" rx="1.5" fill="#59616b"/><rect x="262" y="120" width="14" height="3" rx="1.5" fill="#59616b"/><rect x="262" y="128" width="12" height="3" rx="1.5" fill="#59616b"/>
      <rect x="168" y="106" width="46" height="20" rx="4" fill="#2d3238"/>
      <rect x="174" y="113" width="20" height="6" rx="3" fill="${HAZARD}"/>
      <rect x="194" y="153" width="16" height="8" rx="2" fill="#aab3bf"/>
      <rect x="164" y="204" width="122" height="42" rx="9" fill="#2d3238"/>
      <rect x="164" y="204" width="122" height="13" rx="6" fill="${shell}"/>
      <rect x="250" y="228" width="22" height="6" rx="3" fill="#59616b"/><rect x="252" y="229.5" width="7" height="3" rx="1.5" fill="#6dd28f"/>
    </g>`,
      [34, 88, 290, 246]
    );
    return s.render();
  },

  'roof-sheet': () => {
    const s = new Scene({ ox: 196, oy: 138, s: 0.95 });
    const profile = [];
    const wave = 24;
    for (let k = 0; k < 6; k += 1) {
      const y = -72 + k * wave;
      profile.push([y, 0], [y + 6, 0], [y + 10, 8], [y + 18, 8], [y + 22, 0]);
    }
    const P = (...a) => s.p(...a);
    for (let layer = 3; layer >= 0; layer -= 1) {
      const z0 = layer * 12;
      for (let i = 0; i < profile.length - 1; i += 1) {
        const [y1, h1] = profile[i];
        const [y2, h2] = profile[i + 1];
        const light = h1 === h2 ? (h1 ? '#dfe5ea' : '#b9c2cb') : '#9aa4ae';
        s.poly([P(-120, y1, z0 + h1), P(120, y1, z0 + h1), P(120, y2, z0 + h2), P(-120, y2, z0 + h2)], light, 'stroke="#7c8691" stroke-width="0.4"');
      }
      const edge = profile.map(([y, h]) => P(120, y, z0 + h));
      s.raw(`<polyline points="${s.pts(edge)}" fill="none" stroke="#5f6974" stroke-width="1.6" stroke-linejoin="round"/>`);
    }
    s.poly([P(-40, -72, 38), P(10, -72, 38), P(10, -64, 38), P(-40, -64, 38)], ORANGE);
    return s.render();
  },

  'mineral-wool': () => {
    const s = new Scene({ ox: 196, oy: 124, s: 1.1 });
    s.box(-70, -50, 0, 140, 100, 70, { top: '#e6e0cf', left: '#cfc7b1', right: '#b6ae98', edge: '#958d78' });
    const P = (...a) => s.p(...a);
    s.poly([P(-70, 50, 22), P(70, 50, 22), P(70, 50, 44), P(-70, 50, 44)], ORANGE);
    s.poly([P(70, -50, 22), P(70, 50, 22), P(70, 50, 44), P(70, -50, 44)], '#c85f12');
    s.box(78, -40, 0, 70, 80, 16, PAL.wool);
    let seed = 9;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 40; k += 1) {
      const y = -38 + rand() * 76;
      const z = 2 + rand() * 12;
      s.line3([148, y, z], [148, y + 6, z + (rand() - 0.5) * 3], '#b09344', 0.8);
    }
    return s.render();
  },

  xps: () => {
    const s = new Scene({ ox: 196, oy: 118, s: 1.05 });
    for (let i = 0; i < 8; i += 1) s.box(-90 + (i % 2) * 3, -60, i * 10, 180, 120, 9, PAL.xps);
    const P = (...a) => s.p(...a);
    const zTop = 80;
    for (let k = 0; k < 5; k += 1) s.line3([-80 + k * 40, -58, zTop], [-80 + k * 40, 58, zTop], '#a9d2e8', 1);
    s.poly([P(-30, -40, zTop), P(30, -40, zTop), P(30, -20, zTop), P(-30, -20, zTop)], ORANGE, 'opacity="0.85"');
    return s.render();
  },

  'bitumen-roll': () => {
    const s = new Scene({ ox: 200, oy: 150, s: 1 });
    const rolls = [
      [-46, -20],
      [2, -34],
      [-16, 24]
    ];
    for (const [x, y] of rolls) {
      s.cylZ(x, y, 0, 96, 26, PAL.bitumen);
      for (const radius of [21, 15.5, 10]) s.poly(s.circleZ(x, y, 96, radius), 'none', 'stroke="#474d55" stroke-width="0.9"');
      s.poly(s.circleZ(x, y, 96, 5), '#0b0d10');
      s.bandZ(x, y, 38, 62, 26.3, HAZARD);
      s.bandZ(x, y, 45, 55, 26.5, '#1f2328', '', { from: 30, to: 75 });
    }
    return s.render();
  },

  'paint-bucket': () => {
    const s = new Scene({ ox: 200, oy: 160, s: 1.05 });
    s.cylZ(0, 0, 0, 100, 58, PAL.bucket, { topFill: '#b9c0c8' });
    s.bandZ(0, 0, 26, 74, 58.4, ORANGE);
    s.bandZ(0, 0, 40, 60, 58.6, '#f7f8fa', '', { from: 15, to: 75 });
    s.bandZ(0, 0, 46, 54, 58.8, '#1f2328', '', { from: 22, to: 50 });
    s.cylZ(0, 0, 100, 106, 61, { light: '#ffffff', mid: '#e3e7eb', dark: '#9aa3ad', top: '#eef1f4' });
    s.poly(s.circleZ(0, 0, 106, 48), 'none', 'stroke="#c3cad2" stroke-width="1.2"');
    const [dx, dy] = s.p(29, 50.2, 101);
    s.raw(`<path d="M${r(dx - 4)} ${r(dy)} h8 v18 a4 4 0 0 1 -8 0 z" fill="${ORANGE}"/>`);
    const dir = [Math.SQRT1_2, -Math.SQRT1_2];
    const handle = Array.from({ length: 25 }, (_, i) => {
      const theta = (i / 24) * Math.PI;
      const along = 58 * Math.cos(theta);
      return s.p(along * dir[0], along * dir[1], 86 + 58 * Math.sin(theta));
    });
    s.track(handle, 3);
    s.raw(`<polyline points="${s.pts(handle)}" fill="none" stroke="#5d6670" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`);
    for (const end of [handle[0], handle[handle.length - 1]]) {
      s.raw(`<circle cx="${r(end[0])}" cy="${r(end[1])}" r="4.5" fill="#9aa3ad" stroke="#5d6670" stroke-width="1"/>`);
    }
    return s.render();
  },

  'primer-canister': () => {
    const s = new Scene({ ox: 200, oy: 150, s: 1.1 });
    s.box(-40, -25, 0, 80, 50, 100, { top: '#f2f4f6', left: '#dde2e7', right: '#c3cad2', edge: '#9aa3ad' });
    const P = (...a) => s.p(...a);
    s.box(-30, -8, 100, 40, 16, 12, { top: '#c3cad2', left: '#aab2bc', right: '#8f98a3', edge: '#6d7580' });
    s.box(22, -8, 100, 14, 14, 12, { top: '#4d8fd6', left: '#3a79bd', right: '#2c62a0', edge: '#234f82' });
    s.poly([P(-36, 25, 30), P(36, 25, 30), P(36, 25, 72), P(-36, 25, 72)], '#4d8fd6');
    s.poly([P(-26, 25, 42), P(10, 25, 42), P(10, 25, 60), P(-26, 25, 60)], '#f2f4f6');
    s.poly([P(40, -20, 30), P(40, 20, 30), P(40, 20, 72), P(40, -20, 72)], '#2c62a0');
    return s.render();
  },

  placeholder: () => {
    const s = new Scene({ ox: 200, oy: 140, s: 1.2 });
    s.box(-45, -45, 0, 90, 90, 70, { top: '#2a3038', left: '#20252c', right: '#191d23', edge: '#3a424c' });
    const P = (...a) => s.p(...a);
    s.poly([P(-10, 45, 20), P(10, 45, 20), P(10, 45, 50), P(-10, 45, 50)], ORANGE, 'opacity="0.8"');
    return s.render();
  }
};

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#0d0f12"/><path d="M20 5 33 12.5v15L20 35 7 27.5v-15z" fill="#FF7A1A"/><path d="M20 5 33 12.5 20 20 7 12.5z" fill="#FFB27A"/><path d="M20 20v15L7 27.5v-15z" fill="#C85A0C"/><path d="M12 23.5l5 2.9M12 19.8l5 2.9M23 26.4l5-2.9M23 22.7l5-2.9" stroke="#1A0F05" stroke-width="1.5" stroke-linecap="round"/></svg>\n`;

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let count = 0;
  for (const [name, draw] of Object.entries(drawings)) {
    fs.writeFileSync(path.join(OUT, `${name}.svg`), draw());
    count += 1;
  }
  fs.writeFileSync(path.join(OUT, '..', 'favicon.svg'), FAVICON);
  process.stdout.write(`Wrote ${count} illustrations to ${path.relative(process.cwd(), OUT)}\n`);
}

main();

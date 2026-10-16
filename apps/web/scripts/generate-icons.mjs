/**
 * Renders the Juma app icons as PNGs with no image dependencies, so the icons
 * are plain committed assets and the build never needs a toolchain or network.
 *
 * Run with: pnpm --filter @juma/web icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Brand green, matching the themeColor in app/layout.tsx.
const BRAND = [26, 107, 79];
const WHITE = [255, 255, 255];
const SUPERSAMPLE = 4;

/** The letter J, as axis-aligned boxes in 0..1 space: [x0, y0, x1, y1]. */
const GLYPH_J = [
  [0.4, 0.23, 0.76, 0.33], // top serif
  [0.55, 0.23, 0.69, 0.64], // stem
  [0.33, 0.64, 0.69, 0.77], // bottom hook
  [0.31, 0.53, 0.45, 0.77], // hook rising into the tail
];

const inBoxes = (x, y, boxes) =>
  boxes.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);

/** Rounded-rect coverage test in 0..1 space, radius as a fraction of the side. */
function inRoundedSquare(x, y, radius) {
  if (radius <= 0) return true;
  const cx = x < radius ? radius : x > 1 - radius ? 1 - radius : x;
  const cy = y < radius ? radius : y > 1 - radius ? 1 - radius : y;
  if (cx === x && cy === y) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/**
 * `inset` shrinks the glyph towards the centre. Maskable icons need their
 * content inside the middle 80% because the OS crops to its own shape.
 */
function renderRgba(size, { radius, inset }) {
  const s = size * SUPERSAMPLE;
  const acc = new Float64Array(size * size * 4);

  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      const x = (px + 0.5) / s;
      const y = (py + 0.5) / s;

      let colour = null;
      if (inRoundedSquare(x, y, radius)) {
        const gx = (x - 0.5) / inset + 0.5;
        const gy = (y - 0.5) / inset + 0.5;
        colour = inBoxes(gx, gy, GLYPH_J) ? WHITE : BRAND;
      }

      const i = (Math.floor(py / SUPERSAMPLE) * size + Math.floor(px / SUPERSAMPLE)) * 4;
      if (colour) {
        acc[i] += colour[0];
        acc[i + 1] += colour[1];
        acc[i + 2] += colour[2];
        acc[i + 3] += 255;
      }
    }
  }

  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < out.length; i += 4) {
    const alpha = acc[i + 3] / samples;
    // Un-premultiply so edge pixels keep their colour as alpha falls off.
    const scale = alpha > 0 ? 255 / acc[i + 3] : 0;
    out[i] = Math.round(acc[i] * scale);
    out[i + 1] = Math.round(acc[i + 1] * scale);
    out[i + 2] = Math.round(acc[i + 2] * scale);
    out[i + 3] = Math.round(alpha);
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function toPng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10-12 stay zero: deflate, adaptive filtering, no interlacing.

  // Each scanline is prefixed with its filter type; 0 means "none".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Rounded for in-app and browser use; square and inset where the OS masks it.
const ICONS = [
  { path: 'src/app/icon.png', size: 48, radius: 0.2, inset: 1 },
  { path: 'src/app/apple-icon.png', size: 180, radius: 0, inset: 1 },
  { path: 'public/icons/icon-192.png', size: 192, radius: 0.2, inset: 1 },
  { path: 'public/icons/icon-512.png', size: 512, radius: 0.2, inset: 1 },
  { path: 'public/icons/icon-maskable-512.png', size: 512, radius: 0, inset: 0.8 },
];

for (const { path, size, radius, inset } of ICONS) {
  const target = resolve(WEB_ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, toPng(size, renderRgba(size, { radius, inset })));
  console.log(`  ${path} (${size}x${size})`);
}

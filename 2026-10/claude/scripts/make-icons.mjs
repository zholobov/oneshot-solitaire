#!/usr/bin/env node
// Generates the PWA icons under public/icons without any dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const GREEN = [27, 94, 32];
const WHITE = [255, 255, 255];
const RED = [198, 40, 40];

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes) {
  let c = -1;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function png(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.max(Math.abs(x - cx) - (halfW - r), 0);
  const dy = Math.max(Math.abs(y - cy) - (halfH - r), 0);
  return dx * dx + dy * dy <= r * r;
}

// Classic heart curve: (x² + y² − 1)³ − x²y³ ≤ 0
function insideHeart(x, y, cx, cy, scale) {
  const nx = (x - cx) / scale;
  const ny = -(y - cy) / scale + 0.1;
  const a = nx * nx + ny * ny - 1;
  return a * a * a - nx * nx * ny * ny * ny <= 0;
}

function render(size, { fullBleed }) {
  const SS = 4; // supersampling per axis
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const bgRadius = size * 0.22;
  const cardHalfW = size * (fullBleed ? 0.2 : 0.25);
  const cardHalfH = cardHalfW * 1.4;
  const cardRadius = cardHalfW * 0.18;
  const heartScale = cardHalfW * 0.55;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let color = null;
          if (fullBleed || insideRoundedRect(px, py, c, c, c, c, bgRadius)) color = GREEN;
          if (color !== null && insideRoundedRect(px, py, c, c, cardHalfW, cardHalfH, cardRadius)) {
            color = insideHeart(px, py, c, c, heartScale) ? RED : WHITE;
          }
          if (color !== null) {
            r += color[0];
            g += color[1];
            b += color[2];
            covered++;
          }
        }
      }
      const o = (y * size + x) * 4;
      if (covered > 0) {
        rgba[o] = Math.round(r / covered);
        rgba[o + 1] = Math.round(g / covered);
        rgba[o + 2] = Math.round(b / covered);
      }
      rgba[o + 3] = Math.round((covered / (SS * SS)) * 255);
    }
  }
  return png(size, rgba);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon-192.png'), render(192, { fullBleed: false }));
writeFileSync(join(outDir, 'icon-512.png'), render(512, { fullBleed: false }));
writeFileSync(join(outDir, 'icon-maskable-512.png'), render(512, { fullBleed: true }));
writeFileSync(join(outDir, 'apple-touch-icon.png'), render(180, { fullBleed: true }));
console.log(`Icons written to ${outDir}`);

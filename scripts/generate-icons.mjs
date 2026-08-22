import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const outputDirectory = new URL("../public/icons/", import.meta.url);
const outputPath = fileURLToPath(outputDirectory);
const sizes = [64, 180, 192, 512];

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function insideRoundedRectangle(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, red, green, blue, alpha = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      return;
    }

    const offset = (y * size + x) * 4;
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = alpha;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - size * 0.42, y - size * 0.24) / size;
      const glow = Math.max(0, 1 - distance * 1.8);
      setPixel(
        x,
        y,
        Math.round(7 + glow * 15),
        Math.round(78 + glow * 39),
        Math.round(58 + glow * 30),
      );
    }
  }

  const cardLeft = Math.round(size * 0.245);
  const cardTop = Math.round(size * 0.13);
  const cardRight = Math.round(size * 0.755);
  const cardBottom = Math.round(size * 0.87);
  const radius = size * 0.065;
  const shadowOffset = Math.max(2, Math.round(size * 0.025));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (
        insideRoundedRectangle(
          x,
          y,
          cardLeft + shadowOffset,
          cardTop + shadowOffset,
          cardRight + shadowOffset,
          cardBottom + shadowOffset,
          radius,
        )
      ) {
        setPixel(x, y, 3, 35, 27, 105);
      }
    }
  }

  for (let y = cardTop; y <= cardBottom; y += 1) {
    for (let x = cardLeft; x <= cardRight; x += 1) {
      if (insideRoundedRectangle(x, y, cardLeft, cardTop, cardRight, cardBottom, radius)) {
        const shade = Math.round(255 - Math.max(0, y - cardTop) * (5 / (cardBottom - cardTop)));
        setPixel(x, y, shade, shade, Math.max(245, shade - 3));
      }
    }
  }

  const heartCenterX = size * 0.5;
  const heartCenterY = size * 0.5;
  const heartScale = size * 0.2;

  for (let y = Math.round(size * 0.31); y <= Math.round(size * 0.7); y += 1) {
    for (let x = Math.round(size * 0.31); x <= Math.round(size * 0.69); x += 1) {
      const normalizedX = (x - heartCenterX) / heartScale;
      const normalizedY = -(y - heartCenterY) / heartScale;
      const equation =
        (normalizedX * normalizedX + normalizedY * normalizedY - 1) ** 3 -
        normalizedX * normalizedX * normalizedY ** 3;

      if (equation <= 0) {
        setPixel(x, y, 196, 35, 57);
      }
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(outputDirectory, { recursive: true });

for (const size of sizes) {
  const filePath = join(outputPath, `icon-${size}.png`);
  await writeFile(filePath, createIcon(size));
}

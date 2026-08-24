// Generate Solitaire app icons using Canvas
const { createCanvas } = require('canvas');
const fs = require('fs');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#1e8c4a');
  grad.addColorStop(1, '#145a30');
  ctx.fillStyle = grad;

  // Rounded rect
  const r = size * 0.12;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Play card
  const cardW = size * 0.55;
  const cardH = cardW * 1.4;
  const cardX = (size - cardW) / 2;
  const cardY = size * 0.2;

  // Card shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, cardX + 3, cardY + 4, cardW, cardH, size * 0.04);
  ctx.fill();

  // Card face
  ctx.fillStyle = '#fff';
  roundRect(ctx, cardX, cardY, cardW, cardH, size * 0.04);
  ctx.fill();

  // Card border
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, size * 0.04);
  ctx.stroke();

  // Suit symbol
  ctx.fillStyle = '#dc2626';
  ctx.font = `bold ${size * 0.22}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♥', size / 2, cardY + cardH * 0.45);

  // Rank
  ctx.font = `bold ${size * 0.14}px -apple-system, sans-serif`;
  ctx.fillText('A', size / 2, cardY + cardH * 0.2);

  // Small suit top-left
  ctx.font = `${size * 0.08}px serif`;
  ctx.fillText('♥', cardX + cardW * 0.2, cardY + cardH * 0.18);

  // Small suit bottom-right
  ctx.save();
  ctx.translate(size / 2, cardY + cardH * 0.78);
  ctx.rotate(Math.PI);
  ctx.font = `${size * 0.08}px serif`;
  ctx.fillText('♥', 0, 0);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Generate icons
fs.writeFileSync('icon-192.png', createIcon(192));
fs.writeFileSync('icon-512.png', createIcon(512));
console.log('Icons generated: icon-192.png, icon-512.png');

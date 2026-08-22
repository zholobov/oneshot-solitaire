#!/usr/bin/env python3
"""Generate PWA icons (stdlib only): felt-green background, white card, red heart.

Full-bleed background makes one design valid for `any`, `maskable`, and
apple-touch-icon. Usage: python3 tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (30, 110, 65)
CARD = (253, 253, 246)
HEART = (208, 47, 61)

SS = 3  # supersampling factor per axis


def write_png(path, size, pixels):
    """pixels: list of rows, each row a list of (r, g, b)."""
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("BBB", *px) for px in row) for row in pixels
    )
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    Path(path).write_bytes(png)


def in_rounded_rect(x, y, cx, cy, hw, hh, r):
    dx = abs(x - cx) - (hw - r)
    dy = abs(y - cy) - (hh - r)
    if dx <= 0 and dy <= 0:
        return True
    dx = max(dx, 0.0)
    dy = max(dy, 0.0)
    return dx * dx + dy * dy <= r * r


def in_heart(x, y, cx, cy, r):
    # Two touching circles + a triangle underneath.
    for sx in (-0.98, 0.98):
        dx = x - (cx + sx * r)
        dy = y - cy
        if dx * dx + dy * dy <= r * r:
            return True
    ax, ay = cx - 1.90 * r, cy + 0.15 * r
    bx, by = cx + 1.90 * r, cy + 0.15 * r
    tx, ty = cx, cy + 2.55 * r
    # Half-plane tests (triangle wound clockwise in screen coords).
    def side(px, py, x1, y1, x2, y2):
        return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
    d1 = side(x, y, ax, ay, bx, by)
    d2 = side(x, y, bx, by, tx, ty)
    d3 = side(x, y, tx, ty, ax, ay)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def render(size):
    cx = cy = size / 2.0
    card_hw = size * 0.26
    card_hh = size * 0.36
    corner = size * 0.05
    heart_r = size * 0.105
    heart_cy = cy - heart_r * 0.55  # optical centering inside the card
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            card_hits = 0
            heart_hits = 0
            total = SS * SS
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    if in_heart(x, y, cx, heart_cy, heart_r):
                        heart_hits += 1
                    elif in_rounded_rect(x, y, cx, cy, card_hw, card_hh, corner):
                        card_hits += 1
            bg_hits = total - card_hits - heart_hits
            row.append(tuple(
                round((BG[i] * bg_hits + CARD[i] * card_hits + HEART[i] * heart_hits) / total)
                for i in range(3)
            ))
        rows.append(row)
    return rows


def main():
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)]:
        write_png(out / name, size, render(size))
        print(f"wrote icons/{name}")


if __name__ == "__main__":
    main()

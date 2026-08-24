# Solitaire

Classic Klondike Solitaire as a mobile-first PWA. No dependencies, no build step —
plain HTML/CSS/JS. Installable to the home screen and fully playable offline.

## Rules

Standard Klondike: 7 tableau piles built down in alternating colors, 4 foundations
built up A→K by suit, kings only on empty columns, unlimited passes through the
stock. Draw 1 (default) or Draw 3, toggled in the top bar (starts a new game).

## Playing

- **Tap** a card to auto-move it (foundation first, then leftmost fitting column).
- **Drag** a card or run to move it exactly where you want; illegal drops snap back.
- **Tap the stock** to draw; tap it again when empty to recycle the waste.
- **Undo** reverses any move, draw, or recycle. Unlimited.
- **Auto finish** appears when the stock and waste are empty and everything is
  face up.
- The game (including undo history, timer, and draw mode) is saved automatically
  and resumes on the next visit.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works.

## Deploy

Copy the repository contents (minus `docs/`, `tests/`, `tools/`) to any static
host served over **HTTPS** (GitHub Pages, Netlify, Cloudflare Pages, …). HTTPS is
required for service-worker installation. When releasing an update, bump the
`CACHE` version string in `sw.js` so clients pick up new files.

On a phone, use the browser's **Add to Home Screen** to install.

## Development

- Engine (`js/game.js`) and storage (`js/storage.js`) are pure modules — no DOM.
- Tests: `node --test tests/*.test.mjs`
- Icons are generated: `python3 tools/make_icons.py`

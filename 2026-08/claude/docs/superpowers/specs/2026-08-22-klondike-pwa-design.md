# Klondike Solitaire PWA — Design Spec

Date: 2026-08-22
Status: Approved for implementation (user requested one-shot autonomous build of standard Klondike)

## Goal

A classic Klondike Solitaire game as an installable, offline-capable PWA, designed
mobile-first for phones (portrait). Standard rules, nothing fancy, fully working.

## Rules (standard Klondike)

- Standard 52-card deck, shuffled uniformly (Fisher–Yates).
- **Tableau:** 7 piles. Pile *i* (0-based) is dealt *i+1* cards; only the top card
  is face up.
- **Stock:** the remaining 24 cards, face down.
- **Waste:** cards drawn from stock, face up; only the top card is playable.
- **Foundations:** 4 piles, one per suit, built up A, 2, …, K. Any ace may start
  any empty foundation (foundation suit is fixed by its first ace).
- **Tableau building:** descending rank, alternating colors (red on black, black
  on red). An empty tableau pile accepts only a King (or a sequence led by a King).
- **Moves allowed:**
  - Draw from stock to waste (1 or 3 cards depending on draw mode).
  - When the stock is empty, tapping it recycles the entire waste back into the
    stock (face down, order reversed so draw order repeats). Unlimited recycles.
  - Top waste card → foundation or tableau (if legal).
  - Top foundation card → tableau (if legal; standard "worry back" is allowed).
  - Any face-up card in a tableau pile, together with all cards on top of it
    (which by invariant form a legal descending/alternating sequence) → another
    tableau pile (if legal against that pile's top card).
  - Top tableau card → foundation (if legal). Only single cards go to foundations.
  - After removing cards from a tableau pile, if the new top card is face down it
    is flipped face up automatically.
- **Win:** all 52 cards on the foundations.

## Features

- **Draw mode:** draw-1 (default) or draw-3, toggle in menu. Changing the mode
  starts a new game (avoids mid-game rule ambiguity).
- **Input, mobile-first:**
  - *Tap a card* → smart move: try foundation first, then tableau piles
    (left-to-right); move to the first legal destination. Tap on stock draws;
    tap on empty stock recycles.
  - *Drag & drop* using Pointer Events (works for touch and mouse): drag a card
    or face-up sequence; drop on a pile; illegal drops animate back.
    A press that moves less than a small threshold counts as a tap.
- **Undo:** unlimited, one user action per step (a draw, a recycle, a move+flip
  are each one undo step). Implemented as a stack of full serialized states —
  at 52 cards this is small and immune to inverse-move bugs.
- **HUD:** move counter and elapsed timer. Timer starts at first move of a deal,
  pauses when the tab is hidden, stops on win.
- **Auto-finish:** when the stock and waste are empty and every tableau card is
  face up, the game is trivially won; show an "Auto finish" button that plays
  the remaining cards to the foundations with a quick animation.
- **Win:** overlay with moves/time and a New game button.
- **New game** button (with confirm if a game is in progress).
- **Persistence:** full game state, undo history, draw mode, moves, and elapsed
  time saved to `localStorage` after every action; restored on load. Corrupt or
  missing save → new game.

Out of scope (YAGNI): scoring (Vegas or standard), hints, statistics, sound,
multiple card back designs, landscape-specific layout, restart-same-deal.

## Architecture

Vanilla HTML/CSS/JS, ES modules, **no build step, no dependencies**. Game logic is
a pure module with no DOM access so it is testable in Node.

```
index.html
css/style.css
js/game.js       — pure Klondike engine: state, rules, moves, undo, serialization
js/storage.js    — localStorage save/load (versioned key, corrupt-safe)
js/ui.js         — DOM rendering + pointer input; talks to game.js API only
js/main.js       — bootstrap: load/new game, wire UI, register service worker
sw.js            — cache-first precache service worker
manifest.webmanifest
icons/           — 192/512 (any + maskable) + 180 apple-touch-icon PNGs
tools/make_icons.py — stdlib-only PNG icon generator
tests/game.test.mjs — node:test suite for the engine
```

### Engine (`js/game.js`)

- Card = `{ id, suit: '♠♥♦♣' one of 4 codes, rank: 1..13, faceUp: bool }`;
  `id` = stable 0..51 index so the UI can keep one DOM node per card.
- State = `{ stock: [], waste: [], foundations: [[],[],[],[]], tableau: [[]x7],
  drawMode: 1|3, moves, won }`. Arrays ordered bottom→top.
- API (all mutations return `true/false` for applied/illegal and push undo
  snapshots internally): `newGame(drawMode, rng?)`, `draw()`, `recycle()` (folded
  into `draw()` when stock empty), `moveCard(from, index, to)` with pile refs like
  `{t:3}`, `{f:0}`, `{w}`, `autoMoveFor(card)` (smart-move destination search),
  `canAutoFinish()`, `nextAutoFinishMove()`, `undo()`, `serialize()`,
  `deserialize(json)`. `rng` injectable for deterministic tests.
- Validation is centralized: `canPlaceOnTableau(card, pile)`,
  `canPlaceOnFoundation(card, pile)`.

### UI (`js/ui.js`)

- One absolutely-positioned DOM node per card, moved with CSS transforms;
  z-index from pile order. Cards render rank + suit glyphs (♠ ♥ ♦ ♣) in CSS —
  no image assets.
- Responsive layout: card size computed from viewport width (7 columns + gaps),
  CSS custom properties; `viewport-fit=cover` + safe-area insets for notched
  phones.
- Pointer Events: `pointerdown` on a card captures; movement beyond ~8 px starts
  a drag (the card and any stack above it follow the pointer); release hit-tests
  pile drop zones by geometry; otherwise it's a tap → smart move. Full re-render
  of positions after every engine change (52 nodes — cheap).

### PWA

- `manifest.webmanifest`: name "Solitaire", `display: standalone`,
  `orientation: portrait`, theme/background colors, icons incl. maskable.
- `sw.js`: on install, precache all app files (versioned cache name); serve
  cache-first, falling back to network; on activate, delete old caches. Bump the
  cache version string on any release.
- iOS: `apple-touch-icon`, `apple-mobile-web-app-capable`, black-translucent
  status bar meta tags.

## Error handling

- Engine methods return `false` on illegal moves; UI treats `false` as "snap
  back", never throws.
- `storage.load()` wraps JSON parse + a shape check (52 unique card ids across
  piles) in try/catch; any failure → discard save, new game.
- Service worker registration failure is logged and ignored (game works without
  it, e.g. non-HTTPS).

## Testing

- `node --test tests/` covers: deal shape (pile sizes, face-up flags, 52 unique
  cards); draw-1/draw-3 and recycle order; tableau/foundation placement rules
  (colors, ranks, kings-on-empty, aces); multi-card sequence moves; auto-flip
  after moves; illegal moves rejected without state change; undo across every
  action type; smart-move destination priority; auto-finish detection and
  completion; win detection; serialize/deserialize round-trip.
- UI verified in a real browser (served over localhost): play moves, drag and
  tap, undo, new game, reload-resume, Lighthouse-style PWA sanity (manifest +
  SW + offline reload).

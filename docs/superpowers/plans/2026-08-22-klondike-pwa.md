# Klondike Solitaire PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully working classic Klondike Solitaire mobile-first PWA (offline-capable, installable) built with zero dependencies.

**Architecture:** Pure game engine (`js/game.js`, no DOM) tested with `node:test`; DOM/pointer UI layer renders one node per card and re-derives all positions from engine state after every action; storage module persists full state+history to localStorage; cache-first service worker + manifest + generated PNG icons make it a PWA.

**Tech Stack:** Vanilla ES modules (browser + Node 24), `node --test`, Python 3 stdlib (icon generation only). No build step, no npm packages.

**Spec:** `docs/superpowers/specs/2026-08-22-klondike-pwa-design.md`

## Global Constraints

- No runtime dependencies, no build step. ES modules only.
- Engine (`js/game.js`) and storage (`js/storage.js`) must not touch `document`/`window` (storage takes an injected storage object, defaulting to `globalThis.localStorage`).
- All engine mutations return `true`/`false`; illegal actions must leave state unchanged. Never throw during play.
- Card encoding everywhere: `id = suitIndex*13 + (rank-1)`, suits in order `['S','H','D','C']`, rank 1=A … 13=K. Serialized card number `n = id*2 + (faceUp ? 1 : 0)`.
- Pile references everywhere: `{k:'t', i:0..6}`, `{k:'f', i:0..3}`, `{k:'w'}` (stock is never a move source/target via `moveCard`).
- Arrays are bottom→top; "top" = last element.
- localStorage key: `klondike-v1`. Service worker cache name: `klondike-v1`.

---

### Task 1: Engine — deck, deal, draw, recycle

**Files:**
- Create: `js/game.js`
- Test: `tests/game.test.mjs`

**Interfaces (Produces):**
```js
export const SUITS = ['S','H','D','C'];
export function isRed(suit)              // true for 'H','D'
export function makeCard(id)             // {id, suit, rank, faceUp:false}
export class Game {
  // fields: stock, waste, foundations [4][], tableau [7][], drawMode 1|3, moves, won, history []
  newGame(drawMode = 1, rng = Math.random)
  draw()   // -> bool. Draws min(drawMode, stock.length) cards to waste (faceUp),
           // one undo step, moves++. If stock empty && waste nonempty: recycle —
           // stock = waste reversed, all faceDown, waste=[], one undo step, moves unchanged.
           // If both empty -> false, no-op.
}
```
Deal: shuffle 52 ids with Fisher–Yates using `rng`; tableau pile i gets i+1 cards, top card faceUp; remaining 24 to stock faceDown. `moves=0, won=false, history=[]`.

- [ ] **Step 1: Write failing tests** in `tests/game.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SUITS, isRed, makeCard } from '../js/game.js';

// seeded rng helper (mulberry32)
function rng(seed) { return function() { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test('deal shape', ...)        // 7 piles sized 1..7, only tops faceUp, stock 24 all faceDown,
                               // waste/foundations empty, 52 unique ids across all piles
test('isRed/makeCard', ...)    // id 0 -> {suit:'S',rank:1}, id 51 -> {suit:'C',rank:13}, isRed('H') etc.
test('draw-1 moves one card faceUp to waste, moves++', ...)
test('draw-3 moves three cards, order preserved', ...)
                               // top of stock becomes bottom-most of the 3 added? NO:
                               // draw pops stock top -> pushes to waste top, 3 times.
                               // So stock[-1] ends up waste[-3], stock[-3] ends waste[-1].
test('draw-3 with 2 left draws 2', ...)
test('recycle restores draw order', ...)
                               // draw all with draw-1 recording order; draw() once more (recycle:
                               // waste empty, stock 24 faceDown, moves unchanged); draw all again;
                               // order identical to first pass
test('draw with empty stock and empty waste returns false', ...)
```

- [ ] **Step 2: Run** `node --test tests/` — expect FAIL (module missing).
- [ ] **Step 3: Implement** deck/deal/draw/recycle in `js/game.js` (history pushes included from the start: `#snapshot()` before-state pushed on every successful mutation; cap history at 200).
- [ ] **Step 4: Run** `node --test tests/` — expect PASS.
- [ ] **Step 5: Commit** `feat: engine deal, draw, recycle`

### Task 2: Engine — placement rules and moveCard

**Files:**
- Modify: `js/game.js`
- Test: `tests/game.test.mjs`

**Interfaces (Produces):**
```js
export function canPlaceOnTableau(card, pile)     // empty -> rank 13; else top faceUp,
                                                  // opposite color, card.rank === top.rank-1
export function canPlaceOnFoundation(card, pile)  // empty -> rank 1; else same suit && rank === top+1
Game.prototype.pile(ref)                          // resolve {k,i} -> array (helper)
Game.prototype.moveCard(from, index, to)          // -> bool, one undo step, moves++ on success
```
`moveCard` rules: source cards = `pile.slice(index)`; from `w`/`f` index must be top; runs (length>1) only from tableau to tableau; every moved card must be faceUp and tableau runs must be descending/alternating (validate defensively); to foundation only single cards; after removing from tableau, flip new top faceUp (same undo step); set `won` when all foundations reach 13. Reject `from===to` and out-of-range refs.

Test setup helper — build positions directly (white-box, documented as test-only):
```js
function emptyGame() { const g = new Game(); g.newGame(1, rng(1));
  for (const p of [g.stock, g.waste, ...g.foundations, ...g.tableau]) p.length = 0;
  g.history.length = 0; return g; }
function put(g, ref, ids, ups) { /* push makeCard(id) with faceUp per ups into g.pile(ref) */ }
```

- [ ] **Step 1: Write failing tests:**

```js
test('tableau accepts alternating descending', ...)   // red 5 on black 6 ok; black 5 on black 6 no; red 5 on red 6 no; 4 on 6 no
test('empty tableau accepts only king', ...)
test('foundation: ace on empty, same-suit ascending', ...) // A♠ on empty ok; 2♠ on A♠ ok; 2♥ on A♠ no; 3♠ on A♠ no
test('waste top to tableau and foundation', ...)
test('run move between tableau piles', ...)            // move 3-card run, verify all 3 arrive in order
test('run to foundation rejected', ...)
test('face-down card cannot move; mid-pile faceUp run must be valid sequence', ...)
test('auto-flip after tableau move', ...)              // face-down card under moved run flips up
test('foundation top back to tableau (worry back)', ...)
test('illegal move leaves state unchanged and returns false', ...) // deep-compare serialize before/after
test('win detected when all foundations complete', ...) // fill 13+13+13+12, move last king -> won === true
```

- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat: engine move validation and moveCard`

### Task 3: Engine — undo, serialize, smart move, auto-finish

**Files:**
- Modify: `js/game.js`
- Test: `tests/game.test.mjs`

**Interfaces (Produces):**
```js
Game.prototype.undo()            // -> bool; restores previous snapshot incl. moves/won
Game.prototype.serialize()       // -> {v:1, drawMode, moves, won, stock:[n], waste:[n],
                                 //     f:[[n]x4], t:[[n]x7], history:[snapshot]} (snapshot = same minus history)
Game.deserialize(obj)            // static -> Game; throws Error on bad shape / not exactly ids 0..51 once
Game.prototype.autoMoveFrom(from, index)  // smart move -> bool. Single card: foundations 0..3 then tableau 0..6
                                 // (skip source; skip king-run-at-index-0 -> empty pile). Run: tableau only.
Game.prototype.canAutoFinish()   // stock & waste empty, every tableau card faceUp, !won
Game.prototype.autoFinishStep()  // move one lowest-rank eligible tableau top to a foundation -> bool
```

- [ ] **Step 1: Write failing tests:**

```js
test('undo reverses draw, recycle, move, and flip as single steps', ...)
test('undo on fresh game returns false', ...)
test('serialize/deserialize round-trip', ...)   // play a few actions, round-trip, deep-equal serialize();
                                                // undo still works after restore
test('deserialize rejects corrupt data', ...)   // missing pile, duplicated id, bad rank -> throws
test('smart move prefers foundation over tableau', ...)
test('smart move falls back to leftmost legal tableau pile', ...)
test('smart move skips pointless king-to-empty when already at pile bottom', ...)
test('smart move of a run goes tableau-only', ...)
test('canAutoFinish only when stock+waste empty and all faceUp', ...)
test('autoFinishStep drains to win', ...)       // loop autoFinishStep() until false; assert won
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat: engine undo, persistence, smart move, auto-finish`

### Task 4: Storage module

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.mjs`

**Interfaces (Produces):**
```js
export function createStorage(backing = globalThis.localStorage) // -> {save, load, clear}
// save({game, elapsedMs}) -> void (never throws; quota errors swallowed)
// load() -> {game: Game, elapsedMs: number} | null   (null on missing/corrupt; corrupt also cleared)
// clear() -> void
```
Stored JSON: `{game: game.serialize(), elapsedMs}` under key `klondike-v1`. Tests use a `Map`-backed fake with `getItem/setItem/removeItem`.

- [ ] **Step 1: failing tests** (round-trip, null on missing, null+clear on corrupt JSON and on valid JSON/bad shape, save never throws when backing throws). **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat: storage module`

### Task 5: Static UI — HTML, CSS, card rendering

**Files:**
- Create: `index.html`, `css/style.css`, `js/ui.js`, `js/main.js`

**Interfaces (Produces):**
```js
// js/ui.js
export class UI {
  constructor(rootEl, game, callbacks)  // callbacks: {onAction()} fired after any state change
  setGame(game)
  render()          // full position/z-index/face pass over all 52 card nodes + placeholders
  layout()          // recompute geometry from viewport (called on resize)
  updateHud(moves, elapsedMs)
  showWin(moves, elapsedMs) / hideWin()
  setAutoFinishVisible(bool)
}
```
Layout math (JS, applied via inline transforms; one absolutely-positioned node per card created once):
- `cardW = min(floor((boardW - 16 - 6*gap)/7), 92)`, `gap=8`, `cardH = floor(cardW*1.4)`; set as CSS vars.
- Row 1 (y=8): stock col 0, waste col 1, foundations cols 3..6. Tableau row y = cardH + 32.
- Fan offsets: faceUp `0.28*cardH`, faceDown `0.13*cardH`; clamp scale so tallest pile fits board height. Waste in draw-3 fans top 3 cards horizontally by `0.3*cardW`.
- Placeholders: static divs per pile (stock shows ↻ glyph when recyclable).
- Card faces: rank+suit in top-left corner + big center suit glyph; red/black via class; face-down = CSS pattern back. All text/glyphs, no images.
- Header (normal flow above board): New, Draw-1/3 toggle, moves, timer, Undo.
- `index.html`: viewport meta with `viewport-fit=cover`, safe-area padding, dark-green felt background, manifest + apple meta tags (added in Task 7 but tags can exist now).
- `js/main.js`: load save via storage (fall back to `newGame(1)`), construct UI, render. Timer: `setInterval` 500ms → `updateHud`; `elapsedMs` accumulates only while `document.visibilityState === 'visible'` and game started (moves>0) and not won; save after every action and on `visibilitychange`.

- [ ] **Step 1:** Write HTML/CSS/UI render path (no interactions yet), main.js bootstrap with new game.
- [ ] **Step 2:** `python3 -m http.server` + open in browser: verify deal renders correctly at phone width (DevTools iPhone viewport), engine tests still pass.
- [ ] **Step 3: Commit** `feat: static board rendering`

### Task 6: UI interactions

**Files:**
- Modify: `js/ui.js`, `js/main.js`, `css/style.css`

**Behavior:**
- Pointer events (`pointerdown/move/up/cancel`, `setPointerCapture`, `touch-action:none` on board):
  - Down on stock placeholder or stock card → on up without drag → `game.draw()`.
  - Down on a draggable card (waste top; foundation top; any faceUp tableau card): movement > 8px starts drag — the card and all cards above it in its pile follow the pointer (`.dragging`: no transition, z 1000+). Release: hit-test pointer against foundation and tableau base rects (tableau rect extends to pile bottom + one card height); try `moveCard`; any failure → re-render (snap back via transition).
  - Up without drag (tap): `autoMoveFrom` for waste/tableau cards; foundations do nothing on tap.
- Buttons: Undo → `game.undo()`; New → `confirm()` then `newGame(currentDrawMode)`; Draw toggle → confirm + `newGame(newMode)`.
- After every successful action: `render()`, HUD update, save, auto-finish visibility check.
- Auto-finish button: when `canAutoFinish()` — on click, disable input and run `autoFinishStep()` every 120ms until false; then win overlay.
- Win overlay shown when `game.won` (also right after load of a won save).

- [ ] **Step 1:** Implement tap + drag + buttons + persistence wiring.
- [ ] **Step 2:** Engine tests still pass; browser walkthrough: draw, tap-to-foundation, drag run, illegal drop snaps back, undo each, new game confirm, reload resumes mid-game state.
- [ ] **Step 3: Commit** `feat: interactions, undo, persistence wiring`

### Task 7: PWA — icons, manifest, service worker

**Files:**
- Create: `tools/make_icons.py`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`, `manifest.webmanifest`, `sw.js`
- Modify: `index.html`, `js/main.js`

**Details:**
- `make_icons.py`: stdlib-only (zlib, struct) PNG writer; SDF-rendered design — full-bleed dark-green square, centered white rounded-rect card (~58% width), red heart (two circles + triangle union) centered; sizes 512/192/180; anti-aliased via distance smoothing. Full-bleed → same design valid for `any`, `maskable`, and apple-touch.
- `manifest.webmanifest`: name/short_name "Solitaire", `start_url: "."`, `display: standalone`, `orientation: portrait`, `background_color`/`theme_color` = felt green, icons 192+512 with `"purpose": "any maskable"`.
- `sw.js`: `CACHE='klondike-v1'`; `ASSETS=[ './', 'index.html', 'css/style.css', 'js/game.js','js/storage.js','js/ui.js','js/main.js', 'manifest.webmanifest', 'icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png' ]`; install → `addAll` + `skipWaiting`; activate → delete other caches + `clients.claim`; fetch → cache-first (`ignoreSearch:true`), navigations fall back to cached `index.html`, misses go to network.
- `index.html`: manifest link, theme-color, apple-touch-icon, `apple-mobile-web-app-capable`. `main.js`: `navigator.serviceWorker.register('sw.js')` in try/catch, only when supported.

- [ ] **Step 1:** Write and run icon script; verify PNGs open (`file icons/*.png`, view one).
- [ ] **Step 2:** Manifest + SW + registration; browser check: SW active, offline reload works (DevTools offline), installability check clean.
- [ ] **Step 3: Commit** `feat: PWA manifest, service worker, icons`

### Task 8: Final verification & docs

**Files:**
- Create: `README.md`

- [ ] **Step 1:** `node --test tests/` — all pass.
- [ ] **Step 2:** Full browser pass at mobile viewport: complete-game smoke via auto-finish path, draw-3 mode, undo chains, reload-resume, offline reload, no console errors.
- [ ] **Step 3:** README: what it is, rules summary, local run (`python3 -m http.server`), deploy note (any static host over HTTPS), test command.
- [ ] **Step 4: Commit** `docs: README` — final state.

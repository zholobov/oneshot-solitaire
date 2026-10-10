# Klondike Solitaire PWA — Design Spec

Date: 2026-10-10
Status: approved for implementation (autonomous one-shot build; routine decisions made by the implementer and recorded here)

## 1. Goal

A classic Klondike Solitaire game that runs as an installable, offline-capable Progressive Web App on a phone. Standard rules, a clean portrait-first touch UI, nothing fancy. The deliverable must work first time: every rule is unit-tested in a pure engine, and the UI is verified in a real browser before completion.

**Success criteria**

- A complete game can be played start to finish with touch only (tap and drag).
- All Klondike rules are enforced exactly as specified in §2.
- Closing the app mid-game and reopening it resumes the same game.
- Once installed, the app opens and plays with no network connection.
- `npm test`, `npm run build`, and the end-to-end smoke test all pass.

**Non-goals:** scoring (standard/Vegas), hints, statistics, themes, sound, card-flip 3D effects, other solitaire variants, accounts or sync, right-to-left layouts.

## 2. Game rules (standard Klondike)

- One 52-card deck, no jokers.
- **Deal:** seven tableau columns; column *i* (0-based) receives *i+1* cards; only the last-dealt (top) card of each column is face-up. The remaining 24 cards form the face-down stock. The waste and the four foundations start empty.
- **Stock / waste:** tapping the stock moves the top *N* cards (N = draw count, 1 or 3) one at a time onto the waste, so the last card drawn is on top. If fewer than *N* remain, all remaining cards are drawn. When the stock is empty and the waste is not, tapping the stock recycles: the whole waste is turned over to become the stock again (the card on top of the waste becomes the bottom of the stock). Unlimited passes.
- **Foundations:** four piles, any suit may occupy any pile. A pile accepts only an Ace when empty; otherwise only the next rank of the same suit. Only one card at a time may be moved to a foundation.
- **Tableau building:** a card may be placed on a tableau column only if the column's top card is face-up, of the opposite colour, and exactly one rank higher. An empty column accepts only a King (or a run starting with a King).
- **Moving runs:** any face-up card in a column may be moved together with all cards on top of it, as a unit, to another column that accepts the run's bottom card.
- **Sources:** the top card of the waste, the top card of a foundation, and face-up tableau cards may be moved. Cards may never be moved onto the stock or the waste.
- **Auto-flip:** when a move leaves a face-down card on top of a column, it is turned face-up immediately as part of the move.
- **Win:** all 52 cards are on the foundations.
- **Auto-finish:** when the stock and waste are empty and every tableau card is face-up, the game is trivially winnable. The player may tap *Auto finish* to play the remaining cards to the foundations automatically. (Proof that this always succeeds: with every column a valid descending run, the lowest-ranked card in the tableau is on top of its column, and every card of lower rank is already on a foundation, so it can always be played.)
- **Draw mode:** Draw 1 (default) or Draw 3. Changing the mode starts a new game.
- Deals are random and not guaranteed to be winnable (standard behaviour).

## 3. User experience

### 3.1 Screen layout (portrait first)

```
┌──────────────────────────────────────┐
│ ☰        Moves 42 · 03:12       ↶    │  header (menu, stats, undo)
├──────────────────────────────────────┤
│ [stock][waste  ]      [F][F][F][F]   │  top row, 7 slots wide
│                                      │
│  [c0] [c1] [c2] [c3] [c4] [c5] [c6]  │  tableau, 7 columns
│   ..   ..   ..   ..   ..   ..   ..   │  cards fan downward
│                                      │
│                 [Auto finish]        │  only when available
└──────────────────────────────────────┘
```

- Seven equal columns span the board width. Card width = (board width − 8·gap) / 7, capped at 120 px; height = 1.4 × width. On wide screens the board is centred.
- Top row: stock at column 0, waste at column 1 (in Draw 3 the waste fans up to three cards rightward into the empty column 2 area), foundations at columns 3–6.
- Tableau columns start below the top row. Face-down cards overlap tightly (14 % of card height), face-up cards loosely (30 %). If a column would run off the bottom of the board, that column's offsets are scaled down (to no less than 25 % of the defaults) so it fits.
- Landscape and tablets work with the same rules; cards are additionally limited by board height so the layout stays on screen.
- The board never scrolls or zooms. Safe-area insets (notch, home indicator) are respected.

### 3.2 Interaction

- **Tap a card** → *smart move*: move it (with the run above it, for tableau cards) to the best legal destination: a foundation first (single cards only), then the leftmost non-empty tableau column that accepts it, then an empty column (only for Kings, and not when the King is already at the bottom of its own column). If nothing accepts it, the card shakes briefly.
- **Drag a card or run** → drop on a foundation or tableau column. The drop target is the pile whose area overlaps the dragged card most. Illegal drops and cancelled drags animate back.
- **Tap the stock** → draw. Tap the empty stock (shows a recycle icon) → recycle the waste.
- Face-down tableau cards are inert.
- Tap vs drag: a pointer that moves less than 6 px before release is a tap.
- **Undo** (header button): unlimited, including draws, recycles and auto-finish steps.
- **Menu** (header button) opens a sheet: *New game*, *Replay this deal*, draw mode selector (Draw 1 / Draw 3, "starts a new game"), *Close*. Actions that discard a game in progress require a second tap ("Tap again to confirm") within 3 seconds.
- **Win:** an overlay shows "You won!", the move count and time, and a *New game* button.
- **Stats:** moves count every applied action (draw, recycle, move). The timer starts at the first action, pauses while the page is hidden, and stops on win.

### 3.3 Visual style

Green felt background, white rounded cards with rank + suit in the top-left corner (mirrored bottom-right) and a large suit glyph in the centre; red hearts/diamonds, black spades/clubs; a patterned blue card back; faint outlined slots (foundation slots marked "A", stock slot shows a recycle icon when empty). Unicode suit glyphs, system font stack, no images other than PWA icons. Card movement uses a short CSS transform transition (≈180 ms).

## 4. Architecture

Vanilla TypeScript, no framework. Two layers with a thin controller between them:

```
src/
  main.ts              bootstrap: build DOM, create controller, register SW
  app.ts               controller: history/undo, dispatch, autosave, timer, auto-finish runner
  engine/              PURE, no DOM — fully unit-tested
    cards.ts           card id ↔ suit/rank/colour/labels
    rng.ts             seeded PRNG (mulberry32) + Fisher–Yates shuffle
    game.ts            GameState, deal, actions, validation, apply, isWon
    smart.ts           smart-move target selection, auto-finish condition and next move
    serialize.ts       save-file shape, validation of untrusted saved data
  ui/
    layout.ts          PURE: (state, board size) → card positions, slot rects
    board.ts           DOM renderer: 52 persistent card elements + 13 slots, applies layout
    input.ts           pointer handling: tap / drag / drop → actions via callbacks
    hud.ts             header, menu sheet, win overlay, auto-finish button
    storage.ts         localStorage wrapper (safe reads/writes)
  styles.css
```

**Principles**

- `GameState` is immutable; every action returns a new state. Undo is a stack of previous states.
- The renderer is idempotent: `render(state)` positions everything from scratch. Any doubtful situation (pointer cancel, resize) is resolved by re-rendering from state.
- The UI only dispatches actions the engine has validated; the engine throws on invalid actions as a programming-error guard.
- Zero runtime dependencies.

### 4.1 Engine data model

Cards are integers 0–51: `suit = floor(id / 13)` (0 ♠, 1 ♥, 2 ♦, 3 ♣), `rank = id % 13 + 1` (1 = Ace … 13 = King). Red = suits 1 and 2.

```ts
interface GameState {
  seed: number;           // deal seed, enables "replay this deal"
  drawCount: 1 | 3;
  stock: number[];        // last element is the top card
  waste: number[];        // last element is the top card
  wasteFan: number;       // how many top waste cards are fanned (Draw 3 display)
  foundations: number[][];// 4 piles, last element on top
  tableau: number[][];    // 7 columns, index 0 is the deepest card
  faceUp: number[];       // per column: how many cards at the top are face-up
  moves: number;          // applied actions
}
```

Invariants (checked by `validateState`): the 52 ids appear exactly once across all piles; `0 ≤ faceUp[i] ≤ tableau[i].length`; a non-empty column has `faceUp[i] ≥ 1`; `drawCount ∈ {1, 3}`; `0 ≤ wasteFan ≤ waste.length`.

### 4.2 Actions

```ts
type Loc = { pile: 'waste' } | { pile: 'foundation'; index: number } | { pile: 'tableau'; index: number };
type Action =
  | { type: 'draw' }
  | { type: 'recycle' }
  | { type: 'move'; from: Loc; to: Loc; count: number };
```

- `validate(state, action): string | null` — null when legal, otherwise a reason.
- `apply(state, action): GameState` — throws if invalid. Effects:
  - `draw`: requires non-empty stock. Moves `k = min(drawCount, stock.length)` cards, top first, onto the waste; `wasteFan = k`; `moves + 1`.
  - `recycle`: requires empty stock and non-empty waste. `stock = reverse(waste)`, `waste = []`, `wasteFan = 0`; `moves + 1`.
  - `move`: `count = 1` unless from tableau; from tableau requires `1 ≤ count ≤ faceUp[from]`; the moved run must itself be a valid alternating descending sequence (defensive check); destination rules per §2; `from ≠ to`; destinations limited to foundation and tableau. After removal from a tableau column, `faceUp` is decremented by `count` and, if it reaches 0 on a non-empty column, set to 1 (auto-flip). After removal from the waste, `wasteFan = max(0, wasteFan − 1)`. `moves + 1`.
- `isWon(state)`: every foundation has 13 cards.
- `deal(seed, drawCount)`: shuffle with mulberry32(seed), deal row by row.

### 4.3 Smart move and auto-finish (`smart.ts`)

- `findSmartMove(state, from: Loc, count): Action | null` implements §3.2 priorities.
- `canAutoFinish(state)`: stock and waste empty, every column fully face-up, not yet won.
- `nextAutoFinishMove(state)`: among column tops, the lowest rank that a foundation accepts (ties: lowest column index); returns a move action or null if won.

### 4.4 Controller (`app.ts`)

Holds `{ state, history: GameState[], elapsedMs, settings }`. Methods: `dispatch(action)`, `undo()`, `newGame(seed?)`, `setDrawCount(n)` (starts a new game), `runAutoFinish()` (applies `nextAutoFinishMove` every 120 ms until won), timer tick (1 s, only while visible, started and not won). After every state change: render, update HUD, save.

### 4.5 Layout (`layout.ts`)

Pure function `computeLayout(state, { width, height }): Layout` returning `cardW, cardH, gap`, a map of card id → `{ x, y, z, faceUp, loc }`, and slot rects for stock, waste, four foundations and seven tableau columns (tableau rects extend to the column's last card so drops on long columns work). Exact numbers:

- `gap = max(4, round(width / 100))`; `cardW = min(floor((width − 8·gap) / 7), 120, floor((height − 5·gap) / (1.4 × 2.6)))`, minimum 30; `cardH = round(1.4 × cardW)`.
- `offsetX = floor((width − (7·cardW + 8·gap)) / 2)`; column *i* x = `offsetX + gap + i·(cardW + gap)`.
- Top row y = `gap`; tableau top y = `gap + cardH + 3·gap`.
- Waste fan: the top `max(1, min(wasteFan, 3))` cards are offset by `round(0.3 × cardW)` each to the right (only when `drawCount === 3`); other waste cards sit at the slot.
- Column fan: `dDown = round(0.14 × cardH)`, `dUp = round(0.3 × cardH)`; if the column height exceeds `height − tableauY − gap`, both are multiplied by `f = clamp((available − cardH) / needed, 0.25, 1)`.
- `z` is the index of the card within its pile.

### 4.6 Input (`input.ts`)

Pointer Events with pointer capture on the board. Pointerdown on a draggable card records the run and start position; pointermove beyond 6 px lifts the run (no transitions, high z-index) and follows the pointer; pointerup either taps (smart move) or drops (largest overlap with a foundation or tableau rect); pointercancel re-renders. Taps on the stock slot/stock cards draw or recycle. `touch-action: none` on the board, `user-select: none`, no touch callout.

### 4.7 Persistence (`serialize.ts`, `storage.ts`)

localStorage keys `klondike.save.v1` and `klondike.settings.v1`.

```ts
interface SaveFile { version: 1; state: GameState; history: GameState[]; elapsedMs: number }
interface Settings { drawCount: 1 | 3 }
```

Saves happen after every change (synchronously; the data is a few KB). History is capped at the most recent 500 states. On load, the save is validated with `validateState` for `state` and every history entry; any failure discards the save and deals a new game. Storage errors (quota, private mode) are caught and logged; the game continues unsaved.

### 4.8 PWA

- `vite-plugin-pwa` (generateSW strategy, `registerType: 'autoUpdate'`), precaching all built assets and icons; `base: './'` so `dist/` can be hosted from any path.
- Manifest: name/short_name "Solitaire", `display: standalone`, `orientation: any`, theme and background colour dark green, icons 192 and 512 px plus a 512 px maskable icon, generated by `scripts/make-icons.mjs` (dependency-free PNG writer) and committed under `public/icons/`.
- `index.html`: viewport `width=device-width, initial-scale=1, viewport-fit=cover`, `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-touch-icon` (180 px PNG), SVG favicon.
- Service worker registration failures are ignored; the game must not depend on it.
- A tiny debug hook `window.__solitaire = { getState, loadState }` exists for end-to-end tests.

## 5. Testing

- **Unit (Vitest, node environment):** cards, rng, every rule in §2 (positive and negative cases), auto-flip, waste fan, recycle order, move counter, win detection, smart-move priorities, auto-finish condition and completion from a constructed end-state, save validation and round-trip, layout invariants (cards within bounds, column compression, waste fan, centring).
- **End-to-end (Playwright, Chromium or Edge channel):** against the production preview build: 52 cards render; tapping the stock draws; undo restores; drag-and-drop of a legal run; tap smart move; a loaded near-win state can be finished and shows the win overlay; reload resumes the game; the manifest is served; the service worker activates and the page reloads while offline.
- **Static:** `tsc --noEmit` with `strict` and `noUncheckedIndexedAccess`.
- **Manual:** visual check of portrait phone viewport screenshots produced by the E2E run.

## 6. Error handling summary

| Situation | Behaviour |
|---|---|
| Invalid action reaches the engine | throws (programming error); UI never dispatches unvalidated actions |
| Corrupt or outdated save | discarded, new game dealt |
| localStorage unavailable | caught, logged, game continues without persistence |
| Service worker fails to register | ignored, game runs online |
| Pointer cancelled mid-drag | re-render from state (cards snap back) |
| Window resized / rotated | layout recomputed, re-render without transitions |

## 7. Tooling and scripts

- `npm run dev` — Vite dev server (use `--host` to open on a phone on the same network).
- `npm run build` — type-check then production build to `dist/` (static, deploy anywhere).
- `npm run preview` — serve `dist/`.
- `npm test` — unit tests. `npm run test:e2e` — Playwright smoke test (builds first).
- `npm run icons` — regenerate PWA icons.

Pinned versions: vite 8.3.x, vite-plugin-pwa 2.0.x, vitest 5.0.x, typescript 5.9.x, @playwright/test 1.64.x.

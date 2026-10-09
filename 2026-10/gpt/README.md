# Pocket Solitaire

A PWA (an installable website) for classic, draw-one Klondike Solitaire. Designed for phone screens, with tap or drag controls, saved games, and offline play. No accounts, ads, analytics, external fonts, or runtime packages.

## Run locally

Use Node.js 22. The `.nvmrc` file selects that version for developers using a Node version manager.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open http://localhost:4173 on the same computer.

Dependencies come from the approved corporate npm feed in `.npmrc`; the lockfile also uses corporate mirrors. No public npm registry is needed.

The preview server listens only on this computer. Change its port with `PORT=4180 npm start`. After editing source files, run `npm run build` again; the server serves the new files without restarting.

## Install on a phone

1. Run `npm run build`.
2. Publish everything inside `dist/` to a secure website address using HTTPS. The files need no application server or database.
3. Open the published address on the phone and wait for **Offline ready**.
4. On iPhone, use Safari's **Share > Add to Home Screen**. On Android, use **Install** or the browser's **Install app / Add to Home screen** menu.

The app works at a site's root or inside a folder such as `/solitaire/`. Keep `sw.js`, `index.html`, the JavaScript files, the stylesheet, manifest, and icons together in their generated layout. Serve `.js` as JavaScript and `.webmanifest` as `application/manifest+json`.

`localhost` on a phone refers to the phone, not your computer. Opening `index.html` directly or visiting a plain-HTTP network address does not enable offline installation. For a local network layout preview only, `HOST=0.0.0.0 npm start` exposes the server to other devices; use HTTPS hosting for installation.

No public deployment or cloud resources are created by this project.

## Rules

This is an original implementation of standard Klondike, using these published rule descriptions:

https://bicyclecards.com/how-to-play/solitaire

https://en.wikipedia.org/wiki/Klondike_(solitaire)

The selected variant is **draw one, unlimited passes**:

- Deal one standard 52-card deck into seven columns containing 1 through 7 cards. Only each column's top card starts face up. The other 24 cards form the draw pile.
- Build the four suit piles from ace through king, in the same suit.
- Build columns downward one rank at a time, alternating red and black.
- Move one face-up card or a correctly ordered face-up run together.
- Only a king or a run beginning with a king can fill an empty column.
- Draw one card at a time. Only the top discard is playable. When the draw pile is empty, recycle the discards without changing their order; passes are unlimited.
- Newly uncovered cards turn face up automatically. The top card of a suit pile can move back to a column before the game is won.
- Win by moving all 52 cards to the suit piles.

Deals are random, not guaranteed solvable. There is no draw-three mode or scoring system.

## Controls and saves

Tap a card, then a highlighted destination, or drag it. To move a run, select its highest card. Tap a selected card again or press Escape to cancel.

**Undo** reverses a draw, a recycle, or a card move, including any card that was turned over. Up to 200 undo steps are retained. **Hint** highlights a legal suggestion; it is not a solver. **Restart** restores the same deal. **New game** shuffles another deal. Both confirm before replacing a game in progress.

**Finish game** appears only when the draw and discard piles are empty and every remaining card is face up. It completes the legal suit-pile moves; those moves remain undoable.

Tab and Enter or Space operate the controls. Ctrl/Cmd+Z undoes a move. Card names, selections, and action messages are available to screen readers.

The clock starts with the first move and pauses when the app is hidden or unfocused. A move counts each draw, recycle, or transfer; revealing a covered card is part of the same move.

Your board, original deal, undo history, and elapsed time are stored in this browser. Saves synchronize between windows at the same address. Storage errors are shown instead of silently claiming success. An unreadable save starts a new deal with an explanation.

Saves are not cloud backups. Clearing browser data or the operating system reclaiming browser storage can remove them. Browsers and installed apps may use separate storage, particularly on iOS.

## Offline behavior and updates

A service worker (the browser's background offline helper) caches the entire app after the first successful visit. Everything needed to play is included in `dist/`.

Builds automatically generate a content-based cache version. A new version waits until you choose **Update ready**; the current game is saved before reloading. Cache cleanup is limited to this app's own address, not other apps on the same website.

An installation or download failure is reported visibly. Wait for **Offline ready** before relying on offline play.

## Project layout

```text
src/game.ts             Card rules, legal moves, hints, and board validation
src/session.ts          Undo, restart, finish, and saved-game validation
src/app.ts              Touch/keyboard controls, rendering, saves, and installation
public/                Page, styles, original icons, manifest, and offline helper
scripts/build.mjs      Type-checks, compiles, and builds the offline file list
scripts/serve.mjs      Small local preview server
scripts/icons.mjs      Regenerates PNG icons from the original SVG
tests/                 Rule, save, browser, and offline checks
dist/                  Generated, ready-to-publish app
```

The game engine is independent of the screen and does not modify earlier board states. The interface can only make moves accepted by that engine. Saved data is checked for card uniqueness, legal sequences, pile counts, and consistent undo history before it is used.

## Development checks

Install the browser test tools once, then run the complete checks:

```sh
npx --no-install playwright install chromium webkit
npm run check
```

`npm test` runs the rule and save checks. `npm run test:browser` runs browser checks. `npm run typecheck` checks the TypeScript without generating files. `npm run icons` regenerates the already-included phone icons; browser tools are needed only to regenerate them.

Coverage includes complete 52-card wins, thousands of legal move sequences, touch and mouse input, invalid drops, undo, recycling, restart, corrupted or unavailable storage, timers, multiple windows, small screens, keyboard controls, readable contrast, installation metadata, offline reloads, app updates, and deployment inside a website folder.

Browser checks use phone-sized Chromium, phone-sized WebKit (Safari's browser engine), and desktop Chromium. Touch taps run on both phone engines. The low-level touch-drag injection runs only on mobile Chromium; pointer dragging is checked on all three projects.

For offline checks, the test's actual web server is shut down and checked to be unreachable. Chromium additionally uses the browser's simulated offline switch. This pinned WebKit test version has an upstream bug in that switch, so its checks use the real server outage instead:

https://github.com/microsoft/playwright/issues/42775

These are browser-based checks, not a claim of physical-device or App Store testing.

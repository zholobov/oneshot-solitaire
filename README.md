# Solitaire (Klondike) — PWA

Classic Klondike Solitaire as an installable, offline-capable web app for phones. No frameworks, no runtime dependencies.

## Play

- **Tap** a card to move it to the best legal place (foundation first). **Drag** a card or run to choose the destination yourself.
- **Tap the stock** to draw (Draw 1 or Draw 3, set in the menu). When the stock is empty, tap it to recycle the waste.
- **↶** undoes any number of moves. **☰** opens the menu: new game, replay the same deal, draw mode.
- When every card is face-up and the stock is empty, **Auto finish** plays the rest for you.
- The game saves itself after every move and resumes when you reopen the app.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173 (add --host to open it on a phone on the same network)
npm test             # unit tests (Vitest)
npm run typecheck
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/
npm run test:e2e     # builds, then runs the Playwright smoke test against the preview server
npm run icons        # regenerate public/icons from scripts/make-icons.mjs
```

The end-to-end test needs a Chromium: either run `npx playwright install chromium` once, or point it at an installed browser with `PW_CHANNEL=msedge` or `PW_CHANNEL=chrome`.

## Deploy / install on a phone

`npm run build` produces a static site in `dist/` with relative URLs, so it can be served from any path on any static host (GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket, …). Serve it over **HTTPS**; browsers only install the service worker (offline support and "Add to Home Screen") on secure origins or `localhost`.

- Android / Chrome: open the site → menu → *Install app* (or *Add to Home screen*).
- iOS / Safari: open the site → Share → *Add to Home Screen*.

## Structure

- `src/engine/` — pure game logic (cards, seeded shuffle, rules, smart move, auto-finish, save validation). Fully unit-tested.
- `src/app.ts` — controller: history/undo, autosave, timer, auto-finish runner.
- `src/ui/` — layout math (pure), DOM renderer, pointer input, header/menu/win overlay, storage.
- `e2e/` — Playwright smoke test including an offline reload.
- `docs/superpowers/` — design spec and implementation plan.

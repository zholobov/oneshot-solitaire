# Solitaire PWA

A mobile-first, installable implementation of classic draw-one Klondike Solitaire. It has no
runtime dependencies and works offline after the first successful load.

## Rules

- A standard 52-card deck is dealt into seven tableau columns; only each column's top card starts
  face up.
- Tableau cards build downward in alternating colors. Only a King or a King-led sequence can move
  to an empty column.
- Foundations build upward by suit from Ace through King.
- The stock draws one card at a time. When it is empty, the waste can be turned over and reused
  without a pass limit.
- The game is won when all four foundations are complete.

Tap a face-up card and then a destination, tap the selected card again to move it automatically to
its foundation when legal, or drag cards directly. Undo is available for every draw, recycle, and
card move. The active game is saved on the device.

## Development

```sh
npm install
npm run dev
```

Run the engine tests with `npm test` and create a production build with `npm run build`. The
production output is written to `dist/`.

Service workers require HTTPS in production (localhost is allowed for development). Any static host
that serves `dist/` can deploy the app.

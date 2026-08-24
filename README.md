# Solitaire PWA

A classic Klondike Solitaire game built as a Progressive Web App (PWA) for mobile devices.

## Features

- Standard Klondike rules (draw 3 cards from stock)
- Click to move cards (select a sequence and tap destination)
- Score tracking (10 points per card moved to foundation)
- Restart button
- Offline support via service worker
- Installable as a PWA

## How to run locally

1. Ensure you have Python 3 installed.
2. In the project directory, run:
   ```
   python3 -m http.server 8080
   ```
3. Open your browser and go to `http://localhost:8080`
4. The game should load and be playable.

## PWA features

- Manifest with icons and standalone display
- Service worker caches assets for offline use
- Responsive design for mobile screens

## Notes

- The game uses simple click-to-move interaction:
  - Click the stock to draw cards.
  - Click the waste pile to select the top card.
  - Click a tableau column to select a face-up sequence (cards must be in descending order and alternating colors).
  - Click a foundation or empty tableau to move the selected cards if the move is valid.
- Score increments by 10 for each card moved to a foundation.

Enjoy!
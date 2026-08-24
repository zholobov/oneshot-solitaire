# Solitaire - Klondike Card Game

A classic Klondike Solitaire game built as a Progressive Web App (PWA) for mobile phones.

## Features

- **Classic Klondike Rules**: 7-column tableau, stock/waste piles, 4 foundations
- **Mobile-First Design**: Optimized for phone screens with touch controls
- **PWA Support**: Install to home screen, works offline
- **Game Persistence**: Auto-save progress, resume anytime
- **Undo**: Full undo history (up to 50 moves)
- **Auto-Complete**: Let the computer finish for you
- **Score Tracking**: Points for moves, bonuses for foundation placement
- **Valid Move Highlighting**: See where selected cards can go
- **Confetti Celebration**: Win animation when you complete the game

## How to Play

### Controls
- **Tap** a card to select it (highlighted in gold)
- **Tap** a destination to move the selected card
- **Tap** the stock pile (left) to draw a card
- **Double-tap** a card to auto-move it to a foundation
- **Drag** cards for desktop users

### Rules
- Build tableau columns down in alternating colors (red on black, black on red)
- Only Kings can fill empty tableau columns
- Build foundations up by suit from Ace to King
- Draw 3 cards from stock at a time (standard rule)

### Scoring
- Move card to foundation: +10 points
- Flip face-down card: +5 points
- Draw from empty stock pile: -100 points
- Move from foundation back to tableau: -15 points

## Installation

### iOS (iPhone)
1. Open the game in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"

### Android
1. Open in Chrome
2. Tap the menu (⋮)
3. Tap "Add to Home Screen" or "Install App"

### Desktop
1. Open in any modern browser
2. Works as a web app, no installation needed

## Running Locally

```bash
# Start a local server
npx serve .

# Or use Python
python3 -m http.server 8080

# Or Node
npx http-server -p 8080
```

Then open `http://localhost:8080` in your browser.

## Tech Stack

- **HTML5/CSS3/JavaScript** - No frameworks, pure vanilla
- **Service Worker** - Offline support via cache API
- **localStorage** - Game state persistence
- **CSS Custom Properties** - Dynamic card sizing

## Project Structure

```
├── index.html          # Main game (HTML + CSS + JS)
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
├── icon-192.png       # App icon (192x192)
├── icon-512.png       # App icon (512x512)
├── generate-icons.js  # Icon generation script
└── README.md          # This file
```

## License

MIT

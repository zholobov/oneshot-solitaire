import { Game } from './game.js';
import { createStorage } from './storage.js';
import { UI } from './ui.js';

const storage = createStorage();

let game;
let elapsedMs = 0;
const saved = storage.load();
if (saved) {
  game = saved.game;
  elapsedMs = saved.elapsedMs;
} else {
  game = new Game();
  game.newGame(1);
}

const ui = new UI(document, game, { onAction: afterAction });

function save() {
  storage.save({ game, elapsedMs });
}

function afterAction() {
  ui.render();
  ui.updateHud(game.moves, elapsedMs);
  save();
  if (game.won) {
    ui.showWin(game.moves, elapsedMs);
  }
}

// --- timer ---
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  if (document.visibilityState === 'visible' && game.moves > 0 && !game.won) {
    elapsedMs += now - lastTick;
  }
  lastTick = now;
  ui.updateHud(game.moves, elapsedMs);
}, 500);

document.addEventListener('visibilitychange', () => {
  lastTick = Date.now();
  save();
});

window.addEventListener('resize', () => ui.layoutInstant());

ui.updateHud(game.moves, elapsedMs);
if (game.won) ui.showWin(game.moves, elapsedMs);

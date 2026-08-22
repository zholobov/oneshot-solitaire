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
const drawModeBtn = document.getElementById('btn-draw-mode');

function save() {
  storage.save({ game, elapsedMs });
}

function afterAction() {
  ui.render();
  ui.updateHud(game.moves, elapsedMs);
  save();
  if (game.won) ui.showWin(game.moves, elapsedMs);
  else ui.hideWin();
}

function newGame(drawMode) {
  game.newGame(drawMode);
  elapsedMs = 0;
  ui.setGame(game);
  drawModeBtn.textContent = `Draw ${game.drawMode}`;
  afterAction();
}

// --- buttons ---

document.getElementById('btn-undo').addEventListener('click', () => {
  if (game.undo()) afterAction();
});

document.getElementById('btn-new').addEventListener('click', () => {
  if (game.moves === 0 || game.won || confirm('Start a new game?')) newGame(game.drawMode);
});

drawModeBtn.addEventListener('click', () => {
  const next = game.drawMode === 1 ? 3 : 1;
  const idle = game.moves === 0 || game.won;
  if (idle || confirm(`Switch to Draw ${next}? This starts a new game.`)) newGame(next);
});

document.getElementById('btn-win-new').addEventListener('click', () => newGame(game.drawMode));

document.getElementById('btn-autofinish').addEventListener('click', () => {
  ui.autoFinishBtn.hidden = true;
  ui.inputLocked = true;
  const step = () => {
    if (game.autoFinishStep()) {
      ui.render();
      ui.updateHud(game.moves, elapsedMs);
      setTimeout(step, 120);
    } else {
      ui.inputLocked = false;
      afterAction();
    }
  };
  step();
});

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

// --- boot ---

drawModeBtn.textContent = `Draw ${game.drawMode}`;
ui.updateHud(game.moves, elapsedMs);
if (game.won) ui.showWin(game.moves, elapsedMs);

// Debug/test hook.
window.klondike = { get game() { return game; }, ui };

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Offline support unavailable (e.g. plain HTTP); the game still works.
  });
}

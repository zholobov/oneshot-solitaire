export const APP_TEMPLATE = `
<header class="hud">
  <button id="menu-btn" class="hud-btn" type="button" aria-label="Menu">☰</button>
  <div class="stats"><span id="moves">Moves 0</span><span aria-hidden="true">·</span><span id="time">00:00</span></div>
  <button id="undo-btn" class="hud-btn" type="button" aria-label="Undo" disabled>↶</button>
</header>
<main id="board" class="board" aria-label="Solitaire board"></main>
<button id="auto-finish-btn" class="auto-finish" type="button" hidden>Auto finish</button>
<div id="menu" class="backdrop" hidden>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Menu">
    <h2>Solitaire</h2>
    <button id="new-game-btn" class="sheet-btn" type="button">New game</button>
    <button id="replay-btn" class="sheet-btn" type="button">Replay this deal</button>
    <div class="draw-mode">
      <span>Draw mode</span>
      <div class="segmented">
        <button id="draw-1-btn" type="button" data-draw="1" aria-pressed="true">Draw 1</button>
        <button id="draw-3-btn" type="button" data-draw="3" aria-pressed="false">Draw 3</button>
      </div>
      <small>Changing this starts a new game.</small>
    </div>
    <button id="close-menu-btn" class="sheet-btn secondary" type="button">Close</button>
  </div>
</div>
<div id="win" class="backdrop center" hidden>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="You won">
    <h2>You won! 🎉</h2>
    <p id="win-stats"></p>
    <button id="win-new-game-btn" class="sheet-btn" type="button">New game</button>
  </div>
</div>
`;

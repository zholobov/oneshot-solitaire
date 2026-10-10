import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { GameController, type ChangeReason, type Snapshot } from './app';
import { movingCards, type Action, type GameState } from './engine/game';
import { parseState } from './engine/serialize';
import { findSmartMove } from './engine/smart';
import { BoardView } from './ui/board';
import { Hud } from './ui/hud';
import { attachInput } from './ui/input';
import { localStorageStore } from './ui/storage';
import { APP_TEMPLATE } from './ui/template';

declare global {
  interface Window {
    __solitaire?: {
      getState(): GameState;
      loadState(value: unknown): void;
      dispatch(action: Action): boolean;
    };
  }
}

function boot(): void {
  const app = document.getElementById('app');
  if (app === null) throw new Error('Missing #app');
  app.innerHTML = APP_TEMPLATE;
  const boardEl = app.querySelector<HTMLElement>('#board');
  if (boardEl === null) throw new Error('Missing #board');

  const view = new BoardView(boardEl);
  let hud: Hud | null = null;

  const controller = new GameController({
    storage: localStorageStore(),
    onChange: (snapshot: Snapshot, reason: ChangeReason) => {
      if (reason !== 'tick') view.render(snapshot.state, reason === 'state');
      hud?.update({
        moves: snapshot.state.moves,
        elapsedMs: snapshot.elapsedMs,
        canUndo: snapshot.canUndo,
        canAutoFinish: snapshot.canAutoFinish,
        won: snapshot.won,
        inProgress: snapshot.inProgress,
        drawCount: snapshot.drawCount,
      });
    },
  });

  hud = new Hud(app, {
    onNewGame: () => controller.newGame(),
    onReplay: () => controller.replay(),
    onUndo: () => controller.undo(),
    onSetDrawCount: (drawCount) => controller.setDrawCount(drawCount),
    onAutoFinish: () => void controller.runAutoFinish(),
  });

  attachInput(view, {
    canDrag: (loc, count) => !controller.busy && movingCards(controller.state, loc, count) !== undefined,
    onTapStock: () => {
      if (controller.busy) return;
      const { stock, waste } = controller.state;
      if (stock.length > 0) controller.dispatch({ type: 'draw' });
      else if (waste.length > 0) controller.dispatch({ type: 'recycle' });
    },
    onTapCard: (loc, count, id) => {
      if (controller.busy) return;
      const action = findSmartMove(controller.state, loc, count);
      if (action === null) view.shake(id);
      else controller.dispatch(action);
    },
    onDrop: (from, count, to) => !controller.busy && controller.dispatch({ type: 'move', from, to, count }),
    onDragEnd: () => view.render(controller.state, true),
  });

  controller.start();

  new ResizeObserver(() => view.render(controller.state, false)).observe(boardEl);
  document.addEventListener('visibilitychange', () => controller.setVisible(document.visibilityState === 'visible'));
  window.addEventListener('pagehide', () => controller.save());

  window.__solitaire = {
    getState: () => controller.state,
    loadState: (value) => {
      const state = parseState(value);
      if (state === null) throw new Error('Invalid state');
      controller.loadState(state);
    },
    dispatch: (action) => controller.dispatch(action),
  };
}

boot();

try {
  registerSW({ immediate: true });
} catch (error) {
  console.warn('Service worker registration failed', error);
}

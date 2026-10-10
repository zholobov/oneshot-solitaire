import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameController, HISTORY_LIMIT, type ChangeReason, type Snapshot } from './app';
import { apply, deal, isWon, type GameState } from './engine/game';
import { nextAutoFinishMove } from './engine/smart';
import { fullRunState } from './engine/testing';
import { SAVE_KEY, SETTINGS_KEY, memoryStore } from './ui/storage';

function make(opts: { store?: ReturnType<typeof memoryStore>; now?: () => number } = {}) {
  const store = opts.store ?? memoryStore();
  const events: ChangeReason[] = [];
  let last: Snapshot | null = null;
  const controller = new GameController({
    storage: store,
    onChange: (snap, reason) => {
      events.push(reason);
      last = snap;
    },
    now: opts.now ?? (() => Date.now()),
    randomSeed: () => 777,
    autoFinishDelayMs: 10,
  });
  return { controller, store, events, last: () => last as Snapshot | null };
}

describe('GameController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('starts a new game when nothing is saved and saves it', () => {
    const { controller, store, events } = make();
    controller.start();
    expect(controller.state.moves).toBe(0);
    expect(controller.state.seed).toBe(777);
    expect(events).toEqual(['load']);
    expect(store.get(SAVE_KEY)).not.toBeNull();
  });

  test('resumes a saved game with history and elapsed time', () => {
    const store = memoryStore();
    const base = deal(5, 3);
    const state = apply(base, { type: 'draw' });
    store.set(SAVE_KEY, JSON.stringify({ version: 1, state, history: [base], elapsedMs: 9000 }));
    const { controller } = make({ store });
    controller.start();
    expect(controller.state).toEqual(state);
    expect(controller.snapshot().canUndo).toBe(true);
    expect(controller.elapsedMs).toBe(9000);
  });

  test('starts fresh on garbage or truncated saves (review focus 3)', () => {
    for (const junk of ['not json', '{"version":1,"state":{"stock":[1,2', '{"version":1}', '[]']) {
      const store = memoryStore();
      store.set(SAVE_KEY, junk);
      const { controller } = make({ store });
      expect(() => controller.start()).not.toThrow();
      expect(controller.state.moves).toBe(0);
      expect(controller.snapshot().canUndo).toBe(false);
    }
  });

  test('dispatch applies valid actions, records history, saves; rejects invalid ones', () => {
    const { controller, store, events } = make();
    controller.start();
    expect(controller.dispatch({ type: 'draw' })).toBe(true);
    expect(controller.state.moves).toBe(1);
    expect(controller.snapshot().canUndo).toBe(true);
    expect(JSON.parse(store.get(SAVE_KEY) ?? '{}').state.moves).toBe(1);
    expect(controller.dispatch({ type: 'recycle' })).toBe(false);
    expect(controller.state.moves).toBe(1);
    expect(events).toEqual(['load', 'state']);
  });

  test('undo restores the previous state and stops at the beginning', () => {
    const { controller } = make();
    controller.start();
    const initial = controller.state;
    controller.dispatch({ type: 'draw' });
    expect(controller.undo()).toBe(true);
    expect(controller.state).toEqual(initial);
    expect(controller.undo()).toBe(false);
  });

  test('history is capped', () => {
    const { controller, store } = make();
    controller.start();
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) {
      controller.dispatch(controller.state.stock.length > 0 ? { type: 'draw' } : { type: 'recycle' });
    }
    expect(JSON.parse(store.get(SAVE_KEY) ?? '{}').history).toHaveLength(HISTORY_LIMIT);
  });

  test('newGame, replay and setDrawCount', () => {
    const { controller, store } = make();
    controller.start();
    controller.dispatch({ type: 'draw' });
    controller.newGame(42);
    expect(controller.state.seed).toBe(42);
    expect(controller.state.moves).toBe(0);
    expect(controller.snapshot().canUndo).toBe(false);
    controller.dispatch({ type: 'draw' });
    controller.replay();
    expect(controller.state).toEqual(deal(42, 1));
    controller.setDrawCount(3);
    expect(controller.state.drawCount).toBe(3);
    expect(controller.drawCount).toBe(3);
    expect(JSON.parse(store.get(SETTINGS_KEY) ?? '{}')).toEqual({ drawCount: 3 });
    expect(controller.state.moves).toBe(0);
  });

  test('new controllers honour the saved draw mode', () => {
    const store = memoryStore();
    store.set(SETTINGS_KEY, JSON.stringify({ drawCount: 3 }));
    const { controller } = make({ store });
    controller.start();
    expect(controller.state.drawCount).toBe(3);
  });

  test('timer starts on the first action, pauses when hidden, stops on win (review focus 4)', () => {
    let t = 1000;
    const { controller, events } = make({ now: () => t });
    controller.start();
    t += 5000;
    expect(controller.elapsedMs).toBe(0);
    controller.dispatch({ type: 'draw' });
    t += 3000;
    expect(controller.elapsedMs).toBe(3000);
    controller.setVisible(false);
    t += 10000;
    expect(controller.elapsedMs).toBe(3000);
    controller.setVisible(true);
    t += 2000;
    expect(controller.elapsedMs).toBe(5000);
    vi.advanceTimersByTime(1000);
    expect(events.at(-1)).toBe('tick');
    // win with ordinary moves
    controller.loadState(fullRunState());
    let s: GameState = controller.state;
    while (!isWon(s)) {
      const a = nextAutoFinishMove(s);
      if (a === null) break;
      controller.dispatch(a);
      s = controller.state;
    }
    expect(controller.snapshot().won).toBe(true);
    const atWin = controller.elapsedMs;
    t += 5000;
    expect(controller.elapsedMs).toBe(atWin);
  });

  test('runAutoFinish plays to the win and reports busy meanwhile', async () => {
    const { controller } = make();
    controller.start();
    controller.loadState(fullRunState());
    expect(controller.snapshot().canAutoFinish).toBe(true);
    const run = controller.runAutoFinish();
    expect(controller.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60);
    await run;
    expect(controller.busy).toBe(false);
    expect(controller.snapshot().won).toBe(true);
    expect(controller.state.moves).toBe(52);
  });

  test('undo is refused while auto-finishing; newGame cancels it', async () => {
    const { controller } = make();
    controller.start();
    controller.loadState(fullRunState());
    const run = controller.runAutoFinish();
    expect(controller.undo()).toBe(false);
    controller.newGame(1);
    await vi.advanceTimersByTimeAsync(1000);
    await run;
    expect(controller.state.moves).toBe(0);
    expect(controller.busy).toBe(false);
  });
});

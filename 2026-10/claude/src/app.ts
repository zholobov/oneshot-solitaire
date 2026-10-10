import { apply, deal, isWon, validate, type Action, type DrawCount, type GameState } from './engine/game';
import { randomSeed as defaultRandomSeed } from './engine/rng';
import { parseJson, parseSave, parseSettings, SAVE_VERSION, type SaveFile, type Settings } from './engine/serialize';
import { canAutoFinish, nextAutoFinishMove } from './engine/smart';
import { SAVE_KEY, SETTINGS_KEY, type KeyValueStore } from './ui/storage';

export type ChangeReason = 'load' | 'state' | 'tick';

export interface Snapshot {
  state: GameState;
  canUndo: boolean;
  elapsedMs: number;
  won: boolean;
  canAutoFinish: boolean;
  /** A game has started and is not yet won (used for confirmations). */
  inProgress: boolean;
  drawCount: DrawCount;
  busy: boolean;
}

export interface ControllerOptions {
  storage: KeyValueStore;
  onChange: (snapshot: Snapshot, reason: ChangeReason) => void;
  now?: () => number;
  randomSeed?: () => number;
  autoFinishDelayMs?: number;
}

export const HISTORY_LIMIT = 500;

/** Owns the current game, its undo history, autosave, the clock and the auto-finish runner. */
export class GameController {
  state: GameState;
  private history: GameState[] = [];
  private settings: Settings;
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private visible = true;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private autoFinishing = false;
  private readonly now: () => number;
  private readonly nextSeed: () => number;

  constructor(private readonly opts: ControllerOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.nextSeed = opts.randomSeed ?? defaultRandomSeed;
    this.settings = parseSettings(parseJson(opts.storage.get(SETTINGS_KEY)));
    this.state = deal(this.nextSeed(), this.settings.drawCount);
  }

  /** Loads the saved game (or deals a new one), then emits 'load'. */
  start(): void {
    const save = parseSave(parseJson(this.opts.storage.get(SAVE_KEY)));
    if (save !== null) {
      this.state = save.state;
      this.history = save.history;
      this.accumulatedMs = save.elapsedMs;
    } else {
      this.state = deal(this.nextSeed(), this.settings.drawCount);
      this.history = [];
      this.accumulatedMs = 0;
    }
    this.syncTimer();
    this.emit('load');
    this.save();
  }

  get drawCount(): DrawCount {
    return this.settings.drawCount;
  }

  get elapsedMs(): number {
    return this.accumulatedMs + (this.runningSince === null ? 0 : this.now() - this.runningSince);
  }

  get busy(): boolean {
    return this.autoFinishing;
  }

  snapshot(): Snapshot {
    const won = isWon(this.state);
    return {
      state: this.state,
      canUndo: this.history.length > 0 && !this.autoFinishing,
      elapsedMs: this.elapsedMs,
      won,
      canAutoFinish: canAutoFinish(this.state) && !this.autoFinishing,
      inProgress: this.state.moves > 0 && !won,
      drawCount: this.settings.drawCount,
      busy: this.autoFinishing,
    };
  }

  dispatch(action: Action): boolean {
    if (validate(this.state, action) !== null) return false;
    this.history.push(this.state);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
    this.state = apply(this.state, action);
    this.afterChange();
    return true;
  }

  undo(): boolean {
    if (this.autoFinishing) return false;
    const previous = this.history.pop();
    if (previous === undefined) return false;
    this.state = previous;
    this.afterChange();
    return true;
  }

  newGame(seed: number = this.nextSeed(), drawCount: DrawCount = this.settings.drawCount): void {
    this.cancelAutoFinish();
    this.resetClock();
    this.state = deal(seed, drawCount);
    this.history = [];
    this.afterChange();
  }

  replay(): void {
    this.newGame(this.state.seed, this.state.drawCount);
  }

  setDrawCount(drawCount: DrawCount): void {
    this.settings = { drawCount };
    this.opts.storage.set(SETTINGS_KEY, JSON.stringify(this.settings));
    this.newGame(this.nextSeed(), drawCount);
  }

  /** Replaces the current game (debug/testing hook). */
  loadState(state: GameState): void {
    this.cancelAutoFinish();
    this.resetClock();
    this.state = state;
    this.history = [];
    this.afterChange();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncTimer();
    if (!visible) this.save();
  }

  async runAutoFinish(): Promise<void> {
    if (this.autoFinishing || !canAutoFinish(this.state)) return;
    this.autoFinishing = true;
    this.emit('state');
    try {
      while (this.autoFinishing) {
        const action = nextAutoFinishMove(this.state);
        if (action === null) break;
        this.dispatch(action);
        await new Promise<void>((resolve) => setTimeout(resolve, this.opts.autoFinishDelayMs ?? 120));
      }
    } finally {
      this.autoFinishing = false;
      this.emit('state');
    }
  }

  cancelAutoFinish(): void {
    this.autoFinishing = false;
  }

  save(): void {
    const file: SaveFile = { version: SAVE_VERSION, state: this.state, history: this.history, elapsedMs: this.elapsedMs };
    this.opts.storage.set(SAVE_KEY, JSON.stringify(file));
  }

  private resetClock(): void {
    this.accumulatedMs = 0;
    if (this.runningSince !== null) this.runningSince = this.now();
  }

  private afterChange(): void {
    this.syncTimer();
    this.emit('state');
    this.save();
  }

  private emit(reason: ChangeReason): void {
    this.opts.onChange(this.snapshot(), reason);
  }

  private syncTimer(): void {
    const shouldRun = this.visible && this.state.moves > 0 && !isWon(this.state);
    if (shouldRun && this.runningSince === null) {
      this.runningSince = this.now();
      this.ticker = setInterval(() => this.emit('tick'), 1000);
    } else if (!shouldRun && this.runningSince !== null) {
      this.accumulatedMs += this.now() - this.runningSince;
      this.runningSince = null;
      if (this.ticker !== null) clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}

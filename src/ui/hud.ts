import type { DrawCount } from '../engine/game';

export interface HudHandlers {
  onNewGame(): void;
  onReplay(): void;
  onUndo(): void;
  onSetDrawCount(drawCount: DrawCount): void;
  onAutoFinish(): void;
}

export interface HudInfo {
  moves: number;
  elapsedMs: number;
  canUndo: boolean;
  canAutoFinish: boolean;
  won: boolean;
  /** A game has started and is not won: discarding it needs confirmation. */
  inProgress: boolean;
  drawCount: DrawCount;
}

export const CONFIRM_MS = 3000;

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Makes a button ask for a second tap (within CONFIRM_MS) whenever `needsConfirm()` is true.
 * Returns a function that cancels a pending confirmation.
 */
export function confirmable(button: HTMLElement, needsConfirm: () => boolean, action: () => void): () => void {
  const label = button.textContent ?? '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const disarm = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    button.textContent = label;
    button.classList.remove('armed');
  };
  button.addEventListener('click', () => {
    if (timer !== null || !needsConfirm()) {
      disarm();
      action();
      return;
    }
    button.textContent = 'Tap again to confirm';
    button.classList.add('armed');
    timer = setTimeout(disarm, CONFIRM_MS);
  });
  return disarm;
}

/** Header stats and buttons, the menu sheet, the auto-finish button and the win overlay. */
export class Hud {
  private info: HudInfo = { moves: 0, elapsedMs: 0, canUndo: false, canAutoFinish: false, won: false, inProgress: false, drawCount: 1 };
  private readonly movesEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly autoFinishBtn: HTMLButtonElement;
  private readonly menuEl: HTMLElement;
  private readonly winEl: HTMLElement;
  private readonly winStatsEl: HTMLElement;
  private readonly drawButtons: HTMLButtonElement[] = [];
  private readonly disarmAll: (() => void)[] = [];
  private winDismissed = false;

  constructor(root: HTMLElement, handlers: HudHandlers) {
    const q = <T extends HTMLElement>(selector: string): T => {
      const el = root.querySelector<T>(selector);
      if (el === null) throw new Error(`Missing element ${selector}`);
      return el;
    };
    this.movesEl = q('#moves');
    this.timeEl = q('#time');
    this.undoBtn = q<HTMLButtonElement>('#undo-btn');
    this.autoFinishBtn = q<HTMLButtonElement>('#auto-finish-btn');
    this.menuEl = q('#menu');
    this.winEl = q('#win');
    this.winStatsEl = q('#win-stats');

    q('#menu-btn').addEventListener('click', () => this.openMenu());
    q('#close-menu-btn').addEventListener('click', () => this.closeMenu());
    this.menuEl.addEventListener('click', (e) => {
      if (e.target === this.menuEl) this.closeMenu();
    });
    this.winEl.addEventListener('click', (e) => {
      if (e.target === this.winEl) {
        this.winDismissed = true;
        this.winEl.hidden = true;
      }
    });
    this.undoBtn.addEventListener('click', () => handlers.onUndo());
    this.autoFinishBtn.addEventListener('click', () => handlers.onAutoFinish());
    q('#win-new-game-btn').addEventListener('click', () => handlers.onNewGame());

    const inProgress = (): boolean => this.info.inProgress;
    this.disarmAll.push(
      confirmable(q('#new-game-btn'), inProgress, () => {
        this.closeMenu();
        handlers.onNewGame();
      }),
    );
    this.disarmAll.push(
      confirmable(q('#replay-btn'), inProgress, () => {
        this.closeMenu();
        handlers.onReplay();
      }),
    );
    for (const n of [1, 3] as const) {
      const btn = q<HTMLButtonElement>(`#draw-${n}-btn`);
      this.drawButtons.push(btn);
      this.disarmAll.push(
        confirmable(
          btn,
          () => inProgress() && this.info.drawCount !== n,
          () => {
            if (this.info.drawCount === n) return;
            this.closeMenu();
            handlers.onSetDrawCount(n);
          },
        ),
      );
    }
  }

  update(info: HudInfo): void {
    this.info = info;
    this.movesEl.textContent = `Moves ${info.moves}`;
    this.timeEl.textContent = formatTime(info.elapsedMs);
    this.undoBtn.disabled = !info.canUndo;
    this.autoFinishBtn.hidden = !info.canAutoFinish;
    for (const btn of this.drawButtons) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.draw) === info.drawCount));
    }
    if (!info.won) this.winDismissed = false;
    this.winEl.hidden = !info.won || this.winDismissed;
    if (info.won) this.winStatsEl.textContent = `${info.moves} moves · ${formatTime(info.elapsedMs)}`;
  }

  openMenu(): void {
    this.menuEl.hidden = false;
  }

  closeMenu(): void {
    this.menuEl.hidden = true;
    for (const disarm of this.disarmAll) disarm();
  }
}

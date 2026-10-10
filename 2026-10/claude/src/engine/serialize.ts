import { DECK_SIZE } from './cards';
import { FOUNDATION_COUNT, TABLEAU_COUNT, type DrawCount, type GameState } from './game';

export const SAVE_VERSION = 1 as const;

export interface SaveFile {
  version: typeof SAVE_VERSION;
  state: GameState;
  history: GameState[];
  elapsedMs: number;
}

export interface Settings {
  drawCount: DrawCount;
}

export const DEFAULT_SETTINGS: Settings = { drawCount: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCardList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((c) => Number.isInteger(c) && c >= 0 && c < DECK_SIZE);
}

function isPileList(value: unknown, count: number): value is number[][] {
  return Array.isArray(value) && value.length === count && value.every(isCardList);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Validates untrusted data (e.g. from localStorage) as a structurally sound game state. */
export function parseState(value: unknown): GameState | null {
  if (!isRecord(value)) return null;
  const { seed, drawCount, stock, waste, wasteFan, foundations, tableau, faceUp, moves } = value;
  if (typeof seed !== 'number' || !Number.isInteger(seed)) return null;
  if (drawCount !== 1 && drawCount !== 3) return null;
  if (!isCardList(stock) || !isCardList(waste)) return null;
  if (!isPileList(foundations, FOUNDATION_COUNT) || !isPileList(tableau, TABLEAU_COUNT)) return null;
  if (!Array.isArray(faceUp) || faceUp.length !== TABLEAU_COUNT || !faceUp.every(isCount)) return null;
  if (!isCount(wasteFan) || wasteFan > waste.length) return null;
  if (!isCount(moves)) return null;
  const faceUpCounts = faceUp as number[];
  for (let i = 0; i < TABLEAU_COUNT; i++) {
    const length = tableau[i]?.length ?? 0;
    const up = faceUpCounts[i] ?? 0;
    if (up > length || (length > 0 && up < 1)) return null;
  }
  const all = [...stock, ...waste, ...foundations.flat(), ...tableau.flat()];
  if (all.length !== DECK_SIZE || new Set(all).size !== DECK_SIZE) return null;
  return { seed, drawCount, stock, waste, wasteFan, foundations, tableau, faceUp: faceUpCounts, moves };
}

export function parseSave(value: unknown): SaveFile | null {
  if (!isRecord(value) || value.version !== SAVE_VERSION) return null;
  const state = parseState(value.state);
  if (state === null) return null;
  if (!Array.isArray(value.history)) return null;
  const history: GameState[] = [];
  for (const entry of value.history) {
    const parsed = parseState(entry);
    if (parsed === null) return null;
    history.push(parsed);
  }
  const elapsed = value.elapsedMs;
  const elapsedMs = typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
  return { version: SAVE_VERSION, state, history, elapsedMs };
}

export function parseSettings(value: unknown): Settings {
  if (isRecord(value) && (value.drawCount === 1 || value.drawCount === 3)) return { drawCount: value.drawCount };
  return { ...DEFAULT_SETTINGS };
}

export function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

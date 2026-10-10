/**
 * Test fixtures shared by unit tests. Not imported by production code.
 */
import { DECK_SIZE, cardId } from './cards';
import type { GameState } from './game';

type FixtureParts = Partial<Pick<GameState, 'waste' | 'wasteFan' | 'foundations' | 'tableau' | 'faceUp' | 'drawCount'>>;

/** Builds a state from the given piles; every unmentioned card goes face-down into the stock. */
export function fixture(parts: FixtureParts): GameState {
  const tableau = parts.tableau ?? [[], [], [], [], [], [], []];
  const foundations = parts.foundations ?? [[], [], [], []];
  const waste = parts.waste ?? [];
  const used = new Set([...waste, ...foundations.flat(), ...tableau.flat()]);
  const stock = Array.from({ length: DECK_SIZE }, (_, i) => i).filter((id) => !used.has(id));
  return {
    seed: 0,
    drawCount: parts.drawCount ?? 1,
    stock,
    waste,
    wasteFan: parts.wasteFan ?? (waste.length > 0 ? 1 : 0),
    foundations,
    tableau,
    faceUp: parts.faceUp ?? tableau.map((c) => (c.length > 0 ? 1 : 0)),
    moves: 0,
  };
}

export const S = (rank: number) => cardId(0, rank); // spades
export const H = (rank: number) => cardId(1, rank); // hearts
export const D = (rank: number) => cardId(2, rank); // diamonds
export const C = (rank: number) => cardId(3, rank); // clubs

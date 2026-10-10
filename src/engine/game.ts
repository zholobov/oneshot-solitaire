import { DECK_SIZE, isRed, rankOf, suitOf, type CardId } from './cards';
import { mulberry32, shuffle } from './rng';

export type DrawCount = 1 | 3;

export type Loc =
  | { pile: 'waste' }
  | { pile: 'foundation'; index: number }
  | { pile: 'tableau'; index: number };

export type Action =
  | { type: 'draw' }
  | { type: 'recycle' }
  | { type: 'move'; from: Loc; to: Loc; count: number };

export interface GameState {
  readonly seed: number;
  readonly drawCount: DrawCount;
  /** Face-down stock; the last element is the top card. */
  readonly stock: readonly CardId[];
  /** Face-up waste; the last element is the top card. */
  readonly waste: readonly CardId[];
  /** How many top waste cards are fanned out (Draw 3 display). */
  readonly wasteFan: number;
  /** Four foundation piles, last element on top. */
  readonly foundations: ReadonlyArray<readonly CardId[]>;
  /** Seven columns, index 0 is the deepest card. */
  readonly tableau: ReadonlyArray<readonly CardId[]>;
  /** Per column: how many cards at the top are face-up. */
  readonly faceUp: readonly number[];
  /** Number of applied actions. */
  readonly moves: number;
}

export const FOUNDATION_COUNT = 4;
export const TABLEAU_COUNT = 7;
export const KING = 13;
export const ACE = 1;

export function deal(seed: number, drawCount: DrawCount): GameState {
  const deck = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i), mulberry32(seed));
  const tableau: CardId[][] = Array.from({ length: TABLEAU_COUNT }, () => []);
  let next = 0;
  for (let row = 0; row < TABLEAU_COUNT; row++) {
    for (let col = row; col < TABLEAU_COUNT; col++) {
      tableau[col]?.push(deck[next++] as CardId);
    }
  }
  return {
    seed,
    drawCount,
    stock: deck.slice(next),
    waste: [],
    wasteFan: 0,
    foundations: [[], [], [], []],
    tableau,
    faceUp: tableau.map(() => 1),
    moves: 0,
  };
}

export function topCard(pile: readonly CardId[]): CardId | undefined {
  return pile[pile.length - 1];
}

export function sameLoc(a: Loc, b: Loc): boolean {
  if (a.pile !== b.pile) return false;
  if (a.pile === 'waste' || b.pile === 'waste') return true;
  return a.index === b.index;
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}

/** Every card id in the state, in no particular order. */
export function allCardsOf(state: GameState): CardId[] {
  return [...state.stock, ...state.waste, ...state.foundations.flat(), ...state.tableau.flat()];
}

export function canStackOnTableau(card: CardId, onto: CardId): boolean {
  return isRed(card) !== isRed(onto) && rankOf(card) === rankOf(onto) - 1;
}

export function canPlaceOnFoundation(card: CardId, pile: readonly CardId[]): boolean {
  const top = topCard(pile);
  if (top === undefined) return rankOf(card) === ACE;
  return suitOf(top) === suitOf(card) && rankOf(card) === rankOf(top) + 1;
}

/** True when the cards (bottom first) form a descending, alternating-colour run. */
export function isValidRun(cards: readonly CardId[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (!canStackOnTableau(cards[i] as CardId, cards[i - 1] as CardId)) return false;
  }
  return true;
}

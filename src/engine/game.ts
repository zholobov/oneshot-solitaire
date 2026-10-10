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

export function validate(state: GameState, action: Action): string | null {
  switch (action.type) {
    case 'draw':
      return state.stock.length > 0 ? null : 'stock is empty';
    case 'recycle':
      if (state.stock.length > 0) return 'stock is not empty';
      return state.waste.length > 0 ? null : 'waste is empty';
    case 'move':
      return validateMove(state, action);
  }
}

export function apply(state: GameState, action: Action): GameState {
  const problem = validate(state, action);
  if (problem !== null) throw new Error(`Invalid action ${action.type}: ${problem}`);
  switch (action.type) {
    case 'draw': {
      const k = Math.min(state.drawCount, state.stock.length);
      const drawn = state.stock.slice(state.stock.length - k).reverse();
      return {
        ...state,
        stock: state.stock.slice(0, state.stock.length - k),
        waste: [...state.waste, ...drawn],
        wasteFan: k,
        moves: state.moves + 1,
      };
    }
    case 'recycle':
      return { ...state, stock: [...state.waste].reverse(), waste: [], wasteFan: 0, moves: state.moves + 1 };
    case 'move':
      return applyMove(state, action);
  }
}

/** The cards that would move for `from`/`count`, bottom first; undefined if the location cannot supply them. */
export function movingCards(state: GameState, from: Loc, count: number): readonly CardId[] | undefined {
  if (!Number.isInteger(count) || count < 1) return undefined;
  switch (from.pile) {
    case 'waste':
      return count === 1 && state.waste.length > 0 ? state.waste.slice(-1) : undefined;
    case 'foundation': {
      const pile = state.foundations[from.index];
      return pile !== undefined && count === 1 && pile.length > 0 ? pile.slice(-1) : undefined;
    }
    case 'tableau': {
      const col = state.tableau[from.index];
      const up = state.faceUp[from.index];
      if (col === undefined || up === undefined || count > up) return undefined;
      return col.slice(col.length - count);
    }
  }
}

function validateMove(state: GameState, { from, to, count }: Extract<Action, { type: 'move' }>): string | null {
  if (sameLoc(from, to)) return 'source and destination are the same';
  const cards = movingCards(state, from, count);
  if (cards === undefined) return 'no such cards to move';
  if (!isValidRun(cards)) return 'cards are not a valid run';
  const bottom = cards[0] as CardId;
  if (to.pile === 'foundation') {
    if (from.pile === 'foundation') return 'cannot move between foundations';
    const pile = state.foundations[to.index];
    if (pile === undefined) return 'no such foundation';
    if (cards.length !== 1) return 'only one card may go to a foundation';
    return canPlaceOnFoundation(bottom, pile) ? null : 'card does not fit on foundation';
  }
  if (to.pile === 'tableau') {
    const col = state.tableau[to.index];
    if (col === undefined) return 'no such column';
    const top = topCard(col);
    if (top === undefined) return rankOf(bottom) === KING ? null : 'only a king may go to an empty column';
    return canStackOnTableau(bottom, top) ? null : 'card does not fit on column';
  }
  return 'cannot move cards there';
}

function applyMove(state: GameState, { from, to, count }: Extract<Action, { type: 'move' }>): GameState {
  const cards = movingCards(state, from, count) ?? [];
  const foundations = state.foundations.map((pile) => pile.slice());
  const tableau = state.tableau.map((col) => col.slice());
  const faceUp = state.faceUp.slice();
  const waste = state.waste.slice();
  let wasteFan = state.wasteFan;

  switch (from.pile) {
    case 'waste':
      waste.pop();
      wasteFan = Math.max(0, wasteFan - 1);
      break;
    case 'foundation':
      foundations[from.index]?.pop();
      break;
    case 'tableau': {
      const col = tableau[from.index] ?? [];
      col.length -= count;
      const up = (faceUp[from.index] ?? 0) - count;
      faceUp[from.index] = up === 0 && col.length > 0 ? 1 : up;
      break;
    }
  }

  if (to.pile === 'foundation') {
    foundations[to.index]?.push(...cards);
  } else if (to.pile === 'tableau') {
    tableau[to.index]?.push(...cards);
    faceUp[to.index] = (faceUp[to.index] ?? 0) + count;
  }

  return { ...state, waste, wasteFan, foundations, tableau, faceUp, moves: state.moves + 1 };
}

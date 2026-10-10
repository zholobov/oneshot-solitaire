import { rankOf, type CardId } from './cards';
import { FOUNDATION_COUNT, KING, TABLEAU_COUNT, isWon, movingCards, topCard, validate, type Action, type GameState, type Loc } from './game';

/**
 * Best destination for a tapped card/run: a foundation first (single cards only), then the
 * leftmost non-empty column that accepts it, then an empty column (kings only, and never for a
 * king that is already at the bottom of its own column).
 */
export function findSmartMove(state: GameState, from: Loc, count: number): Action | null {
  const cards = movingCards(state, from, count);
  if (cards === undefined) return null;
  const bottom = cards[0] as CardId;
  const candidates: Loc[] = [];
  if (count === 1 && from.pile !== 'foundation') {
    for (let i = 0; i < FOUNDATION_COUNT; i++) candidates.push({ pile: 'foundation', index: i });
  }
  const sourceColumn = from.pile === 'tableau' ? from.index : -1;
  const kingAtBottom = from.pile === 'tableau' && (state.tableau[from.index]?.length ?? 0) === count;
  const empties: Loc[] = [];
  for (let i = 0; i < TABLEAU_COUNT; i++) {
    if (i === sourceColumn) continue;
    if ((state.tableau[i]?.length ?? 0) > 0) candidates.push({ pile: 'tableau', index: i });
    else if (rankOf(bottom) === KING && !kingAtBottom) empties.push({ pile: 'tableau', index: i });
  }
  candidates.push(...empties);
  for (const to of candidates) {
    const action: Action = { type: 'move', from, to, count };
    if (validate(state, action) === null) return action;
  }
  return null;
}

/** True when the rest of the game is mechanical: nothing hidden, nothing left in stock or waste. */
export function canAutoFinish(state: GameState): boolean {
  if (isWon(state)) return false;
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  return state.tableau.every((col, i) => col.length === (state.faceUp[i] ?? 0));
}

/** The next auto-finish step: the lowest-ranked column top that a foundation accepts. */
export function nextAutoFinishMove(state: GameState): Action | null {
  let best: Action | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (let i = 0; i < TABLEAU_COUNT; i++) {
    const top = topCard(state.tableau[i] ?? []);
    if (top === undefined || rankOf(top) >= bestRank) continue;
    for (let f = 0; f < FOUNDATION_COUNT; f++) {
      const action: Action = { type: 'move', from: { pile: 'tableau', index: i }, to: { pile: 'foundation', index: f }, count: 1 };
      if (validate(state, action) === null) {
        best = action;
        bestRank = rankOf(top);
        break;
      }
    }
  }
  return best;
}

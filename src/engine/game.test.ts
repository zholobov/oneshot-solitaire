import { describe, expect, test } from 'vitest';
import { DECK_SIZE, cardId } from './cards';
import { allCardsOf, apply, deal, isValidRun, isWon, movingCards, sameLoc, validate, type Action, type GameState, type Loc } from './game';
import { mulberry32 } from './rng';
import { C, D, H, S, fixture } from './testing';

describe('deal', () => {
  test('deals 7 columns of 1..7 cards, 24 in stock, one face-up per column', () => {
    const s = deal(123, 1);
    expect(s.tableau.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.faceUp).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toEqual([]);
    expect(s.wasteFan).toBe(0);
    expect(s.foundations).toEqual([[], [], [], []]);
    expect(s.moves).toBe(0);
    expect(s.seed).toBe(123);
    expect(s.drawCount).toBe(1);
  });

  test('uses every card exactly once', () => {
    const all = allCardsOf(deal(5, 3));
    expect(all).toHaveLength(DECK_SIZE);
    expect(new Set(all).size).toBe(DECK_SIZE);
  });

  test('is deterministic per seed', () => {
    expect(deal(9, 1)).toEqual(deal(9, 1));
    expect(deal(9, 1).stock).not.toEqual(deal(10, 1).stock);
  });
});

describe('isWon / sameLoc', () => {
  test('won only when all foundations hold 13 cards', () => {
    const full = (suit: 0 | 1 | 2 | 3) => Array.from({ length: 13 }, (_, i) => cardId(suit, i + 1));
    const won: GameState = {
      seed: 1,
      drawCount: 1,
      stock: [],
      waste: [],
      wasteFan: 0,
      foundations: [full(0), full(1), full(2), full(3)],
      tableau: [[], [], [], [], [], [], []],
      faceUp: [0, 0, 0, 0, 0, 0, 0],
      moves: 100,
    };
    expect(isWon(won)).toBe(true);
    expect(isWon(deal(1, 1))).toBe(false);
  });

  test('sameLoc compares pile and index', () => {
    expect(sameLoc({ pile: 'waste' }, { pile: 'waste' })).toBe(true);
    expect(sameLoc({ pile: 'tableau', index: 2 }, { pile: 'tableau', index: 2 })).toBe(true);
    expect(sameLoc({ pile: 'tableau', index: 2 }, { pile: 'tableau', index: 3 })).toBe(false);
    expect(sameLoc({ pile: 'tableau', index: 2 }, { pile: 'foundation', index: 2 })).toBe(false);
  });
});

describe('draw and recycle', () => {
  test('draw 1 moves the top stock card to the waste', () => {
    const s = deal(1, 1);
    const top = s.stock[s.stock.length - 1];
    const n = apply(s, { type: 'draw' });
    expect(n.stock).toHaveLength(23);
    expect(n.waste).toEqual([top]);
    expect(n.wasteFan).toBe(1);
    expect(n.moves).toBe(1);
    expect(s.waste).toEqual([]); // input untouched
  });

  test('draw 3 draws three cards, the third drawn ends on top', () => {
    const s = deal(1, 3);
    const [a, b, c] = s.stock.slice(-3); // a is deepest of the three, c is the stock top
    const n = apply(s, { type: 'draw' });
    expect(n.stock).toHaveLength(21);
    expect(n.waste).toEqual([c, b, a]);
    expect(n.wasteFan).toBe(3);
  });

  test('draw 3 with fewer than three cards left draws only those (review focus 5)', () => {
    let s = deal(1, 3);
    for (let i = 0; i < 8; i++) s = apply(s, { type: 'draw' });
    expect(s.stock).toHaveLength(0);
    expect(s.waste).toHaveLength(24);
    const two: GameState = { ...deal(1, 3), stock: [5, 6], waste: [], wasteFan: 0 };
    const n = apply(two, { type: 'draw' });
    expect(n.stock).toEqual([]);
    expect(n.waste).toEqual([6, 5]);
    expect(n.wasteFan).toBe(2);
  });

  test('draw on an empty stock is invalid', () => {
    const s: GameState = { ...deal(1, 1), stock: [], waste: [3] };
    expect(validate(s, { type: 'draw' })).toBe('stock is empty');
    expect(() => apply(s, { type: 'draw' })).toThrow();
  });

  test('recycle turns the waste over into the stock; the first-drawn card is drawn first again', () => {
    let s = deal(1, 1);
    const order: number[] = [];
    for (let i = 0; i < 24; i++) {
      s = apply(s, { type: 'draw' });
      order.push(s.waste[s.waste.length - 1] as number);
    }
    expect(validate(s, { type: 'recycle' })).toBeNull();
    const r = apply(s, { type: 'recycle' });
    expect(r.waste).toEqual([]);
    expect(r.wasteFan).toBe(0);
    expect(r.stock).toHaveLength(24);
    expect(r.moves).toBe(25);
    const again = apply(r, { type: 'draw' });
    expect(again.waste).toEqual([order[0]]);
  });

  test('recycle is invalid while the stock has cards or the waste is empty', () => {
    expect(validate(deal(1, 1), { type: 'recycle' })).toBe('stock is not empty');
    const empty: GameState = { ...deal(1, 1), stock: [], waste: [] };
    expect(validate(empty, { type: 'recycle' })).toBe('waste is empty');
  });
});

const W = { pile: 'waste' } as const;
const F = (index: number) => ({ pile: 'foundation', index }) as const;
const T = (index: number) => ({ pile: 'tableau', index }) as const;
const mv = (from: Loc, to: Loc, count = 1): Action => ({ type: 'move', from, to, count });

describe('moves to foundation', () => {
  test('an ace goes to an empty foundation; other ranks do not', () => {
    expect(validate(fixture({ waste: [S(1)] }), mv(W, F(0)))).toBeNull();
    expect(validate(fixture({ waste: [S(2)] }), mv(W, F(0)))).toBe('card does not fit on foundation');
  });

  test('builds up by suit', () => {
    const s = fixture({ foundations: [[S(1)], [], [], []], waste: [S(2)] });
    expect(validate(s, mv(W, F(0)))).toBeNull();
    expect(validate(fixture({ foundations: [[S(1)], [], [], []], waste: [H(2)] }), mv(W, F(0)))).toBe('card does not fit on foundation');
    expect(validate(fixture({ foundations: [[S(1)], [], [], []], waste: [S(3)] }), mv(W, F(0)))).toBe('card does not fit on foundation');
    const n = apply(s, mv(W, F(0)));
    expect(n.foundations[0]).toEqual([S(1), S(2)]);
    expect(n.waste).toEqual([]);
    expect(n.moves).toBe(1);
  });

  test('only single cards go to a foundation', () => {
    const s = fixture({ tableau: [[S(2), H(1)], [], [], [], [], [], []], faceUp: [2, 0, 0, 0, 0, 0, 0] });
    expect(validate(s, mv(T(0), F(0), 2))).toBe('only one card may go to a foundation');
    expect(validate(s, mv(T(0), F(0), 1))).toBeNull();
  });

  test('foundation to foundation is never allowed', () => {
    const s = fixture({ foundations: [[S(1)], [], [], []] });
    expect(validate(s, mv(F(0), F(1)))).toBe('cannot move between foundations');
  });
});

describe('moves to tableau', () => {
  test('alternating colour, one rank lower', () => {
    expect(validate(fixture({ tableau: [[S(6)], [], [], [], [], [], []], waste: [H(5)] }), mv(W, T(0)))).toBeNull();
    expect(validate(fixture({ tableau: [[S(6)], [], [], [], [], [], []], waste: [C(5)] }), mv(W, T(0)))).toBe('card does not fit on column');
    expect(validate(fixture({ tableau: [[S(6)], [], [], [], [], [], []], waste: [H(6)] }), mv(W, T(0)))).toBe('card does not fit on column');
    expect(validate(fixture({ tableau: [[S(6)], [], [], [], [], [], []], waste: [H(7)] }), mv(W, T(0)))).toBe('card does not fit on column');
  });

  test('only kings go to empty columns', () => {
    expect(validate(fixture({ waste: [S(13)] }), mv(W, T(3)))).toBeNull();
    expect(validate(fixture({ waste: [S(12)] }), mv(W, T(3)))).toBe('only a king may go to an empty column');
  });

  test('moves a run between columns and increases the destination face-up count', () => {
    const s = fixture({ tableau: [[D(9), C(8), H(7)], [S(10)], [], [], [], [], []], faceUp: [3, 1, 0, 0, 0, 0, 0] });
    expect(validate(s, mv(T(0), T(1), 3))).toBeNull();
    const n = apply(s, mv(T(0), T(1), 3));
    expect(n.tableau[1]).toEqual([S(10), D(9), C(8), H(7)]);
    expect(n.faceUp[1]).toBe(4);
    expect(n.tableau[0]).toEqual([]);
    expect(n.faceUp[0]).toBe(0);
  });

  test('part of a run can move', () => {
    const s = fixture({ tableau: [[D(9), C(8), H(7)], [H(9)], [], [], [], [], []], faceUp: [3, 1, 0, 0, 0, 0, 0] });
    expect(validate(s, mv(T(0), T(1), 2))).toBeNull();
    expect(apply(s, mv(T(0), T(1), 2)).tableau[1]).toEqual([H(9), C(8), H(7)]);
  });

  test('cannot move face-down cards, zero cards, or to the same column', () => {
    const s = fixture({ tableau: [[D(9), C(8), H(7)], [S(10)], [], [], [], [], []], faceUp: [2, 1, 0, 0, 0, 0, 0] });
    expect(validate(s, mv(T(0), T(1), 3))).toBe('no such cards to move');
    expect(validate(s, mv(T(0), T(1), 0))).toBe('no such cards to move');
    expect(validate(s, mv(T(0), T(0), 1))).toBe('source and destination are the same');
    expect(validate(s, mv(T(5), T(1), 1))).toBe('no such cards to move');
  });

  test('a corrupt face-up run is rejected defensively', () => {
    const s = fixture({ tableau: [[S(5), S(4)], [H(6)], [], [], [], [], []], faceUp: [2, 1, 0, 0, 0, 0, 0] });
    expect(validate(s, mv(T(0), T(1), 2))).toBe('cards are not a valid run');
  });

  test('auto-flips the newly exposed card', () => {
    const s = fixture({ tableau: [[S(5), H(9), C(8)], [S(10)], [], [], [], [], []], faceUp: [2, 1, 0, 0, 0, 0, 0] });
    const n = apply(s, mv(T(0), T(1), 2));
    expect(n.tableau[0]).toEqual([S(5)]);
    expect(n.faceUp[0]).toBe(1);
    expect(n.tableau[1]).toEqual([S(10), H(9), C(8)]);
  });

  test('foundation cards can come back to the tableau', () => {
    const s = fixture({ foundations: [[], [H(1), H(2), H(3), H(4), H(5)], [], []], tableau: [[S(6)], [], [], [], [], [], []] });
    expect(validate(s, mv(F(1), T(0)))).toBeNull();
    const n = apply(s, mv(F(1), T(0)));
    expect(n.foundations[1]).toEqual([H(1), H(2), H(3), H(4)]);
    expect(n.tableau[0]).toEqual([S(6), H(5)]);
    expect(n.faceUp[0]).toBe(2);
  });

  test('nothing can be moved onto the waste; moving from the waste shrinks the fan', () => {
    const s = fixture({ waste: [S(3), H(2), C(13)], wasteFan: 3, drawCount: 3 });
    expect(validate(s, mv(F(0), W))).toBe('no such cards to move');
    expect(validate(s, mv(T(0), W))).toBe('no such cards to move');
    expect(validate(s, mv(W, W))).toBe('source and destination are the same');
    const n = apply(s, mv(W, T(2)));
    expect(n.waste).toEqual([S(3), H(2)]);
    expect(n.wasteFan).toBe(2);
    expect(movingCards(n, W, 1)).toEqual([H(2)]);
  });

  test('a card cannot be moved onto the waste even from a legal source', () => {
    const s = fixture({ foundations: [[S(1)], [], [], []], waste: [H(9)] });
    expect(validate(s, mv(F(0), W))).toBe('cannot move cards there');
  });

  test('movingCards reports the run bottom-first', () => {
    const s = fixture({ tableau: [[D(9), C(8), H(7)], [], [], [], [], [], []], faceUp: [3, 0, 0, 0, 0, 0, 0] });
    expect(movingCards(s, T(0), 2)).toEqual([C(8), H(7)]);
    expect(movingCards(s, T(0), 4)).toBeUndefined();
    expect(movingCards(s, W, 1)).toBeUndefined();
    expect(movingCards(s, T(9), 1)).toBeUndefined();
  });
});

describe('invariants under random play', () => {
  test('52 unique cards and consistent face-up counts after many random valid actions', () => {
    const random = mulberry32(99);
    let s = deal(2024, 3);
    const candidates = (state: GameState): Action[] => {
      const out: Action[] = [{ type: 'draw' }, { type: 'recycle' }];
      const sources: { loc: Loc; max: number }[] = [{ loc: W, max: 1 }];
      for (let i = 0; i < 4; i++) sources.push({ loc: F(i), max: 1 });
      for (let i = 0; i < 7; i++) sources.push({ loc: T(i), max: state.faceUp[i] ?? 0 });
      for (const src of sources) {
        for (let count = 1; count <= src.max; count++) {
          for (let i = 0; i < 4; i++) out.push(mv(src.loc, F(i), count));
          for (let i = 0; i < 7; i++) out.push(mv(src.loc, T(i), count));
        }
      }
      return out.filter((a) => validate(state, a) === null);
    };
    for (let step = 0; step < 400; step++) {
      const options = candidates(s);
      if (options.length === 0) break;
      const pick = options[Math.floor(random() * options.length)] as Action;
      s = apply(s, pick);
      const all = allCardsOf(s);
      expect(all).toHaveLength(52);
      expect(new Set(all).size).toBe(52);
      s.tableau.forEach((col, i) => {
        const up = s.faceUp[i] ?? -1;
        expect(up).toBeGreaterThanOrEqual(col.length > 0 ? 1 : 0);
        expect(up).toBeLessThanOrEqual(col.length);
        expect(isValidRun(col.slice(col.length - up))).toBe(true);
      });
      expect(s.wasteFan).toBeLessThanOrEqual(s.waste.length);
    }
  });
});

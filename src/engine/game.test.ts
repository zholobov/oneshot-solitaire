import { describe, expect, test } from 'vitest';
import { DECK_SIZE, cardId } from './cards';
import { allCardsOf, apply, deal, isWon, sameLoc, validate, type GameState } from './game';

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

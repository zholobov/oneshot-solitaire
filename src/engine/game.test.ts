import { describe, expect, test } from 'vitest';
import { DECK_SIZE, cardId } from './cards';
import { allCardsOf, deal, isWon, sameLoc, type GameState } from './game';

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

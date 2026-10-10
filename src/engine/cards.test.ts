import { describe, expect, test } from 'vitest';
import { DECK_SIZE, allCards, cardDescription, cardId, cardName, isRed, rankLabel, rankOf, suitGlyph, suitOf } from './cards';

describe('cards', () => {
  test('maps ids to suit and rank', () => {
    expect(suitOf(0)).toBe(0);
    expect(rankOf(0)).toBe(1);
    expect(suitOf(12)).toBe(0);
    expect(rankOf(12)).toBe(13);
    expect(suitOf(13)).toBe(1);
    expect(rankOf(13)).toBe(1);
    expect(suitOf(51)).toBe(3);
    expect(rankOf(51)).toBe(13);
  });

  test('hearts and diamonds are red, spades and clubs are black', () => {
    expect(isRed(cardId(0, 5))).toBe(false);
    expect(isRed(cardId(1, 5))).toBe(true);
    expect(isRed(cardId(2, 5))).toBe(true);
    expect(isRed(cardId(3, 5))).toBe(false);
  });

  test('cardId round-trips for the whole deck', () => {
    for (const id of allCards()) expect(cardId(suitOf(id), rankOf(id))).toBe(id);
    expect(allCards()).toHaveLength(DECK_SIZE);
  });

  test('labels', () => {
    expect(cardName(0)).toBe('A♠');
    expect(cardName(cardId(1, 10))).toBe('10♥');
    expect(cardName(cardId(2, 12))).toBe('Q♦');
    expect(rankLabel(cardId(3, 11))).toBe('J');
    expect(suitGlyph(cardId(3, 11))).toBe('♣');
    expect(cardDescription(cardId(3, 13))).toBe('king of clubs');
  });
});

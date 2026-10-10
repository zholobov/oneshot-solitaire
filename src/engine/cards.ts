/** Cards are integers 0–51: suit = floor(id / 13), rank = id % 13 + 1 (1 = Ace, 13 = King). */
export type CardId = number;
/** 0 spades, 1 hearts, 2 diamonds, 3 clubs. */
export type Suit = 0 | 1 | 2 | 3;

export const DECK_SIZE = 52;
export const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const RANK_NAMES = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'] as const;

export function suitOf(id: CardId): Suit {
  return Math.floor(id / 13) as Suit;
}

export function rankOf(id: CardId): number {
  return (id % 13) + 1;
}

export function isRed(id: CardId): boolean {
  const suit = suitOf(id);
  return suit === 1 || suit === 2;
}

export function cardId(suit: Suit, rank: number): CardId {
  return suit * 13 + (rank - 1);
}

export function rankLabel(id: CardId): string {
  return RANK_LABELS[rankOf(id) - 1] ?? '?';
}

export function suitGlyph(id: CardId): string {
  return SUIT_GLYPHS[suitOf(id)];
}

export function cardName(id: CardId): string {
  return rankLabel(id) + suitGlyph(id);
}

export function cardDescription(id: CardId): string {
  return `${RANK_NAMES[rankOf(id) - 1] ?? '?'} of ${SUIT_NAMES[suitOf(id)]}`;
}

export function allCards(): CardId[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

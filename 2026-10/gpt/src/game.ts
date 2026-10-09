export const SUITS = [
  { name: "spades", symbol: "\u2660", red: false },
  { name: "hearts", symbol: "\u2665", red: true },
  { name: "clubs", symbol: "\u2663", red: false },
  { name: "diamonds", symbol: "\u2666", red: true },
] as const;

export type Card = Readonly<{ id: number; faceUp: boolean }>;
export interface GameState {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  moves: number;
}
export type Source =
  | { pile: "waste" }
  | { pile: "foundation"; index: number }
  | { pile: "tableau"; index: number; cardIndex: number };
export type Destination = { pile: "foundation" | "tableau"; index: number };
export type Move = { type: "move"; from: Source; to: Destination };
export type Action = Move | { type: "draw" };

const RANK_LABELS: Readonly<Record<number, string>> = { 1: "A", 11: "J", 12: "Q", 13: "K" };
const RANK_NAMES: Readonly<Record<number, string>> = { 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" };
export const rank = (id: number): number => (id % 13) + 1;
export const suit = (id: number): number => Math.floor(id / 13);
export const isRed = (id: number): boolean => suit(id) % 2 === 1;
export const rankLabel = (id: number): string => RANK_LABELS[rank(id)] ?? String(rank(id));
export const cardName = (id: number): string =>
  `${RANK_NAMES[rank(id)] ?? rank(id)} of ${SUITS[suit(id)]!.name}`;

export function shuffledDeck(random: () => number = Math.random): number[] {
  const deck = Array.from({ length: 52 }, (_, id) => id);
  for (let i = deck.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("The shuffle needs random numbers between zero and one.");
    }
    const j = Math.floor(value * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export function deal(order: readonly number[] = shuffledDeck()): GameState {
  if (order.length !== 52 || new Set(order).size !== 52 ||
      !order.every(id => Number.isInteger(id) && id >= 0 && id < 52)) {
    throw new Error("A deal must contain each of the 52 cards exactly once.");
  }
  const stock: Card[] = order.map(id => ({ id, faceUp: false }));
  const tableau: Card[][] = Array.from({ length: 7 }, () => []);
  for (let row = 0; row < 7; row++) {
    for (let column = row; column < 7; column++) {
      tableau[column]!.push({ ...stock.pop()!, faceUp: row === column });
    }
  }
  return { stock, waste: [], foundations: Array.from({ length: 4 }, () => []), tableau, moves: 0 };
}

function validIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

export function stacksOn(card: Card, below: Card): boolean {
  return below.faceUp && rank(card.id) + 1 === rank(below.id) && isRed(card.id) !== isRed(below.id);
}

export function isFaceUpRun(cards: readonly Card[]): boolean {
  return cards.every((card, index) =>
    card.faceUp && (index === 0 || stacksOn(card, cards[index - 1]!)));
}

export function movingCards(state: GameState, from: Source): Card[] {
  if (from.pile === "waste") return state.waste.slice(-1);
  const piles = from.pile === "tableau" ? state.tableau : state.foundations;
  if (!validIndex(from.index, piles.length)) return [];
  const pile = piles[from.index]!;
  if (from.pile === "foundation") return pile.slice(-1);
  if (!validIndex(from.cardIndex, pile.length)) return [];
  const cards = pile.slice(from.cardIndex);
  return isFaceUpRun(cards) ? cards : [];
}

export function canMove(state: GameState, from: Source, to: Destination): boolean {
  const piles = to.pile === "tableau" ? state.tableau : state.foundations;
  if (!validIndex(to.index, piles.length) ||
      (from.pile === to.pile && from.index === to.index)) return false;
  const cards = movingCards(state, from);
  const first = cards[0];
  if (!first?.faceUp) return false;
  const destination = piles[to.index]!;
  if (to.pile === "foundation") {
    return cards.length === 1 && suit(first.id) === to.index && rank(first.id) === destination.length + 1;
  }
  const top = destination.at(-1);
  return top ? stacksOn(first, top) : rank(first.id) === 13;
}

export function applyAction(state: GameState, action: Action): GameState | null {
  if (action.type === "move" && !canMove(state, action.from, action.to)) return null;
  if (action.type === "draw" && !state.stock.length && !state.waste.length) return null;
  const next: GameState = {
    stock: [...state.stock],
    waste: [...state.waste],
    foundations: state.foundations.map(pile => [...pile]),
    tableau: state.tableau.map(pile => [...pile]),
    moves: state.moves + 1,
  };
  if (action.type === "draw") {
    if (next.stock.length) next.waste.push({ ...next.stock.pop()!, faceUp: true });
    else {
      next.stock = next.waste.reverse().map(card => ({ ...card, faceUp: false }));
      next.waste = [];
    }
    return next;
  }
  const { from, to } = action;
  const source = from.pile === "waste" ? next.waste
    : from.pile === "tableau" ? next.tableau[from.index]! : next.foundations[from.index]!;
  const cards = source.splice(from.pile === "tableau" ? from.cardIndex : source.length - 1);
  (to.pile === "tableau" ? next.tableau[to.index]! : next.foundations[to.index]!).push(...cards);
  if (from.pile === "tableau" && source.length) {
    source[source.length - 1] = { ...source.at(-1)!, faceUp: true };
  }
  return next;
}

export function legalMoves(state: GameState): Move[] {
  const sources: Source[] = [];
  if (state.waste.length) sources.push({ pile: "waste" });
  state.tableau.forEach((pile, index) => pile.forEach((card, cardIndex) => {
    if (card.faceUp) sources.push({ pile: "tableau", index, cardIndex });
  }));
  state.foundations.forEach((pile, index) => {
    if (pile.length) sources.push({ pile: "foundation", index });
  });
  const destinations: Destination[] = [
    ...state.foundations.map((_, index): Destination => ({ pile: "foundation", index })),
    ...state.tableau.map((_, index): Destination => ({ pile: "tableau", index })),
  ];
  return sources.flatMap(from => destinations.filter(to => canMove(state, from, to))
    .map((to): Move => ({ type: "move", from, to })));
}

export const isWon = (state: GameState): boolean => state.foundations.every(pile => pile.length === 13);
export const canFinish = (state: GameState): boolean =>
  !isWon(state) && !state.stock.length && !state.waste.length && state.tableau.every(isFaceUpRun);

export function hint(state: GameState): Action | null {
  if (isWon(state)) return null;
  const moves = legalMoves(state);
  const useful = moves.filter(({ from, to }) =>
    from.pile !== "foundation" &&
    !(from.pile === "tableau" && from.cardIndex === 0 && to.pile === "tableau" && !state.tableau[to.index]!.length));
  const score = ({ from, to }: Move): number =>
    (from.pile === "tableau" && from.cardIndex > 0 && !state.tableau[from.index]![from.cardIndex - 1]!.faceUp ? 100 : 0) +
    (to.pile === "foundation" ? 30 : 0) + (from.pile === "waste" ? 20 : 0);
  useful.sort((a, b) => score(b) - score(a));
  return useful[0] ?? (state.stock.length || state.waste.length ? { type: "draw" } : moves[0] ?? null);
}

function isCard(value: unknown): value is Card {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "number" && validIndex(value.id, 52) &&
    "faceUp" in value && typeof value.faceUp === "boolean";
}

function isPile(value: unknown): value is Card[] {
  return Array.isArray(value) && value.length <= 52 && value.every(isCard);
}

export function isGameState(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null ||
      !("stock" in value) || !isPile(value.stock) || !("waste" in value) || !isPile(value.waste) ||
      !("tableau" in value) || !Array.isArray(value.tableau) || value.tableau.length !== 7 || !value.tableau.every(isPile) ||
      !("foundations" in value) || !Array.isArray(value.foundations) || value.foundations.length !== 4 || !value.foundations.every(isPile) ||
      !("moves" in value) || typeof value.moves !== "number" || !Number.isSafeInteger(value.moves) || value.moves < 0) return false;
  const cards = [...value.stock, ...value.waste, ...value.tableau.flat(), ...value.foundations.flat()];
  return cards.length === 52 && new Set(cards.map(card => card.id)).size === 52 &&
    value.stock.every(card => !card.faceUp) && value.waste.every(card => card.faceUp) &&
    value.foundations.every((pile, index) => pile.every((card, position) =>
      card.faceUp && suit(card.id) === index && rank(card.id) === position + 1)) &&
    value.tableau.every(pile => {
      if (!pile.length) return true;
      const firstUp = pile.findIndex(card => card.faceUp);
      return firstUp >= 0 && isFaceUpRun(pile.slice(firstUp));
    });
}

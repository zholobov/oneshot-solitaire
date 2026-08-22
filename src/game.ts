export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];

export type GameStatus = "playing" | "won";

export interface Card {
  id: string;
  suit: Suit;
  rank: number;
  faceUp: boolean;
}

export interface GameState {
  version: 1;
  seed: number;
  stock: Card[];
  waste: Card[];
  foundations: Record<Suit, Card[]>;
  tableau: Card[][];
  moves: number;
  recycleCount: number;
  startedAt: number | null;
  wonAt: number | null;
  status: GameStatus;
}

export type MoveSource =
  | { area: "waste" }
  | { area: "foundation"; suit: Suit }
  | { area: "tableau"; pileIndex: number; cardIndex: number };

export type MoveTarget =
  | { area: "foundation"; suit: Suit }
  | { area: "tableau"; pileIndex: number };

const RED_SUITS = new Set<Suit>(["diamonds", "hearts"]);

export function isSuit(value: string): value is Suit {
  return SUITS.includes(value as Suit);
}

export function createCard(suit: Suit, rank: number, faceUp = true): Card {
  return {
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp,
  };
}

function createFoundations(): Record<Suit, Card[]> {
  return {
    clubs: [],
    diamonds: [],
    hearts: [],
    spades: [],
  };
}

function createSeed(): number {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] ?? 0;
  }

  return Date.now() >>> 0;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffledDeck(seed: number): Card[] {
  const deck = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, index) => createCard(suit, index + 1, false)),
  );
  const random = seededRandom(seed);

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = deck[index];
    const replacement = deck[swapIndex];

    if (!current || !replacement) {
      throw new Error("Unable to shuffle the card deck.");
    }

    deck[index] = replacement;
    deck[swapIndex] = current;
  }

  return deck;
}

export function createNewGame(seed = createSeed()): GameState {
  const normalizedSeed = seed >>> 0;
  const deck = shuffledDeck(normalizedSeed);
  const tableau: Card[][] = Array.from({ length: 7 }, () => []);

  for (let pileIndex = 0; pileIndex < tableau.length; pileIndex += 1) {
    const pile = tableau[pileIndex];

    if (!pile) {
      throw new Error("Unable to create the tableau.");
    }

    for (let cardIndex = 0; cardIndex <= pileIndex; cardIndex += 1) {
      const card = deck.pop();

      if (!card) {
        throw new Error("The deck ran out while dealing.");
      }

      pile.push({
        ...card,
        faceUp: cardIndex === pileIndex,
      });
    }
  }

  return {
    version: 1,
    seed: normalizedSeed,
    stock: deck.map((card) => ({ ...card, faceUp: false })),
    waste: [],
    foundations: createFoundations(),
    tableau,
    moves: 0,
    recycleCount: 0,
    startedAt: null,
    wonAt: null,
    status: "playing",
  };
}

export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    stock: state.stock.map((card) => ({ ...card })),
    waste: state.waste.map((card) => ({ ...card })),
    foundations: {
      clubs: state.foundations.clubs.map((card) => ({ ...card })),
      diamonds: state.foundations.diamonds.map((card) => ({ ...card })),
      hearts: state.foundations.hearts.map((card) => ({ ...card })),
      spades: state.foundations.spades.map((card) => ({ ...card })),
    },
    tableau: state.tableau.map((pile) => pile.map((card) => ({ ...card }))),
  };
}

function isOppositeColor(first: Card, second: Card): boolean {
  return RED_SUITS.has(first.suit) !== RED_SUITS.has(second.suit);
}

function isDescendingAlternating(cards: Card[]): boolean {
  return cards.every((card, index) => {
    if (!card.faceUp || index === 0) {
      return card.faceUp;
    }

    const previous = cards[index - 1];
    return Boolean(previous && previous.rank === card.rank + 1 && isOppositeColor(previous, card));
  });
}

function isValidTableauIndex(state: GameState, pileIndex: number): boolean {
  return Number.isInteger(pileIndex) && pileIndex >= 0 && pileIndex < state.tableau.length;
}

export function getMovableCards(state: GameState, source: MoveSource): Card[] {
  if (source.area === "waste") {
    const card = state.waste.at(-1);
    return card?.faceUp ? [card] : [];
  }

  if (source.area === "foundation") {
    const card = state.foundations[source.suit].at(-1);
    return card?.faceUp ? [card] : [];
  }

  if (
    !isValidTableauIndex(state, source.pileIndex) ||
    !Number.isInteger(source.cardIndex) ||
    source.cardIndex < 0
  ) {
    return [];
  }

  const pile = state.tableau[source.pileIndex];

  if (!pile || source.cardIndex >= pile.length) {
    return [];
  }

  const cards = pile.slice(source.cardIndex);
  return isDescendingAlternating(cards) ? cards : [];
}

function canMoveToTableau(cards: Card[], targetPile: Card[]): boolean {
  const firstCard = cards[0];

  if (!firstCard || !isDescendingAlternating(cards)) {
    return false;
  }

  const targetCard = targetPile.at(-1);

  if (!targetCard) {
    return firstCard.rank === 13;
  }

  return (
    targetCard.faceUp &&
    targetCard.rank === firstCard.rank + 1 &&
    isOppositeColor(targetCard, firstCard)
  );
}

function canMoveToFoundation(card: Card, suit: Suit, foundation: Card[]): boolean {
  return card.suit === suit && card.rank === foundation.length + 1;
}

function foundationsAreComplete(foundations: Record<Suit, Card[]>): boolean {
  return SUITS.every((suit) => foundations[suit].length === 13);
}

function finalizeAction(state: GameState, now: number): GameState {
  state.moves += 1;
  state.startedAt ??= now;

  if (foundationsAreComplete(state.foundations)) {
    state.status = "won";
    state.wonAt = now;
  } else {
    state.status = "playing";
    state.wonAt = null;
  }

  return state;
}

export function drawFromStock(state: GameState, now = Date.now()): GameState | null {
  if (state.status === "won") {
    return null;
  }

  const nextState = cloneGameState(state);
  const drawnCard = nextState.stock.pop();

  if (drawnCard) {
    nextState.waste.push({ ...drawnCard, faceUp: true });
    return finalizeAction(nextState, now);
  }

  if (nextState.waste.length === 0) {
    return null;
  }

  nextState.stock = nextState.waste
    .reverse()
    .map((card) => ({ ...card, faceUp: false }));
  nextState.waste = [];
  nextState.recycleCount += 1;
  return finalizeAction(nextState, now);
}

export function moveCards(
  state: GameState,
  source: MoveSource,
  target: MoveTarget,
  now = Date.now(),
): GameState | null {
  if (state.status === "won") {
    return null;
  }

  if (
    source.area === "tableau" &&
    target.area === "tableau" &&
    source.pileIndex === target.pileIndex
  ) {
    return null;
  }

  if (
    source.area === "foundation" &&
    target.area === "foundation" &&
    source.suit === target.suit
  ) {
    return null;
  }

  const movingCards = getMovableCards(state, source);

  if (movingCards.length === 0) {
    return null;
  }

  if (target.area === "tableau") {
    if (!isValidTableauIndex(state, target.pileIndex)) {
      return null;
    }

    const targetPile = state.tableau[target.pileIndex];

    if (!targetPile || !canMoveToTableau(movingCards, targetPile)) {
      return null;
    }
  } else {
    const card = movingCards[0];

    if (
      movingCards.length !== 1 ||
      !card ||
      !canMoveToFoundation(card, target.suit, state.foundations[target.suit])
    ) {
      return null;
    }
  }

  const nextState = cloneGameState(state);
  let detachedCards: Card[];

  if (source.area === "waste") {
    const card = nextState.waste.pop();

    if (!card) {
      return null;
    }

    detachedCards = [card];
  } else if (source.area === "foundation") {
    const card = nextState.foundations[source.suit].pop();

    if (!card) {
      return null;
    }

    detachedCards = [card];
  } else {
    const sourcePile = nextState.tableau[source.pileIndex];

    if (!sourcePile) {
      return null;
    }

    detachedCards = sourcePile.splice(source.cardIndex);
    const exposedCard = sourcePile.at(-1);

    if (exposedCard && !exposedCard.faceUp) {
      exposedCard.faceUp = true;
    }
  }

  if (target.area === "tableau") {
    const targetPile = nextState.tableau[target.pileIndex];

    if (!targetPile) {
      return null;
    }

    targetPile.push(...detachedCards);
  } else {
    const card = detachedCards[0];

    if (!card) {
      return null;
    }

    nextState.foundations[target.suit].push(card);
  }

  return finalizeAction(nextState, now);
}

export function autoMoveToFoundation(
  state: GameState,
  source: MoveSource,
  now = Date.now(),
): GameState | null {
  const cards = getMovableCards(state, source);
  const card = cards[0];

  if (cards.length !== 1 || !card) {
    return null;
  }

  return moveCards(state, source, { area: "foundation", suit: card.suit }, now);
}

export function elapsedMilliseconds(state: GameState, now = Date.now()): number {
  if (state.startedAt === null) {
    return 0;
  }

  return Math.max(0, (state.wonAt ?? now) - state.startedAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCard(value: unknown): value is Card {
  if (!isRecord(value)) {
    return false;
  }

  const suit = value.suit;
  const rank = value.rank;

  return (
    typeof suit === "string" &&
    isSuit(suit) &&
    typeof rank === "number" &&
    Number.isInteger(rank) &&
    rank >= 1 &&
    rank <= 13 &&
    value.id === `${suit}-${rank}` &&
    typeof value.faceUp === "boolean"
  );
}

function isCardArray(value: unknown): value is Card[] {
  return Array.isArray(value) && value.every(isCard);
}

function isTableau(value: unknown): value is Card[][] {
  return Array.isArray(value) && value.length === 7 && value.every(isCardArray);
}

function isFoundations(value: unknown): value is Record<Suit, Card[]> {
  return (
    isRecord(value) &&
    Object.keys(value).length === SUITS.length &&
    SUITS.every((suit) => isCardArray(value[suit]))
  );
}

function isNullableTimestamp(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }

  const stock = value.stock;
  const waste = value.waste;
  const tableau = value.tableau;
  const foundations = value.foundations;
  const seed = value.seed;
  const moves = value.moves;
  const recycleCount = value.recycleCount;
  const startedAt = value.startedAt;
  const wonAt = value.wonAt;
  const status = value.status;

  if (
    value.version !== 1 ||
    typeof seed !== "number" ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !isCardArray(stock) ||
    !isCardArray(waste) ||
    !isTableau(tableau) ||
    !isFoundations(foundations) ||
    typeof moves !== "number" ||
    !Number.isInteger(moves) ||
    moves < 0 ||
    typeof recycleCount !== "number" ||
    !Number.isInteger(recycleCount) ||
    recycleCount < 0 ||
    !isNullableTimestamp(startedAt) ||
    !isNullableTimestamp(wonAt) ||
    (status !== "playing" && status !== "won")
  ) {
    return false;
  }

  const state: GameState = {
    version: 1,
    seed,
    stock,
    waste,
    foundations,
    tableau,
    moves,
    recycleCount,
    startedAt,
    wonAt,
    status,
  };
  const allCards = [
    ...state.stock,
    ...state.waste,
    ...SUITS.flatMap((suit) => state.foundations[suit]),
    ...state.tableau.flat(),
  ];

  if (allCards.length !== 52) {
    return false;
  }

  const cardIds = new Set(allCards.map((card) => card.id));

  if (
    cardIds.size !== 52 ||
    !SUITS.every((suit) =>
      Array.from({ length: 13 }, (_, index) => `${suit}-${index + 1}`).every((id) =>
        cardIds.has(id),
      ),
    )
  ) {
    return false;
  }

  if (
    state.stock.some((card) => card.faceUp) ||
    state.waste.some((card) => !card.faceUp) ||
    SUITS.some((suit) => state.foundations[suit].some((card) => !card.faceUp))
  ) {
    return false;
  }

  for (const suit of SUITS) {
    const foundation = state.foundations[suit];

    if (foundation.some((card, index) => card.suit !== suit || card.rank !== index + 1)) {
      return false;
    }
  }

  for (const pile of state.tableau) {
    let foundFaceUpCard = false;
    const faceUpCards: Card[] = [];

    for (const card of pile) {
      if (card.faceUp) {
        foundFaceUpCard = true;
        faceUpCards.push(card);
      } else if (foundFaceUpCard) {
        return false;
      }
    }

    if ((pile.length > 0 && !pile.at(-1)?.faceUp) || !isDescendingAlternating(faceUpCards)) {
      return false;
    }
  }

  const complete = foundationsAreComplete(state.foundations);

  if (
    (state.startedAt === null && state.moves !== 0) ||
    (state.status === "won" && (!complete || state.wonAt === null || state.startedAt === null)) ||
    (state.status === "playing" && (complete || state.wonAt !== null))
  ) {
    return false;
  }

  return true;
}

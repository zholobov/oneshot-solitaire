import { describe, expect, it } from "vitest";

import {
  SUITS,
  autoMoveToFoundation,
  createCard,
  createNewGame,
  drawFromStock,
  isGameState,
  moveCards,
  type GameState,
  type Suit,
} from "./game";

function emptyState(): GameState {
  return {
    version: 1,
    seed: 1,
    stock: [],
    waste: [],
    foundations: {
      clubs: [],
      diamonds: [],
      hearts: [],
      spades: [],
    },
    tableau: Array.from({ length: 7 }, () => []),
    moves: 0,
    recycleCount: 0,
    startedAt: null,
    wonAt: null,
    status: "playing",
  };
}

function completeFoundation(suit: Suit, throughRank = 13) {
  return Array.from({ length: throughRank }, (_, index) => createCard(suit, index + 1));
}

describe("createNewGame", () => {
  it("deals a complete, valid draw-one Klondike layout", () => {
    const game = createNewGame(42);

    expect(game.stock).toHaveLength(24);
    expect(game.waste).toHaveLength(0);
    expect(game.tableau.map((pile) => pile.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(game.tableau.every((pile) => pile.at(-1)?.faceUp)).toBe(true);
    expect(
      game.tableau.every((pile) => pile.slice(0, -1).every((card) => !card.faceUp)),
    ).toBe(true);
    expect(isGameState(game)).toBe(true);
  });

  it("repeats a deal for the same seed", () => {
    const firstDeal = createNewGame(9);
    const secondDeal = createNewGame(9);
    const differentDeal = createNewGame(10);

    expect(firstDeal).toEqual(secondDeal);
    expect(firstDeal.stock.map((card) => card.id)).not.toEqual(
      differentDeal.stock.map((card) => card.id),
    );
  });
});

describe("stock and waste", () => {
  it("draws one card and recycles the waste in its original order", () => {
    const game = emptyState();
    game.stock = [createCard("clubs", 2, false), createCard("hearts", 1, false)];

    const firstDraw = drawFromStock(game, 100);
    const secondDraw = firstDraw && drawFromStock(firstDraw, 200);
    const recycled = secondDraw && drawFromStock(secondDraw, 300);
    const drawnAgain = recycled && drawFromStock(recycled, 400);

    expect(firstDraw?.waste.at(-1)?.id).toBe("hearts-1");
    expect(secondDraw?.waste.at(-1)?.id).toBe("clubs-2");
    expect(recycled?.stock.map((card) => card.id)).toEqual(["clubs-2", "hearts-1"]);
    expect(recycled?.recycleCount).toBe(1);
    expect(drawnAgain?.waste.at(-1)?.id).toBe("hearts-1");
  });
});

describe("tableau moves", () => {
  it("moves alternating descending cards and exposes the next card", () => {
    const game = emptyState();
    game.tableau[0] = [createCard("spades", 9, false), createCard("hearts", 8)];
    game.tableau[1] = [createCard("clubs", 9)];

    const moved = moveCards(
      game,
      { area: "tableau", pileIndex: 0, cardIndex: 1 },
      { area: "tableau", pileIndex: 1 },
      500,
    );

    expect(moved?.tableau[0]?.at(-1)?.faceUp).toBe(true);
    expect(moved?.tableau[1]?.map((card) => card.id)).toEqual(["clubs-9", "hearts-8"]);
    expect(moved?.moves).toBe(1);
    expect(moved?.startedAt).toBe(500);
  });

  it("moves a valid sequence and rejects same-color or non-king empty-pile moves", () => {
    const game = emptyState();
    game.tableau[0] = [createCard("clubs", 7), createCard("hearts", 6)];
    game.tableau[1] = [createCard("diamonds", 8)];
    game.tableau[2] = [createCard("spades", 8)];

    const moved = moveCards(
      game,
      { area: "tableau", pileIndex: 0, cardIndex: 0 },
      { area: "tableau", pileIndex: 1 },
    );
    const sameColor = moveCards(
      game,
      { area: "tableau", pileIndex: 0, cardIndex: 0 },
      { area: "tableau", pileIndex: 2 },
    );
    const nonKingToEmpty = moveCards(
      game,
      { area: "tableau", pileIndex: 0, cardIndex: 0 },
      { area: "tableau", pileIndex: 3 },
    );

    expect(moved?.tableau[1]?.map((card) => card.id)).toEqual([
      "diamonds-8",
      "clubs-7",
      "hearts-6",
    ]);
    expect(sameColor).toBeNull();
    expect(nonKingToEmpty).toBeNull();
  });
});

describe("foundations", () => {
  it("builds upward by suit and supports the tap-again auto move", () => {
    const game = emptyState();
    game.waste = [createCard("hearts", 1)];

    const aceMoved = autoMoveToFoundation(game, { area: "waste" }, 100);

    expect(aceMoved?.foundations.hearts.map((card) => card.id)).toEqual(["hearts-1"]);

    if (!aceMoved) {
      throw new Error("Expected the ace move to succeed.");
    }

    aceMoved.waste = [createCard("hearts", 2)];
    const twoMoved = moveCards(
      aceMoved,
      { area: "waste" },
      { area: "foundation", suit: "hearts" },
      200,
    );
    const wrongFoundation = moveCards(
      aceMoved,
      { area: "waste" },
      { area: "foundation", suit: "diamonds" },
      200,
    );

    expect(twoMoved?.foundations.hearts.map((card) => card.rank)).toEqual([1, 2]);
    expect(wrongFoundation).toBeNull();
  });

  it("recognizes a completed game", () => {
    const game = emptyState();
    game.foundations = {
      clubs: completeFoundation("clubs"),
      diamonds: completeFoundation("diamonds"),
      hearts: completeFoundation("hearts", 12),
      spades: completeFoundation("spades"),
    };
    game.waste = [createCard("hearts", 13)];

    const won = moveCards(
      game,
      { area: "waste" },
      { area: "foundation", suit: "hearts" },
      1_000,
    );

    expect(won?.status).toBe("won");
    expect(won?.wonAt).toBe(1_000);
    expect(SUITS.every((suit) => won?.foundations[suit].length === 13)).toBe(true);
  });
});

describe("saved-state validation", () => {
  it("rejects duplicate or structurally invalid cards", () => {
    const valid = createNewGame(77);
    const invalid = structuredClone(valid);
    const firstStockCard = invalid.stock[0];
    const secondStockCard = invalid.stock[1];

    if (!firstStockCard || !secondStockCard) {
      throw new Error("Expected stock cards in a fresh game.");
    }

    invalid.stock[1] = { ...firstStockCard };

    expect(isGameState(valid)).toBe(true);
    expect(isGameState(invalid)).toBe(false);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAction, canFinish, canMove, cardName, deal, hint, isGameState, isWon,
  legalMoves, movingCards, rankLabel, shuffledDeck, suit,
} from "../dist/game.js";
import { down, openEndgame, position, random, seededSession, solvableSession, up } from "./fixtures.mjs";

const table = (index, cardIndex = 0) => ({ pile: "tableau", index, cardIndex });
const home = index => ({ pile: "foundation", index });
const move = (from, to) => ({ type: "move", from, to });
const draw = { type: "draw" };

function freeze(value) {
  Object.freeze(value);
  Object.values(value).forEach(child => {
    if (child && typeof child === "object" && !Object.isFrozen(child)) freeze(child);
  });
  return value;
}

test("a standard deal has all 52 cards, seven visible cards, and 24 in stock", () => {
  const state = deal(Array.from({ length: 52 }, (_, id) => id));
  assert.equal(isGameState(state), true);
  assert.deepEqual(state.tableau.map(pile => pile.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(state.tableau.map(pile => pile.filter(card => card.faceUp).length), Array(7).fill(1));
  assert.equal(state.stock.length, 24);
  assert.equal(state.waste.length, 0);
  assert.equal(state.tableau[0][0].id, 51);
  assert.equal(state.tableau[6][6].id, 24);
  assert.equal(state.moves, 0);
});

test("shuffles are repeatable with a supplied random source and retain every card", () => {
  const first = shuffledDeck(random(42));
  assert.deepEqual(first, shuffledDeck(random(42)));
  assert.notDeepEqual(first, shuffledDeck(random(43)));
  assert.equal(new Set(first).size, 52);
  assert.throws(() => shuffledDeck(() => 1), /random numbers/);
  assert.throws(() => shuffledDeck(() => -1), /random numbers/);
  assert.throws(() => shuffledDeck(() => NaN), /random numbers/);
});

test("invalid decks are rejected", () => {
  for (const order of [[], Array(52).fill(0), Array.from({ length: 52 }, (_, id) => id + 1)]) {
    assert.throws(() => deal(order), /52 cards/);
  }
});

test("draw-one and unlimited recycling preserve card order without modifying earlier states", () => {
  const initial = freeze(seededSession(42).state);
  const expected = [...initial.stock].reverse().map(card => card.id);
  let state = initial;
  for (let pass = 0; pass < 4; pass++) {
    for (const id of expected) {
      state = applyAction(freeze(state), draw);
      assert.equal(state.waste.at(-1).id, id);
      assert.equal(state.waste.at(-1).faceUp, true);
      assert.equal(isGameState(state), true);
    }
    state = applyAction(freeze(state), draw);
    assert.equal(state.waste.length, 0);
    assert.equal(state.stock.length, 24);
    assert.ok(state.stock.every(card => !card.faceUp));
  }
  assert.equal(state.moves, 100);
  assert.equal(initial.moves, 0);
  assert.equal(initial.waste.length, 0);
  assert.equal(applyAction(openEndgame().state, draw), null);
});

test("columns build down exactly one rank in alternating colors", () => {
  const state = position({ tableau: [[up(5)], [up(19)], [up(6)], [up(20)], [up(18)]] });
  assert.equal(canMove(state, table(0), table(1)), true);
  for (const destination of [table(0), table(2), table(3), table(4), table(5)]) {
    assert.equal(canMove(state, table(0), destination), false);
  }
  assert.equal(canMove(state, table(-1), table(1)), false);
  assert.equal(canMove(state, table(0, 0.5), table(1)), false);
  assert.equal(canMove(state, table(0), table(7)), false);
  assert.equal(canMove(state, table(0), table(NaN)), false);
  assert.equal(applyAction(state, move(table(0), table(2))), null);
});

test("only kings or complete runs starting with a king fill an empty column", () => {
  const state = position({ tableau: [[up(12), up(24), up(10)], [up(25)], [up(11)]] });
  assert.equal(canMove(state, table(0), table(3)), true);
  assert.equal(canMove(state, table(1), table(3)), true);
  assert.equal(canMove(state, table(0, 1), table(3)), false);
  assert.equal(canMove(state, table(2), table(3)), false);
  assert.deepEqual(movingCards(state, table(0)).map(card => card.id), [12, 24, 10]);
});

test("moving a run turns over the newly exposed card and leaves the old state intact", () => {
  const state = freeze(position({ tableau: [[down(0), up(11), up(23)], [up(25)]] }));
  const next = applyAction(state, move(table(0, 1), table(1)));
  assert.deepEqual(next.tableau[0], [up(0)]);
  assert.deepEqual(next.tableau[1], [up(25), up(11), up(23)]);
  assert.equal(next.moves, 1);
  assert.equal(state.tableau[0][0].faceUp, false);
  assert.equal(isGameState(next), true);
});

test("hidden cards and malformed face-up runs cannot be moved", () => {
  const state = position({ tableau: [[down(12), up(24)], [up(12), up(11)]] });
  assert.deepEqual(movingCards(state, table(0)), []);
  assert.deepEqual(movingCards(state, table(1)), []);
  assert.equal(canMove(state, table(0), table(2)), false);
});

test("suit piles start at ace, rise in suit, and accept only one exposed card", () => {
  const state = position({ tableau: [[up(0)], [up(13)], [up(1)], [up(14), up(26)]] });
  assert.equal(canMove(state, table(0), home(0)), true);
  assert.equal(canMove(state, table(1), home(0)), false);
  assert.equal(canMove(state, table(2), home(0)), false);
  assert.equal(canMove(state, table(3), home(1)), false);
  const next = applyAction(state, move(table(0), home(0)));
  assert.equal(canMove(next, table(2), home(0)), true);
  assert.equal(canMove(next, table(1), home(1)), true);
  assert.equal(canMove(next, table(3, 1), home(2)), true);
});

test("only the top discard and top foundation card can move, including back to a column", () => {
  const state = position({ tableau: [[up(14)]], waste: [up(12), up(13)], foundations: [[up(0)]] });
  assert.deepEqual(movingCards(state, { pile: "waste" }), [up(13)]);
  assert.equal(canMove(state, { pile: "waste" }, table(1)), false);
  assert.equal(canMove(state, home(0), table(0)), true);
  const next = applyAction(state, move(home(0), table(0)));
  assert.deepEqual(next.foundations[0], []);
  assert.deepEqual(next.tableau[0], [up(14), up(0)]);
});

test("hints favor uncovering hidden cards and do not shift whole king columns pointlessly", () => {
  const state = position({ tableau: [[down(0), up(5)], [up(19)], [up(12)]], waste: [up(13)] });
  assert.deepEqual(hint(state), move(table(0, 1), { pile: "tableau", index: 1 }));
  assert.deepEqual(hint(position({ tableau: [[up(12)]] })), draw);
  const stuck = { stock: [], waste: [], foundations: [[], [], [], []], tableau: Array.from({ length: 7 }, () => []), moves: 0 };
  assert.equal(hint(stuck), null);
});

test("finish is offered only for an open board with an empty stock and discard", () => {
  const state = openEndgame().state;
  assert.equal(isGameState(state), true);
  assert.equal(canFinish(state), true);
  assert.equal(canFinish(seededSession(7).state), false);
  assert.equal(canFinish({ ...state, waste: [up(0)] }), false);
  assert.equal(canFinish({ ...state, tableau: [[down(12)], ...state.tableau.slice(1)] }), false);
});

test("a complete standard deal can be won with 52 legal foundation moves and 24 draws", () => {
  let state = solvableSession().state;
  for (let id = 0; id < 52; id++) {
    if (id >= 28) state = applyAction(state, draw);
    const source = id < 28
      ? table(state.tableau.findIndex(pile => pile.at(-1)?.id === id),
        state.tableau.find(pile => pile.at(-1)?.id === id).length - 1)
      : { pile: "waste" };
    assert.equal(canMove(state, source, home(suit(id))), true, `card ${id}`);
    state = applyAction(freeze(state), move(source, home(suit(id))));
    assert.equal(isGameState(state), true);
  }
  assert.equal(isWon(state), true);
  assert.equal(state.moves, 76);
  assert.deepEqual(state.foundations.map(pile => pile.length), [13, 13, 13, 13]);
  assert.equal(hint(state), null);
  assert.equal(canFinish(state), false);
});

test("thousands of random legal actions preserve every card and every rule invariant", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const rng = random(seed);
    let state = seededSession(seed).state;
    for (let step = 0; step < 250; step++) {
      const choices = legalMoves(state);
      if (state.stock.length || state.waste.length) choices.push(draw);
      if (!choices.length) break;
      const action = choices[Math.floor(rng() * choices.length)];
      const next = applyAction(freeze(state), action);
      assert.ok(next, `seed ${seed}, step ${step}`);
      assert.equal(isGameState(next), true, `seed ${seed}, step ${step}`);
      assert.equal(next.moves, state.moves + 1);
      state = next;
    }
  }
});

test("card names and face labels include aces, court cards, and all suits", () => {
  assert.equal(cardName(0), "Ace of spades");
  assert.equal(cardName(24), "Queen of hearts");
  assert.equal(cardName(36), "Jack of clubs");
  assert.equal(cardName(51), "King of diamonds");
  assert.equal(rankLabel(9), "10");
  assert.equal(rankLabel(12), "K");
});

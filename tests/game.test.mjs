import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Game,
  SUITS,
  isRed,
  makeCard,
  canPlaceOnTableau,
  canPlaceOnFoundation,
} from '../js/game.js';

// Deterministic rng (mulberry32) for reproducible deals.
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allPiles(g) {
  return [g.stock, g.waste, ...g.foundations, ...g.tableau];
}

test('isRed/makeCard basics', () => {
  assert.deepEqual(SUITS, ['S', 'H', 'D', 'C']);
  assert.equal(isRed('H'), true);
  assert.equal(isRed('D'), true);
  assert.equal(isRed('S'), false);
  assert.equal(isRed('C'), false);
  assert.deepEqual(makeCard(0), { id: 0, suit: 'S', rank: 1, faceUp: false });
  assert.deepEqual(makeCard(51), { id: 51, suit: 'C', rank: 13, faceUp: false });
  assert.deepEqual(makeCard(13), { id: 13, suit: 'H', rank: 1, faceUp: false });
});

test('deal shape', () => {
  const g = new Game();
  g.newGame(1, rng(42));
  assert.equal(g.drawMode, 1);
  assert.equal(g.moves, 0);
  assert.equal(g.won, false);
  assert.equal(g.waste.length, 0);
  assert.equal(g.foundations.length, 4);
  for (const f of g.foundations) assert.equal(f.length, 0);
  assert.equal(g.tableau.length, 7);
  for (let i = 0; i < 7; i++) {
    const pile = g.tableau[i];
    assert.equal(pile.length, i + 1);
    for (let j = 0; j < pile.length; j++) {
      assert.equal(pile[j].faceUp, j === pile.length - 1, `tableau ${i} card ${j}`);
    }
  }
  assert.equal(g.stock.length, 24);
  for (const c of g.stock) assert.equal(c.faceUp, false);
  const ids = allPiles(g).flat().map((c) => c.id).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: 52 }, (_, i) => i));
});

test('draw-1 moves one card faceUp to waste, moves++', () => {
  const g = new Game();
  g.newGame(1, rng(1));
  const top = g.stock[g.stock.length - 1];
  assert.equal(g.draw(), true);
  assert.equal(g.stock.length, 23);
  assert.equal(g.waste.length, 1);
  assert.equal(g.waste[0].id, top.id);
  assert.equal(g.waste[0].faceUp, true);
  assert.equal(g.moves, 1);
});

test('draw-3 moves three cards in pop order, one move', () => {
  const g = new Game();
  g.newGame(3, rng(2));
  const [x, y, z] = g.stock.slice(-3); // z is stock top
  assert.equal(g.draw(), true);
  assert.equal(g.stock.length, 21);
  assert.deepEqual(g.waste.map((c) => c.id), [z.id, y.id, x.id]);
  for (const c of g.waste) assert.equal(c.faceUp, true);
  assert.equal(g.moves, 1);
});

test('draw-3 with fewer than 3 left draws the remainder', () => {
  const g = new Game();
  g.newGame(3, rng(3));
  g.stock.length = 2; // test-only truncation
  assert.equal(g.draw(), true);
  assert.equal(g.stock.length, 0);
  assert.equal(g.waste.length, 2);
});

test('recycle restores draw order and does not count as a move', () => {
  const g = new Game();
  g.newGame(1, rng(4));
  const order1 = [];
  for (let i = 0; i < 24; i++) {
    assert.equal(g.draw(), true);
    order1.push(g.waste[g.waste.length - 1].id);
  }
  assert.equal(g.stock.length, 0);
  const movesBefore = g.moves;
  assert.equal(g.draw(), true); // recycle
  assert.equal(g.moves, movesBefore);
  assert.equal(g.waste.length, 0);
  assert.equal(g.stock.length, 24);
  for (const c of g.stock) assert.equal(c.faceUp, false);
  const order2 = [];
  for (let i = 0; i < 24; i++) {
    assert.equal(g.draw(), true);
    order2.push(g.waste[g.waste.length - 1].id);
  }
  assert.deepEqual(order2, order1);
});

test('draw with empty stock and empty waste returns false', () => {
  const g = new Game();
  g.newGame(1, rng(5));
  g.stock.length = 0; // test-only
  assert.equal(g.waste.length, 0);
  assert.equal(g.draw(), false);
  assert.equal(g.moves, 0);
});

// --- Task 2: placement rules and moveCard ---

function cid(suit, rank) {
  return SUITS.indexOf(suit) * 13 + rank - 1;
}

function up(suit, rank) {
  const c = makeCard(cid(suit, rank));
  c.faceUp = true;
  return c;
}

// Test-only: clear a dealt game so piles can be constructed by hand.
function emptyGame() {
  const g = new Game();
  g.newGame(1, rng(1));
  g.stock.length = 0;
  g.waste.length = 0;
  for (const p of [...g.foundations, ...g.tableau]) p.length = 0;
  g.history.length = 0;
  g.moves = 0;
  return g;
}

// specs: array of [suit, rank, faceUp]
function put(g, ref, specs) {
  const pile = g.pile(ref);
  for (const [suit, rank, faceUp] of specs) {
    const c = makeCard(cid(suit, rank));
    c.faceUp = faceUp;
    pile.push(c);
  }
}

test('tableau accepts alternating descending', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 0 }, [['C', 6, true]]);
  assert.equal(canPlaceOnTableau(up('H', 5), g.tableau[0]), true);
  assert.equal(canPlaceOnTableau(up('S', 5), g.tableau[0]), false); // same color
  assert.equal(canPlaceOnTableau(up('H', 4), g.tableau[0]), false); // rank gap
  put(g, { k: 't', i: 1 }, [['D', 6, true]]);
  assert.equal(canPlaceOnTableau(up('H', 5), g.tableau[1]), false); // red on red
  assert.equal(canPlaceOnTableau(up('S', 5), g.tableau[1]), true);
  put(g, { k: 't', i: 2 }, [['C', 6, false]]); // face-down top
  assert.equal(canPlaceOnTableau(up('H', 5), g.tableau[2]), false);
});

test('empty tableau accepts only king', () => {
  const g = emptyGame();
  assert.equal(canPlaceOnTableau(up('H', 13), g.tableau[0]), true);
  assert.equal(canPlaceOnTableau(up('H', 12), g.tableau[0]), false);
});

test('foundation: ace on empty, same-suit ascending', () => {
  const g = emptyGame();
  assert.equal(canPlaceOnFoundation(up('S', 1), g.foundations[0]), true);
  assert.equal(canPlaceOnFoundation(up('S', 2), g.foundations[0]), false);
  put(g, { k: 'f', i: 0 }, [['S', 1, true]]);
  assert.equal(canPlaceOnFoundation(up('S', 2), g.foundations[0]), true);
  assert.equal(canPlaceOnFoundation(up('H', 2), g.foundations[0]), false);
  assert.equal(canPlaceOnFoundation(up('S', 3), g.foundations[0]), false);
});

test('waste top to tableau and foundation', () => {
  const g = emptyGame();
  put(g, { k: 'w' }, [['S', 1, true]]);
  assert.equal(g.moveCard({ k: 'w' }, 0, { k: 'f', i: 2 }), true);
  assert.equal(g.foundations[2].length, 1);
  assert.equal(g.waste.length, 0);
  put(g, { k: 't', i: 3 }, [['C', 9, true]]);
  put(g, { k: 'w' }, [['D', 10, true], ['H', 8, true]]);
  // only top of waste may move: index must be top
  assert.equal(g.moveCard({ k: 'w' }, 0, { k: 't', i: 3 }), false);
  assert.equal(g.moveCard({ k: 'w' }, 1, { k: 't', i: 3 }), true);
  assert.deepEqual(g.tableau[3].map((c) => c.id), [cid('C', 9), cid('H', 8)]);
  assert.equal(g.moves, 2);
});

test('run move between tableau piles', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 0 }, [['C', 2, false], ['H', 7, true], ['S', 6, true], ['D', 5, true]]);
  put(g, { k: 't', i: 1 }, [['S', 8, true]]);
  assert.equal(g.moveCard({ k: 't', i: 0 }, 1, { k: 't', i: 1 }), true);
  assert.deepEqual(
    g.tableau[1].map((c) => c.id),
    [cid('S', 8), cid('H', 7), cid('S', 6), cid('D', 5)]
  );
  assert.equal(g.tableau[0].length, 1);
});

test('run to foundation rejected', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 0 }, [['S', 2, true], ['H', 1, true]]);
  assert.equal(g.moveCard({ k: 't', i: 0 }, 0, { k: 'f', i: 0 }), false);
  // but single top card is fine
  assert.equal(g.moveCard({ k: 't', i: 0 }, 1, { k: 'f', i: 0 }), true);
});

test('face-down and invalid sequences cannot move', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 0 }, [['C', 5, false], ['H', 4, true]]);
  put(g, { k: 't', i: 1 }, [['D', 6, true]]);
  assert.equal(g.moveCard({ k: 't', i: 0 }, 0, { k: 't', i: 1 }), false); // face-down bottom
  const g2 = emptyGame();
  // 9 then 5 is not a legal run even if both face up (cannot occur in play; defensive)
  put(g2, { k: 't', i: 0 }, [['C', 9, true], ['H', 5, true]]);
  put(g2, { k: 't', i: 1 }, [['D', 10, true]]);
  assert.equal(g2.moveCard({ k: 't', i: 0 }, 0, { k: 't', i: 1 }), false);
});

test('auto-flip after tableau move', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 0 }, [['C', 2, false], ['H', 4, true]]);
  put(g, { k: 't', i: 1 }, [['S', 5, true]]);
  assert.equal(g.moveCard({ k: 't', i: 0 }, 1, { k: 't', i: 1 }), true);
  assert.equal(g.tableau[0][0].faceUp, true);
});

test('foundation top back to tableau (worry back)', () => {
  const g = emptyGame();
  put(g, { k: 'f', i: 0 }, [['S', 1, true], ['S', 2, true]]);
  put(g, { k: 't', i: 0 }, [['H', 3, true]]);
  assert.equal(g.moveCard({ k: 'f', i: 0 }, 1, { k: 't', i: 0 }), true);
  assert.equal(g.foundations[0].length, 1);
  assert.equal(g.tableau[0].length, 2);
  // foundation card cannot go to another foundation
  const g2 = emptyGame();
  put(g2, { k: 'f', i: 0 }, [['S', 1, true]]);
  assert.equal(g2.moveCard({ k: 'f', i: 0 }, 0, { k: 'f', i: 1 }), false);
});

test('illegal move leaves state unchanged and returns false', () => {
  const g2 = emptyGame();
  put(g2, { k: 't', i: 0 }, [['C', 9, true]]);
  put(g2, { k: 't', i: 1 }, [['D', 4, true]]);
  const snap = JSON.stringify(g2.encodeState());
  const hist2 = g2.history.length;
  assert.equal(g2.moveCard({ k: 't', i: 0 }, 0, { k: 't', i: 1 }), false);
  assert.equal(g2.moveCard({ k: 't', i: 0 }, 5, { k: 't', i: 1 }), false); // bad index
  assert.equal(g2.moveCard({ k: 't', i: 0 }, 0, { k: 't', i: 0 }), false); // same pile
  assert.equal(g2.moveCard({ k: 't', i: 9 }, 0, { k: 't', i: 1 }), false); // bad ref
  assert.equal(JSON.stringify(g2.encodeState()), snap);
  assert.equal(g2.history.length, hist2);
});

test('win detected when all foundations complete', () => {
  const g = emptyGame();
  for (let s = 0; s < 4; s++) {
    const suit = SUITS[s];
    const top = s === 3 ? 12 : 13;
    put(g, { k: 'f', i: s }, Array.from({ length: top }, (_, r) => [suit, r + 1, true]));
  }
  put(g, { k: 't', i: 0 }, [['C', 13, true]]);
  assert.equal(g.won, false);
  assert.equal(g.moveCard({ k: 't', i: 0 }, 0, { k: 'f', i: 3 }), true);
  assert.equal(g.won, true);
});

// --- Task 3: undo, serialize, smart move, auto-finish ---

test('undo reverses draw, recycle, move, and flip as single steps', () => {
  const g = new Game();
  g.newGame(1, rng(11));
  const s0 = JSON.stringify(g.encodeState());
  assert.equal(g.draw(), true);
  const s1 = JSON.stringify(g.encodeState());
  assert.equal(g.undo(), true);
  assert.equal(JSON.stringify(g.encodeState()), s0);

  // recycle undo
  g.draw();
  assert.equal(JSON.stringify(g.encodeState()), s1);
  for (let i = 0; i < 23; i++) g.draw();
  const beforeRecycle = JSON.stringify(g.encodeState());
  g.draw(); // recycle
  assert.equal(g.undo(), true);
  assert.equal(JSON.stringify(g.encodeState()), beforeRecycle);

  // move + flip is one undo step
  const g2 = emptyGame();
  put(g2, { k: 't', i: 0 }, [['C', 2, false], ['H', 4, true]]);
  put(g2, { k: 't', i: 1 }, [['S', 5, true]]);
  const before = JSON.stringify(g2.encodeState());
  g2.moveCard({ k: 't', i: 0 }, 1, { k: 't', i: 1 });
  assert.equal(g2.tableau[0][0].faceUp, true);
  assert.equal(g2.undo(), true);
  assert.equal(JSON.stringify(g2.encodeState()), before);
  assert.equal(g2.tableau[0][0].faceUp, false);
});

test('undo on fresh game returns false', () => {
  const g = new Game();
  g.newGame(1, rng(12));
  assert.equal(g.undo(), false);
});

test('serialize/deserialize round-trip preserves state and undo', () => {
  const g = new Game();
  g.newGame(3, rng(13));
  g.draw();
  g.draw();
  // find any legal tableau->tableau or waste move is not guaranteed; draws suffice
  const data = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = Game.deserialize(data);
  assert.equal(JSON.stringify(g2.serialize()), JSON.stringify(g.serialize()));
  assert.equal(g2.drawMode, 3);
  assert.equal(g2.moves, g.moves);
  // undo works after restore
  const prev = JSON.stringify(g.history[g.history.length - 1]);
  assert.equal(g2.undo(), true);
  assert.equal(JSON.stringify(g2.encodeState()), prev);
});

test('deserialize rejects corrupt data', () => {
  const g = new Game();
  g.newGame(1, rng(14));
  const good = g.serialize();
  assert.throws(() => Game.deserialize(null));
  assert.throws(() => Game.deserialize({}));
  const dupIds = JSON.parse(JSON.stringify(good));
  dupIds.stock[0] = dupIds.stock[1]; // duplicate card
  assert.throws(() => Game.deserialize(dupIds));
  const badPiles = JSON.parse(JSON.stringify(good));
  badPiles.t = badPiles.t.slice(0, 5); // missing tableau piles
  assert.throws(() => Game.deserialize(badPiles));
  const badCard = JSON.parse(JSON.stringify(good));
  badCard.stock[0] = 104; // id 52 out of range
  assert.throws(() => Game.deserialize(badCard));
});

test('smart move prefers foundation over tableau', () => {
  const g = emptyGame();
  put(g, { k: 'f', i: 0 }, [['S', 1, true]]);
  put(g, { k: 't', i: 0 }, [['S', 2, true]]);
  put(g, { k: 't', i: 1 }, [['H', 3, true]]); // 2♠ would also fit here
  assert.equal(g.autoMoveFrom({ k: 't', i: 0 }, 0), true);
  assert.equal(g.foundations[0].length, 2);
  assert.equal(g.tableau[1].length, 1);
});

test('smart move falls back to leftmost legal tableau pile', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 2 }, [['S', 9, true]]);
  put(g, { k: 't', i: 4 }, [['H', 10, true]]);
  put(g, { k: 't', i: 6 }, [['D', 10, true]]);
  assert.equal(g.autoMoveFrom({ k: 't', i: 2 }, 0), true);
  assert.equal(g.tableau[4].length, 2); // leftmost of the two tens
  assert.equal(g.tableau[6].length, 1);
});

test('smart move skips pointless king-to-empty when already at pile bottom', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 0 }, [['S', 13, true], ['H', 12, true]]);
  // piles 1..6 empty; moving the king run to another empty pile achieves nothing
  assert.equal(g.autoMoveFrom({ k: 't', i: 0 }, 0), false);
  // but a king NOT at the bottom does move to an empty pile
  const g2 = emptyGame();
  put(g2, { k: 't', i: 0 }, [['C', 2, false], ['S', 13, true]]);
  assert.equal(g2.autoMoveFrom({ k: 't', i: 0 }, 1), true);
  assert.equal(g2.tableau[1][0].rank, 13);
  assert.equal(g2.tableau[0][0].faceUp, true);
});

test('smart move of a run goes tableau-only', () => {
  const g = emptyGame();
  put(g, { k: 'f', i: 0 }, [['S', 1, true], ['S', 2, true]]); // 3♠ would fit foundation
  put(g, { k: 't', i: 0 }, [['S', 3, true], ['H', 2, true]]);
  put(g, { k: 't', i: 1 }, [['D', 4, true]]);
  assert.equal(g.autoMoveFrom({ k: 't', i: 0 }, 0), true);
  assert.equal(g.foundations[0].length, 2); // untouched
  assert.equal(g.tableau[1].length, 3);
});

test('smart move from waste', () => {
  const g = emptyGame();
  put(g, { k: 'w' }, [['D', 7, true]]);
  put(g, { k: 't', i: 3 }, [['C', 8, true]]);
  assert.equal(g.autoMoveFrom({ k: 'w' }, 0), true);
  assert.equal(g.tableau[3].length, 2);
  assert.equal(g.waste.length, 0);
});

test('canAutoFinish only when stock+waste empty and all faceUp', () => {
  const g = emptyGame();
  put(g, { k: 't', i: 0 }, [['S', 1, true]]);
  assert.equal(g.canAutoFinish(), true);
  put(g, { k: 't', i: 1 }, [['C', 3, false], ['H', 2, true]]);
  assert.equal(g.canAutoFinish(), false);
  g.tableau[1][0].faceUp = true;
  assert.equal(g.canAutoFinish(), true);
  put(g, { k: 'w' }, [['D', 5, true]]);
  assert.equal(g.canAutoFinish(), false);
});

test('autoFinishStep drains to win', () => {
  const g = emptyGame();
  // Distribute all 52 cards face-up across tableau in reverse rank order per pile
  for (let s = 0; s < 4; s++) {
    for (let r = 13; r >= 1; r--) {
      const c = makeCard(cid(SUITS[s], r));
      c.faceUp = true;
      g.tableau[s].push(c);
    }
  }
  assert.equal(g.canAutoFinish(), true);
  let steps = 0;
  while (g.autoFinishStep()) steps++;
  assert.equal(steps, 52);
  assert.equal(g.won, true);
  assert.equal(g.canAutoFinish(), false); // already won
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SUITS, isRed, makeCard } from '../js/game.js';

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

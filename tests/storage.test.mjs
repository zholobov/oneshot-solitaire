import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { createStorage, STORAGE_KEY } from '../js/storage.js';

function fakeBacking() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function seededRng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('save/load round-trip', () => {
  const backing = fakeBacking();
  const storage = createStorage(backing);
  const game = new Game();
  game.newGame(3, seededRng(21));
  game.draw();
  storage.save({ game, elapsedMs: 12345 });
  const loaded = storage.load();
  assert.notEqual(loaded, null);
  assert.equal(loaded.elapsedMs, 12345);
  assert.equal(
    JSON.stringify(loaded.game.serialize()),
    JSON.stringify(game.serialize())
  );
});

test('load returns null when nothing saved', () => {
  const storage = createStorage(fakeBacking());
  assert.equal(storage.load(), null);
});

test('load returns null and clears on corrupt JSON', () => {
  const backing = fakeBacking();
  backing.setItem(STORAGE_KEY, '{not json');
  const storage = createStorage(backing);
  assert.equal(storage.load(), null);
  assert.equal(backing.getItem(STORAGE_KEY), null);
});

test('load returns null and clears on valid JSON with bad shape', () => {
  const backing = fakeBacking();
  backing.setItem(STORAGE_KEY, JSON.stringify({ game: { drawMode: 2 }, elapsedMs: 'x' }));
  const storage = createStorage(backing);
  assert.equal(storage.load(), null);
  assert.equal(backing.getItem(STORAGE_KEY), null);
});

test('save never throws when backing throws', () => {
  const storage = createStorage({
    getItem: () => null,
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {},
  });
  const game = new Game();
  game.newGame(1, seededRng(22));
  assert.doesNotThrow(() => storage.save({ game, elapsedMs: 0 }));
});

test('clear removes the save', () => {
  const backing = fakeBacking();
  const storage = createStorage(backing);
  const game = new Game();
  game.newGame(1, seededRng(23));
  storage.save({ game, elapsedMs: 5 });
  storage.clear();
  assert.equal(storage.load(), null);
});

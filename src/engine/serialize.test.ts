import { describe, expect, test } from 'vitest';
import { apply, deal } from './game';
import { parseJson, parseSave, parseSettings, parseState, SAVE_VERSION, type SaveFile } from './serialize';

describe('parseState', () => {
  const good = apply(deal(3, 3), { type: 'draw' });

  test('accepts a valid state (round trip through JSON)', () => {
    expect(parseState(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  test.each<[string, unknown]>([
    ['not an object', 42],
    ['null', null],
    ['missing card', { ...good, stock: good.stock.slice(1) }],
    ['duplicate card', { ...good, stock: [...good.stock.slice(1), good.stock[1]] }],
    ['card out of range', { ...good, stock: [...good.stock.slice(1), 52] }],
    ['non-integer card', { ...good, stock: [...good.stock.slice(1), 'A'] }],
    ['faceUp above length', { ...good, faceUp: [2, 1, 1, 1, 1, 1, 1] }],
    ['faceUp zero on non-empty column', { ...good, faceUp: [0, 1, 1, 1, 1, 1, 1] }],
    ['wrong faceUp length', { ...good, faceUp: [1, 1, 1] }],
    ['bad drawCount', { ...good, drawCount: 2 }],
    ['wasteFan above waste length', { ...good, wasteFan: 9 }],
    ['negative moves', { ...good, moves: -1 }],
    ['wrong number of foundations', { ...good, foundations: [[], [], []] }],
    ['wrong number of columns', { ...good, tableau: good.tableau.slice(0, 6) }],
    ['seed not an integer', { ...good, seed: 'x' }],
  ])('rejects %s', (_name, value) => {
    expect(parseState(value)).toBeNull();
  });
});

describe('parseSave', () => {
  const state = apply(deal(3, 1), { type: 'draw' });
  const save: SaveFile = { version: SAVE_VERSION, state, history: [deal(3, 1)], elapsedMs: 1234 };

  test('round-trips a valid save', () => {
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  test('rejects wrong versions, corrupt history and non-objects', () => {
    expect(parseSave({ ...save, version: 2 })).toBeNull();
    expect(parseSave({ ...save, history: [{ nope: true }] })).toBeNull();
    expect(parseSave({ ...save, history: 'x' })).toBeNull();
    expect(parseSave('garbage')).toBeNull();
    expect(parseSave(null)).toBeNull();
  });

  test('defaults a bad elapsedMs to 0', () => {
    expect(parseSave({ ...save, elapsedMs: -5 })?.elapsedMs).toBe(0);
    expect(parseSave({ ...save, elapsedMs: 'x' })?.elapsedMs).toBe(0);
  });
});

describe('parseSettings / parseJson', () => {
  test('defaults to draw 1', () => {
    expect(parseSettings(null)).toEqual({ drawCount: 1 });
    expect(parseSettings({ drawCount: 2 })).toEqual({ drawCount: 1 });
    expect(parseSettings({ drawCount: 3 })).toEqual({ drawCount: 3 });
  });

  test('parseJson tolerates null and garbage', () => {
    expect(parseJson(null)).toBeNull();
    expect(parseJson('{not json')).toBeNull();
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });
});

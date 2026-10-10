import { describe, expect, test } from 'vitest';
import { mulberry32, randomSeed, shuffle } from './rng';

describe('rng', () => {
  test('same seed gives the same sequence, different seeds differ', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });

  test('values are in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('shuffle is a deterministic permutation and does not mutate its input', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = shuffle(input, mulberry32(1));
    expect(input).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(shuffle(input, mulberry32(1))).toEqual(out);
    expect(out).not.toEqual(input);
  });

  test('randomSeed returns a non-negative 31-bit integer', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 31);
    }
  });
});

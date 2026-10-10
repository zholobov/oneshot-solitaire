import { describe, expect, test } from 'vitest';
import { apply, isWon, type Action, type GameState, type Loc } from './game';
import { canAutoFinish, findSmartMove, nextAutoFinishMove } from './smart';
import { C, D, H, S, fixture, fullRunState } from './testing';

const W: Loc = { pile: 'waste' };
const F = (index: number): Loc => ({ pile: 'foundation', index });
const T = (index: number): Loc => ({ pile: 'tableau', index });
/** Destination of a move action, for concise assertions. */
const dest = (a: Action | null): Loc | null => (a !== null && a.type === 'move' ? a.to : null);

describe('findSmartMove', () => {
  test('an ace on the waste goes to the first empty foundation', () => {
    expect(findSmartMove(fixture({ waste: [H(1)] }), W, 1)).toEqual({ type: 'move', from: W, to: F(0), count: 1 });
    const s = fixture({ waste: [H(1)], foundations: [[S(1)], [], [], []] });
    expect(dest(findSmartMove(s, W, 1))).toEqual(F(1));
  });

  test('prefers the foundation over a tableau column for a single card', () => {
    const s = fixture({ foundations: [[S(1)], [], [], []], tableau: [[S(2)], [H(3)], [], [], [], [], []] });
    expect(dest(findSmartMove(s, T(0), 1))).toEqual(F(0));
  });

  test('a run of two or more only goes to the tableau, leftmost fitting column first', () => {
    const s = fixture({
      foundations: [[S(1)], [], [], []],
      tableau: [[H(3), S(2)], [C(4)], [D(4)], [], [], [], []],
      faceUp: [2, 1, 1, 0, 0, 0, 0],
    });
    expect(dest(findSmartMove(s, T(0), 2))).toEqual(T(1));
  });

  test('skips the source column', () => {
    const s = fixture({ tableau: [[C(4), H(3)], [], [], [], [], [], []], faceUp: [2, 0, 0, 0, 0, 0, 0] });
    expect(findSmartMove(s, T(0), 1)).toBeNull();
  });

  test('a king at the bottom of its column does not move to an empty column', () => {
    const s = fixture({ tableau: [[S(13), H(12)], [], [], [], [], [], []], faceUp: [2, 0, 0, 0, 0, 0, 0] });
    expect(findSmartMove(s, T(0), 2)).toBeNull();
  });

  test('a king with cards beneath it moves to an empty column', () => {
    const s = fixture({ tableau: [[D(5), S(13)], [], [], [], [], [], []], faceUp: [1, 0, 0, 0, 0, 0, 0] });
    expect(dest(findSmartMove(s, T(0), 1))).toEqual(T(1));
  });

  test('a king on the waste moves to an empty column', () => {
    expect(dest(findSmartMove(fixture({ waste: [C(13)] }), W, 1))).toEqual(T(0));
  });

  test('a non-king never targets an empty column', () => {
    expect(findSmartMove(fixture({ waste: [C(12)] }), W, 1)).toBeNull();
  });

  test('a foundation card goes to a fitting column, never to another foundation', () => {
    const s = fixture({ foundations: [[], [H(1), H(2), H(3), H(4), H(5)], [], []], tableau: [[S(6)], [], [], [], [], [], []] });
    expect(dest(findSmartMove(s, F(1), 1))).toEqual(T(0));
    const noFit = fixture({ foundations: [[], [H(1)], [], []] });
    expect(findSmartMove(noFit, F(1), 1)).toBeNull();
  });

  test('returns null for impossible sources', () => {
    expect(findSmartMove(fixture({}), W, 1)).toBeNull();
    expect(findSmartMove(fixture({ tableau: [[S(5)], [], [], [], [], [], []] }), T(0), 2)).toBeNull();
  });
});

describe('auto-finish', () => {
  test('canAutoFinish requires an empty stock and waste and every card face-up', () => {
    expect(canAutoFinish(fullRunState())).toBe(true);
    const withStock = fixture({ tableau: [[S(13)], [], [], [], [], [], []] }); // other cards in stock
    expect(canAutoFinish(withStock)).toBe(false);
    const faceDown: GameState = { ...fullRunState(), faceUp: [12, 13, 13, 13, 0, 0, 0] };
    expect(canAutoFinish(faceDown)).toBe(false);
    const won: GameState = {
      ...fixture({}),
      stock: [],
      foundations: [0, 1, 2, 3].map((suit) => Array.from({ length: 13 }, (_, i) => suit * 13 + i)),
    };
    expect(canAutoFinish(won)).toBe(false);
  });

  test('nextAutoFinishMove picks the lowest-ranked playable top card', () => {
    const s = fullRunState();
    expect(nextAutoFinishMove(s)).toEqual({ type: 'move', from: T(0), to: F(0), count: 1 }); // A♠ tops column 0
    const later = apply(s, { type: 'move', from: T(0), to: F(0), count: 1 });
    expect(nextAutoFinishMove(later)).toEqual({ type: 'move', from: T(1), to: F(1), count: 1 }); // A♥ next
  });

  test('repeating nextAutoFinishMove wins in exactly 52 steps', () => {
    let s = fullRunState();
    let steps = 0;
    for (;;) {
      const a: Action | null = nextAutoFinishMove(s);
      if (a === null) break;
      s = apply(s, a);
      steps++;
      expect(steps).toBeLessThanOrEqual(52);
    }
    expect(isWon(s)).toBe(true);
    expect(steps).toBe(52);
  });
});

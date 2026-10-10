import { describe, expect, test } from 'vitest';
import { apply, deal } from '../engine/game';
import { H, S, fixture } from '../engine/testing';
import { bestDropZone, overlapArea, runFrom } from './input';
import { computeLayout } from './layout';

const PHONE = { width: 390, height: 700 };

describe('runFrom', () => {
  test('a tableau card carries every card above it, bottom first', () => {
    const s = fixture({ tableau: [[S(9), H(8), S(7)], [], [], [], [], [], []], faceUp: [3, 0, 0, 0, 0, 0, 0] });
    const l = computeLayout(s, PHONE);
    expect(runFrom(l, H(8))).toEqual([H(8), S(7)]);
    expect(runFrom(l, S(9))).toEqual([S(9), H(8), S(7)]);
    expect(runFrom(l, S(7))).toEqual([S(7)]);
  });

  test('only the top waste card can be picked up in a draw-3 fan (review focus 1)', () => {
    const s = apply(deal(1, 3), { type: 'draw' });
    const l = computeLayout(s, PHONE);
    const [a, b, c] = s.waste as [number, number, number];
    expect(runFrom(l, c)).toEqual([c]);
    expect(runFrom(l, b)).toBeNull();
    expect(runFrom(l, a)).toBeNull();
  });

  test('only the top foundation card can be picked up', () => {
    const s = fixture({ foundations: [[S(1), S(2)], [], [], []] });
    const l = computeLayout(s, PHONE);
    expect(runFrom(l, S(2))).toEqual([S(2)]);
    expect(runFrom(l, S(1))).toBeNull();
  });
});

describe('bestDropZone', () => {
  const s = deal(1, 1);
  const l = computeLayout(s, PHONE);

  test('picks the zone with the largest overlap', () => {
    const col3 = l.tableau[3];
    if (col3 === undefined) throw new Error('missing column');
    const lead = { x: col3.x + 10, y: col3.y + 5, w: l.cardW, h: l.cardH }; // mostly over column 3, a bit over 4
    expect(bestDropZone(l.dropZones, lead, { pile: 'waste' })?.loc).toEqual({ pile: 'tableau', index: 3 });
    const shifted = { ...lead, x: col3.x + l.cardW - 10 };
    expect(bestDropZone(l.dropZones, shifted, { pile: 'waste' })?.loc).toEqual({ pile: 'tableau', index: 4 });
  });

  test('ignores the source pile so a drop back home snaps back (review focus 2)', () => {
    const col3 = l.tableau[3];
    if (col3 === undefined) throw new Error('missing column');
    const lead = { x: col3.x, y: col3.y + 20, w: l.cardW, h: l.cardH };
    expect(bestDropZone(l.dropZones, lead, { pile: 'tableau', index: 3 })).toBeNull();
  });

  test('returns null when nothing overlaps; foundations are zones too', () => {
    expect(bestDropZone(l.dropZones, { x: -500, y: -500, w: 10, h: 10 }, { pile: 'waste' })).toBeNull();
    const f2 = l.foundations[2];
    if (f2 === undefined) throw new Error('missing foundation');
    expect(bestDropZone(l.dropZones, { ...f2 }, { pile: 'waste' })?.loc).toEqual({ pile: 'foundation', index: 2 });
  });

  test('overlapArea', () => {
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(0);
  });
});

import { describe, expect, test } from 'vitest';
import { apply, deal, type GameState } from '../engine/game';
import { fixture } from '../engine/testing';
import { computeLayout, placeKey } from './layout';

const PHONE = { width: 390, height: 700 };

describe('computeLayout', () => {
  test('card size follows the width formula on a phone', () => {
    const l = computeLayout(deal(1, 1), PHONE);
    expect(l.gap).toBe(4);
    expect(l.cardW).toBe(51); // floor((390 - 32) / 7)
    expect(l.cardH).toBe(71); // round(51 * 1.4)
  });

  test('places all 52 cards inside the board', () => {
    const l = computeLayout(deal(1, 1), PHONE);
    expect(l.cards.filter(Boolean)).toHaveLength(52);
    for (const p of l.cards) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + l.cardW).toBeLessThanOrEqual(PHONE.width);
      expect(p.y + l.cardH).toBeLessThanOrEqual(PHONE.height);
    }
  });

  test('seven evenly spaced columns, stock at column 0, foundations at 3..6', () => {
    const l = computeLayout(deal(1, 1), PHONE);
    const xs = l.tableau.map((r) => r.x);
    for (let i = 1; i < 7; i++) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBe(l.cardW + l.gap);
    expect(l.stock.x).toBe(xs[0]);
    expect(l.waste.x).toBe(xs[1]);
    expect(l.foundations.map((r) => r.x)).toEqual(xs.slice(3));
    expect(l.stock.y).toBe(l.gap);
    expect(l.tableau[0]?.y).toBe(l.gap + l.cardH + 3 * l.gap);
  });

  test('face-up and face-down placement in the deal', () => {
    const s = deal(1, 1);
    const l = computeLayout(s, PHONE);
    const col6 = s.tableau[6] ?? [];
    expect(l.cards[col6[0] ?? 0]?.faceUp).toBe(false);
    expect(l.cards[col6[6] ?? 0]?.faceUp).toBe(true);
    expect(l.cards[col6[6] ?? 0]?.z).toBe(6);
    expect(l.cards[s.stock[0] ?? 0]?.place).toEqual({ pile: 'stock' });
    expect(l.cards[s.stock[0] ?? 0]?.faceUp).toBe(false);
    const dDown = Math.round(l.cardH * 0.14);
    expect((l.cards[col6[1] ?? 0]?.y ?? 0) - (l.cards[col6[0] ?? 0]?.y ?? 0)).toBe(dDown);
  });

  test('draw 3 fans the top three waste cards; draw 1 stacks them', () => {
    let s3 = deal(1, 3);
    s3 = apply(s3, { type: 'draw' });
    const l3 = computeLayout(s3, PHONE);
    const xs3 = s3.waste.map((id) => l3.cards[id]?.x ?? -1);
    expect(xs3[0]).toBe(l3.waste.x);
    expect(xs3[1]).toBe(l3.waste.x + Math.round(l3.cardW * 0.3));
    expect(xs3[2]).toBe(l3.waste.x + 2 * Math.round(l3.cardW * 0.3));
    expect((xs3[2] ?? 0) + l3.cardW).toBeLessThan(l3.foundations[0]?.x ?? 0);
    let s1 = deal(1, 1);
    s1 = apply(apply(s1, { type: 'draw' }), { type: 'draw' });
    const l1 = computeLayout(s1, PHONE);
    for (const id of s1.waste) expect(l1.cards[id]?.x).toBe(l1.waste.x);
  });

  test('a fan of zero shows a single stacked card', () => {
    const s: GameState = { ...fixture({ waste: [1, 2, 3], drawCount: 3 }), wasteFan: 0 };
    const l = computeLayout(s, PHONE);
    for (const id of s.waste) expect(l.cards[id]?.x).toBe(l.waste.x);
  });

  test('compresses a tall column so it fits the board height', () => {
    const column = Array.from({ length: 19 }, (_, i) => i);
    const s = fixture({ tableau: [column, [], [], [], [], [], []], faceUp: [13, 0, 0, 0, 0, 0, 0] });
    const short = { width: 390, height: 360 };
    const l = computeLayout(s, short);
    const last = l.cards[18];
    expect((last?.y ?? 0) + l.cardH).toBeLessThanOrEqual(short.height - l.gap);
    const tall = computeLayout(s, { width: 390, height: 2000 });
    expect(tall.cards[18]?.y).toBeGreaterThan(last?.y ?? 0);
    expect(tall.cards[18]?.y).toBe((tall.tableau[0]?.y ?? 0) + 6 * Math.round(tall.cardH * 0.14) + 12 * Math.round(tall.cardH * 0.3));
  });

  test('column drop zones extend to the last card; foundations are card-sized', () => {
    const s = deal(1, 1);
    const l = computeLayout(s, PHONE);
    const col6 = s.tableau[6] ?? [];
    const zone = l.dropZones.find((z) => z.loc.pile === 'tableau' && z.loc.index === 6);
    expect(zone?.rect.h).toBe((l.cards[col6[6] ?? 0]?.y ?? 0) + l.cardH - (l.tableau[6]?.y ?? 0));
    const empty = l.dropZones.find((z) => z.loc.pile === 'foundation' && z.loc.index === 0);
    expect(empty?.rect).toEqual(l.foundations[0]);
    expect(l.dropZones).toHaveLength(11);
  });

  test('caps the card width and centres the board on wide screens', () => {
    const l = computeLayout(deal(1, 1), { width: 1400, height: 1000 });
    expect(l.cardW).toBe(120);
    const left = l.tableau[0]?.x ?? 0;
    const right = 1400 - ((l.tableau[6]?.x ?? 0) + l.cardW);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  test('limits the card size by height in landscape', () => {
    const l = computeLayout(deal(1, 1), { width: 844, height: 314 });
    expect(l.cardW).toBe(Math.floor((314 - 5 * 8) / (1.4 * 2.6)));
  });

  test('placeKey distinguishes piles', () => {
    expect(placeKey({ pile: 'stock' })).toBe('stock');
    expect(placeKey({ pile: 'waste' })).toBe('waste');
    expect(placeKey({ pile: 'tableau', index: 3 })).toBe('tableau:3');
    expect(placeKey({ pile: 'foundation', index: 3 })).toBe('foundation:3');
  });
});

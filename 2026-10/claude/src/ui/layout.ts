import type { CardId } from '../engine/cards';
import { FOUNDATION_COUNT, TABLEAU_COUNT, type GameState, type Loc } from '../engine/game';

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Place = { pile: 'stock' } | Loc;

export interface CardPlacement {
  id: CardId;
  x: number;
  y: number;
  /** Stacking order within the pile (0 = deepest). */
  z: number;
  faceUp: boolean;
  place: Place;
  /** Index within the pile. */
  index: number;
}

export interface DropZone {
  loc: Loc;
  rect: Rect;
}

export interface Layout {
  cardW: number;
  cardH: number;
  gap: number;
  /** Default vertical offset between face-up cards in a column. */
  dUp: number;
  /** Indexed by card id. */
  cards: CardPlacement[];
  stock: Rect;
  waste: Rect;
  foundations: Rect[];
  tableau: Rect[];
  dropZones: DropZone[];
}

export const MAX_CARD_W = 120;
export const MIN_CARD_W = 30;
export const CARD_RATIO = 1.4;
const FACE_DOWN_OFFSET = 0.14;
const FACE_UP_OFFSET = 0.3;
const WASTE_FAN = 0.3;
const MIN_COMPRESSION = 0.25;

export function placeKey(place: Place): string {
  return place.pile === 'stock' || place.pile === 'waste' ? place.pile : `${place.pile}:${place.index}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pure: computes where every card and slot goes for a board of the given size. */
export function computeLayout(state: GameState, size: Size): Layout {
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const gap = Math.max(4, Math.round(width / 100));
  const byWidth = Math.floor((width - 8 * gap) / 7);
  const byHeight = Math.floor((height - 5 * gap) / (CARD_RATIO * 2.6));
  const cardW = Math.max(MIN_CARD_W, Math.min(byWidth, byHeight, MAX_CARD_W));
  const cardH = Math.round(cardW * CARD_RATIO);
  const offsetX = Math.max(0, Math.floor((width - (7 * cardW + 8 * gap)) / 2));
  const colX = (i: number): number => offsetX + gap + i * (cardW + gap);
  const topY = gap;
  const tableauY = topY + cardH + 3 * gap;
  const dDown = Math.round(cardH * FACE_DOWN_OFFSET);
  const dUp = Math.round(cardH * FACE_UP_OFFSET);
  const fanX = Math.round(cardW * WASTE_FAN);
  const rect = (x: number, y: number, w = cardW, h = cardH): Rect => ({ x, y, w, h });
  const cards: CardPlacement[] = [];

  state.stock.forEach((id, i) => {
    cards[id] = { id, x: colX(0), y: topY, z: i, faceUp: false, place: { pile: 'stock' }, index: i };
  });

  const fanned = state.drawCount === 3 ? Math.max(1, Math.min(state.wasteFan, 3)) : 1;
  const firstFanned = state.waste.length - fanned;
  state.waste.forEach((id, i) => {
    const k = i - firstFanned;
    cards[id] = { id, x: colX(1) + (k > 0 ? k * fanX : 0), y: topY, z: i, faceUp: true, place: { pile: 'waste' }, index: i };
  });

  const foundations: Rect[] = [];
  const dropZones: DropZone[] = [];
  for (let f = 0; f < FOUNDATION_COUNT; f++) {
    const r = rect(colX(3 + f), topY);
    foundations.push(r);
    dropZones.push({ loc: { pile: 'foundation', index: f }, rect: r });
    state.foundations[f]?.forEach((id, i) => {
      cards[id] = { id, x: r.x, y: r.y, z: i, faceUp: true, place: { pile: 'foundation', index: f }, index: i };
    });
  }

  const tableau: Rect[] = [];
  const available = height - tableauY - gap - cardH;
  for (let c = 0; c < TABLEAU_COUNT; c++) {
    const col = state.tableau[c] ?? [];
    const up = state.faceUp[c] ?? 0;
    const nDown = col.length - up;
    const needed = nDown * dDown + Math.max(0, up - 1) * dUp;
    const factor = needed > available ? clamp(available / needed, MIN_COMPRESSION, 1) : 1;
    const x = colX(c);
    let y = tableauY;
    let bottom = tableauY + cardH;
    col.forEach((id, i) => {
      const faceUp = i >= nDown;
      const yy = Math.round(y);
      cards[id] = { id, x, y: yy, z: i, faceUp, place: { pile: 'tableau', index: c }, index: i };
      bottom = yy + cardH;
      y += (faceUp ? dUp : dDown) * factor;
    });
    tableau.push(rect(x, tableauY));
    dropZones.push({ loc: { pile: 'tableau', index: c }, rect: rect(x, tableauY, cardW, bottom - tableauY) });
  }

  return { cardW, cardH, gap, dUp, cards, stock: rect(colX(0), topY), waste: rect(colX(1), topY), foundations, tableau, dropZones };
}

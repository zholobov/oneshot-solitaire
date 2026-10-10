import { sameLoc, type Loc } from '../engine/game';
import type { BoardView } from './board';
import { placeKey, type DropZone, type Layout, type Place, type Rect } from './layout';

/** Pointer movement (px) below which a press counts as a tap. */
export const TAP_SLOP = 6;

export interface InputHandlers {
  /** Whether the engine allows picking up `count` cards at `loc`. */
  canDrag(loc: Loc, count: number): boolean;
  onTapStock(): void;
  /** Tap on a face-up card (smart move); `id` is the tapped card. */
  onTapCard(loc: Loc, count: number, id: number): void;
  /** Drop on a zone; returns true when a move was applied (the board is then already re-rendered). */
  onDrop(from: Loc, count: number, to: Loc): boolean;
  /** A drag ended without a move: re-render so the cards snap back. */
  onDragEnd(): void;
}

interface Gesture {
  pointerId: number;
  kind: 'stock' | 'cards';
  startX: number;
  startY: number;
  moved: boolean;
  loc: Loc;
  count: number;
  ids: number[];
  origins: { x: number; y: number }[];
}

function asLoc(place: Place): Loc | null {
  return place.pile === 'stock' ? null : place;
}

/** Cards that move together when `id` is picked up (bottom first); null when `id` is not the top of a waste/foundation pile. */
export function runFrom(layout: Layout, id: number): number[] | null {
  const p = layout.cards[id];
  if (p === undefined) return null;
  const key = placeKey(p.place);
  const run = layout.cards
    .filter((q) => q !== undefined && placeKey(q.place) === key && q.index >= p.index)
    .sort((a, b) => a.index - b.index)
    .map((q) => q.id);
  if (p.place.pile !== 'tableau' && run.length !== 1) return null;
  return run;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The zone overlapping `lead` the most, excluding the source pile; null when nothing overlaps. */
export function bestDropZone(zones: readonly DropZone[], lead: Rect, from: Loc): DropZone | null {
  let best: DropZone | null = null;
  let bestArea = 0;
  for (const zone of zones) {
    if (sameLoc(zone.loc, from)) continue;
    const area = overlapArea(lead, zone.rect);
    if (area > bestArea) {
      best = zone;
      bestArea = area;
    }
  }
  return best;
}

/** Wires pointer events on the board; returns a function that removes them. */
export function attachInput(view: BoardView, handlers: InputHandlers): () => void {
  const root = view.root;
  let gesture: Gesture | null = null;

  const capture = (e: PointerEvent): void => {
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is a nicety; the handlers still work without it.
    }
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (gesture !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const layout = view.layout;
    if (layout === null) return;
    const id = view.cardIdOf(e.target);
    const placement = id === null ? undefined : layout.cards[id];
    const onStock = placement === undefined ? view.isStockSlot(e.target) : placement.place.pile === 'stock';
    const base = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
    if (onStock) {
      gesture = { ...base, kind: 'stock', loc: { pile: 'waste' }, count: 0, ids: [], origins: [] };
      capture(e);
      return;
    }
    if (id === null || placement === undefined || !placement.faceUp) return;
    const loc = asLoc(placement.place);
    if (loc === null) return;
    const ids = runFrom(layout, id);
    if (ids === null || !handlers.canDrag(loc, ids.length)) return;
    const origins = ids.map((i) => ({ x: layout.cards[i]?.x ?? 0, y: layout.cards[i]?.y ?? 0 }));
    gesture = { ...base, kind: 'cards', loc, count: ids.length, ids, origins };
    capture(e);
  };

  const onPointerMove = (e: PointerEvent): void => {
    const g = gesture;
    if (g === null || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
    if (!g.moved || g.kind !== 'cards') return;
    g.ids.forEach((id, k) => {
      const origin = g.origins[k];
      if (origin !== undefined) view.setDragPosition(id, origin.x + dx, origin.y + dy, k);
    });
  };

  const onPointerUp = (e: PointerEvent): void => {
    const g = gesture;
    if (g === null || e.pointerId !== g.pointerId) return;
    gesture = null;
    if (g.kind === 'stock') {
      if (!g.moved) handlers.onTapStock();
      return;
    }
    if (!g.moved) {
      handlers.onTapCard(g.loc, g.count, g.ids[0] ?? -1);
      return;
    }
    const layout = view.layout;
    const origin = g.origins[0];
    if (layout === null || origin === undefined) {
      handlers.onDragEnd();
      return;
    }
    const lead: Rect = { x: origin.x + (e.clientX - g.startX), y: origin.y + (e.clientY - g.startY), w: layout.cardW, h: layout.cardH };
    const zone = bestDropZone(layout.dropZones, lead, g.loc);
    if (zone === null || !handlers.onDrop(g.loc, g.count, zone.loc)) handlers.onDragEnd();
  };

  const onPointerCancel = (e: PointerEvent): void => {
    const g = gesture;
    if (g === null || e.pointerId !== g.pointerId) return;
    gesture = null;
    if (g.kind === 'cards' && g.moved) handlers.onDragEnd();
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerCancel);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerCancel);
  };
}

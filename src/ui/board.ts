import { DECK_SIZE, cardDescription, isRed, rankLabel, suitGlyph } from '../engine/cards';
import type { GameState } from '../engine/game';
import { computeLayout, placeKey, type Layout, type Size } from './layout';

/** z-index boost for cards that just changed pile, so they fly over the others. */
const LIFT_Z = 500;
const LIFT_MS = 240;
const DRAG_Z = 1000;

/** Owns the 52 card elements and 13 slot elements and positions them from a layout. */
export class BoardView {
  readonly cardEls: HTMLElement[] = [];
  layout: Layout | null = null;
  private readonly stockSlot: HTMLElement;
  private readonly wasteSlot: HTMLElement;
  private readonly foundationSlots: HTMLElement[] = [];
  private readonly tableauSlots: HTMLElement[] = [];
  private readonly lastPlace: string[] = [];
  private liftTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly root: HTMLElement) {
    this.stockSlot = this.makeSlot('stock', '<span class="slot-icon">↻</span>');
    this.wasteSlot = this.makeSlot('waste', '');
    for (let i = 0; i < 4; i++) this.foundationSlots.push(this.makeSlot('foundation', 'A', i));
    for (let i = 0; i < 7; i++) this.tableauSlots.push(this.makeSlot('tableau', '', i));
    for (let id = 0; id < DECK_SIZE; id++) this.cardEls.push(this.makeCard(id));
  }

  private makeSlot(kind: string, html: string, index?: number): HTMLElement {
    const el = document.createElement('div');
    el.className = `slot slot-${kind}`;
    el.dataset.slot = kind;
    if (index !== undefined) el.dataset.index = String(index);
    el.innerHTML = html;
    this.root.appendChild(el);
    return el;
  }

  private makeCard(id: number): HTMLElement {
    const el = document.createElement('div');
    el.className = `card ${isRed(id) ? 'red' : 'black'} face-down`;
    el.dataset.id = String(id);
    el.setAttribute('aria-label', cardDescription(id));
    const rank = rankLabel(id);
    const suit = suitGlyph(id);
    el.innerHTML =
      `<div class="face"><div class="corner tl"><span>${rank}</span><span>${suit}</span></div>` +
      `<div class="pip">${suit}</div><div class="corner br"><span>${rank}</span><span>${suit}</span></div></div>` +
      '<div class="back"></div>';
    this.root.appendChild(el);
    return el;
  }

  measure(): Size {
    return { width: this.root.clientWidth, height: this.root.clientHeight };
  }

  /** Positions every card and slot from the state. Idempotent; safe to call at any time. */
  render(state: GameState, animate = true): Layout {
    const layout = computeLayout(state, this.measure());
    this.layout = layout;
    if (!animate) this.root.classList.add('no-anim');

    const style = this.root.style;
    style.setProperty('--card-w', `${layout.cardW}px`);
    style.setProperty('--card-h', `${layout.cardH}px`);
    style.setProperty('--radius', `${Math.max(3, Math.round(layout.cardW * 0.08))}px`);
    place(this.stockSlot, layout.stock.x, layout.stock.y);
    place(this.wasteSlot, layout.waste.x, layout.waste.y);
    layout.foundations.forEach((r, i) => place(this.foundationSlots[i], r.x, r.y));
    layout.tableau.forEach((r, i) => place(this.tableauSlots[i], r.x, r.y));
    this.stockSlot.classList.toggle('recyclable', state.stock.length === 0 && state.waste.length > 0);

    let lifted = false;
    for (const p of layout.cards) {
      if (p === undefined) continue;
      const el = this.cardEls[p.id];
      if (el === undefined) continue;
      const key = placeKey(p.place);
      const previous = this.lastPlace[p.id];
      const moved = (previous !== undefined && previous !== key) || el.classList.contains('dragging');
      this.lastPlace[p.id] = key;
      el.classList.remove('dragging');
      el.classList.toggle('face-down', !p.faceUp);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      el.style.zIndex = String((moved && animate ? LIFT_Z : 0) + p.z + 1);
      lifted = lifted || (moved && animate);
    }
    if (lifted) this.scheduleSettle();

    if (!animate) {
      void this.root.offsetWidth; // flush styles so the new positions apply without a transition
      this.root.classList.remove('no-anim');
    }
    return layout;
  }

  /** After the move transition, put every card back at its normal stacking order. */
  private scheduleSettle(): void {
    if (this.liftTimer !== null) clearTimeout(this.liftTimer);
    this.liftTimer = setTimeout(() => {
      this.liftTimer = null;
      const layout = this.layout;
      if (layout === null) return;
      for (const p of layout.cards) {
        if (p === undefined) continue;
        const el = this.cardEls[p.id];
        if (el !== undefined && !el.classList.contains('dragging')) el.style.zIndex = String(p.z + 1);
      }
    }, LIFT_MS);
  }

  /** Moves a card during a drag (no transition, above everything). */
  setDragPosition(id: number, x: number, y: number, order: number): void {
    const el = this.cardEls[id];
    if (el === undefined) return;
    el.classList.add('dragging');
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.style.zIndex = String(DRAG_Z + order);
  }

  shake(id: number): void {
    const el = this.cardEls[id];
    if (el === undefined) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  }

  /** Card id for an element inside a card, or null. */
  cardIdOf(target: EventTarget | null): number | null {
    if (!(target instanceof Element)) return null;
    const card = target.closest<HTMLElement>('.card');
    if (card === null) return null;
    const id = Number(card.dataset.id);
    return Number.isInteger(id) ? id : null;
  }

  isStockSlot(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('[data-slot="stock"]') !== null;
  }
}

function place(el: HTMLElement | undefined, x: number, y: number): void {
  if (el !== undefined) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

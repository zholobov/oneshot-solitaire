// DOM rendering and input. Talks to the engine only through its public API.

import { isRed } from './game.js';

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };

export class UI {
  constructor(doc, game, callbacks = {}) {
    this.doc = doc;
    this.board = doc.getElementById('board');
    this.game = game;
    this.callbacks = callbacks; // { onAction() } fired after any state change
    this.nodes = new Map(); // card id -> element
    this.slots = { stock: null, waste: null, f: [], t: [] };
    this.geom = null;
    this.hudMoves = doc.getElementById('hud-moves');
    this.hudTime = doc.getElementById('hud-time');
    this.winOverlay = doc.getElementById('win-overlay');
    this.winStats = doc.getElementById('win-stats');
    this.autoFinishBtn = doc.getElementById('btn-autofinish');
    this.inputLocked = false;
    this.drag = null;
    this.positions = new Map(); // card id -> {x, y, z} at rest
    this.buildSlots();
    this.buildCards();
    this.layoutInstant();
    this.attachInput();
  }

  setGame(game) {
    this.game = game;
    this.render();
  }

  buildSlots() {
    const make = (label) => {
      const el = this.doc.createElement('div');
      el.className = 'slot';
      el.textContent = label;
      this.board.appendChild(el);
      return el;
    };
    this.slots.stock = make('');
    this.slots.stock.dataset.zone = 'stock';
    this.slots.waste = make('');
    for (let i = 0; i < 4; i++) {
      const el = make('A');
      el.dataset.zone = `f${i}`;
      this.slots.f.push(el);
    }
    for (let i = 0; i < 7; i++) {
      const el = make('');
      el.dataset.zone = `t${i}`;
      this.slots.t.push(el);
    }
  }

  buildCards() {
    for (let id = 0; id < 52; id++) {
      const el = this.doc.createElement('div');
      el.dataset.id = id;
      const suit = ['S', 'H', 'D', 'C'][Math.floor(id / 13)];
      const rank = (id % 13) + 1;
      el.className = `card down ${isRed(suit) ? 'red' : 'black'}`;
      const corner = this.doc.createElement('div');
      corner.className = 'corner';
      const r = this.doc.createElement('span');
      r.textContent = RANK_LABELS[rank - 1];
      const s = this.doc.createElement('span');
      s.textContent = SUIT_GLYPHS[suit];
      corner.append(r, s);
      const center = this.doc.createElement('div');
      center.className = 'center';
      center.textContent = SUIT_GLYPHS[suit];
      el.append(corner, center);
      this.board.appendChild(el);
      this.nodes.set(id, el);
    }
  }

  // Reposition everything instantly (initial load, resize) without transitions.
  layoutInstant() {
    this.board.classList.add('no-anim');
    this.layout();
    this.board.getBoundingClientRect(); // flush styles before re-enabling
    requestAnimationFrame(() => this.board.classList.remove('no-anim'));
  }

  layout() {
    const boardW = this.board.clientWidth;
    const boardH = this.board.clientHeight;
    if (boardW === 0) return;
    const gap = 8;
    const cardW = Math.min(Math.floor((boardW - 16 - 6 * gap) / 7), 92);
    const cardH = Math.floor(cardW * 1.4);
    const totalW = 7 * cardW + 6 * gap;
    const left = Math.floor((boardW - totalW) / 2);
    const colX = Array.from({ length: 7 }, (_, i) => left + i * (cardW + gap));
    this.geom = {
      cardW,
      cardH,
      colX,
      row1Y: 8,
      tabY: 8 + cardH + 16,
      fanUp: Math.round(cardH * 0.28),
      fanDown: Math.round(cardH * 0.13),
      wFan: Math.round(cardW * 0.35),
      boardH,
    };
    this.board.style.setProperty('--card-w', `${cardW}px`);
    this.board.style.setProperty('--card-h', `${cardH}px`);
    const place = (el, x, y) => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    place(this.slots.stock, colX[0], this.geom.row1Y);
    place(this.slots.waste, colX[1], this.geom.row1Y);
    for (let i = 0; i < 4; i++) place(this.slots.f[i], colX[3 + i], this.geom.row1Y);
    for (let i = 0; i < 7; i++) place(this.slots.t[i], colX[i], this.geom.tabY);
    this.render();
  }

  // Positions of every card in a tableau pile, compressed to fit the board.
  tableauOffsets(pile) {
    const { cardH, fanUp, fanDown, tabY, boardH } = this.geom;
    let needed = cardH;
    for (let j = 0; j < pile.length - 1; j++) needed += pile[j].faceUp ? fanUp : fanDown;
    const available = boardH - tabY - 8;
    const scale = needed > available ? (available - cardH) / (needed - cardH) : 1;
    const ys = [];
    let y = 0;
    for (let j = 0; j < pile.length; j++) {
      ys.push(Math.round(y));
      y += (pile[j].faceUp ? fanUp : fanDown) * Math.max(scale, 0.2);
    }
    return ys;
  }

  applyPos(el, x, y, z) {
    this.positions.set(Number(el.dataset.id), { x, y, z });
    const transform = `translate3d(${x}px, ${y}px, 0)`;
    if (el.style.transform !== transform) {
      el.style.transform = transform;
      // Keep moving cards above resting ones until the transition ends.
      el.style.zIndex = 300 + z;
      clearTimeout(el._zTimer);
      el._zTimer = setTimeout(() => {
        el.style.zIndex = z;
      }, 180);
    } else if (!el.classList.contains('dragging')) {
      el.style.zIndex = z;
    }
  }

  render() {
    const g = this.game;
    const { colX, row1Y, tabY, wFan } = this.geom;
    const seen = new Set();
    const setCard = (card, x, y, z) => {
      const el = this.nodes.get(card.id);
      el.classList.toggle('down', !card.faceUp);
      this.applyPos(el, x, y, z);
      seen.add(card.id);
    };
    g.stock.forEach((c, j) => setCard(c, colX[0], row1Y, j + 1));
    const wStart = g.drawMode === 3 ? Math.max(0, g.waste.length - 3) : g.waste.length;
    g.waste.forEach((c, j) => {
      const fan = j >= wStart ? (j - wStart) * wFan : 0;
      setCard(c, colX[1] + fan, row1Y, j + 1);
    });
    g.foundations.forEach((pile, i) =>
      pile.forEach((c, j) => setCard(c, colX[3 + i], row1Y, j + 1))
    );
    g.tableau.forEach((pile, i) => {
      const ys = this.tableauOffsets(pile);
      pile.forEach((c, j) => setCard(c, colX[i], tabY + ys[j], j + 1));
    });
    // Stock slot shows a recycle hint when tapping it would recycle the waste.
    this.slots.stock.textContent = g.stock.length === 0 && g.waste.length > 0 ? '↻' : '';
    this.autoFinishBtn.hidden = !g.canAutoFinish();
  }

  // --- input ---

  attachInput() {
    this.board.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.board.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.board.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.board.addEventListener('pointercancel', () => this.cancelDrag());
  }

  boardPoint(e) {
    const r = this.board.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Locate a card id in the game state.
  findCard(id) {
    const g = this.game;
    for (let i = 0; i < 7; i++) {
      const index = g.tableau[i].findIndex((c) => c.id === id);
      if (index >= 0) return { ref: { k: 't', i }, index, pile: g.tableau[i] };
    }
    let index = g.waste.findIndex((c) => c.id === id);
    if (index >= 0) return { ref: { k: 'w' }, index, pile: g.waste };
    for (let i = 0; i < 4; i++) {
      index = g.foundations[i].findIndex((c) => c.id === id);
      if (index >= 0) return { ref: { k: 'f', i }, index, pile: g.foundations[i] };
    }
    index = g.stock.findIndex((c) => c.id === id);
    if (index >= 0) return { ref: { k: 's' }, index, pile: g.stock };
    return null;
  }

  onPointerDown(e) {
    if (this.inputLocked || this.drag) return;
    e.preventDefault();
    const p = this.boardPoint(e);
    const base = { pointerId: e.pointerId, startX: p.x, startY: p.y, moved: false };
    const cardEl = e.target.closest('.card');
    if (cardEl) {
      const id = Number(cardEl.dataset.id);
      const loc = this.findCard(id);
      if (!loc) return;
      if (loc.ref.k === 's') {
        this.drag = { ...base, mode: 'stock' };
      } else {
        const isTop = loc.index === loc.pile.length - 1;
        if ((loc.ref.k === 'w' || loc.ref.k === 'f') && !isTop) return;
        const card = loc.pile[loc.index];
        if (!card.faceUp) return;
        const ids = loc.pile.slice(loc.index).map((c) => c.id);
        this.drag = {
          ...base,
          mode: 'cards',
          from: loc.ref,
          index: loc.index,
          ids,
          origins: ids.map((cid) => ({ ...this.positions.get(cid) })),
        };
      }
    } else if (e.target.closest('.slot')?.dataset.zone === 'stock') {
      this.drag = { ...base, mode: 'stock' };
    } else {
      return;
    }
    this.board.setPointerCapture(e.pointerId);
  }

  onPointerMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId || d.mode !== 'cards') return;
    const p = this.boardPoint(e);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 8) return;
      d.moved = true;
      d.ids.forEach((id, i) => {
        const el = this.nodes.get(id);
        el.classList.add('dragging');
        el.style.zIndex = 1000 + i;
      });
    }
    d.ids.forEach((id, i) => {
      const o = d.origins[i];
      this.nodes.get(id).style.transform = `translate3d(${o.x + dx}px, ${o.y + dy}px, 0)`;
    });
  }

  onPointerUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    const p = this.boardPoint(e);
    const dist = Math.hypot(p.x - d.startX, p.y - d.startY);
    if (d.mode === 'stock') {
      if (dist < 8 && this.game.draw()) this.callbacks.onAction();
      return;
    }
    if (!d.moved) {
      if (this.game.autoMoveFrom(d.from, d.index)) this.callbacks.onAction();
      return;
    }
    d.ids.forEach((id) => this.nodes.get(id).classList.remove('dragging'));
    const to = this.dropTarget(d, p);
    if (to && this.game.moveCard(d.from, d.index, to)) {
      this.callbacks.onAction();
    } else {
      this.render(); // snap back
    }
  }

  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.mode === 'cards' && d.moved) {
      d.ids.forEach((id) => this.nodes.get(id).classList.remove('dragging'));
      this.render();
    }
  }

  // Pick the pile under the dragged card's center, if any.
  dropTarget(d, p) {
    const { colX, cardW, cardH, tabY } = this.geom;
    const o = d.origins[0];
    const cx = o.x + (p.x - d.startX) + cardW / 2;
    const cy = o.y + (p.y - d.startY) + cardH / 2;
    let col = -1;
    for (let i = 0; i < 7; i++) {
      if (Math.abs(cx - (colX[i] + cardW / 2)) <= (cardW + 8) / 2) col = i;
    }
    if (col < 0) return null;
    if (cy < tabY - 4) {
      if (col >= 3) return { k: 'f', i: col - 3 };
      return null; // stock/waste area is not a drop target
    }
    return { k: 't', i: col };
  }

  updateHud(moves, elapsedMs) {
    this.hudMoves.textContent = String(moves);
    const totalS = Math.floor(elapsedMs / 1000);
    const m = Math.floor(totalS / 60);
    const s = String(totalS % 60).padStart(2, '0');
    this.hudTime.textContent = `${m}:${s}`;
  }

  showWin(moves, elapsedMs) {
    const totalS = Math.floor(elapsedMs / 1000);
    const m = Math.floor(totalS / 60);
    const s = String(totalS % 60).padStart(2, '0');
    this.winStats.textContent = `${moves} moves · ${m}:${s}`;
    this.winOverlay.hidden = false;
  }

  hideWin() {
    this.winOverlay.hidden = true;
  }
}

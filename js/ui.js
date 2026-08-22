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
    this.buildSlots();
    this.buildCards();
    this.layoutInstant();
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

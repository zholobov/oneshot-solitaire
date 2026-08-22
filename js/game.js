// Pure Klondike engine. No DOM access — runs in browser and Node.

export const SUITS = ['S', 'H', 'D', 'C'];

const HISTORY_CAP = 200;

export function isRed(suit) {
  return suit === 'H' || suit === 'D';
}

export function makeCard(id) {
  return { id, suit: SUITS[Math.floor(id / 13)], rank: (id % 13) + 1, faceUp: false };
}

function encodeCard(card) {
  return card.id * 2 + (card.faceUp ? 1 : 0);
}

function decodeCard(n) {
  const card = makeCard(Math.floor(n / 2));
  card.faceUp = n % 2 === 1;
  return card;
}

export function canPlaceOnTableau(card, pile) {
  if (pile.length === 0) return card.rank === 13;
  const top = pile[pile.length - 1];
  return top.faceUp && isRed(top.suit) !== isRed(card.suit) && card.rank === top.rank - 1;
}

export function canPlaceOnFoundation(card, pile) {
  if (pile.length === 0) return card.rank === 1;
  const top = pile[pile.length - 1];
  return top.suit === card.suit && card.rank === top.rank + 1;
}

function isValidRun(cards) {
  for (let i = 1; i < cards.length; i++) {
    const above = cards[i];
    const below = cards[i - 1];
    if (above.rank !== below.rank - 1 || isRed(above.suit) === isRed(below.suit)) return false;
  }
  return true;
}

// Throws unless s is a structurally valid game state holding each of the
// 52 cards exactly once.
function validateState(s) {
  if (!s || typeof s !== 'object') throw new Error('not an object');
  if (s.drawMode !== 1 && s.drawMode !== 3) throw new Error('bad drawMode');
  if (!Number.isInteger(s.moves) || s.moves < 0) throw new Error('bad moves');
  if (typeof s.won !== 'boolean') throw new Error('bad won');
  if (!Array.isArray(s.stock) || !Array.isArray(s.waste)) throw new Error('bad piles');
  if (!Array.isArray(s.f) || s.f.length !== 4 || !s.f.every(Array.isArray))
    throw new Error('bad foundations');
  if (!Array.isArray(s.t) || s.t.length !== 7 || !s.t.every(Array.isArray))
    throw new Error('bad tableau');
  const all = [...s.stock, ...s.waste, ...s.f.flat(), ...s.t.flat()];
  const ids = new Set();
  for (const n of all) {
    if (!Number.isInteger(n) || n < 0 || n > 103) throw new Error('bad card');
    ids.add(Math.floor(n / 2));
  }
  if (all.length !== 52 || ids.size !== 52) throw new Error('bad card set');
}

export class Game {
  constructor() {
    this.stock = [];
    this.waste = [];
    this.foundations = [[], [], [], []];
    this.tableau = [[], [], [], [], [], [], []];
    this.drawMode = 1;
    this.moves = 0;
    this.won = false;
    this.history = [];
  }

  newGame(drawMode = 1, rng = Math.random) {
    const deck = Array.from({ length: 52 }, (_, i) => makeCard(i));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    this.foundations = [[], [], [], []];
    this.tableau = [[], [], [], [], [], [], []];
    this.waste = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j <= i; j++) {
        const card = deck.pop();
        card.faceUp = j === i;
        this.tableau[i].push(card);
      }
    }
    this.stock = deck;
    this.drawMode = drawMode;
    this.moves = 0;
    this.won = false;
    this.history = [];
  }

  draw() {
    if (this.stock.length === 0) {
      if (this.waste.length === 0) return false;
      this.pushHistory();
      this.stock = this.waste.reverse().map((c) => ((c.faceUp = false), c));
      this.waste = [];
      return true;
    }
    this.pushHistory();
    const n = Math.min(this.drawMode, this.stock.length);
    for (let i = 0; i < n; i++) {
      const card = this.stock.pop();
      card.faceUp = true;
      this.waste.push(card);
    }
    this.moves++;
    return true;
  }

  pile(ref) {
    if (!ref || typeof ref !== 'object') return null;
    if (ref.k === 'w') return this.waste;
    if (ref.k === 'f') return this.foundations[ref.i] ?? null;
    if (ref.k === 't') return this.tableau[ref.i] ?? null;
    return null;
  }

  moveCard(from, index, to) {
    const src = this.pile(from);
    const dst = this.pile(to);
    if (!src || !dst || src === dst) return false;
    if (!Number.isInteger(index) || index < 0 || index >= src.length) return false;
    const cards = src.slice(index);
    if (cards.some((c) => !c.faceUp)) return false;
    // Only tableau sources may move more than the top card.
    if (from.k !== 't' && index !== src.length - 1) return false;
    if (cards.length > 1) {
      if (from.k !== 't' || to.k !== 't') return false;
      if (!isValidRun(cards)) return false;
    }
    if (to.k === 'f') {
      if (from.k === 'f') return false;
      if (!canPlaceOnFoundation(cards[0], dst)) return false;
    } else if (to.k === 't') {
      if (!canPlaceOnTableau(cards[0], dst)) return false;
    } else {
      return false; // waste is never a destination
    }
    this.pushHistory();
    src.length = index;
    dst.push(...cards);
    if (from.k === 't' && src.length > 0 && !src[src.length - 1].faceUp) {
      src[src.length - 1].faceUp = true;
    }
    this.moves++;
    if (this.foundations.every((f) => f.length === 13)) this.won = true;
    return true;
  }

  // Smart move: single cards try foundations first, then tableau left-to-right;
  // runs are tableau-only. Skips moving a king-led run that is already at the
  // bottom of its pile onto another empty pile (a no-op for gameplay).
  autoMoveFrom(from, index) {
    const src = this.pile(from);
    if (!src || index < 0 || index >= src.length) return false;
    const cards = src.slice(index);
    const single = cards.length === 1;
    if (single && from.k !== 'f') {
      for (let i = 0; i < 4; i++) {
        if (this.moveCard(from, index, { k: 'f', i })) return true;
      }
    }
    const pointlessKing = from.k === 't' && index === 0 && cards[0].rank === 13;
    for (let i = 0; i < 7; i++) {
      if (pointlessKing && this.tableau[i].length === 0) continue;
      if (this.moveCard(from, index, { k: 't', i })) return true;
    }
    return false;
  }

  canAutoFinish() {
    return (
      !this.won &&
      this.stock.length === 0 &&
      this.waste.length === 0 &&
      this.tableau.every((p) => p.every((c) => c.faceUp))
    );
  }

  autoFinishStep() {
    if (!this.canAutoFinish()) return false;
    let best = null; // {i, rank}
    for (let i = 0; i < 7; i++) {
      const pile = this.tableau[i];
      if (pile.length === 0) continue;
      const top = pile[pile.length - 1];
      if (this.foundations.some((f) => canPlaceOnFoundation(top, f))) {
        if (!best || top.rank < best.rank) best = { i, rank: top.rank };
      }
    }
    if (!best) return false;
    return this.autoMoveFrom({ k: 't', i: best.i }, this.tableau[best.i].length - 1);
  }

  undo() {
    if (this.history.length === 0) return false;
    this.applyState(this.history.pop());
    return true;
  }

  serialize() {
    const s = this.encodeState();
    s.history = this.history.map((h) => ({ ...h }));
    return s;
  }

  static deserialize(obj) {
    validateState(obj);
    const g = new Game();
    g.applyState(obj);
    g.history = Array.isArray(obj.history)
      ? obj.history.filter((h) => {
          try {
            validateState(h);
            return true;
          } catch {
            return false;
          }
        })
      : [];
    return g;
  }

  // --- history ---

  pushHistory() {
    this.history.push(this.encodeState());
    if (this.history.length > HISTORY_CAP) this.history.shift();
  }

  encodeState() {
    return {
      v: 1,
      drawMode: this.drawMode,
      moves: this.moves,
      won: this.won,
      stock: this.stock.map(encodeCard),
      waste: this.waste.map(encodeCard),
      f: this.foundations.map((p) => p.map(encodeCard)),
      t: this.tableau.map((p) => p.map(encodeCard)),
    };
  }

  applyState(s) {
    this.drawMode = s.drawMode;
    this.moves = s.moves;
    this.won = s.won;
    this.stock = s.stock.map(decodeCard);
    this.waste = s.waste.map(decodeCard);
    this.foundations = s.f.map((p) => p.map(decodeCard));
    this.tableau = s.t.map((p) => p.map(decodeCard));
  }
}

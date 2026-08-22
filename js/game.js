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

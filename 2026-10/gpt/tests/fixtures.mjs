import { deal, shuffledDeck } from "../dist/game.js";
import { createSession } from "../dist/session.js";

export const up = id => ({ id, faceUp: true });
export const down = id => ({ id, faceUp: false });

export function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export const seededSession = seed => createSession(deal(shuffledDeck(random(seed))));

export function position({ tableau = [], foundations = [], waste = [], moves = 0 } = {}) {
  tableau = Array.from({ length: 7 }, (_, i) => tableau[i] ?? []);
  foundations = Array.from({ length: 4 }, (_, i) => foundations[i] ?? []);
  const used = new Set([...tableau.flat(), ...foundations.flat(), ...waste].map(card => card.id));
  const stock = Array.from({ length: 52 }, (_, id) => id).filter(id => !used.has(id)).map(down);
  return { tableau, foundations, waste, stock, moves };
}

export function solvableSession() {
  let cursor = 0;
  const piles = Array.from({ length: 7 }, (_, index) =>
    Array.from({ length: index + 1 }, () => cursor++).reverse());
  const dealt = [];
  for (let row = 0; row < 7; row++) {
    for (let column = row; column < 7; column++) dealt.push(piles[column][row]);
  }
  const stock = Array.from({ length: 24 }, (_, index) => index + 28).reverse();
  return createSession(deal([...stock, ...dealt.reverse()]));
}

export function openEndgame() {
  const session = seededSession(11);
  session.state = position({
    tableau: [[12, 24, 36], [25, 37, 49], [38, 50, 10], [51, 11, 23]].map(pile => pile.map(up)),
    foundations: Array.from({ length: 4 }, (_, index) =>
      Array.from({ length: 10 }, (_, rank) => up(index * 13 + rank))),
    moves: 60,
  });
  return session;
}

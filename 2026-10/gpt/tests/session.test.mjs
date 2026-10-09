import assert from "node:assert/strict";
import { test } from "node:test";
import { isGameState, isWon } from "../dist/game.js";
import { MAX_UNDO, advance, decodeSession, encodeSession, finish, restart, undo } from "../dist/session.js";
import { openEndgame, seededSession } from "./fixtures.mjs";

const draw = { type: "draw" };

test("undo exactly restores a draw, a recycle, and its move count", () => {
  const start = seededSession(7);
  const next = advance(start, draw);
  assert.deepEqual(undo(next), start);
  assert.equal(undo(start), null);
  let session = start;
  for (let i = 0; i < 24; i++) session = advance(session, draw);
  assert.deepEqual(undo(advance(session, draw)), session);
  assert.deepEqual(start.history, []);
});

test("history is bounded, survives a reload, and restart restores the original deal", () => {
  let session = seededSession(7);
  const initial = structuredClone(session.initial);
  for (let i = 0; i < MAX_UNDO + 40; i++) session = advance(session, draw);
  session.elapsedMs = 85123.75;
  assert.equal(session.history.length, MAX_UNDO);
  assert.equal(session.history[0].moves, 40);
  const restored = decodeSession(encodeSession(session));
  assert.equal(restored.elapsedMs, 85123);
  assert.deepEqual(restored.state, session.state);
  assert.deepEqual(restored.history, session.history);
  assert.equal(undo(restored).state.moves, 239);
  assert.deepEqual(restart(restored), { version: 1, initial, state: initial, history: [], elapsedMs: 0 });
});

test("auto-finish makes only legal moves, detects a win, and remains undoable", () => {
  const initial = openEndgame();
  const completed = finish(initial);
  assert.equal(isWon(completed.state), true);
  assert.equal(isGameState(completed.state), true);
  assert.equal(completed.state.moves, 72);
  assert.equal(completed.history.length, 12);
  assert.equal(isWon(undo(completed).state), false);
  assert.equal(initial.state.moves, 60);
  assert.deepEqual(decodeSession(encodeSession(completed)), completed);
  assert.equal(finish(seededSession(1)), null);
  assert.equal(finish(completed), null);
});

test("invalid actions cannot change the game or its undo history", () => {
  const session = seededSession(7);
  const snapshot = encodeSession(session);
  assert.equal(advance(session, {
    type: "move", from: { pile: "tableau", index: 6, cardIndex: 0 }, to: { pile: "tableau", index: 0 },
  }), null);
  assert.equal(encodeSession(session), snapshot);
});

test("malformed or incompatible saved data is rejected explicitly", () => {
  for (const raw of ["{", "null", "[]", "{}", JSON.stringify({ version: 2 }), " ".repeat(1_000_001)]) {
    assert.throws(() => decodeSession(raw));
  }
  const corruptions = [
    value => { value.version = 2; },
    value => { value.state.stock.pop(); },
    value => { value.state.stock[0].id = value.state.stock[1].id; },
    value => { value.state.stock[0].id = -1; },
    value => { value.state.stock[0].id = 52; },
    value => { value.state.stock[0].id = 1.5; },
    value => { value.state.stock[0].faceUp = true; },
    value => { value.state.tableau[0][0].faceUp = false; },
    value => { value.state.tableau[6][0].faceUp = true; },
    value => { value.state.tableau.pop(); },
    value => { value.state.foundations.pop(); },
    value => { value.state.moves = -1; },
    value => { value.state.moves = 1.5; },
    value => { value.state.moves = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.elapsedMs = -1; },
    value => { value.elapsedMs = null; },
    value => { value.history = Array(MAX_UNDO + 1).fill(value.state); },
    value => { value.initial.moves = 1; },
    value => { value.initial.tableau.reverse(); },
  ];
  for (const corrupt of corruptions) {
    const value = JSON.parse(encodeSession(seededSession(42)));
    corrupt(value);
    assert.throws(() => decodeSession(JSON.stringify(value)), corrupt.toString());
  }
});

test("illegal foundation ordering, invalid runs, hidden waste, and broken history are rejected", () => {
  for (const mutate of [
    value => { value.state.foundations[0].reverse(); },
    value => { value.state.tableau[0].reverse(); },
    value => { value.state.tableau[0][1].faceUp = false; },
  ]) {
    const value = openEndgame();
    mutate(value);
    assert.throws(() => decodeSession(JSON.stringify(value)));
  }
  const drawn = advance(seededSession(9), draw);
  drawn.state.waste[0] = { ...drawn.state.waste[0], faceUp: false };
  assert.throws(() => decodeSession(JSON.stringify(drawn)));
  const inconsistent = advance(seededSession(9), draw);
  inconsistent.history[0] = { ...inconsistent.history[0], moves: 100 };
  assert.throws(() => decodeSession(JSON.stringify(inconsistent)));
});

// localStorage persistence. No DOM access; backing store is injectable for tests.

import { Game } from './game.js';

export const STORAGE_KEY = 'klondike-v1';

export function createStorage(backing = globalThis.localStorage) {
  return {
    save({ game, elapsedMs }) {
      try {
        backing.setItem(STORAGE_KEY, JSON.stringify({ game: game.serialize(), elapsedMs }));
      } catch {
        // Quota or privacy-mode errors: the game just won't persist.
      }
    },
    load() {
      let raw;
      try {
        raw = backing.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
      if (raw == null) return null;
      try {
        const data = JSON.parse(raw);
        const game = Game.deserialize(data.game);
        const elapsedMs = Number.isFinite(data.elapsedMs) ? data.elapsedMs : 0;
        return { game, elapsedMs };
      } catch {
        this.clear();
        return null;
      }
    },
    clear() {
      try {
        backing.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

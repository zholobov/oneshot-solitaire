import { describe, expect, it, vi } from "vitest";

import { createNewGame } from "./game";
import { loadSession, saveSession } from "./storage";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("saved sessions", () => {
  it("round-trips a current game and undo history", () => {
    const storage = new MemoryStorage();
    const state = createNewGame(12);
    const previous = createNewGame(11);

    expect(saveSession(state, [previous], storage)).toBeNull();
    expect(loadSession(storage)).toEqual({
      session: {
        state,
        history: [previous],
      },
      error: null,
    });
  });

  it("discards malformed saved data with an explicit error", () => {
    const storage = new MemoryStorage();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    storage.setItem("oneshot-solitaire.session.v1", "{broken");

    const result = loadSession(storage);

    expect(result.session).toBeNull();
    expect(result.error).toContain("could not be read");
    expect(loadSession(storage).session).toBeNull();
    consoleError.mockRestore();
  });

  it("reports storage access failures instead of silently continuing", () => {
    const erroringStorage = {
      getItem(): string | null {
        throw new DOMException("Denied", "SecurityError");
      },
      setItem(): void {
        throw new DOMException("Denied", "SecurityError");
      },
      removeItem(): void {
        throw new DOMException("Denied", "SecurityError");
      },
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = createNewGame(13);

    expect(loadSession(erroringStorage).error).toContain("unavailable");
    expect(saveSession(state, [], erroringStorage)).toContain("could not be saved");
    consoleError.mockRestore();
  });
});

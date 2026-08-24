import { isGameState, type GameState } from "./game";

const STORAGE_KEY = "oneshot-solitaire.session.v1";
export const MAX_HISTORY = 80;

export interface SavedSession {
  state: GameState;
  history: GameState[];
}

interface StoredSession extends SavedSession {
  version: 1;
}

export interface LoadResult {
  session: SavedSession | null;
  error: string | null;
}

type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    isGameState(candidate.state) &&
    Array.isArray(candidate.history) &&
    candidate.history.every(isGameState)
  );
}

function discardInvalidSession(storage: StorageAdapter): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Unable to remove invalid saved Solitaire data.", error);
  }
}

export function loadSession(storage?: StorageAdapter): LoadResult {
  let activeStorage: StorageAdapter;
  let serialized: string | null;

  try {
    activeStorage = storage ?? window.localStorage;
    serialized = activeStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Unable to read saved Solitaire data.", error);
    return {
      session: null,
      error: "Progress storage is unavailable. This game will continue without saving.",
    };
  }

  if (serialized === null) {
    return { session: null, error: null };
  }

  try {
    const parsed: unknown = JSON.parse(serialized);

    if (!isStoredSession(parsed)) {
      discardInvalidSession(activeStorage);
      return {
        session: null,
        error: "The saved game was invalid, so a fresh deal was started.",
      };
    }

    return {
      session: {
        state: parsed.state,
        history: parsed.history.slice(-MAX_HISTORY),
      },
      error: null,
    };
  } catch (error) {
    console.error("Unable to parse saved Solitaire data.", error);
    discardInvalidSession(activeStorage);
    return {
      session: null,
      error: "The saved game could not be read, so a fresh deal was started.",
    };
  }
}

export function saveSession(
  state: GameState,
  history: GameState[],
  storage?: StorageAdapter,
): string | null {
  const session: StoredSession = {
    version: 1,
    state,
    history: history.slice(-MAX_HISTORY),
  };

  try {
    const activeStorage = storage ?? window.localStorage;
    activeStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return null;
  } catch (error) {
    console.error("Unable to save Solitaire progress.", error);
    return "Progress could not be saved on this device.";
  }
}

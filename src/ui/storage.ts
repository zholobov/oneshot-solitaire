export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const SAVE_KEY = 'klondike.save.v1';
export const SETTINGS_KEY = 'klondike.settings.v1';

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

function detectLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Wraps localStorage; every failure (private mode, quota, disabled) is logged and ignored. */
export function localStorageStore(storage: Storage | undefined = detectLocalStorage()): KeyValueStore {
  if (storage === undefined) return memoryStore();
  const guard = <T>(op: () => T, fallback: T): T => {
    try {
      return op();
    } catch (error) {
      console.warn('Storage unavailable:', error);
      return fallback;
    }
  };
  return {
    get: (key) => guard(() => storage.getItem(key), null),
    set: (key, value) => guard(() => storage.setItem(key, value), undefined),
    remove: (key) => guard(() => storage.removeItem(key), undefined),
  };
}

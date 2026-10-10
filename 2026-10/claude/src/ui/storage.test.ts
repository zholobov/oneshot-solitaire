import { describe, expect, test, vi } from 'vitest';
import { localStorageStore, memoryStore } from './storage';

describe('storage', () => {
  test('memoryStore get/set/remove', () => {
    const s = memoryStore();
    expect(s.get('a')).toBeNull();
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
    s.remove('a');
    expect(s.get('a')).toBeNull();
  });

  test('localStorageStore swallows storage errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const s = localStorageStore(broken);
    expect(s.get('a')).toBeNull();
    expect(() => s.set('a', '1')).not.toThrow();
    expect(() => s.remove('a')).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('localStorageStore falls back to memory when no storage is given', () => {
    const s = localStorageStore(undefined);
    s.set('k', 'v');
    expect(s.get('k')).toBe('v');
  });
});

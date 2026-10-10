import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CONFIRM_MS, confirmable, formatTime } from './hud';

describe('formatTime', () => {
  test('formats minutes and seconds, adding hours when needed', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65_000)).toBe('01:05');
    expect(formatTime(3_600_000)).toBe('1:00:00');
    expect(formatTime(-5)).toBe('00:00');
    expect(formatTime(59_999)).toBe('00:59');
  });
});

/** Minimal stand-in for an HTMLElement button. */
function fakeButton(label: string) {
  const classes = new Set<string>();
  let handler: (() => void) | null = null;
  const button = {
    textContent: label,
    classList: {
      add: (c: string) => void classes.add(c),
      remove: (c: string) => void classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
    addEventListener: (_type: string, fn: () => void) => {
      handler = fn;
    },
  };
  return { button: button as unknown as HTMLElement, click: () => handler?.(), classes };
}

describe('confirmable', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('runs immediately when no confirmation is needed', () => {
    const action = vi.fn();
    const { button, click } = fakeButton('New game');
    confirmable(button, () => false, action);
    click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('New game');
  });

  test('arms on the first tap, runs on the second, disarms after the timeout', () => {
    const action = vi.fn();
    const { button, click, classes } = fakeButton('New game');
    confirmable(button, () => true, action);
    click();
    expect(action).not.toHaveBeenCalled();
    expect(button.textContent).toBe('Tap again to confirm');
    expect(classes.has('armed')).toBe(true);
    click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('New game');
    click();
    vi.advanceTimersByTime(CONFIRM_MS);
    expect(button.textContent).toBe('New game');
    expect(classes.has('armed')).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test('the returned disarm function cancels a pending confirmation', () => {
    const action = vi.fn();
    const { button, click } = fakeButton('Replay');
    const disarm = confirmable(button, () => true, action);
    click();
    disarm();
    expect(button.textContent).toBe('Replay');
    click();
    expect(action).not.toHaveBeenCalled();
  });
});

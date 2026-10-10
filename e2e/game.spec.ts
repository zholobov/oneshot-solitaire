import { expect, test, type Page } from '@playwright/test';

interface GameState {
  seed: number;
  drawCount: 1 | 3;
  stock: number[];
  waste: number[];
  wasteFan: number;
  foundations: number[][];
  tableau: number[][];
  faceUp: number[];
  moves: number;
}

declare global {
  interface Window {
    __solitaire?: { getState(): unknown; loadState(value: unknown): void };
  }
}

const S = (r: number) => 0 * 13 + r - 1;
const H = (r: number) => 1 * 13 + r - 1;
const D = (r: number) => 2 * 13 + r - 1;
const C = (r: number) => 3 * 13 + r - 1;

/** Builds a state; cards not mentioned go face-down into the stock. */
function fixture(parts: Partial<GameState>): GameState {
  const tableau = parts.tableau ?? [[], [], [], [], [], [], []];
  const foundations = parts.foundations ?? [[], [], [], []];
  const waste = parts.waste ?? [];
  const used = new Set([...waste, ...foundations.flat(), ...tableau.flat()]);
  const stock = Array.from({ length: 52 }, (_, i) => i).filter((id) => !used.has(id));
  return {
    seed: 1,
    drawCount: parts.drawCount ?? 1,
    stock,
    waste,
    wasteFan: parts.wasteFan ?? (waste.length > 0 ? 1 : 0),
    foundations,
    tableau,
    faceUp: parts.faceUp ?? tableau.map((c) => (c.length > 0 ? 1 : 0)),
    moves: parts.moves ?? 0,
  };
}

function fullRunState(): GameState {
  const run = (a: (r: number) => number, b: (r: number) => number) =>
    Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? a(13 - i) : b(13 - i)));
  const tableau = [run(S, H), run(H, S), run(D, C), run(C, D), [], [], []];
  return fixture({ tableau, faceUp: tableau.map((c) => c.length) });
}

const getState = (page: Page): Promise<GameState> => page.evaluate(() => window.__solitaire!.getState() as GameState);
const loadState = (page: Page, state: GameState): Promise<void> => page.evaluate((s) => window.__solitaire!.loadState(s), state);

/** Waits for the 180 ms card-move transition to finish so positions are stable. */
const settle = (page: Page): Promise<void> => page.waitForTimeout(300);

/** Drags a card by its visible top strip so that it ends centred on the target element. */
async function drag(page: Page, fromSelector: string, toSelector: string): Promise<void> {
  await settle(page);
  const from = await page.locator(fromSelector).boundingBox();
  const to = await page.locator(toSelector).boundingBox();
  if (from === null || to === null) throw new Error(`No box for ${fromSelector} or ${toSelector}`);
  const grab = { x: from.x + from.width / 2, y: from.y + 10 };
  const end = { x: to.x + to.width / 2 + (grab.x - (from.x + from.width / 2)), y: to.y + to.height / 2 + (grab.y - (from.y + from.height / 2)) };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(grab.x + ((end.x - grab.x) * i) / 12, grab.y + ((end.y - grab.y) * i) / 12);
  }
  await page.mouse.up();
}

const card = (id: number) => `.card[data-id="${id}"]`;
const slot = (kind: string, index?: number) =>
  index === undefined ? `[data-slot="${kind}"]` : `[data-slot="${kind}"][data-index="${index}"]`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(52);
});

test('deals a fresh game', async ({ page }) => {
  const state = await getState(page);
  expect(state.moves).toBe(0);
  expect(state.stock).toHaveLength(24);
  await expect(page.locator('.card:not(.face-down)')).toHaveCount(7);
  await expect(page.locator('#moves')).toHaveText('Moves 0');
  await page.screenshot({ path: 'test-results/portrait-deal.png' });
});

test('tapping the stock draws a card and undo restores it', async ({ page }) => {
  const before = await getState(page);
  const top = before.stock[before.stock.length - 1]!;
  await page.tap(card(top));
  const after = await getState(page);
  expect(after.waste).toEqual([top]);
  expect(after.moves).toBe(1);
  await expect(page.locator('#moves')).toHaveText('Moves 1');
  await page.locator('#undo-btn').click();
  expect((await getState(page)).waste).toEqual([]);
  await expect(page.locator('#undo-btn')).toBeDisabled();
});

test('recycles the waste when the stock is empty', async ({ page }) => {
  const base = fixture({ waste: [S(5), H(9)], wasteFan: 1 });
  await loadState(page, { ...base, waste: [...base.waste, ...base.stock], stock: [] });
  await expect(page.locator(slot('stock'))).toHaveClass(/recyclable/);
  await page.tap(slot('stock'));
  const state = await getState(page);
  expect(state.waste).toEqual([]);
  expect(state.stock).toHaveLength(52);
});

test('tapping a card moves it to the foundation', async ({ page }) => {
  await loadState(page, fixture({ waste: [H(1)] }));
  await page.tap(card(H(1)));
  const state = await getState(page);
  expect(state.foundations[0]).toEqual([H(1)]);
  expect(state.waste).toEqual([]);
});

test('tapping a card with no legal move leaves the state unchanged', async ({ page }) => {
  await loadState(page, fixture({ waste: [H(7)] }));
  await page.tap(card(H(7)));
  expect((await getState(page)).waste).toEqual([H(7)]);
});

test('dragging a run onto a legal column moves it; an illegal drop snaps back', async ({ page }) => {
  await loadState(page, fixture({ tableau: [[S(13)], [H(12), C(11)], [D(3)], [], [], [], []], faceUp: [1, 2, 1, 0, 0, 0, 0] }));
  await drag(page, card(H(12)), card(S(13)));
  let state = await getState(page);
  expect(state.tableau[0]).toEqual([S(13), H(12), C(11)]);
  expect(state.tableau[1]).toEqual([]);
  expect(state.moves).toBe(1);

  await settle(page);
  const before = await page.locator(card(C(11))).boundingBox();
  await drag(page, card(C(11)), card(D(3)));
  state = await getState(page);
  expect(state.tableau[0]).toEqual([S(13), H(12), C(11)]);
  expect(state.moves).toBe(1);
  await expect
    .poll(async () => {
      const box = await page.locator(card(C(11))).boundingBox();
      return box && before ? Math.abs(box.x - before.x) + Math.abs(box.y - before.y) : 999;
    })
    .toBeLessThan(2);
});

test('dragging a king to an empty column works and flips the exposed card', async ({ page }) => {
  await loadState(page, fixture({ tableau: [[D(2), C(13)], [], [], [], [], [], []], faceUp: [1, 0, 0, 0, 0, 0, 0] }));
  await expect(page.locator(card(D(2)))).toHaveClass(/face-down/);
  await drag(page, card(C(13)), slot('tableau', 4));
  const state = await getState(page);
  expect(state.tableau[4]).toEqual([C(13)]);
  expect(state.tableau[0]).toEqual([D(2)]);
  expect(state.faceUp[0]).toBe(1);
  await expect(page.locator(card(D(2)))).not.toHaveClass(/face-down/);
});

test('auto finish completes the game and shows the win overlay', async ({ page }) => {
  await loadState(page, fullRunState());
  await expect(page.locator('#auto-finish-btn')).toBeVisible();
  await page.locator('#auto-finish-btn').click();
  await expect(page.locator('#win')).toBeVisible({ timeout: 30_000 });
  const state = await getState(page);
  expect(state.foundations.map((f) => f.length)).toEqual([13, 13, 13, 13]);
  await expect(page.locator('#win-stats')).toContainText('52 moves');
  await page.screenshot({ path: 'test-results/win.png' });
  await page.locator('#win-new-game-btn').click();
  await expect(page.locator('#win')).toBeHidden();
  expect((await getState(page)).moves).toBe(0);
});

test('the game survives a reload', async ({ page }) => {
  const before = await getState(page);
  await page.tap(card(before.stock[before.stock.length - 1]!));
  await page.tap(card(before.stock[before.stock.length - 2]!));
  const played = await getState(page);
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(52);
  expect(await getState(page)).toEqual(played);
  await expect(page.locator('#moves')).toHaveText('Moves 2');
});

test('menu: new game needs confirmation; draw 3 fans three cards', async ({ page }) => {
  const before = await getState(page);
  await page.tap(card(before.stock[before.stock.length - 1]!));
  await page.locator('#menu-btn').click();
  await page.locator('#new-game-btn').click();
  await expect(page.locator('#new-game-btn')).toHaveText('Tap again to confirm');
  await page.locator('#new-game-btn').click();
  await expect(page.locator('#menu')).toBeHidden();
  expect((await getState(page)).moves).toBe(0);

  await page.locator('#menu-btn').click();
  await page.locator('#draw-3-btn').click();
  await expect(page.locator('#menu')).toBeHidden();
  const s3 = await getState(page);
  expect(s3.drawCount).toBe(3);
  await page.tap(card(s3.stock[s3.stock.length - 1]!));
  const drawn = await getState(page);
  expect(drawn.waste).toHaveLength(3);
  const fanXs = async () => Promise.all(drawn.waste.map(async (id) => (await page.locator(card(id)).boundingBox())!.x));
  // Wait for the move transition to finish, then the three cards must be fanned left to right.
  await expect.poll(async () => { const xs = await fanXs(); return Math.min(xs[1]! - xs[0]!, xs[2]! - xs[1]!); }).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/draw3.png' });
});

test('serves a manifest and works offline after the service worker installs', async ({ page, context }) => {
  const manifest = await page.request.get('manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe('Solitaire');
  // The precache list must name each file once; Workbox only tolerates duplicates by luck of equal revisions.
  const sw = await (await page.request.get('sw.js')).text();
  const urls = [...sw.matchAll(/\{url:"([^"]+)"/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(5);
  expect(new Set(urls).size).toBe(urls.length);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(52);
  await context.setOffline(false);
});

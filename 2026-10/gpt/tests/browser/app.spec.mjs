import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { applyAction, canMove, isGameState, legalMoves, movingCards, suit } from "../../dist/game.js";
import { SAVE_KEY, advance } from "../../dist/session.js";
import { down, openEndgame, position, seededSession, solvableSession, up } from "../fixtures.mjs";
import { activate, chooseCard, openGame, saved } from "./helpers.mjs";

const errors = new WeakMap();
test.beforeEach(({ page }) => {
  errors.set(page, []);
  page.on("pageerror", error => errors.get(page).push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

function movableDeal() {
  for (let seed = 1; seed < 100; seed++) {
    const session = seededSession(seed);
    const move = legalMoves(session.state).find(({ from, to }) =>
      from.pile === "tableau" && from.cardIndex > 0 && to.pile === "tableau");
    if (move) return { session, move };
  }
  throw new Error("The test needs a deal with a move that reveals a hidden card.");
}

test("a phone-ready deal draws by touch, saves, reloads, and undoes", async ({ page, isMobile }) => {
  const initial = seededSession(42);
  await openGame(page, initial);
  await expect(page.locator(".tableau-column")).toHaveCount(7);
  await expect(page.locator(".home-pile")).toHaveCount(4);
  await expect(page.locator("[data-source]")).toHaveCount(7);
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator("#moves")).toHaveText("0");
  await activate(page.locator("#stock"), isMobile);
  await activate(page.locator("#stock"), isMobile);
  const played = await saved(page);
  expect(played.state.moves).toBe(2);
  expect(played.state.stock).toHaveLength(22);
  expect(played.state.waste).toHaveLength(2);
  await page.reload();
  await expect(page.locator("#moves")).toHaveText("2");
  expect((await saved(page)).state).toEqual(played.state);
  await activate(page.locator("#undo"), isMobile);
  await activate(page.locator("#undo"), isMobile);
  expect((await saved(page)).state).toEqual(initial.state);
  await expect(page.locator("#undo")).toBeDisabled();
});

test("tap-to-select moves a card to a highlighted column and uncovers the card beneath", async ({ page, isMobile }) => {
  const { session, move } = movableDeal();
  const source = movingCards(session.state, move.from)[0];
  await openGame(page, session);
  await chooseCard(page, source.id, isMobile);
  await expect(page.locator(`[data-target="t${move.to.index}"]`)).toHaveClass(/is-legal/);
  await activate(page.locator(`[data-target="t${move.to.index}"] button`).last(), isMobile);
  expect((await saved(page)).state).toEqual(applyAction(session.state, move));
  const revealed = session.state.tableau[move.from.index][move.from.cardIndex - 1];
  await expect(page.locator(`#card-${revealed.id}`)).toBeVisible();
  await activate(page.locator("#undo"), isMobile);
  expect((await saved(page)).state).toEqual(session.state);
  await expect(page.locator(`#card-${revealed.id}`)).toHaveCount(0);
});

test("illegal moves explain the rule and change neither cards nor undo history", async ({ page, isMobile }) => {
  const session = seededSession(42);
  const pile = session.state.tableau.findIndex(cards => cards.at(-1).id % 13 !== 0);
  const card = session.state.tableau[pile].at(-1);
  await openGame(page, session);
  await chooseCard(page, card.id, isMobile);
  await activate(page.locator('[data-target="f0"] button'), isMobile);
  await expect(page.locator("#message")).toContainText("ace to king");
  await expect(page.locator(`#card-${card.id}`)).toHaveAttribute("aria-pressed", "true");
  expect((await saved(page)).state).toEqual(session.state);
  await expect(page.locator("#undo")).toBeDisabled();
  await chooseCard(page, card.id, isMobile);
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0);
});

test("dragging moves a whole king run, not just its first card", async ({ page }) => {
  const session = openEndgame();
  await openGame(page, session);
  const source = await page.locator("#card-12").boundingBox();
  const target = await page.locator('[data-target="t4"]').boundingBox();
  await page.mouse.move(source.x + 14, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 25, { steps: 8 });
  await expect(page.locator(".drag-ghost .card")).toHaveCount(3);
  await page.mouse.up();
  const move = { type: "move", from: { pile: "tableau", index: 0, cardIndex: 0 }, to: { pile: "tableau", index: 4 } };
  expect((await saved(page)).state).toEqual(applyAction(session.state, move));
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.locator("#undo").click();
  expect((await saved(page)).state).toEqual(session.state);
});

test("real touch dragging and touch cancellation leave no stuck cards", async ({ page, context, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || !isMobile, "Native touch injection uses Chromium's browser protocol.");
  const session = openEndgame();
  await openGame(page, session);
  const client = await context.newCDPSession(page);
  const source = await page.locator("#card-12").boundingBox();
  const target = await page.locator('[data-target="t4"]').boundingBox();
  const start = { x: source.x + 14, y: source.y + 10 };
  const end = { x: target.x + target.width / 2, y: target.y + 25 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [end] });
  await expect(page.locator(".drag-ghost .card")).toHaveCount(3);
  await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  expect((await saved(page)).state).toEqual(session.state);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [end] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect((await saved(page)).state.tableau[4].map(card => card.id)).toEqual([12, 24, 36]);
  expect((await saved(page)).state.moves).toBe(61);
  await client.detach();
});

test("an invalid drag does not lose a card or create an undo step", async ({ page }) => {
  const session = openEndgame();
  await openGame(page, session);
  const source = await page.locator("#card-12").boundingBox();
  const target = await page.locator('[data-target="f0"]').boundingBox();
  await page.mouse.move(source.x + 14, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#message")).toHaveAttribute("data-tone", "error");
  expect((await saved(page)).state).toEqual(session.state);
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0);
});

test("hints highlight a genuinely legal move and keyboard controls can make and undo it", async ({ page }) => {
  const { session } = movableDeal();
  await openGame(page, session);
  await page.locator("#hint").click();
  const selectedKey = await page.locator('button[aria-pressed="true"]').first().getAttribute("data-source");
  const targetKey = await page.locator(".pile.is-hinted").getAttribute("data-target");
  const from = selectedKey === "w" ? { pile: "waste" } : {
    pile: selectedKey[0] === "t" ? "tableau" : "foundation",
    index: Number(selectedKey[1]),
    ...(selectedKey[0] === "t" ? { cardIndex: Number(selectedKey.split(":")[1]) } : {}),
  };
  const to = { pile: targetKey[0] === "t" ? "tableau" : "foundation", index: Number(targetKey[1]) };
  expect(canMove(session.state, from, to)).toBe(true);
  await page.locator(`[data-target="${targetKey}"] button`).last().focus();
  await page.keyboard.press("Enter");
  expect((await saved(page)).state).toEqual(applyAction(session.state, { type: "move", from, to }));
  await page.keyboard.press("Control+z");
  expect((await saved(page)).state).toEqual(session.state);
});

test("restart and new-game confirmation prevent accidental loss and reset correctly", async ({ page, isMobile }) => {
  const session = seededSession(42);
  await openGame(page, session);
  await activate(page.locator("#stock"), isMobile);
  const played = (await saved(page)).state;
  await activate(page.locator("#new-game"), isMobile);
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await activate(page.getByRole("button", { name: "Keep playing" }), isMobile);
  expect((await saved(page)).state).toEqual(played);
  await activate(page.locator("#restart"), isMobile);
  await activate(page.locator("#confirm-action"), isMobile);
  expect((await saved(page)).state).toEqual(session.initial);
  expect((await saved(page)).history).toHaveLength(0);
  await expect(page.locator("#time")).toHaveText("0:00");
  await activate(page.locator("#stock"), isMobile);
  await activate(page.locator("#new-game"), isMobile);
  await activate(page.locator("#confirm-action"), isMobile);
  const fresh = await saved(page);
  expect(fresh.state).not.toEqual(session.initial);
  expect(fresh.state.moves).toBe(0);
  expect(fresh.state).toEqual(fresh.initial);
  expect(isGameState(fresh.state)).toBe(true);
});

test("a complete 52-card deal is playable to a win through the real controls", async ({ page, isMobile }) => {
  test.setTimeout(90_000);
  await openGame(page, solvableSession());
  for (let id = 0; id < 52; id++) {
    if (id >= 28) await activate(page.locator("#stock"), isMobile);
    await chooseCard(page, id, isMobile);
    await activate(page.locator(`[data-target="f${suit(id)}"] button`), isMobile);
  }
  await expect(page.getByRole("dialog", { name: "You won!" })).toBeVisible();
  await expect(page.locator("#progress")).toHaveText("52");
  await expect(page.locator("#moves")).toHaveText("76");
  const won = await saved(page);
  expect(won.state.foundations.map(pile => pile.length)).toEqual([13, 13, 13, 13]);
  expect(won.state.tableau.every(pile => !pile.length)).toBe(true);
  expect(won.state.stock).toHaveLength(0);
  expect(won.state.waste).toHaveLength(0);
  await page.reload();
  await expect(page.locator("#progress")).toHaveText("52");
  await expect(page.locator("#message")).toContainText("You won");
  await activate(page.locator("#undo"), isMobile);
  await expect(page.locator("#progress")).toHaveText("51");
  await chooseCard(page, 51, isMobile);
  await activate(page.locator('[data-target="f3"] button'), isMobile);
  await expect(page.locator("#win-dialog")).toBeVisible();
  await activate(page.locator("#win-new"), isMobile);
  await expect(page.locator("#moves")).toHaveText("0");
  await expect(page.locator("#progress")).toHaveText("0");
});

test("finish wins an open endgame and every finishing move is undoable", async ({ page, isMobile }) => {
  await openGame(page, openEndgame());
  await expect(page.locator("#finish")).toBeVisible();
  await activate(page.locator("#finish"), isMobile);
  await expect(page.locator("#win-dialog")).toBeVisible();
  await expect(page.locator("#progress")).toHaveText("52");
  await activate(page.getByRole("button", { name: "View table" }), isMobile);
  await activate(page.locator("#undo"), isMobile);
  await expect(page.locator("#progress")).toHaveText("51");
  await expect(page.locator("#finish")).toBeVisible();
  await activate(page.locator("#finish"), isMobile);
  await expect(page.locator("#win-dialog")).toBeVisible();
});

test("all discards can be recycled repeatedly in their original order", async ({ page, isMobile }) => {
  const session = seededSession(42);
  for (let index = 0; index < 24; index++) {
    Object.assign(session, advance(session, { type: "draw" }));
  }
  await openGame(page, session);
  await expect(page.locator("#stock")).toHaveAccessibleName("Recycle 24 discards");
  await activate(page.locator("#stock"), isMobile);
  await expect(page.locator("#stock")).toHaveAccessibleName("Draw one card, 24 remaining");
  await activate(page.locator("#stock"), isMobile);
  expect((await saved(page)).state.waste[0].id).toBe(session.state.waste[0].id);
  await activate(page.locator("#undo"), isMobile);
  await activate(page.locator("#undo"), isMobile);
  expect((await saved(page)).state).toEqual(session.state);
});

test("a damaged save starts a valid new deal with a visible explanation", async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{"version":1,"state":"damaged"}'), SAVE_KEY);
  await page.goto("/");
  await expect(page.locator("#warning")).toContainText("saved game could not be read");
  await expect(page.locator(".tableau-column")).toHaveCount(7);
  expect(isGameState((await saved(page)).state)).toBe(true);
  await page.locator("#stock").click();
  await expect(page.locator("#warning")).toBeHidden();
  await expect(page.locator("#moves")).toHaveText("1");
});

test("unavailable browser storage is explicit, but playing and undo still work", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Storage denied", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage denied", "QuotaExceededError"); };
  });
  await page.goto("/");
  await expect(page.locator("#warning")).toContainText("cannot be saved");
  await page.locator("#stock").click();
  await expect(page.locator("#moves")).toHaveText("1");
  await page.locator("#undo").click();
  await expect(page.locator("#moves")).toHaveText("0");
});

test("the clock starts with play, pauses in the background, and resumes from a save", async ({ page }) => {
  await page.clock.install();
  await openGame(page);
  await page.clock.fastForward(10_000);
  await expect(page.locator("#time")).toHaveText("0:00");
  await page.locator("#stock").click();
  await page.clock.fastForward(61_000);
  await expect(page.locator("#time")).toHaveText("1:01");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(120_000);
  await expect(page.locator("#time")).toHaveText("1:01");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.reload();
  await expect(page.locator("#time")).toHaveText("1:01");
});

test("rules and phone install instructions are reachable and dismissible", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });
  });
  await openGame(page);
  await activate(page.locator("#help"), isMobile);
  await expect(page.locator("#help-dialog")).toBeVisible();
  await expect(page.locator("#help-title")).toBeFocused();
  expect(await page.locator("#help-dialog").evaluate(dialog => dialog.scrollTop)).toBe(0);
  await expect(page.locator("#help-dialog")).toContainText("Only a king");
  await activate(page.locator("#help-dialog").getByRole("button", { name: "Got it" }), isMobile);
  await activate(page.locator("#install"), isMobile);
  await expect(page.locator("#install-dialog")).toBeVisible();
  await expect(page.locator("#install-dialog")).toContainText("Add to Home Screen");
  await expect(page.locator("#install-dialog")).toContainText("HTTPS");
  await activate(page.locator("#install-dialog").getByRole("button", { name: "Got it" }), isMobile);
  await expect(page.locator("#install-dialog")).toBeHidden();
});

test("the native install prompt is used when the browser provides one", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => { document.documentElement.dataset.installPromptUsed = "true"; },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await page.locator("#install").click();
  await expect(page.locator("html")).toHaveAttribute("data-install-prompt-used", "true");
  await expect(page.locator("#message")).toContainText("install later");
});

test("small phones, landscape, and a maximum-length column never overlap the controls", async ({ page }, testInfo) => {
  const session = seededSession(42);
  const run = [12, 24, 10, 22, 8, 20, 6, 18, 4, 16, 2, 14, 0].map(up);
  session.state = position({ tableau: [[], [], [], [], [], [], [...[26, 27, 28, 29, 30, 31].map(down), ...run]], moves: 99 });
  await openGame(page, session);
  for (const [width, height] of [[320, 568], [375, 667], [430, 932], [844, 390]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const lastCard = await page.locator("#card-0").boundingBox();
    const toolbar = await page.locator(".toolbar").boundingBox();
    expect(lastCard.y + lastCard.height).toBeLessThan(toolbar.y);
    const cards = await page.locator(".card").evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    expect(cards.every(card => card.left >= 0 && card.right <= width && card.width >= 32)).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath("phone-long-column.png"), fullPage: true });
});

test("the board and help dialog meet automated accessibility checks", async ({ page }, testInfo) => {
  await openGame(page);
  const scan = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect((await scan()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("solitaire.png"), fullPage: true });
  await page.locator("#help").click();
  expect((await scan()).violations).toEqual([]);
  await page.locator("#help-dialog button").scrollIntoViewIfNeeded();
  expect((await scan()).violations).toEqual([]);
});

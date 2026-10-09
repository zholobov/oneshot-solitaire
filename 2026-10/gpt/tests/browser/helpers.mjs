import { expect } from "@playwright/test";
import { SAVE_KEY, encodeSession } from "../../dist/session.js";
import { seededSession } from "../fixtures.mjs";

export async function openGame(page, session = seededSession(42), url = "/") {
  await page.addInitScript(({ key, raw }) => {
    if (!sessionStorage.getItem("solitaire-test-seeded")) {
      localStorage.setItem(key, raw);
      sessionStorage.setItem("solitaire-test-seeded", "true");
    }
  }, { key: SAVE_KEY, raw: encodeSession(session) });
  await page.goto(url);
  await expect(page.locator("#stock")).toBeVisible();
}

export async function saved(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
}

export async function activate(locator, touch, options = {}) {
  if (touch) await locator.tap(options);
  else await locator.click(options);
}

export async function chooseCard(page, id, touch) {
  await activate(page.locator(`#card-${id}`), touch, { position: { x: 12, y: 10 } });
}

export async function offlineReady(page) {
  await expect(page.locator("#connection")).toHaveText("Offline ready");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

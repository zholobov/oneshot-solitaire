import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { seededSession } from "../fixtures.mjs";
import { offlineReady, openGame, saved } from "./helpers.mjs";

async function isolatedHost(base = "/") {
  let revision = 1;
  const root = resolve("dist");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = resolve(root, path.slice(base.length) || "index.html");
    if (!path.startsWith(base) || !file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    try {
      let body = await readFile(file);
      if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<title>Pocket Solitaire</title>", `<title>Pocket Solitaire ${revision}</title>`));
      if (file.endsWith("sw.js")) body = Buffer.from(body.toString().replace(/(\$\{PREFIX\})[a-f0-9]{12}/, `$1integration-${revision}`));
      response.writeHead(200, { "Content-Type": types[extname(file)], "Cache-Control": "no-store" }).end(body);
    } catch (error) {
      if (error.code === "ENOENT") response.writeHead(404).end();
      else { response.writeHead(500).end(String(error)); }
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}${base}`,
    upgrade: () => { revision++; },
    close: async () => {
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}

async function disconnect(context, host, browserName) {
  await host.close();
  await expect(fetch(host.url, { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
  // This WebKit version rejects service-worker navigation under emulated offline mode.
  // https://github.com/microsoft/playwright/issues/42775
  if (browserName !== "webkit") await context.setOffline(true);
}

test("install metadata, real PNG icon sizes, and offline assets are complete", async ({ page, browserName, context }) => {
  const external = [];
  page.on("request", request => {
    if (!request.url().startsWith("http://127.0.0.1:")) external.push(request.url());
  });
  await openGame(page);
  await offlineReady(page);
  await expect(page.locator("#update")).toBeHidden();
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  expect(manifest.icons.some(icon => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    const response = await page.request.get(`/${icon.src.replace("./", "")}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  const apple = await page.request.get("/icons/apple-touch-icon.png");
  const bytes = await apple.body();
  expect(bytes.readUInt32BE(16)).toBe(180);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find(name => name.startsWith("pocket-solitaire:")));
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  expect(cached).toEqual(expect.arrayContaining(["/index.html", "/app.js", "/game.js", "/session.js", "/styles.css", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]));
  expect(external).toEqual([]);
  if (browserName === "chromium") {
    const client = await context.newCDPSession(page);
    expect((await client.send("Page.getInstallabilityErrors")).installabilityErrors).toEqual([]);
    await client.detach();
  }
});

test("an offline reload and a fresh offline window keep the saved game fully playable", async ({ page, context, browserName }) => {
  const host = await isolatedHost();
  try {
    await openGame(page, seededSession(42), host.url);
    await offlineReady(page);
    await page.locator("#stock").click();
    await page.locator("#stock").click();
    const state = (await saved(page)).state;
    await disconnect(context, host, browserName);
    await page.reload();
    await expect(page.locator("#connection")).toHaveText(browserName === "webkit" ? "Offline ready" : "Offline");
    expect((await saved(page)).state).toEqual(state);
    await page.locator("#stock").click();
    await expect(page.locator("#moves")).toHaveText("3");
    const next = await context.newPage();
    await next.goto(host.url);
    await expect(next.locator("#moves")).toHaveText("3");
    await next.locator("#undo").click();
    expect((await saved(next)).state).toEqual(state);
    await expect(page.locator("#moves")).toHaveText("2");
    await page.goto("about:blank");
    await next.reload();
    expect((await saved(next)).state).toEqual(state);
    await next.close();
  } finally {
    await context.setOffline(false);
    await host.close();
  }
});

test("updates wait for approval, preserve play, and remove only their own old cache", async ({ page, context, browserName }) => {
  const host = await isolatedHost();
  try {
    await openGame(page, seededSession(42), host.url);
    await offlineReady(page);
    await page.locator("#stock").click();
    const state = (await saved(page)).state;
    await page.evaluate(async () => {
      await caches.open("another-app-cache");
      await caches.open(`pocket-solitaire:${location.origin}/other/:keep`);
    });
    host.upgrade();
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.locator("#update")).toBeVisible();
    await expect(page).toHaveTitle("Pocket Solitaire 1");
    await page.reload();
    await expect(page).toHaveTitle("Pocket Solitaire 1");
    await expect(page.locator("#update")).toBeVisible();
    expect((await saved(page)).state).toEqual(state);
    await page.locator("#update").click();
    await expect(page).toHaveTitle("Pocket Solitaire 2");
    expect((await saved(page)).state).toEqual(state);
    const names = await page.evaluate(() => caches.keys());
    expect(names).toContain("another-app-cache");
    expect(names.some(name => name.endsWith("/other/:keep"))).toBe(true);
    expect(names.some(name => name.endsWith(":integration-1"))).toBe(false);
    expect(names.some(name => name.endsWith(":integration-2"))).toBe(true);
    await disconnect(context, host, browserName);
    await page.reload();
    await expect(page).toHaveTitle("Pocket Solitaire 2");
    await expect(page.locator("#moves")).toHaveText("1");
  } finally {
    await context.setOffline(false);
    await host.close();
  }
});

test("installation and offline play also work below a website subdirectory", async ({ page, context, browserName }) => {
  const host = await isolatedHost("/solitaire/");
  try {
    await openGame(page, seededSession(42), host.url);
    await offlineReady(page);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope)).toBe(host.url);
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      const manifest = await (await fetch(link.href)).json();
      return { start: new URL(manifest.start_url, link.href).href, icon: new URL(manifest.icons[0].src, link.href).href };
    });
    expect(manifest.start).toBe(host.url);
    expect(manifest.icon).toBe(`${host.url}icons/icon-192.png`);
    await page.locator("#stock").click();
    const state = (await saved(page)).state;
    await disconnect(context, host, browserName);
    await page.reload();
    await expect(page.locator("#connection")).toHaveText(browserName === "webkit" ? "Offline ready" : "Offline");
    expect((await saved(page)).state).toEqual(state);
    await page.locator("#undo").click();
    await expect(page.locator("#moves")).toHaveText("0");
  } finally {
    await context.setOffline(false);
    await host.close();
  }
});

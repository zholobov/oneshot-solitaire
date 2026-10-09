import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = new URL("../public/icons/", import.meta.url);
const svg = await readFile(new URL("favicon.svg", directory), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [size, name] of [[192, "icon-192"], [512, "icon-512"], [512, "maskable-512"], [180, "apple-touch-icon"]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, directory)) });
  }
} finally {
  await browser.close();
}
console.log("Generated app icons in public/icons/.");

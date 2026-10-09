import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
execFileSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc")], { cwd: root, stdio: "inherit" });
await cp(resolve(root, "public"), dist, { recursive: true });
const entries = await readdir(dist, { recursive: true, withFileTypes: true });
const files = entries.filter(entry => entry.isFile())
  .map(entry => resolve(entry.parentPath, entry.name).slice(dist.length + 1).replaceAll("\\", "/"))
  .filter(name => name !== "sw.js").sort();
for (const required of ["index.html", "app.js", "game.js", "session.js", "styles.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"]) {
  if (!files.includes(required)) throw new Error(`Missing app asset: ${required}. Run npm run icons if icons are missing.`);
}
const template = await readFile(resolve(dist, "sw.js"), "utf8");
const hash = createHash("sha256").update(template);
for (const file of files) hash.update(file).update(await readFile(resolve(dist, file)));
const version = hash.digest("hex").slice(0, 12);
await writeFile(resolve(dist, "sw.js"), template
  .replace("__BUILD_ID__", version)
  .replace("__PRECACHE_ASSETS__", JSON.stringify(files.map(file => `./${file}`))));
console.log(`Built ${files.length} offline assets in dist/ (${version}).`);

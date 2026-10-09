import { createServer } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);
const base = process.env.BASE_PATH ?? "/";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535.");
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error("BASE_PATH must be a path such as / or /solitaire/.");
try {
  await access(resolve(root, "index.html"));
} catch (error) {
  console.error("The built app is missing. Run npm run build first.", error.message);
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png",
};
const server = createServer(async (request, response) => {
  const send = (status, text) => {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    response.end(text);
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    send(405, "Method not allowed.");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    send(400, "Invalid URL.");
    return;
  }
  if (base !== "/" && pathname === base.slice(0, -1)) {
    response.writeHead(308, { Location: base });
    response.end();
    return;
  }
  if (!pathname.startsWith(base)) { send(404, "Not found."); return; }
  const file = resolve(root, pathname.slice(base.length) || "index.html");
  if (!file.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) { send(403, "Forbidden."); return; }
  try {
    if (!(await stat(file)).isFile()) { send(404, "Not found."); return; }
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") send(404, "Not found.");
    else { console.error("Failed to serve app asset.", error); send(500, "Could not read this file."); }
  }
});
server.on("error", error => { console.error("Could not start Solitaire.", error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Pocket Solitaire: http://${host}:${port}${base}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());

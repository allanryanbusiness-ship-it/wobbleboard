#!/usr/bin/env node
// Minimal static file server for the whiteboard (ES modules need http, not file://).
// usage: node tools/serve.mjs [port]   (or: npx github:allanryanbusiness-ship-it/wobbleboard [port])
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const port = Number(process.argv[2] || 4173);
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };

createServer(async (request, response) => {
  let path;
  try {
    path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    // A malformed address must not take the server down.
    response.writeHead(400).end("Bad request");
    return;
  }
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Wobbleboard at http://127.0.0.1:${port}`));

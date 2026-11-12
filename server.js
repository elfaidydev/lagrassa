// Tiny static server (no dependencies): npm start  ->  http://localhost:3000
// On the same Wi-Fi the menu is also reachable at http://<this-computer-ip>:3000 (for QR codes / tablets).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  // only serve the site itself and the three.js build
  const allowed = !file.startsWith(root) ? false
    : p.startsWith("/node_modules/") ? p.startsWith("/node_modules/three/")
    : !p.startsWith("/server.js") && !p.startsWith("/package") && !p.startsWith("/build.mjs");
  if (!allowed) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`\n  La Grassa menu  ->  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list) if (n.family === "IPv4" && !n.internal) console.log(`  On your network ->  http://${n.address}:${PORT}`);
  console.log("");
});

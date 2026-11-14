#!/usr/bin/env node
/** Production build -> ./dist (GitHub Pages / static hosting). */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const threeSrc = path.join(root, "node_modules/three/build/three.module.js");
const threeDst = path.join(dist, "vendor/three/build/three.module.js");

const COPY_FILES = [
  "style.css", "script.js", "fx.js", "cache.js", "menu.json",
];

function computeBuildId() {
  const hash = crypto.createHash("sha256");
  for (const f of ["index.html", ...COPY_FILES, "sw.js"]) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) hash.update(fs.readFileSync(p));
  }
  const productsDir = path.join(root, "assets/products");
  if (fs.existsSync(productsDir)) {
    for (const name of fs.readdirSync(productsDir).sort()) {
      hash.update(name);
      hash.update(fs.readFileSync(path.join(productsDir, name)));
    }
  }
  return hash.digest("hex").slice(0, 12);
}

function writeServiceWorker(buildId) {
  const src = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const out = src.replace(
    /const BUILD_ID = "dev";/,
    `const BUILD_ID = "${buildId}";`,
  );
  if (out === src) {
    console.warn("  sw.js: BUILD_ID marker not found — using source as-is.");
    fs.writeFileSync(path.join(dist, "sw.js"), src);
    return;
  }
  fs.writeFileSync(path.join(dist, "sw.js"), out);
}
const SKIP_ASSETS = new Set(["assets/img", "assets/logo.svg", "assets/.DS_Store"]);

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyAssets() {
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    if (SKIP_ASSETS.has(rel)) return;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs)) walk(path.join(rel, name));
      return;
    }
    if (rel.includes(".DS_Store")) return;
    copyFile(abs, path.join(dist, rel));
  };
  walk("assets");
}

rmrf(dist);
fs.mkdirSync(dist, { recursive: true });

const buildId = computeBuildId();

for (const f of COPY_FILES) copyFile(path.join(root, f), path.join(dist, f));

writeServiceWorker(buildId);
copyAssets();

if (!fs.existsSync(threeSrc)) {
  console.error("Run npm install first.");
  process.exit(1);
}
copyFile(threeSrc, threeDst);

let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(
  '"/node_modules/three/build/three.module.js"',
  '"./vendor/three/build/three.module.js"'
);
fs.writeFileSync(path.join(dist, "index.html"), html);

const manifest = {
  builtAt: new Date().toISOString(),
  buildId,
  files: [],
};
const walkDist = (dir, base = "") => {
  for (const name of fs.readdirSync(dir)) {
    const rel = path.join(base, name);
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walkDist(abs, rel);
    else manifest.files.push(rel.replace(/\\/g, "/"));
  }
};
walkDist(dist);
fs.writeFileSync(path.join(dist, "build-manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\n  Build OK  ->  ${dist}`);
console.log(`  ${manifest.files.length} files\n`);

/* La Grassa — offline shell + images. Bump CACHE when you deploy a new build. */
const CACHE = "la-grassa-v1";
const PLACEHOLDER = "./assets/products/placeholder-plate.svg";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./fx.js",
  "./cache.js",
  "./menu.json",
  "./assets/logo.png",
  "./assets/riyal.svg",
  "./assets/products/placeholder-plate.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try {
      const menu = await (await fetch("./menu.json")).json();
      const pasta = menu.filter((i) => i.categoryId === "pasta" && i.image);
      await Promise.all(
        pasta.map((i) => cache.add(new Request(i.image, { credentials: "same-origin" })).catch(() => {}))
      );
    } catch { /* menu.json optional during first install */ }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (!/\.(png|webp|jpg|jpeg|svg|json|js|css|html)$/i.test(p) && p !== "/" && !p.endsWith("/")) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    if (hit) {
      if (e.request.method === "GET" && !p.includes("menu.json")) {
        fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); }).catch(() => {});
      }
      return hit;
    }
    try {
      const res = await fetch(e.request);
      if (res.ok && e.request.method === "GET") cache.put(e.request, res.clone());
      return res;
    } catch {
      if (p.endsWith(".html") || p === "/") return (await cache.match("./index.html")) || Response.error();
      return (await cache.match(PLACEHOLDER)) || Response.error();
    }
  })());
});

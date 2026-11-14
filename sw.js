/* La Grassa — offline-friendly images, always-fresh app shell.
   BUILD_ID is replaced in dist/ by build.mjs; local dev keeps "dev". */
const BUILD_ID = "dev";
const CACHE = `la-grassa-${BUILD_ID}`;
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

function isShellRequest(request) {
  if (request.mode === "navigate") return true;
  const p = new URL(request.url).pathname;
  return /menu\.json$/i.test(p) || /\.(js|css|html)$/i.test(p);
}

function isCacheableAsset(url) {
  const p = url.pathname;
  if (url.origin !== self.location.origin) return false;
  return (
    /\.(png|webp|jpg|jpeg|svg)$/i.test(p) ||
    (/\/assets\//i.test(p) && /\.json$/i.test(p))
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") {
      const html = await cache.match("./index.html");
      if (html) return html;
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const net = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    net.catch(() => {});
    return hit;
  }
  const res = await net;
  if (res) return res;
  if (/\.(png|webp|jpe?g)$/i.test(new URL(request.url).pathname)) {
    const ph = await cache.match(PLACEHOLDER);
    if (ph) return ph;
  }
  return Response.error();
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: "no-cache" }))));
    try {
      const menu = await (await fetch("./menu.json", { cache: "no-store" })).json();
      const imgs = menu.filter((i) => i.image).map((i) => i.image);
      await Promise.allSettled(
        imgs.map((src) =>
          cache.add(new Request(src, { credentials: "same-origin", cache: "no-cache" })),
        ),
      );
    } catch { /* offline install */ }
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

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/sw.js")) return;

  if (isShellRequest(e.request)) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  if (isCacheableAsset(url)) {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});
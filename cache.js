/* Image cache: memory + Cache API (via service worker). Intro waits on tab 1 only. */
export const PLACEHOLDER_PATH = "assets/products/placeholder-plate.svg";

const memory = new Map();
const inflight = new Map();

/** Fetch image once; reuse blob URL in session. */
export async function fetchImage(url, onProgress) {
  if (!url || url === PLACEHOLDER_PATH) return PLACEHOLDER_PATH;
  if (memory.has(url)) return memory.get(url);
  if (inflight.has(url)) return inflight.get(url);

  const job = (async () => {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      memory.set(url, obj);
      onProgress?.();
      return obj;
    } catch {
      onProgress?.();
      return url;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, job);
  return job;
}

export function warmImages(urls, onEach) {
  const list = [...new Set(urls.filter(Boolean))];
  return Promise.all(list.map((u) => fetchImage(u, onEach)));
}

/** Logo + placeholder + every image in the first menu tab (باستا). */
export function introCriticalUrls(menu) {
  const first = menu[0]?.dishes ?? [];
  return [
    "assets/logo.png",
    PLACEHOLDER_PATH,
    "assets/riyal.svg",
    ...first.map((d) => d.img).filter((u) => u && u !== PLACEHOLDER_PATH),
  ];
}

/** Remaining tabs — after the intro, when the browser is idle. */
export function prefetchRest(menu, criticalSet) {
  const rest = menu
    .flatMap((c) => c.dishes.map((d) => d.img))
    .filter((u) => u && u !== PLACEHOLDER_PATH && !criticalSet.has(u));
  const run = () => warmImages(rest);
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 12_000 });
  else setTimeout(run, 1500);
}

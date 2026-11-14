/* ──────────────────────────────────────────────────────────────
   LA GRASSA: the wheel menu.

   Dishes sit on the rim of a huge ring whose centre is far below the stage.
   Turning the ring one step rolls the next dish up into the middle while the
   last one rolls off the edge. The dish in the middle is always shown whole.

   Inputs: next/prev buttons, dots on the arc, arrow keys, mouse wheel,
   and swipe/drag (left-right OR up-down).

   ► MENU DATA: edit menu.json (names, prices, images, categories).
   ────────────────────────────────────────────────────────────── */

import { createFX } from "./fx.js";
import {
  PLACEHOLDER_PATH,
  fetchImage,
  warmImages,
  introCriticalUrls,
  prefetchRest,
} from "./cache.js";

const PLACEHOLDER = PLACEHOLDER_PATH;
const CAT_ORDER = ["pasta", "salads", "sandwiches", "sides"];
/* La Grassa logo palette: olive greens + cream (no burgundy) */
const CAT_META = {
  pasta:      { label: "باستا",         short: "باستا",   tint: "#2a3324", shade: "#3d4f36" },
  salads:     { label: "سلطات",        short: "سلطات",   tint: "#283422", shade: "#3a4a30" },
  sandwiches: { label: "ساندوتشات",    short: "ساندوتش", tint: "#2e3828", shade: "#424f3a", layout: "wide" },
  sides:      { label: "أطباق جانبية", short: "جانبي",   tint: "#2c3526", shade: "#3e4d38" },
};

function buildMenu(items) {
  return CAT_ORDER.map((key) => {
    const meta = CAT_META[key];
    const dishes = items
      .filter((i) => i.categoryId === key)
      .map((i) => ({
        name: i.nameAr,
        price: i.price,
        sizes: i.sizes,
        img: i.image || PLACEHOLDER,
        tint: meta.tint,
        shade: meta.shade,
        wide: meta.layout === "wide",
        upright: meta.layout !== "wide",
        placeholder: !i.image,
      }));
    return { key, label: meta.label, short: meta.short || meta.label, dishes };
  }).filter((c) => c.dishes.length);
}

let MENU = [];

const STEP_DEG = 23;                    /* spacing of the dots on the arc */
const RTL = document.documentElement.getAttribute("dir") === "rtl";
/** Map UI step direction to wheel spin (RTL mirrors horizontal flow). */
const spinDir = (d) => (RTL ? -d : d);

const $ = (id) => document.getElementById(id);
const app = $("app"), stage = $("stage"), stageIn = $("stageIn"), ring = $("ring"), arc = $("arc");
const nameEl = $("name"), priceEl = $("price"), infoIn = $("infoIn"), counter = $("counter"), tablesEl = $("tables");
const tabsEl = $("tabs"), indEl = $("tabInd");

const fx = createFX($("fx"));
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* letters rise one by one (Arabic is split by word so the letters keep joining) */
function splitText(text) {
  const arabic = /[\u0600-\u06FF]/.test(text);
  let i = 0;
  return text.split(" ").map((word) => {
    const parts = arabic ? [word] : [...word];
    return `<span class="w">${parts.map((c) => `<span class="l" style="--i:${i++}">${c}</span>`).join("")}</span>`;
  }).join(" ");
}

/* ── state (replaced whenever a tab is opened) ── */
let cat = 0;
let DISHES = [], N = 0, HALF = 0;
let tables = [], slots = [], pies = [], dots = [], prevSlots = [];
let criticalUrls = new Set();
let turn = 0;                            /* running count, may be negative or past N */
let busy = false;
const idx = (t) => ((t % N) + N) % N;
const slotOf = (i, t) => ((i - idx(t) + N + HALF) % N) - HALF;     /* -HALF .. HALF */

/* build the pictures, dots and table photos of one tab */
function mount(ci, { keepTables = false } = {}) {
  if (!MENU[ci]?.dishes?.length) return;
  cat = ci; DISHES = MENU[ci].dishes; N = DISHES.length; HALF = Math.floor(N / 2); turn = 0;
  ring.innerHTML = DISHES.map((d) =>
    `<span class="pie-slot${d.wide ? " is-wide" : ""}${d.placeholder ? " is-placeholder" : ""}"><img class="pie" src="${PLACEHOLDER}" alt="${d.name}" decoding="async" draggable="false"></span>`).join("");
  stage.dataset.product = DISHES[0]?.wide ? "wide" : "round";
  slots = [...ring.querySelectorAll(".pie-slot")];
  pies = [...ring.querySelectorAll(".pie")];
  hydratePieImages();
  arc.querySelectorAll(".dot").forEach((d) => d.remove());
  dots = DISHES.map((d, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "dot"; b.setAttribute("aria-label", d.name);
    b.innerHTML = `<span>${d.name}</span>`;
    b.addEventListener("click", () => goTo(i));
    arc.appendChild(b);
    return b;
  });
  const old = tables;
  tables = DISHES.map((d) => { const el = document.createElement("div"); el.className = "table"; el.style.setProperty("--shade", d.shade); tablesEl.appendChild(el); return el; });
  if (keepTables) { old.forEach((t) => t.classList.remove("is-on")); setTimeout(() => old.forEach((t) => t.remove()), 1800); }
  else old.forEach((t) => t.remove());
  prevSlots = DISHES.map((_, i) => slotOf(i, 0));
  app.classList.toggle("is-single", N < 2);
}

function hydratePieImages() {
  DISHES.forEach((dish, i) => {
    const slot = slots[i];
    const img = pies[i];
    if (!slot || !img || dish.placeholder) {
      img.src = PLACEHOLDER;
      slot?.classList.remove("is-loading");
      return;
    }
    slot.classList.add("is-loading");
    const show = (src) => {
      img.src = src;
      const done = () => slot.classList.remove("is-loading");
      if (img.decode) img.decode().then(done).catch(done);
      else done();
    };
    fetchImage(dish.img).then(show);
  });
}
/* ── geometry: everything is derived from the stage size ── */
function geometry() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const wide = w / h > 1.25;
  const gap = Math.min(44, Math.max(24, w * 0.035));
  const ctrl = wide ? 0 : 84;                    /* room for the buttons under the pie */
  const topPad = 14, botPad = wide ? 30 : 6;
  const availH = h - ctrl - topPad - botPad - gap;
  const productWide = stage.dataset.product === "wide";
  const D = Math.max(120, Math.min(availH, w * (wide ? 0.62 : 0.76), 760));
  const Dw = productWide ? Math.min(w * 0.92, D * 1.78) : D;
  const Dh = productWide ? D * 0.82 : D;
  const extra = Math.max(0, availH - Dh);
  const cy = topPad + gap + Dh / 2 + extra * 0.5;
  const R = D * 2.1;
  const S = (productWide ? Dw : D) * 1.08;
  const step = (S / R) * 180 / Math.PI;
  const btn = wide ? 56 : 48;
  const bx = wide ? Math.max(8, w / 2 - Dw / 2 - btn - 22) : Math.max(18, w * 0.06);

  const s = stageIn.style;
  s.setProperty("--D", D + "px");
  s.setProperty("--Dw", Dw + "px");
  s.setProperty("--Dh", Dh + "px");
  s.setProperty("--R", R + "px");
  s.setProperty("--cy", cy + "px");
  s.setProperty("--step", step + "deg");
  s.setProperty("--bx", bx + "px");
  const arcSize = Math.max(D, Dw) + gap * 2;
  arc.style.width = arcSize + "px";
  arc.style.top = (cy - arcSize / 2) + "px";
  stage.dataset.mode = wide ? "wide" : "narrow";
  if (fx) {
    const a = app.getBoundingClientRect(), r = stage.getBoundingClientRect();
    fx.setCenter((r.left - a.left + (w / 2)) / a.width, (r.top - a.top + cy) / a.height, (D * 0.62) / a.height);
  }
  stage.dataset.labels = wide && w >= 1100 ? "1" : "0";
}

/* ── arc dots ── */
function placeDot(d, slot, snap) {
  const vis = RTL ? -slot : slot;
  const a = vis * STEP_DEG * Math.PI / 180;
  if (snap) d.classList.add("no-transition");
  d.style.left = (50 + 50 * Math.sin(a)) + "%";
  d.style.top = (50 - 50 * Math.cos(a)) + "%";
  d.style.opacity = Math.abs(slot) > 2 ? 0 : 1;
  d.style.pointerEvents = Math.abs(slot) > 2 ? "none" : "auto";
  d.classList.toggle("is-left", RTL ? slot > 0 : slot < 0);
  d.classList.toggle("is-right", RTL ? slot < 0 : slot > 0);
  d.classList.toggle("is-active", slot === 0);
  if (snap) { void d.offsetWidth; d.classList.remove("no-transition"); }
}

/* ── lay everything out for the current turn ── */
let swapTimer = 0;
function layout(first, delta = 0) {
  const i0 = idx(turn);
  const ringTurn = N === 2 ? idx(turn) : turn;
  ring.style.setProperty("--turn", `calc(${RTL ? ringTurn : -ringTurn} * var(--step))`);
  DISHES.forEach((dish, i) => {
    const slot = slotOf(i, turn), el = slots[i];
    const slotStep = Math.abs(slot - prevSlots[i]);
    const jumped = !first && slotStep > Math.max(1, Math.abs(delta)); /* wrap على القوس الخلفي */
    if (jumped) { el.style.opacity = 0; el.classList.add("no-move"); }
    const spin = slot + ringTurn;
    el.style.setProperty("--slot", String(RTL ? -spin : spin));
    /* الصنف في النص يفضل مستوي؛ اللي على الجنب يميل شوية بس حسب مكانه على القوس */
    const tilt = dish.wide ? 6 : (dish.upright ? 10 : 16);
    const rollDeg = (-slot * tilt) * (RTL ? -1 : 1);
    el.style.setProperty("--roll", `${rollDeg}deg`);
    if (jumped) { void el.offsetWidth; el.classList.remove("no-move"); }
    el.style.opacity = Math.abs(slot) > 2 ? 0 : 1;
    placeDot(dots[i], slot, jumped);
    prevSlots[i] = slot;
  });
  const d = DISHES[i0];
  document.body.dataset.pie = d.name;
  document.body.style.setProperty("--tint", d.tint);
  document.body.style.setProperty("--shade", d.shade || d.tint);
  document.querySelector('meta[name="theme-color"]').content = d.tint;
  if (fx) fx.setTint(d.tint);
  tables.forEach((t, i) => t.classList.toggle("is-on", i === i0));
  counter.textContent = `${String(i0 + 1).padStart(2, "0")} / ${String(N).padStart(2, "0")}`;

  const setInfo = () => {
    nameEl.innerHTML = splitText(d.name);
    nameEl.setAttribute("aria-label", d.name);
    const wrap = priceEl.closest(".info__price");
    const loneSar = wrap?.querySelector(":scope > .sar");
    if (d.sizes?.length) {
      wrap?.classList.add("is-dual");
      priceEl.innerHTML = d.sizes
        .map(
          (s) =>
            `<span class="price-tier"><span class="price-tier__label">${s.label}</span><span class="price-tier__val"><span class="price-tier__amt">${s.price}</span><span class="sar" role="img" aria-label="ريال سعودي"></span></span></span>`,
        )
        .join('<span class="price-tier__sep" aria-hidden="true"></span>');
      loneSar?.setAttribute("hidden", "");
      priceEl.setAttribute("aria-label", d.sizes.map((s) => `${s.label} ${s.price} ريال`).join("، "));
    } else {
      wrap?.classList.remove("is-dual");
      priceEl.textContent = d.price;
      priceEl.removeAttribute("aria-label");
      loneSar?.removeAttribute("hidden");
    }
  };
  clearTimeout(swapTimer);
  if (first) setInfo();
  else {
    infoIn.classList.add("is-swapping");
    swapTimer = setTimeout(() => { setInfo(); infoIn.classList.remove("is-swapping"); }, 280);
  }
}

function lock(ms) { busy = true; setTimeout(() => { busy = false; }, ms); }
function step(dir) {
  if (busy || N < 2) return false;
  if (N === 2) {
    /* صنفين فقط: لا تُراكِم turn وإلا العجلة تلف دورات زائدة (نفس idx بزوايا مختلفة) */
    turn = idx(turn) === 0 ? 1 : 0;
  } else {
    turn += dir;
  }
  layout(false, dir);
  lock(750);
  if (fx) fx.kick(spinDir(dir));
  return true;
}
function goTo(i) {
  const cur = idx(turn);
  if (i === cur || busy || N < 2) return;
  let d = (i - cur + N) % N;
  if (d > N / 2) d -= N;
  if (N === 2) turn = i;
  else turn += d;
  layout(false, d);
  lock(900);
  if (fx) fx.kick(spinDir(Math.sign(d)));
}

/* ── inputs ── */
function activity() { document.body.classList.add("touched"); }
["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => addEventListener(t, activity, { passive: true }));

/* pointer parallax (mouse hover) */
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || REDUCED) return;
  const x = (e.clientX / innerWidth - .5) * 2, y = (e.clientY / innerHeight - .5) * 2;
  app.style.setProperty("--px", x.toFixed(3)); app.style.setProperty("--py", y.toFixed(3));
  if (fx) fx.parallax(RTL ? -x : x, y);
});
$("prev").addEventListener("click", () => step(-1));
$("next").addEventListener("click", () => step(1));
addEventListener("keydown", (e) => {
  const fwd = RTL ? "ArrowLeft" : "ArrowRight", back = RTL ? "ArrowRight" : "ArrowLeft";
  if (e.key === fwd || e.key === "ArrowDown") step(1);
  if (e.key === back || e.key === "ArrowUp") step(-1);
});

/* mouse wheel / trackpad: one gesture = one dish (inertia tail is ignored) */
let lastWheel = 0;
addEventListener("wheel", (e) => {
  e.preventDefault();
  const now = performance.now(), fresh = now - lastWheel > 160;
  lastWheel = now;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!fresh || Math.abs(delta) < 4) return;
  const sign = delta > 0 ? 1 : -1;
  step(spinDir(sign));
}, { passive: false });

/* سحب بالإصبع / الماوس — مع pointer capture عشان الموبايل يشتغل صح */
const SWIPE_SKIP = "button, .tabs, .dot, a, input, select, textarea, label";
function swipeDir(horiz, dist) {
  const fwd = horiz ? (RTL ? dist > 0 : dist < 0) : dist < 0;
  return fwd ? 1 : -1;
}
let swipeLock = false;
function swipeStep(dir) {
  if (swipeLock || N < 2) return false;
  if (!step(dir)) return false;
  swipeLock = true;
  setTimeout(() => { swipeLock = false; }, 520);
  return true;
}
let swipe = null;
function armSwipe(e) {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  if (e.target.closest(SWIPE_SKIP)) return;
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  app.setPointerCapture(e.pointerId);
}
function moveSwipe(e) {
  if (!swipe || swipe.id !== e.pointerId) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const dist = horiz ? dx : dy;
  const min = window.matchMedia("(pointer: coarse)").matches ? 26 : 36;
  if (Math.abs(dist) < min) return;
  if (swipeStep(swipeDir(horiz, dist))) {
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  }
}
function endSwipe(e) {
  if (!swipe || swipe.id !== e.pointerId) return;
  try { app.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  swipe = null;
}
app.addEventListener("pointerdown", armSwipe);
app.addEventListener("pointermove", moveSwipe);
app.addEventListener("pointerup", endSwipe);
app.addEventListener("pointercancel", endSwipe);

/* fallback للموبايل لو pointer events اتقطعت */
let touch0 = null;
app.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1 || e.target.closest(SWIPE_SKIP)) return;
  touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
app.addEventListener("touchmove", (e) => {
  if (!touch0 || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - touch0.x, dy = e.touches[0].clientY - touch0.y;
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const dist = horiz ? dx : dy;
  if (Math.abs(dist) < 24) return;
  e.preventDefault();
  if (swipeStep(swipeDir(horiz, dist))) {
    touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}, { passive: false });
app.addEventListener("touchend", () => { touch0 = null; });
app.addEventListener("touchcancel", () => { touch0 = null; });

/* ── first paint (no travel), and re-fit on resize / rotation ── */
let lastFitStageW = -1;
function fit() {
  const w = stage.clientWidth;
  /* ارتفاع الـ stage يتغير لما اسم/سعر الشريط السفلي يكبر — ResizeObserver يفعّل fit ويقطع أنيميشن العجلة */
  if (lastFitStageW >= 0 && Math.abs(w - lastFitStageW) <= 2) return;
  lastFitStageW = w;
  ring.classList.add("no-transition");
  slots.forEach((p) => p.classList.add("no-transition"));
  geometry();
  layout(true);
  void ring.offsetWidth;
  ring.classList.remove("no-transition");
  slots.forEach((p) => p.classList.remove("no-transition"));
  dots.forEach((d, i) => placeDot(d, slotOf(i, turn), true));
}
let tabBtns = [];
function initTabs() {
  tabsEl.querySelectorAll(".tab").forEach((t) => t.remove());
  tabsEl.insertAdjacentHTML("beforeend", MENU.map((m, i) =>
    `<button class="tab${i === 0 ? " is-active" : ""}" type="button" role="tab" aria-selected="${i === 0}" aria-label="${m.label}" data-i="${i}"><span class="tab__long">${m.label}</span><span class="tab__short">${m.short}</span></button>`).join(""));
  tabBtns = [...tabsEl.querySelectorAll(".tab")];
  tabBtns.forEach((b) => b.addEventListener("click", () => switchTab(+b.dataset.i)));
}

/* ── tabs ── */
function moveInd(smooth = true) {
  const b = tabBtns[cat];
  if (!b) return;
  if (!smooth) indEl.style.transition = "none";
  indEl.style.setProperty("--x", b.offsetLeft + "px");
  indEl.style.setProperty("--w", b.offsetWidth + "px");
  if (!smooth) { void indEl.offsetWidth; indEl.style.transition = ""; }
  const l = b.offsetLeft - (tabsEl.clientWidth - b.offsetWidth) / 2;
  tabsEl.scrollTo({ left: l, behavior: smooth ? "smooth" : "auto" });
}
addEventListener("resize", () => moveInd(false));

/* open another tab: the dishes sink away, the new ones roll in from the side the tab is on */
async function switchTab(ci) {
  if (ci === cat || busy) return;
  const dir = ci > cat ? 1 : -1;
  busy = true;
  tabBtns.forEach((b, i) => { b.classList.toggle("is-active", i === ci); b.setAttribute("aria-selected", i === ci); });
  cat = ci; moveInd();                       /* indicator slides right away */
  app.classList.add("is-switching");
  const urls = MENU[ci].dishes.map((d) => d.img).filter((u) => u && u !== PLACEHOLDER);
  await Promise.all([
    wait(REDUCED ? 0 : 480),
    Promise.race([warmImages(urls), wait(2800)]),
  ]);

  ring.classList.add("no-transition");
  mount(ci, { keepTables: true });
  ring.style.setProperty("--intro", `calc(var(--step) * ${2.2 * spinDir(dir)})`);
  slots.forEach((p) => p.classList.add("no-transition"));
  app.style.setProperty("--d0", ".45s");
  layout(true);
  dots.forEach((d, i) => placeDot(d, slotOf(i, turn), true));
  void ring.offsetWidth;
  ring.classList.remove("no-transition"); slots.forEach((p) => p.classList.remove("no-transition"));
  ring.style.transitionDuration = REDUCED ? "0s" : "1.7s";
  app.classList.remove("is-switching");
  requestAnimationFrame(() => ring.style.setProperty("--intro", "0deg"));
  if (fx) fx.kick(spinDir(dir));
  await wait(REDUCED ? 0 : 1700);
  ring.style.transitionDuration = "";
  app.style.setProperty("--d0", "0s");
  busy = false;
}

/* ── intro: preload every picture, then lift the curtain and roll the dishes in ── */
const intro = $("intro"), introBar = $("introBar");
function preloadIntro() {
  const urls = introCriticalUrls(MENU);
  criticalUrls = new Set(urls);
  let done = 0;
  const tick = () => { introBar.style.transform = `scaleX(${++done / urls.length})`; };
  return Promise.all([
    warmImages(urls, tick),
    document.fonts?.ready ?? Promise.resolve(),
  ]);
}

async function start() {
  await Promise.race([
    preloadIntro(),
    wait(REDUCED ? 100 : 3200),
    wait(8000),
  ]);
  prefetchRest(MENU, criticalUrls);
  ring.style.transitionDuration = REDUCED ? "0s" : "2.4s";
  app.style.setProperty("--d0", "1.35s");
  setTimeout(() => app.style.setProperty("--d0", "0s"), 4200);
  intro.classList.add("is-reveal");
  app.classList.add("is-in");
  if (fx) fx.show();
  requestAnimationFrame(() => ring.style.setProperty("--intro", "0deg"));
  slots.forEach((p) => { p.style.transitionDuration = REDUCED ? "0s" : "2.4s"; });
  await wait(REDUCED ? 0 : 1900);
  ring.style.transitionDuration = "";
  slots.forEach((p) => { p.style.transitionDuration = ""; });
  intro.classList.add("is-gone");
}

function registerCacheWorker() {
  if (!("serviceWorker" in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  const activateWaiting = (reg) => {
    const w = reg.waiting;
    if (w) w.postMessage({ type: "SKIP_WAITING" });
  };

  const checkForUpdates = async (reg) => {
    try {
      await reg.update();
    } catch { /* offline */ }
    activateWaiting(reg);
  };

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) activateWaiting(reg);
        });
      });
      await checkForUpdates(reg);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdates(reg);
      });
      window.addEventListener("pageshow", (e) => {
        if (e.persisted) checkForUpdates(reg);
      });
    } catch { /* private mode / blocked */ }
  });
}

async function init() {
  registerCacheWorker();
  try {
    const items = await fetch("menu.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    });
    MENU = buildMenu(items);
  } catch (e) {
    console.error("menu.json", e);
    MENU = buildMenu([]);
  }
  if (!MENU.length) {
    $("intro")?.classList.add("is-gone");
    return;
  }
  initTabs();
  mount(0);
  moveInd(false);
  document.fonts && document.fonts.ready.then(() => moveInd(false));
  ring.classList.add("no-transition");
  ring.style.setProperty("--intro", `calc(var(--step) * ${RTL ? -2.2 : 2.2})`);
  void ring.offsetWidth;
  ring.classList.remove("no-transition");
  fit();
  new ResizeObserver(fit).observe(stage);
  await start();
}
init();

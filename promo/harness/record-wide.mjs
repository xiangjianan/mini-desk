// Record the landscape (1600x1000) Mini Desk promo with a virtual camera that
// stays WIDE by default and only pushes in for key moments: the import menu,
// the template copy, the todo auto-pin, note typing, the image drop, the
// workspace switcher, and the theme toggle. The four-theme montage deliberately
// stays full-board — captions do the labeling, no camera fatigue.
// Camera = CSS transform on a wrapper around #app (browser-composited, sharp).
// Output: assets/raw/w-<scene>.webm + w-<scene>.marks.json (beat timestamps).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDevServer, stopDevServer, BASE_URL } from "./server.mjs";
import {
  launchBrowser,
  finalizeVideo,
  settleBoard,
  moveTo,
  moveClick,
  beat,
  sleep,
  RAW_DIR,
  CURSOR_SCRIPT,
} from "./lib.mjs";
import { readFileSync } from "node:fs";

const SAMPLES = new URL("../../samples/", import.meta.url).pathname;
const VIEW = { width: 1600, height: 1000 };

let sharedBrowser;

/* ---------------- camera rig ---------------- */

/** Wrap #app in a transformable stage; keep teleported popovers + cursor outside. */
async function initCamera(page) {
  await page.evaluate(() => {
    if (window.__cam) return;
    const app = document.getElementById("app");
    const wrap = document.createElement("div");
    wrap.id = "__camwrap";
    wrap.style.cssText =
      "width:100vw;height:100vh;transform-origin:0 0;will-change:transform;" +
      "transition:transform .85s cubic-bezier(.3,.9,.25,1);";
    app.parentNode.insertBefore(wrap, app);
    wrap.appendChild(app);
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    const applyBg = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      document.body.style.background = dark ? "#1c1c1e" : "#f5f5f7";
    };
    applyBg();
    new MutationObserver(applyBg).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.__cam = { s: 1, tx: 0, ty: 0 };
  });
}

/**
 * Move the camera. selector=null pulls back to the full board.
 * scale = max zoom, pad = breathing room (world px), dur = move seconds,
 * dwell = wait after the move so the recording shows the settled frame.
 */
async function camTo(page, selector, { scale = 1.8, pad = 30, dur = 0.85, dwell = 950 } = {}) {
  const missing = await page.evaluate(
    ([sel, opts]) => {
      const c = window.__cam;
      const wrap = document.getElementById("__camwrap");
      wrap.style.transitionDuration = `${opts.dur}s`;
      let target = { s: 1, tx: 0, ty: 0 };
      if (sel) {
        const el = document.querySelector(sel);
        if (!el) return `missing:${sel}`;
        const r = el.getBoundingClientRect();
        // viewport coords -> world coords via the current camera
        const wx = (r.left - c.tx) / c.s - opts.pad;
        const wy = (r.top - c.ty) / c.s - opts.pad;
        const ww = (r.width + opts.pad * 2) / c.s;
        const wh = (r.height + opts.pad * 2) / c.s;
        const Vw = window.innerWidth;
        const Vh = window.innerHeight;
        const s = Math.max(1, Math.min(Math.min(Vw / ww, Vh / wh), opts.scale));
        let tx = Vw / 2 - (wx + ww / 2) * s;
        let ty = Vh / 2 - (wy + wh / 2) * s;
        tx = Math.min(0, Math.max(Vw - Vw * s, tx));
        ty = Math.min(0, Math.max(Vh - Vh * s, ty));
        target = { s, tx, ty };
      }
      window.__cam = target;
      wrap.style.transform = `translate(${target.tx}px, ${target.ty}px) scale(${target.s})`;
      // Teleported popovers (Naive dropdowns, companion bubble) live on <body>,
      // outside the transformed stage. They only re-anchor on window resize, so
      // nudge them continuously while the camera moves to keep them glued.
      const track = window.setInterval(() => window.dispatchEvent(new Event("resize")), 50);
      setTimeout(() => {
        clearInterval(track);
        window.dispatchEvent(new Event("resize"));
      }, opts.dur * 1000 + 250);
      return null;
    },
    [selector, { scale, pad, dur }],
  );
  if (missing) throw new Error(`camera target not found: ${missing}`);
  // never click/act until the camera has fully settled, or targets drift mid-click
  await sleep(Math.max(dwell, dur * 1000 + 200));
}

/** White flash used to align logged beat marks with the recorded video time. */
async function syncFlash(page) {
  await page.evaluate(() => {
    const f = document.createElement("div");
    f.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:#fff;opacity:.92;pointer-events:none";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 160);
  });
}

/* ---------------- session scaffolding ---------------- */

function makeMarker() {
  const marks = [];
  let t0 = 0;
  return {
    marks,
    start() {
      t0 = Date.now();
    },
    mark(label) {
      const t = (Date.now() - t0) / 1000;
      marks.push({ label, t: Number(t.toFixed(2)) });
      console.log(`  ✂ ${label} @ ${t.toFixed(2)}s`);
    },
  };
}

async function withSession(name, fn) {
  const browser = sharedBrowser ?? (sharedBrowser = await launchBrowser());
  try {
    const context = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 1,
      recordVideo: { dir: RAW_DIR, size: VIEW },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      colorScheme: "light",
    });
    await context.addInitScript(CURSOR_SCRIPT);
    const page = await context.newPage();
    page.__videoName = name;
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await settleBoard(page, 1600);
    await initCamera(page);
    await sleep(300);
    const marker = makeMarker();
    marker.start();
    await syncFlash(page);
    marker.mark("t0");
    await fn(page, marker);
    writeFileSync(join(RAW_DIR, `${name}.marks.json`), JSON.stringify(marker.marks, null, 2));
    const videoPath = await finalizeVideo(context, page, name);
    console.log(`✔ ${name} → ${videoPath}`);
  } catch (error) {
    await sharedBrowser?.close().catch(() => {});
    sharedBrowser = undefined;
    throw error;
  }
}

/* ---------------- beat sheets ---------------- */

async function importFlow(page, file, { slow = false } = {}) {
  const pause = slow ? 700 : 340;
  await moveClick(page, ".settings-btn");
  await beat(page, pause);
  await moveTo(page, '.n-dropdown-option-body__label:text-is("数据")');
  await beat(page, slow ? 650 : 420);
  await moveClick(page, '.n-dropdown-option-body__label:text-is("导入空间")');
  await beat(page, pause);
  await page.setInputFiles('input[type="file"][hidden]', file);
  await page.locator('[data-testid="companion-yes"]').waitFor({ state: "visible", timeout: 9000 });
  await beat(page, pause);
  await moveClick(page, '[data-testid="companion-yes"]');
  await beat(page, slow ? 1700 : 1150);
}

/** Scene A: import 我的工作台 → quick actions → todos → notes (one take). */
async function sceneWork(page, { mark }) {
  // import — the ONE big zoom: tight on the gear, wide again as the board lands
  await camTo(page, ".settings-btn", { scale: 2.2, pad: 70 });
  await moveClick(page, ".settings-btn");
  await beat(page, 550);
  await moveTo(page, '.n-dropdown-option-body__label:text-is("数据")');
  await beat(page, 650);
  await moveClick(page, '.n-dropdown-option-body__label:text-is("导入空间")');
  await beat(page, 550);
  await page.setInputFiles('input[type="file"][hidden]', `${SAMPLES}我的工作台.json`);
  await page.locator('[data-testid="companion-yes"]').waitFor({ state: "visible", timeout: 9000 });
  await camTo(page, null, { dwell: 1150 }); // pull back wide; companion bubble sits in-frame
  await moveClick(page, '[data-testid="companion-yes"]');
  await page.locator(".todo-panel .todo-item").first().waitFor({ state: "visible", timeout: 9000 });
  await beat(page, 1800);
  mark("A-import");

  // quick actions — modest push on the panel, copy the daily-report template
  await camTo(page, ".quick-block", { scale: 1.6 });
  await moveTo(page, '.quick-button:has-text("日报模板")');
  await beat(page, 500);
  await moveClick(page, '.quick-button:has-text("日报模板")');
  await beat(page, 1500);
  mark("A-quick");
  await camTo(page, null, { dwell: 750 });

  // todos — modest push, complete the first open item, watch it pin to the top
  await camTo(page, ".todo-panel", { scale: 1.6 });
  await moveTo(page, '.todo-item:not(.is-done) .todo-checkbox >> nth=0');
  await beat(page, 420);
  const firstList = page.locator('[data-testid^="todo-list-"]').first();
  await firstList.locator(".todo-item:not(.is-done) .todo-checkbox").first().click();
  await beat(page, 1400);
  mark("A-todos");
  await camTo(page, null, { dwell: 700 });

  // notes — modest push on the sticky panel and type an indented line
  await camTo(page, ".space-panel", { scale: 1.6 });
  await moveClick(page, ".space-text-panel textarea >> nth=0");
  await beat(page, 420);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("周会前把演示 demo 再过一遍", { delay: 70 });
  await beat(page, 1600);
  mark("A-notes");
  await camTo(page, null, { dwell: 900 });
}

/** Scene B: 旅行手账 — drag photos into the image bed, open the preview. */
async function sceneTravel(page, { mark }) {
  await importFlow(page, `${SAMPLES}themes/旅行规划.json`);
  mark("B-ready");

  await camTo(page, ".image-panel", { scale: 1.6 });
  const payload = ["aurora.png", "snow-mountain.png"].map((name) => ({
    name,
    type: "image/png",
    base64: readFileSync(new URL(`../assets/drop/${name}`, import.meta.url)).toString("base64"),
  }));
  await moveTo(page, ".image-panel");
  await beat(page, 380);
  await page.evaluate(async (files) => {
    const dt = new DataTransfer();
    for (const f of files) {
      const res = await fetch(`data:${f.type};base64,${f.base64}`);
      dt.items.add(new File([await res.blob()], f.name, { type: f.type }));
    }
    const target = document.querySelector(".image-panel") ?? document.body;
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
  await beat(page, 2300);
  mark("B-dropped");

  await camTo(page, null, { dwell: 900 });
  await moveClick(page, ".image-panel img >> nth=0");
  await beat(page, 2000);
  mark("B-preview");
  await page.keyboard.press("Escape");
  await beat(page, 800);
  mark("B-end");
}

/** Scene C: multi-space — one zoomed switcher hop, then a WIDE theme montage. */
async function sceneSpaces(page, { mark }) {
  for (const file of ["themes/健身训练.json", "themes/旅行规划.json", "themes/自媒体创作.json", "人生清单.json"]) {
    await importFlow(page, `${SAMPLES}${file}`);
    await beat(page, 320);
  }
  mark("C-ready");

  // switcher mechanics — zoom tight on the trigger for the open + hop
  await camTo(page, '[data-testid="workspace-trigger"]', { scale: 2.2, pad: 30 });
  await moveClick(page, '[data-testid="workspace-trigger"]');
  await beat(page, 1400);
  await moveClick(page, '.workspace-switcher-item:has-text("旅行手账")');
  await camTo(page, null, { dwell: 1500 });
  mark("C-switch");

  // montage — NO camera moves: full-board theme hops, colored captions label each
  for (const name of ["人生清单", "内容创作工坊", "健身训练站"]) {
    await moveClick(page, '[data-testid="workspace-trigger"]');
    await beat(page, 650);
    await moveClick(page, `.workspace-switcher-item:has-text("${name}")`);
    await beat(page, 1800);
    mark(`C-montage-${name}`);
  }

  // theme toggle — zoom on the button, pull wide on the dark board
  await camTo(page, '[data-testid="workbench-theme"]', { scale: 2.4, pad: 40 });
  await moveClick(page, '[data-testid="workbench-theme"]');
  await beat(page, 1600);
  await camTo(page, null, { dwell: 1300 });
  mark("C-theme");
}

/* ---------------- main ---------------- */

const SESSIONS = {
  "w-work": sceneWork,
  "w-travel": sceneTravel,
  "w-spaces": sceneSpaces,
};

const target = process.argv[2] ?? "all";
const names = target === "all" ? Object.keys(SESSIONS) : [target];

for (const name of names) {
  if (!SESSIONS[name]) {
    console.error(`unknown session: ${name}`);
    process.exit(1);
  }
}

await ensureDevServer();
try {
  for (const name of names) {
    console.log(`● recording ${name} …`);
    await withSession(name, SESSIONS[name]);
  }
} finally {
  await sharedBrowser?.close().catch(() => {});
  await stopDevServer();
}
console.log("done:", names.join(", "));

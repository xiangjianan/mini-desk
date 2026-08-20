// Debug: replicate scene A import flow with camera, then inspect failure state.
import { ensureDevServer, stopDevServer, BASE_URL } from "./server.mjs";
import { launchBrowser, settleBoard, moveTo, moveClick, beat, sleep, CURSOR_SCRIPT } from "./lib.mjs";

const SAMPLES = new URL("../../samples/", import.meta.url).pathname;
const VIEW = { width: 1080, height: 1920 };

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
    window.__cam = { s: 1, tx: 0, ty: 0 };
  });
}

async function camTo(page, selector, { scale = 2.1, pad = 26, dur = 0.85, dwell = 950 } = {}) {
  await page.evaluate(
    ([sel, opts]) => {
      const c = window.__cam;
      const wrap = document.getElementById("__camwrap");
      wrap.style.transitionDuration = `${opts.dur}s`;
      let target = { s: 1, tx: 0, ty: 0 };
      if (sel) {
        const el = document.querySelector(sel);
        if (!el) return;
        const r = el.getBoundingClientRect();
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
    },
    [selector, { scale, pad, dur }],
  );
  await sleep(Math.max(dwell, dur * 1000 + 200));
}

const browser = await launchBrowser();
await ensureDevServer();
try {
  const context = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: 1, locale: "zh-CN", timezoneId: "Asia/Shanghai", colorScheme: "light",
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await settleBoard(page, 1600);
  await initCamera(page);
  await sleep(300);

  await camTo(page, ".settings-btn", { scale: 1.8, pad: 44 });
  await moveClick(page, ".settings-btn");
  await beat(page, 550);
  await moveTo(page, '.n-dropdown-option-body__label:text-is("数据")');
  await beat(page, 650);
  await moveClick(page, '.n-dropdown-option-body__label:text-is("导入空间")');
  await beat(page, 550);
  await page.setInputFiles('input[type="file"][hidden]', `${SAMPLES}我的工作台.json`);
  await page.locator('[data-testid="companion-yes"]').waitFor({ state: "visible", timeout: 9000 });
  console.log("confirm bubble visible");
  await camTo(page, null, { dwell: 1150 });
  const preClick = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="companion-yes"]');
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  console.log("companion-yes box:", JSON.stringify(preClick));
  await moveClick(page, '[data-testid="companion-yes"]');
  await sleep(2500);
  const post = await page.evaluate(() => ({
    confirmStillThere: Boolean(document.querySelector('[data-testid="companion-yes"]')),
    todoItems: document.querySelectorAll(".todo-panel .todo-item").length,
    quickButtons: document.querySelectorAll(".quick-button").length,
    triggerTitle: document.querySelector(".workspace-trigger-title")?.textContent?.trim(),
  }));
  console.log("post-click:", JSON.stringify(post));
  await page.screenshot({ path: "/tmp/probe-after-import.png" });
  await context.close();
} finally {
  await browser.close();
  await stopDevServer();
}

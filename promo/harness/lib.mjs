// Shared helpers for recording Mini Desk demo sessions.
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

export const CHROME_PATH =
  "/Users/xiangjianan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

export const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5173/";

export const VIEWPORT = { width: 1600, height: 1000 };

export const RAW_DIR = new URL("../assets/raw/", import.meta.url).pathname;
export const SHOT_DIR = new URL("../assets/shots/", import.meta.url).pathname;

export async function launchBrowser() {
  return chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--disable-dev-shm-usage", "--hide-scrollbars", "--mute-audio", "--force-device-scale-factor=1"],
  });
}

export async function newRecordingContext(browser, name) {
  mkdirSync(RAW_DIR, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  page.__videoName = name;
  return { context, page };
}

/** Close the context and rename the newest webm in RAW_DIR to `<name>.webm`. */
export async function finalizeVideo(context, page, name) {
  const video = page.video();
  await context.close();
  if (!video) throw new Error("no video recorded");
  const path = await video.path();
  const target = join(RAW_DIR, `${name}.webm`);
  renameSync(path, target);
  return target;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Smoothly move the mouse to the center of the first matching element. */
export async function moveTo(page, selector, { steps = 24, offsetX = 0, offsetY = 0 } = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 8000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const x = box.x + box.width / 2 + offsetX;
  const y = box.y + box.height / 2 + offsetY;
  await page.mouse.move(x, y, { steps });
  return { x, y };
}

export async function moveClick(page, selector, opts = {}) {
  const { x, y } = await moveTo(page, selector, opts);
  await sleep(opts.hoverMs ?? 260);
  await page.mouse.click(x, y);
}

/** Idle beat so the recording shows the result of the previous action. */
export async function beat(page, ms = 900) {
  await sleep(ms);
}

// Injected fake cursor: a soft dot + ring that follows real mouse events and
// ripples on click, so recorded videos show where "the user" is pointing.
const CURSOR_SCRIPT = `(() => {
  const style = document.createElement("style");
  style.textContent = \`
    .__promo-cursor-dot, .__promo-cursor-ring, .__promo-cursor-ripple {
      position: fixed; top: 0; left: 0; pointer-events: none; border-radius: 9999px;
      z-index: 2147483647; transform: translate(-100px, -100px);
    }
    .__promo-cursor-dot { width: 8px; height: 8px; background: #111; box-shadow: 0 0 0 2px rgba(255,255,255,.85); }
    .__promo-cursor-ring { width: 30px; height: 30px; border: 1.5px solid rgba(17,17,17,.45); transition: transform .12s ease-out; }
    .__promo-cursor-ripple { width: 12px; height: 12px; border: 2px solid rgba(17,17,17,.55); animation: __promoRipple .45s ease-out forwards; }
    @keyframes __promoRipple { from { opacity: .9; scale: .6; } to { opacity: 0; scale: 2.6; } }
  \`;
  const dot = document.createElement("div");
  dot.className = "__promo-cursor-dot";
  const ring = document.createElement("div");
  ring.className = "__promo-cursor-ring";
  const mount = () => { (document.head ?? document.documentElement).append(style); document.body.append(dot, ring); };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
  const place = (el, x, y, half) => { el.style.transform = "translate(" + (x - half) + "px," + (y - half) + "px)"; };
  window.addEventListener("mousemove", (event) => {
    place(dot, event.clientX, event.clientY, 4);
    place(ring, event.clientX, event.clientY, 15);
  }, { passive: true, capture: true });
  window.addEventListener("mousedown", (event) => {
    const ripple = document.createElement("div");
    ripple.className = "__promo-cursor-ripple";
    place(ripple, event.clientX, event.clientY, 6);
    document.body.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }, { passive: true, capture: true });
})();`;

/** Import a workspace JSON file through the real UI flow and confirm 添加. */
export async function importWorkspaceViaUi(page, filePath, { slow = false } = {}) {
  const pause = slow ? 700 : 320;
  await moveClick(page, ".settings-btn");
  await beat(page, pause);
  await moveTo(page, '.n-dropdown-option-body__label:text-is("数据")');
  await beat(page, slow ? 650 : 420);
  await moveClick(page, '.n-dropdown-option-body__label:text-is("导入空间")');
  await beat(page, pause);
  await page.setInputFiles('input[type="file"][hidden]', filePath);
  await page.locator('[data-testid="companion-yes"]').waitFor({ state: "visible", timeout: 8000 });
  await beat(page, pause);
  await moveClick(page, '[data-testid="companion-yes"]');
  // Wait until the companion bubble confirms the import and the board shows it.
  await beat(page, slow ? 1600 : 1100);
}

/** Dismiss any lingering tips bubble without disturbing the board. */
export async function settleBoard(page, ms = 1400) {
  await page.waitForSelector('[data-testid="workbench-command-bar"]', { timeout: 15000 });
  await sleep(ms);
}

export function newestRawVideo() {
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".webm"));
  files.sort((a, b) => statSync(join(RAW_DIR, b)).mtimeMs - statSync(join(RAW_DIR, a)).mtimeMs);
  return files[0];
}

// Exported so the vertical recorder can reuse the same fake cursor.
export { CURSOR_SCRIPT };

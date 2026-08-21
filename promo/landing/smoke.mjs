/* Landing page smoke test: loads the built preview, checks console errors,
   toggles the theme, and captures screenshots for both themes. */
import { chromium } from "../harness/node_modules/playwright-core/index.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const EXECUTABLE =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => {
  const url = req.url();
  // ERR_ABORTED on media is the browser suspending/range-requesting preload="metadata"
  // videos — expected, not a server failure. Real failures (DNS, 404, refused) still fail.
  const aborted = req.failure()?.errorText === "net::ERR_ABORTED";
  if (!url.includes("favicon") && !(aborted && /\.(mp4|webm)$/.test(url))) {
    errors.push(`requestfailed: ${url} — ${req.failure()?.errorText}`);
  }
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Basic DOM contract
const checks = {
  title: await page.title(),
  themeCards: await page.locator(".theme-card").count(),
  featureRows: await page.locator(".feature-row").count(),
  featureCards: await page.locator(".feature-card").count(),
  videos: await page.locator("video").count(),
  themeAttr: await page.evaluate(() => document.documentElement.getAttribute("data-theme")),
};
console.log("checks:", JSON.stringify(checks, null, 2));

// Hero promo video should be playing (autoplay while visible) — check before scrolling
const heroPlaying = await page.evaluate(() => {
  const v = document.getElementById("promoVideo");
  return !!v && !v.paused && v.currentTime > 0;
});
console.log("hero video playing:", heroPlaying);

// Scroll through the page to trigger reveals + lazy media
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1200);
const revealed = await page.locator(".reveal.in").count();
console.log("revealed elements:", revealed);

// Offscreen videos should be paused by the visibility observer
const heroPausedOffscreen = await page.evaluate(() => {
  const v = document.getElementById("promoVideo");
  return !!v && v.paused;
});
console.log("hero video paused while offscreen:", heroPausedOffscreen);

// Feature-row videos should resume playback once scrolled into view
const rows = page.locator(".feature-row video");
const rowCount = await rows.count();
let featurePlaying = true;
for (let i = 0; i < rowCount; i++) {
  await rows.nth(i).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1400);
  const state = await rows.nth(i).evaluate((v) => ({ paused: v.paused, t: v.currentTime }));
  if (state.paused || state.t <= 0) featurePlaying = false;
}
console.log("feature videos playing after scroll:", featurePlaying);
if (!heroPlaying || !heroPausedOffscreen || !featurePlaying) errors.push("video visibility observer misbehaving");

// Light theme screenshot
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await page.screenshot({ path: "smoke-light.png" });

// Toggle to dark
await page.click("#themeToggle");
await page.waitForTimeout(600);
const darkAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const stored = await page.evaluate(() => localStorage.getItem("mini-desk-landing-theme"));
console.log("after toggle:", darkAttr, "| stored:", stored);
await page.screenshot({ path: "smoke-dark.png" });

// Reload: persisted theme should survive
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const afterReload = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
console.log("after reload:", afterReload);

await browser.close();

if (errors.length) {
  console.log("ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("SMOKE OK — no console errors, no failed requests");

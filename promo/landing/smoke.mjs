/* Landing page smoke test: loads the built preview, checks console errors and
   failed requests, verifies the DOM contract, scroll reveal, video visibility
   playback, and horizontal overflow across desktop/tablet/mobile viewports. */
import { chromium } from "../harness/node_modules/playwright-core/index.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const EXECUTABLE =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const errors = [];
const browser = await chromium.launch({ executablePath: EXECUTABLE });

async function openPage(viewport, label) {
  const page = await browser.newPage({ viewport });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[${label}] console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[${label}] pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    const url = req.url();
    // ERR_ABORTED on media is the browser suspending / range-requesting
    // preload="metadata" videos — expected, not a server failure.
    const aborted = req.failure()?.errorText === "net::ERR_ABORTED";
    if (!url.includes("favicon") && !(aborted && /\.(mp4|webm)$/.test(url))) {
      errors.push(`[${label}] requestfailed: ${url} — ${req.failure()?.errorText}`);
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  return page;
}

/* ---------- DOM contract + video visibility (desktop) ---------- */
{
  const page = await openPage({ width: 1440, height: 1000 }, "desktop");

  const checks = {
    title: await page.title(),
    themeCards: await page.locator(".theme-card").count(),
    featureRows: await page.locator(".feature-row").count(),
    featureCards: await page.locator(".feature-card").count(),
    videos: await page.locator("video").count(),
  };
  console.log("checks:", JSON.stringify(checks, null, 2));

  // Hero promo video should be playing (autoplay while visible)
  const heroPlaying = await page.evaluate(() => {
    const v = document.getElementById("promoVideo");
    return !!v && !v.paused && v.currentTime > 0;
  });
  console.log("hero video playing:", heroPlaying);

  // Scroll through the page to trigger reveals + lazy media
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  console.log("revealed elements:", await page.locator(".reveal.in").count());

  // Offscreen videos should be paused by the visibility observer
  const heroPausedOffscreen = await page.evaluate(() => {
    const v = document.getElementById("promoVideo");
    return !!v && v.paused;
  });
  console.log("hero video paused while offscreen:", heroPausedOffscreen);

  // Feature-row videos should resume playback once scrolled into view
  const rows = page.locator(".feature-row video");
  let featurePlaying = true;
  for (let i = 0; i < await rows.count(); i++) {
    await rows.nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1400);
    const state = await rows.nth(i).evaluate((v) => ({ paused: v.paused, t: v.currentTime }));
    if (state.paused || state.t <= 0) featurePlaying = false;
  }
  console.log("feature videos playing after scroll:", featurePlaying);
  if (!heroPlaying || !heroPausedOffscreen || !featurePlaying) {
    errors.push("video visibility observer misbehaving");
  }

  await page.screenshot({ path: "smoke.png" });
  await page.close();
}

/* ---------- horizontal overflow + nav layout across viewports ---------- */
for (const vp of [
  { width: 1440, height: 1000, name: "desktop" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 390, height: 844, name: "mobile" },
]) {
  const page = await openPage(vp, vp.name);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    if (docW <= winW) return null;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > winW + 1 || r.left < -1) {
        const cls = (typeof el.className === "string" ? el.className : "").split(" ")[0];
        offenders.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} right=${Math.round(r.right)}`);
      }
    }
    return { docW, winW, offenders: offenders.slice(0, 8) };
  });
  console.log(`${vp.name} overflow:`, overflow ? JSON.stringify(overflow) : "none");
  if (overflow) errors.push(`[${vp.name}] horizontal overflow: ${JSON.stringify(overflow)}`);

  if (vp.name === "mobile") {
    // nav CTA should sit at the right edge when nav links are hidden
    const cta = await page.evaluate(() => {
      const r = document.querySelector(".nav-cta").getBoundingClientRect();
      return { right: Math.round(r.right), winW: window.innerWidth };
    });
    const aligned = Math.abs(cta.right - (cta.winW - 20)) <= 8;
    console.log("mobile nav-cta right-aligned:", aligned, JSON.stringify(cta));
    if (!aligned) errors.push(`[mobile] nav-cta not right-aligned: ${JSON.stringify(cta)}`);
  }
  await page.close();
}

await browser.close();

if (errors.length) {
  console.log("ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("SMOKE OK — no console errors, no failed requests, no overflow");

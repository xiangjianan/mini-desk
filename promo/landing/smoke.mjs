/* Landing page smoke test: loads the built preview, checks console errors and
   failed requests, verifies the DOM contract, scroll reveal, video visibility
   playback, light/dark + palette switching with persistence, and horizontal
   overflow across desktop/tablet/mobile viewports. */
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
    theme: await page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    palette: await page.evaluate(() => document.documentElement.getAttribute("data-palette")),
    bodyBg: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  };
  console.log("checks:", JSON.stringify(checks, null, 2));
  // default must stay the original dark aurora look
  if (checks.theme !== "dark" || checks.palette !== "aurora" || checks.bodyBg !== "rgb(7, 9, 15)") {
    errors.push(`default should be dark+aurora (#07090f), got ${checks.theme}+${checks.palette} ${checks.bodyBg}`);
  }

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

  /* ---------- palette switching ---------- */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.click("#paletteBtn");
  await page.waitForTimeout(300);
  const popOpen = await page.locator(".palette-pop.open").count();
  const optCount = await page.locator(".palette-opt").count();
  console.log("palette popover open:", popOpen === 1, "| options:", optCount);
  if (popOpen !== 1 || optCount !== 4) errors.push("palette popover did not open with 4 options");

  const auroraAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  await page.click('.palette-opt[data-palette="ocean"]');
  await page.waitForTimeout(400);
  const oceanAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  console.log("accent aurora→ocean:", auroraAccent, "→", oceanAccent);
  if (auroraAccent !== "#5eeabe" || oceanAccent !== "#7dd3fc") errors.push("palette switch did not update --accent");

  // popover should close after selecting, and on outside click when reopened
  const closedAfterSelect = (await page.locator(".palette-pop.open").count()) === 0;
  await page.click("#paletteBtn");
  await page.waitForTimeout(200);
  await page.click("h1"); // click outside
  await page.waitForTimeout(200);
  const closedOutside = (await page.locator(".palette-pop.open").count()) === 0;
  console.log("popover closes on select:", closedAfterSelect, "| on outside click:", closedOutside);
  if (!closedAfterSelect || !closedOutside) errors.push("palette popover close behavior broken");

  /* ---------- theme switching ---------- */
  await page.click("#themeToggle");
  await page.waitForTimeout(500);
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const stored = await page.evaluate(() => localStorage.getItem("mini-desk-landing-prefs"));
  const metaColor = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').getAttribute("content"));
  console.log("light bg:", lightBg, "| stored:", stored, "| meta theme-color:", metaColor);
  if (lightBg !== "rgb(245, 246, 250)") errors.push(`light theme bg wrong: ${lightBg}`);
  if (stored !== '{"theme":"light","palette":"ocean"}') errors.push(`prefs not persisted correctly: ${stored}`);
  if (metaColor !== "#f5f6fa") errors.push(`meta theme-color not updated: ${metaColor}`);

  await page.screenshot({ path: "smoke-light-ocean.png" });

  // reload: both choices must survive
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const persisted = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    palette: document.documentElement.getAttribute("data-palette"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  console.log("persisted after reload:", JSON.stringify(persisted));
  if (persisted.theme !== "light" || persisted.palette !== "ocean") errors.push("prefs did not survive reload");

  // switch back to dark + aurora for the default-look screenshot
  await page.click("#themeToggle");
  await page.waitForTimeout(400);
  await page.click("#paletteBtn");
  await page.click('.palette-opt[data-palette="aurora"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: "smoke-dark-aurora.png" });
  const backToDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (backToDark !== "rgb(7, 9, 15)") errors.push(`dark+aurora restore failed: ${backToDark}`);

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
    // nav controls + CTA should sit at the right edge when nav links are hidden
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
console.log("SMOKE OK — no console errors, no failed requests, no overflow, theme/palette switching verified");

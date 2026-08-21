/* Landing page smoke test: loads the built preview, checks console errors and
   failed requests, verifies the DOM contract, scroll reveal, video visibility
   playback, system-following theme (light/dark) with manual override, and
   horizontal overflow across desktop/tablet/mobile viewports. */
import { chromium } from "../harness/node_modules/playwright-core/index.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const EXECUTABLE =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const errors = [];
const browser = await chromium.launch({ executablePath: EXECUTABLE });

function watchPage(page, label) {
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
}

const state = (page) =>
  page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    /* --bg 变量即时生效;body 背景有 0.35s 过渡,切换瞬间读到的是中间值 */
    bgVar: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    metaColor: document.querySelector('meta[name="theme-color"]').getAttribute("content"),
    accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    grad: getComputedStyle(document.querySelector(".grad")).backgroundImage.slice(0, 60),
  }));

/* ---------- theme follows the system preference ---------- */
{
  // system light → light theme
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  watchPage(page, "sys-light");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  let s = await state(page);
  console.log("system light  →", JSON.stringify(s));
  if (s.theme !== "light" || s.bgVar !== "#f5f6fa" || s.bodyBg !== "rgb(245, 246, 250)") errors.push(`system light should render light: ${JSON.stringify(s)}`);

  // no manual override yet → live system switch to dark
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  s = await state(page);
  console.log("system → dark  →", JSON.stringify({ theme: s.theme, bgVar: s.bgVar }));
  if (s.theme !== "dark" || s.bgVar !== "#07090f") errors.push(`live system switch to dark failed: ${JSON.stringify(s)}`);

  // and back to light
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  s = await state(page);
  console.log("system → light →", JSON.stringify({ theme: s.theme, bgVar: s.bgVar }));
  if (s.theme !== "light") errors.push("live system switch back to light failed");

  // manual toggle persists an override…
  await page.click("#themeToggle");
  await page.waitForTimeout(400);
  s = await state(page);
  const saved = await page.evaluate(() => localStorage.getItem("mini-desk-landing-theme"));
  console.log("manual toggle  →", JSON.stringify({ theme: s.theme, saved, metaColor: s.metaColor }));
  if (s.theme !== "dark" || saved !== "dark" || s.metaColor !== "#07090f") {
    errors.push(`manual toggle should save dark override: ${JSON.stringify({ ...s, saved })}`);
  }

  // …which ignores later system changes…
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  s = await state(page);
  console.log("override + sys light →", JSON.stringify({ theme: s.theme }));
  if (s.theme !== "dark") errors.push("saved override should ignore system change");

  // …and survives reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  s = await state(page);
  console.log("after reload   →", JSON.stringify({ theme: s.theme, bodyBg: s.bodyBg }));
  if (s.theme !== "dark" || s.bodyBg !== "rgb(7, 9, 15)") errors.push("override did not survive reload");

  // cleared override falls back to system again
  await page.evaluate(() => localStorage.removeItem("mini-desk-landing-theme"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  s = await state(page);
  console.log("cleared override →", JSON.stringify({ theme: s.theme }));
  if (s.theme !== "light") errors.push("cleared override should follow system (light)");
  await page.close();
}

/* ---------- dark system default look matches the original design ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
  watchPage(page, "sys-dark");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const checks = {
    title: await page.title(),
    themeCards: await page.locator(".theme-card").count(),
    featureRows: await page.locator(".feature-row").count(),
    featureCards: await page.locator(".feature-card").count(),
    videos: await page.locator("video").count(),
    theme: await page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    bodyBg: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  };
  console.log("checks:", JSON.stringify(checks, null, 2));
  // system dark must render the original dark aurora look
  if (checks.theme !== "dark" || checks.bodyBg !== "rgb(7, 9, 15)") {
    errors.push(`system dark should render original dark look: ${checks.theme} ${checks.bodyBg}`);
  }
  // no palette remnants
  const remnants = await page.evaluate(() => ({
    paletteAttr: document.documentElement.getAttribute("data-palette"),
    paletteBtn: !!document.getElementById("paletteBtn"),
    paletteOpts: document.querySelectorAll(".palette-opt").length,
  }));
  console.log("palette remnants:", JSON.stringify(remnants));
  if (remnants.paletteAttr || remnants.paletteBtn || remnants.paletteOpts) errors.push("palette UI not fully removed");

  // original aurora gradient intact on primary button
  const btnBg = await page.evaluate(() => getComputedStyle(document.querySelector(".btn.primary")).backgroundImage);
  const expected = "linear-gradient(120deg, rgb(94, 234, 190), rgb(34, 211, 238))";
  console.log("primary button gradient match:", btnBg === expected);
  if (btnBg !== expected) errors.push(`primary button gradient changed: ${btnBg}`);

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
    const st = await rows.nth(i).evaluate((v) => ({ paused: v.paused, t: v.currentTime }));
    if (st.paused || st.t <= 0) featurePlaying = false;
  }
  console.log("feature videos playing after scroll:", featurePlaying);
  if (!heroPlaying || !heroPausedOffscreen || !featurePlaying) {
    errors.push("video visibility observer misbehaving");
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "smoke-dark.png" });
  await page.close();
}

/* ---------- light theme screenshot ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  watchPage(page, "shot-light");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "smoke-light.png" });
  await page.close();
}

/* ---------- horizontal overflow + nav layout across viewports ---------- */
for (const vp of [
  { width: 1440, height: 1000, name: "desktop" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 390, height: 844, name: "mobile" },
]) {
  const page = await browser.newPage({ viewport: vp, colorScheme: "dark" });
  watchPage(page, vp.name);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
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
console.log("SMOKE OK — system-following theme verified, no console errors, no failed requests, no overflow");

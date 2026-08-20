// One-off check: hover-play cards stay as posters by default and fade in video on hover.
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdirSync } from "node:fs";
import { launchBrowser } from "./lib.mjs";

const LANDING = new URL("../landing/", import.meta.url).pathname;
const PORT = 5189;
const URL_ = `http://127.0.0.1:${PORT}/`;
const OUT = new URL("../assets/landing-shots/", import.meta.url).pathname;

function ping() {
  return new Promise((resolve) => {
    const req = http.get(URL_, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}

const server = spawn("./node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: LANDING, stdio: ["ignore", "ignore", "pipe"],
});
const stop = () => { if (!server.killed) server.kill("SIGTERM"); };
process.on("exit", stop);

try {
  for (let i = 0; i < 100; i += 1) {
    if (await ping()) break;
    await new Promise((r) => setTimeout(r, 300));
    if (i === 99) throw new Error("landing dev server did not start");
  }
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(1500);
  mkdirSync(OUT, { recursive: true });

  const checks = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".hover-play")];
    return {
      hoverPlayCount: cards.length,
      withImg: cards.filter((c) => c.querySelector("img")).length,
      withBadge: cards.filter((c) => c.querySelector(".play-badge")).length,
      autoplayVideos: [...document.querySelectorAll("video")].length,
    };
  });
  console.log("DOM checks:", JSON.stringify(checks));

  // Hover the first theme card → video element should be created, playing class applied.
  await page.evaluate(() => document.querySelector("#themes")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(900);
  const card = page.locator("#themes .hover-play").first();
  await card.hover();
  await page.waitForTimeout(1600);
  const hoverState = await page.evaluate(() => {
    const c = document.querySelector("#themes .hover-play");
    const v = c?.querySelector("video");
    return {
      hasPlayingClass: c?.classList.contains("playing") ?? false,
      videoCreated: Boolean(v),
      videoPaused: v ? v.paused : null,
      videoTime: v ? Number(v.currentTime.toFixed(2)) : null,
    };
  });
  console.log("hover state:", JSON.stringify(hoverState));
  await page.screenshot({ path: `${OUT}/06-hover.png` });

  // Move mouse away → video should pause and fade out.
  await page.mouse.move(800, 60);
  await page.waitForTimeout(900);
  const leaveState = await page.evaluate(() => {
    const c = document.querySelector("#themes .hover-play");
    const v = c?.querySelector("video");
    return { hasPlayingClass: c?.classList.contains("playing") ?? false, videoPaused: v ? v.paused : null };
  });
  console.log("leave state:", JSON.stringify(leaveState));
  await browser.close();
} finally {
  stop();
}

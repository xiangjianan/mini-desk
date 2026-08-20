// Screenshot the landing page (dev server on :5188) for visual review.
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdirSync } from "node:fs";
import { launchBrowser, CHROME_PATH } from "./lib.mjs";
import { chromium } from "playwright-core";

const LANDING = new URL("../landing/", import.meta.url).pathname;
const PORT = 5188;
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
  await page.waitForTimeout(2500);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/01-hero.png` });
  // Scroll to key sections so reveal animations trigger, then take section shots.
  for (const [name, selector] of [["02-features", "#features"], ["03-themes", "#themes"], ["04-privacy", "#privacy"], ["05-cta", ".cta"]]) {
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), selector);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await browser.close();
  console.log("shots →", OUT);
} finally {
  stop();
}

// Smoke test: boot server, load the app, record 4 seconds, take a screenshot.
import { mkdirSync } from "node:fs";
import { ensureDevServer, stopDevServer, BASE_URL } from "./server.mjs";
import { launchBrowser, newRecordingContext, finalizeVideo, settleBoard, sleep, SHOT_DIR } from "./lib.mjs";

const server = await ensureDevServer();
try {
  const browser = await launchBrowser();
  const { context, page } = await newRecordingContext(browser, "smoke");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await settleBoard(page, 2000);
  await page.mouse.move(400, 400, { steps: 20 });
  await page.mouse.move(900, 500, { steps: 30 });
  await sleep(1500);
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/smoke.png` });
  const title = await page.title();
  const videoPath = await finalizeVideo(context, page, "smoke");
  await browser.close();
  console.log("title:", title);
  console.log("video:", videoPath);
  console.log("shot:", `${SHOT_DIR}/smoke.png`);
} finally {
  await stopDevServer();
}

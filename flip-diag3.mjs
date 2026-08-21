import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:5199/");
await page.waitForTimeout(3500);
const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.innerText || b.className).slice(0, 20));
console.log(JSON.stringify(btns, null, 1));
await browser.close();

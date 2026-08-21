import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("CONSOLE", m.type(), m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:5199/");
await page.waitForTimeout(4000);
console.log("title:", await page.title());
console.log("html len:", (await page.content()).length);
console.log("inputs:", await page.locator("input.todo-input").count());
console.log("todo items:", await page.locator("li.todo-item").count());
console.log("body classes:", await page.evaluate(() => document.body.className));
const hints = await page.evaluate(() => ({
  hasApp: !!document.querySelector("#app > *"),
  appChild: document.querySelector("#app")?.children[0]?.className?.slice?.(0, 80) ?? String(document.querySelector("#app")?.children[0]?.tagName),
  blocked: [...document.querySelectorAll("*")].filter((e) => e.className && String(e.className).includes("blocked")).length,
}));
console.log(JSON.stringify(hints));
await page.screenshot({ path: "/tmp/flip-diag.png" });
await browser.close();

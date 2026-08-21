import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:5199/");
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  return {
    sections: q(".todo-section"), lists: q(".todo-list"), listEls: q("[data-testid^=todo-list-]"),
    board: q(".board"), workspace: q(".workspace-panel"), buttons: q("button"),
    inputsAll: q("input"), wsInputs: q("input.ws-input"),
    text: (document.querySelector(".board")?.innerText ?? "").slice(0, 600),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();

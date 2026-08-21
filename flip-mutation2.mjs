/* 一次性观测 3：区分 上移到底走了 FLIP-move / enter-leave重建 / 完全无过渡。 */
import { chromium } from "playwright-core";
const N = 8, TARGET = 3;
const todos = Array.from({ length: N }, (_, i) => ({ id: `t${i}`, text: `条目${i + 1}`, done: false }));
const state = { theme: "light", language: "zh", workspaces: [{ id: "w1", createdAt: 1, customTitles: {}, noteLines: [], workspaceLines: [], storageLines: [], spaces: [{ id: "s1", title: "便签", lines: [] }], activeSpaceId: "s1", images: [], quickTags: [], quickButtons: [], todoLists: [{ id: "morning", title: "☀️ 早上", collapsed: false, compact: false }], showCompletedTodos: { morning: true }, todos: { morning: todos } }], activeWorkspaceId: "w1" };
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript((s) => { localStorage.clear(); localStorage.setItem("mini-desk-state-v1", JSON.stringify(s)); }, state);
await page.goto("http://127.0.0.1:5199/");
await page.waitForSelector("li.todo-item");
await page.evaluate(() => {
  const ul = document.querySelector("[data-testid^=todo-list-]");
  ul.querySelectorAll("li.todo-item").forEach((li) => { li.dataset.tag = li.dataset.todoId; }); // 原生行打 tag
  window.__log = [];
  window.__t0 = performance.now();
  const now = () => (performance.now() - window.__t0).toFixed(1);
  new MutationObserver((recs) => {
    for (const r of recs) {
      for (const n of r.addedNodes) {
        const fresh = n.nodeType === 1 && !n.dataset.tag;
        if (fresh) n.dataset.tag = n.dataset.todoId + "★新建";
        window.__log.push(`${now()}ms  +插入 ${n.dataset?.tag ?? n.nodeName} (next: ${n.nextElementSibling?.dataset?.tag ?? "null"})`);
      }
      for (const n of r.removedNodes) window.__log.push(`${now()}ms  -移除 ${n.dataset?.tag ?? n.nodeName}`);
      if (r.type === "attributes") window.__log.push(`${now()}ms  attr.${r.attributeName} @${r.target.dataset?.tag ?? "?"} → ${r.attributeName === "style" ? (r.target.getAttribute("style") || "") : [...r.target.classList].filter((c) => c.includes("move")).join(",")}`);
    }
  }).observe(ul, { attributes: true, attributeFilter: ["class", "style"], childList: true, subtree: true });
  document.addEventListener("transitionstart", (e) => window.__log.push(`${now()}ms  transitionstart ${e.propertyName} @${e.target.dataset?.tag ?? e.target.tagName}`), true);
  document.addEventListener("transitioncancel", (e) => window.__log.push(`${now()}ms  transitioncancel ${e.propertyName} @${e.target.dataset?.tag ?? "?"}`), true);
});
const target = page.locator("input.todo-input").nth(TARGET);
await target.click();
await page.waitForTimeout(250);
async function run(label) {
  await page.evaluate(() => { window.__log = []; window.__t0 = performance.now(); });
  await page.keyboard.down("Control"); await page.keyboard.press(label === "down" ? "ArrowDown" : "ArrowUp"); await page.keyboard.up("Control");
  await page.waitForTimeout(700);
  const order = await page.evaluate(() => [...document.querySelectorAll("li.todo-item")].map((li) => li.dataset.tag));
  console.log(`\n===== [${label}] 顺序→ ${order.join(",")}`);
  console.log((await page.evaluate(() => window.__log)).join("\n") || "(无记录)");
}
await run("up");
await run("down");
await browser.close();

/* 一次性观测 2：MutationObserver 记录换行瞬间的完整 DOM 编舞。 */
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
  window.__t0 = performance.now();
  window.__recs = [];
  const ul = document.querySelector("[data-testid^=todo-list-]");
  new MutationObserver((recs) => {
    for (const r of recs) {
      const t = (performance.now() - window.__t0).toFixed(1);
      if (r.type === "attributes") window.__recs.push(`${t}ms attr ${r.attributeName} on ${r.target.dataset?.todoId ?? "?"} → ${(r.target.style?.transform || "").slice(0, 40) || r.target.className?.split?.(" ").find((c) => c.includes("move")) || ""}`);
      else for (const n of r.addedNodes) window.__recs.push(`${t}ms +insert ${n.dataset?.todoId ?? n.nodeName}`);
    }
  }).observe(ul, { attributes: true, attributeFilter: ["class", "style"], childList: true, subtree: false });
});
const target = page.locator("input.todo-input").nth(TARGET);
await target.click();
await page.waitForTimeout(200);
await page.evaluate(() => { window.__t0 = performance.now(); });
await page.keyboard.down("Control"); await page.keyboard.press("ArrowUp"); await page.keyboard.up("Control");
await page.waitForTimeout(800);
console.log("== UP 变异记录 ==");
console.log((await page.evaluate(() => window.__recs)).join("\n") || "(无)");
// 对照：down
await page.evaluate(() => { window.__recs = []; window.__t0 = performance.now(); });
await page.keyboard.down("Control"); await page.keyboard.press("ArrowDown"); await page.keyboard.up("Control");
await page.waitForTimeout(800);
console.log("\n== DOWN 变异记录（对照）==");
console.log((await page.evaluate(() => window.__recs)).join("\n") || "(无)");
await browser.close();

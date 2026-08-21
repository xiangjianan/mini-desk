/* 一次性观测 4：劫持 WeakMap.set({top,left}) 与 insertBefore，定位 positionMap 记录与 DOM 换序的时间顺序。 */
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
  const order = () => [...ul.children].map((li) => li.dataset.todoId).join(",");
  window.__t0 = performance.now();
  const now = () => (performance.now() - window.__t0).toFixed(1);
  window.__log = [];
  // 1) positionMap / newPositionMap 记录（值为 {top,left} 形状）
  const origSet = WeakMap.prototype.set;
  WeakMap.prototype.set = function (k, v) {
    if (v && typeof v === "object" && "top" in v && "left" in v && k?.el instanceof Element) {
      window.__log.push(`${now()}ms  Map.set pos @${k.el.dataset.todoId} top=${v.top.toFixed(0)} 当前DOM序=[${order()}]`);
    }
    return origSet.call(this, k, v);
  };
  // 2) 物理换序
  const origIns = Element.prototype.insertBefore;
  Element.prototype.insertBefore = function (node, ref) {
    const r = origIns.call(this, node, ref);
    if (this === ul && node.nodeType === 1) window.__log.push(`${now()}ms  insertBefore ${node.dataset.todoId} before ${ref?.dataset?.todoId ?? ref?.nodeName ?? "null"} → DOM序=[${order()}]`);
    return r;
  };
  // 3) move 类
  new MutationObserver((recs) => {
    for (const r of recs) if (r.type === "attributes" && r.attributeName === "class") {
      const mc = [...r.target.classList].filter((c) => c.includes("move"));
      if (mc.length) window.__log.push(`${now()}ms  move类 @${r.target.dataset.todoId} → ${mc.join(",")}`);
    }
  }).observe(ul, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
});
const target = page.locator("input.todo-input").nth(TARGET);
await target.click();
await page.waitForTimeout(300);
async function run(label) {
  await page.evaluate(() => { window.__log = []; window.__t0 = performance.now(); });
  await page.keyboard.down("Control"); await page.keyboard.press(label === "down" ? "ArrowDown" : "ArrowUp"); await page.keyboard.up("Control");
  await page.waitForTimeout(700);
  console.log(`\n===== [${label}] =====`);
  console.log((await page.evaluate(() => window.__log)).join("\n") || "(无记录)");
}
await run("up");
await run("down");
await browser.close();

/* 一次性观测：真实 Chrome 里 Ctrl+↓ / Ctrl+↑ 换行的 FLIP 动画是否对称（验证后即删）。 */
import { chromium } from "playwright-core";

const N = 8, TARGET = 3;
const todos = Array.from({ length: N }, (_, i) => ({ id: `t${i}`, text: `条目${i + 1}`, done: false }));
const state = {
  theme: "light", language: "zh",
  workspaces: [{
    id: "w1", createdAt: Date.now(), customTitles: {},
    noteLines: [], workspaceLines: [], storageLines: [],
    spaces: [{ id: "s1", title: "便签", lines: [] }], activeSpaceId: "s1",
    images: [], quickTags: [], quickButtons: [],
    todoLists: [{ id: "morning", title: "☀️ 早上", collapsed: false, compact: false }],
    showCompletedTodos: { morning: true },
    todos: { morning: todos },
  }],
  activeWorkspaceId: "w1",
};

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));
await page.addInitScript((state) => {
  localStorage.clear();
  localStorage.setItem("mini-desk-state-v1", JSON.stringify(state));
}, state);
await page.goto("http://127.0.0.1:5199/");
await page.waitForSelector("li.todo-item", { timeout: 15000 });
console.log("初始顺序:", (await page.evaluate(() => [...document.querySelectorAll("li.todo-item")].map((li) => li.dataset.todoId))).join(","));

async function measure(label) {
  await page.evaluate(() => {
    window.__frames = []; window.__anim = false;
    window.__sampler = setInterval(() => {
      const snap = [...document.querySelectorAll("li.todo-item")].map((li) => ({
        id: li.dataset.todoId, cls: li.classList.contains("todo-move-move"), tr: getComputedStyle(li).transform,
      }));
      if (snap.some((r) => r.cls || (r.tr && r.tr !== "none"))) window.__anim = true;
      window.__frames.push(snap);
    }, 30);
  });
  const target = page.locator("input.todo-input").nth(TARGET);
  await target.click();
  await page.waitForTimeout(150);
  await page.keyboard.down("Control");
  await page.keyboard.press(label === "down" ? "ArrowDown" : "ArrowUp");
  await page.keyboard.up("Control");
  await page.waitForTimeout(700);
  const { anim } = await page.evaluate(() => { clearInterval(window.__sampler); return { anim: window.__anim }; });
  const perRow = {};
  for (const frame of await page.evaluate(() => window.__frames))
    for (const r of frame) {
      perRow[r.id] ??= { cls: false, tr: false };
      if (r.cls) perRow[r.id].cls = true;
      if (r.tr && r.tr !== "none") perRow[r.id].tr = true;
    }
  const order = await page.evaluate(() => [...document.querySelectorAll("li.todo-item")].map((li) => li.dataset.todoId));
  console.log(`\n[${label}] 顺序→ ${order.join(",")}`);
  console.log(`[${label}] 动画出现: ${anim}`);
  for (const [id, v] of Object.entries(perRow)) console.log(`  行 ${id}: move类=${v.cls} transform=${v.tr}`);
  return anim;
}

const down = await measure("down");
const up1 = await measure("up");
const up2 = await measure("up");
console.log(`\n结论: down=${down} up#1=${up1} up#2=${up2}`);
await browser.close();

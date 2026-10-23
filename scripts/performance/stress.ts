import { defaultState, STORAGE_KEY } from "../../src/state/defaults";
// Run on a dedicated localhost port: never seed an origin containing real data.
if (location.hostname !== "127.0.0.1" || location.port !== "5187") throw new Error("Use the isolated test origin http://127.0.0.1:5187");
const output = document.querySelector<HTMLPreElement>("#perf-results")!;
if (!localStorage.getItem(STORAGE_KEY)) {
  const state = defaultState();
  const workspace = state.workspaces[0]!;
  workspace.customTitles["board-title"] = "性能测试：600 提醒 / 600 快捷 / 60 图片";
  workspace.todoLists = Array.from({ length: 6 }, (_, i) => ({ id: `stress-${i}`, title: `测试列表 ${i + 1}`, collapsed: false, compact: true }));
  workspace.todos = Object.fromEntries(workspace.todoLists.map((list, i) => [list.id, Array.from({ length: 100 }, (_, j) => ({ id: `todo-${i}-${j}`, text: `任务 ${i + 1}-${j + 1}：展开、收起与拖动测试`, done: false }))]));
  workspace.quickTags = Array.from({ length: 6 }, (_, i) => ({ id: `tag-${i}`, title: `快捷组 ${i + 1}` }));
  workspace.quickButtons = Array.from({ length: 600 }, (_, i) => ({ id: `quick-${i}`, title: `快捷动作 ${i + 1}`, value: `测试内容 ${i}`, type: "text", tagId: `tag-${Math.floor(i / 100)}`, hidden: false }));
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 800;
  const ctx = canvas.getContext("2d")!;
  workspace.images = Array.from({ length: 60 }, (_, i) => {
    ctx.fillStyle = `hsl(${i * 13},60%,70%)`; ctx.fillRect(0, 0, 1200, 800);
    ctx.fillStyle = "#222"; ctx.font = "80px sans-serif"; ctx.fillText(`Image ${i + 1}`, 80, 400);
    return { id: `image-${i}`, src: canvas.toDataURL("image/jpeg", 0.8), createdAt: i + 1, displayWidth: 1200, displayHeight: 800 };
  });
  state.companionGifTheme = "none";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let rectReads = 0;
const slowRects: unknown[] = [];
const animationFrames: unknown[] = [];
if (PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) new PerformanceObserver(list => {
  for (const e of list.getEntries()) animationFrames.push(e.toJSON());
}).observe({ type: "long-animation-frame", buffered: true });
const originalRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () { rectReads++; const t = performance.now(); const result = originalRect.call(this);
  const ms = performance.now() - t; if (ms > 5) slowRects.push({ ms, stack: new Error().stack }); return result; };
const longTasks: { startTime: number; duration: number }[] = [];
if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) new PerformanceObserver(list => {
  for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
}).observe({ type: "longtask", buffered: true });
let sample = 0;
const history: unknown[] = [];
window.addEventListener("pointerdown", event => {
  slowRects.length = 0; animationFrames.length = 0;
  const id = ++sample, start = performance.now(), initialReads = rectReads;
  let last = start;
  const frames: number[] = [];
  const target = event.target as HTMLElement;
  const label = target.closest("button")?.getAttribute("aria-label") ?? target.className;
  const tick = (now: number) => {
    if (id !== sample) return;
    if (now >= last) frames.push(now - last); last = now;
    if (now - start < 1800) { requestAnimationFrame(tick); return; }
    const sorted = [...frames].sort((a, b) => a - b);
    const report = { slowRects: [...slowRects], animationFrames: [...animationFrames], action: label, frames: frames.length, maxFrameMs: +Math.max(...frames).toFixed(1), p95FrameMs: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1), framesOver34ms: frames.filter(ms => ms > 34).length, rectReads: rectReads - initialReads, longTasks: longTasks.filter(e => e.startTime >= start), domNodes: document.querySelectorAll("*").length };
    history.push(report);
    output.textContent = JSON.stringify(history, null, 2);
  };
  requestAnimationFrame(tick);
}, true);
await import("../../src/main");

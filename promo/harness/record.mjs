// Record all Mini Desk promo sessions: themed workspace tours + feature clips.
// Usage: node record.mjs [all|themes|features|<sessionName>]
import { mkdirSync, readFileSync } from "node:fs";
import { ensureDevServer, stopDevServer, BASE_URL } from "./server.mjs";
import {
  launchBrowser,
  newRecordingContext,
  finalizeVideo,
  settleBoard,
  importWorkspaceViaUi,
  moveTo,
  moveClick,
  beat,
  sleep,
  SHOT_DIR,
} from "./lib.mjs";

const SAMPLES = new URL("../../samples/", import.meta.url).pathname;

const THEMES = [
  { slug: "bucket", file: "人生清单.json", title: "人生清单", textButton: "行前清单模板", tag: "说走就走" },
  { slug: "study", file: "前端进阶学习.json", title: "前端进阶学习", textButton: "学习日报模板", tag: "刷题练习" },
  { slug: "work", file: "我的工作台.json", title: "我的工作台", textButton: "日报模板", tag: "高频入口" },
  { slug: "fitness", file: "themes/健身训练.json", title: "健身训练站", textButton: "训练打卡模板", tag: "训练资源" },
  { slug: "travel", file: "themes/旅行规划.json", title: "旅行手账", textButton: "每日游记模板", tag: "订票订房" },
  { slug: "creator", file: "themes/自媒体创作.json", title: "内容创作工坊", textButton: "发布文案模板", tag: "创作工具" },
  { slug: "finance", file: "themes/家庭理财.json", title: "家庭账本", textButton: "账单日提醒清单", tag: "银行与支付" },
];

let sharedBrowser;

async function withSession(name, fn) {
  const browser = sharedBrowser ?? (sharedBrowser = await launchBrowser());
  try {
    const { context, page } = await newRecordingContext(browser, name);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await settleBoard(page, 1600);
    await fn(page);
    mkdirSync(SHOT_DIR, { recursive: true });
    const videoPath = await finalizeVideo(context, page, name);
    console.log(`✔ ${name} → ${videoPath}`);
  } catch (error) {
    await sharedBrowser?.close().catch(() => {});
    sharedBrowser = undefined;
    throw error;
  }
}

/** Scripted tour shown after a themed workspace lands on the board. */
async function tourTheme(page, theme) {
  // Quick actions: collapse/expand a tag group, hover buttons, copy a template.
  await moveClick(page, `.quick-tag-heading:has-text("${theme.tag}")`);
  await beat(page, 700);
  await moveClick(page, `.quick-tag-heading:has-text("${theme.tag}")`);
  await beat(page, 500);
  await moveTo(page, `.quick-button:has-text("${theme.textButton}")`);
  await beat(page, 450);
  await moveClick(page, `.quick-button:has-text("${theme.textButton}")`);
  await beat(page, 1300); // copy bubble shows

  // Todos: complete the first open item of the first list.
  const firstList = page.locator('[data-testid^="todo-list-"]').first();
  const checkbox = firstList.locator(".todo-item:not(.is-done) .todo-checkbox").first();
  await moveTo(page, `.todo-item:not(.is-done) .todo-checkbox >> nth=0`);
  await beat(page, 350);
  await checkbox.click();
  await beat(page, 1100);

  // Sticky notes: flip through the space tabs.
  const tabs = page.locator(".space-tab");
  const tabCount = await tabs.count();
  for (const index of [1, 2, 0]) {
    if (index < tabCount) {
      await moveClick(page, `.space-tab >> nth=${index}`);
      await beat(page, 850);
    }
  }
}

async function recordTheme(theme) {
  await withSession(`theme-${theme.slug}`, async (page) => {
    await importWorkspaceViaUi(page, `${SAMPLES}${theme.file}`);
    await tourTheme(page, theme);
    await page.screenshot({ path: `${SHOT_DIR}/theme-${theme.slug}.png` });
    await beat(page, 500);
  });
}

async function recordFeatureImport() {
  await withSession("feature-import", async (page) => {
    await importWorkspaceViaUi(page, `${SAMPLES}我的工作台.json`, { slow: true });
    await beat(page, 1200);
    await page.screenshot({ path: `${SHOT_DIR}/feature-import.png` });
  });
}

async function recordFeatureSwitcher() {
  await withSession("feature-switcher", async (page) => {
    for (const file of ["themes/健身训练.json", "themes/旅行规划.json", "themes/自媒体创作.json"]) {
      await importWorkspaceViaUi(page, `${SAMPLES}${file}`);
      await beat(page, 500);
    }
    // Open the switcher, let the list breathe, then hop between workspaces.
    await moveClick(page, '[data-testid="workspace-trigger"]');
    await beat(page, 1400);
    await page.screenshot({ path: `${SHOT_DIR}/feature-switcher-open.png` });
    await moveClick(page, '.workspace-switcher-item:has-text("旅行手账")');
    await beat(page, 1400);
    await moveClick(page, '[data-testid="workspace-trigger"]');
    await beat(page, 900);
    await moveClick(page, '.workspace-switcher-item:has-text("健身训练站")');
    await beat(page, 1400);
    await page.screenshot({ path: `${SHOT_DIR}/feature-switcher.png` });
  });
}

async function recordFeatureThemeToggle() {
  await withSession("feature-theme", async (page) => {
    await importWorkspaceViaUi(page, `${SAMPLES}人生清单.json`);
    await beat(page, 600);
    await moveClick(page, '[data-testid="workbench-theme"]');
    await beat(page, 1600);
    await page.screenshot({ path: `${SHOT_DIR}/feature-theme-dark.png` });
    await moveClick(page, '[data-testid="workbench-theme"]');
    await beat(page, 900);
  });
}

async function recordFeatureImages() {
  await withSession("feature-images", async (page) => {
    await importWorkspaceViaUi(page, `${SAMPLES}themes/旅行规划.json`);
    await beat(page, 400);
    const payload = ["aurora.png", "snow-mountain.png"].map((name) => ({
      name,
      type: "image/png",
      base64: readFileSync(new URL(`../assets/drop/${name}`, import.meta.url)).toString("base64"),
    }));
    // Drag the two photos from the desktop straight into the 图床 column.
    await moveTo(page, ".image-panel");
    await beat(page, 400);
    await page.evaluate(async (files) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const res = await fetch(`data:${f.type};base64,${f.base64}`);
        dt.items.add(new File([await res.blob()], f.name, { type: f.type }));
      }
      const target = document.querySelector(".image-panel") ?? document.body;
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, payload);
    await beat(page, 2200);
    // Open the first photo in the preview overlay, then close it.
    await moveClick(page, ".image-panel img >> nth=0");
    await beat(page, 1800);
    await page.screenshot({ path: `${SHOT_DIR}/feature-images-preview.png` });
    await page.keyboard.press("Escape");
    await beat(page, 900);
    await page.screenshot({ path: `${SHOT_DIR}/feature-images.png` });
  });
}

async function recordFeatureNotes() {
  await withSession("feature-notes", async (page) => {
    await importWorkspaceViaUi(page, `${SAMPLES}themes/健身训练.json`);
    await beat(page, 500);
    // Click into the sticky note, go to line end, add an indented entry.
    const area = page.locator(".space-text-panel textarea").first();
    await moveClick(page, ".space-text-panel textarea >> nth=0");
    await beat(page, 500);
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab"); // indent — the signature editing gesture
    await area.type("周六加练：核心 20 分钟，别忘了拍照记录", { delay: 55 });
    await beat(page, 1600);
    await page.screenshot({ path: `${SHOT_DIR}/feature-notes.png` });
  });
}

const SESSIONS = {
  ...Object.fromEntries(THEMES.map((theme) => [`theme-${theme.slug}`, () => recordTheme(theme)])),
  "feature-import": recordFeatureImport,
  "feature-switcher": recordFeatureSwitcher,
  "feature-theme": recordFeatureThemeToggle,
  "feature-images": recordFeatureImages,
  "feature-notes": recordFeatureNotes,
};

const target = process.argv[2] ?? "all";
const names =
  target === "all"
    ? Object.keys(SESSIONS)
    : target === "themes"
      ? THEMES.map((t) => `theme-${t.slug}`)
      : target === "features"
        ? Object.keys(SESSIONS).filter((n) => n.startsWith("feature-"))
        : [target];

for (const name of names) {
  if (!SESSIONS[name]) {
    console.error(`unknown session: ${name}`);
    process.exit(1);
  }
}

await ensureDevServer();
try {
  for (const name of names) {
    console.log(`● recording ${name} …`);
    await SESSIONS[name]();
  }
} finally {
  await sharedBrowser?.close().catch(() => {});
  await stopDevServer();
}
console.log("done:", names.join(", "));

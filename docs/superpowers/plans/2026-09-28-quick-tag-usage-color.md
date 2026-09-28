# 快捷标签使用热度染色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除快捷动作标签的颜色配置，改为按点击频率自动染色——0 次纯白（浅色主题默认按钮底），100 次封顶达到最深蓝 `#3b82f6`，梯度由 `color-mix` 数学计算。

**Architecture:** `QuickTag.color` 退役、`QuickTag.clicks` 接棒；纯函数 `quickTagUsagePercent` 把计数折算成 0–100 的 mix 百分比，组件把它设为组级 CSS 变量 `--tag-usage`，CSS 单条 `color-mix` 公式染色（`var(--button)` 作基色自动适配明暗主题）。计数埋点在 `handleQuickButton` 单一入口，`persistNow()` 即时落盘。

**Tech Stack:** Vue 3 + TypeScript + vitest（@vue/test-utils）。测试命令：`npx vitest run <file>`，全量 `npm test`，类型与构建 `npm run build`（含 vue-tsc）。

**Spec:** `docs/superpowers/specs/2026-09-28-quick-tag-usage-color-design.md`

**约定（全程适用）：**
- 提交信息用仓库惯例的中文 conventional 格式，**不加** Co-Authored-By 署名（用户全局设置已关闭 attribution）。
- 已知测试噪音（CLAUDE.md）：`npm test` 末尾恒有 `Errors 1`（app-render.test.ts 的 IndexedDB stub 未处理拒绝）；「输码验证 unknown/revoked」偶发抖动。遇到这两者重跑一次即可，不是本次改动的问题。
- 行号以 2026-09-28 的 main（4c8b063 之后）为准，会随任务推进漂移；每步都附了唯一定位代码。

---

### Task 1: 状态层——clicks 字段与 usage 折算纯函数

**Files:**
- Modify: `src/types.ts`（`QuickTag` 接口，~行 16-30）
- Modify: `src/state/quickButtons.ts`（接口 + 新函数，~行 5-50、68-81）
- Test: `src/__tests__/quick-buttons.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/quick-buttons.test.ts` 的 import 块（第 8-17 行，从 `../state/quickButtons` import 处）加入三个新名字：

```ts
import {
  assignQuickTagColumn,
  buildVisibleQuickButtonGroups,
  computeQuickColumnCount,
  distributeQuickTagColumns,
  filterVisibleQuickButtonGroups,
  formatQuickCopiedPreview,
  groupQuickButtonsByColumn,
  hasOverloadedVisibleQuickButtonGroup,
  QUICK_BUTTON_OTHER_GROUP_ID,
  QUICK_TAG_USAGE_MAX_CLICKS,
  quickTagUsagePercent,
  recordQuickTagClick,
} from "../state/quickButtons";
```

（`getQuickTagColor` 仍被行 1201 引用，本任务先保留在 import 里。）

在「detects overloaded visible quick button groups…」用例（~行 265）之后追加：

```ts
  it("把标签点击数折算成 0–100 的染色百分比并在封顶值处钳制", () => {
    expect(QUICK_TAG_USAGE_MAX_CLICKS).toBe(100);
    expect(quickTagUsagePercent(undefined)).toBe(0);
    expect(quickTagUsagePercent(0)).toBe(0);
    expect(quickTagUsagePercent(1)).toBe(1);
    expect(quickTagUsagePercent(50)).toBe(50);
    expect(quickTagUsagePercent(100)).toBe(100);
    expect(quickTagUsagePercent(132)).toBe(100);
    expect(quickTagUsagePercent(-3)).toBe(0);
    expect(quickTagUsagePercent(2.5)).toBe(2);
    expect(quickTagUsagePercent("x" as unknown)).toBe(0);
  });

  it("记录标签点击：命中 +1 返回 true，未命中不动也不报错", () => {
    const tags = [{ id: "t1", title: "A" }, { id: "t2", title: "B", clicks: 41 }];
    expect(recordQuickTagClick(tags, "t1")).toBe(true);
    expect(tags[0]).toMatchObject({ clicks: 1 });
    expect(recordQuickTagClick(tags, "t2")).toBe(true);
    expect(tags[1]).toMatchObject({ clicks: 42 });
    expect(recordQuickTagClick(tags, undefined)).toBe(false);
    expect(recordQuickTagClick(tags, "missing")).toBe(false);
    expect(tags).toHaveLength(2);
  });

  it("组构建为每个真实标签组带 usagePercent，其他/空态组不带", () => {
    const groups = buildVisibleQuickButtonGroups(
      [
        { id: "b1", title: "B1", value: "v", type: "text", hidden: false, tagId: "t1" },
        { id: "b2", title: "B2", value: "v", type: "text", hidden: false },
      ],
      [
        { id: "t1", title: "常用", clicks: 40 },
        { id: "t2", title: "闲置" },
      ],
      false,
      "其他",
    );
    expect(groups[0]).toMatchObject({ id: "t1", usagePercent: 40 });
    expect(groups[1]).toMatchObject({ id: QUICK_BUTTON_OTHER_GROUP_ID });
    expect(groups[1]).not.toHaveProperty("usagePercent");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: FAIL——`QUICK_TAG_USAGE_MAX_CLICKS`/`quickTagUsagePercent`/`recordQuickTagClick` 不存在（import 报错）。

- [ ] **Step 3: 实现**

`src/types.ts` 的 `QuickTag` 接口——`color` 字段**暂留**（Task 5 才退役），在 `collapsed` 与 `column` 之间插入：

```ts
export interface QuickTag {
  id: string;
  title: string;
  collapsed?: boolean;
  /** One of QUICK_TAG_COLORS. Persisted so a tag keeps its color for its lifetime. */
  color?: string;
  /** 使用热度计数：组内快捷按钮每点一次 +1，驱动 0–100 染色（quickTagUsagePercent）。缺省 = 0。 */
  clicks?: number;
  // …column 注释与字段原样保留
}
```

`src/state/quickButtons.ts`：

(a) `QuickButtonGroup` 接口（~行 5-15）在 `color?: string;` 之后插入：

```ts
  /** 0–100 使用热度染色强度（quickTagUsagePercent 数学折算）；其他/空态组不带。 */
  usagePercent?: number;
```

(b) 在 `QUICK_TAG_DEFAULT_COLOR` 常量（~行 38）之后新增：

```ts
/** 点击数封顶：达到该次数即染到最深（100%）。 */
export const QUICK_TAG_USAGE_MAX_CLICKS = 100;

/** 把标签点击数折算成 0–100 的染色百分比；非法输入按 0 处理。 */
export function quickTagUsagePercent(clicks: unknown): number {
  if (typeof clicks !== "number" || !Number.isFinite(clicks)) return 0;
  return Math.max(0, Math.min(QUICK_TAG_USAGE_MAX_CLICKS, Math.floor(clicks)));
}

/** 命中则该标签 clicks +1 并返回 true；tagId 缺失/失效（「其他」组）不计。 */
export function recordQuickTagClick(tags: QuickTag[], tagId: string | undefined): boolean {
  if (!tagId) return false;
  const tag = tags.find((item) => item.id === tagId);
  if (!tag) return false;
  tag.clicks = (tag.clicks ?? 0) + 1;
  return true;
}
```

(c) `buildVisibleQuickButtonGroups` 的标签组返回对象（~行 68-81）追加一行字段（`color` 行暂留）：

```ts
    return [{
      id: tag.id,
      title: tag.title,
      buttons: groupButtons,
      reorderable: true,
      collapsed: Boolean(tag.collapsed),
      color: resolvedColor === QUICK_TAG_DEFAULT_COLOR ? undefined : resolvedColor,
      usagePercent: quickTagUsagePercent(tag.clicks),
      column: tag.column ?? 0,
    }];
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/state/quickButtons.ts src/__tests__/quick-buttons.test.ts
git commit -m "feat: 快捷标签使用计数的状态层——clicks 字段与 0–100 染色折算纯函数"
```

---

### Task 2: 点击埋点 + 归一化保留 clicks

**Files:**
- Modify: `src/App.vue`（`handleQuickButton` ~行 2198；import 行 60）
- Modify: `src/state/storage/normalize.ts`（`normalizeQuickTags` ~行 351-368）
- Test: `src/__tests__/app-render.test.ts`、`src/__tests__/state.test.ts`

- [ ] **Step 1: 写失败测试（app-render）**

在 `src/__tests__/app-render.test.ts` 的「preserves newlines when copying text quick buttons」用例（~行 4305-4326）之后追加：

```ts
  it("点击带标签的快捷按钮给标签使用计数 +1 并落盘，无标签按钮不计数", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quickTags: [{ id: "tag-1", title: "常用" }],
        quickButtons: [
          { id: "text-1", title: "片段", value: "复制内容", type: "text", tagId: "tag-1" },
          { id: "text-2", title: "无标签", value: "x", type: "text" },
        ],
      }),
    );
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const wrapper = mountApp();

    const buttons = wrapper.findAll(".quick-button");
    await buttons[0].trigger("click");
    await Promise.resolve();
    await buttons[1].trigger("click");
    await Promise.resolve();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.workspaces[0].quickTags).toHaveLength(1);
    expect(stored.workspaces[0].quickTags[0].clicks).toBe(1);
    wrapper.unmount();
  });
```

- [ ] **Step 2: 写失败测试（state 归一化）**

`src/__tests__/state.test.ts` 的「normalizes quick action tags and keeps invalid tag references untagged」用例（~行 719-740），把输入 `quickTags` 与断言改为（同时保留 import 里的 `getQuickTagColor`，Task 5 再删）：

```ts
    const state = normalizeImportedState({
      quickTags: [
        { id: "tag-a", title: "标签 A", collapsed: true },
        { id: "tag-b", title: "标签 B", clicks: 7 },
        { id: "tag-c", title: "标签 C", clicks: 132 },
        { id: "tag-d", title: "标签 D", clicks: -3 },
        { id: "tag-e", title: "标签 E", clicks: 2.5 },
        { id: "tag-f", title: "标签 F", clicks: "x" },
        { id: "tag-a", title: "重复" },
      ],
      quickButtons: [
        { id: "a", title: "A", value: "a", type: "text", tagId: "tag-a" },
        { id: "orphan", title: "孤儿", value: "x", type: "text", tagId: "missing" },
      ],
    });
    const ws = () => state.workspaces[0];

    expect(ws().quickTags).toEqual([
      { id: "tag-a", title: "标签 A", collapsed: true, color: getQuickTagColor(0), column: 0 },
      { id: "tag-b", title: "标签 B", color: getQuickTagColor(1), column: 0, clicks: 7 },
      { id: "tag-c", title: "标签 C", color: getQuickTagColor(2), column: 0, clicks: 132 },
      { id: "tag-d", title: "标签 D", color: getQuickTagColor(3), column: 0 },
      { id: "tag-e", title: "标签 E", color: getQuickTagColor(4), column: 0 },
      { id: "tag-f", title: "标签 F", color: getQuickTagColor(5), column: 0 },
    ]);
```

（用例其余断言——quickButtons 的 tagId 剥除、getSerializableState 透传——原样保留。）

- [ ] **Step 3: 跑两个测试确认失败**

Run: `npx vitest run src/__tests__/app-render.test.ts src/__tests__/state.test.ts`
Expected: FAIL——app-render 用例里 `clicks` 为 undefined；state 用例里 clicks 缺失/未按规则保留。

- [ ] **Step 4: 实现**

`src/App.vue`：

(a) import 行 60 加入 `recordQuickTagClick`：

```ts
import { QUICK_BUTTON_OTHER_GROUP_ID, QUICK_DENSITY_THRESHOLD, assignQuickTagColumn, distributeQuickTagColumns, formatQuickCopiedPreview, getQuickTagColor, recordQuickTagClick } from "./state/quickButtons";
```

（`getQuickTagColor` 本任务仍在 `resolveQuickTagId`/`saveQuickTag` 使用，暂留。）

(b) `handleQuickButton`（~行 2198）在 `if (!button) return;` 之后、四类型分支之前插入一行：

```ts
async function handleQuickButton(id: string, anchor?: HTMLElement): Promise<void> {
  const button = activeWorkspace.value.quickButtons.find((item) => item.id === id);
  if (!button) return;
  if (recordQuickTagClick(activeWorkspace.value.quickTags, button.tagId)) persistNow();
  if (button.type === "link") {
  // …以下原样不动
```

`src/state/storage/normalize.ts` 的 `normalizeQuickTags`（~行 351-368）——`color` 行本任务暂留，在 `column` 行后加 `clicks` 归一化并放进返回对象：

```ts
      const color = normalizeQuickTagColor(record.color, getQuickTagColor(index));
      // Numeric guard (not Boolean()): column 0 is valid and falsy.
      const column = typeof record.column === "number" && Number.isFinite(record.column) ? Math.max(0, Math.floor(record.column)) : 0;
      const clicks = typeof record.clicks === "number" && Number.isFinite(record.clicks) && record.clicks > 0 ? Math.floor(record.clicks) : undefined;
      return { id, title, color, column, ...(clicks ? { clicks } : {}), ...(record.collapsed === true ? { collapsed: true } : {}) };
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/__tests__/app-render.test.ts src/__tests__/state.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/App.vue src/state/storage/normalize.ts src/__tests__/app-render.test.ts src/__tests__/state.test.ts
git commit -m "feat: 点击快捷按钮计入标签使用次数并随归一化保留"
```

---

### Task 3: 组件——组染色变量、管理器次数徽标、移除色板

**Files:**
- Modify: `src/components/QuickButtons.vue`（import 行 11、emit 行 57、draft 类型行 75、`refreshTagDrafts` ~行 319、`saveTag`/`setTagColor` ~行 381-392、组节点模板 ~行 942-950、管理器弹窗 ~行 1245-1265）
- Modify: `src/state/i18n.ts`（zh ~行 668-670、en ~行 1050-1052）
- Test: `src/__tests__/quick-buttons.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/quick-buttons.test.ts`：

(a) 新增组染色绑定用例，放在「按使用次数…」相关状态层用例之后（Task 1 加的三条后面）：

```ts
  it("按使用次数给标签组挂 has-usage 类与 --tag-usage 变量", () => {
    const wrapper = mountQuickButtons({
      tags: [
        { id: "tag-hot", title: "常用", clicks: 40 },
        { id: "tag-cold", title: "闲置" },
      ],
      buttons: [
        { id: "a", title: "A", value: "a", type: "text", hidden: false, tagId: "tag-hot" },
        { id: "b", title: "B", value: "b", type: "text", hidden: false, tagId: "tag-cold" },
      ],
    });

    const hot = wrapper.get('[data-tag-id="tag-hot"]');
    expect(hot.classes()).toContain("has-usage");
    expect(hot.attributes("style")).toContain("--tag-usage: 40%");

    const cold = wrapper.get('[data-tag-id="tag-cold"]');
    expect(cold.classes()).not.toContain("has-usage");
    expect(cold.attributes("style")).toBeUndefined();

    wrapper.unmount();
  });
```

(b) 改造「opens tag management and emits add, edit, and delete tag actions」用例（~行 1182-1208）：

fixture 换成 `tags: [{ id: "tag-work", title: "工作", clicks: 7 }]`；在 `expect(wrapper.get(".quick-tag-manager").text()).toContain("标签管理");` 之后加：

```ts
    expect(wrapper.find(".quick-tag-color-picker").exists()).toBe(false);
    expect(wrapper.get(".quick-tag-clicks").text()).toBe("7 次");
```

行 1201 的 saveTag 断言改为：

```ts
    expect(wrapper.emitted("saveTag")?.[1]).toEqual([{ id: "tag-work", title: "工作台" }]);
```

(c) import 块删掉 `getQuickTagColor`（行 1201 不再引用后它就是死 import，vue-tsc 会报 unused）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: FAIL——新用例找不到 `has-usage`/`.quick-tag-clicks`；旧用例仍能找到色板。

- [ ] **Step 3: 实现**

`src/components/QuickButtons.vue`：

(a) import 行 11 去掉 `getQuickTagColor, normalizeQuickTagColor, QUICK_TAG_COLORS, QUICK_TAG_DEFAULT_COLOR`：

```ts
import { buildVisibleQuickButtonGroups, computeQuickColumnCount, filterVisibleQuickButtonGroups, groupQuickButtonsByColumn, hasOverloadedVisibleQuickButtonGroup, QUICK_BUTTON_EMPTY_GROUP_ID, QUICK_DENSITY_THRESHOLD } from "../state/quickButtons";
```

(b) emit 类型行 57 改为：

```ts
  saveTag: [payload: { id?: string; title: string }];
```

(c) 行 75 改为：

```ts
type QuickTagDraft = QuickTag & { titleDraft: string };
```

(d) `refreshTagDrafts`（~行 319-325）删掉 `colorDraft` 行：

```ts
function refreshTagDrafts(): void {
  tagDrafts.value = props.tags.map((tag) => ({
    ...tag,
    titleDraft: tag.title,
  }));
}
```

(e) `saveTag`/`setTagColor`（~行 381-392）合并简化，`setTagColor` 整个删除：

```ts
function saveTag(draft: QuickTagDraft): void {
  const title = draft.titleDraft.trim();
  if (!title) return;
  if (title === draft.title) return;
  emit("saveTag", { id: draft.id, title });
}
```

(f) 在 `getQuickTagTitle` 附近新增徽标格式化（沿用组件里 `props.language` 分支的既有惯例）：

```ts
/** 标签管理器使用次数徽标：zh「N 次」/ en「N clicks」；超过 100 照实显示（仅颜色封顶）。 */
function formatTagClicks(clicks: number | undefined): string {
  const count = clicks ?? 0;
  return props.language === "en" ? `${count} clicks` : `${count} 次`;
}
```

(g) 组节点模板（~行 942-950）把 color 绑定换成 usage：

```html
        <section
          v-for="group in bucket"
          :key="group.id"
          :class="['quick-tag-group', { 'has-usage': (group.usagePercent ?? 0) > 0 }]"
          :data-tag-id="group.id"
          :style="group.usagePercent ? { '--tag-usage': `${group.usagePercent}%` } : undefined"
          @dragover="handleTagDragOver($event, group.id)"
          @drop.stop.prevent="handleQuickGroupDrop($event, group.id)"
        >
```

(h) 管理器弹窗（~行 1245-1265）：整块 `.quick-tag-color-picker` div（含默认色钮与 `v-for` 色板钮）替换为：

```html
            <span
              class="quick-tag-clicks"
              :aria-label="uiText.quick.tagClicks"
              :title="uiText.quick.tagClicks"
            >{{ formatTagClicks(tag.clicks) }}</span>
```

`src/state/i18n.ts`：zh 块（~行 668-670）与 en 块（~行 1050-1052）各删 `tagColor`/`tagColorDefault` 两行、改为：

```ts
      tagManage: "标签管理",
      tagClicks: "使用次数",
```

```ts
      tagManage: "Manage tags",
      tagClicks: "Tag clicks",
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/QuickButtons.vue src/state/i18n.ts src/__tests__/quick-buttons.test.ts
git commit -m "feat: 标签组按使用次数染色，标签管理器以次数徽标取代色板"
```

---

### Task 4: CSS——color-mix 染色公式与徽标样式

**Files:**
- Modify: `src/styles.css`（`:root` ~行 34-35 后加变量；替换 ~行 5577-5606 的 `has-tag-color` 规则族；删 ~行 1557-1601 色板样式；新增徽标样式）
- Test: `src/__tests__/quick-buttons.test.ts`

- [ ] **Step 1: 写失败测试（source-contract，沿用本文件 readSource 惯例）**

在 Task 3 新增用例之后追加：

```ts
  it("使用热度染色用 color-mix 数学梯度且不留旧色板痕迹", () => {
    const styles = readSource("styles.css");

    expect(styles).toMatch(/--quick-usage-accent:\s*#3b82f6/);
    expect(styles).toMatch(
      /\.quick-tag-group\.has-usage button\.quick-button\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--quick-usage-accent\) var\(--tag-usage\), var\(--button\)\)/s,
    );
    expect(styles).toMatch(/\.quick-tag-clicks\s*\{/);
    expect(styles).not.toContain("has-tag-color");
    expect(styles).not.toContain("--tag-bg");
    expect(styles).not.toContain(".quick-tag-color-picker");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: FAIL——变量/公式/徽标样式缺失，旧选择器仍在。

- [ ] **Step 3: 实现**

`src/styles.css`：

(a) `:root` 里 `--button`/`--button-hover`（~行 34-35）之后加：

```css
  /* 快捷标签使用热度染色的最深色：0 次 = --button（浅色纯白），100 次 = 该蓝。
     同旧 QUICK_TAG_COLORS[0]；折算见 src/state/quickButtons.ts quickTagUsagePercent。 */
  --quick-usage-accent: #3b82f6;
```

(b) 把 ~行 5577-5606 的整段（注释 + `.has-tag-color` 四组规则）替换为：

```css
/* Usage-frequency tint: buttons in a tag group darken from the plain button
   color (--button: white in light, the dark base in dark) toward the accent
   blue as the tag accumulates clicks. --tag-usage is a 0–100% mix percentage
   computed in JS (quickTagUsagePercent) and set per group in QuickButtons.vue
   — one color-mix formula for both themes, no enumerated gradient. */
.quick-tag-group.has-usage .quick-button,
.quick-tag-group.has-usage button.quick-button {
  background: color-mix(in srgb, var(--quick-usage-accent) var(--tag-usage), var(--button));
}

/* Hover deepens the SAME hue (not the global primary tint), so the hovered
   button stays tonally consistent with its group. !important is needed to
   override the generic button-hover rule further down. */
.quick-tag-group.has-usage .quick-button:hover,
.quick-tag-group.has-usage .quick-button:focus-visible,
.quick-tag-group.has-usage button.quick-button:hover,
.quick-tag-group.has-usage button.quick-button:focus-visible {
  background: color-mix(in srgb, var(--quick-usage-accent) calc(min(var(--tag-usage) + 12%, 100%)), var(--button)) !important;
}
```

(c) 删除 ~行 1557-1601 的 `.quick-tag-color-picker`/`.quick-tag-color-swatch` 整块（含注释），原位放徽标样式：

```css
/* 标签管理器行内的使用次数徽标（取代原色板）：纯展示，右对齐对齐删除钮。 */
.quick-tag-clicks {
  flex-shrink: 0;
  min-width: 52px;
  text-align: right;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/styles.css src/__tests__/quick-buttons.test.ts
git commit -m "feat: 使用热度染色的 color-mix 公式与次数徽标样式"
```

---

### Task 5: 颜色体系退役与迁移收尾

**Files:**
- Modify: `src/types.ts`（删 `QuickTag.color`）
- Modify: `src/state/quickButtons.ts`（删 `QUICK_TAG_COLORS`/`QUICK_TAG_DEFAULT_COLOR`/`getQuickTagColor`/`normalizeQuickTagColor`、`QuickButtonGroup.color`、组构建 color 行）
- Modify: `src/state/storage/normalize.ts`（剥 color、清理 import）
- Modify: `src/App.vue`（`resolveQuickTagId` ~行 2024、`saveQuickTag` ~行 2029-2051、import 行 60）
- Modify: `src/state/workspaceMoves.ts`（重建标签去 color ~行 59-61）
- Test: `src/__tests__/state.test.ts`、`src/__tests__/workspaceMoves.test.ts`

- [ ] **Step 1: 写失败测试**

(a) `src/__tests__/state.test.ts`：删掉 import 里的 `getQuickTagColor`（行 25）；「normalizes quick action tags…」用例的期望改为（color 全部消失）：

```ts
    expect(ws().quickTags).toEqual([
      { id: "tag-a", title: "标签 A", collapsed: true, column: 0 },
      { id: "tag-b", title: "标签 B", column: 0, clicks: 7 },
      { id: "tag-c", title: "标签 C", column: 0, clicks: 132 },
      { id: "tag-d", title: "标签 D", column: 0 },
      { id: "tag-e", title: "标签 E", column: 0 },
      { id: "tag-f", title: "标签 F", column: 0 },
    ]);
```

输入的 `quickTags` 里再给 `tag-a` 加一个存量颜色字段 `{ id: "tag-a", title: "标签 A", collapsed: true, color: "#22c55e" }`，验证导入即剥除。

(b) `src/__tests__/workspaceMoves.test.ts`（~行 17-29）：fixture 与断言改为——

```ts
  const tag = { id: "tag-1", title: "常用", clicks: 5 };
```

```ts
  it("移动按钮并在目标重建同名标签，计数不随按钮迁移", () => {
    const next = moveQuickButtonToWorkspace([source, target], "ws-a", "btn-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.quickButtons).toHaveLength(0);
    expect(to.quickButtons).toHaveLength(1);
    expect(to.quickTags).toHaveLength(1);
    expect(to.quickTags[0]).toMatchObject({ title: "常用" });
    expect(to.quickTags[0].clicks).toBeUndefined();
    expect(to.quickButtons[0].tagId).toBe(to.quickTags[0].id);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/state.test.ts src/__tests__/workspaceMoves.test.ts`
Expected: FAIL——归一化仍在补 color、重建标签仍复制 color（且 TS 侧 `color` 字段已不该再出现）。

- [ ] **Step 3: 实现**

(a) `src/types.ts`：删除 `QuickTag.color` 字段及其注释（Task 1 加的 `clicks` 保留）。

(b) `src/state/quickButtons.ts`：
- 删除 `QUICK_TAG_COLORS`、`QUICK_TAG_DEFAULT_COLOR`、`getQuickTagColor`、`normalizeQuickTagColor`（~行 21-49）。
- `QuickButtonGroup` 删 `color?: string;` 及其注释（`usagePercent` 接棒）。
- `buildVisibleQuickButtonGroups`（~行 68-81）删 color 解析，签名收窄：

```ts
  const groups = tags.flatMap((tag): QuickButtonGroup[] => {
    const groupButtons = taggedButtons.get(tag.id) ?? [];
    if (groupButtons.length === 0) return [];
    return [{
      id: tag.id,
      title: tag.title,
      buttons: groupButtons,
      reorderable: true,
      collapsed: Boolean(tag.collapsed),
      usagePercent: quickTagUsagePercent(tag.clicks),
      column: tag.column ?? 0,
    }];
  });
```

(c) `src/state/storage/normalize.ts`：
- 删 import 行 `import { getQuickTagColor, normalizeQuickTagColor } from "../quickButtons";`
- `normalizeQuickTags`（~行 351-368）去掉 color 与 index 依赖：

```ts
export function normalizeQuickTags(tags: unknown): QuickTag[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  return tags
    .map((item): QuickTag | null => {
      if (!isPlainObject(item)) return null;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!id || !title || seen.has(id)) return null;
      seen.add(id);
      // Numeric guard (not Boolean()): column 0 is valid and falsy.
      const column = typeof record.column === "number" && Number.isFinite(record.column) ? Math.max(0, Math.floor(record.column)) : 0;
      // 存量 color 就此退役：导入即静默剥除，染色改由 clicks 使用热度驱动。
      const clicks = typeof record.clicks === "number" && Number.isFinite(record.clicks) && record.clicks > 0 ? Math.floor(record.clicks) : undefined;
      return { id, title, column, ...(clicks ? { clicks } : {}), ...(record.collapsed === true ? { collapsed: true } : {}) };
    })
    .filter((item): item is QuickTag => item !== null);
}
```

(d) `src/App.vue`：
- import 行 60 删 `getQuickTagColor`：

```ts
import { QUICK_BUTTON_OTHER_GROUP_ID, QUICK_DENSITY_THRESHOLD, assignQuickTagColumn, distributeQuickTagColumns, formatQuickCopiedPreview, recordQuickTagClick } from "./state/quickButtons";
```

- `resolveQuickTagId`（~行 2024）：

```ts
  const tag = { id: createId(), title };
```

- `saveQuickTag`（~行 2029-2051）——签名与两处 color 全删：

```ts
function saveQuickTag(payload: { id?: string; title: string }): void {
  const title = payload.title.trim();
  if (!title) return;
  if (!payload.id) {
    if (activeWorkspace.value.quickTags.some((tag) => tag.title === title)) return;
    activeWorkspace.value.quickTags.push({ id: createId(), title });
    persistNow();
    return;
  }

  const current = activeWorkspace.value.quickTags.find((tag) => tag.id === payload.id);
  if (!current) return;
  const duplicate = activeWorkspace.value.quickTags.find((tag) => tag.id !== payload.id && tag.title === title);
  if (duplicate) {
    moveQuickButtonsToTag(payload.id, duplicate.id);
    activeWorkspace.value.quickTags = activeWorkspace.value.quickTags.filter((tag) => tag.id !== payload.id);
  } else {
    current.title = title;
  }
  persistNow();
}
```

(e) `src/state/workspaceMoves.ts`（~行 58-64）重建标签去 color：

```ts
      } else {
        const created: QuickTag = { id: createId(), title: sourceTag.title };
        quickTags = [...to.quickTags, created];
        tagId = created.id;
      }
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run src/__tests__/state.test.ts src/__tests__/workspaceMoves.test.ts`
Expected: PASS。

Run: `npm test`
Expected: 全部 PASS（末尾 `Errors 1` 为已知噪音）。

Run: `npm run build`
Expected: vue-tsc 与 vite 构建通过（模板里 color 引用已在前序任务清零）。

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/state/quickButtons.ts src/state/storage/normalize.ts src/App.vue src/state/workspaceMoves.ts src/__tests__/state.test.ts src/__tests__/workspaceMoves.test.ts
git commit -m "refactor: 退役快捷标签调色板体系，存量 color 导入即剥除"
```

---

### Task 6: 残留扫描与手动冒烟

**Files:** 无新改动（验证任务；发现问题就地修复并追加提交）。

- [ ] **Step 1: 残留扫描**

Run: `grep -rn "QUICK_TAG_COLORS\|getQuickTagColor\|normalizeQuickTagColor\|QUICK_TAG_DEFAULT_COLOR\|has-tag-color\|--tag-bg\|colorDraft\|tagColorDefault\|quick-tag-color" src/`
Expected: 无输出（`tagClicks` 是新键，不在扫描列）。

- [ ] **Step 2: 手动冒烟（npm run dev）**

1. 标签管理器：无色板，每行有「N 次」徽标；改名/删除/新增正常。
2. 点一个标签组内按钮数次 → 组内按钮底色向蓝渐进加深；0 次的组保持默认底色。
3. 切深色主题：起点为深色按钮底、同样向蓝加深，文字可读。
4. 刷新页面：计数与颜色保持（localStorage 持久化）。
5. 悬停有 usage 的按钮：同色相加深，无跳变。

- [ ] **Step 3: 收尾**

若扫描/冒烟全净，无需额外提交；发现残留则修复后以 `fix:` 提交。更新日志不手改——`/release-mini-desk` 发版流程会在版本提交时按 diff 追加 changelog 条目。

---

## Self-Review 记录

- **Spec 覆盖**：计数口径（Task 2 埋点）、深色主题公式（Task 4 单公式）、管理器徽标（Task 3）、数学梯度（Task 4 color-mix）、迁移剥 color（Task 5）、其他组不染（Task 1 组构建 + Task 3 样式绑定）——逐条有对应任务。
- **两处对 spec 的小偏离（已回写 spec）**：最深色常量落在 CSS 变量 `--quick-usage-accent`（JS 不需要重复常量）；changelog 由 release 流程追加，本计划不手改。
- **类型一致性**：`usagePercent`（QuickButtonGroup）/`clicks`（QuickTag）/`recordQuickTagClick`/`quickTagUsagePercent`/`QUICK_TAG_USAGE_MAX_CLICKS`/`--tag-usage`/`has-usage`/`.quick-tag-clicks` 全计划统一命名。
- **每步可编译**：Task 1-4 期间 `color` 链路完整保留，Task 5 一次性退役，无中间态编译断裂。

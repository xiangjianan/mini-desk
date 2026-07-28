# 全局快捷搜索 · Phase 1（基础 + 快捷动作）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 顶栏新增全局搜索框，过滤并高亮"快捷动作"面板的按钮（含等宽网格 + 标签标题强化 + 数量徽章），为后续提醒事项/备忘录集成打好共享基础。

**Architecture:** 模块级响应式 `globalSearchQuery`（不持久化）作为单一数据源；纯函数 `searchHighlight.ts` 做匹配/切分；共用 `HighlightText.vue` 渲染 `<mark>` 高亮；头栏写入、`QuickButtons` 读取，零 prop 透传。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Naive UI + Vitest（`@vue/test-utils`）。运行测试：`npm test`（= `vitest run`）。

**参考 spec：** `docs/superpowers/specs/2026-07-28-global-quick-search-design.md`

**约定：** 提交信息用 `<type>: <desc>`，不加 Co-Authored-By（全局已关闭署名）。每个 Task 末尾提交一次。

---

## 文件结构（Phase 1）

- 新增 `src/utils/searchHighlight.ts` — 纯函数：`normalizeSearchQuery` / `matchesSearch` / `splitHighlightSegments`
- 新增 `src/state/globalSearch.ts` — 模块级响应式 query + normalized + active 标志 + set/clear/reset
- 新增 `src/components/HighlightText.vue` — 共用高亮文本组件
- 改 `src/state/quickButtons.ts` — 新增 `filterVisibleQuickButtonGroups`
- 改 `src/components/QuickButtons.vue` — 标题强化/数量徽章/网格/截断/高亮/过滤
- 改 `src/styles.css` — 上述视觉相关样式 + `<mark>` 高亮样式 + 搜索框样式
- 改 `src/components/WorkbenchShell.vue` — 新增 `#search` 插槽
- 改 `src/App.vue` — 往 `#search` 填 `NInput`；i18n 占位符
- 改 `src/state/i18n.ts` — `app.searchPlaceholder`（zh + en）
- 测试：新增 `src/__tests__/search-highlight.test.ts`、`src/__tests__/global-search.test.ts`、`src/__tests__/highlight-text.test.ts`；扩展 `src/__tests__/quick-buttons.test.ts`、`src/__tests__/workbench-shell.test.ts`

---

### Task 1: 搜索匹配与高亮切分纯函数

**Files:**
- Test: `src/__tests__/search-highlight.test.ts`
- Create: `src/utils/searchHighlight.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/search-highlight.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearchQuery, splitHighlightSegments } from "../utils/searchHighlight";

describe("searchHighlight", () => {
  it("normalizes by trimming and lowercasing", () => {
    expect(normalizeSearchQuery("  Foo  ")).toBe("foo");
    expect(normalizeSearchQuery("GitHub")).toBe("github");
  });

  it("matches substring case-insensitively, false on empty query", () => {
    expect(matchesSearch("Deploy prod", "prod")).toBe(true);
    expect(matchesSearch("Deploy prod", "PROD")).toBe(true);
    expect(matchesSearch("Deploy prod", "")).toBe(false);
    expect(matchesSearch("Deploy prod", "xyz")).toBe(false);
  });

  it("splits into alternating non-match/match segments", () => {
    expect(splitHighlightSegments("GitHub", "gi")).toEqual([
      { text: "Gi", match: true },
      { text: "tHub", match: false },
    ]);
  });

  it("returns one non-match segment when query is empty", () => {
    expect(splitHighlightSegments("GitHub", "")).toEqual([{ text: "GitHub", match: false }]);
  });

  it("returns one non-match segment when nothing matches", () => {
    expect(splitHighlightSegments("GitHub", "zzz")).toEqual([{ text: "GitHub", match: false }]);
  });

  it("handles multiple matches", () => {
    expect(splitHighlightSegments("aa-bb-aa", "aa")).toEqual([
      { text: "aa", match: true },
      { text: "-bb-", match: false },
      { text: "aa", match: true },
    ]);
  });

  it("escapes regex-special characters in the query", () => {
    expect(splitHighlightSegments("a.b(c)d", "(")).toEqual([
      { text: "a.b", match: false },
      { text: "(", match: true },
      { text: ")d", match: false },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/search-highlight.test.ts`
Expected: FAIL（`Cannot find module ... searchHighlight`）

- [ ] **Step 3: 写最小实现**

创建 `src/utils/searchHighlight.ts`：

```ts
export interface HighlightSegment {
  text: string;
  match: boolean;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesSearch(text: string, normalized: string): boolean {
  if (!normalized) return false;
  return text.toLowerCase().includes(normalized);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitHighlightSegments(text: string, normalized: string): HighlightSegment[] {
  if (!normalized) return [{ text, match: false }];
  const pattern = new RegExp(`(${escapeRegExp(normalized)})`, "gi");
  const parts = text.split(pattern);
  const segments: HighlightSegment[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === "") continue;
    segments.push({ text: part, match: index % 2 === 1 });
  }
  return segments.length ? segments : [{ text, match: false }];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/search-highlight.test.ts`
Expected: PASS（7 passed）

- [ ] **Step 5: 提交**

```bash
git add src/utils/searchHighlight.ts src/__tests__/search-highlight.test.ts
git commit -m "feat: add search match/highlight pure helpers"
```

---

### Task 2: 全局搜索状态（模块级，不持久化）

**Files:**
- Test: `src/__tests__/global-search.test.ts`
- Create: `src/state/globalSearch.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/global-search.test.ts`：

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  clearGlobalSearch,
  globalSearchNormalized,
  globalSearchQuery,
  isGlobalSearchActive,
  resetGlobalSearch,
  setGlobalSearch,
} from "../state/globalSearch";

afterEach(() => {
  resetGlobalSearch();
});

describe("globalSearch", () => {
  it("starts empty and inactive", () => {
    expect(globalSearchQuery.value).toBe("");
    expect(globalSearchNormalized.value).toBe("");
    expect(isGlobalSearchActive.value).toBe(false);
  });

  it("setGlobalSearch updates query, normalized, and active flag", () => {
    setGlobalSearch("  Foo  ");
    expect(globalSearchQuery.value).toBe("  Foo  ");
    expect(globalSearchNormalized.value).toBe("foo");
    expect(isGlobalSearchActive.value).toBe(true);
  });

  it("clearGlobalSearch resets to empty/inactive", () => {
    setGlobalSearch("foo");
    clearGlobalSearch();
    expect(globalSearchQuery.value).toBe("");
    expect(isGlobalSearchActive.value).toBe(false);
  });

  it("whitespace-only query is inactive", () => {
    setGlobalSearch("   ");
    expect(isGlobalSearchActive.value).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/global-search.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

创建 `src/state/globalSearch.ts`：

```ts
import { computed, ref } from "vue";
import { normalizeSearchQuery } from "../utils/searchHighlight";

export const globalSearchQuery = ref("");
export const globalSearchNormalized = computed(() => normalizeSearchQuery(globalSearchQuery.value));
export const isGlobalSearchActive = computed(() => globalSearchNormalized.value.length > 0);

export function setGlobalSearch(value: string): void {
  globalSearchQuery.value = value;
}

export function clearGlobalSearch(): void {
  globalSearchQuery.value = "";
}

/** Test-only: clear module state for isolation between tests. */
export function resetGlobalSearch(): void {
  globalSearchQuery.value = "";
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/global-search.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```bash
git add src/state/globalSearch.ts src/__tests__/global-search.test.ts
git commit -m "feat: add global search reactive state"
```

---

### Task 3: 共用高亮文本组件 HighlightText

**Files:**
- Test: `src/__tests__/highlight-text.test.ts`
- Create: `src/components/HighlightText.vue`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/highlight-text.test.ts`：

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import HighlightText from "../components/HighlightText.vue";

describe("HighlightText", () => {
  it("renders plain text with no mark when query is empty", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "" } });
    expect(wrapper.text()).toBe("GitHub");
    expect(wrapper.find("mark").exists()).toBe(false);
  });

  it("wraps the matched substring in mark, case-insensitive", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "GI" } });
    expect(wrapper.find("mark").text()).toBe("Gi");
    expect(wrapper.text()).toBe("GitHub");
  });

  it("renders no mark when the query does not match", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "zzz" } });
    expect(wrapper.find("mark").exists()).toBe(false);
    expect(wrapper.text()).toBe("GitHub");
  });

  it("renders the root span with the highlight-text class", () => {
    const wrapper = mount(HighlightText, { props: { text: "GitHub", query: "" } });
    expect(wrapper.classes()).toContain("highlight-text");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/highlight-text.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 写最小实现**

创建 `src/components/HighlightText.vue`：

```vue
<script setup lang="ts">
import { computed } from "vue";
import { splitHighlightSegments } from "../utils/searchHighlight";

const props = defineProps<{ text: string; query: string }>();

const normalized = computed(() => props.query.trim().toLowerCase());
const segments = computed(() => splitHighlightSegments(props.text, normalized.value));
</script>

<template>
  <span class="highlight-text">
    <template v-for="(segment, index) in segments" :key="index">
      <mark v-if="segment.match">{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/highlight-text.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```bash
git add src/components/HighlightText.vue src/__tests__/highlight-text.test.ts
git commit -m "feat: add HighlightText component"
```

---

### Task 4: 快捷按钮分组过滤纯函数 filterVisibleQuickButtonGroups

**Files:**
- Test: `src/__tests__/quick-buttons.test.ts`（扩展）
- Modify: `src/state/quickButtons.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/quick-buttons.test.ts` 顶部导入处追加 `filterVisibleQuickButtonGroups`：

```ts
import {
  buildVisibleQuickButtonGroups,
  filterVisibleQuickButtonGroups,
  formatQuickCopiedPreview,
  hasOverloadedVisibleQuickButtonGroup,
} from "../state/quickButtons";
```

在 `describe("QuickButtons", () => { ... })` 块**之外**追加新 describe：

```ts
describe("filterVisibleQuickButtonGroups", () => {
  const groups = [
    { id: "tag-a", title: "工作", buttons: [
      { id: "a1", title: "GitHub", value: "https://github.com", type: "link" as const, hidden: false },
      { id: "a2", title: "部署", value: "deploy-prod", type: "text" as const, hidden: false },
    ], reorderable: true, collapsed: false },
    { id: "tag-b", title: "生活", buttons: [
      { id: "b1", title: "外卖", value: "waimai", type: "text" as const, hidden: false },
    ], reorderable: true, collapsed: true },
  ];

  it("returns groups unchanged when normalized query is empty", () => {
    expect(filterVisibleQuickButtonGroups(groups, "")).toEqual(groups);
  });

  it("keeps a whole group (force-expanded) when the tag title matches", () => {
    const result = filterVisibleQuickButtonGroups(groups, "工");
    expect(result.map((g) => g.id)).toEqual(["tag-a"]);
    expect(result[0].buttons.map((b) => b.id)).toEqual(["a1", "a2"]);
    expect(result[0].collapsed).toBe(false);
  });

  it("keeps only matching buttons and force-expands when a button matches by title", () => {
    const result = filterVisibleQuickButtonGroups(groups, "git");
    expect(result.map((g) => g.id)).toEqual(["tag-a"]);
    expect(result[0].buttons.map((b) => b.id)).toEqual(["a1"]);
    expect(result[0].collapsed).toBe(false);
  });

  it("matches by value when title does not match", () => {
    const result = filterVisibleQuickButtonGroups(groups, "deploy");
    expect(result[0].buttons.map((b) => b.id)).toEqual(["a2"]);
  });

  it("drops groups with no matches", () => {
    const result = filterVisibleQuickButtonGroups(groups, "zzz");
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/quick-buttons.test.ts`
Expected: FAIL（`filterVisibleQuickButtonGroups` 未导出）

- [ ] **Step 3: 写最小实现**

在 `src/state/quickButtons.ts` 顶部导入处追加：

```ts
import { matchesSearch } from "../utils/searchHighlight";
```

在文件末尾追加：

```ts
export function filterVisibleQuickButtonGroups(
  groups: QuickButtonGroup[],
  normalized: string,
): QuickButtonGroup[] {
  if (!normalized) return groups;
  return groups
    .map((group): QuickButtonGroup | null => {
      if (matchesSearch(group.title, normalized)) {
        return group.collapsed ? { ...group, collapsed: false } : group;
      }
      const matchedButtons = group.buttons.filter(
        (button) => matchesSearch(button.title, normalized) || matchesSearch(button.value, normalized),
      );
      if (matchedButtons.length === 0) return null;
      return { ...group, buttons: matchedButtons, collapsed: false };
    })
    .filter((group): group is QuickButtonGroup => group !== null);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/quick-buttons.test.ts`
Expected: PASS（含新增 5 条）

- [ ] **Step 5: 提交**

```bash
git add src/state/quickButtons.ts src/__tests__/quick-buttons.test.ts
git commit -m "feat: add quick button group filtering by search query"
```

---

### Task 5: QuickButtons 视觉改造（标题强化 + 数量徽章 + 等宽网格 + 截断 + 高亮）

> 本任务只改"视觉与结构"，不过滤（过滤在 Task 6）。`HighlightText` 此时就接入 `globalSearchQuery`（空查询时退化为纯文本，无副作用）。

**Files:**
- Modify: `src/components/QuickButtons.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/quick-buttons.test.ts`（扩展）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/quick-buttons.test.ts` 的 `describe("QuickButtons", ...)` 块内追加（沿用现有 `mountQuickButtons` 辅助；如未导入 `resetGlobalSearch`，在顶部加 `import { resetGlobalSearch } from "../state/globalSearch";` 并在该 describe 顶部加 `afterEach(() => resetGlobalSearch());`）：

```ts
it("renders a count badge per tag group and a title tooltip per button", async () => {
  const wrapper = mountQuickButtons({
    tags: [{ id: "tag-a", title: "工作" }],
    buttons: [
      { id: "a1", title: "GitHub", value: "https://github.com", type: "link", hidden: false, tagId: "tag-a" },
      { id: "a2", title: "部署", value: "deploy", type: "text", hidden: false, tagId: "tag-a" },
    ],
  });
  await wrapper.vm.$nextTick();
  const counts = wrapper.findAll(".quick-tag-count");
  expect(counts.length).toBe(1);
  expect(counts[0].text()).toBe("2");
  const buttons = wrapper.findAll(".quick-button");
  expect(buttons[0].attributes("title")).toBe("GitHub");
  expect(buttons[0].find(".quick-button-label").exists()).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/quick-buttons.test.ts -t "count badge"`
Expected: FAIL（找不到 `.quick-tag-count` / `.quick-button-label`）

- [ ] **Step 3: 改 QuickButtons.vue 模板与脚本**

在 `src/components/QuickButtons.vue` `<script setup>` 顶部导入区做三处改动：

1. 把已有的 quickButtons 导入行（约第 10 行）：
```ts
import { buildVisibleQuickButtonGroups, hasOverloadedVisibleQuickButtonGroup, QUICK_BUTTON_EMPTY_GROUP_ID, QUICK_DENSITY_THRESHOLD } from "../state/quickButtons";
```
   替换为（追加 `filterVisibleQuickButtonGroups`）：
```ts
import { buildVisibleQuickButtonGroups, filterVisibleQuickButtonGroups, hasOverloadedVisibleQuickButtonGroup, QUICK_BUTTON_EMPTY_GROUP_ID, QUICK_DENSITY_THRESHOLD } from "../state/quickButtons";
```

2. 新增一行全局搜索导入（模板里 `HighlightText` 用 `globalSearchQuery`，computed 里用 `globalSearchNormalized`）：
```ts
import { globalSearchNormalized, globalSearchQuery } from "../state/globalSearch";
```

3. 新增组件导入（放在已有 `import EditableTitle from "./EditableTitle.vue";` 附近）：
```ts
import HighlightText from "./HighlightText.vue";
```

然后把分组 computed（约 113 行）：
```ts
const groupedButtons = computed(() =>
  buildVisibleQuickButtonGroups(props.buttons, props.tags, props.showHidden, uiText.value.quick.otherTag, props.otherCollapsed),
);
```
替换为：
```ts
const groupedButtons = computed(() => {
  const base = buildVisibleQuickButtonGroups(props.buttons, props.tags, props.showHidden, uiText.value.quick.otherTag, props.otherCollapsed);
  return filterVisibleQuickButtonGroups(base, globalSearchNormalized.value);
});
```

在标签标题模板里（`<span v-else class="quick-tag-title">{{ group.title }}</span>` 那一行之后）追加数量徽章：

```html
            <span v-if="editingTagId !== group.id" class="quick-tag-count">{{ group.buttons.length }}</span>
```

把按钮内标题 `<span>{{ button.title }}</span>` 替换为带 `HighlightText` 的标签，并给 `<button>` 加 `:title`：

```html
              <button
                v-for="button in group.buttons"
                :key="button.id"
                class="quick-button"
                :class="{ 'is-hidden': button.hidden, 'is-copy': button.type === 'text', 'is-api': button.type === 'api', 'is-dragging': draggingId === button.id }"
                :data-id="button.id"
                :title="button.title"
                type="button"
                draggable="true"
                @click="emit('copy', button.id, $event.currentTarget as HTMLElement)"
                @contextmenu.stop="openMenu($event, button.id)"
                @dragstart="draggingId = button.id"
                @dragover.prevent
                @drop.stop.prevent="handleQuickButtonDrop(button.id, group.id)"
                @dragend="draggingId = null"
              >
                <NIcon v-if="button.type === 'text'" class="quick-button-icon" :component="CopyOutline" />
                <NIcon v-else-if="button.type === 'api'" class="quick-button-icon" :component="CloudUploadOutline" />
                <HighlightText class="quick-button-label" :text="button.title" :query="globalSearchQuery" />
              </button>
```

- [ ] **Step 4: 改 styles.css**

在 `src/styles.css` 中：

把 `.quick-tag-heading` 规则（约 1783 行）整体替换为：

```css
.quick-tag-heading {
  display: flex;
  align-items: center;
  min-height: 24px;
  padding: 0 12px;
  color: var(--text);
  font-size: var(--app-font-size);
  font-weight: 600;
  line-height: 1.4;
  cursor: grab;
  user-select: none;
}
```

把 `.quick-tag-title` 规则替换为（增加 flex 收缩）：

```css
.quick-tag-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

紧接其后新增数量徽章与高亮样式：

```css
.quick-tag-count {
  flex: 0 0 auto;
  margin-left: 8px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--muted-surface);
  color: var(--muted);
  font-size: calc(var(--app-font-size) - 2px);
  font-weight: 500;
  line-height: 1.6;
}
```

把 `.quick-tag-content > .quick-buttons` 规则（约 1775 行）替换为网格：

```css
.quick-tag-content > .quick-buttons {
  flex: 0 0 auto;
  min-height: 0;
  padding-top: 4px;
  padding-bottom: 6px;
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}
```

在 `.quick-button` 规则之后新增按钮文字截断与高亮样式：

```css
.quick-button-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlight-text mark {
  background: color-mix(in srgb, var(--line-focus) 32%, transparent);
  color: inherit;
  border-radius: 2px;
}
```

- [ ] **Step 5: 运行测试确认通过（含既有用例不回归）**

Run: `npm test -- src/__tests__/quick-buttons.test.ts`
Expected: PASS（新用例 + 既有全部通过）

- [ ] **Step 6: 提交**

```bash
git add src/components/QuickButtons.vue src/styles.css src/__tests__/quick-buttons.test.ts
git commit -m "feat: stronger quick tag headings, count badge, equal-width grid, highlight"
```

---

### Task 6: QuickButtons 接入全局搜索过滤

> Task 5 已把 `groupedButtons` 改为经过 `filterVisibleQuickButtonGroups` + `globalSearchNormalized`，因此过滤逻辑已就绪。本任务补"搜索时只渲染命中"的组件级测试与收尾。

**Files:**
- Test: `src/__tests__/quick-buttons.test.ts`（扩展）
- 已改：`src/components/QuickButtons.vue`

- [ ] **Step 1: 写失败测试**

在 `describe("QuickButtons", ...)` 块内追加（顶部确保已导入 `setGlobalSearch, resetGlobalSearch` from `../state/globalSearch` 且有 `afterEach(() => resetGlobalSearch())`）：

```ts
it("filters buttons globally and force-expands matching groups while a query is active", async () => {
  setGlobalSearch("git");
  const wrapper = mountQuickButtons({
    tags: [{ id: "tag-a", title: "工作" }],
    buttons: [
      { id: "a1", title: "GitHub", value: "https://github.com", type: "link", hidden: false, tagId: "tag-a" },
      { id: "a2", title: "部署", value: "deploy", type: "text", hidden: false, tagId: "tag-a" },
    ],
  });
  await wrapper.vm.$nextTick();
  const buttons = wrapper.findAll(".quick-button");
  expect(buttons.length).toBe(1);
  expect(buttons[0].attributes("title")).toBe("GitHub");
  // 命中时该组内容不收起
  expect(wrapper.find(".quick-tag-content.is-collapsed").exists()).toBe(false);
});
```

- [ ] **Step 2: 运行测试**

Run: `npm test -- src/__tests__/quick-buttons.test.ts -t "filters buttons globally"`
Expected: PASS（Task 5 的 `groupedButtons` 改动已使其通过；若失败，回到 Task 5 检查 `globalSearchNormalized` 是否正确接入）。

- [ ] **Step 3: 全量回归**

Run: `npm test`
Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
git add src/__tests__/quick-buttons.test.ts
git commit -m "test: quick buttons filter by global search query"
```

---

### Task 7: 顶栏 #search 插槽

**Files:**
- Modify: `src/components/WorkbenchShell.vue`
- Test: `src/__tests__/workbench-shell.test.ts`（扩展）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/workbench-shell.test.ts` 的 `describe("WorkbenchShell", ...)` 内追加：

```ts
it("renders the search slot inside the command actions", () => {
  const wrapper = mount(WorkbenchShell, {
    props: defaultProps,
    slots: {
      search: '<div data-testid="search-slot">search</div>',
    },
  });
  expect(wrapper.get('[data-testid="search-slot"]').text()).toBe("search");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/__tests__/workbench-shell.test.ts -t "search slot"`
Expected: FAIL（找不到 `[data-testid="search-slot"]`）

- [ ] **Step 3: 在 WorkbenchShell.vue 加插槽**

在 `src/components/WorkbenchShell.vue` 的 `<div class="workbench-command-actions">` 内，把 `<slot name="search" />` 放在**最前面**（隐藏/主题按钮之前），即：

```html
          <div class="workbench-command-actions">
            <slot name="search" />
            <Button
              variant="ghost"
              size="icon"
              class="workbench-header-hide-button"
              data-testid="workbench-header-hide"
              aria-label="隐藏顶部菜单"
              @click="setHeaderHidden(true, $event)"
            >
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/__tests__/workbench-shell.test.ts`
Expected: PASS（含新增 + 既有）

- [ ] **Step 5: 提交**

```bash
git add src/components/WorkbenchShell.vue src/__tests__/workbench-shell.test.ts
git commit -m "feat: add #search slot to workbench command bar"
```

---

### Task 8: App.vue 注入搜索框 + i18n 占位符 + 样式

**Files:**
- Modify: `src/state/i18n.ts`
- Modify: `src/App.vue`
- Modify: `src/styles.css`

- [ ] **Step 1: 加 i18n 文案**

在 `src/state/i18n.ts` 的 `app` 对象里，给 **zh** 和 **en** 两份都在 `reminderFallback` 之后加一行：

zh（约 558 行 `reminderFallback: "提醒事项",` 之后）：

```ts
      searchPlaceholder: "搜索快捷动作 / 提醒事项 / 备忘录",
```

en（在 en 字典的 `app` 块、其 `reminderFallback` 之后）：

```ts
      searchPlaceholder: "Search quick actions / todos / memos",
```

- [ ] **Step 2: 在 App.vue 接入搜索框**

在 `src/App.vue` `<script setup>` 导入区：

- 在已有的 `@vicons/ionicons5` 导入中加入 `SearchOutline`（若该导入不存在则新增 `import { SearchOutline } from "@vicons/ionicons5";`）。
- 确认 `naive-ui` 导入含 `NIcon` 与 `NInput`（缺则补）。
- 新增 `import { clearGlobalSearch, setGlobalSearch, globalSearchQuery } from "./state/globalSearch";`

在 `<WorkbenchShell>` 元素内、`</template>`（`#actions` 插槽结束，约 2892 行）之后，新增 `#search` 插槽：

```html
      <template #search>
        <NInput
          class="global-search-input"
          :value="globalSearchQuery"
          :placeholder="uiText.app.searchPlaceholder"
          clearable
          :aria-label="uiText.app.searchPlaceholder"
          @update:value="(value: string) => setGlobalSearch(value)"
          @keydown.esc.prevent="clearGlobalSearch"
        >
          <template #prefix>
            <NIcon :component="SearchOutline" />
          </template>
        </NInput>
      </template>
```

- [ ] **Step 3: 加搜索框样式**

在 `src/styles.css` 末尾追加：

```css
.global-search-input {
  width: 220px;
  max-width: 30vw;
}

@media (max-width: 960px) {
  .global-search-input {
    width: 140px;
  }
}
```

- [ ] **Step 4: 全量测试 + 构建**

Run: `npm test`
Expected: 全绿。

Run: `npm run build`
Expected: 构建成功（无 TS 报错）。

- [ ] **Step 5: 提交**

```bash
git add src/state/i18n.ts src/App.vue src/styles.css
git commit -m "feat: wire global search input into workbench header"
```

---

### Task 9: 端到端手测与收尾

**Files:** 无（仅校验）

- [ ] **Step 1: 启动 dev**

Run: `npm run dev`
在浏览器打开本地地址。

- [ ] **Step 2: 浅色 / 深色各验证一次**

逐项确认：
- 顶栏图标按钮左侧出现搜索框，占位符为"搜索快捷动作 / 提醒事项 / 备忘录"。
- 标签标题加深、右侧出现数量徽章；按钮呈等宽网格，超长标题省略号 + 悬浮显示完整标题。
- 输入关键词（如 `git`）：仅命中按钮显示，命中组展开，命中文字蓝色高亮；无命中组隐藏；清空（× 或 Esc）恢复。
- 拖拽排序、Tab 收起/展开、Ctrl+S 保存、新增/编辑按钮 等既有功能不回归。
- 切换深色主题，高亮与徽章配色正常。
- 已知小行为：搜索态下点击某组的收起箭头不会立刻收起（过滤强制展开），清空搜索后恢复——Phase 1 可接受。

- [ ] **Step 3: 收尾提交（如有手测中修的小问题）**

如手测有微调，提交：

```bash
git add -A
git commit -m "fix: polish global search phase 1 based on manual review"
```

否则无需提交。

---

## 自检（写计划后）

- **Spec 覆盖（Phase 1 范围）**：
  - 搜索状态/不持久化 → Task 2 ✓
  - 匹配/高亮纯函数 + `<mark>` → Task 1 + Task 3 ✓
  - 顶栏 `#search` 插槽（图标按钮左侧）→ Task 7 + Task 8 ✓
  - 快捷动作：标题强化、数量徽章、等宽网格、截断 → Task 5 ✓
  - 快捷动作：过滤、强制展开、隐藏空组、高亮 → Task 4 + Task 5 + Task 6 ✓
  - i18n 占位符 → Task 8 ✓
  - 测试（utils/globalSearch/HighlightText/quick 过滤/插槽）→ 各 Task ✓
  - Phase 2（提醒事项）/ Phase 3（备忘录）不在本计划，后续独立计划 ✓
- **占位符扫描**：无 TBD/TODO；每步都有可执行代码或命令 ✓
- **类型/命名一致性**：`globalSearchQuery`/`globalSearchNormalized`/`isGlobalSearchActive`/`setGlobalSearch`/`clearGlobalSearch`/`resetGlobalSearch`、`matchesSearch`/`splitHighlightSegments`/`normalizeSearchQuery`、`filterVisibleQuickButtonGroups`、`HighlightText`（props `text`/`query`）、`searchPlaceholder` 在各 Task 间一致 ✓

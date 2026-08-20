# 提醒事项快捷键 / 便签 Tab 短横线 / 右键跨空间移动 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现设计文档 `docs/superpowers/specs/2026-08-20-editing-shortcuts-and-cross-workspace-move-design.md` 的三组功能：提醒事项 Ctrl+←→/↑↓ 编辑快捷键、便签 Tab 智能短横线、右键菜单跨工作空间移动（快捷按钮/标签/提醒列表/单条提醒/便签 Tab）。

**Architecture:** 状态逻辑全部落在纯函数模块（`state/todos.ts` 新增一个函数、新建 `state/workspaceMoves.ts`、改 `utils/textEditor.ts`），三个面板组件只加菜单渲染与事件，`App.vue` 薄接线并 `persistNow()`。所有移动操作不可变更新，撤销由现有 `useUndoHistory`（`onBeforeSave: recordUndoCheckpoint`）自动覆盖。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Naive UI `NDropdown`（children 子菜单）+ Vitest + @vue/test-utils。

**背景知识（给零上下文的工程师）:**
- 测试：`npx vitest run <文件>`；全量 `npm test`。测试位于 `src/__tests__/`，同一文件内追加 describe 即可。
- 组件右键菜单统一模式：组件持有 `menu` ref（坐标 + 目标 id），`NDropdown trigger="manual" :show="true"`，`createExclusiveContextMenu` 管互斥，`menuOptions` computed 产出 `DropdownOption[]`（`{ label, key, icon, disabled, children }`，children 即子菜单，select 时把叶子 key 传给 handler）。
- 提醒事项显示顺序：`getOrderedTodos`（`src/state/todos.ts`）= 未完成（星标在前）+ 已完成沉底；`moveTodo` 落位语义：`targetIndex` 在移除被移条目前计算（上移 = 插到目标前，下移 = 落在目标原索引即其后），无 `targetId` 追加到数组末尾。
- 「空间」= 工作空间 `WorkspaceData`（`src/types.ts`）；中栏 Tab 页 `WorkspaceSpace` 也叫便签。
- 提交信息格式 `<type>: <description>`，不加署名尾注。

---

### Task 1: `getTodoReorderTarget` — Ctrl+↑↓ 的目标计算纯函数

**Files:**
- Modify: `src/state/todos.ts`（文件末尾、`getOpenTodoRank` 之后追加）
- Test: `src/__tests__/todos.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/todos.test.ts` 顶部现有 `import { ... } from "../state/todos"` 中加入 `getTodoReorderTarget`（若无该 import 则新增一行），文件末尾追加：

```ts
describe("getTodoReorderTarget — Ctrl+Up/Down 换算为 moveTodo 落位目标", () => {
  const todos = [
    { id: "a", text: "a", done: false },
    { id: "b", text: "b", done: false },
    { id: "c", text: "c", done: false },
  ];

  it("上移：目标是上一个同组成员（插到它前面 = 交换）", () => {
    expect(getTodoReorderTarget(todos, "b", -1)).toEqual({ targetId: "a" });
  });

  it("下移：目标是下一个同组成员（moveTodo 落在其原索引之后）", () => {
    expect(getTodoReorderTarget(todos, "a", 1)).toEqual({ targetId: "b" });
  });

  it("下移到组内末尾：返回 null", () => {
    expect(getTodoReorderTarget(todos, "c", 1)).toBeNull();
  });

  it("组边界返回 null（无操作）", () => {
    expect(getTodoReorderTarget(todos, "a", -1)).toBeNull();
    expect(getTodoReorderTarget(todos, "missing", 1)).toBeNull();
  });

  it("不跨越 完成/星标 分组边界", () => {
    const mixed = [
      { id: "s", text: "s", done: false, starred: true },
      { id: "o", text: "o", done: false },
      { id: "d", text: "d", done: true },
    ];
    expect(getTodoReorderTarget(mixed, "s", 1)).toBeNull();
    expect(getTodoReorderTarget(mixed, "d", -1)).toBeNull();
    expect(getTodoReorderTarget(mixed, "o", -1)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/todos.test.ts`
Expected: FAIL，报 `getTodoReorderTarget` 未导出。

- [ ] **Step 3: 最小实现**

在 `src/state/todos.ts` 末尾（`getOpenTodoRank` 函数之后）追加：

```ts
function getTodoGroupKey(todo: TodoItem): string {
  return `${todo.done ? "done" : "open"}:${todo.starred ? "starred" : "plain"}`;
}

/**
 * Ctrl/Cmd+Up/Down 的移动目标，按 moveTodo() 的落位语义表达（targetIndex
 * 在移除被移条目前计算：上移 = 插到目标前，下移 = 落在目标原索引处，即
 * 目标之后）。`ordered` 是该列表的可见显示顺序（getOrderedTodos 的结果）。
 * 移动限制在同一视觉分组（相同 done + starred）：跨组换位在显示上没有
 * 效果。上移 → 上一个同组成员；下移 → 下一个同组成员；组内无移动空间
 * 或找不到条目返回 null（无操作，不触发保存）。
 */
export function getTodoReorderTarget(ordered: TodoItem[], id: string, direction: -1 | 1): { targetId: string } | null {
  const index = ordered.findIndex((todo) => todo.id === id);
  if (index < 0) return null;
  const key = getTodoGroupKey(ordered[index]);

  const step = direction === -1 ? -1 : 1;
  for (let i = index + step; i >= 0 && i < ordered.length; i += step) {
    if (getTodoGroupKey(ordered[i]) === key) return { targetId: ordered[i].id };
  }
  return null;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/todos.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add src/state/todos.ts src/__tests__/todos.test.ts
git commit -m "feat: 提醒事项 Ctrl+上下键移动顺序的目标计算纯函数"
```

---

### Task 2: 便签 Tab 智能短横线

**Files:**
- Modify: `src/utils/textEditor.ts:124-183`（`resolveListMarker` 之后加辅助函数；`applySingleLineIndent` 改标记解析）
- Test: `src/__tests__/text-editor.test.ts`

- [ ] **Step 1: 更新/新增失败测试**

在 `src/__tests__/text-editor.test.ts` 中，把 describe `handleTextareaTab — preserved indent/outdent behavior` 里的这个用例：

```ts
  it("still indents when the caret is not at the start of a plain line", () => {
    const result = apply("买牛奶", 2);
    expect(result.value).toBe("    买牛奶");
  });
```

替换为：

```ts
  it("indents and bulletizes a plain line even with the caret in the text", () => {
    const result = apply("买牛奶", 2);
    expect(result.value).toBe("    - 买牛奶");
  });
```

并在文件末尾追加新 describe：

```ts
describe("handleTextareaTab — Tab 短横线跟随紧邻上一行", () => {
  it("上一行无标记（光标在行中）→ 缩进 + 短横线", () => {
    const result = apply("购物清单\n买牛奶", 8);
    expect(result.value).toBe("购物清单\n    - 买牛奶");
  });

  it("上一行是空行 → 缩进 + 短横线", () => {
    const result = apply("备注\n\n买牛奶", 4);
    expect(result.value).toBe("备注\n\n    - 买牛奶");
  });

  it("首行（没有上一行）→ 缩进 + 短横线", () => {
    const result = apply("买牛奶", 3);
    expect(result.value).toBe("    - 买牛奶");
  });

  it("已有缩进的普通行，上一行无标记 → 再加一级缩进 + 短横线", () => {
    const result = apply("备注\n    买牛奶", 7);
    expect(result.value).toBe("备注\n        - 买牛奶");
  });

  it("上一行有标记但目标层级无同级兄弟 → 默认短横线（不再依赖光标位置）", () => {
    const result = apply("1. a\nb", 5);
    expect(result.value).toBe("1. a\n    - b");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/text-editor.test.ts`
Expected: FAIL（新用例得到 `    买牛奶` 无短横线等）。

- [ ] **Step 3: 实现**

`src/utils/textEditor.ts` 中，在 `resolveListMarker` 函数（约 124-136 行）之后追加：

```ts
/** 物理上紧邻的上一行（可能是空行）；首行返回 null。 */
function getPreviousPhysicalLine(value: string, lineStart: number): string | null {
  if (lineStart === 0) return null;
  const prevEnd = lineStart - 1;
  const prevStart = value.lastIndexOf("\n", prevEnd - 1) + 1;
  return value.slice(prevStart, prevEnd);
}
```

把 `applySingleLineIndent` 的文档注释（139-148 行）替换为：

```ts
/**
 * Indent (Tab) or outdent (Shift+Tab) a single line. The marker at the line's
 * new depth is inherited from the nearest preceding non-empty line at that same
 * depth, so markers stay consistent within a level: a numbered line dropped
 * under a dash sibling becomes a dash, and a dash under a numbered sibling
 * becomes "1. " (the editor's renumber pass assigns the real number). With no
 * sibling above the marker defaults to a bullet. Tab on a marker-less line
 * always adds a marker, regardless of caret position or current indent: a dash
 * when the physically preceding line is missing, empty, or itself unmarked,
 * otherwise the inherited marker. Outdent keeps plain lines plain. The caret
 * keeps its offset within the item text. Multi-line selections use the regular
 * path in handleTextareaTab.
 */
```

把函数体内这一段（约 167-171 行）：

```ts
  const hasMarker = marker.length > 0;
  const startsPlainList = !outdent && caretInLine === 0 && indent === 0;
  const resolvedMarker = (hasMarker || startsPlainList)
    ? resolveListMarker(value, lineStart, newDepth, !outdent).marker
    : "";
```

替换为：

```ts
  const hasMarker = marker.length > 0;
  let resolvedMarker = "";
  if (hasMarker) {
    resolvedMarker = resolveListMarker(value, lineStart, newDepth, !outdent).marker;
  } else if (!outdent) {
    const previousLine = getPreviousPhysicalLine(value, lineStart);
    const previousMarked = previousLine !== null && getMarkerKind(previousLine) !== "plain";
    resolvedMarker = previousMarked
      ? resolveListMarker(value, lineStart, newDepth, true).marker
      : "- ";
  }
```

注意：`caretInLine` 变量在此之后不再使用，若 TS 报 unused（`noUnusedLocals`），删除 `const caretInLine = caret - lineStart;` 一行。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/text-editor.test.ts`
Expected: PASS（含既有其余用例——带标记行、Shift+Tab、多行选区路径未改动）。

- [ ] **Step 5: 提交**

```bash
git add src/utils/textEditor.ts src/__tests__/text-editor.test.ts
git commit -m "feat: 便签 Tab 在上一行为空行或无序号短横线时自动加短横线"
```

---

### Task 3: TodoPanel 键盘接线（Ctrl+←→ 与 Ctrl+↑↓）

**Files:**
- Modify: `src/components/TodoPanel.vue`（script：import、`handleTodoArrowKey`、新增两个函数；template：4 处 input 事件）
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/todo-panel.test.ts` 文件末尾（`describe("TodoPanel")` 之外）追加：

```ts
describe("TodoPanel 编辑快捷键", () => {
  function mountKeyboardPanel(todos: TodoMap) {
    return mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos,
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });
  }

  it("Ctrl+左右方向键跳到行首/行尾", async () => {
    const wrapper = mountKeyboardPanel({
      morning: [{ id: "todo-1", text: "买牛奶", done: false }],
      noon: [], evening: [],
    });
    const input = wrapper.get('[data-testid="todo-input-morning"]');
    await input.trigger("click");
    await nextTick();
    (input.element as HTMLInputElement).setSelectionRange(2, 2);
    await input.trigger("keydown", { key: "ArrowLeft", ctrlKey: true });
    expect((input.element as HTMLInputElement).selectionStart).toBe(0);
    await input.trigger("keydown", { key: "ArrowRight", ctrlKey: true });
    expect((input.element as HTMLInputElement).selectionStart).toBe(3);
    wrapper.unmount();
  });

  it("Ctrl+下方向键在同组内下移并 emit move", async () => {
    const wrapper = mountKeyboardPanel({
      morning: [
        { id: "todo-1", text: "第一", done: false },
        { id: "todo-2", text: "第二", done: false },
        { id: "todo-3", text: "第三", done: false },
      ],
      noon: [], evening: [],
    });
    const input = wrapper.get('[data-testid="todo-input-morning"]');
    await input.trigger("click");
    await nextTick();
    await input.trigger("keydown", { key: "ArrowDown", ctrlKey: true });
    expect(wrapper.emitted("move")?.[0]).toEqual([{ period: "morning", id: "todo-1" }, "morning", "todo-2"]);
    wrapper.unmount();
  });

  it("组内第一条 Ctrl+上移不产生 move", async () => {
    const wrapper = mountKeyboardPanel({
      morning: [{ id: "todo-1", text: "第一", done: false }],
      noon: [], evening: [],
    });
    const input = wrapper.get('[data-testid="todo-input-morning"]');
    await input.trigger("click");
    await nextTick();
    await input.trigger("keydown", { key: "ArrowUp", ctrlKey: true });
    expect(wrapper.emitted("move")).toBeUndefined();
    wrapper.unmount();
  });

  it("今日聚焦区 Ctrl+下方向键回落为焦点移动，不产生 move", async () => {
    const wrapper = mountKeyboardPanel({
      morning: [{ id: "todo-1", text: "重点", done: false, starred: true }],
      noon: [], evening: [],
    });
    const input = wrapper.get("input.today-focus-input");
    await input.trigger("click");
    await nextTick();
    await input.trigger("keydown", { key: "ArrowDown", ctrlKey: true });
    expect(wrapper.emitted("move")).toBeUndefined();
    wrapper.unmount();
  });
});
```

（`mount`、`nextTick`、`defaultTodoLists`、`dropdownStub`、`datePickerStub`、`tooltipStub`、`DEFAULT_TITLES` 均已在该文件顶部存在；`TodoMap` 类型也已导入。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/todo-panel.test.ts`
Expected: FAIL（新 describe 全部失败：无 left/right 处理、move 未 emit）。

- [ ] **Step 3: 实现**

`src/components/TodoPanel.vue` script 部分：

3a. import 行（第 46 行）：

```ts
import { getOrderedTodos, todoKey } from "../state/todos";
```

改为：

```ts
import { getOrderedTodos, getTodoReorderTarget, todoKey } from "../state/todos";
```

3b. 把 `handleTodoArrowKey`（515-534 行）整体替换为：

```ts
function handleTodoArrowKey(event: KeyboardEvent, period: TodoPeriod, todo: TodoItem, allowReorder = false): void {
  if (isImeComposing(event)) return;
  const direction: -1 | 1 | 0 = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
  if (direction === 0) return;
  const input = event.currentTarget as HTMLInputElement;
  // Ctrl/Cmd+Up/Down 在普通列表里移动条目顺序；今日聚焦区（allowReorder=false）
  // 是跨列表置顶视图，回落为普通焦点移动。
  if (allowReorder && (event.ctrlKey || event.metaKey)) {
    handleTodoReorder(event, input, period, todo, direction);
    return;
  }
  const target = getAdjacentTodoInput(input, direction);
  if (!target) return;
  event.preventDefault();
  const caret = input.selectionStart ?? input.value.length;
  const identity = getTodoInputIdentity(target);
  if (identity) {
    const targetTodo = getTodoById(identity.period, identity.id);
    if (targetTodo && !targetTodo.done) editingTodoKey.value = todoKey(identity.period, identity.id);
  }
  void nextTick(() => {
    target.focus({ preventScroll: true });
    const position = Math.max(0, Math.min(caret, target.value.length));
    target.setSelectionRange(position, position);
  });
}

/** Ctrl/Cmd+Up/Down：在同一视觉分组内移动条目，焦点与光标随行保留。 */
function handleTodoReorder(event: KeyboardEvent, input: HTMLInputElement, period: TodoPeriod, todo: TodoItem, direction: -1 | 1): void {
  if (input.readOnly) return;
  const target = getTodoReorderTarget(visibleOrdered.value[period] ?? [], todo.id, direction);
  if (!target) return;
  event.preventDefault();
  const caret = input.selectionStart ?? input.value.length;
  if (!todo.done) editingTodoKey.value = todoKey(period, todo.id);
  emitTodoMove({ period, id: todo.id }, period, target.targetId);
  void nextTick(() => {
    const position = Math.max(0, Math.min(caret, input.value.length));
    input.setSelectionRange(position, position);
  });
}

/** Ctrl/Cmd+Left/Right 跳到提醒文本的行首/行尾（单行输入，无列表标记）。 */
function handleTodoHorizontalArrow(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || isImeComposing(event)) return;
  const input = event.currentTarget as HTMLInputElement;
  if (input.readOnly) return;
  event.preventDefault();
  const position = event.key === "ArrowLeft" ? 0 : input.value.length;
  input.setSelectionRange(position, position);
}
```

3c. template 两处 input：

today-focus 的 input（约 1485-1488 行）：

```html
              @keydown.enter="handleEnter($event, item.period, item.todo)"
              @keydown.up="handleTodoArrowKey($event, item.period, item.todo)"
              @keydown.down="handleTodoArrowKey($event, item.period, item.todo)"
              @keydown.tab="handleTodoTab($event, item.period, item.todo)"
```

改为：

```html
              @keydown.enter="handleEnter($event, item.period, item.todo)"
              @keydown.up="handleTodoArrowKey($event, item.period, item.todo)"
              @keydown.down="handleTodoArrowKey($event, item.period, item.todo)"
              @keydown.left="handleTodoHorizontalArrow"
              @keydown.right="handleTodoHorizontalArrow"
              @keydown.tab="handleTodoTab($event, item.period, item.todo)"
```

普通列表的 input（约 1692-1695 行）：

```html
                  @keydown.enter="handleEnter($event, list.id, entry.todo)"
                  @keydown.up="handleTodoArrowKey($event, list.id, entry.todo)"
                  @keydown.down="handleTodoArrowKey($event, list.id, entry.todo)"
                  @keydown.tab="handleTodoTab($event, list.id, entry.todo)"
```

改为：

```html
                  @keydown.enter="handleEnter($event, list.id, entry.todo)"
                  @keydown.up="handleTodoArrowKey($event, list.id, entry.todo, true)"
                  @keydown.down="handleTodoArrowKey($event, list.id, entry.todo, true)"
                  @keydown.left="handleTodoHorizontalArrow"
                  @keydown.right="handleTodoHorizontalArrow"
                  @keydown.tab="handleTodoTab($event, list.id, entry.todo)"
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/todo-panel.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/TodoPanel.vue src/__tests__/todo-panel.test.ts
git commit -m "feat: 提醒事项支持 Ctrl+左右跳行首行尾、Ctrl+上下移动顺序"
```

---

### Task 4: `WorkspaceMoveTarget` 类型 + 快捷按钮/标签跨空间移动

**Files:**
- Modify: `src/types.ts`（文件末尾追加类型）
- Create: `src/state/workspaceMoves.ts`
- Test: `src/__tests__/workspaceMoves.test.ts`

- [ ] **Step 1: 加类型**

`src/types.ts` 末尾追加：

```ts
/** 右键「移动到空间」子菜单的目标工作空间（已排除当前空间）。 */
export interface WorkspaceMoveTarget {
  id: string;
  title: string;
  /** 提醒事项条目移动时需要的第二级列表选择；其他场景不使用。 */
  lists: { id: string; title: string }[];
}
```

- [ ] **Step 2: 写失败测试**

新建 `src/__tests__/workspaceMoves.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  moveQuickButtonToWorkspace,
  moveQuickTagToWorkspace,
} from "../state/workspaceMoves";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData } from "../types";

function workspace(id: string, overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return { ...defaultWorkspace(id), ...overrides };
}

describe("moveQuickButtonToWorkspace", () => {
  const tag = { id: "tag-1", title: "常用", color: "#4ade80" };
  const button = { id: "btn-1", title: "搜索", value: "https://example.com", type: "link" as const, tagId: "tag-1", hidden: false };
  const source = workspace("ws-a", { quickTags: [tag], quickButtons: [button] });
  const target = workspace("ws-b");

  it("移动按钮并在目标重建同名同色标签", () => {
    const next = moveQuickButtonToWorkspace([source, target], "ws-a", "btn-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.quickButtons).toHaveLength(0);
    expect(to.quickButtons).toHaveLength(1);
    expect(to.quickTags).toHaveLength(1);
    expect(to.quickTags[0]).toMatchObject({ title: "常用", color: "#4ade80" });
    expect(to.quickButtons[0].tagId).toBe(to.quickTags[0].id);
  });

  it("目标已有同名标签则直接挂到现有标签", () => {
    const existing = { id: "tag-9", title: "常用" };
    const next = moveQuickButtonToWorkspace([source, workspace("ws-b", { quickTags: [existing] })], "ws-a", "btn-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickTags).toHaveLength(1);
    expect(to.quickButtons[0].tagId).toBe("tag-9");
  });

  it("悬空 tagId 视为无标签，直接迁移", () => {
    const orphan = { ...button, id: "btn-2", tagId: "missing" };
    const next = moveQuickButtonToWorkspace([workspace("ws-a", { quickTags: [tag], quickButtons: [orphan] }), target], "ws-a", "btn-2", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickTags).toHaveLength(0);
    expect(to.quickButtons[0].tagId).toBeUndefined();
  });

  it("未知 id 或同空间时返回原数组引用", () => {
    const workspaces = [source, target];
    expect(moveQuickButtonToWorkspace(workspaces, "ws-a", "nope", "ws-b")).toBe(workspaces);
    expect(moveQuickButtonToWorkspace(workspaces, "ws-a", "btn-1", "ws-a")).toBe(workspaces);
  });

  it("不修改输入数据", () => {
    moveQuickButtonToWorkspace([source, target], "ws-a", "btn-1", "ws-b");
    expect(source.quickButtons).toHaveLength(1);
    expect(target.quickButtons).toHaveLength(0);
    expect(target.quickTags).toHaveLength(0);
  });
});

describe("moveQuickTagToWorkspace", () => {
  const tag = { id: "tag-1", title: "常用" };
  const inTag = { id: "btn-1", title: "a", value: "va", type: "link" as const, tagId: "tag-1", hidden: false };
  const loose = { id: "btn-2", title: "b", value: "vb", type: "text" as const, hidden: false };
  const source = workspace("ws-a", { quickTags: [tag], quickButtons: [inTag, loose] });
  const target = workspace("ws-b");

  it("标签连同其下按钮一起移动，其他按钮留下", () => {
    const next = moveQuickTagToWorkspace([source, target], "ws-a", "tag-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.quickTags).toHaveLength(0);
    expect(from.quickButtons.map((b) => b.id)).toEqual(["btn-2"]);
    expect(to.quickTags.map((t) => t.title)).toEqual(["常用"]);
    expect(to.quickButtons.map((b) => b.id)).toEqual(["btn-1"]);
    expect(to.quickButtons[0].tagId).toBe("tag-1");
  });

  it("目标有同名标签时合并：按钮改挂现有标签，不新增标签", () => {
    const existing = { id: "tag-9", title: "常用" };
    const next = moveQuickTagToWorkspace([source, workspace("ws-b", { quickTags: [existing] })], "ws-a", "tag-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickTags).toHaveLength(1);
    expect(to.quickButtons[0].tagId).toBe("tag-9");
  });

  it("未知标签返回原数组", () => {
    const workspaces = [source, target];
    expect(moveQuickTagToWorkspace(workspaces, "ws-a", "nope", "ws-b")).toBe(workspaces);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run src/__tests__/workspaceMoves.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现**

新建 `src/state/workspaceMoves.ts`：

```ts
import { createId } from "./storage";
import type { QuickButton, QuickTag, TodoListId, TodoMap, WorkspaceData } from "../types";

/**
 * 跨工作空间移动：快捷按钮/标签、提醒列表/单条提醒、便签 Tab 页。
 * 全部纯函数：返回新的 workspaces 数组（不适用时返回原数组引用），
 * 从不修改入参，与 state/todos.ts 的不可变风格一致。
 */

/** 在数组中替换 from/to 两个工作空间；build 返回 null 表示无操作。 */
function transferWorkspaceItem(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  toWorkspaceId: string,
  build: (from: WorkspaceData, to: WorkspaceData) => { from: WorkspaceData; to: WorkspaceData } | null,
): WorkspaceData[] {
  if (fromWorkspaceId === toWorkspaceId) return workspaces;
  const from = workspaces.find((workspace) => workspace.id === fromWorkspaceId);
  const to = workspaces.find((workspace) => workspace.id === toWorkspaceId);
  if (!from || !to) return workspaces;
  const result = build(from, to);
  if (!result) return workspaces;
  return workspaces.map((workspace) => {
    if (workspace.id === fromWorkspaceId) return result.from;
    if (workspace.id === toWorkspaceId) return result.to;
    return workspace;
  });
}

/**
 * 移动单个快捷按钮。标签仍存在时保留分组：使用目标的同名标签，没有则在
 * 目标新建同名同色标签；悬空 tagId 视为无标签（落入目标的「其他」分组）。
 */
export function moveQuickButtonToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  buttonId: string,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    const button = from.quickButtons.find((item) => item.id === buttonId);
    if (!button) return null;

    let quickTags = to.quickTags;
    let tagId: string | undefined;
    const sourceTag = button.tagId ? from.quickTags.find((tag) => tag.id === button.tagId) : undefined;
    if (sourceTag) {
      const existing = to.quickTags.find((tag) => tag.title === sourceTag.title);
      if (existing) {
        tagId = existing.id;
      } else {
        const created: QuickTag = sourceTag.color
          ? { id: createId(), title: sourceTag.title, color: sourceTag.color }
          : { id: createId(), title: sourceTag.title };
        quickTags = [...to.quickTags, created];
        tagId = created.id;
      }
    }

    const moved: QuickButton = { ...button };
    if (tagId) moved.tagId = tagId;
    else delete moved.tagId;

    return {
      from: { ...from, quickButtons: from.quickButtons.filter((item) => item.id !== buttonId) },
      to: { ...to, quickTags, quickButtons: [...to.quickButtons, moved] },
    };
  });
}

/**
 * 移动快捷标签及其下全部按钮。目标已有同名标签时合并进去（按钮改挂现有
 * 标签），否则标签追加到目标 quickTags 末尾，按钮追加到 quickButtons 末尾。
 */
export function moveQuickTagToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  tagId: string,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    const tag = from.quickTags.find((item) => item.id === tagId);
    if (!tag) return null;

    const existing = to.quickTags.find((item) => item.title === tag.title);
    const movedTagId = existing ? existing.id : tag.id;
    const movedButtons = from.quickButtons
      .filter((button) => button.tagId === tagId)
      .map((button) => ({ ...button, tagId: movedTagId }));

    return {
      from: {
        ...from,
        quickTags: from.quickTags.filter((item) => item.id !== tagId),
        quickButtons: from.quickButtons.filter((button) => button.tagId !== tagId),
      },
      to: {
        ...to,
        quickTags: existing ? to.quickTags : [...to.quickTags, { ...tag }],
        quickButtons: [...to.quickButtons, ...movedButtons],
      },
    };
  });
}
```

（`TodoListId`/`TodoMap` 类型本任务尚未使用——Task 5 会用到；如果 lint 报 unused import，先只 import 当前用到的 `QuickButton, QuickTag, WorkspaceData`，Task 5 再补。）

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/__tests__/workspaceMoves.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/types.ts src/state/workspaceMoves.ts src/__tests__/workspaceMoves.test.ts
git commit -m "feat: 快捷按钮与标签的跨空间移动纯函数"
```

---

### Task 5: 提醒列表 / 单条提醒跨空间移动

**Files:**
- Modify: `src/state/workspaceMoves.ts`（追加两个函数）
- Test: `src/__tests__/workspaceMoves.test.ts`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/workspaceMoves.test.ts` 顶部 import 中加入 `moveTodoListToWorkspace, moveTodoToWorkspace`，文件末尾追加：

```ts
describe("moveTodoListToWorkspace", () => {
  const list = { id: "list-1", title: "清单一", collapsed: false, compact: false, column: 1 };
  const source = workspace("ws-a", {
    todoLists: [list, { id: "list-2", title: "清单二", collapsed: false, compact: false }],
    todos: { list-1: [{ id: "todo-1", text: "任务", done: false }] } as TodoMap,
    showCompletedTodos: { "list-1": false },
  });
  const target = workspace("ws-b");

  it("迁移列表配置、提醒与完成区可见性到目标末尾", () => {
    const next = moveTodoListToWorkspace([source, target], "ws-a", "list-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.todoLists.map((l) => l.id)).toEqual(["list-2"]);
    expect(from.todos["list-1"]).toBeUndefined();
    expect(from.showCompletedTodos["list-1"]).toBeUndefined();
    expect(to.todoLists.map((l) => l.id)).toEqual(["list-1"]);
    expect(to.todoLists[0].column).toBe(1);
    expect(to.todos["list-1"]).toEqual([{ id: "todo-1", text: "任务", done: false }]);
    expect(to.showCompletedTodos["list-1"]).toBe(false);
  });

  it("源只剩一个列表时拒绝（返回原数组）", () => {
    const single = workspace("ws-a", { todoLists: [list], todos: { "list-1": [] } as TodoMap });
    const workspaces = [single, target];
    expect(moveTodoListToWorkspace(workspaces, "ws-a", "list-1", "ws-b")).toBe(workspaces);
  });

  it("目标已有同 id 列表时重新生成列表 id 并迁移数据键", () => {
    const clashList = { id: "list-1", title: "目标自己的", collapsed: true, compact: false };
    const clashy = workspace("ws-b", {
      todoLists: [clashList],
      todos: { "list-1": [{ id: "todo-x", text: "目标自己的提醒", done: false }] } as TodoMap,
    });
    const next = moveTodoListToWorkspace([source, clashy], "ws-a", "list-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.todoLists).toHaveLength(2);
    expect(to.todoLists[0]).toMatchObject({ id: "list-1", title: "目标自己的" });
    expect(to.todoLists[1].id).not.toBe("list-1");
    expect(to.todos["list-1"]).toEqual([{ id: "todo-x", text: "目标自己的提醒", done: false }]);
    expect(to.todoLists[1].id && to.todos[to.todoLists[1].id]).toEqual([{ id: "todo-1", text: "任务", done: false }]);
  });
});

describe("moveTodoToWorkspace", () => {
  const source = workspace("ws-a", {
    todoLists: [{ id: "list-1", title: "清单一", collapsed: false, compact: false }],
    todos: { "list-1": [{ id: "todo-open", text: "进行中", done: false }, { id: "todo-2", text: "完成", done: true }] } as TodoMap,
  });
  const target = workspace("ws-b", {
    todoLists: [{ id: "list-b1", title: "目标清单", collapsed: false, compact: false }],
    todos: { "list-b1": [{ id: "todo-done", text: "已完成", done: true }] } as TodoMap,
  });

  it("插入目标列表最后一条未完成之后（完成区之前）", () => {
    const next = moveTodoToWorkspace([source, target], "ws-a", "list-1", "todo-open", "ws-b", "list-b1");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.todos["list-1"].map((t) => t.id)).toEqual(["todo-2"]);
    expect(to.todos["list-b1"].map((t) => t.id)).toEqual(["todo-open", "todo-done"]);
  });

  it("目标列表不存在时返回原数组", () => {
    const workspaces = [source, target];
    expect(moveTodoToWorkspace(workspaces, "ws-a", "list-1", "todo-open", "ws-b", "missing")).toBe(workspaces);
  });

  it("目标列表已有同 id 提醒时重新生成提醒 id", () => {
    const clashy = workspace("ws-b", {
      todoLists: [{ id: "list-b1", title: "目标清单", collapsed: false, compact: false }],
      todos: { "list-b1": [{ id: "todo-open", text: "目标自己的", done: false }] } as TodoMap,
    });
    const next = moveTodoToWorkspace([source, clashy], "ws-a", "list-1", "todo-open", "ws-b", "list-b1");
    const to = next.find((w) => w.id === "ws-b")!;
    const ids = to.todos["list-b1"].map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(to.todos["list-b1"].some((t) => t.text === "进行中")).toBe(true);
  });
});
```

顶部再补充类型导入：`import type { TodoMap, WorkspaceData } from "../types";`（`TodoMap` 加入现有 type import）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/workspaceMoves.test.ts`
Expected: FAIL，两个函数未导出。

- [ ] **Step 3: 实现**

`src/state/workspaceMoves.ts`：顶部把 `addTodo as addTodoToMap, removeTodo as removeTodoFromMap` 加进 import：

```ts
import { addTodo as addTodoToMap, removeTodo as removeTodoFromMap } from "./todos";
```

文件末尾追加：

```ts
/**
 * 移动整个提醒列表（配置 + 提醒 + 完成区可见性）到目标空间列表末尾。
 * `column` 保留原值（展示端会按目标列数收敛）。源只剩一个列表时拒绝——
 * 每个空间至少保留一个列表。目标已有同 id 列表时重新生成列表 id，
 * 并同步迁移 todos/showCompletedTodos 的键，避免覆盖目标自身数据。
 */
export function moveTodoListToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  listId: TodoListId,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    if (from.todoLists.length <= 1) return null;
    const list = from.todoLists.find((item) => item.id === listId);
    if (!list) return null;

    const { [listId]: movedTodos = [], ...restTodos } = from.todos;
    const { [listId]: movedVisibility, ...restVisibility } = from.showCompletedTodos;
    const movedListId = to.todoLists.some((item) => item.id === listId) ? createId() : listId;

    return {
      from: {
        ...from,
        todoLists: from.todoLists.filter((item) => item.id !== listId),
        todos: restTodos as TodoMap,
        showCompletedTodos: restVisibility,
      },
      to: {
        ...to,
        todoLists: [...to.todoLists, { ...list, id: movedListId }],
        todos: { ...to.todos, [movedListId]: movedTodos.map((todo) => ({ ...todo })) },
        showCompletedTodos: movedVisibility === undefined
          ? to.showCompletedTodos
          : { ...to.showCompletedTodos, [movedListId]: movedVisibility },
      },
    };
  });
}

/**
 * 移动单条提醒到目标空间的指定列表，插在目标最后一条未完成之后。
 * 目标列表已有同 id 提醒时重新生成提醒 id，避免跨空间 id 碰撞。
 */
export function moveTodoToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  fromListId: TodoListId,
  todoId: string,
  toWorkspaceId: string,
  toListId: TodoListId,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    const todo = from.todos[fromListId]?.find((item) => item.id === todoId);
    if (!todo) return null;
    if (!to.todoLists.some((list) => list.id === toListId)) return null;

    const todoIdTaken = (to.todos[toListId] ?? []).some((item) => item.id === todo.id);
    const moved: TodoItem = { ...todo, ...(todoIdTaken ? { id: createId() } : {}) };

    return {
      from: { ...from, todos: removeTodoFromMap(from.todos, fromListId, todoId) },
      to: { ...to, todos: addTodoToMap(to.todos, toListId, moved) },
    };
  });
}
```

（同时把顶部 types import 补成 `import type { QuickButton, QuickTag, TodoListId, TodoMap, WorkspaceData } from "../types";`。）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/workspaceMoves.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/state/workspaceMoves.ts src/__tests__/workspaceMoves.test.ts
git commit -m "feat: 提醒列表与单条提醒的跨空间移动纯函数"
```

---

### Task 6: 便签 Tab 页跨空间移动

**Files:**
- Modify: `src/state/workspaceMoves.ts`（追加一个函数）
- Test: `src/__tests__/workspaceMoves.test.ts`（追加 describe）

- [ ] **Step 1: 写失败测试**

import 加入 `moveSpaceToWorkspace`，文件末尾追加：

```ts
describe("moveSpaceToWorkspace", () => {
  const spaces = [
    { id: "space-1", title: "便签一", lines: [{ text: "内容", indent: 0 }] },
    { id: "space-2", title: "便签二", lines: [] },
  ];
  const source = workspace("ws-a", { spaces, activeSpaceId: "space-2" });
  const target = workspace("ws-b", { spaces: [{ id: "space-b1", title: "目标便签", lines: [] }] });

  it("移动到目标末尾并克隆行数据", () => {
    const next = moveSpaceToWorkspace([source, target], "ws-a", "space-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.spaces.map((s) => s.id)).toEqual(["space-2"]);
    expect(from.activeSpaceId).toBe("space-2");
    expect(to.spaces.map((s) => s.id)).toEqual(["space-b1", "space-1"]);
    expect(to.spaces[1].lines).toEqual([{ text: "内容", indent: 0 }]);
  });

  it("移动的是激活空间时，源切换到前一个邻居", () => {
    const next = moveSpaceToWorkspace([source, target], "ws-a", "space-2", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    expect(from.activeSpaceId).toBe("space-1");
  });

  it("源只剩一个空间时拒绝", () => {
    const single = workspace("ws-a", { spaces: [spaces[0]], activeSpaceId: "space-1" });
    const workspaces = [single, target];
    expect(moveSpaceToWorkspace(workspaces, "ws-a", "space-1", "ws-b")).toBe(workspaces);
  });

  it("目标已有同 id 空间时重新生成 id 且保留目标原空间", () => {
    const clashing = workspace("ws-b", { spaces: [{ id: "space-1", title: "目标同名", lines: [] }] });
    const next = moveSpaceToWorkspace([source, clashing], "ws-a", "space-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.spaces).toHaveLength(2);
    expect(to.spaces[0]).toEqual({ id: "space-1", title: "目标同名", lines: [] });
    expect(to.spaces[1].id).not.toBe("space-1");
    expect(to.spaces[1].lines).toEqual([{ text: "内容", indent: 0 }]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/workspaceMoves.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

先在 `transferWorkspaceItem` 附近提取碰撞助手（Task 5 质量审查建议——同一模式已出现多处）：

```ts
/** 目标已占用同一 id 时重新生成（同一导入文件可进两个空间产生重复 id）。 */
function uniqueIdAmong(taken: Iterable<string>, desired: string): string {
  return [...taken].includes(desired) ? createId() : desired;
}
```

再把既有各处 `xxxTaken ? { id: createId() } : {}` 内联碰撞检查改写为
`id: uniqueIdAmong(<目标既有 id 集合>, <期望 id>)`（行为不变，既有 20 例测试是
重构安全网，必须全数通过）。同时给 `moveTodoListToWorkspace` 的 JSDoc 补一句：
「默认空间的 morning/noon/evening 列表 id 天然互撞，重生成是预期路径而非异常。」

末尾追加：

```ts
/**
 * 移动便签 Tab 页到目标空间末尾。源只剩一个空间时拒绝。移动的是源激活
 * 空间时，源 activeSpaceId 切到相邻空间（优先前一个，同 deleteSpace 规则）。
 * 目标已存在同 id 空间时重新生成 id（经 uniqueIdAmong）。
 */
export function moveSpaceToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  spaceId: string,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    if (from.spaces.length <= 1) return null;
    const index = from.spaces.findIndex((space) => space.id === spaceId);
    if (index < 0) return null;

    const space = from.spaces[index];
    const remainingSpaces = from.spaces.filter((_, itemIndex) => itemIndex !== index);
    const activeSpaceId = from.activeSpaceId === spaceId
      ? remainingSpaces[Math.max(0, index - 1)]?.id ?? remainingSpaces[0].id
      : from.activeSpaceId;

    return {
      from: { ...from, spaces: remainingSpaces, activeSpaceId },
      to: {
        ...to,
        spaces: [
          ...to.spaces,
          {
            ...space,
            id: uniqueIdAmong(to.spaces.map((item) => item.id), space.id),
            lines: space.lines.map((line) => ({ ...line })),
          },
        ],
      },
    };
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/workspaceMoves.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/state/workspaceMoves.ts src/__tests__/workspaceMoves.test.ts
git commit -m "feat: 便签 Tab 页的跨空间移动并提取 id 撞名助手"
```

---

### Task 7: i18n 文案与快捷键帮助

**Files:**
- Modify: `src/state/i18n.ts`（`UI_TEXT` zh/en 的 `common`、`app`；`SHORTCUT_HELP` zh/en）
- Test: `npx vitest run src/__tests__/i18n.test.ts src/__tests__/messages.test.ts`（既有键位校验）

- [ ] **Step 1: 加 UI 文案键**

在 `src/state/i18n.ts` 的 `UI_TEXT` 中（约 563 行起是 zh 的 app 段、`common` 段在其附近），给 **zh** 的 `common` 对象加：

```ts
      moveToWorkspace: "移动到空间",
```

给 **zh** 的 `app` 对象加（放在 `keepOneSpace` 旁边）：

```ts
      keepOneTodoList: "至少保留一个提醒事项列表",
```

给 **en** 的 `common` 加：

```ts
      moveToWorkspace: "Move to workspace",
```

给 **en** 的 `app` 加：

```ts
      keepOneTodoList: "Keep at least one reminder list",
```

（zh/en 两个语言块的键必须成对出现，i18n 测试会校验键位一致。）

- [ ] **Step 2: 更新快捷键帮助**

`SHORTCUT_HELP`（约 1273 行起）**zh**「提醒事项」区的 `shortcuts` 数组，在 `{ key: "右键条目", ... }` 之前插入：

```ts
      { key: "Ctrl/⌘ + ←/→", desc: "跳到行首/行尾" },
      { key: "Ctrl/⌘ + ↑/↓", desc: "上移/下移提醒顺序" },
```

**zh**「工作空间与文本」区把 `{ key: "Tab", desc: "增加缩进" }` 改为：

```ts
      { key: "Tab", desc: "增加缩进；上一行无序号/短横线时自动补 -" },
```

**en** 对应两区做同样修改：

```ts
      { key: "Ctrl/⌘ + ←/→", desc: "Jump to line start/end" },
      { key: "Ctrl/⌘ + ↑/↓", desc: "Move reminder up/down" },
```

```ts
      { key: "Tab", desc: "Indent; adds a dash when the line above is unmarked" },
```

- [ ] **Step 3: 运行相关测试**

Run: `npx vitest run src/__tests__/i18n.test.ts src/__tests__/messages.test.ts src/__tests__/shortcut-help.test.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/state/i18n.ts
git commit -m "feat: 跨空间移动与提醒快捷键的文案及快捷键帮助"
```

---

### Task 8: QuickButtons 右键移动菜单

**Files:**
- Modify: `src/components/QuickButtons.vue`（props/emits/menu 状态/menuOptions/openTagMenu/handleMenuSelect/template 标签头右键）
- Test: `src/__tests__/quick-buttons.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/quick-buttons.test.ts` 文件末尾追加（复用文件顶部已有的 `buttonStub` 等 stub；`menuDropdownStub` 是本组新定义、可渲染 children 的下拉 stub）：

```ts
const menuDropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: `
    <div>
      <slot />
      <template v-for="option in options" :key="option.key">
        <button
          class="dropdown-option"
          :data-key="option.key"
          :disabled="option.disabled"
          type="button"
          @click="!option.disabled && $emit('select', option.key)"
        >{{ option.label }}</button>
        <button
          v-for="child in option.children ?? []"
          :key="child.key"
          class="dropdown-option"
          :data-key="child.key"
          :disabled="child.disabled"
          type="button"
          @click="!child.disabled && $emit('select', child.key)"
        >{{ child.label }}</button>
      </template>
    </div>
  `,
};

describe("QuickButtons 跨空间移动", () => {
  function mountQuickPanel(props: Record<string, unknown>) {
    return mount(QuickButtons, {
      props: { title: "快捷按钮", showHidden: false, ...props },
      global: {
        stubs: {
          NDropdown: menuDropdownStub,
          Dropdown: menuDropdownStub,
          NButton: buttonStub,
          NCheckbox: checkboxStub,
          NInput: inputStub,
          NSelect: selectStub,
          NModal: modalStub,
        },
      },
    });
  }

  it("按钮右键菜单可将按钮移动到其他空间", async () => {
    const wrapper = mountQuickPanel({
      buttons: [{ id: "btn-1", title: "搜索", value: "https://example.com", type: "link", hidden: false }],
      tags: [],
      moveTargets: [{ id: "ws-b", title: "B 空间", lists: [] }],
    });
    await wrapper.get(".quick-button").trigger("contextmenu");
    await wrapper.get('[data-key="move-ws:ws-b"]').trigger("click");
    expect(wrapper.emitted("moveButtonToWorkspace")?.[0]).toEqual(["btn-1", "ws-b"]);
    wrapper.unmount();
  });

  it("标签头右键菜单可将标签移动到其他空间", async () => {
    const wrapper = mountQuickPanel({
      buttons: [{ id: "btn-1", title: "搜索", value: "https://example.com", type: "link", tagId: "tag-1", hidden: false }],
      tags: [{ id: "tag-1", title: "常用" }],
      moveTargets: [{ id: "ws-b", title: "B 空间", lists: [] }],
    });
    await wrapper.get(".quick-tag-title").trigger("contextmenu");
    await wrapper.get('[data-key="move-ws:ws-b"]').trigger("click");
    expect(wrapper.emitted("moveTagToWorkspace")?.[0]).toEqual(["tag-1", "ws-b"]);
    wrapper.unmount();
  });

  it("没有其他空间时不渲染移动菜单项", async () => {
    const wrapper = mountQuickPanel({
      buttons: [{ id: "btn-1", title: "搜索", value: "https://example.com", type: "link", hidden: false }],
      tags: [],
    });
    await wrapper.get(".quick-button").trigger("contextmenu");
    expect(wrapper.findAll('[data-key^="move-ws:"]')).toHaveLength(0);
    wrapper.unmount();
  });
});
```

（若文件顶部已有名为 `dropdownStub` 的下拉 stub，保留原样，新 describe 用 `menuDropdownStub`。`mount`/`QuickButtons` 已在该文件导入。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: FAIL（无 moveTargets prop、无相应 emit）。

- [ ] **Step 3: 实现**

`src/components/QuickButtons.vue`：

3a. props（20-31 行）加一个字段：

```ts
const props = withDefaults(defineProps<{
  title: string;
  buttons: QuickButton[];
  tags?: QuickTag[];
  showHidden: boolean;
  otherCollapsed?: boolean;
  language?: AppLanguage;
  moveTargets?: WorkspaceMoveTarget[];
}>(), {
  tags: () => [],
  otherCollapsed: false,
  language: "zh",
  moveTargets: () => [],
});
```

（types import 行加入 `WorkspaceMoveTarget`。）

3b. emits 定义（33-50 行）追加两行：

```ts
  moveButtonToWorkspace: [buttonId: string, workspaceId: string];
  moveTagToWorkspace: [tagId: string, workspaceId: string];
```

3c. `menu` ref（82 行）加 `tagId` 字段：

```ts
const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement; tagTitle?: string; tagId?: string } | null>(null);
```

3d. 在 `menuOptions`（172 行起）之前加：

```ts
const moveMenuChildren = computed<DropdownOption[]>(() =>
  props.moveTargets.map((target) => ({ label: target.title, key: `move-ws:${target.id}` })),
);
```

`menuOptions` 改为（整体替换 172-195 行）：

```ts
const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value?.tagId) {
    return moveMenuChildren.value.length > 0
      ? [{
          label: uiText.value.common.moveToWorkspace,
          key: "move-tag",
          icon: renderIcon(SwapHorizontalOutline),
          children: moveMenuChildren.value,
        }]
      : [];
  }
  const button = props.buttons.find((item) => item.id === menu.value?.id);
  if (!menu.value?.id) {
    return [
      { label: uiText.value.quick.add, key: "add", icon: renderIcon(AddOutline) },
      { label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) },
      { label: props.showHidden ? uiText.value.quick.hideHidden : uiText.value.quick.showHidden, key: "toggle-show-hidden", icon: renderIcon(props.showHidden ? EyeOffOutline : EyeOutline) },
      { label: uiText.value.quick.tagManage, key: "manage-tags", icon: renderIcon(PricetagsOutline) },
      { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
    ];
  }
  return [
    { label: uiText.value.common.edit, key: "edit", icon: renderIcon(CreateOutline) },
    { label: button?.hidden ? uiText.value.quick.show : uiText.value.quick.hide, key: "toggle-hidden", icon: renderIcon(button?.hidden ? EyeOutline : EyeOffOutline) },
    ...(button?.type === "link"
      ? [
          { label: uiText.value.quick.copyText, key: "copy-text", icon: renderIcon(DocumentTextOutline) },
          { label: uiText.value.quick.copyLink, key: "copy-link", icon: renderIcon(CopyOutline) },
        ]
      : []),
    ...(moveMenuChildren.value.length > 0
      ? [{
          label: uiText.value.common.moveToWorkspace,
          key: "move-button",
          icon: renderIcon(SwapHorizontalOutline),
          children: moveMenuChildren.value,
        }]
      : []),
    { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline, true) },
    { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
  ];
});
```

图标 import（第 5 行）加入 `SwapHorizontalOutline`。

3e. `handleMenuSelect`（414 行起）：把开头的解构改为

```ts
  const { id, anchor, tagTitle, tagId } = menu.value;
```

并在 `closeMenu();` 之后、`if (key === "add")` 之前插入：

```ts
  if (key.startsWith("move-ws:")) {
    const workspaceId = key.slice("move-ws:".length);
    if (tagId) emit("moveTagToWorkspace", tagId, workspaceId);
    else if (id) emit("moveButtonToWorkspace", id, workspaceId);
    return;
  }
```

3f. 新增标签头右键处理（放在 `openAreaMenu` 旁边）：

```ts
/** 标签头右键：仅真实标签提供「移动到空间」；其他目标回落到区域菜单。 */
function openTagMenu(event: MouseEvent, tagId: string): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea")) return;
  if (!isRealTagGroup(tagId)) return;
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, tagId };
}
```

3g. template：`.quick-tag-heading` 的 div（743-753 行）加一个事件（放在 `@dblclick` 旁边）：

```html
              @contextmenu="openTagMenu($event, group.id)"
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/quick-buttons.test.ts`
Expected: PASS（含既有用例）。

- [ ] **Step 5: 提交**

```bash
git add src/components/QuickButtons.vue src/__tests__/quick-buttons.test.ts
git commit -m "feat: 快捷按钮与标签右键菜单支持移动到其他空间"
```

---

### Task 9: TodoPanel 右键移动菜单

**Files:**
- Modify: `src/components/TodoPanel.vue`（props/emits/menuOptions/handleMenuSelect）
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/todo-panel.test.ts` 末尾追加（`menuDropdownStub` 同 Task 8 定义，直接复制一份到本文件）：

```ts
describe("TodoPanel 跨空间移动菜单", () => {
  const moveTargets = [
    { id: "ws-b", title: "B 空间", lists: [{ id: "list-b1", title: "清单一" }] },
    { id: "ws-c", title: "C 空间", lists: [] },
  ];

  function mountMovePanel(todos: TodoMap) {
    return mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos,
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
        moveTargets,
      },
      global: {
        stubs: {
          Dropdown: menuDropdownStub,
          NDatePicker: datePickerStub,
          NDropdown: menuDropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });
  }

  it("条目右键：空间 → 列表 三级选择后 emit", async () => {
    const wrapper = mountMovePanel({ morning: [{ id: "todo-1", text: "任务", done: false }], noon: [], evening: [] });
    await wrapper.get(".todo-item").trigger("contextmenu");
    await wrapper.get('[data-key="move-todo:ws-b:list-b1"]').trigger("click");
    expect(wrapper.emitted("moveTodoToWorkspace")?.[0]).toEqual(["morning", "todo-1", "ws-b", "list-b1"]);
    wrapper.unmount();
  });

  it("无列表的目标空间整组禁用", async () => {
    const wrapper = mountMovePanel({ morning: [{ id: "todo-1", text: "任务", done: false }], noon: [], evening: [] });
    await wrapper.get(".todo-item").trigger("contextmenu");
    const option = wrapper.get('[data-key="move-todo-ws:ws-c"]');
    expect((option.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it("列表右键（sectionActions）emit 移动列表", async () => {
    const wrapper = mountMovePanel({ morning: [{ id: "todo-1", text: "任务", done: false }], noon: [], evening: [] });
    await wrapper.get(".todo-section").trigger("contextmenu");
    await wrapper.get('[data-key="move-list-ws:ws-b"]').trigger("click");
    expect(wrapper.emitted("moveListToWorkspace")?.[0]).toEqual(["morning", "ws-b"]);
    wrapper.unmount();
  });

  it("只剩一个列表时移动项禁用", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: [{ id: "morning", title: "☀️ 早上", collapsed: false, compact: false }],
        todos: { morning: [{ id: "todo-1", text: "任务", done: false }] },
        showCompleted: { morning: false },
        titles: DEFAULT_TITLES,
        moveTargets,
      },
      global: {
        stubs: {
          Dropdown: menuDropdownStub,
          NDatePicker: datePickerStub,
          NDropdown: menuDropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });
    await wrapper.get(".todo-section").trigger("contextmenu");
    const option = wrapper.get('[data-key="move-list"]');
    expect((option.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/todo-panel.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`src/components/TodoPanel.vue`：

3a. props 加字段（54-65 行）：

```ts
const props = withDefaults(defineProps<{
  todoLists?: TodoListConfig[];
  todos: TodoMap;
  titles: Record<string, string>;
  showCompleted?: TodoCompletedVisibility;
  editListId?: TodoListId | null;
  notificationFlashKeys?: string[];
  language?: AppLanguage;
  moveTargets?: WorkspaceMoveTarget[];
}>(), {
  notificationFlashKeys: () => [],
  language: "zh",
  moveTargets: () => [],
});
```

（types import 加入 `WorkspaceMoveTarget`。）

3b. emits（67-92 行）追加：

```ts
  moveListToWorkspace: [listId: TodoListId, workspaceId: string];
  moveTodoToWorkspace: [period: TodoPeriod, todoId: string, workspaceId: string, listId: TodoListId];
```

3c. 图标 import（4-20 行）加 `SwapHorizontalOutline`。

3d. `menuOptions`（179-213 行）整体替换为：

```ts
const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value?.sectionActions) {
    const list = getListById(menu.value.period);
    if (!list) return [guideMenuOption.value];
    return [
      { label: uiText.value.todo.clearCompleted, key: "clear-completed", icon: renderIcon(CheckmarkDoneOutline) },
      { label: isCompletedVisible(list.id) ? uiText.value.todo.hideCompleted : uiText.value.todo.showCompleted, key: "toggle-completed", icon: renderIcon(isCompletedVisible(list.id) ? EyeOffOutline : EyeOutline) },
      { label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) },
      { label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(AddOutline) },
      { label: uiText.value.todo.editList, key: "edit-list", icon: renderIcon(CreateOutline) },
      ...buildListMoveOptions(),
      { label: uiText.value.todo.deleteList, key: "delete-list", disabled: effectiveTodoLists.value.length <= 1, icon: renderIcon(TrashOutline, true) },
      { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
    ];
  }
  const options: DropdownOption[] = [];
  const todo = getMenuTodo();
  if (!menu.value?.id) {
    options.push({ label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(AddOutline) });
  }
  if (menu.value?.id) {
    options.push({ label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) });
    if (menu.value.target && canPasteTodoText(menu.value.period, menu.value.id, menu.value.target)) {
      options.push({ label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) });
    }
    options.push({
      label: isValidDeadlineAt(todo?.notifyAt) ? uiText.value.todo.editNotify : uiText.value.todo.setNotify,
      key: "notify",
      icon: renderIcon(NotificationsOutline),
    });
    options.push({ label: todo?.starred ? uiText.value.todo.unstar : uiText.value.todo.star, key: "star", icon: renderIcon(todo?.starred ? Star : StarOutline) });
    options.push(...buildTodoMoveOptions());
    options.push({ label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline, true) });
  }
  options.push({ ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) });
  return options;
});

/** 列表级「移动到空间」子菜单；仅一个列表时禁用，无目标空间时不渲染。 */
function buildListMoveOptions(): DropdownOption[] {
  if (props.moveTargets.length === 0) return [];
  return [{
    label: uiText.value.common.moveToWorkspace,
    key: "move-list",
    icon: renderIcon(SwapHorizontalOutline),
    disabled: effectiveTodoLists.value.length <= 1,
    children: props.moveTargets.map((target) => ({ label: target.title, key: `move-list-ws:${target.id}` })),
  }];
}

/** 条目级「移动到空间 → 列表」三级子菜单；无目标空间时不渲染。 */
function buildTodoMoveOptions(): DropdownOption[] {
  if (props.moveTargets.length === 0) return [];
  return [{
    label: uiText.value.common.moveToWorkspace,
    key: "move-todo",
    icon: renderIcon(SwapHorizontalOutline),
    children: props.moveTargets.map((target) => ({
      label: target.title,
      key: `move-todo-ws:${target.id}`,
      disabled: target.lists.length === 0,
      children: target.lists.map((list) => ({ label: list.title, key: `move-todo:${target.id}:${list.id}` })),
    })),
  }];
}
```

3e. `handleMenuSelect`（1074 行起）：在开头解构 `{ period, id, anchor, target, x, y }` 之后、`if (key === "edit-list")` 之前插入：

```ts
  if (key.startsWith("move-list-ws:")) {
    closeMenu();
    emit("moveListToWorkspace", period, key.slice("move-list-ws:".length));
    return;
  }
  if (key.startsWith("move-todo:")) {
    const [, workspaceId, listId] = key.split(":");
    closeMenu();
    if (id && workspaceId && listId) emit("moveTodoToWorkspace", period, id, workspaceId, listId);
    return;
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/todo-panel.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/TodoPanel.vue src/__tests__/todo-panel.test.ts
git commit -m "feat: 提醒条目与列表右键菜单支持移动到其他空间"
```

---

### Task 10: SpacePanel 右键移动菜单

**Files:**
- Modify: `src/components/SpacePanel.vue`
- Test: `src/__tests__/space-panel.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/space-panel.test.ts` 末尾追加（`dropdownStub` 已在文件顶部；它不渲染 children，本组测试定义 children 版本）：

```ts
const menuDropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: `
    <div>
      <slot />
      <template v-for="option in options" :key="option.key">
        <button
          class="dropdown-option"
          :data-key="option.key"
          :disabled="option.disabled"
          type="button"
          @click="!option.disabled && $emit('select', option.key)"
        >{{ option.label }}</button>
        <button
          v-for="child in option.children ?? []"
          :key="child.key"
          class="dropdown-option"
          :data-key="child.key"
          :disabled="child.disabled"
          type="button"
          @click="!child.disabled && $emit('select', child.key)"
        >{{ child.label }}</button>
      </template>
    </div>
  `,
};

describe("SpacePanel 跨空间移动", () => {
  function mountWithTargets(spaces: WorkspaceSpace[], moveTargets: { id: string; title: string; lists: { id: string; title: string }[] }[]) {
    return mount(SpacePanel, {
      props: { spaces, activeSpaceId: spaces[0].id, moveTargets },
      global: { stubs: { Dropdown: menuDropdownStub, NDropdown: menuDropdownStub } },
    });
  }

  it("Tab 右键菜单可移动到其他空间", async () => {
    const wrapper = mountWithTargets(
      [
        { id: "workspace", title: "工作空间", lines: [] },
        { id: "project", title: "项目", lines: [] },
      ],
      [{ id: "ws-b", title: "B 空间", lists: [] }],
    );
    await wrapper.findAll(".space-tab")[1].trigger("contextmenu");
    await wrapper.get('[data-key="move-ws:ws-b"]').trigger("click");
    expect(wrapper.emitted("moveSpaceToWorkspace")?.[0]).toEqual(["project", "ws-b"]);
    wrapper.unmount();
  });

  it("只剩一个便签时移动项禁用", async () => {
    const wrapper = mountWithTargets(
      [{ id: "workspace", title: "工作空间", lines: [] }],
      [{ id: "ws-b", title: "B 空间", lists: [] }],
    );
    await wrapper.get(".space-tab").trigger("contextmenu");
    const option = wrapper.get('[data-key="move"]');
    expect((option.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it("没有其他空间时不渲染移动项", async () => {
    const wrapper = mountWithTargets(
      [
        { id: "workspace", title: "工作空间", lines: [] },
        { id: "project", title: "项目", lines: [] },
      ],
      [],
    );
    await wrapper.get(".space-tab").trigger("contextmenu");
    expect(wrapper.findAll('[data-key="move"]')).toHaveLength(0);
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/space-panel.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`src/components/SpacePanel.vue`：

3a. import 加图标与类型：

```ts
import { CreateOutline, SwapHorizontalOutline, TrashOutline } from "@vicons/ionicons5";
```

types import 加入 `WorkspaceMoveTarget`。

3b. props（14-21 行）：

```ts
const props = withDefaults(defineProps<{
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  editSpaceId?: string | null;
  language?: AppLanguage;
  moveTargets?: WorkspaceMoveTarget[];
}>(), {
  language: "zh",
  moveTargets: () => [],
});
```

3c. emits 追加：

```ts
  moveSpaceToWorkspace: [spaceId: string, workspaceId: string];
```

3d. `menuOptions`（62-65 行）替换为：

```ts
const menuOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [
    { label: uiText.value.common.rename, key: "edit", icon: renderIcon(CreateOutline) },
  ];
  if (props.moveTargets.length > 0) {
    options.push({
      label: uiText.value.common.moveToWorkspace,
      key: "move",
      icon: renderIcon(SwapHorizontalOutline),
      disabled: props.spaces.length <= 1,
      children: props.moveTargets.map((target) => ({ label: target.title, key: `move-ws:${target.id}` })),
    });
  }
  options.push({ label: uiText.value.common.delete, key: "delete", disabled: !canDeleteSpaces.value, icon: renderIcon(TrashOutline, true) });
  return options;
});
```

3e. `handleMenuSelect`（177-186 行）替换为：

```ts
function handleMenuSelect(key: string): void {
  const current = menu.value;
  if (!current) return;
  closeMenu();
  if (key === "edit") {
    startTabEdit(current.spaceId);
    return;
  }
  if (key.startsWith("move-ws:")) {
    emit("moveSpaceToWorkspace", current.spaceId, key.slice("move-ws:".length));
    return;
  }
  if (key === "delete" && canDeleteSpaces.value) emit("delete", current.spaceId);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/space-panel.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/SpacePanel.vue src/__tests__/space-panel.test.ts
git commit -m "feat: 便签 Tab 右键菜单支持移动到其他空间"
```

---

### Task 11: App.vue 接线

**Files:**
- Modify: `src/App.vue`（import、computed、5 个处理函数、template 3 处面板）

- [ ] **Step 1: import**

- 在 `src/App.vue` 现有 `./state/i18n` 的 import 里加入 `getDisplayTodoListTitle`（该 import 已含 `getUiText` 等；若没有就从 `"./state/i18n"` 新增一行 import）。
- 在现有 `./types` 的 type import 里加入 `WorkspaceMoveTarget`。
- 新增模块导入（放在 `./state/workspaces` import 附近）：

```ts
import * as workspaceMover from "./state/workspaceMoves";
```

- [ ] **Step 2: moveTargets computed**

放在 `activeWorkspace` computed（约 100-103 行）之后：

```ts
/** 右键「移动到空间」子菜单的目标（已排除当前空间；标题与切换器一致）。 */
const workspaceMoveTargets = computed<WorkspaceMoveTarget[]>(() =>
  state.workspaces
    .filter((workspace) => workspace.id !== state.activeWorkspaceId)
    .map((workspace) => ({
      id: workspace.id,
      title: workspace.customTitles["board-title"]?.trim() || DEFAULT_BOARD_TITLE,
      lists: workspace.todoLists.map((list) => ({ id: list.id, title: getDisplayTodoListTitle(list, state.language) })),
    })),
);
```

（`DEFAULT_BOARD_TITLE` 已在 App.vue 导入并在 `createWorkspace` 使用。）

- [ ] **Step 3: 5 个处理函数**

放在 `reorderSpaces`（591-595 行）之后：

```ts
function applyWorkspaceMove(next: WorkspaceData[]): void {
  if (next === state.workspaces) return;
  state.workspaces = next;
  persistNow();
}

function moveQuickButtonAcrossWorkspaces(buttonId: string, workspaceId: string): void {
  applyWorkspaceMove(workspaceMover.moveQuickButtonToWorkspace(state.workspaces, state.activeWorkspaceId, buttonId, workspaceId));
}

function moveQuickTagAcrossWorkspaces(tagId: string, workspaceId: string): void {
  applyWorkspaceMove(workspaceMover.moveQuickTagToWorkspace(state.workspaces, state.activeWorkspaceId, tagId, workspaceId));
}

function moveTodoListAcrossWorkspaces(listId: TodoListId, workspaceId: string): void {
  if (displayTodoLists.length <= 1) {
    showBubbleText(uiText.value.app.keepOneTodoList);
    return;
  }
  applyWorkspaceMove(workspaceMover.moveTodoListToWorkspace(state.workspaces, state.activeWorkspaceId, listId, workspaceId));
}

function moveTodoAcrossWorkspaces(period: TodoPeriod, todoId: string, workspaceId: string, listId: TodoListId): void {
  applyWorkspaceMove(workspaceMover.moveTodoToWorkspace(state.workspaces, state.activeWorkspaceId, period, todoId, workspaceId, listId));
}

function moveSpaceAcrossWorkspaces(spaceId: string, workspaceId: string): void {
  if (activeWorkspace.value.spaces.length <= 1) {
    showBubbleText(uiText.value.app.keepOneSpace);
    return;
  }
  const next = workspaceMover.moveSpaceToWorkspace(state.workspaces, state.activeWorkspaceId, spaceId, workspaceId);
  if (next === state.workspaces) return;
  if (pendingEditSpaceId.value === spaceId) pendingEditSpaceId.value = null;
  state.workspaces = next;
  syncLegacySpaceLines();
  persistNow();
}
```

（`WorkspaceData` 若未在 App.vue 的 types import 中，加进去；`TodoListId`、`TodoPeriod` 已在使用。）

- [ ] **Step 4: template 三处面板**

`<QuickButtons>`（2984-3007 行）加 prop 与事件：

```html
          :language="state.language"
          :move-targets="workspaceMoveTargets"
```

```html
          @move-button-to-workspace="moveQuickButtonAcrossWorkspaces"
          @move-tag-to-workspace="moveQuickTagAcrossWorkspaces"
```

`<TodoPanel>`（3011-3043 行）：

```html
          :language="state.language"
          :move-targets="workspaceMoveTargets"
```

```html
          @move-list-to-workspace="moveTodoListAcrossWorkspaces"
          @move-todo-to-workspace="moveTodoAcrossWorkspaces"
```

`<SpacePanel>`（3047-3063 行）：

```html
          :language="state.language"
          :move-targets="workspaceMoveTargets"
```

```html
          @move-space-to-workspace="moveSpaceAcrossWorkspaces"
```

- [ ] **Step 5: 全量验证**

Run: `npm test`
Expected: PASS（App 渲染测试 `app-render.test.ts` 等不受影响——`moveTargets` 有默认空数组）。

Run: `npm run build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 6: 提交**

```bash
git add src/App.vue
git commit -m "feat: 接线跨空间移动（工作空间状态、目标列表与气泡守卫）"
```

---

### Task 12: 全量回归与手动验证清单

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 手动验证（npm run dev，≥2 个空间）**

1. 提醒事项：点击进入编辑 → Ctrl+←/→ 跳行首行尾；Ctrl+↑/↓ 上下移动顺序且光标跟随；今日聚焦区 Ctrl+↑↓ 仅移动焦点。
2. 便签：上一行无标记/空行时 Tab → 缩进 + `- `；上一行有序号时 Tab → 继承标记；Shift+Tab 行为不变。
3. 右键快捷按钮/标签头/提醒条目/提醒列表头/便签 Tab → 「移动到空间」子菜单 → 移动后切到目标空间核对内容、Ctrl+Z 可撤销。
4. 守卫：单列表空间右键列表 → 移动项禁用；单便签空间 → 禁用。

- [ ] **Step 4: 遗留 Minor 批量处理（历次审查 deferred，酌情处理）**

1. `src/utils/textEditor.ts` ~184 行 `true` → `!outdent`（与分支语义对称）。
2. `src/__tests__/text-panel.test.ts` ~344 行测试名改为与新 Tab 语义一致。
3. text-editor 可选补测：上一行有标记且光标在行中的用例。
4. `workspaceMoves.ts` 可选补测 no-op 分支：`moveTodoToWorkspace` 未知 todoId、`moveTodoListToWorkspace` 未知 listId（均应返回原引用）；`movedVisibility === undefined` 时目标可见性原样保留；`moveSpaceToWorkspace` 未知 spaceId 原引用、激活且为首空间（index 0 钳位）时源切到第一个剩余空间。
5. `workspaceMoves.test.ts` ~167 行断言可读性：`const [, movedList] = to.todoLists` 后断言 `to.todos[movedList.id]`，替换 `id &&` 写法。
6. `workspaceMoves.ts` ~99 行 `takenButtonIds` Set 在 uniqueIdAmong 改写后成为摆设（助手每次 `[...]` 摊平线性扫）：改传 `to.quickButtons.map((item) => item.id)` 并删 Set 行，行为不变。
7. `moveSpaceToWorkspace` JSDoc 补对称句：默认空间共享 `workspace` id，天然互撞，重生成是预期路径（与列表函数的补句对称）。

- [ ] **Step 5: 收尾提交（如有修正）**

```bash
git add -A && git commit -m "fix: 跨空间移动与快捷键手动验证修正"
```

# 多工作空间（Multi-Workspace）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Mini Desk 支持多个独立「工作空间」——每个空间有独立的图片、快捷动作、提醒事项、备忘录、标题与 slogan；左上角标题区变为切换器，可查看/切换/新增/重命名/删除/排序工作空间；导出支持单空间或全量，导入按文件形状分流。

**Architecture:** 单 `localStorage` key 嵌套：顶层 `BoardState` 持有全局偏好（theme/language/companion GIF）+ `workspaces: WorkspaceData[]` + `activeWorkspaceId`；每个 `WorkspaceData` 持有原 BoardState 的全部「内容」字段。运行时用 `activeWorkspace` computed 投影当前空间，`state.*` 的内容读写改走 `activeWorkspace.value.*`（单真源、无双重账本）。`vue-tsc` 作为机械改写的确定性向导。

**Tech Stack:** Vue 3 (`<script setup>`) + TypeScript + Naive UI + Vitest + jsdom + Vite。

**Spec:** `docs/superpowers/specs/2026-08-02-multi-workspace-design.md`

---

## 文件结构总览

- **Create**
  - `src/state/workspaces.ts` — 工作空间纯函数助手（创建/去重/删除/排序），可单测。
  - `src/components/WorkspaceSwitcher.vue` — 标题切换器（触发按钮 + 下拉面板 + 新建/重命名表单）。
  - `src/__tests__/workspaces.test.ts` — 助手函数单测。
  - `src/__tests__/workspace-switcher.test.ts` — 组件测试。
- **Modify**
  - `src/types.ts` — 新增 `WorkspaceData`，重塑 `BoardState`。
  - `src/state/defaults.ts` — `defaultWorkspace()` + 新 `defaultState()` + `DEFAULT_WORKSPACE_ID`。
  - `src/state/storage.ts` — `getSerializableWorkspace`/`getSerializableState`/`normalizeImportedState`/`normalizeWorkspaceData`/`saveStateWithConflictCheck` 改为嵌套模型。
  - `src/state/i18n.ts` — 新增 zh/en 文案键。
  - `src/state/messages.ts` — 新增 MessageKey（`confirmDeleteWorkspace`/`deleteWorkspace`/`confirmImportWorkspace`）。
  - `src/App.vue` — `activeWorkspace` computed + 内容字段迁移 + 图片持久化 + 工作空间 CRUD 接线 + 导入导出三路。
  - `src/components/WorkbenchShell.vue` — 标题区改为 `#workspace-trigger` 插槽，slogan 静态化。
  - `src/components/SettingsMenu.vue` — 新增「导出当前空间」选项与 emit。
  - `src/__tests__/state.test.ts`、`storage-key-migration.test.ts`、`app-render.test.ts`、`workbench-shell.test.ts` 等 — 适配新 shape。

---

## Task 1: 基础状态模型重构（types + defaults + storage）

> 这是地基。type 变更会一次性破坏现有测试，故本任务以「先加新测试 → 实现 → 修复存量测试」推进，最后整任务一次提交。

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/defaults.ts`
- Modify: `src/state/storage.ts`
- Modify: `src/__tests__/state.test.ts`
- Modify: `src/__tests__/storage-key-migration.test.ts`

- [ ] **Step 1: 在 `src/types.ts` 重塑类型**

在 `WorkspaceSpace` 接口之后新增 `WorkspaceData`，并改写 `BoardState`：

```ts
export interface WorkspaceData {
  id: string;
  createdAt: number;
  customTitles: Record<string, string>;
  noteLines: LineItem[];
  workspaceLines: LineItem[];
  storageLines: LineItem[];
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  images: StoredImage[];
  quickTags: QuickTag[];
  quickButtons: QuickButton[];
  quickOtherCollapsed: boolean;
  showHiddenQuickButtons: boolean;
  todoLists: TodoListConfig[];
  showCompletedTodos: TodoCompletedVisibility;
  todos: TodoMap;
}

export interface BoardState {
  sync: BoardSyncState;
  language: AppLanguage;
  theme: ThemeMode;
  companionGifTheme: CompanionGifTheme;
  customCompanionGif: CompanionCustomGif;
  customCompanionGifStored: CompanionCustomGifStored;
  workspaces: WorkspaceData[];
  activeWorkspaceId: string;
}
```

（从 `BoardState` 删除原先的 `customTitles`/`noteLines`/`workspaceLines`/`storageLines`/`spaces`/`activeSpaceId`/`images`/`quickTags`/`quickButtons`/`quickOtherCollapsed`/`showHiddenQuickButtons`/`todoLists`/`showCompletedTodos`/`todos` —— 它们现在属于 `WorkspaceData`。）

- [ ] **Step 2: 改写 `src/state/defaults.ts`**

在 `DEFAULT_SPACE_ID` 等常量旁新增，并重构 `defaultState`：

```ts
import type { BoardState, TodoListConfig, TodoListId, TodoMap, WorkspaceData } from "../types";

export const DEFAULT_WORKSPACE_ID = "default";

export function defaultWorkspace(id: string = DEFAULT_WORKSPACE_ID): WorkspaceData {
  return {
    id,
    createdAt: 0,
    customTitles: {},
    noteLines: [],
    workspaceLines: [],
    storageLines: [],
    spaces: [{ id: DEFAULT_SPACE_ID, title: DEFAULT_SPACE_TITLE, lines: [] }],
    activeSpaceId: DEFAULT_SPACE_ID,
    images: [],
    quickTags: [],
    quickButtons: [],
    quickOtherCollapsed: false,
    showHiddenQuickButtons: false,
    todoLists: cloneDefaultTodoLists(),
    showCompletedTodos: createDefaultCompletedVisibility(),
    todos: createDefaultTodoMap(),
  };
}

export function defaultState(): BoardState {
  return {
    sync: { revision: 0, updatedAt: 0, clientId: "" },
    language: DEFAULT_LANGUAGE,
    theme: "light",
    companionGifTheme: DEFAULT_COMPANION_GIF_THEME,
    customCompanionGif: {},
    customCompanionGifStored: {},
    workspaces: [defaultWorkspace(DEFAULT_WORKSPACE_ID)],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  };
}
```

（`cloneDefaultTodoLists`/`createDefaultCompletedVisibility`/`createDefaultTodoMap` 已存在，保持不变。）

- [ ] **Step 3: 在 `src/state/storage.ts` 重构序列化**

在 `storage.ts` 顶部 import 中加入 `WorkspaceData` 与 `DEFAULT_WORKSPACE_ID`（来自 `./defaults`），并新增 `DEFAULT_LANGUAGE` import（来自 `./i18n`，用于 `normalizeWorkspaceData` 默认语言）。然后用以下内容替换现有 `getSerializableState`：

```ts
export function getSerializableWorkspace(
  workspace: WorkspaceData,
  options: SerializableOptions = {},
): WorkspaceData {
  const todoLists = cloneTodoLists(workspace.todoLists);
  return {
    id: workspace.id,
    createdAt: workspace.createdAt,
    customTitles: { ...workspace.customTitles },
    noteLines: cloneLines(workspace.noteLines),
    workspaceLines: cloneLines(workspace.workspaceLines),
    storageLines: cloneLines(workspace.storageLines),
    spaces: cloneSpaces(workspace.spaces),
    activeSpaceId: workspace.spaces.some((space) => space.id === workspace.activeSpaceId)
      ? workspace.activeSpaceId
      : workspace.spaces[0]?.id ?? DEFAULT_SPACE_ID,
    images: workspace.images.map((image) => {
      if (options.includeImageData) return { ...image };
      return {
        id: image.id,
        ...(image.payloadId ? { payloadId: image.payloadId } : {}),
        createdAt: image.createdAt,
        ...(image.displayWidth ? { displayWidth: image.displayWidth } : {}),
        ...(image.displayHeight ? { displayHeight: image.displayHeight } : {}),
      };
    }),
    todoLists,
    showCompletedTodos: cloneCompletedVisibility(workspace.showCompletedTodos, todoLists),
    todos: cloneTodos(workspace.todos, todoLists),
    quickTags: cloneQuickTags(workspace.quickTags),
    quickButtons: workspace.quickButtons.map((button) => ({ ...button })),
    quickOtherCollapsed: workspace.quickOtherCollapsed,
    showHiddenQuickButtons: workspace.showHiddenQuickButtons,
  };
}

export function getSerializableState(
  state: BoardState,
  options: SerializableOptions = {},
): BoardState {
  return {
    sync: { ...normalizeSyncState(state.sync) },
    language: state.language,
    theme: state.theme,
    companionGifTheme: state.companionGifTheme,
    customCompanionGif: options.includeCustomGifData ? cloneCustomCompanionGif(state.customCompanionGif) : {},
    customCompanionGifStored: getCustomCompanionGifStoredState(state.customCompanionGif, state.customCompanionGifStored),
    workspaces: state.workspaces.map((workspace) => getSerializableWorkspace(workspace, options)),
    activeWorkspaceId: state.workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : state.workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID,
  };
}
```

- [ ] **Step 4: 在 `src/state/storage.ts` 重构 `normalizeImportedState`**

替换整个 `normalizeImportedState` 函数，并新增三个辅助函数：

```ts
export function normalizeImportedState(payload: unknown): BoardState {
  const source = isPlainObject(payload) ? payload : {};
  const typed = source as Record<string, unknown>;
  const base = defaultState();
  const language = normalizeLanguage(typed.language);

  const shared = {
    sync: normalizeSyncState(typed.sync),
    language,
    theme: typed.theme === "dark" ? "dark" : "light",
    companionGifTheme: normalizeCompanionGifTheme(typed.companionGifTheme),
    customCompanionGif: normalizeCustomCompanionGif(typed.customCompanionGif),
    customCompanionGifStored: normalizeCustomCompanionGifStored(typed.customCompanionGifStored, typed.customCompanionGif),
  };

  if (Array.isArray(typed.workspaces)) {
    const workspaces = normalizeWorkspaceList(typed.workspaces, language);
    return {
      ...base,
      ...shared,
      workspaces,
      activeWorkspaceId: normalizeActiveWorkspaceId(typed.activeWorkspaceId, workspaces),
    };
  }

  const workspace = normalizeLegacyWorkspace(typed, language);
  return {
    ...base,
    ...shared,
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
  };
}

export function normalizeWorkspaceData(item: unknown, language: AppLanguage = DEFAULT_LANGUAGE): WorkspaceData {
  const typed = isPlainObject(item) ? (item as Record<string, unknown>) : {};
  const customTitles = normalizeCustomTitles(typed.customTitles);
  const noteLines = normalizeLineCollection(typed.noteLines ?? typed.note);
  const workspaceLines = normalizeLineCollection(typed.workspaceLines ?? typed.workspace);
  const storageLines = normalizeLineCollection(typed.storageLines ?? typed.storage);
  const spaces = normalizeSpaces(typed.spaces, workspaceLines, storageLines, customTitles);
  const todoLists = normalizeTodoLists(typed.todoLists, customTitles, typed.todos, typed.showCompletedTodos);
  const quickTags = normalizeQuickTags(typed.quickTags);
  const id = typeof typed.id === "string" && typed.id.trim() ? typed.id.trim() : createId();
  const createdAt = typeof typed.createdAt === "number" && Number.isFinite(typed.createdAt) ? typed.createdAt : 0;
  return {
    id,
    createdAt,
    customTitles,
    noteLines,
    workspaceLines,
    storageLines,
    spaces,
    activeSpaceId: normalizeActiveSpaceId(typed.activeSpaceId, spaces),
    images: normalizeImages(typed.images),
    quickTags,
    quickButtons: normalizeQuickButtons(typed.quickButtons, language, quickTags),
    quickOtherCollapsed: Boolean(typed.quickOtherCollapsed),
    showHiddenQuickButtons: Boolean(typed.showHiddenQuickButtons),
    todoLists,
    showCompletedTodos: normalizeCompletedVisibility(typed.showCompletedTodos, todoLists),
    todos: normalizeTodos(typed.todos, todoLists),
  };
}

function normalizeWorkspaceList(value: unknown, language: AppLanguage): WorkspaceData[] {
  if (!Array.isArray(value)) return [defaultWorkspace()];
  const seen = new Set<string>();
  const workspaces = value
    .map((item) => normalizeWorkspaceData(item, language))
    .map((workspace) => {
      let id = workspace.id;
      while (seen.has(id)) id = createId();
      seen.add(id);
      return { ...workspace, id };
    });
  return workspaces.length > 0 ? workspaces : [defaultWorkspace()];
}

function normalizeLegacyWorkspace(typed: Record<string, unknown>, language: AppLanguage): WorkspaceData {
  const workspace = normalizeWorkspaceData(typed, language);
  const sync = isPlainObject(typed.sync) ? (typed.sync as Record<string, unknown>) : {};
  const updatedAt = typeof sync.updatedAt === "number" && Number.isFinite(sync.updatedAt) ? sync.updatedAt : 0;
  return { ...workspace, id: DEFAULT_WORKSPACE_ID, createdAt: updatedAt };
}
```

> 说明：`normalizeWorkspaceData` 复用了全部现有 `normalize*` 辅助函数（`normalizeCustomTitles`/`normalizeLineCollection`/`normalizeSpaces`/`normalizeActiveSpaceId`/`normalizeImages`/`normalizeQuickTags`/`normalizeQuickButtons`/`normalizeTodoLists`/`normalizeCompletedVisibility`/`normalizeTodos`），它们保持不变。注意 `normalizeActiveSpaceId` 的签名是 `(value, spaces)`，此处复用（它原本作用于子 `spaces`，语义一致）。

在 `storage.ts` 顶部补充 import：

```ts
import { DEFAULT_SPACE_ID, DEFAULT_WORKSPACE_ID, LEGACY_STORAGE_KEY, defaultState, STORAGE_KEY, defaultWorkspace } from "./defaults";
import { DEFAULT_LANGUAGE, ...其余现有 i18n import 不变 } from "./i18n";
import type { ..., WorkspaceData } from "../types";
```

- [ ] **Step 5: 改写 `saveStateWithConflictCheck` 的 images 合并分支**

把 images-scope 分支改为在「活动工作空间」内合并。在文件中新增两个辅助函数，并替换分支体：

```ts
function findWorkspace(state: BoardState): WorkspaceData | undefined {
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0];
}

function replaceWorkspaceImages(state: BoardState, workspaceId: string, images: StoredImage[]): BoardState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId ? { ...workspace, images } : workspace,
    ),
  };
}
```

把 `saveStateWithConflictCheck` 中 `if (scope === "images") { ... }` 整段替换为：

```ts
    if (scope === "images") {
      const localWorkspace = findWorkspace(local);
      const currentWorkspace = findWorkspace(current);
      if (
        !localWorkspace
        || !currentWorkspace
        || (options.imageReplacement
          && !canMergeImageReplacement(currentWorkspace.images, localWorkspace.images, options.imageReplacement))
      ) {
        return { status: "conflict", state: current };
      }
      const mergedImages = mergeImageAdditions(
        currentWorkspace.images,
        localWorkspace.images,
        options.imagePlacement,
        options.imageReplacement,
      );
      const merged = replaceWorkspaceImages(current, currentWorkspace.id, mergedImages);
      const saved = writeSyncedState(merged, storage, {
        clientId: options.clientId,
        now: options.now,
        revision: currentRevision + 1,
      });
      return { status: "merged", state: saved };
    }
```

- [ ] **Step 6: 新增多工作空间的失败测试（RED）**

在 `src/__tests__/state.test.ts` 顶部 import 中加入 `defaultWorkspace`，并在 `describe("state compatibility", ...)` 块末尾追加：

```ts
  it("defaultState 提供一个默认工作空间", () => {
    const state = defaultState();

    expect(state.workspaces).toHaveLength(1);
    expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);
    expect(state.workspaces[0].spaces).toEqual([{ id: "workspace", title: "📝 备忘录", lines: [] }]);
    expect(state.workspaces[0].todoLists.map((list) => list.id)).toEqual(["morning"]);
  });

  it("把旧扁平数据迁移进单个工作空间", () => {
    const state = normalizeImportedState({
      language: "en",
      note: "idea",
      images: [{ id: "img-1", createdAt: 1 }],
      todos: { morning: [{ id: "a", text: "A", done: false }] },
    });

    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0].id).toBe("default");
    expect(state.workspaces[0].noteLines).toEqual([{ text: "idea", indent: 0 }]);
    expect(state.workspaces[0].images.map((image) => image.id)).toEqual(["img-1"]);
    expect(state.workspaces[0].todos.morning.map((todo) => todo.text)).toEqual(["A"]);
    expect(state.activeWorkspaceId).toBe("default");
  });

  it("规范化多工作空间结构并回退非法 activeWorkspaceId", () => {
    const state = normalizeImportedState({
      workspaces: [
        { id: "ws-a", customTitles: { "board-title": "A" }, noteLines: [{ text: "a", indent: 0 }] },
        { id: "ws-a", customTitles: { "board-title": "重复" } },
      ],
      activeWorkspaceId: "missing",
    });

    expect(state.workspaces).toHaveLength(2);
    expect(state.workspaces[0].id).toBe("ws-a");
    expect(state.workspaces[1].id).not.toBe("ws-a");
    expect(state.activeWorkspaceId).toBe("ws-a");
    expect(state.workspaces[0].customTitles["board-title"]).toBe("A");
  });

  it("序列化时为每个工作空间剥离图片 payload", () => {
    const state: BoardState = {
      ...defaultState(),
      workspaces: [
        {
          ...defaultWorkspace("ws-1"),
          images: [{ id: "img-1", src: "data:image/png;base64,abc", createdAt: 1 }],
        },
      ],
    };

    const stored = getSerializableState(state);
    expect(stored.workspaces[0].images).toEqual([{ id: "img-1", createdAt: 1 }]);
    expect(getSerializableState(state, { includeImageData: true }).workspaces[0].images[0]).toMatchObject({
      id: "img-1",
      src: "data:image/png;base64,abc",
    });
  });
```

- [ ] **Step 7: 运行新测试，确认通过（GREEN）**

Run: `npx vitest run src/__tests__/state.test.ts`
Expected: 上面 4 个新用例 PASS（实现已在 Step 1-5 完成）。

- [ ] **Step 8: 修复存量测试断言到新 shape**

存量 `state.test.ts` 与 `storage-key-migration.test.ts` 中所有访问内容字段的断言都要插入 `.workspaces[0]`。采用约定：每个用例开头加 `const ws = () => state.workspaces[0];`，然后把 `state.noteLines`→`ws().noteLines`、`state.images`→`ws().images`、`state.spaces`→`ws().spaces`、`state.activeSpaceId`→`ws().activeSpaceId`、`state.todoLists`→`ws().todoLists`、`state.todos`→`ws().todos`、`state.showCompletedTodos`→`ws().showCompletedTodos`、`state.quickOtherCollapsed`→`ws().quickOtherCollapsed`、`state.customTitles`→`ws().customTitles`、`state.workspaceLines`→`ws().workspaceLines`、`state.storageLines`→`ws().storageLines`、`state.quickButtons`→`ws().quickButtons`、`state.quickTags`→`ws().quickTags`。

特别注意几处直接构造 `BoardState` 的用例（如 "serializes image metadata..."、"merges image additions..." 系列、"rejects stale text saves..."、"allows confirmed destructive writes..."）：
- 构造 `const state: BoardState = { ...defaultState(), images: [...] }` 要改成 `{ ...defaultState(), workspaces: [{ ...defaultWorkspace(), images: [...] }] }`。
- `getSerializableState(state).images` → `getSerializableState(state).workspaces[0].images`。
- `saveStateWithConflictCheck` 相关用例：构造 stale/latest state 时同样把内容字段放进 `workspaces: [{ ...defaultWorkspace(), ... }]`；断言读取 `stored.workspaces[0].noteLines` / `.images` / `.spaces[0].lines`。
- "creates one default workspace space for new users" / "creates default configurable todo lists for new users"：`defaultState().spaces` → `defaultState().workspaces[0].spaces`，`.showCompletedTodos`/`.quickOtherCollapsed`/`.todos`/`.todoLists` 同理。

`storage-key-migration.test.ts` 无需改动（`language`/`theme` 仍是顶层字段）。

- [ ] **Step 9: 运行全套测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 10: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: `src/App.vue` 会大量报错（内容字段已不在 `BoardState` 顶层）——**这是预期**，App.vue 的修复在 Task 4-5。其余文件应无新增类型错误。若 `src/components/*` 有报错，记录下来在后续任务处理。

- [ ] **Step 11: 提交**

```bash
git add src/types.ts src/state/defaults.ts src/state/storage.ts src/__tests__/state.test.ts
git commit -m "refactor: 将 BoardState 重构为全局偏好 + workspaces[] 嵌套结构"
```

---

## Task 2: `src/state/workspaces.ts` 纯函数助手

**Files:**
- Create: `src/state/workspaces.ts`
- Create: `src/__tests__/workspaces.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/workspaces.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData } from "../types";
import {
  buildWorkspaceCustomTitles,
  createWorkspaceData,
  ensureUniqueWorkspaceTitle,
  removeWorkspace,
  reorderWorkspaces,
} from "../state/workspaces";

describe("workspace helpers", () => {
  it("createWorkspaceData 用标题与 slogan 生成空白工作空间", () => {
    const workspace = createWorkspaceData("我的空间", "加油", 100, "ws-1");

    expect(workspace.id).toBe("ws-1");
    expect(workspace.createdAt).toBe(100);
    expect(workspace.customTitles).toEqual({ "board-title": "我的空间", "board-slogan": "加油" });
    expect(workspace.images).toEqual([]);
    expect(workspace.todoLists.map((list) => list.id)).toEqual(["morning"]);
  });

  it("createWorkspaceData 省略标题/slogan 时不写入 customTitles", () => {
    const workspace = createWorkspaceData("  ", "", 1, "ws-2");
    expect(workspace.customTitles).toEqual({});
  });

  it("ensureUniqueWorkspaceTitle 为重名标题加后缀", () => {
    const existing: WorkspaceData[] = [
      { ...defaultWorkspace("a"), customTitles: { "board-title": "项目" } },
    ];
    const created = createWorkspaceData("项目", "", 1, "b");

    expect(ensureUniqueWorkspaceTitle(created, existing).customTitles["board-title"]).toBe("项目 2");
  });

  it("removeWorkspace 删除非活动空间并保留当前活动空间", () => {
    const workspaces = [
      { ...defaultWorkspace("a"), customTitles: { "board-title": "A" } },
      { ...defaultWorkspace("b"), customTitles: { "board-title": "B" } },
    ];

    const result = removeWorkspace(workspaces, "a", "b");
    expect(result.workspaces.map((w) => w.id)).toEqual(["a"]);
    expect(result.activeWorkspaceId).toBe("a");
  });

  it("removeWorkspace 删除活动空间时切换到相邻空间", () => {
    const workspaces = [
      { ...defaultWorkspace("a"), customTitles: { "board-title": "A" } },
      { ...defaultWorkspace("b"), customTitles: { "board-title": "B" } },
      { ...defaultWorkspace("c"), customTitles: { "board-title": "C" } },
    ];

    const result = removeWorkspace(workspaces, "b", "b");
    expect(result.workspaces.map((w) => w.id)).toEqual(["a", "c"]);
    expect(result.activeWorkspaceId).toBe("a");
  });

  it("removeWorkspace 至少保留一个工作空间", () => {
    const workspaces = [{ ...defaultWorkspace("a") }];
    expect(removeWorkspace(workspaces, "a", "a")).toEqual({ workspaces, activeWorkspaceId: "a" });
  });

  it("reorderWorkspaces 移动工作空间顺序", () => {
    const workspaces = [
      { ...defaultWorkspace("a") },
      { ...defaultWorkspace("b") },
      { ...defaultWorkspace("c") },
    ];

    expect(reorderWorkspaces(workspaces, "c", "a").map((w) => w.id)).toEqual(["c", "a", "b"]);
    expect(reorderWorkspaces(workspaces, "a", "a").map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("buildWorkspaceCustomTitles 去除首尾空白", () => {
    expect(buildWorkspaceCustomTitles("  T  ", "  S  ")).toEqual({ "board-title": "T", "board-slogan": "S" });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/__tests__/workspaces.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现助手模块**

创建 `src/state/workspaces.ts`：

```ts
import { defaultWorkspace } from "./defaults";
import { createId } from "./storage";
import type { WorkspaceData } from "../types";

export function buildWorkspaceCustomTitles(title: string, slogan: string): Record<string, string> {
  const titles: Record<string, string> = {};
  const trimmedTitle = title.trim();
  const trimmedSlogan = slogan.trim();
  if (trimmedTitle) titles["board-title"] = trimmedTitle;
  if (trimmedSlogan) titles["board-slogan"] = trimmedSlogan;
  return titles;
}

export function createWorkspaceData(
  title: string,
  slogan: string,
  createdAt: number,
  id: string = createId(),
): WorkspaceData {
  return {
    ...defaultWorkspace(id),
    createdAt,
    customTitles: buildWorkspaceCustomTitles(title, slogan),
  };
}

export function ensureUniqueWorkspaceTitle(workspace: WorkspaceData, existing: WorkspaceData[]): WorkspaceData {
  const title = workspace.customTitles["board-title"]?.trim();
  if (!title) return workspace;
  const taken = new Set(
    existing
      .filter((item) => item.id !== workspace.id)
      .map((item) => item.customTitles["board-title"]?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  if (!taken.has(title)) return workspace;
  let index = 2;
  while (taken.has(`${title} ${index}`)) index += 1;
  return {
    ...workspace,
    customTitles: { ...workspace.customTitles, "board-title": `${title} ${index}` },
  };
}

export function removeWorkspace(
  workspaces: WorkspaceData[],
  activeWorkspaceId: string,
  id: string,
): { workspaces: WorkspaceData[]; activeWorkspaceId: string } {
  if (workspaces.length <= 1) return { workspaces, activeWorkspaceId };
  const index = workspaces.findIndex((workspace) => workspace.id === id);
  if (index < 0) return { workspaces, activeWorkspaceId };
  const nextWorkspaces = workspaces.filter((workspace) => workspace.id !== id);
  const nextActive = id === activeWorkspaceId
    ? (nextWorkspaces[Math.max(0, index - 1)]?.id ?? nextWorkspaces[0].id)
    : activeWorkspaceId;
  return { workspaces: nextWorkspaces, activeWorkspaceId: nextActive };
}

export function reorderWorkspaces(workspaces: WorkspaceData[], dragId: string, targetId: string): WorkspaceData[] {
  const sourceIndex = workspaces.findIndex((workspace) => workspace.id === dragId);
  const targetIndex = workspaces.findIndex((workspace) => workspace.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return workspaces;
  const next = [...workspaces];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/__tests__/workspaces.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/state/workspaces.ts src/__tests__/workspaces.test.ts
git commit -m "feat: 新增工作空间纯函数助手（创建/去重/删除/排序）"
```

---

## Task 3: i18n 文案与 message 键

**Files:**
- Modify: `src/state/i18n.ts`
- Modify: `src/state/messages.ts`

- [ ] **Step 1: 在 `UI_TEXT.zh.app` 末尾追加（`reminderFallback` 之后）**

```ts
      workspaces: "工作空间",
      newWorkspace: "新建工作空间",
      workspaceTitle: "标题",
      workspaceSlogan: "Slogan",
      workspaceTitlePlaceholder: "给这个空间起个名字",
      workspaceSloganPlaceholder: "一句话签名（选填）",
      keepOneWorkspace: "至少保留一个工作空间",
      workspaceCreated: "已新建工作空间",
      workspaceSwitched: "已切换工作空间",
      workspaceExportSingle: "导出此空间",
```

- [ ] **Step 2: 在 `UI_TEXT.zh.settings` 末尾追加（`english` 之后）**

```ts
      exportCurrentWorkspace: "导出当前空间",
```

- [ ] **Step 3: 在 `UI_TEXT.en.app` 末尾追加对应英文**

```ts
      workspaces: "Workspaces",
      newWorkspace: "New workspace",
      workspaceTitle: "Title",
      workspaceSlogan: "Slogan",
      workspaceTitlePlaceholder: "Name this workspace",
      workspaceSloganPlaceholder: "A one-line signature (optional)",
      keepOneWorkspace: "Keep at least one workspace",
      workspaceCreated: "Workspace created",
      workspaceSwitched: "Workspace switched",
      workspaceExportSingle: "Export this workspace",
```

- [ ] **Step 4: 在 `UI_TEXT.en.settings` 末尾追加**

```ts
      exportCurrentWorkspace: "Export current workspace",
```

- [ ] **Step 5: 在 `src/state/messages.ts` 的 `MessageKey` 联合类型中加入**

```ts
  | "confirmDeleteWorkspace"
  | "deleteWorkspace"
  | "confirmImportWorkspace"
```

- [ ] **Step 6: 在 `MESSAGE_CATALOG` 中加入 zh 条目（紧随 `confirmDeleteSpace` 之后）**

```ts
  deleteWorkspace: {
    mood: "calm",
    surface: "companion",
    variants: [
      "工作空间已删除",
      "这个空间已移除",
      "空间已从列表删除",
      "工作空间已清掉",
    ],
  },
  confirmDeleteWorkspace: {
    mood: "warning",
    surface: "companion",
    variants: [
      "删除这个工作空间？此操作不可撤销。",
      "永久移除这个工作空间？",
      "该空间及其全部内容都会被删除。",
    ],
  },
  confirmImportWorkspace: {
    mood: "happy",
    surface: "companion",
    variants: [
      "把这个空间作为新工作空间导入？",
      "追加为新工作空间，不会影响现有空间。",
      "将作为新空间加入列表。",
    ],
  },
```

- [ ] **Step 7: 在 `EN_MESSAGE_VARIANTS` 中加入英文（紧随 `confirmDeleteSpace` 行之后）**

```ts
  deleteWorkspace: ["Workspace deleted", "Workspace removed", "This workspace is gone"],
  confirmDeleteWorkspace: ["Delete this workspace? This cannot be undone.", "Remove this workspace permanently?", "This workspace and all its content will be deleted."],
  confirmImportWorkspace: ["Import this as a new workspace?", "It will be added as a new workspace; existing ones stay.", "A new workspace will be appended to the list."],
```

- [ ] **Step 8: 运行 i18n 与 messages 测试**

Run: `npx vitest run src/__tests__/i18n.test.ts src/__tests__/messages.test.ts`
Expected: PASS（如有键完整性校验，新键已同时补齐 zh/en 与 catalog）。

- [ ] **Step 9: 提交**

```bash
git add src/state/i18n.ts src/state/messages.ts
git commit -m "feat: 新增工作空间相关 i18n 文案与 message 键"
```

---

## Task 4: App.vue — `activeWorkspace` 与「读」路径迁移

> 本任务与 Task 5 都是机械改写，`npx vue-tsc --noEmit` 是确定性向导：每处 `state.<内容字段>` 报「Property does not exist on type 'BoardState'」，按规则替换即可。内容字段清单：`customTitles noteLines workspaceLines storageLines spaces activeSpaceId images quickTags quickButtons quickOtherCollapsed showHiddenQuickButtons todoLists showCompletedTodos todos`。

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: 新增 import 与 `activeWorkspace` computed**

在 App.vue 顶部 import 区：
- 把 `WorkspaceData` 加入从 `./types` 的类型 import。
- 新增 `import { createWorkspaceData, ensureUniqueWorkspaceTitle, removeWorkspace, reorderWorkspaces } from "./state/workspaces";`（Task 5/7 会用到，先导入）。
- 新增 `import { getSerializableWorkspace, normalizeWorkspaceData } from "./state/storage";`（Task 8 用到，先导入）。

在 `const state = reactive<BoardState>(loadState());` 之后新增：

```ts
const activeWorkspace = computed<WorkspaceData>(
  () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0],
);
```

- [ ] **Step 2: 迁移「读」计算属性（精确替换）**

替换 `boardTitle` / `boardSlogan`：

```ts
const boardTitle = computed(() => activeWorkspace.value.customTitles["board-title"]?.trim() || DEFAULT_BOARD_TITLE);
const boardSlogan = computed(() => activeWorkspace.value.customTitles["board-slogan"]?.trim() || DEFAULT_BOARD_SLOGAN);
```

替换 `titles` / `displayTodoLists` / `displaySpaces`：

```ts
const titles = computed(() =>
  Object.fromEntries(
    Object.entries(getDefaultTitles(state.language)).map(([id, title]) => [id, activeWorkspace.value.customTitles[id] || title]),
  ) as Record<string, string>,
);
const displayTodoLists = computed<TodoListConfig[]>(() =>
  activeWorkspace.value.todoLists.map((list) => ({
    ...list,
    title: getDisplayTodoListTitle(list, state.language),
  })),
);
const displaySpaces = computed<WorkspaceSpace[]>(() =>
  activeWorkspace.value.spaces.map((space) => ({
    ...space,
    title: getDisplaySpaceTitle(space, state.language),
  })),
);
```

- [ ] **Step 3: 迁移密度计算**

`getLargestTodoListCount` 中 `state.todoLists`→`activeWorkspace.value.todoLists`、`state.todos`→`activeWorkspace.value.todos`；`getLargestQuickCategoryCount` 中 `state.quickButtons`→`activeWorkspace.value.quickButtons`；`getDensityAreas` 中 `state.images.length`→`activeWorkspace.value.images.length`、`getLargestTodoListCount()`/`getLargestQuickCategoryCount()` 调用不变；`getDensityAreaLabel` 不变。

- [ ] **Step 4: 迁移 `isGuideAreaEmpty` 与 todo 读取族**

`isGuideAreaEmpty`：`state.images`→`activeWorkspace.value.images`；`state.noteLines`→`activeWorkspace.value.noteLines`；`state.quickButtons`/`state.showHiddenQuickButtons`→`activeWorkspace.value.*`；`state.spaces`/`state.activeSpaceId`→`activeWorkspace.value.*`；`state.storageLines`→`activeWorkspace.value.storageLines`。

`getTodos`：

```ts
function getTodos(period: TodoPeriod): TodoItem[] {
  return activeWorkspace.value.todos[period] ?? [];
}
```

`isConfiguredTodoListId`：`state.todoLists`→`activeWorkspace.value.todoLists`。
`getTodoListIds`：`state.todoLists`→`activeWorkspace.value.todoLists`。
`getTodoListTitle`：`state.todoLists`→`activeWorkspace.value.todoLists`。

- [ ] **Step 5: 迁移模板里的内容字段绑定**

模板中所有 `state.<内容字段>` 改为 `activeWorkspace.<内容字段>`（模板里 computed 自动解包，**不要**写 `.value`）。至少包括：
- `:images="state.images"` → `:images="activeWorkspace.images"`
- `:quick-tags="state.quickTags"` / `:buttons="state.quickButtons"` / `:other-collapsed="state.quickOtherCollapsed"` / `:show-hidden="state.showHiddenQuickButtons"`
- `:spaces="displaySpaces"` / `:active-space-id="state.activeSpaceId"` → `:active-space-id="activeWorkspace.activeSpaceId"`
- `:todo-lists="displayTodoLists"` / `:todos="state.todos"` → `:todos="activeWorkspace.todos"` / `:show-completed="state.showCompletedTodos"` → `:show-completed="activeWorkspace.showCompletedTodos"`
- `@toggle-show-hidden="state.showHiddenQuickButtons = !state.showHiddenQuickButtons; persistNow()"` → `@toggle-show-hidden="activeWorkspace.showHiddenQuickButtons = !activeWorkspace.showHiddenQuickButtons; persistNow()"`

- [ ] **Step 6: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: App.vue 中「读」相关错误清零；剩余错误集中在「写/变更」路径（Task 5 处理）。继续修到本任务范围内的报错消失。

- [ ] **Step 7: 暂不提交（与 Task 5 合并提交）**

---

## Task 5: App.vue — 「写/变更」路径迁移 + 图片持久化

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: `updateTitle`**

```ts
function updateTitle(id: string, value: string): void {
  const title = value.trim();
  if (title) activeWorkspace.value.customTitles[id] = title;
  else delete activeWorkspace.value.customTitles[id];
  persistNow();
}
```

- [ ] **Step 2: `updateLines` / `updateSpaceLines` / `syncLegacySpaceLines`**

```ts
function updateLines(key: "noteLines" | "workspaceLines" | "storageLines", lines: LineItem[]): void {
  activeWorkspace.value[key] = lines;
  textEditGeneration += 1;
  markDirty();
  scheduleTextSave();
}

function updateSpaceLines(id: string, lines: LineItem[]): void {
  const space = activeWorkspace.value.spaces.find((item) => item.id === id);
  if (!space) return;
  space.lines = lines;
  textEditGeneration += 1;
  syncLegacySpaceLines();
  markDirty();
  scheduleTextSave();
}

function syncLegacySpaceLines(): void {
  activeWorkspace.value.workspaceLines = activeWorkspace.value.spaces[0]?.lines.map((line) => ({ ...line })) ?? [];
  activeWorkspace.value.storageLines = activeWorkspace.value.spaces[1]?.lines.map((line) => ({ ...line })) ?? [];
}
```

- [ ] **Step 3: 子空间（spaces）CRUD**

把 `activateSpace` / `createSpace` / `renameSpace` / `deleteSpace` / `reorderSpaces` / `nextSpaceTitle` 中的 `state.spaces`→`activeWorkspace.value.spaces`、`state.activeSpaceId`→`activeWorkspace.value.activeSpaceId`。`nextSpaceTitle` 里 `state.spaces`→`activeWorkspace.value.spaces`。

- [ ] **Step 4: todo / quick / image 变更函数**

机械替换（脚本里写 `.value`）：
- todo 系列 `createTodo`/`createTodosFromText`/`updateTodo`/`splitTodo`/`complete`/`toggleTodoStar`/`updateTodoNotify`/`removeTodo`/`clearDone`/`toggleCompletedVisibility`/`blurEmptyTodo`/`moveTodo`：`state.todos`→`activeWorkspace.value.todos`，`state.showCompletedTodos`→`activeWorkspace.value.showCompletedTodos`。
- quick 系列 `saveQuick`/`saveQuickTag`/`toggleQuickTagCollapsed`/`deleteQuickTag`/`moveQuickButtonsToTag`/`deleteQuick`/`toggleQuickHidden`/`reorderQuickButtons`/`reorderQuickTags`/`moveQuickButtonToTag`/`resolveQuickTagId`：`state.quickButtons`/`state.quickTags`/`state.quickOtherCollapsed`→`activeWorkspace.value.*`。
- image 系列 `reorderImages`/`moveImageToBottom`/`deleteImage`/`openImagePreview`/`openImageEditor`/`navigatePreview`/`addImageFile`/`addImageFiles`/`addPastedImageFile`：`state.images`→`activeWorkspace.value.images`。`addPastedImageFile` 中 `state.images.splice/push/find/findIndex/filter` 全部走 `activeWorkspace.value.images`。

- [ ] **Step 5: 图片保留集扫描（跨全部工作空间）**

替换 `collectRetainedImagePayloadIds` 开头：

```ts
function collectRetainedImagePayloadIds(): Set<string> {
  const retained = new Set<string>();
  for (const workspace of state.workspaces) {
    for (const image of workspace.images) retained.add(getImagePayloadId(image));
  }
  const addSnapshot = (snapshot: string) => {
    // ……现有 undo 快照 / 权威 localStorage 解析逻辑保持不变
```

（`undoSnapshots.value.forEach(addSnapshot)` 等不变。）

- [ ] **Step 6: `persistNow` 的 images 合并**

把 `persistNow` 中：

```ts
  if (result.status === "merged") {
    state.images = mergeVisibleImages(result.state.images, state.images);
  }
```

替换为：

```ts
  if (result.status === "merged") {
    const savedActive = result.state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? result.state.workspaces[0];
    activeWorkspace.value.images = mergeVisibleImages(savedActive?.images ?? [], activeWorkspace.value.images);
  }
```

- [ ] **Step 7: `persistImageReplacement`**

把其中构造 `nextImages` 与提交的两处改为基于活动工作空间：

```ts
async function persistImageReplacement(replacement: StoredImage, expectedPayloadId: string): Promise<boolean> {
  const previousSnapshot = createUndoSnapshot();
  const nextImages = activeWorkspace.value.images.map((image) => (image.id === replacement.id ? replacement : image));
  markSaving();
  const stateWithReplacement: BoardState = {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === state.activeWorkspaceId ? { ...workspace, images: nextImages } : workspace,
    ),
  };
  const result = saveStateWithConflictCheck(stateWithReplacement, {
    clientId: syncClientId,
    scope: "images",
    imageReplacement: {
      imageId: replacement.id,
      expectedPayloadId,
      newPayloadId: getImagePayloadId(replacement),
    },
  });
  if (result.status === "conflict") {
    await applyImageReplacementConflict(result.state);
    return false;
  }
  state.sync = result.state.sync;
  const savedActive = result.state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? result.state.workspaces[0];
  activeWorkspace.value.images = result.status === "merged"
    ? mergeVisibleImages(savedActive?.images ?? [], nextImages)
    : nextImages;
  if (!restoringUndo) {
    undoSnapshots.value = [...undoSnapshots.value.slice(-(UNDO_HISTORY_LIMIT - 1)), previousSnapshot];
    lastUndoSnapshot.value = createUndoSnapshot();
  }
  broadcastStateSaved();
  markSavedSoon();
  scheduleImagePayloadPrune();
  return true;
}
```

- [ ] **Step 8: `applyImageReplacementConflict` 的 localText 覆盖**

把 `if (textEditGeneration !== savedTextGeneration) { ... }` 整段替换为：

```ts
  if (textEditGeneration !== savedTextGeneration) {
    const active = activeWorkspace.value;
    const localTextWorkspace: WorkspaceData = {
      ...active,
      noteLines: active.noteLines.map((line) => ({ ...line })),
      spaces: active.spaces.map((space) => ({ ...space, lines: space.lines.map((line) => ({ ...line })) })),
      workspaceLines: active.workspaceLines.map((line) => ({ ...line })),
      storageLines: active.storageLines.map((line) => ({ ...line })),
    };
    Object.assign(state, latest, {
      workspaces: latest.workspaces.map((workspace) => (workspace.id === active.id ? localTextWorkspace : workspace)),
    });
    applyTheme();
    window.clearTimeout(saveStatusTimer.value);
    saveStatus.value = "dirty";
    void persistPendingText({ retryOnce: true });
    return;
  }
```

- [ ] **Step 9: `clearData` 与 undo**

`clearData` 的 onConfirm 里 `Object.assign(state, defaultState())` 保持不变（顶层替换 `workspaces`）。`undoLastBoardChange` 里 `Object.assign(state, nextState)` 保持不变。无需改动。

- [ ] **Step 10: onMounted 图片水合（全部工作空间）**

把 onMounted 中：

```ts
  const inlineImagePayloads = state.images.filter((image): image is StoredImage & { src: string } => Boolean(image.src));
  state.images = await hydrateStoredImages(state.images, { persistLegacyPayloads: true });
  await persistImagePayloads(inlineImagePayloads);
```

替换为：

```ts
  const inlineImagePayloads: (StoredImage & { src: string })[] = [];
  for (const workspace of state.workspaces) {
    workspace.images = await hydrateStoredImages(workspace.images, { persistLegacyPayloads: true });
    for (const image of workspace.images) {
      if (image.src) inlineImagePayloads.push(image as StoredImage & { src: string });
    }
  }
  await persistImagePayloads(inlineImagePayloads);
```

- [ ] **Step 11: 类型检查 + 测试**

Run: `npx vue-tsc --noEmit`
Expected: App.vue 报错清零（若 `src/components/*` 仍有报错，记录到 Task 9 处理）。

Run: `npm test`
Expected: `app-render.test.ts`、`workbench-shell.test.ts` 等可能有断言失败（标题区尚未改造），记录到 Task 9。`state.test.ts`/`workspaces.test.ts` 应 PASS。

- [ ] **Step 12: 提交**

```bash
git add src/App.vue
git commit -m "refactor: App.vue 内容读写改为通过 activeWorkspace 投影，支持多工作空间数据"
```

---

## Task 6: App.vue — 工作空间 CRUD 接线

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: 新增 CRUD 函数**

在 `deleteSpace` 等函数附近新增：

```ts
function workspaceCreatedMessage(): string {
  return state.language === "en" ? "Workspace created (｡•̀ᴗ-)✧" : "已新建工作空间 (｡•̀ᴗ-)✧";
}

function createWorkspace(title: string, slogan: string): void {
  const workspace = ensureUniqueWorkspaceTitle(createWorkspaceData(title, slogan, Date.now()), state.workspaces);
  state.workspaces = [...state.workspaces, workspace];
  state.activeWorkspaceId = workspace.id;
  pendingEditSpaceId.value = null;
  pendingEditTodoListId.value = null;
  clearImagePreview();
  persistNow();
  showBubbleText(workspaceCreatedMessage());
}

function switchWorkspace(id: string): void {
  if (!state.workspaces.some((workspace) => workspace.id === id) || state.activeWorkspaceId === id) return;
  if (textEditGeneration !== savedTextGeneration) flushTextSave();
  state.activeWorkspaceId = id;
  pendingEditSpaceId.value = null;
  pendingEditTodoListId.value = null;
  clearImagePreview();
  persistNow();
}

function renameWorkspace(id: string, title: string, slogan: string): void {
  const workspace = state.workspaces.find((item) => item.id === id);
  if (!workspace) return;
  const nextTitles = { ...workspace.customTitles };
  const trimmedTitle = title.trim();
  const trimmedSlogan = slogan.trim();
  if (trimmedTitle) nextTitles["board-title"] = trimmedTitle;
  else delete nextTitles["board-title"];
  if (trimmedSlogan) nextTitles["board-slogan"] = trimmedSlogan;
  else delete nextTitles["board-slogan"];
  workspace.customTitles = nextTitles;
  persistNow();
}

function deleteWorkspace(id: string, anchor?: HTMLElement): void {
  if (state.workspaces.length <= 1) {
    showBubbleText(uiText.value.app.keepOneWorkspace, anchor);
    return;
  }
  requestConfirmation("confirmDeleteWorkspace", anchor, () => {
    const result = removeWorkspace(state.workspaces, state.activeWorkspaceId, id);
    if (result.workspaces === state.workspaces) return;
    state.workspaces = result.workspaces;
    state.activeWorkspaceId = result.activeWorkspaceId;
    pendingEditSpaceId.value = null;
    pendingEditTodoListId.value = null;
    clearImagePreview();
    persistNow();
    showBubble("deleteWorkspace", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel, danger: true });
}

function reorderWorkspaceSections(dragId: string, targetId: string): void {
  state.workspaces = reorderWorkspaces(state.workspaces, dragId, targetId);
  persistNow();
}
```

- [ ] **Step 2: 确认 `document.title` 同步**

`watch(boardTitle, ...)` 与 onMounted 里 `document.title = boardTitle.value;` 已存在。切换/重命名/新增工作空间都会改变 `boardTitle`（因它读 `activeWorkspace.value.customTitles["board-title"]`），watcher 自动更新标签标题，无需额外代码。确认该 watcher 仍在即可。

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: App.vue 无新增错误（CRUD 函数暂未被模板引用也无妨，不报 unused 即可；若 lint 报 unused，可在 Task 7 接线后消除，或临时 `void createWorkspace;` 不建议——直接进入 Task 7）。

- [ ] **Step 4: 暂不提交（与 Task 7 合并）**

---

## Task 7: `WorkspaceSwitcher.vue` 组件

**Files:**
- Create: `src/components/WorkspaceSwitcher.vue`
- Create: `src/__tests__/workspace-switcher.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/workspace-switcher.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.vue";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData } from "../types";

const workspaces: WorkspaceData[] = [
  { ...defaultWorkspace("a"), customTitles: { "board-title": "主空间", "board-slogan": "S1" } },
  { ...defaultWorkspace("b"), customTitles: { "board-title": "副空间" } },
];

describe("WorkspaceSwitcher", () => {
  it("渲染当前工作空间标题作为触发按钮", () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    expect(wrapper.text()).toContain("主空间");
  });

  it("点击触发后展开列表并切换空间", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-option-b"]').trigger("click");
    expect(wrapper.emitted("switch")).toEqual([["b"]]);
  });

  it("提交新建表单时 emit create", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-create-button"]').trigger("click");
    const titleInput = wrapper.find('[data-testid="workspace-title-input"]');
    const sloganInput = wrapper.find('[data-testid="workspace-slogan-input"]');
    await titleInput.setValue("新空间");
    await sloganInput.setValue("冲");
    await wrapper.find('[data-testid="workspace-create-confirm"]').trigger("click");
    expect(wrapper.emitted("create")).toEqual([["新空间", "冲"]]);
  });

  it("点击删除 emit delete", async () => {
    const wrapper = mount(WorkspaceSwitcher, {
      props: { workspaces, activeWorkspaceId: "a", theme: "light", language: "zh" },
      attachTo: document.body,
    });
    await wrapper.find('[data-testid="workspace-trigger"]').trigger("click");
    await wrapper.find('[data-testid="workspace-delete-b"]').trigger("click");
    const deleteEvents = wrapper.emitted("delete");
    expect(deleteEvents?.[0]?.[0]).toBe("b");
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/workspace-switcher.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现组件**

创建 `src/components/WorkspaceSwitcher.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { NPopover } from "naive-ui";
import { ChevronDownOutline, AddOutline, CreateOutline, TrashOutline, DownloadOutline } from "@vicons/ionicons5";
import { NIcon } from "naive-ui";
import { getUiText } from "../state/i18n";
import type { AppLanguage, ThemeMode, WorkspaceData } from "../types";
import miniDeskLogo from "../../static/img/mini-desk-cat.png?url";
import miniDeskDarkLogo from "../../static/img/mini-desk-cat-dark.png?url";

const props = defineProps<{
  workspaces: WorkspaceData[];
  activeWorkspaceId: string;
  theme: ThemeMode;
  language: AppLanguage;
}>();

const emit = defineEmits<{
  switch: [id: string];
  create: [title: string, slogan: string];
  rename: [id: string, title: string, slogan: string];
  delete: [id: string, anchor: HTMLElement];
  reorder: [dragId: string, targetId: string];
  exportWorkspace: [id: string, anchor: HTMLElement];
}>();

const text = computed(() => getUiText(props.language));
const open = ref(false);
const creating = ref(false);
const draftTitle = ref("");
const draftSlogan = ref("");
const dragId = ref<string | null>(null);

const activeWorkspace = computed<WorkspaceData>(
  () => props.workspaces.find((workspace) => workspace.id === props.activeWorkspaceId) ?? props.workspaces[0],
);
const logoSrc = computed(() => (props.theme === "dark" ? miniDeskDarkLogo : miniDeskLogo));
const activeTitle = computed(() => activeWorkspace.value?.customTitles["board-title"]?.trim() || "Mini Desk");

function toggleOpen(): void {
  open.value = !open.value;
  if (!open.value) resetCreate();
}

function close(): void {
  open.value = false;
  resetCreate();
}

function resetCreate(): void {
  creating.value = false;
  draftTitle.value = "";
  draftSlogan.value = "";
}

function handleSwitch(id: string): void {
  if (id === props.activeWorkspaceId) {
    close();
    return;
  }
  emit("switch", id);
  close();
}

function startCreate(): void {
  creating.value = true;
}

function confirmCreate(): void {
  const title = draftTitle.value.trim();
  if (!title) return;
  emit("create", title, draftSlogan.value);
  close();
}

function handleDelete(event: MouseEvent, id: string): void {
  event.stopPropagation();
  const anchor = event.currentTarget as HTMLElement;
  emit("delete", id, anchor);
  close();
}

function handleExport(event: MouseEvent, id: string): void {
  event.stopPropagation();
  const anchor = event.currentTarget as HTMLElement;
  emit("exportWorkspace", id, anchor);
  close();
}

function onDragStart(id: string): void {
  dragId.value = id;
}

function onDrop(targetId: string): void {
  if (dragId.value && dragId.value !== targetId) emit("reorder", dragId.value, targetId);
  dragId.value = null;
}
</script>

<template>
  <NPopover
    trigger="manual"
    placement="bottom-start"
    :show="open"
    :width="248"
    @clickoutside="close"
  >
    <template #trigger>
      <button
        type="button"
        class="workspace-trigger"
        data-testid="workspace-trigger"
        :aria-label="text.app.workspaces"
        @click="toggleOpen"
      >
        <img class="workspace-trigger-logo" :src="logoSrc" alt="" aria-hidden="true" width="20" height="20" />
        <span class="workspace-trigger-title">{{ activeTitle }}</span>
        <NIcon :component="ChevronDownOutline" size="14" />
      </button>
    </template>

    <div class="workspace-switcher" role="listbox" :aria-label="text.app.workspaces">
      <ul class="workspace-switcher-list">
        <li
          v-for="workspace in workspaces"
          :key="workspace.id"
          class="workspace-switcher-item"
          :class="{ 'is-active': workspace.id === activeWorkspaceId }"
          :data-testid="`workspace-option-${workspace.id}`"
          draggable="true"
          role="option"
          :aria-selected="workspace.id === activeWorkspaceId"
          @click="handleSwitch(workspace.id)"
          @dragstart="onDragStart(workspace.id)"
          @dragover.prevent
          @drop="onDrop(workspace.id)"
        >
          <span class="workspace-switcher-name">
            {{ workspace.customTitles["board-title"]?.trim() || "Mini Desk" }}
          </span>
          <span class="workspace-switcher-actions">
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-export-${workspace.id}`"
              :aria-label="text.app.workspaceExportSingle"
              @click="handleExport($event, workspace.id)"
            >
              <NIcon :component="DownloadOutline" size="14" />
            </button>
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-rename-${workspace.id}`"
              :aria-label="text.common.rename"
              @click.stop="emit('rename', workspace.id, workspace.customTitles['board-title'] ?? '', workspace.customTitles['board-slogan'] ?? ''); close()"
            >
              <NIcon :component="CreateOutline" size="14" />
            </button>
            <button
              v-if="workspaces.length > 1"
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-delete-${workspace.id}`"
              :aria-label="text.common.delete"
              @click="handleDelete($event, workspace.id)"
            >
              <NIcon :component="TrashOutline" size="14" />
            </button>
          </span>
        </li>
      </ul>

      <div v-if="!creating" class="workspace-switcher-footer">
        <button type="button" class="workspace-switcher-create" data-testid="workspace-create-button" @click="startCreate">
          <NIcon :component="AddOutline" size="14" />
          <span>{{ text.app.newWorkspace }}</span>
        </button>
      </div>

      <div v-else class="workspace-switcher-form">
        <label class="workspace-switcher-field">
          <span>{{ text.app.workspaceTitle }}</span>
          <input
            v-model="draftTitle"
            type="text"
            class="workspace-switcher-input"
            data-testid="workspace-title-input"
            :placeholder="text.app.workspaceTitlePlaceholder"
          />
        </label>
        <label class="workspace-switcher-field">
          <span>{{ text.app.workspaceSlogan }}</span>
          <input
            v-model="draftSlogan"
            type="text"
            class="workspace-switcher-input"
            data-testid="workspace-slogan-input"
            :placeholder="text.app.workspaceSloganPlaceholder"
          />
        </label>
        <div class="workspace-switcher-form-actions">
          <button type="button" class="workspace-switcher-cancel" @click="resetCreate">{{ text.common.cancel }}</button>
          <button
            type="button"
            class="workspace-switcher-confirm"
            data-testid="workspace-create-confirm"
            :disabled="!draftTitle.trim()"
            @click="confirmCreate"
          >
            {{ text.common.confirm }}
          </button>
        </div>
      </div>
    </div>
  </NPopover>
</template>
```

> 重命名入口当前 emit `rename` 并关闭面板（用现有标题/slogan 预填）。**简化决策**：重命名复用同一套表单 UI 太挤；本组件改为：点击「重命名」直接 `emit('rename', id, currentTitle, currentSlogan)` 由父组件弹出 Naive UI 对话框编辑。如果你想要内联重命名，可在后续迭代加 `renamingId` 分支。Task 6 的 `renameWorkspace(id,title,slogan)` 已支持。

- [ ] **Step 4: 在 `src/styles.css` 追加组件样式**

```css
.workspace-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 2px 6px;
  border-radius: 8px;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.workspace-trigger:hover { background: var(--color-hover, rgba(0,0,0,0.05)); }
.workspace-trigger-logo { display: inline-block; }
.workspace-trigger-title { font-weight: 600; }

.workspace-switcher-list { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow: auto; }
.workspace-switcher-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer;
}
.workspace-switcher-item.is-active { font-weight: 600; }
.workspace-switcher-item:hover { background: var(--color-hover, rgba(0,0,0,0.05)); }
.workspace-switcher-actions { display: inline-flex; gap: 4px; opacity: 0.7; }
.workspace-switcher-action {
  display: inline-flex; background: transparent; border: none; cursor: pointer; padding: 2px; border-radius: 6px; color: inherit;
}
.workspace-switcher-action:hover { background: var(--color-hover, rgba(0,0,0,0.08)); opacity: 1; }

.workspace-switcher-footer { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-border, rgba(0,0,0,0.1)); }
.workspace-switcher-create {
  display: inline-flex; align-items: center; gap: 6px; width: 100%;
  background: transparent; border: none; cursor: pointer; padding: 6px 8px; border-radius: 8px; color: inherit;
}
.workspace-switcher-create:hover { background: var(--color-hover, rgba(0,0,0,0.05)); }

.workspace-switcher-form { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-border, rgba(0,0,0,0.1)); }
.workspace-switcher-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.workspace-switcher-input { padding: 4px 8px; border-radius: 6px; border: 1px solid var(--color-border, rgba(0,0,0,0.15)); background: transparent; color: inherit; }
.workspace-switcher-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.workspace-switcher-cancel, .workspace-switcher-confirm { padding: 4px 12px; border-radius: 6px; cursor: pointer; border: 1px solid var(--color-border, rgba(0,0,0,0.15)); background: transparent; color: inherit; }
.workspace-switcher-confirm:not(:disabled) { background: var(--color-accent, #111); color: #fff; border-color: transparent; }
.workspace-switcher-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
```

（若 `--color-hover`/`--color-border`/`--color-accent` 未定义，沿用上面的回退值即可；后续可对齐设计系统变量。）

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/__tests__/workspace-switcher.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/WorkspaceSwitcher.vue src/__tests__/workspace-switcher.test.ts src/styles.css
git commit -m "feat: 新增 WorkspaceSwitcher 标题切换器组件"
```

---

## Task 8: `WorkbenchShell.vue` 标题区改造 + App.vue 接线

**Files:**
- Modify: `src/components/WorkbenchShell.vue`
- Modify: `src/App.vue`
- Modify: `src/__tests__/workbench-shell.test.ts`（按需）
- Modify: `src/__tests__/app-render.test.ts`（按需）

- [ ] **Step 1: WorkbenchShell 模板：用插槽替换标题 EditableTitle**

在 `WorkbenchShell.vue` 的 `defineSlots` 中加入 `workspaceTrigger?: () => unknown;`。

把 `<div class="workbench-title-group">` 内的：
```html
<img class="workbench-title-icon workbench-title-logo" :src="miniDeskLogoSrc" alt="" aria-hidden="true" width="20" height="20" />
<h1>
  <EditableTitle id="board-title" :value="title" @update="(_id, value) => emit('updateTitle', value)" />
</h1>
```
替换为：
```html
<slot name="workspace-trigger">
  <span class="workbench-title-fallback">{{ title }}</span>
</slot>
```

把 slogan 段：
```html
<p v-if="slogan" class="workbench-slogan">
  <EditableTitle id="board-slogan" :value="slogan" @update="(_id, value) => emit('updateSlogan', value)" />
</p>
```
替换为静态展示：
```html
<p v-if="slogan" class="workbench-slogan">{{ slogan }}</p>
```

- [ ] **Step 2: WorkbenchShell：移除不再需要的 emits / import**

从 `defineEmits` 中删除 `updateTitle` 与 `updateSlogan`（仅保留 `theme`）。删除 `EditableTitle` 的 import 与 `miniDeskLogo`/`miniDeskDarkLogo` import 及 `miniDeskLogoSrc` computed（已交给 WorkspaceSwitcher）。若 `title` prop 仅用于 fallback，可保留。

- [ ] **Step 3: App.vue 模板：插入 WorkspaceSwitcher 并移除旧绑定**

在 `App.vue` 的 `<WorkbenchShell>` 上：
- 删除 `:title="boardTitle"`（或保留供 fallback；建议保留 `:title="boardTitle"` 与 `:slogan="boardSlogan"`）。
- 删除 `@update-title="(value) => updateTitle('board-title', value)"` 与 `@update-slogan="(value) => updateTitle('board-slogan', value)"`。
- 新增 `:theme="state.theme"` 已存在；在 WorkbenchShell 内部新增插槽：

```html
<template #workspace-trigger>
  <WorkspaceSwitcher
    :workspaces="state.workspaces"
    :active-workspace-id="state.activeWorkspaceId"
    :theme="state.theme"
    :language="state.language"
    @switch="switchWorkspace"
    @create="createWorkspace"
    @rename="renameWorkspace"
    @delete="deleteWorkspace"
    @reorder="reorderWorkspaceSections"
    @export-workspace="exportWorkspaceById"
  />
</template>
```

并在 App.vue 顶部 import：`import WorkspaceSwitcher from "./components/WorkspaceSwitcher.vue";`

- [ ] **Step 4: 重命名对话框接线（Naive UI）**

在 App.vue 顶部 import：`import { NModal, NInput } from "naive-ui";`（若 naive-ui 已批量导入则按现有方式）。新增状态：

```ts
const renameWorkspaceVisible = ref(false);
const renameWorkspaceId = ref<string | null>(null);
const renameDraftTitle = ref("");
const renameDraftSlogan = ref("");
```

把 Task 6 的 `renameWorkspace(id, title, slogan)` 改造为「打开对话框」+「提交」两段：

```ts
function renameWorkspace(id: string, title: string, slogan: string): void {
  renameWorkspaceId.value = id;
  renameDraftTitle.value = title;
  renameDraftSlogan.value = slogan;
  renameWorkspaceVisible.value = true;
}

function confirmRenameWorkspace(): void {
  if (!renameWorkspaceId.value) return;
  const workspace = state.workspaces.find((item) => item.id === renameWorkspaceId.value);
  if (workspace) {
    const nextTitles = { ...workspace.customTitles };
    const trimmedTitle = renameDraftTitle.value.trim();
    const trimmedSlogan = renameDraftSlogan.value.trim();
    if (trimmedTitle) nextTitles["board-title"] = trimmedTitle;
    else delete nextTitles["board-title"];
    if (trimmedSlogan) nextTitles["board-slogan"] = trimmedSlogan;
    else delete nextTitles["board-slogan"];
    workspace.customTitles = nextTitles;
    persistNow();
  }
  renameWorkspaceVisible.value = false;
  renameWorkspaceId.value = null;
}
```

在模板末尾（与 ShortcutHelp 同级）加入对话框：

```html
<NModal
  v-model:show="renameWorkspaceVisible"
  preset="card"
  :title="uiText.app.workspaces"
  style="max-width: 360px"
  :mask-closable="true"
>
  <div style="display:flex; flex-direction:column; gap:12px;">
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span>{{ uiText.app.workspaceTitle }}</span>
      <NInput v-model:value="renameDraftTitle" :placeholder="uiText.app.workspaceTitlePlaceholder" />
    </label>
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span>{{ uiText.app.workspaceSlogan }}</span>
      <NInput v-model:value="renameDraftSlogan" :placeholder="uiText.app.workspaceSloganPlaceholder" />
    </label>
    <div style="display:flex; justify-content:flex-end; gap:8px;">
      <NButton @click="renameWorkspaceVisible = false">{{ uiText.common.cancel }}</NButton>
      <NButton type="primary" :disabled="!renameDraftTitle.trim()" @click="confirmRenameWorkspace">{{ uiText.common.confirm }}</NButton>
    </div>
  </div>
</NModal>
```

（`NButton` 已在 App.vue 顶部 import。）

- [ ] **Step 5: 更新 workbench-shell / app-render 测试**

- `workbench-shell.test.ts`：原先测 board-title 就地编辑/`updateTitle` emit 的用例需改为「渲染 `#workspace-trigger` 插槽内容 / 不再 emit updateTitle」。删除或改写相关断言；slogan 断言改为静态文本 `{{ slogan }}`。
- `app-render.test.ts`：若断言标题区可编辑或 `Mini Desk` 文本来自 EditableTitle，改为通过插槽渲染；标题默认值仍为 "Mini Desk"（activeTitle 回退）。

Run: `npx vitest run src/__tests__/workbench-shell.test.ts src/__tests__/app-render.test.ts`
Expected: PASS（按需调整断言后）。

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npx vue-tsc --noEmit && npm test`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/components/WorkbenchShell.vue src/App.vue src/__tests__/workbench-shell.test.ts src/__tests__/app-render.test.ts
git commit -m "feat: 标题区改为工作空间切换器入口，重命名走对话框"
```

---

## Task 9: 导入导出（单空间 / 全量）

**Files:**
- Modify: `src/components/SettingsMenu.vue`
- Modify: `src/App.vue`
- Modify: `src/__tests__/settings-menu.test.ts`（按需）
- Modify: `src/__tests__/state.test.ts`（导入形状补充）

- [ ] **Step 1: SettingsMenu 新增「导出当前空间」**

在 `SettingsMenu.vue` 的 `defineEmits` 增加：

```ts
  exportWorkspace: [anchor?: HTMLElement];
```

在 `options` 的 `data.children` 中，于 `export` 之后插入：

```ts
      { label: text.value.settings.exportCurrentWorkspace, key: "export-workspace", icon: renderIcon(CloudDownloadOutline) },
```

在 `handleSelect` 中加入：

```ts
  if (key === "export-workspace") emit("exportWorkspace", triggerRef.value ?? undefined);
```

- [ ] **Step 2: App.vue — export 单个空间（按 id 与「当前空间」）**

新增辅助与函数：

```ts
function slugifyTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "workspace";
  return trimmed.replace(/[\\/:*?"<>|]/g, "").slice(0, 24).trim() || "workspace";
}

function exportWorkspaceById(id: string, anchor?: HTMLElement): void {
  const workspace = state.workspaces.find((item) => item.id === id);
  if (!workspace) return;
  const serialized = getSerializableWorkspace(workspace, { includeImageData: true });
  const content = JSON.stringify({ miniDeskWorkspaceExport: true, version: 1, workspace: serialized }, null, 2);
  const title = workspace.customTitles["board-title"]?.trim() || "Mini Desk";
  downloadExportFile(content, `mini-desk-${slugifyTitle(title)}-${new Date().toISOString().slice(0, 10)}.json`);
  showBubble("dataExported", anchor, { hideCompanionAfter: true });
}

function exportCurrentWorkspace(anchor?: HTMLElement): void {
  exportWorkspaceById(state.activeWorkspaceId, anchor);
}
```

在 `<SettingsMenu>` 上新增：`@export-workspace="exportCurrentWorkspace"`。`@export="exportData"` 保持（全量导出）。

- [ ] **Step 3: App.vue — 导入三路分流**

把 `isImportPayload` 改为同时识别新形状：

```ts
function isImportPayload(payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = new Set(Object.keys(payload as Record<string, unknown>));
  if (keys.has("miniDeskWorkspaceExport")) return true;
  if (keys.has("workspaces")) return true;
  return [
    "theme", "companionGifTheme", "customCompanionGif", "customTitles",
    "noteLines", "workspaceLines", "storageLines", "spaces", "activeSpaceId",
    "images", "quickTags", "quickButtons", "quickOtherCollapsed", "showHiddenQuickButtons",
    "todoLists", "showCompletedTodos", "todos", "note", "workspace", "storage",
  ].some((key) => keys.has(key));
}

function isSingleWorkspaceExport(payload: Record<string, unknown>): boolean {
  return payload.miniWorkspaceExport === true || payload.miniDeskWorkspaceExport === true;
}
```

重写 `importData` 的确认分支（保持前面的文件读取/JSON 解析/`isImportPayload` 校验不变），把「确认覆盖」段替换为按形状分流：

```ts
  if (isSingleWorkspaceExport(parsed as Record<string, unknown>)) {
    let importedWorkspace: WorkspaceData;
    try {
      const raw = (parsed as { workspace?: unknown }).workspace;
      importedWorkspace = normalizeWorkspaceData(raw, state.language);
    } catch {
      showBubble("importDataInvalid", importFeedbackAnchor.value, { hideCompanionAfter: true });
      importFeedbackAnchor.value = undefined;
      input.value = "";
      return;
    }
    requestConfirmation(
      "confirmImportWorkspace",
      importFeedbackAnchor.value,
      () => {
        const workspace = ensureUniqueWorkspaceTitle(
          { ...importedWorkspace, id: createId(), createdAt: Date.now() },
          state.workspaces,
        );
        state.workspaces = [...state.workspaces, workspace];
        state.activeWorkspaceId = workspace.id;
        void persistWorkspaceImages([workspace]).then(() => {
          persistNow("all", { force: true });
          showBubble("dataImported", importFeedbackAnchor.value, { hideCompanionAfter: true });
        });
        importFeedbackAnchor.value = undefined;
        input.value = "";
      },
      () => {
        importFeedbackAnchor.value = undefined;
        input.value = "";
      },
      { confirmText: uiText.value.common.add, cancelText: uiText.value.common.cancel },
    );
    return;
  }

  let next: BoardState;
  try {
    next = normalizeImportedState(parsed);
  } catch {
    showBubble("importDataInvalid", importFeedbackAnchor.value, { hideCompanionAfter: true });
    importFeedbackAnchor.value = undefined;
    input.value = "";
    return;
  }
  requestConfirmation(
    "confirmImportData",
    importFeedbackAnchor.value,
    async () => {
      Object.assign(state, next);
      resetTextGenerationBaseline();
      await persistWorkspaceImages(state.workspaces);
      await persistImagePayloads([]);
      persistNow("all", { force: true });
      refreshTodoNotifications();
      showBubble("dataImported", importFeedbackAnchor.value, { hideCompanionAfter: true });
      importFeedbackAnchor.value = undefined;
      input.value = "";
    },
    () => {
      importFeedbackAnchor.value = undefined;
      input.value = "";
    },
    { confirmText: uiText.value.app.importOverwrite, cancelText: uiText.value.common.cancel, danger: true },
  );
```

新增持久化辅助（复用现有 `persistImagePayloads`，收集所有空间含 src 的图片）：

```ts
async function persistWorkspaceImages(workspaces: WorkspaceData[]): Promise<void> {
  const inline: (StoredImage & { src: string })[] = [];
  for (const workspace of workspaces) {
    for (const image of workspace.images) {
      if (image.src) inline.push(image as StoredImage & { src: string });
    }
  }
  if (inline.length > 0) await persistImagePayloads(inline);
}
```

> `StoredImage` 需加入 App.vue 的类型 import（若未引入）。

- [ ] **Step 4: 补充导入形状测试**

在 `src/__tests__/state.test.ts` 末尾追加（验证三种形状由 `normalizeImportedState` 正确归一；单空间信封的拆包在 App.vue，这里只测归一）：

```ts
  it("normalizeImportedState 接受多工作空间全量结构", () => {
    const state = normalizeImportedState({
      language: "en",
      workspaces: [
        { id: "a", customTitles: { "board-title": "A" } },
        { id: "b", customTitles: { "board-title": "B" } },
      ],
      activeWorkspaceId: "b",
    });
    expect(state.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
    expect(state.activeWorkspaceId).toBe("b");
    expect(state.language).toBe("en");
  });

  it("normalizeWorkspaceData 解析单空间信封里的 workspace", () => {
    const workspace = normalizeWorkspaceData(
      { id: "x", customTitles: { "board-title": "导入空间" }, noteLines: [{ text: "n", indent: 0 }] },
      "zh",
    );
    expect(workspace.customTitles["board-title"]).toBe("导入空间");
    expect(workspace.noteLines).toEqual([{ text: "n", indent: 0 }]);
    expect(workspace.id).toBe("x");
  });
```

- [ ] **Step 5: 更新 settings-menu 测试（若存在导出选项断言）**

Run: `npx vitest run src/__tests__/settings-menu.test.ts`
Expected: PASS（若用例枚举 data 子菜单项，新增的 export-workspace 不破坏断言；如有快照需更新）。

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npx vue-tsc --noEmit && npm test`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/components/SettingsMenu.vue src/App.vue src/__tests__/state.test.ts src/__tests__/settings-menu.test.ts
git commit -m "feat: 导入支持单空间/全量分流，导出支持单空间与全量"
```

---

## Task 10: 最终验证

- [ ] **Step 1: 构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 与 `vite build` 均成功。

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: 全绿。

- [ ] **Step 3: 手动冒烟（npm run dev）**

至少验证：
1. 现有数据自动显示为第一个工作空间，标题区显示「Mini Desk ▾」。
2. 点击标题 → 下拉框列出当前空间；「新建工作空间」输入标题+slogan 后创建并切换，标签页标题同步。
3. 在新空间内图片/快捷动作/提醒/备忘录为空且独立；切回原空间内容完好。
4. 重命名空间（标题/slogan）→ 顶部与标签标题同步更新。
5. 删除空间（仅剩 1 个时被拦截）。
6. 设置菜单「导出当前空间」生成 `mini-desk-<title>-<date>.json`；「数据导出」生成全量文件；导入单空间文件 → 作为新空间追加；导入全量文件 → 替换全部。
7. 跨标签：在另一标签修改内容，本标签同步（revision 机制未变）。

- [ ] **Step 4: 更新 CLAUDE.md（可选）**

在 `CLAUDE.md` 的「Key State Shape」段补一句：顶层 `state.workspaces: WorkspaceData[]` + `activeWorkspaceId`；内容字段位于活动工作空间内，运行时通过 `activeWorkspace` computed 访问。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "test: 多工作空间最终验证通过"
```

---

## Self-Review 备注

- **Spec 覆盖**：数据模型(T1)/存储策略(T1)/运行时投影(T4-5)/标题切换器与下拉(T7-8)/新建重命名删除排序(T2+T6+T8)/单空间与全量导入导出(T9)/迁移(T1 Step4+8)/跨标签同步与撤销(不变，T5 Step6-8 保证图片路径)/document.title(T6 Step2)/i18n(T3)——均覆盖。
- **类型一致**：`WorkspaceData`、`activeWorkspace`、`getSerializableWorkspace`、`normalizeWorkspaceData`、`createWorkspaceData`/`ensureUniqueWorkspaceTitle`/`removeWorkspace`/`reorderWorkspaces` 在定义与使用处签名一致；`exportWorkspaceById`/`exportCurrentWorkspace`/`switchWorkspace`/`createWorkspace`/`renameWorkspace`/`deleteWorkspace`/`reorderWorkspaceSections` 命名贯穿 T6-T9。
- **机械改写**：T4/T5 的 `state.<内容字段>` → `activeWorkspace.value.<内容字段>`（脚本）/ `activeWorkspace.<内容字段>`（模板）由 `vue-tsc` 确定性兜底，已在步骤中明确字段清单与验证命令。

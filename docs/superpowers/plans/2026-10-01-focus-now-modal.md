# 「现在做这个」专注弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提醒事项右键「现在做这个」打开全屏毛玻璃专注弹窗：任务计时（关窗即暂停、重开接续）、行内累计时长徽标（点击续做）、左 10% 贴图条 + 右 90% 记事本（完整复用 TextPanel/ImagePanel）。

**Architecture:** 数据挂 `TodoItem` 三个可选字段（`focusElapsedMs`/`focusNotes`/`focusImages`），随任务跨工作区移动。新组件 `TodoFocusModal.vue` 嵌入既有 `TextPanel` 与 `ImagePanel`；App.vue 持有 `focusSession` 做计时记账（60s checkpoint + beforeunload 合并 + 关窗合并落盘）。图片载荷走既有 IndexedDB 设施，保留 id 扫描与删除宽限机制全部扩展到 `focusImages`。

**Tech Stack:** Vue 3 + Naive UI（NModal）+ TypeScript + vitest（@vue/test-utils）。设计文档：`docs/superpowers/specs/2026-10-01-focus-now-design.md`。

**对设计文档的一处修正：** 设计文档写「导入归一化无需特殊迁移」——实际上 `normalizeTodo`（`src/state/storage/normalize.ts:472`）逐字段重建对象，**不收新字段就会被静默丢弃**。Task 2 必须扩展归一化屏障，此为安全边界（导入数据不可信）。

**已知测试噪声（CLAUDE.md）：** `npm test` 全量跑结束时 `Errors 1 error`（IndexedDB stub 未处理拒绝，来自 app-render.test.ts）与「输码验证 unknown/revoked」偶发失败均为既有噪声；单独重跑对应文件确认。

**图标：** TodoPanel 新增菜单项用 `TimerOutline`（`@vicons/ionicons5`），与现有 `renderIcon` 用法一致。

---

### Task 1: 状态层——TodoItem 字段 + updateTodoFocus + formatFocusDuration

**Files:**
- Modify: `src/types.ts:99-106`（TodoItem）
- Modify: `src/state/todos.ts`（新增两个导出函数）
- Test: `src/__tests__/todos.test.ts`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/todos.test.ts` 追加（沿用该文件现有 import 风格，`updateTodoText` 等已导入的基础上补 `updateTodoFocus, formatFocusDuration`）：

```ts
describe("updateTodoFocus", () => {
  const base = { morning: [{ id: "t1", text: "写周报", done: false }] };

  it("增量合并专注时长，未计时任务从零起算", () => {
    expect(updateTodoFocus(base, "morning", "t1", { addElapsedMs: 90_000 })).toEqual({
      morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 90_000 }],
    });
  });

  it("在既有累计之上累加", () => {
    const seeded = { morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 60_000 }] };
    expect(updateTodoFocus(seeded, "morning", "t1", { addElapsedMs: 1_500 })).toEqual({
      morning: [{ id: "t1", text: "写周报", done: false, focusElapsedMs: 61_500 }],
    });
  });

  it("笔记与图片整体替换；空数组删除字段保持无痕", () => {
    const seeded = {
      morning: [{
        id: "t1", text: "写周报", done: false,
        focusElapsedMs: 1_000,
        focusNotes: [{ text: "旧", indent: 0 }],
        focusImages: [{ id: "img1", createdAt: 1 }],
      }],
    };
    const next = updateTodoFocus(seeded, "morning", "t1", { focusNotes: [], focusImages: [] });
    expect(next.morning[0].focusNotes).toBeUndefined();
    expect(next.morning[0].focusImages).toBeUndefined();
    expect(next.morning[0].focusElapsedMs).toBe(1_000);
  });

  it("任务不存在时原样返回（引用相等）", () => {
    expect(updateTodoFocus(base, "morning", "nope", { addElapsedMs: 1 })).toBe(base);
  });

  it("不修改原对象（不可变）", () => {
    updateTodoFocus(base, "morning", "t1", { addElapsedMs: 1 });
    expect(base.morning[0].focusElapsedMs).toBeUndefined();
  });
});

describe("formatFocusDuration", () => {
  it("不足一小时显示 mm:ss", () => {
    expect(formatFocusDuration(0)).toBe("00:00");
    expect(formatFocusDuration(754_000)).toBe("12:34");
    expect(formatFocusDuration(59_999)).toBe("01:00"); // 向上取整到秒
  });
  it("超过一小时显示 h:mm:ss", () => {
    expect(formatFocusDuration(3_723_000)).toBe("1:02:03");
    expect(formatFocusDuration(3_600_000)).toBe("1:00:00");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/todos.test.ts`
Expected: FAIL，报 `updateTodoFocus is not a function` / `formatFocusDuration is not a function`（或 TS 导入错误）。

- [ ] **Step 3: 最小实现**

`src/types.ts` 的 `TodoItem`（99 行附近）改为：

```ts
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  starred?: boolean;
  notifyAt?: number;
  deadlineAt?: number;
  /** 「现在做这个」累计专注毫秒；仅 >0 时存在。 */
  focusElapsedMs?: number;
  /** 「现在做这个」随手记；与便签/空间 Tab 同构（含 marks 高亮元数据）。 */
  focusNotes?: LineItem[];
  /** 「现在做这个」贴图元数据；载荷走 IndexedDB（同工作区贴图设施）。 */
  focusImages?: StoredImage[];
}
```

`src/state/todos.ts` 顶部 import 补 `LineItem, StoredImage` 类型，追加：

```ts
export interface TodoFocusPatch {
  /** 增量合并进 focusElapsedMs（毫秒）。 */
  addElapsedMs?: number;
  /** 整体替换；空数组删除字段。 */
  focusNotes?: LineItem[];
  focusImages?: StoredImage[];
}

/** 「现在做这个」状态迁移：时长增量合并、笔记/图片整体替换，字段按需存在。 */
export function updateTodoFocus(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  patch: TodoFocusPatch,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period]?.find((item) => item.id === id);
  if (!todo) return todos;
  if (patch.addElapsedMs !== undefined) {
    const merged = Math.max(0, Math.round((todo.focusElapsedMs ?? 0) + patch.addElapsedMs));
    if (merged > 0) todo.focusElapsedMs = merged;
    else delete todo.focusElapsedMs;
  }
  if (patch.focusNotes !== undefined) {
    if (patch.focusNotes.length) todo.focusNotes = patch.focusNotes;
    else delete todo.focusNotes;
  }
  if (patch.focusImages !== undefined) {
    if (patch.focusImages.length) todo.focusImages = patch.focusImages;
    else delete todo.focusImages;
  }
  return next;
}

/** 累计专注时长的行内展示：mm:ss，满一小时 h:mm:ss（秒向上取整）。 */
export function formatFocusDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/todos.test.ts`
Expected: PASS（全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/state/todos.ts src/__tests__/todos.test.ts
git commit -m "feat: TodoItem 专注字段与 updateTodoFocus/formatFocusDuration 状态层"
```

---

### Task 2: 序列化与归一化屏障

**Files:**
- Modify: `src/state/storage/serialize.ts:125-136`（cloneTodos/cloneTodo 剥 focusImages 载荷 + 深克隆 focusNotes）
- Modify: `src/state/storage/normalize.ts:472-493`（normalizeTodo 收三个新字段）
- Test: `src/__tests__/todos.test.ts`（追加 describe）

- [ ] **Step 1: 写失败测试**

`src/__tests__/todos.test.ts` 追加（import 补 `normalizeImportedState` from `../state/storage`、`getSerializableState` from `../state/storage`）：

```ts
describe("focus 字段的序列化与归一化屏障", () => {
  const focusTodo = {
    id: "t1", text: "写周报", done: false,
    focusElapsedMs: 5_000,
    focusNotes: [{ text: "要点", indent: 1, marks: [{ type: "highlight", start: 0, end: 2 }] as never }],
    focusImages: [{ id: "img1", src: "data:image/png;base64,AAAA", createdAt: 9 }],
  };

  it("saveState 序列化剥除 focusImages 载荷只留元数据", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [structuredClone(focusTodo)];
    const serialized = getSerializableState(state);
    const todo = (serialized.workspaces[0].todos as Record<string, { focusImages?: { src?: string }[] }>).morning[0];
    expect(todo.focusImages?.[0].src).toBeUndefined();
  });

  it("normalizeImportedState 放行合法 focus 字段（含 marks）", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [structuredClone(focusTodo)];
    const restored = normalizeImportedState(JSON.parse(JSON.stringify(getSerializableState(state))));
    const todo = restored.workspaces[0].todos.morning[0];
    expect(todo.focusElapsedMs).toBe(5_000);
    expect(todo.focusNotes?.[0].text).toBe("要点");
    expect(todo.focusNotes?.[0].marks?.length).toBe(1);
    expect(todo.focusImages?.[0].id).toBe("img1");
  });

  it("normalizeImportedState 丢弃非法 focus 字段", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [{
      ...focusTodo,
      focusElapsedMs: -3, focusNotes: "不是数组", focusImages: [{ nope: true }, "x"],
    } as never];
    const restored = normalizeImportedState(JSON.parse(JSON.stringify(state)) as never);
    const todo = restored.workspaces[0].todos.morning[0];
    expect(todo.focusElapsedMs).toBeUndefined();
    expect(todo.focusNotes).toBeUndefined();
    expect(todo.focusImages).toBeUndefined();
  });
});
```

注：`defaultState` 从 `../state/defaults` 导入（app-render.test.ts:13 同款）。TextMark 具体形状以 `src/utils/textMarks.ts` 为准——若 `type/start/end` 字段名不符，按真实类型改写测试里的 marks 字面量；断言只要求「marks 存活」。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/todos.test.ts`
Expected: FAIL——第一断言 `src` 未剥除（serialize 未处理 focusImages），第二断言字段被 normalizeTodo 丢弃。

- [ ] **Step 3: 实现 serialize 剥除**

`src/state/storage/serialize.ts`：`cloneTodos`（125 行）加 `options` 参数并下传（`getSerializableWorkspace` 内的调用点同步改为 `cloneTodos(workspace.todos, todoLists, options)`）：

```ts
function cloneTodos(todos: TodoMap, todoLists: TodoListConfig[], options: { includeImageData?: boolean } = {}): TodoMap {
  return Object.fromEntries(
    todoLists.map((list) => [list.id, (todos[list.id] ?? []).map((todo) => cloneTodo(todo, options))]),
  ) as TodoMap;
}

function cloneTodo(todo: TodoItem, options: { includeImageData?: boolean } = {}): TodoItem {
  const next: TodoItem = { ...todo };
  delete next.deadlineAt;
  if (!isValidNotifyAt(next.notifyAt)) delete next.notifyAt;
  if (next.focusNotes) next.focusNotes = cloneLines(next.focusNotes);
  if (next.focusImages) {
    next.focusImages = next.focusImages.map((image) => {
      if (options.includeImageData) return { ...image };
      return {
        id: image.id,
        ...(image.payloadId ? { payloadId: image.payloadId } : {}),
        createdAt: image.createdAt,
        ...(image.displayWidth ? { displayWidth: image.displayWidth } : {}),
        ...(image.displayHeight ? { displayHeight: image.displayHeight } : {}),
      };
    });
  }
  return next;
}
```

（对照同文件 `images:` 映射（37-45 行）的元数据字段——两处必须一致；若 `getSerializableWorkspace` 的 `options` 参数名/类型不同，以现文件为准做等价下传。）

- [ ] **Step 4: 实现 normalize 收字段**

`src/state/storage/normalize.ts` 的 `normalizeTodo` 末尾（`return todo` 前）追加：

```ts
  const focusElapsedMs = clampInteger(record.focusElapsedMs, { min: 1 });
  if (focusElapsedMs !== undefined) todo.focusElapsedMs = focusElapsedMs;
  const focusNotes = normalizeLineCollection(record.focusNotes);
  if (focusNotes.length) todo.focusNotes = focusNotes;
  const focusImages = normalizeImages(record.focusImages);
  if (focusImages.length) todo.focusImages = focusImages;
```

（`clampInteger`/`normalizeLineCollection`/`normalizeImages` 均为本文件或 `./storage/shared` 既有导出——若签名不同，TS 会当场指出：`normalizeLineCollection` 以 `workspaceLines` 的用法为准；`normalizeImages` 以 `workspace.images` 的用法为准，等价对齐即可。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/__tests__/todos.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/state/storage/serialize.ts src/state/storage/normalize.ts src/__tests__/todos.test.ts
git commit -m "feat: 序列化剥除 focusImages 载荷，归一化屏障放行专注字段"
```

---

### Task 3: 保留 id 扫描 + 删除连坐清理

**Files:**
- Modify: `src/state/todos.ts`（新增 `collectTodoFocusPayloadIds`）
- Modify: `src/composables/useUndoHistory.ts:128-153`（extractRetainedImageIds）
- Modify: `src/App.vue:1385-1432`（isImagePayloadRetained / collectRetainedImagePayloadIds）
- Modify: `src/App.vue`（deleteTodoNow:2602 / clearDone:2620 / deleteTodoList:2396 / deleteWorkspace:1185 连坐）
- Test: `src/__tests__/todos.test.ts` + `src/__tests__/app-render.test.ts`

- [ ] **Step 1: 写失败测试（纯函数）**

`src/__tests__/todos.test.ts` 追加：

```ts
describe("collectTodoFocusPayloadIds", () => {
  it("收集全部 focusImages 的载荷 id（payloadId 优先）", () => {
    const todos = [
      { id: "t1", text: "a", done: false, focusImages: [{ id: "i1", payloadId: "p1", createdAt: 1 }] },
      { id: "t2", text: "b", done: false },
      { id: "t3", text: "c", done: false, focusImages: [{ id: "i2", createdAt: 2 }] },
    ];
    expect(collectTodoFocusPayloadIds(todos)).toEqual(["p1", "i2"]);
  });
  it("无 focusImages 时返回空数组", () => {
    expect(collectTodoFocusPayloadIds([{ id: "t", text: "a", done: false }])).toEqual([]);
  });
});

describe("extractRetainedImageIds 覆盖 focusImages", () => {
  it("扫描撤销快照 JSON 里 todos 下的 focusImages", () => {
    const parsed = {
      workspaces: [{
        id: "w1", images: [{ id: "board-img" }],
        todos: { morning: [{ id: "t1", focusImages: [{ id: "f1", payloadId: "fp1" }] }] },
      }],
    };
    const retained = extractRetainedImageIds(parsed);
    expect(retained.has("board-img")).toBe(true);
    expect(retained.has("fp1")).toBe(true);
  });
});
```

（import 补 `collectTodoFocusPayloadIds` from `../state/todos`、`extractRetainedImageIds` from `../composables/useUndoHistory`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/todos.test.ts`
Expected: FAIL——两个函数都还不认 focusImages。

- [ ] **Step 3: 实现 collectTodoFocusPayloadIds**

`src/state/todos.ts` 追加（顶部 import `getImagePayloadId` from `./images`——images.ts 不反向依赖 todos.ts，无环）：

```ts
/** 收集一批 todo 的 focusImages 载荷 id：删除连坐与保留扫描共用。 */
export function collectTodoFocusPayloadIds(todos: TodoItem[]): string[] {
  return todos.flatMap((todo) => (todo.focusImages ?? []).map((image) => getImagePayloadId(image)));
}
```

- [ ] **Step 4: 实现 extractRetainedImageIds 扩展**

`src/composables/useUndoHistory.ts` 的 `extractRetainedImageIds`，workspaces 循环内（`if (Array.isArray(record.images)) imageLists.push(record.images);` 之后）追加：

```ts
      const todos = record.todos;
      if (todos && typeof todos === "object" && !Array.isArray(todos)) {
        for (const list of Object.values(todos as Record<string, unknown>)) {
          if (!Array.isArray(list)) continue;
          for (const todo of list) {
            if (!todo || typeof todo !== "object" || Array.isArray(todo)) continue;
            const focus = (todo as Record<string, unknown>).focusImages;
            if (Array.isArray(focus)) imageLists.push(focus);
          }
        }
      }
```

- [ ] **Step 5: 实现 App.vue 扫描扩展**

`src/App.vue`：

```ts
function isImagePayloadRetained(payloadId: string): boolean {
  return state.workspaces.some((workspace) =>
    workspace.images.some((image) => getImagePayloadId(image) === payloadId) ||
    Object.values(workspace.todos).some((todos) =>
      (todoFocusImageIds(workspace) as readonly string[]).includes(payloadId)),
  );
}
```

不引入额外缓存，直接内联遍历（图片量级下足够快）：

```ts
function isImagePayloadRetained(payloadId: string): boolean {
  return state.workspaces.some((workspace) =>
    workspace.images.some((image) => getImagePayloadId(image) === payloadId) ||
    Object.values(workspace.todos).some((todos) =>
      todos.some((todo) => (todo.focusImages ?? []).some((image) => getImagePayloadId(image) === payloadId))),
  );
}
```

（用第二段内联版。）`collectRetainedImagePayloadIds`（1412 行）的 workspaces 循环改为：

```ts
  for (const workspace of state.workspaces) {
    for (const image of workspace.images) retained.add(getImagePayloadId(image));
    for (const todos of Object.values(workspace.todos)) {
      for (const id of collectTodoFocusPayloadIds(todos)) retained.add(id);
    }
  }
```

（顶部 import 补 `collectTodoFocusPayloadIds`，与既有 `updateTodoText` 同一导入块。）

- [ ] **Step 6: 删除路径连坐**

四处，全部在「从状态移除前」收集、`persistNow()` 之后 `scheduleImagePayloadDeletion`（与 deleteWorkspace:1199 同型）：

1. `deleteTodoNow`（2602 行）——`activeWorkspace.value.todos = removeTodoFromMap(...)` 之前插：

```ts
  const doomedFocusIds = collectTodoFocusPayloadIds(getTodos(period).filter((todo) => todo.id === id));
```

`persistNow();` 之后插：

```ts
  doomedFocusIds.forEach((payloadId) => scheduleImagePayloadDeletion(payloadId));
```

2. `clearDone`（2620 行）确认回调内，`clearCompleted(...)` 之前：

```ts
      const doomedFocusIds = collectTodoFocusPayloadIds(getTodos(period).filter((todo) => todo.done));
```

`persistNow();` 之后：

```ts
      doomedFocusIds.forEach((payloadId) => scheduleImagePayloadDeletion(payloadId));
```

3. `deleteTodoList`（2396 行）确认回调内——grep `function deleteTodoList` 找到移除列表数据的语句，在其前插：

```ts
    const doomedFocusIds = collectTodoFocusPayloadIds(getTodos(listId) ?? []);
```

该回调内 `persistNow()` 之后插：

```ts
    doomedFocusIds.forEach((payloadId) => scheduleImagePayloadDeletion(payloadId));
```

4. `deleteWorkspace`（1185 行）——`doomedPayloadIds` 集合构造改为：

```ts
      const doomedPayloadIds = new Set([
        ...(doomedWorkspace?.images ?? []).map((image) => getImagePayloadId(image)),
        ...Object.values(doomedWorkspace?.todos ?? {}).flatMap((todos) => collectTodoFocusPayloadIds(todos)),
      ]);
```

（1199 行的 forEach 保持不变。）

- [ ] **Step 7: 集成测试（app-render）**

`src/__tests__/app-render.test.ts` 追加（沿用该文件 mountApp + `installMemoryImageDb` 既有模式；参考现有删除工作区连坐用例的写法，grep `deleteWorkspace` 找同类断言）：

```ts
it("删除带专注图片的提醒事项后，宽限期结束清理其 IndexedDB 载荷", async () => {
  vi.useFakeTimers();
  // 参考本文件既有用例：seed localStorage（含 focusImages 元数据）→ mountApp
  // → 触发右键菜单删除该 todo（走 confirm stub）→ advance IMAGE_DELETE_GRACE_MS
  // → 断言 memory db 中该 payload id 已被删除、其余保留。
  // 具体模板：grep 本文件 “scheduleImagePayloadDeletion|删除工作区时同步清理” 同类用例照抄骨架。
  vi.useRealTimers();
});
```

**若本文件没有可直接照抄的骨架**（删除工作区连坐无现成断言），则退化为纯函数断言（collectTodoFocusPayloadIds / extractRetainedImageIds 已覆盖）+ 手动 playwright 验证，并在该用例位置写：跳过原因注释 + `it.todo(...)`。不许留空壳断言。

- [ ] **Step 8: 跑测试**

Run: `npx vitest run src/__tests__/todos.test.ts && npx vitest run src/__tests__/app-render.test.ts`
Expected: PASS（app-render 244+ 全绿；`Errors 1 error` 为已知噪声）。

- [ ] **Step 9: 提交**

```bash
git add src/state/todos.ts src/composables/useUndoHistory.ts src/App.vue src/__tests__/todos.test.ts src/__tests__/app-render.test.ts
git commit -m "feat: 保留扫描与删除连坐覆盖 focusImages（撤销宽限同机制）"
```

---

### Task 4: i18n 键

**Files:**
- Modify: `src/state/i18n.ts:743`（zh todo 块）+ `:1126`（en todo 块）

- [ ] **Step 1: 加键（zh）**

zh `todo: {` 块（743 行起）内 `todayFocus: "今日重点",` 之后插：

```ts
      focusNow: "现在做这个",
      focusDoing: "正在做",
      focusTimer: "专注计时",
      focusClosePause: "关闭并暂停计时",
      focusBadgeAria: "已专注 {time}，点击继续",
      focusNotesPlaceholder: "随手记…（同记事本：Tab 缩进、右键格式、Ctrl+S 保存）",
      focusImagesLabel: "专注贴图",
```

- [ ] **Step 2: 加键（en）**

en `todo: {` 块（1126 行起）同位置插：

```ts
      focusNow: "Do it now",
      focusDoing: "Now doing",
      focusTimer: "Focus timer",
      focusClosePause: "Close and pause the timer",
      focusBadgeAria: "Focused for {time}, click to continue",
      focusNotesPlaceholder: "Jot anything… (same editor as notes: Tab indent, right-click formats, Ctrl+S saves)",
      focusImagesLabel: "Focus images",
```

- [ ] **Step 3: 校验**

Run: `npx vitest run src/__tests__/i18n.test.ts`
Expected: PASS（该文件守护 zh/en 键齐平；若它按固定快照比对键集合，按其失败提示把新键补进期望清单——不许删守护逻辑）。

- [ ] **Step 4: 提交**

```bash
git add src/state/i18n.ts
git commit -m "feat: 「现在做这个」i18n 文案（zh/en）"
```

---

### Task 5: TodoPanel 菜单项 + 行内徽标

**Files:**
- Modify: `src/components/TodoPanel.vue:79-107`（emits）、`:189-232`（menuOptions）、`handleMenuSelect`（1218 行起）、todo 行模板（1958-1979 星标按钮旁）、today-focus 行模板（1731 行起）
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/todo-panel.test.ts` 追加（沿用本文件既有 mount TodoPanel 的 props 构造方式——grep 现有 `mount(TodoPanel` 用例照抄 props 骨架）：

```ts
describe("「现在做这个」入口", () => {
  it("右键菜单含首项「现在做这个」，选择后 emit focusNow", async () => {
    // 现有 props 骨架 + todos: { morning: [{ id: "t1", text: "写周报", done: false }] }
    // 1) 对该 todo 行 trigger("contextmenu") → nextTick
    // 2) 断言菜单第一项文本含「现在做这个」
    // 3) 点击该项 → emitted("focusNow") === [["morning", "t1"]]
  });

  it("已完成的任务同样显示菜单项（数据保留语义）", async () => {
    // done: true 的 todo，同样断言菜单含「现在做这个」
  });

  it("focusElapsedMs > 0 时行内渲染徽标，点击 emit focusNow", async () => {
    // todos 带 focusElapsedMs: 754_000 → 断言 .todo-focus-badge 文本含 "12:34"
    // → trigger("click") → emitted("focusNow")
  });

  it("无累计时长的任务不渲染徽标", () => {
    // 断言 .todo-focus-badge 不存在
  });

  it("今日聚焦区的行同样渲染徽标", async () => {
    // starred: true 的 todo（进今日聚焦）→ 断言 today-focus 区域内 .todo-focus-badge 存在
  });
});
```

（骨架级伪码必须落成可运行代码：参考本文件既有「星标」「删除」用例的真实 mount/查询写法。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/todo-panel.test.ts`
Expected: FAIL（无菜单项、无徽标、无 emit）。

- [ ] **Step 3: 实现**

1. emits（79-107 行）追加：

```ts
  focusNow: [period: TodoPeriod, id: string];
```

2. `menuOptions` 的 `if (menu.value?.id) {` 块（212 行）内、`copy` 之前插（icon import 补 `TimerOutline`）：

```ts
    options.push({ label: uiText.value.todo.focusNow, key: "focus-now", icon: renderIcon(TimerOutline) });
```

3. `handleMenuSelect`（1218 行起）在 `if (key.startsWith("move-list-ws:"))` 之前插：

```ts
  if (key === "focus-now" && id) {
    closeMenu();
    emit("focusNow", period, id);
    return;
  }
```

4. 普通列表行（星标按钮 1971-1979 之前、notify 按钮 1958 之后）插：

```html
                <button
                  v-if="(entry.todo.focusElapsedMs ?? 0) > 0"
                  class="todo-focus-badge"
                  type="button"
                  :aria-label="uiText.todo.focusBadgeAria.replace('{time}', formatFocusDuration(entry.todo.focusElapsedMs ?? 0))"
                  :title="uiText.todo.focusBadgeAria.replace('{time}', formatFocusDuration(entry.todo.focusElapsedMs ?? 0))"
                  @click.stop="emit('focusNow', list.id, entry.todo.id)"
                >
                  ⏱ {{ formatFocusDuration(entry.todo.focusElapsedMs ?? 0) }}
                </button>
```

5. today-focus 行（1731 行 `<a` 链接按钮之前的同类按钮区，与普通行同位序）插同款（`list.id` 换 `item.period`、`entry.todo` 换 `item.todo`）。

6. script 顶部 import：`import { formatFocusDuration } from "../state/todos";`（并入既有 `../state/todos` 导入块；若 TodoPanel 未直接导入过 todos.ts，新增一行）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/todo-panel.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/TodoPanel.vue src/__tests__/todo-panel.test.ts
git commit -m "feat: 提醒事项右键「现在做这个」+ 行内累计时长徽标"
```

---

### Task 6: ImagePanel hideHeader 紧凑形态

**Files:**
- Modify: `src/components/ImagePanel.vue:18-26`（props）+ `:592`（panel-header）
- Test: `src/__tests__/image-panel.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it("hideHeader 时不渲染面板标题行", () => {
  // mount ImagePanel with hideHeader + 一张图 → 断言 .panel-header 不存在、图片卡片仍渲染
});
it("默认渲染面板标题行", () => {
  // 断言 .panel-header 存在（守护默认形态不回归）
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/image-panel.test.ts`
Expected: FAIL（无 hideHeader prop）。

- [ ] **Step 3: 实现**

props（18-26 行）加：

```ts
  /** true = 紧凑形态：隐藏标题行（专注弹窗贴图条），对齐 TextPanel 的 hideHeader 先例。 */
  hideHeader?: boolean;
```

592 行改为：

```html
    <div v-if="!hideHeader" class="panel-header desk-zone-heading" @contextmenu="openTitleMenu">
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/image-panel.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/ImagePanel.vue src/__tests__/image-panel.test.ts
git commit -m "feat: ImagePanel 支持 hideHeader 紧凑形态"
```

---

### Task 7: TodoFocusModal 组件

**Files:**
- Create: `src/components/TodoFocusModal.vue`
- Test: `src/__tests__/focus-modal.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `src/__tests__/focus-modal.test.ts`（naive-ui stub 与 mount 模式参考 `src/__tests__/text-panel.test.ts` / `workspace-inbox-dialog.test.ts` 的文件头）：

```ts
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodoFocusModal from "../components/TodoFocusModal.vue";

vi.mock("naive-ui", async () => {
  const { createNaiveUiStubModule } = await import("./helpers/naive-ui-mock");
  return createNaiveUiStubModule();
});

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(TodoFocusModal, {
    props: {
      show: true,
      title: "写周报",
      baseMs: 754_000,
      notes: [{ text: "第一行", indent: 0 }],
      images: [],
      ...overrides,
    },
    global: { stubs: { TextPanel: true, ImagePanel: true, ImagePreview: true } },
  });
}

describe("TodoFocusModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  });

  it("渲染任务标题与初始累计计时（12:34）", () => {
    const wrapper = mountModal();
    expect(wrapper.text()).toContain("写周报");
    expect(wrapper.find(".focus-now-timer").text()).toBe("12:34");
  });

  it("每秒推进计时显示", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("12:36");
  });

  it("baseMs 提升（App checkpoint）后显示接续不跳变", async () => {
    const wrapper = mountModal();
    vi.advanceTimersByTime(60_000);
    await wrapper.setProps({ baseMs: 754_000 + 60_000 });
    vi.advanceTimersByTime(1_000);
    await nextTick();
    expect(wrapper.find(".focus-now-timer").text()).toBe("13:35"); // 754s+60s+1s
  });

  it("关闭按钮 emit close（App 负责合并增量）", async () => {
    const wrapper = mountModal();
    await wrapper.get(".focus-now-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("TextPanel 更新上抛为 notesUpdate", async () => {
    const wrapper = mountModal();
    wrapper.getComponent({ name: "TextPanel" }).vm.$emit("update", [{ text: "新", indent: 0 }]);
    await nextTick();
    expect(wrapper.emitted("notesUpdate")?.[0]).toEqual([[{ text: "新", indent: 0 }]]);
  });

  it("ImagePanel hideHeader 渲染且 paste 事件上抛", async () => {
    const wrapper = mountModal({ images: [{ id: "i1", createdAt: 1 }] });
    expect(wrapper.findComponent({ name: "ImagePanel" }).props("hideHeader")).toBe(true);
    wrapper.findComponent({ name: "ImagePanel" }).vm.$emit("paste", { placement: "append" });
    await nextTick();
    expect(wrapper.emitted("pasteImage")).toHaveLength(1);
  });
});
```

（stub 的组件名大小写以 naive-ui-mock/真实组件名为准；`wrapper.getComponent({ name: "TextPanel" })` 需要非 stub 或用 `findComponent` + emitted 组合——以现有 text-panel/space-panel 测试的写法校准。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/focus-modal.test.ts`
Expected: FAIL——组件文件不存在。

- [ ] **Step 3: 实现组件**

`src/components/TodoFocusModal.vue`：

```vue
<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NModal } from "naive-ui";
import { CloseOutline } from "@vicons/ionicons5";
import type { AppLanguage, ImagePasteRequest, LineItem, StoredImage } from "../types";
import { getUiText } from "../state/i18n";
import { formatFocusDuration } from "../state/todos";
import type { PolishKind, PolishResult, PolishStyle } from "../sync/polishClient";
import TextPanel from "./TextPanel.vue";
import ImagePanel from "./ImagePanel.vue";

const ImagePreview = defineAsyncComponent(() => import("./ImagePreview.vue"));

const props = withDefaults(defineProps<{
  show: boolean;
  /** 任务文本（弹窗标题）。 */
  title: string;
  /** 已累计专注毫秒（App 每 60s checkpoint 时提升）。 */
  baseMs: number;
  notes: LineItem[];
  images: StoredImage[];
  language?: AppLanguage;
  polish?: (kind: PolishKind, text: string, style?: PolishStyle) => Promise<PolishResult>;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  /** 关闭（=暂停）：App 计算并合并本次增量。 */
  close: [];
  notesUpdate: [lines: LineItem[]];
  pasteImage: [request: ImagePasteRequest];
  dropImageFiles: [files: File[], targetId?: string];
  copyImage: [id: string];
  deleteImage: [id: string, anchor?: HTMLElement];
  reorderImages: [dragId: string, targetId: string];
  moveImageToBottom: [id: string];
}>();

const uiText = computed(() => getUiText(props.language));
const nowTick = ref(Date.now());
const segmentStartAt = ref(Date.now());
let displayTimer: number | undefined;

onMounted(() => {
  displayTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => window.clearInterval(displayTimer));
// App checkpoint 提升 baseMs 时重置段起点：显示 = baseMs + (now - 段起点)，接续不跳变。
watch(() => props.baseMs, () => {
  segmentStartAt.value = Date.now();
});

const displayMs = computed(() => props.baseMs + Math.max(0, nowTick.value - segmentStartAt.value));
const displayDuration = computed(() => formatFocusDuration(displayMs.value));

const activePreviewId = ref<string>();
const previewClosing = ref(false);

function openPreview(id: string): void {
  activePreviewId.value = id;
}

function closePreview(): void {
  previewClosing.value = true;
  window.setTimeout(() => {
    activePreviewId.value = undefined;
    previewClosing.value = false;
  }, 180);
}

function handlePreviewShow(value: boolean): void {
  if (!value) closePreview();
}

function handleModalShow(value: boolean): void {
  if (!value) emit("close");
}
</script>

<template>
  <NModal
    :show="show"
    class="focus-now-modal"
    :title="uiText.todo.focusDoing"
    :aria-label="uiText.todo.focusTimer"
    :mask-closable="true"
    @update:show="handleModalShow"
    @esc="emit('close')"
  >
    <div class="focus-now-stage">
      <header class="focus-now-header">
        <h2 class="focus-now-title" :title="title">{{ title }}</h2>
        <time class="focus-now-timer" :datetime="String(displayMs)">{{ displayDuration }}</time>
        <button
          class="focus-now-close"
          type="button"
          :aria-label="uiText.todo.focusClosePause"
          :title="uiText.todo.focusClosePause"
          @click="emit('close')"
        >
          <AppCloseIcon />
        </button>
      </header>
      <div class="focus-now-body">
        <aside class="focus-now-images" :aria-label="uiText.todo.focusImagesLabel">
          <ImagePanel
            :title="uiText.todo.focusImagesLabel"
            :images="images"
            :active-preview-id="activePreviewId"
            :language="language"
            hide-header
            @preview="openPreview"
            @close-preview="closePreview"
            @copy="(id: string) => emit('copyImage', id)"
            @delete="(id: string, anchor?: HTMLElement) => emit('deleteImage', id, anchor)"
            @reorder="(dragId: string, targetId: string) => emit('reorderImages', dragId, targetId)"
            @move-to-bottom="(id: string) => emit('moveImageToBottom', id)"
            @paste="(request: ImagePasteRequest) => emit('pasteImage', request)"
            @drop-files="(files: File[], _anchor: HTMLElement | undefined, targetId: string | undefined) => emit('dropImageFiles', files, targetId)"
          />
        </aside>
        <section class="focus-now-notes">
          <TextPanel
            :title-id="'focus-now-notes-title'"
            :title="uiText.todo.focusDoing"
            :lines="notes"
            :placeholder="uiText.todo.focusNotesPlaceholder"
            :language="language"
            :polish="polish"
            hide-header
            @update="(lines: LineItem[]) => emit('notesUpdate', lines)"
            @title-update="() => {}"
          />
        </section>
      </div>
    </div>
    <ImagePreview
      v-if="activePreviewId"
      :images="images"
      :active-id="activePreviewId"
      :closing="previewClosing"
      :language="language"
      @close="closePreview"
      @update:show="handlePreviewShow"
      @copy="(id: string) => emit('copyImage', id)"
      @paste="(request: ImagePasteRequest) => emit('pasteImage', request)"
      @drop-files="(files: File[]) => emit('dropImageFiles', files)"
      @delete="(id: string) => emit('deleteImage', id)"
    />
  </NModal>
</template>
```

要点（实现时校准，禁止留 TODO）：
- `AppCloseIcon` 不存在——直接用 `<span aria-hidden="true">✕</span>` 或按 `ImagePreview.vue` 现有关闭按钮的实现抄（grep `focus-now-close` 不存在就 grep 该组件的 close 按钮）。以最终代码为准删除本条注释。
- `ImagePreview` 的 emits/props 以 `src/components/ImagePreview.vue` 真实定义为准（App.vue 3789-3801 有接线样例），对齐后删掉本组件里用不到的事件。`edit` 事件 v1 显式不接（右键菜单里的编辑项保持可用性由 ImagePanel 内部处理；预览内编辑留待后续）。
- `@esc`：NModal 无此事件——Esc 默认触发 `update:show(false)`，删掉 `@esc`，`handleModalShow` 已覆盖。
- TextPanel 的 `focus`/`blur`/`guide`/`polishMessage` 事件本组件不消费可不接；`titleUpdate` 传空函数（title 不可编辑）。若 TextPanel 要求必传事件再补空 handler。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/focus-modal.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/TodoFocusModal.vue src/__tests__/focus-modal.test.ts
git commit -m "feat: TodoFocusModal 专注弹窗组件（计时/记事本/贴图条）"
```

---

### Task 8: App.vue 接线（session 计时、notes 持久化、focus 图片管线、粘贴路由、hydration）

**Files:**
- Modify: `src/App.vue`（多处，见下）
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/app-render.test.ts` 追加：

```ts
it("「现在做这个」端到端：打开→计时→关闭合并→徽标接续", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  // 1) seed：默认工作区 morning 列表一条 todo { id: "t1", text: "写周报", done: false }
  // 2) mountApp → TodoPanel 组件 vm.$emit("focusNow", "morning", "t1")
  // 3) advanceTimersByTime(90_000)（跳过 60s checkpoint）→ nextTick
  // 4) 断言 .focus-now-timer 文本推进；断言 focusSession 期间 localStorage 里有 checkpoint 后的 focusElapsedMs≥60_000
  // 5) trigger .focus-now-close click → advanceTimersByTime(0)
  // 6) 断言徽标 .todo-focus-badge 出现且文本 = "01:30"
  // 7) 再次 emit focusNow → 断言计时从 01:30 起跳（不归零）
  vi.useRealTimers();
});

it("专注弹窗内 TextPanel 笔记写入 focusNotes 并防抖保存", async () => {
  // mountApp → 打开专注弹窗 → getComponent TextPanel → $emit("update", [{text:"记录",indent:0}])
  // → advance 3s（text 防抖）→ 重新 loadState 断言 focusNotes 落盘
});

it("弹窗打开期间 document paste 的图片路由进 focusImages", async () => {
  // installMemoryImageDb + mountApp → 打开弹窗 → document.dispatchEvent(构造含 image item 的 paste 事件)
  // → 断言 todo.focusImages 长度 1、工作区 images 不变
});
```

（骨架必须按本文件既有「右键菜单」「粘贴图片」用例的真实写法落成可运行代码：grep `paste` / `contextmenu` 找模板。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/app-render.test.ts`
Expected: FAIL（无弹窗无 session）。

- [ ] **Step 3: 实现 session 计时**

App.vue script（放在 `openQuickApp` 附近的功能函数区）：

```ts
const FOCUS_CHECKPOINT_MS = 60_000;
const focusSession = ref<{ period: TodoPeriod; id: string; startedAt: number } | null>(null);
let focusCheckpointTimer: number | undefined;

const focusTodo = computed(() => {
  const session = focusSession.value;
  if (!session) return undefined;
  return getTodos(session.period).find((todo) => todo.id === session.id);
});

/** 打开即开始计时：先水合该任务 focusImages（幽灵条目过滤），再建 session。 */
async function openFocusNow(period: TodoPeriod, id: string): Promise<void> {
  if (focusSession.value) return;
  const todo = getTodos(period).find((item) => item.id === id);
  if (!todo) return;
  if (todo.focusImages?.length) {
    const hydrated = (await hydrateStoredImages(todo.focusImages)).filter((image) => Boolean(image.src));
    if (hydrated.length !== todo.focusImages.length) {
      activeWorkspace.value.todos = updateTodoFocus(activeWorkspace.value.todos, period, id, {
        focusImages: hydrated,
      });
    }
  }
  focusSession.value = { period, id, startedAt: Date.now() };
  window.clearInterval(focusCheckpointTimer);
  focusCheckpointTimer = window.setInterval(() => mergeFocusElapsed(true), FOCUS_CHECKPOINT_MS);
}

/** 合并本次段增量（关窗/checkpoint/beforeunload 共用）；persist=true 时静默落盘。 */
function mergeFocusElapsed(persist: boolean): void {
  const session = focusSession.value;
  if (!session) return;
  const delta = Date.now() - session.startedAt;
  session.startedAt = Date.now();
  if (delta <= 0) return;
  activeWorkspace.value.todos = updateTodoFocus(activeWorkspace.value.todos, session.period, session.id, {
    addElapsedMs: delta,
  });
  markDirty();
  if (persist) persistNow();
}

function closeFocusNow(): void {
  if (!focusSession.value) return;
  mergeFocusElapsed(true);
  window.clearInterval(focusCheckpointTimer);
  focusCheckpointTimer = undefined;
  focusSession.value = null;
}
```

- [ ] **Step 4: beforeunload 合并**

beforeunload 处理器（grep `Closing the tab mid-debounce`，662 行附近），在现有冲刷逻辑之前插：

```ts
  if (focusSession.value) mergeFocusElapsed(false);
```

（其后该处理器既有的保存逻辑把合并结果一并落盘。）

- [ ] **Step 5: notes 持久化**

```ts
function updateFocusNotes(period: TodoPeriod, id: string, lines: LineItem[]): void {
  activeWorkspace.value.todos = updateTodoFocus(activeWorkspace.value.todos, period, id, { focusNotes: lines });
  markDirty();
  scheduleTextSave();
}
```

（与 `updateSpaceLines`(771) 同口径：state 写入 + markDirty + scheduleTextSave 防抖。）

- [ ] **Step 6: focus 图片管线**

```ts
type FocusDestination = { period: TodoPeriod; id: string };

function findFocusTodo(destination: FocusDestination): TodoItem | undefined {
  return getTodos(destination.period).find((item) => item.id === destination.id);
}

function insertFocusImage(image: StoredImage, destination: FocusDestination, afterId?: string): boolean {
  const todo = findFocusTodo(destination);
  if (!todo) return false;
  const list = [...(todo.focusImages ?? [])];
  const index = afterId ? list.findIndex((item) => item.id === afterId) : -1;
  if (index >= 0) list.splice(index + 1, 0, image);
  else list.push(image);
  activeWorkspace.value.todos = updateTodoFocus(activeWorkspace.value.todos, destination.period, destination.id, {
    focusImages: list,
  });
  return true;
}

function replaceFocusImages(destination: FocusDestination, mutate: (list: StoredImage[]) => StoredImage[]): void {
  const todo = findFocusTodo(destination);
  if (!todo) return;
  activeWorkspace.value.todos = updateTodoFocus(activeWorkspace.value.todos, destination.period, destination.id, {
    focusImages: mutate([...(todo.focusImages ?? [])]),
  });
  persistNow();
}

async function copyFocusImage(id: string, anchor?: HTMLElement): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const image = focusTodo.value?.focusImages?.find((item) => item.id === id);
  if (!image?.src) return;
  await writeImageToClipboard(image, anchor);
}

function deleteFocusImage(id: string, anchor?: HTMLElement): void {
  requestConfirmation("confirmDeleteImage", anchor, async () => {
    const session = focusSession.value;
    const todo = focusTodo.value;
    if (!session || !todo) return;
    const deleted = todo.focusImages?.find((item) => item.id === id);
    replaceFocusImages(session, (list) => list.filter((item) => item.id !== id));
    if (deleted) scheduleImagePayloadDeletion(getImagePayloadId(deleted));
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel, danger: true });
}
```

重构（DRY）：把 `copyImage`(1920) 的剪贴板写入体抽成 `writeImageToClipboard(image: StoredImage, anchor?: HTMLElement): Promise<void>`，`copyImage` 委托调用——行为不变。

低层管线参数化：
- `addImageFile`（1685）options 加 `destination?: FocusDestination`；原 `insertStoredImage(image, options.insertAfterId); if (persistNow("images")) options.onPersisted?.(image);`（1729-1730）改为：

```ts
  if (options.destination) {
    if (!insertFocusImage(image, options.destination, options.insertAfterId)) {
      try {
        await deleteStoredImage(image);
      } catch {
        // Best-effort cleanup when the focus todo disappears mid-paste.
      }
      return undefined;
    }
    persistNow();
    return image;
  }
  insertStoredImage(image, options.insertAfterId);
  if (persistNow("images")) options.onPersisted?.(image);
```

- `addImageFiles`（1735）加第四参 `destination?: FocusDestination`，循环内 `addImageFile(file, { showMessage: false, insertAfterId, destination })`；收尾 `copyImage(added.at(-1)!.id, anchor)` 在 destination 场景改为 `publishPasteFeedback(added.at(-1)!.id)`（不复制到剪贴板）。
- `addPastedImageFile`（1577）加第三参 `destination?: FocusDestination`：`placement === "append"` 分支改为 `return addImageFile(file, { showMessage: true, onPersisted: (image) => publishPasteFeedback(image.id), destination });`；非 append 分支忽略 destination（弹窗内调用方只传 append——见下）。
- `pasteImageFromClipboard`（1503）加第二参 `destination?: FocusDestination` 并透传给 `addPastedImageFile`。

- [ ] **Step 7: document 粘贴路由**

`handlePaste`（1490）在 `await addPastedImageFile(file, request);` 处改为：

```ts
  if (focusSession.value) {
    await addPastedImageFile(file, { placement: "append" }, {
      period: focusSession.value.period,
      id: focusSession.value.id,
    });
    return;
  }
  await addPastedImageFile(file, request);
```

- [ ] **Step 8: 模板挂载**

TodoPanel 接线（3690-3712 的属性区）加：

```html
          @focus-now="openFocusNow"
```

模板 ImagePreview（3789）之后挂载：

```html
    <TodoFocusModal
      :show="Boolean(focusSession && focusTodo)"
      :title="focusTodo?.text ?? ''"
      :base-ms="focusTodo?.focusElapsedMs ?? 0"
      :notes="focusTodo?.focusNotes ?? []"
      :images="focusTodo?.focusImages ?? []"
      :language="state.language"
      :polish="polishClipboard"
      @close="closeFocusNow"
      @notes-update="(lines) => focusSession && updateFocusNotes(focusSession.period, focusSession.id, lines)"
      @paste-image="(request) => focusSession && pasteImageFromClipboard(request, { period: focusSession.period, id: focusSession.id })"
      @drop-image-files="(files, targetId) => focusSession && addImageFiles(files, undefined, targetId, { period: focusSession.period, id: focusSession.id })"
      @copy-image="copyFocusImage"
      @delete-image="deleteFocusImage"
      @reorder-images="(dragId, targetId) => focusSession && replaceFocusImages({ period: focusSession.period, id: focusSession.id }, (list) => { moveItem(list, dragId, targetId); return list; })"
      @move-image-to-bottom="(id) => focusSession && replaceFocusImages({ period: focusSession.period, id: focusSession.id }, (list) => { const i = list.findIndex((item) => item.id === id); if (i >= 0 && i < list.length - 1) list.push(...list.splice(i, 1)); return list; })"
    />
```

（`TodoFocusModal` import；`moveItem` 已在 App.vue 既有导入——reorderImages:1774 在用。`polishClipboard` 即 TodoPanel 现有 `:polish` 同源函数，grep 确认名字。）

- [ ] **Step 9: 跑测试**

Run: `npx vitest run src/__tests__/app-render.test.ts src/__tests__/focus-modal.test.ts`
Expected: PASS（已知噪声除外）。

- [ ] **Step 10: 提交**

```bash
git add src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: App 接线专注弹窗——session 计时/笔记持久化/贴图管线/粘贴路由"
```

---

### Task 9: 样式 + 视觉取证 + 全量验证

**Files:**
- Modify: `src/styles.css`（追加 focus-now 与徽标样式）
- 可能 Modify: `src/components/TodoFocusModal.vue`（视觉微调）

- [ ] **Step 1: 样式**

`src/styles.css` 追加（token 参照同文件 `.n-modal-mask`(446) 与 today-focus 徽标类；亮暗双主题）：

```css
/* 「现在做这个」行内徽标：累计专注时长，点击续做 */
.todo-focus-badge {
  flex: none;
  border: none;
  background: var(--todo-focus-badge-bg, rgba(59, 130, 246, 0.12));
  color: var(--todo-focus-badge-fg, #3b82f6);
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
html[data-theme="dark"] .todo-focus-badge {
  background: rgba(96, 165, 250, 0.18);
  color: #93c5fd;
}

/* 专注弹窗：专属强虚化遮罩（18px），不影响其他弹窗的 6px 材质 */
.n-modal-container.focus-now-modal .n-modal-mask {
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  backdrop-filter: blur(18px) saturate(1.4);
  background: rgba(15, 23, 42, 0.45);
}
html[data-theme="dark"] .n-modal-container.focus-now-modal .n-modal-mask {
  background: rgba(0, 0, 0, 0.55);
}

.focus-now-stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(1080px, 86vw);
  height: min(720px, 82vh);
}
.focus-now-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.focus-now-title {
  flex: 1;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.focus-now-timer {
  font-size: 40px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.focus-now-close {
  flex: none;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
}
.focus-now-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(96px, 10%) 1fr;
  gap: 12px;
}
.focus-now-images {
  min-height: 0;
  overflow: hidden;
}
.focus-now-notes {
  min-height: 0;
  min-width: 0;
}
@media (max-width: 940px) {
  .focus-now-body {
    grid-template-columns: 72px 1fr;
  }
  .focus-now-timer {
    font-size: 28px;
  }
}
```

（颜色若与既有 token 不一致，以同文件相邻徽标/按钮的实际变量为准替换——不许引入游离新色。）

- [ ] **Step 2: 视觉取证（playwright，本机既定方案）**

```bash
npm run dev &   # 记录端口（默认 5173）
python3.12 - <<'PY'
# 参照 memory: playwright-visual-probe-setup（缓存 chromium）
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("http://localhost:5173")
    # 造一条 todo → 右键 → 菜单点「现在做这个」→ 截图
    page.keyboard.insert_text("视觉取证任务")
    page.locator(".todo-input").first.click()
    page.screenshot(path="/tmp/focus-1-menu.png")
    page.on("contextmenu", lambda e: e.prevent_default())
    page.locator(".todo-item").first.click(button="right")
    page.get_by_text("现在做这个").click()
    page.wait_for_selector(".focus-now-timer")
    page.screenshot(path="/tmp/focus-2-modal.png")
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/focus-3-ticking.png")
    browser.close()
PY
```

检查三张截图：弹窗外全部虚化认不出、计时器走动、10% 贴图条不破版、右 90% 记事本光标可用。发现问题回改 Task 7/9 样式后重截。

- [ ] **Step 3: 全量验证**

```bash
npm test
npx vue-tsc --noEmit
npm run build
```

Expected: 测试全绿（已知噪声除外）；tsc 0 错；build 成功。

- [ ] **Step 4: 提交**

```bash
git add src/styles.css src/components/TodoFocusModal.vue
git commit -m "feat: 专注弹窗样式——强虚化遮罩/计时器/贴图条布局"
```

---

## Self-Review 记录

- **Spec 覆盖**：数据模型(T1)、序列化/归一化(T2，含对设计文档的修正)、保留扫描+删除连坐(T3)、i18n(T4)、菜单+徽标(T5)、hideHeader(T6)、弹窗组件(T7)、App 接线含 checkpoint/beforeunload/粘贴路由/hydration(T8)、强虚化+视觉验证(T9)。完成→保留语义：T1 字段不因 done 变化、T5 菜单对 done 可用（测试覆盖）。
- **类型一致性**：`updateTodoFocus(todos, period, id, patch)` 全计划统一；`collectTodoFocusPayloadIds(todos): string[]`；`formatFocusDuration(ms): string`；emit 名 `focusNow`/模板 `@focus-now`；`FocusDestination` 仅 App.vue 内部。
- **无占位符**：Task 3 Step 7 与 Task 5/8 Step 1 的测试骨架必须落成真实代码——已显式标注「照抄本文件既有用例写法」，执行者不得留伪码提交。

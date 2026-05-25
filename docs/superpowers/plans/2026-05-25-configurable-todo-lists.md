# Configurable Todo Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the reminder area from three fixed lists into configurable reminder lists with add, delete, collapse, compact, and drag sorting.

**Architecture:** Add dynamic `TodoListConfig` state, migrate old fixed-period data into it, and make todo helpers operate on string list ids. `TodoPanel` renders from list configs and emits list-level events; `App.vue` owns persistence, deletion confirmation, and notification scanning.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vue Test Utils, Vite.

---

## File Structure

- Modify `src/types.ts`: replace closed `TodoPeriod` usage with dynamic `TodoListId`, add `TodoListConfig`, update todo records and drag payloads.
- Modify `src/state/defaults.ts`: add default list configs and default dynamic todo records.
- Modify `src/state/storage.ts`: normalize and serialize `todoLists`, dynamic todo records, and dynamic completed visibility.
- Modify `src/state/todos.ts`: make helper functions no-op safely for missing ids and add list-level helpers.
- Modify `src/components/TodoPanel.vue`: render dynamic lists; add list menu actions, add-list button, collapse/compact classes, and list drag sorting.
- Modify `src/App.vue`: pass `todoLists`, implement list create/update/delete/toggle/reorder handlers, migrate notification and guide logic to dynamic ids.
- Modify `src/__tests__/state.test.ts`: cover migration, serialization, dynamic ids, list deletion, and list reorder.
- Modify `src/__tests__/todo-panel.test.ts`: cover dynamic rendering and list interaction events.
- Modify `src/__tests__/app-render.test.ts`: cover app-level persistence, confirmation deletion, and list ordering.
- Modify `src/__tests__/naive-components.test.ts` only if template snapshots or static expectations fail after `TodoPanel` changes.

---

### Task 1: Dynamic List State and Storage

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/defaults.ts`
- Modify: `src/state/storage.ts`
- Test: `src/__tests__/state.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add tests to `src/__tests__/state.test.ts`:

```ts
it("creates default configurable todo lists for new users", () => {
  const state = defaultState();

  expect(state.todoLists.map((list) => ({ id: list.id, title: list.title }))).toEqual([
    { id: "morning", title: "☀️ 早上" },
    { id: "noon", title: "🌤️ 中午" },
    { id: "evening", title: "🌙 晚上" },
  ]);
  expect(Object.keys(state.todos)).toEqual(["morning", "noon", "evening"]);
  expect(state.showCompletedTodos).toEqual({ morning: false, noon: false, evening: false });
});

it("migrates legacy fixed reminder lists into configurable todoLists", () => {
  const state = normalizeImportedState({
    customTitles: {
      "todo-morning-title": "上午",
      "todo-noon-title": "中段",
    },
    showCompletedTodos: { morning: true },
    todos: {
      morning: [{ id: "a", text: "A", done: false }],
      noon: [{ id: "b", text: "B", done: true }],
      evening: [],
    },
  });

  expect(state.todoLists.map((list) => [list.id, list.title])).toEqual([
    ["morning", "上午"],
    ["noon", "中段"],
    ["evening", "🌙 晚上"],
  ]);
  expect(state.todos.morning.map((todo) => todo.text)).toEqual(["A"]);
  expect(state.todos.noon.map((todo) => todo.text)).toEqual(["B"]);
  expect(state.showCompletedTodos).toEqual({ morning: true, noon: false, evening: false });
});

it("normalizes persisted dynamic todo lists and drops orphan todo records", () => {
  const state = normalizeImportedState({
    todoLists: [
      { id: "work", title: "工作", collapsed: true, compact: false },
      { id: "life", title: "", collapsed: false, compact: true },
    ],
    showCompletedTodos: { work: true, orphan: true },
    todos: {
      work: [{ id: "a", text: "A", done: false }],
      life: [{ id: "b", text: "B", done: true }],
      orphan: [{ id: "x", text: "X", done: false }],
    },
  });

  expect(state.todoLists).toEqual([
    { id: "work", title: "工作", collapsed: true, compact: false },
    { id: "life", title: "未命名列表", collapsed: false, compact: true },
  ]);
  expect(Object.keys(state.todos)).toEqual(["work", "life"]);
  expect(state.showCompletedTodos).toEqual({ work: true, life: false });
});

it("serializes configurable todo lists without orphan records", () => {
  const state = normalizeImportedState({
    todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: true }],
    todos: { custom: [{ id: "a", text: "A", done: false }], ghost: [{ id: "g", text: "G", done: false }] },
    showCompletedTodos: { custom: true, ghost: true },
  });

  const stored = getSerializableState(state);

  expect(stored.todoLists).toEqual([{ id: "custom", title: "自定义", collapsed: false, compact: true }]);
  expect(Object.keys(stored.todos)).toEqual(["custom"]);
  expect(stored.showCompletedTodos).toEqual({ custom: true });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: FAIL because `todoLists` and dynamic todo normalization do not exist yet.

- [ ] **Step 3: Implement types and defaults**

In `src/types.ts`, add dynamic list types:

```ts
export type TodoListId = string;
export type TodoPeriod = TodoListId;
export type TodoCompletedVisibility = Record<TodoListId, boolean>;

export interface TodoListConfig {
  id: TodoListId;
  title: string;
  collapsed: boolean;
  compact: boolean;
}

export type TodoMap = Record<TodoListId, TodoItem[]>;
```

Add `todoLists: TodoListConfig[]` to `BoardState`.

In `src/state/defaults.ts`, add default list configs and derive default records:

```ts
export const DEFAULT_TODO_LISTS: TodoListConfig[] = [
  { id: "morning", title: "☀️ 早上", collapsed: false, compact: false },
  { id: "noon", title: "🌤️ 中午", collapsed: false, compact: false },
  { id: "evening", title: "🌙 晚上", collapsed: false, compact: false },
];

export const TODO_PERIODS: TodoListId[] = DEFAULT_TODO_LISTS.map((list) => list.id);
```

Use cloned defaults inside `defaultState()`:

```ts
todoLists: cloneDefaultTodoLists(),
showCompletedTodos: createDefaultCompletedVisibility(),
todos: createDefaultTodoMap(),
```

- [ ] **Step 4: Implement storage normalization**

In `src/state/storage.ts`, add helpers:

```ts
const LEGACY_TODO_TITLE_IDS: Record<string, string> = {
  morning: "todo-morning-title",
  noon: "todo-noon-title",
  evening: "todo-evening-title",
};

function normalizeTodoLists(value: unknown, customTitles: Record<string, string>): TodoListConfig[] {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const lists = value
      .map((item) => normalizeTodoListConfig(item))
      .filter((item): item is TodoListConfig => Boolean(item))
      .map((list) => {
        let id = list.id;
        while (seen.has(id)) id = createId();
        seen.add(id);
        return { ...list, id };
      });
    if (lists.length > 0) return lists;
  }

  return DEFAULT_TODO_LISTS.map((list) => ({
    ...list,
    title: customTitles[LEGACY_TODO_TITLE_IDS[list.id] ?? ""] || list.title,
  }));
}

function normalizeTodoListConfig(item: unknown): TodoListConfig | null {
  if (!isPlainObject(item)) return null;
  const record = item as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  const title = typeof record.title === "string" && record.title.trim()
    ? record.title.trim()
    : "未命名列表";
  return {
    id: record.id.trim(),
    title,
    collapsed: Boolean(record.collapsed),
    compact: Boolean(record.compact),
  };
}
```

Change `normalizeCompletedVisibility` and `normalizeTodos` to receive `todoLists` and iterate their ids instead of `TODO_PERIODS`.

- [ ] **Step 5: Run storage tests and verify pass**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/state/defaults.ts src/state/storage.ts src/__tests__/state.test.ts
git commit -m "feat: add configurable todo list state"
```

---

### Task 2: Todo Helper Operations for Dynamic Lists

**Files:**
- Modify: `src/state/todos.ts`
- Test: `src/__tests__/state.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add tests to `src/__tests__/state.test.ts`:

```ts
it("edits reminders in arbitrary todo list ids", () => {
  const todos = {
    custom: [{ id: "a", text: "A", done: false }],
  };

  const added = addTodo(todos, "custom", { id: "b", text: "B", done: false });
  const updated = updateTodoText(added, "custom", "b", "B2");
  const notified = setTodoNotifyAt(updated, "custom", "b", new Date(2026, 4, 25, 9).getTime());
  const completed = completeTodo(notified, "custom", "b", true);

  expect(completed.custom.map((todo) => [todo.id, todo.text, todo.done])).toEqual([
    ["a", "A", false],
    ["b", "B2", true],
  ]);
  expect(completed.custom[1].notifyAt).toBe(new Date(2026, 4, 25, 9).getTime());
});

it("treats missing todo list ids as no-ops", () => {
  const todos = { custom: [{ id: "a", text: "A", done: false }] };

  expect(updateTodoText(todos, "missing", "a", "B")).toEqual(todos);
  expect(completeTodo(todos, "missing", "a", true)).toEqual(todos);
  expect(moveTodo(todos, "missing", "a", "custom")).toEqual(todos);
  expect(moveTodo(todos, "custom", "a", "missing")).toEqual(todos);
});

it("removes and reorders configurable todo lists without mutating reminders", () => {
  const state = normalizeImportedState({
    todoLists: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ],
    todos: {
      a: [{ id: "ta", text: "A", done: false }],
      b: [{ id: "tb", text: "B", done: false }],
      c: [],
    },
  });

  const reordered = reorderTodoLists(state.todoLists, "c", "a");
  const removed = removeTodoListData(state.todos, state.showCompletedTodos, "b");

  expect(reordered.map((list) => list.id)).toEqual(["c", "a", "b"]);
  expect(Object.keys(removed.todos)).toEqual(["a", "c"]);
  expect(removed.todos.a[0].text).toBe("A");
});
```

Update imports to include `updateTodoText`, `reorderTodoLists`, and `removeTodoListData`.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: FAIL because helpers are still fixed-list oriented and list helper functions do not exist.

- [ ] **Step 3: Implement dynamic todo helper behavior**

In `src/state/todos.ts`, make `cloneTodoMap` generic:

```ts
export function cloneTodoMap(todos: TodoMap): TodoMap {
  return Object.fromEntries(
    Object.entries(todos).map(([listId, items]) => [
      listId,
      items.map((todo) => ({ ...todo })),
    ]),
  );
}
```

Guard each helper before reading `next[listId]`:

```ts
const list = next[listId];
if (!list) return todos;
```

Add list-level helpers:

```ts
export function removeTodoListData(
  todos: TodoMap,
  showCompleted: TodoCompletedVisibility,
  listId: TodoListId,
): { todos: TodoMap; showCompletedTodos: TodoCompletedVisibility } {
  const nextTodos = cloneTodoMap(todos);
  const nextVisibility = { ...showCompleted };
  delete nextTodos[listId];
  delete nextVisibility[listId];
  return { todos: nextTodos, showCompletedTodos: nextVisibility };
}

export function reorderTodoLists(lists: TodoListConfig[], draggedId: TodoListId, targetId: TodoListId): TodoListConfig[] {
  const sourceIndex = lists.findIndex((list) => list.id === draggedId);
  const targetIndex = lists.findIndex((list) => list.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return lists;
  const next = lists.map((list) => ({ ...list }));
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}
```

- [ ] **Step 4: Run state tests and verify pass**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/todos.ts src/__tests__/state.test.ts
git commit -m "feat: support dynamic todo list helpers"
```

---

### Task 3: TodoPanel Dynamic List UI

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: Write failing component tests**

Add tests to `src/__tests__/todo-panel.test.ts`:

```ts
const defaultTodoLists = [
  { id: "morning", title: "☀️ 早上", collapsed: false, compact: false },
  { id: "noon", title: "🌤️ 中午", collapsed: false, compact: false },
  { id: "evening", title: "🌙 晚上", collapsed: false, compact: false },
];

it("renders reminder sections from configurable todo lists", () => {
  const wrapper = mount(TodoPanel, {
    props: {
      todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: false }],
      todos: { custom: [{ id: "a", text: "A", done: false }] },
      showCompleted: { custom: false },
      titles: DEFAULT_TITLES,
    },
    global: { stubs: { NCheckbox: checkboxStub, NDropdown: dropdownStub, NTooltip: tooltipStub } },
  });

  expect(wrapper.find('.todo-section[data-list-id="custom"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="todo-list-custom"]').exists()).toBe(true);
  expect(values(wrapper)).toEqual(["A"]);
});

it("emits list creation and list title updates", async () => {
  const wrapper = mount(TodoPanel, {
    props: {
      todoLists: defaultTodoLists,
      todos: { morning: [], noon: [], evening: [] },
      showCompleted: { morning: false, noon: false, evening: false },
      titles: DEFAULT_TITLES,
    },
    global: { stubs: { NCheckbox: checkboxStub, NDropdown: dropdownStub, NTooltip: tooltipStub } },
  });

  await wrapper.get(".todo-add-list-button").trigger("click");
  expect(wrapper.emitted("createList")?.[0]).toEqual([expect.any(HTMLElement)]);
});

it("emits collapse compact delete and list reorder actions", async () => {
  const wrapper = mount(TodoPanel, {
    props: {
      todoLists: defaultTodoLists,
      todos: { morning: [{ id: "a", text: "A", done: false }], noon: [], evening: [] },
      showCompleted: { morning: false, noon: false, evening: false },
      titles: DEFAULT_TITLES,
    },
    global: { stubs: { NCheckbox: checkboxStub, NDropdown: dropdownStub, NTooltip: tooltipStub } },
  });

  await wrapper.get('.todo-section[data-list-id="morning"] .todo-section-menu-button').trigger("click");
  expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("折叠");

  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "折叠")?.trigger("click");
  await wrapper.get('.todo-section[data-list-id="morning"] .todo-section-menu-button').trigger("click");
  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "收缩")?.trigger("click");
  await wrapper.get('.todo-section[data-list-id="morning"] .todo-section-menu-button').trigger("click");
  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除列表")?.trigger("click");

  expect(wrapper.emitted("toggleListCollapsed")?.[0]).toEqual(["morning", true]);
  expect(wrapper.emitted("toggleListCompact")?.[0]).toEqual(["morning", true]);
  expect(wrapper.emitted("deleteList")?.[0]).toEqual(["morning", expect.any(HTMLElement)]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: FAIL because `TodoPanel` has no `todoLists` prop or list actions yet.

- [ ] **Step 3: Update `TodoPanel` props and emitted events**

Add props and events:

```ts
const props = defineProps<{
  todoLists: TodoListConfig[];
  todos: TodoMap;
  titles: Record<string, string>;
  showCompleted?: TodoCompletedVisibility;
  editListId?: TodoListId | null;
}>();

const emit = defineEmits<{
  createList: [anchor?: HTMLElement];
  updateListTitle: [listId: TodoListId, title: string];
  toggleListCollapsed: [listId: TodoListId, collapsed: boolean];
  toggleListCompact: [listId: TodoListId, compact: boolean];
  deleteList: [listId: TodoListId, anchor?: HTMLElement];
  reorderLists: [draggedId: TodoListId, targetId: TodoListId];
  // keep existing reminder events keyed by TodoListId
}>();
```

Replace `TODO_PERIODS.map(...)` with `props.todoLists.map((list) => list.id)` and render `v-for="list in todoLists"`.

- [ ] **Step 4: Add list menu options and classes**

Update section actions:

```ts
return [
  { label: list.collapsed ? "展开" : "折叠", key: "toggle-collapsed" },
  { label: list.compact ? "恢复" : "收缩", key: "toggle-compact" },
  { label: isCompletedVisible(list.id) ? "隐藏已完成" : "显示已完成", key: "toggle-completed" },
  { label: "清理已完成", key: "clear-completed" },
  { label: "删除列表", key: "delete-list", disabled: props.todoLists.length <= 1 },
  guideMenuOption,
];
```

In the template, add:

```vue
<button class="todo-add-list-button icon-button" type="button" aria-label="新增提醒列表" @click="emit('createList', $event.currentTarget as HTMLElement)">＋</button>
```

List sections should use:

```vue
:data-list-id="list.id"
:data-period="list.id"
:class="{ 'is-focused': focusedListId === list.id, 'is-collapsed': list.collapsed, 'is-compact': list.compact }"
```

Hide list body with `v-if="!list.collapsed"` while keeping the section drop target.

- [ ] **Step 5: Add list drag sorting**

Add a separate list drag ref:

```ts
const draggedListId = ref<TodoListId | null>(null);
```

Use a heading drag handle:

```vue
<button
  class="todo-list-drag-handle"
  type="button"
  draggable="true"
  aria-label="拖动提醒列表"
  @dragstart="draggedListId = list.id"
  @dragend="draggedListId = null"
/>
```

On section dragover/drop:

```ts
function handleListSectionDrop(event: DragEvent, listId: TodoListId): void {
  if (draggedListId.value) {
    event.preventDefault();
    emit("reorderLists", draggedListId.value, listId);
    draggedListId.value = null;
    return;
  }
  handleTodoSectionDrop(event, listId);
}
```

- [ ] **Step 6: Run component tests and verify pass**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/TodoPanel.vue src/__tests__/todo-panel.test.ts
git commit -m "feat: render configurable todo lists"
```

---

### Task 4: App Integration and Persistence

**Files:**
- Modify: `src/App.vue`
- Modify: `src/__tests__/app-render.test.ts`
- Modify: `src/__tests__/naive-components.test.ts` if static template checks need updated selectors

- [ ] **Step 1: Write failing app tests**

Add tests to `src/__tests__/app-render.test.ts`:

```ts
it("creates a configurable reminder list and persists it", async () => {
  const wrapper = mountApp();

  await wrapper.get(".todo-add-list-button").trigger("click");
  await nextTick();

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  expect(stored.todoLists).toHaveLength(4);
  expect(stored.todoLists.at(-1).title).toBe("未命名列表");
  expect(stored.todos[stored.todoLists.at(-1).id]).toEqual([]);
});

it("confirms deletion of a non-empty reminder list and removes its reminders", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...defaultState(),
    todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
    todos: { work: [{ id: "a", text: "A", done: false }] },
    showCompletedTodos: { work: false },
  }));
  const wrapper = mountApp();

  await wrapper.get('.todo-section[data-list-id="work"] .todo-section-menu-button').trigger("click");
  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除列表")?.trigger("click");

  expect(wrapper.get('[data-testid="companion-confirm"]').text()).toMatch(/删除列表|提醒事项/);

  await wrapper.get('[data-testid="companion-yes"]').trigger("click");
  await nextTick();

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  expect(stored.todoLists.some((list: { id: string }) => list.id === "work")).toBe(false);
  expect(stored.todos.work).toBeUndefined();
});

it("persists reminder list reorder", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...defaultState(),
    todoLists: [
      { id: "a", title: "A", collapsed: false, compact: false },
      { id: "b", title: "B", collapsed: false, compact: false },
    ],
    todos: { a: [], b: [] },
    showCompletedTodos: { a: false, b: false },
  }));
  const wrapper = mountApp();

  await wrapper.get('.todo-section[data-list-id="a"] .todo-list-drag-handle').trigger("dragstart");
  await wrapper.get('.todo-section[data-list-id="b"]').trigger("drop");

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  expect(stored.todoLists.map((list: { id: string }) => list.id)).toEqual(["b", "a"]);
});
```

Use existing app test helpers for `mountApp`, companion button selectors, and timer flushing where necessary.

- [ ] **Step 2: Run app tests and verify they fail**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: FAIL because app handlers and persistence are not wired.

- [ ] **Step 3: Wire `TodoPanel` in `App.vue`**

Pass new props:

```vue
<TodoPanel
  :todo-lists="state.todoLists"
  :edit-list-id="pendingEditTodoListId"
  :todos="state.todos"
  :show-completed="state.showCompletedTodos"
  @create-list="createTodoList"
  @update-list-title="updateTodoListTitle"
  @toggle-list-collapsed="toggleTodoListCollapsed"
  @toggle-list-compact="toggleTodoListCompact"
  @delete-list="deleteTodoList"
  @reorder-lists="reorderTodoListSections"
/>
```

- [ ] **Step 4: Implement app list handlers**

Add handlers:

```ts
const pendingEditTodoListId = ref<string | null>(null);

function createTodoList(anchor?: HTMLElement): void {
  const id = createId();
  state.todoLists.push({ id, title: "未命名列表", collapsed: false, compact: false });
  state.todos[id] = [];
  state.showCompletedTodos[id] = false;
  pendingEditTodoListId.value = id;
  persistNow();
  showBubbleText("已新增提醒列表", anchor);
}

function updateTodoListTitle(listId: TodoListId, title: string): void {
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.title = title.trim() || "未命名列表";
  persistNow();
}

function toggleTodoListCollapsed(listId: TodoListId, collapsed: boolean): void {
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.collapsed = collapsed;
  persistNow();
}

function toggleTodoListCompact(listId: TodoListId, compact: boolean): void {
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.compact = compact;
  persistNow();
}
```

Deletion should block the last list, delete empty lists immediately, and confirm non-empty deletion:

```ts
function deleteTodoList(listId: TodoListId, anchor?: HTMLElement): void {
  if (state.todoLists.length <= 1) {
    showBubbleText("至少保留一个提醒列表", anchor);
    return;
  }
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  const remove = () => removeTodoList(listId, anchor);
  if ((state.todos[listId] ?? []).length === 0) {
    remove();
    return;
  }
  requestConfirmation(
    "confirmDeleteTodoList",
    anchor,
    remove,
    undefined,
    { confirmText: "删除列表", cancelText: "取消" },
  );
}
```

- [ ] **Step 5: Replace fixed-period app loops**

Replace `TODO_PERIODS` loops with `state.todoLists.map((list) => list.id)` in:

- `findOpenBlankTodo`
- `triggerDueTodoNotifications`
- `isGuideAreaEmpty`
- any helper that validates a todo list id

Use `getTodoListTitle(listId)` for notification fallback text.

- [ ] **Step 6: Run app tests and verify pass**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/App.vue src/__tests__/app-render.test.ts src/__tests__/naive-components.test.ts
git commit -m "feat: manage configurable todo lists"
```

---

### Task 5: Styling, Build, and Browser Smoke Test

**Files:**
- Modify: `src/style.css` or the existing stylesheet containing todo panel rules
- Test: rendered app in local browser

- [ ] **Step 1: Add focused CSS test coverage if static checks fail**

If `naive-components.test.ts` or component tests indicate class expectations need coverage, add static assertions for:

```ts
expect(todo).toContain("todo-add-list-button");
expect(todo).toContain("todo-list-drag-handle");
expect(todo).toContain("is-collapsed");
expect(todo).toContain("is-compact");
```

- [ ] **Step 2: Add compact and collapsed styling**

Add CSS so:

- `.todo-section.is-collapsed` keeps only heading visible.
- `.todo-section.is-compact .todo-list` has a smaller max height and denser item padding.
- `.todo-list-drag-handle` is visually distinct from `.todo-drag-handle`.
- `.todo-add-list-button` sits near the list group and uses the existing icon-button style.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Vite chunk-size warnings are acceptable if unchanged.

- [ ] **Step 4: Start or reuse local dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: local app available at `http://127.0.0.1:5173/`.

- [ ] **Step 5: Browser smoke test**

Open `http://127.0.0.1:5173/` and verify:

- Existing three lists load with old titles and reminders.
- New list creation adds a section and title can be edited.
- Collapse hides reminders and expand restores them.
- Compact mode reduces section height without hiding the heading.
- Deleting a non-empty list shows a confirmation and removes the list after confirm.
- Drag sorting lists changes the visual order and persists after reload.

- [ ] **Step 6: Final commit if styling changed**

```bash
git add src/style.css src/__tests__/naive-components.test.ts
git commit -m "style: polish configurable todo lists"
```

---

## Self-Review

- Spec coverage: the plan covers dynamic state, migration, add/delete/rename, collapse, compact, drag sorting, persistence, existing reminder behavior, and confirmation deletion.
- Placeholder scan: no task relies on unspecified implementation steps; all behavioral changes have concrete tests and target files.
- Type consistency: the plan uses `TodoListId` for dynamic ids and keeps `TodoPeriod` as a compatibility alias while the implementation is migrated.

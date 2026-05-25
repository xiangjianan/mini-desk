# Board Iteration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first small version of the board iteration: notification time semantics, text drag/drop, auto-renumbered ordered lists, workspace create focus, quick dialog cancel, and completed clear affordances.

**Architecture:** Keep the current Vue/Vite structure and fixed `morning` / `noon` / `evening` reminder groups. Add `notifyAt` as the new reminder time field while accepting old `deadlineAt` during load/import. Keep notification time display independent from star status and avoid changing reminder ordering in this phase.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, @vue/test-utils, Naive UI.

---

## File Map

- Modify `src/types.ts`: add `notifyAt?: number` to `TodoItem`; keep `deadlineAt?: number` as legacy input compatibility until all call sites stop writing it.
- Modify `src/state/deadlines.ts`: introduce notification-time exports and keep compatibility aliases for existing tests during migration.
- Modify `src/state/storage.ts`: normalize `notifyAt`, migrate valid legacy `deadlineAt`, serialize only `notifyAt`.
- Modify `src/state/todos.ts`: add `setTodoNotifyAt`; stop clearing notification time when star is removed; keep ordering independent from `notifyAt`.
- Modify `src/utils/textEditor.ts`: add ordered-list normalization helpers and external-text append helpers.
- Modify `src/components/TextPanel.vue`: auto-renumber editor text, unlock on selection, emit external text drops.
- Modify `src/components/SpacePanel.vue`: emit append/drop events for the active space and enter tab edit after create.
- Modify `src/components/TodoPanel.vue`: show notification time for all todos, render the new popup layout, handle focus refresh, external text drops, and completed divider clear button.
- Modify `src/components/QuickButtons.vue`: replace the edit-dialog delete button with a cancel button.
- Modify `src/App.vue`: wire new events and state functions for `notifyAt`, external text append, multi-line todo creation, and workspace create editing.
- Modify `src/styles.css`: notification popup two-column/clock layout, flexible todo text width, clear button, and drag-over affordances.
- Modify tests under `src/__tests__`: cover each changed behavior with focused Vitest cases.

---

### Task 1: Notification Time State and Helpers

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/deadlines.ts`
- Modify: `src/state/storage.ts`
- Modify: `src/state/todos.ts`
- Test: `src/__tests__/deadlines.test.ts`
- Test: `src/__tests__/state.test.ts`

- [ ] **Step 1: Update tests for notification helper naming**

In `src/__tests__/deadlines.test.ts`, change imports and describe label from deadline language to notification language:

```ts
import { describe, expect, it } from "vitest";
import {
  NOTIFY_TIME_OPTIONS,
  DEFAULT_NOTIFY_TIME,
  createNotifyAt,
  getDefaultNotifySelection,
  getNotifyDisplay,
  getLocalDateInputValue,
} from "../state/deadlines";

describe("notification time helpers", () => {
  it("uses a small set of common whole-hour choices", () => {
    expect(NOTIFY_TIME_OPTIONS).toEqual(["09:00", "12:00", "15:00", "18:00", "21:00"]);
    expect(DEFAULT_NOTIFY_TIME).toBe("09:00");
  });

  it("creates a local timestamp from a date and whole-hour time", () => {
    const timestamp = createNotifyAt("2026-05-30", "15:00");
    expect(timestamp).toBe(new Date(2026, 4, 30, 15, 0, 0, 0).getTime());
  });

  it("defaults missing time to 09:00 and rejects malformed dates", () => {
    expect(createNotifyAt("2026-05-30")).toBe(new Date(2026, 4, 30, 9, 0, 0, 0).getTime());
    expect(createNotifyAt("", "18:00")).toBeNull();
    expect(createNotifyAt("2026/05/30", "18:00")).toBeNull();
    expect(createNotifyAt("2026-13-30", "18:00")).toBeNull();
    expect(createNotifyAt("2026-05-30", "18:30")).toBeNull();
  });

  it("formats local dates for native date inputs", () => {
    expect(getLocalDateInputValue(new Date(2026, 4, 7, 9))).toBe("2026-05-07");
  });

  it("chooses the next common whole-hour notification time by default", () => {
    expect(getDefaultNotifySelection(new Date(2026, 4, 25, 8, 0))).toEqual({
      date: "2026-05-25",
      time: "09:00",
    });
    expect(getDefaultNotifySelection(new Date(2026, 4, 25, 10, 0))).toEqual({
      date: "2026-05-25",
      time: "12:00",
    });
    expect(getDefaultNotifySelection(new Date(2026, 4, 25, 21, 0))).toEqual({
      date: "2026-05-26",
      time: "09:00",
    });
  });

  it("classifies overdue, due-soon, upcoming, and later notification times", () => {
    const now = new Date(2026, 4, 25, 10).getTime();

    expect(getNotifyDisplay(new Date(2026, 4, 25, 9).getTime(), now)).toEqual({
      label: "! 已超期",
      compactLabel: "! 已超期",
      urgency: "overdue",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 25, 18).getTime(), now)).toEqual({
      label: "今天下午 6:00",
      compactLabel: "今天 18",
      urgency: "due-soon",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 26, 9).getTime(), now)).toEqual({
      label: "明天上午 9:00",
      compactLabel: "明天 09",
      urgency: "due-soon",
    });
    expect(getNotifyDisplay(new Date(2026, 4, 27, 18).getTime(), now)).toEqual({
      label: "2天后 下午 6:00",
      compactLabel: "2天后 18",
      urgency: "upcoming",
    });
    expect(getNotifyDisplay(new Date(2026, 5, 2, 18).getTime(), now)).toEqual({
      label: "6/2 下午 6:00",
      compactLabel: "6/2 18",
      urgency: "later",
    });
  });

  it("returns null for missing or invalid notification timestamps", () => {
    expect(getNotifyDisplay(undefined)).toBeNull();
    expect(getNotifyDisplay(Number.NaN)).toBeNull();
    expect(getNotifyDisplay(-1)).toBeNull();
  });
});
```

- [ ] **Step 2: Add state tests for migration and star decoupling**

Append these cases to `src/__tests__/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getSerializableState, normalizeImportedState } from "../state/storage";
import { starTodo, setTodoNotifyAt } from "../state/todos";

it("migrates legacy deadlineAt to notifyAt and serializes only notifyAt", () => {
  const legacyAt = new Date(2026, 4, 25, 18).getTime();
  const state = normalizeImportedState({
    todos: {
      morning: [{ id: "a", text: "legacy", done: false, starred: true, deadlineAt: legacyAt }],
      noon: [],
      evening: [],
    },
  });

  expect(state.todos.morning[0]).toMatchObject({ notifyAt: legacyAt });
  expect("deadlineAt" in state.todos.morning[0]).toBe(false);
  expect(getSerializableState(state).todos.morning[0]).toMatchObject({ notifyAt: legacyAt });
  expect("deadlineAt" in getSerializableState(state).todos.morning[0]).toBe(false);
});

it("keeps notification time when star is removed", () => {
  const notifyAt = new Date(2026, 4, 25, 18).getTime();
  const todos = {
    morning: [{ id: "a", text: "task", done: false, starred: true, notifyAt }],
    noon: [],
    evening: [],
  };

  expect(starTodo(todos, "morning", "a", false).morning[0]).toMatchObject({
    starred: false,
    notifyAt,
  });
});

it("sets and clears notification time without changing starred state", () => {
  const notifyAt = new Date(2026, 4, 25, 18).getTime();
  const todos = {
    morning: [{ id: "a", text: "task", done: false, starred: true }],
    noon: [],
    evening: [],
  };

  const withNotify = setTodoNotifyAt(todos, "morning", "a", notifyAt);
  expect(withNotify.morning[0]).toMatchObject({ starred: true, notifyAt });

  const withoutNotify = setTodoNotifyAt(withNotify, "morning", "a", undefined);
  expect(withoutNotify.morning[0]).toMatchObject({ starred: true });
  expect(withoutNotify.morning[0].notifyAt).toBeUndefined();
});
```

Merge the new imports into the existing import block in `src/__tests__/state.test.ts` so each module is imported once.

- [ ] **Step 3: Run focused state tests and verify failure**

Run:

```bash
npm test -- src/__tests__/deadlines.test.ts src/__tests__/state.test.ts
```

Expected: FAIL because notification exports and `setTodoNotifyAt` do not exist yet, and legacy migration still writes `deadlineAt`.

- [ ] **Step 4: Implement notification fields and aliases**

In `src/types.ts`, update `TodoItem`:

```ts
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  starred?: boolean;
  notifyAt?: number;
  deadlineAt?: number;
}
```

In `src/state/deadlines.ts`, add notification-named exports while keeping aliases:

```ts
export const NOTIFY_TIME_OPTIONS = ["09:00", "12:00", "15:00", "18:00", "21:00"] as const;
export const DEFAULT_NOTIFY_TIME = "09:00";

export type NotifyTimeOption = typeof NOTIFY_TIME_OPTIONS[number];
export type NotifyUrgency = "overdue" | "due-soon" | "upcoming" | "later";

export interface NotifyDisplay {
  label: string;
  compactLabel: string;
  urgency: NotifyUrgency;
}

export const DEADLINE_TIME_OPTIONS = NOTIFY_TIME_OPTIONS;
export const DEFAULT_DEADLINE_TIME = DEFAULT_NOTIFY_TIME;
export type DeadlineTimeOption = NotifyTimeOption;
export type DeadlineUrgency = NotifyUrgency;
export type DeadlineDisplay = NotifyDisplay;
```

Rename the implementation functions to `createNotifyAt`, `getDefaultNotifySelection`, and `getNotifyDisplay`, then export aliases at the bottom:

```ts
export const createDeadlineAt = createNotifyAt;
export const getDefaultDeadlineSelection = getDefaultNotifySelection;
export const getDeadlineDisplay = getNotifyDisplay;
export const isValidDeadlineAt = isValidNotifyAt;
```

Keep `getDeadlineTimeLabel` as an alias or wrapper around `getNotifyTimeLabel`:

```ts
export function getNotifyTimeLabel(time: NotifyTimeOption): string {
  return NOTIFY_TIME_LABELS[time];
}

export const getDeadlineTimeLabel = getNotifyTimeLabel;
```

- [ ] **Step 5: Implement storage migration**

In `src/state/storage.ts`, update `normalizeTodo` to prefer `notifyAt` and migrate valid `deadlineAt`:

```ts
function normalizeTodo(item: unknown): TodoItem | null {
  if (!isPlainObject(item)) return null;
  const record = item as Record<string, unknown>;
  const starred = Boolean(record.starred);
  const todo: TodoItem = {
    id: typeof record.id === "string" ? record.id : createId(),
    text: typeof record.text === "string" ? record.text : "",
    done: Boolean(record.done),
    starred,
  };
  const notifyAt = isValidDeadlineAt(record.notifyAt)
    ? record.notifyAt
    : isValidDeadlineAt(record.deadlineAt)
      ? record.deadlineAt
      : undefined;
  if (isValidDeadlineAt(notifyAt)) todo.notifyAt = notifyAt;
  return todo;
}
```

Update clone/serialization code so todos are cloned with spread objects but do not write legacy `deadlineAt`:

```ts
function cloneTodos(todos: TodoMap): TodoMap {
  return {
    morning: todos.morning.map(cloneTodo),
    noon: todos.noon.map(cloneTodo),
    evening: todos.evening.map(cloneTodo),
  };
}

function cloneTodo(todo: TodoItem): TodoItem {
  const next: TodoItem = {
    id: todo.id,
    text: todo.text,
    done: todo.done,
    starred: Boolean(todo.starred),
  };
  if (isValidDeadlineAt(todo.notifyAt)) next.notifyAt = todo.notifyAt;
  return next;
}
```

- [ ] **Step 6: Implement todo notification mutation**

In `src/state/todos.ts`, update imports and functions:

```ts
import { isValidDeadlineAt } from "./deadlines";
```

Keep the import name if aliases are used, or rename to `isValidNotifyAt` consistently.

Update `starTodo` so un-starring no longer deletes notification time:

```ts
export function starTodo(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  starred: boolean,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period].find((item) => item.id === id);
  if (!todo) return next;
  todo.starred = starred;
  return next;
}
```

Add:

```ts
export function setTodoNotifyAt(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  notifyAt?: number,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period].find((item) => item.id === id);
  if (!todo) return next;
  if (isValidDeadlineAt(notifyAt)) {
    todo.notifyAt = notifyAt;
  } else {
    delete todo.notifyAt;
  }
  delete todo.deadlineAt;
  return next;
}
```

Update `prioritizeStarred` to use `notifyAt` only if the current phase intentionally preserves notification ordering within starred items. For this phase, keep ordering independent from notification time:

```ts
function getOpenTodoRank(todo: TodoItem): number {
  if (todo.starred) return 0;
  return 1;
}
```

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/deadlines.test.ts src/__tests__/state.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/types.ts src/state/deadlines.ts src/state/storage.ts src/state/todos.ts src/__tests__/deadlines.test.ts src/__tests__/state.test.ts
git commit -m "feat: add notification time state"
```

---

### Task 2: Todo Notification UI and Decoupled Star Behavior

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: Add TodoPanel tests for notification UI**

Append these tests to `src/__tests__/todo-panel.test.ts`:

```ts
it("allows notification time on an unstarred reminder", async () => {
  const wrapper = mount(TodoPanel, {
    props: {
      todos: {
        morning: [{ id: "a", text: "普通事项", done: false }],
        noon: [],
        evening: [],
      },
      titles: DEFAULT_TITLES,
    },
    global: {
      stubs: {
        Button: true,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NTooltip: tooltipStub,
      },
    },
  });

  await wrapper.get('.todo-section[data-period="morning"] input.todo-input').trigger("contextmenu");
  expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("设置通知时间");

  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
  expect(wrapper.get(".deadline-editor").attributes("aria-label")).toBe("设置通知时间");
  expect(wrapper.get(".deadline-editor-heading").text()).toContain("设置通知时间");
  expect(wrapper.get(".deadline-ignore-button").text()).toBe("不设通知时间");
});

it("emits notify updates without changing star state", async () => {
  const wrapper = mount(TodoPanel, {
    props: {
      todos: {
        morning: [{ id: "a", text: "普通事项", done: false }],
        noon: [],
        evening: [],
      },
      titles: DEFAULT_TITLES,
    },
    global: {
      stubs: {
        Button: true,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NTooltip: tooltipStub,
      },
    },
  });

  await wrapper.get('.todo-section[data-period="morning"] input.todo-input').trigger("contextmenu");
  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
  await wrapper.get(".deadline-confirm-button").trigger("click");

  expect(wrapper.emitted("notify")?.[0]).toEqual([
    "morning",
    "a",
    expect.any(Number),
    expect.any(HTMLElement),
  ]);
  expect(wrapper.emitted("star")).toBeUndefined();
});

it("does not render an empty notification slot when no notification time exists", () => {
  const wrapper = mount(TodoPanel, {
    props: {
      todos: {
        morning: [{ id: "a", text: "这是一条很长的普通提醒事项", done: false }],
        noon: [],
        evening: [],
      },
      titles: DEFAULT_TITLES,
    },
    global: {
      stubs: {
        Button: true,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NTooltip: tooltipStub,
      },
    },
  });

  expect(wrapper.find(".todo-deadline-slot").exists()).toBe(false);
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: FAIL because `notify` emit and no-slot rendering are not implemented.

- [ ] **Step 3: Update TodoPanel emits and imports**

In `src/components/TodoPanel.vue`, import notification helpers:

```ts
import {
  NOTIFY_TIME_OPTIONS,
  DEFAULT_NOTIFY_TIME,
  createNotifyAt,
  getDefaultNotifySelection,
  getNotifyDisplay,
  getNotifyTimeLabel,
  getLocalDateInputValue,
  isValidDeadlineAt,
  type NotifyDisplay,
  type NotifyTimeOption,
} from "../state/deadlines";
```

Update emits:

```ts
notify: [period: TodoPeriod, id: string, notifyAt: number | undefined, anchor?: HTMLElement];
```

Rename local editor fields from deadline semantics only where practical:

```ts
const notifyEditorRef = ref<HTMLElement | null>(null);
const notifyEditor = ref<{
  period: TodoPeriod;
  id: string;
  anchor: HTMLElement;
  date: string;
  time: NotifyTimeOption;
  x: number;
  y: number;
} | null>(null);
```

Keep existing `.deadline-*` CSS class names as compatibility hooks for this task, but use notification text and `notifyAt` data in all user-visible behavior.

- [ ] **Step 4: Update menu and star behavior**

In the menu options, allow notification time regardless of star status:

```ts
options.push({
  label: isValidDeadlineAt(todo?.notifyAt) ? "编辑通知时间" : "设置通知时间",
  key: "notify",
});
```

Keep star as a separate option:

```ts
options.push({ label: todo?.starred ? "取消星标" : "星标", key: "star" });
```

Change star click to toggle only star:

```ts
function handleStarClick(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  event.preventDefault();
  event.stopPropagation();
  emit("star", { period, id: todo.id, starred: !todo.starred, anchor: event.currentTarget as HTMLElement });
}
```

Handle menu `notify` separately:

```ts
if (key === "notify" && id && anchor) {
  const todo = getTodoById(period, id);
  closeMenu();
  openNotifyEditor(period, id, anchor, todo);
  return;
}
```

- [ ] **Step 5: Implement notification editor confirm and clear**

Use `notifyAt` for defaults:

```ts
function getNotifyEditorValues(todo?: TodoItem): { date: string; time: NotifyTimeOption } {
  if (!isValidDeadlineAt(todo?.notifyAt)) return getDefaultNotifySelection();

  const notifyDate = new Date(todo.notifyAt);
  const hour = String(notifyDate.getHours()).padStart(2, "0");
  const time = `${hour}:00`;
  const supportedTime = NOTIFY_TIME_OPTIONS.includes(time as NotifyTimeOption)
    ? time as NotifyTimeOption
    : DEFAULT_NOTIFY_TIME;
  return { date: getLocalDateInputValue(notifyDate), time: supportedTime };
}
```

Confirm and clear:

```ts
function confirmNotifyEditor(): void {
  const editor = notifyEditor.value;
  if (!editor) return;
  const notifyAt = createNotifyAt(editor.date, editor.time);
  if (notifyAt === null) return;
  emit("notify", editor.period, editor.id, notifyAt, editor.anchor);
  notifyEditor.value = null;
}

function clearNotifyEditor(): void {
  const editor = notifyEditor.value;
  if (!editor) return;
  emit("notify", editor.period, editor.id, undefined, editor.anchor);
  notifyEditor.value = null;
}
```

- [ ] **Step 6: Update notification display and slots**

Use `notifyAt`:

```ts
const notifyDisplays = computed(() => {
  const displays = new Map<TodoItem, NotifyDisplay>();
  const now = deadlineNow.value;
  TODO_PERIODS.forEach((period) => {
    props.todos[period].forEach((todo) => {
      const display = getNotifyDisplay(todo.notifyAt, now);
      if (display) displays.set(todo, display);
    });
  });
  return displays;
});

function getTodoNotify(todo: TodoItem): NotifyDisplay | null {
  return notifyDisplays.value.get(todo) ?? null;
}

function getTodoCompactNotifyLabel(todo: TodoItem): string | null {
  return getTodoNotify(todo)?.compactLabel ?? null;
}
```

Render the label only when it exists:

```vue
<span v-if="getTodoCompactNotifyLabel(entry.todo)" class="todo-deadline-slot">
  <span class="todo-deadline-label">
    {{ getTodoCompactNotifyLabel(entry.todo) }}
  </span>
</span>
```

Apply the same change in today's focus.

- [ ] **Step 7: Wire App state update**

In `src/App.vue`, import `setTodoNotifyAt`:

```ts
import {
  addTodo as addTodoToMap,
  clearCompleted,
  completeTodo,
  moveTodo as moveTodoInMap,
  removeEmptyTodo,
  removeTodo as removeTodoFromMap,
  setTodoNotifyAt,
  splitTodo as splitTodoInMap,
  starTodo,
  updateTodoText,
} from "./state/todos";
```

Add:

```ts
function updateTodoNotify(period: TodoPeriod, id: string, notifyAt: number | undefined, anchor?: HTMLElement): void {
  state.todos = setTodoNotifyAt(state.todos, period, id, notifyAt);
  persistNow();
  if (notifyAt === undefined) showBubbleText("已取消通知时间", anchor);
}
```

Update `toggleTodoStar` so it no longer passes deadline values:

```ts
state.todos = starTodo(state.todos, period, id, true);
```

Use `todo.notifyAt` in confirmation message selection only if the copy still needs time-specific wording. For this phase, use the non-deadline message:

```ts
const messageKey: MessageKey = "confirmUnstarTodo";
```

Wire the template:

```vue
@notify="updateTodoNotify"
```

- [ ] **Step 8: Update popup template and styles**

In `TodoPanel.vue`, update labels:

```vue
<section
  v-if="notifyEditor"
  ref="notifyEditorRef"
  class="deadline-editor notify-editor"
  :style="notifyEditorStyle"
  aria-label="设置通知时间"
>
  <div class="deadline-editor-heading">
    <span>设置通知时间</span>
    <button class="deadline-close-button icon-button" type="button" aria-label="关闭通知时间选择" @click="closeNotifyEditor">×</button>
  </div>
  <div class="notify-editor-body">
    <div class="notify-date-column">
      <span class="notify-editor-label">日期</span>
      <input class="deadline-date-input" type="date" :value="notifyEditor.date" @input="updateNotifyDate(($event.target as HTMLInputElement).value)" />
    </div>
    <div class="notify-time-column">
      <span class="notify-editor-label">快捷时间</span>
      <div class="deadline-time-options notify-clock-options" aria-label="选择通知整点">
        <button
          v-for="time in NOTIFY_TIME_OPTIONS"
          :key="time"
          class="deadline-time-button notify-clock-button"
          :class="[`time-${time.replace(':', '')}`, { 'is-selected': notifyEditor.time === time }]"
          type="button"
          @click="selectNotifyTime(time)"
        >
          {{ time.slice(0, 2) }}
        </button>
      </div>
    </div>
  </div>
  <div class="deadline-editor-actions">
    <button class="deadline-ignore-button" type="button" @click="clearNotifyEditor">不设通知时间</button>
    <button class="deadline-confirm-button" type="button" @click="confirmNotifyEditor">确定</button>
  </div>
</section>
```

In `src/styles.css`, add:

```css
.todo-input,
.today-focus-input {
  min-width: 0;
  flex: 1 1 auto;
}

.notify-editor {
  width: 520px;
  min-height: 240px;
}

.notify-editor-body {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px;
  gap: 18px;
  padding: 12px 0;
}

.notify-editor-label {
  display: block;
  margin-bottom: 8px;
  color: var(--muted-text);
  font-size: 12px;
}

.notify-clock-options {
  position: relative;
  width: 160px;
  height: 160px;
  border: 1px dashed var(--border);
  border-radius: 999px;
  background: var(--panel-soft);
}

.notify-clock-button {
  position: absolute;
  width: 46px;
  height: 28px;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.notify-clock-button:hover {
  transform: scale(1.14);
  z-index: 2;
}

.notify-clock-button.time-0900 { left: 57px; top: 6px; }
.notify-clock-button.time-1200 { right: 4px; top: 66px; }
.notify-clock-button.time-1500 { right: 18px; bottom: 26px; }
.notify-clock-button.time-1800 { left: 57px; bottom: 6px; }
.notify-clock-button.time-2100 { left: 4px; top: 66px; }
```

- [ ] **Step 9: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/components/TodoPanel.vue src/App.vue src/styles.css src/__tests__/todo-panel.test.ts
git commit -m "feat: decouple notification time UI"
```

---

### Task 3: Page Focus Refresh for Notification State

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: Add refresh test**

Append to `src/__tests__/todo-panel.test.ts`:

```ts
it("refreshes notification labels when the page regains focus", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 25, 9, 59));
  const notifyAt = new Date(2026, 4, 25, 10).getTime();
  const wrapper = mount(TodoPanel, {
    props: {
      todos: {
        morning: [{ id: "a", text: "马上提醒", done: false, notifyAt }],
        noon: [],
        evening: [],
      },
      titles: DEFAULT_TITLES,
    },
    global: {
      stubs: {
        Button: true,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NTooltip: tooltipStub,
      },
    },
  });

  expect(wrapper.get(".todo-deadline-label").text()).toBe("今天 10");

  vi.setSystemTime(new Date(2026, 4, 25, 10, 1));
  window.dispatchEvent(new Event("focus"));
  await wrapper.vm.$nextTick();

  expect(wrapper.get(".todo-deadline-label").text()).toBe("! 已超期");
  wrapper.unmount();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: FAIL because window focus does not update the internal clock yet.

- [ ] **Step 3: Implement focus and visibility refresh**

In `TodoPanel.vue`, add:

```ts
function refreshNotifyNow(): void {
  deadlineNow.value = Date.now();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") refreshNotifyNow();
}
```

Update lifecycle:

```ts
onMounted(() => {
  refreshNotifyNow();
  document.addEventListener("pointerdown", handleDeadlineEditorOutsidePointerDown, true);
  window.addEventListener("focus", refreshNotifyNow);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  deadlineClockTimer.value = window.setInterval(refreshNotifyNow, DEADLINE_CLOCK_INTERVAL_MS);
});

onUnmounted(() => {
  reorderTimers.forEach((timer) => window.clearTimeout(timer));
  document.removeEventListener("pointerdown", handleDeadlineEditorOutsidePointerDown, true);
  window.removeEventListener("focus", refreshNotifyNow);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.clearInterval(deadlineClockTimer.value);
});
```

- [ ] **Step 4: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/components/TodoPanel.vue src/__tests__/todo-panel.test.ts
git commit -m "feat: refresh notification status on focus"
```

---

### Task 4: Auto-Renumbered Ordered Lists in Text Editor

**Files:**
- Modify: `src/utils/textEditor.ts`
- Modify: `src/components/TextPanel.vue`
- Test: `src/__tests__/text-panel.test.ts`

- [ ] **Step 1: Add text editor tests**

Append to `src/__tests__/text-panel.test.ts`:

```ts
it("renumbers root ordered lists after a middle item is removed", async () => {
  const wrapper = mount(TextPanel, {
    props: {
      titleId: "note-title",
      title: "备忘录",
      lines: [
        { text: "1. 第一项", indent: 0 },
        { text: "2. 第二项", indent: 0 },
        { text: "4. 第四项", indent: 0 },
      ],
    },
  });

  expect(wrapper.get("textarea").element.value).toBe("1. 第一项\n2. 第二项\n3. 第四项");

  await wrapper.get("textarea").trigger("click");
  await wrapper.get("textarea").setValue("1. 第一项\n3. 第四项");

  expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
    { text: "1. 第一项", indent: 0 },
    { text: "2. 第四项", indent: 0 },
  ]);
});

it("renumbers ordered lists independently by indentation level", () => {
  const wrapper = mount(TextPanel, {
    props: {
      titleId: "workspace-title",
      title: "工作空间",
      lines: [
        { text: "1. 父项", indent: 0 },
        { text: "1. 子项 A", indent: 1 },
        { text: "7. 子项 B", indent: 1 },
        { text: "9. 父项 B", indent: 0 },
      ],
    },
  });

  expect(wrapper.get("textarea").element.value).toBe("1. 父项\n\t- 1. 子项 A\n\t- 2. 子项 B\n2. 父项 B");
});

it("does not renumber dates or versions as ordered lists", () => {
  const wrapper = mount(TextPanel, {
    props: {
      titleId: "note-title",
      title: "备忘录",
      lines: [
        { text: "2026.05 发布", indent: 0 },
        { text: "1.0.18 版本", indent: 0 },
        { text: "散落 2. 文字", indent: 0 },
      ],
    },
  });

  expect(wrapper.get("textarea").element.value).toBe("2026.05 发布\n1.0.18 版本\n散落 2. 文字");
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm test -- src/__tests__/text-panel.test.ts
```

Expected: FAIL because ordered-list renumbering is not implemented.

- [ ] **Step 3: Implement renumber helper**

In `src/utils/textEditor.ts`, add:

```ts
const ORDERED_MARKER_PATTERN = /^(\d+)\.\s+(.*)$/;

export function renumberOrderedListText(value = ""): string {
  if (!value) return "";
  const counters = new Map<number, number>();
  const active = new Set<number>();

  return value.split("\n").map((line) => {
    const indentText = line.match(/^\t*/)?.[0] ?? "";
    const indent = indentText.length;
    const content = line.slice(indent);
    const markerPrefix = content.startsWith(LINE_MARKER) ? LINE_MARKER : "";
    const text = markerPrefix ? content.slice(LINE_MARKER.length) : content;
    const match = ORDERED_MARKER_PATTERN.exec(text);

    if (!match) {
      counters.delete(indent);
      active.delete(indent);
      return line;
    }

    const startsList = Number(match[1]) === 1 || active.has(indent);
    if (!startsList) return line;

    const nextNumber = active.has(indent) ? (counters.get(indent) ?? 0) + 1 : 1;
    counters.set(indent, nextNumber);
    active.add(indent);
    return `${indentText}${markerPrefix}${nextNumber}. ${match[2]}`;
  }).join("\n");
}
```

Update `textLinesToEditorText`:

```ts
export function textLinesToEditorText(lines: LineItem[]): string {
  return renumberOrderedListText(lines.map((line) => formatEditorLine(line.indent, line.text)).join("\n"));
}
```

Update `editorTextToLines`:

```ts
export function editorTextToLines(value = ""): LineItem[] {
  const normalized = renumberOrderedListText(value);
  if (!normalized) return [];
  return normalized.split("\n").map((line) => {
    const tabs = line.match(/^\t*/)?.[0].length ?? 0;
    const content = line.slice(tabs);
    return {
      text: tabs > 0 ? stripLineMarker(content) : content,
      indent: tabs,
    };
  });
}
```

- [ ] **Step 4: Normalize TextPanel input**

In `src/components/TextPanel.vue`, import `renumberOrderedListText`:

```ts
import {
  editorTextToLines,
  handleTextareaTab,
  insertIndentedLineBreak,
  outdentEmptyIndentedLine,
  renumberOrderedListText,
  textLinesToEditorText,
} from "../utils/textEditor";
```

Update `update`:

```ts
function update(): void {
  if (!editing.value) return;
  const normalized = renumberOrderedListText(text.value);
  if (normalized !== text.value) applyEditorText(normalized);
  emit("update", editorTextToLines(text.value));
}
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/text-panel.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/utils/textEditor.ts src/components/TextPanel.vue src/__tests__/text-panel.test.ts
git commit -m "feat: auto-renumber ordered text lists"
```

---

### Task 5: External Text Drag and Drop

**Files:**
- Modify: `src/utils/textEditor.ts`
- Modify: `src/components/TextPanel.vue`
- Modify: `src/components/SpacePanel.vue`
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/App.vue`
- Test: `src/__tests__/text-panel.test.ts`
- Test: `src/__tests__/space-panel.test.ts`
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: Add helper tests through component behavior**

In `src/__tests__/text-panel.test.ts`, append:

```ts
it("emits appended lines when external text is dropped", async () => {
  const wrapper = mount(TextPanel, {
    props: {
      titleId: "workspace-title",
      title: "工作空间",
      lines: [{ text: "已有内容", indent: 0 }],
    },
  });
  const event = new DragEvent("drop");
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: [],
      getData: (type: string) => (type === "text/plain" ? "新增 A\n新增 B" : ""),
    },
  });

  await wrapper.get(".text-editor-frame").element.dispatchEvent(event);

  expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
    { text: "已有内容", indent: 0 },
    { text: "新增 A", indent: 0 },
    { text: "新增 B", indent: 0 },
  ]);
});
```

In `src/__tests__/todo-panel.test.ts`, append:

```ts
it("emits dropped external text as one reminder per non-empty line", async () => {
  const wrapper = mount(TodoPanel, {
    props: {
      todos: { morning: [], noon: [], evening: [] },
      titles: DEFAULT_TITLES,
    },
    global: {
      stubs: {
        Button: true,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NTooltip: tooltipStub,
      },
    },
  });
  const event = new DragEvent("drop");
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: [],
      getData: (type: string) => (type === "text/plain" ? "任务 A\n\n任务 B" : ""),
    },
  });

  await wrapper.get('[data-testid="todo-list-morning"]').element.dispatchEvent(event);

  expect(wrapper.emitted("createFromText")?.[0]).toEqual(["morning", ["任务 A", "任务 B"]]);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- src/__tests__/text-panel.test.ts src/__tests__/todo-panel.test.ts
```

Expected: FAIL because `drop` handlers and `createFromText` emit do not exist.

- [ ] **Step 3: Add text append helper**

In `src/utils/textEditor.ts`, add:

```ts
export function appendPlainTextToEditorText(current: string, dropped: string): string {
  const normalizedDrop = dropped.replace(/\r\n?/g, "\n").trim();
  if (!normalizedDrop) return current;
  if (!current) return normalizedDrop;
  return `${current.replace(/\s+$/g, "")}\n${normalizedDrop}`;
}

export function splitDroppedTodoText(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Implement TextPanel drop**

In `TextPanel.vue`, import `appendPlainTextToEditorText` and add:

```ts
function handleExternalTextDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) return;
  const dropped = event.dataTransfer?.getData("text/plain") ?? "";
  if (!dropped.trim()) return;
  event.preventDefault();
  event.stopPropagation();
  const textarea = textareaRef.value;
  if (textarea && !editing.value) startEditingFromTextarea(textarea);
  applyEditorText(appendPlainTextToEditorText(text.value, dropped));
  emit("update", editorTextToLines(text.value));
}
```

Bind on the frame:

```vue
<div class="text-editor-frame" @contextmenu="openTextMenu" @dragover.prevent @drop="handleExternalTextDrop">
```

- [ ] **Step 5: Implement TodoPanel drop emit**

In `TodoPanel.vue`, import `splitDroppedTodoText`:

```ts
import { splitDroppedTodoText } from "../utils/textEditor";
```

Add emit:

```ts
createFromText: [period: TodoPeriod, texts: string[]];
```

Add handler:

```ts
function handleTodoTextDrop(event: DragEvent, period: TodoPeriod): void {
  if (dragged.value) return;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) return;
  const texts = splitDroppedTodoText(event.dataTransfer?.getData("text/plain") ?? "");
  if (texts.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  emit("createFromText", period, texts);
}
```

Bind on both empty and populated lists:

```vue
@drop="handleTodoTextDrop($event, period)"
```

Keep section-level internal todo move drop unchanged:

```vue
@drop="dragged && emit('move', dragged, period)"
```

- [ ] **Step 6: Wire App creation from text**

In `App.vue`, add:

```ts
function createTodosFromText(period: TodoPeriod, texts: string[]): void {
  texts.forEach((text) => {
    state.todos = addTodoToMap(state.todos, period, {
      id: createId(),
      text,
      done: false,
    });
  });
  persistNow();
}
```

Wire template:

```vue
@create-from-text="createTodosFromText"
```

TextPanel direct update already flows through existing `updateSpaceLines`, so do not add a separate `SpacePanel` drop handler in this task.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/text-panel.test.ts src/__tests__/todo-panel.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/utils/textEditor.ts src/components/TextPanel.vue src/components/TodoPanel.vue src/App.vue src/__tests__/text-panel.test.ts src/__tests__/todo-panel.test.ts
git commit -m "feat: support external text drops"
```

---

### Task 6: Immediate Text Editing on Selection

**Files:**
- Modify: `src/components/TextPanel.vue`
- Test: `src/__tests__/text-panel.test.ts`

- [ ] **Step 1: Add selection unlock test**

Append to `src/__tests__/text-panel.test.ts`:

```ts
it("enters editing mode immediately after text selection", async () => {
  const wrapper = mount(TextPanel, {
    props: {
      titleId: "workspace-title",
      title: "工作空间",
      lines: [{ text: "可以被选中的文本", indent: 0 }],
    },
  });
  const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
  textarea.setSelectionRange(0, 4);

  await wrapper.get("textarea").trigger("select");

  expect(textarea.readOnly).toBe(false);
  expect(textarea.getAttribute("inputmode")).toBe("text");
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm test -- src/__tests__/text-panel.test.ts
```

Expected: FAIL because selection is remembered but readonly is not unlocked.

- [ ] **Step 3: Unlock on selection**

In `TextPanel.vue`, update `rememberSelection`:

```ts
function rememberSelection(event: Event): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  rememberTextSelection(textarea);
  if (hasSelection(textarea) && !editing.value) {
    startEditingFromTextarea(textarea);
    restoreSelection(textarea, getTextSelectionRange(textarea));
  }
}
```

Keep the existing delayed selection behavior in `restoreSelection` so the selection remains active after focus.

- [ ] **Step 4: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/text-panel.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/components/TextPanel.vue src/__tests__/text-panel.test.ts
git commit -m "feat: unlock text editor on selection"
```

---

### Task 7: Workspace Create Enters Name Editing

**Files:**
- Modify: `src/components/SpacePanel.vue`
- Modify: `src/App.vue`
- Test: `src/__tests__/space-panel.test.ts`

- [ ] **Step 1: Add SpacePanel test**

Append to `src/__tests__/space-panel.test.ts`:

```ts
it("starts editing a newly created active space name", async () => {
  const wrapper = mount(SpacePanel, {
    props: {
      activeSpaceId: "new",
      editSpaceId: "new",
      spaces: [
        { id: "old", title: "旧空间", lines: [] },
        { id: "new", title: "新空间", lines: [] },
      ],
    },
  });

  await wrapper.vm.$nextTick();

  const input = wrapper.get(".space-tab-edit-input").element as HTMLInputElement;
  expect(input.value).toBe("新空间");
  expect(document.activeElement).toBe(input);
});
```

Use the same global stubs already defined in `src/__tests__/space-panel.test.ts` when adding this mount case.

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm test -- src/__tests__/space-panel.test.ts
```

Expected: FAIL because `editSpaceId` prop is not implemented.

- [ ] **Step 3: Add editSpaceId prop and watcher**

In `SpacePanel.vue`, update props:

```ts
const props = defineProps<{
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  editSpaceId?: string | null;
}>();
```

Import `watch`:

```ts
import { computed, nextTick, ref, watch } from "vue";
```

Add watcher:

```ts
watch(
  () => props.editSpaceId,
  (id) => {
    if (!id) return;
    if (!props.spaces.some((space) => space.id === id)) return;
    startTabEdit(id);
  },
  { immediate: true },
);
```

The existing `startTabEdit` already focuses and selects the input.

- [ ] **Step 4: Wire App create flow**

In `App.vue`, add:

```ts
const pendingEditSpaceId = ref<string | null>(null);
```

Update `createSpace`:

```ts
function createSpace(): void {
  const id = createId();
  state.spaces.push({
    id,
    title: nextSpaceTitle(),
    lines: [],
  });
  state.activeSpaceId = id;
  pendingEditSpaceId.value = id;
  syncLegacySpaceLines();
  persistNow();
}
```

Clear the pending edit after rename:

```ts
function renameSpace(id: string, title: string): void {
  const space = state.spaces.find((item) => item.id === id);
  if (!space) return;
  space.title = title.trim() || space.title;
  if (pendingEditSpaceId.value === id) pendingEditSpaceId.value = null;
  persistNow();
}
```

Wire template:

```vue
:edit-space-id="pendingEditSpaceId"
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/space-panel.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/components/SpacePanel.vue src/App.vue src/__tests__/space-panel.test.ts
git commit -m "feat: edit new workspace name immediately"
```

---

### Task 8: Quick Dialog Cancel and Completed Divider Clear

**Files:**
- Modify: `src/components/QuickButtons.vue`
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/quick-buttons.test.ts`
- Test: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: Add QuickButtons cancel test**

Append to `src/__tests__/quick-buttons.test.ts`:

```ts
it("shows cancel instead of delete in the edit dialog", async () => {
  const wrapper = mount(QuickButtons, {
    props: {
      title: "快捷按钮",
      showHidden: true,
      buttons: [{ id: "a", title: "链接", value: "https://example.com", type: "link", hidden: false }],
    },
    global: {
      stubs: {
        NButton: { template: '<button type="button"><slot /></button>' },
        NCheckbox: true,
        NDropdown: dropdownStub,
        NIcon: true,
        NInput: true,
        NModal: { template: '<div><slot /></div>' },
      },
    },
  });

  await wrapper.get(".quick-button").trigger("contextmenu");
  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑")?.trigger("click");

  expect(wrapper.text()).toContain("取消");
  expect(wrapper.text()).not.toContain("删除");
});
```

- [ ] **Step 2: Add completed divider clear test**

Append to `src/__tests__/todo-panel.test.ts`:

```ts
it("shows a clear button on the completed divider", async () => {
  const wrapper = mount(TodoPanel, {
    props: {
      showCompleted: { morning: true, noon: false, evening: false },
      todos: {
        morning: [
          { id: "a", text: "未完成", done: false },
          { id: "b", text: "已完成", done: true },
        ],
        noon: [],
        evening: [],
      },
      titles: DEFAULT_TITLES,
    },
    global: {
      stubs: {
        Button: true,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NTooltip: tooltipStub,
      },
    },
  });

  await wrapper.get(".todo-completed-clear").trigger("click");

  expect(wrapper.emitted("clearCompleted")?.[0]).toEqual(["morning", expect.any(HTMLElement)]);
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npm test -- src/__tests__/quick-buttons.test.ts src/__tests__/todo-panel.test.ts
```

Expected: FAIL because edit dialog still has delete and divider clear button does not exist.

- [ ] **Step 4: Replace quick edit delete with cancel**

In `QuickButtons.vue`, replace the edit-dialog delete button:

```vue
<NButton v-if="editingId" ghost @click="closeDialog">取消</NButton>
```

Keep the save button unchanged:

```vue
<NButton attr-type="submit" type="primary" :disabled="!canSubmit">保存</NButton>
```

- [ ] **Step 5: Add completed clear divider button**

In `TodoPanel.vue`, change divider entry type so the period is available:

```ts
type TodoListEntry =
  | { type: "divider"; id: string; period: TodoPeriod }
  | { type: "todo"; todo: TodoItem };
```

Update `buildTodoListEntries` signature and call:

```ts
function buildTodoListEntries(period: TodoPeriod, todos: TodoItem[], deferredDoneIds: ReadonlySet<string>): TodoListEntry[] {
  const entries: TodoListEntry[] = [];
  let completedDividerAdded = false;
  todos.forEach((todo) => {
    if (todo.done && !deferredDoneIds.has(todo.id) && !completedDividerAdded) {
      entries.push({ type: "divider", id: `completed-${todo.id}`, period });
      completedDividerAdded = true;
    }
    entries.push({ type: "todo", todo });
  });
  return entries;
}
```

Render:

```vue
<li v-else class="todo-completed-divider">
  <span>已完成</span>
  <button
    class="todo-completed-clear"
    type="button"
    @click.stop="emit('clearCompleted', entry.period, $event.currentTarget as HTMLElement)"
  >
    clear
  </button>
</li>
```

Add CSS:

```css
.todo-completed-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.todo-completed-clear {
  border: 0;
  background: transparent;
  color: var(--muted-text);
  cursor: pointer;
  font-size: 12px;
}

.todo-completed-clear:hover {
  color: var(--text);
}
```

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npm test -- src/__tests__/quick-buttons.test.ts src/__tests__/todo-panel.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/components/QuickButtons.vue src/components/TodoPanel.vue src/styles.css src/__tests__/quick-buttons.test.ts src/__tests__/todo-panel.test.ts
git commit -m "feat: refine quick and completed actions"
```

---

### Task 9: Final Regression and Browser Verification

**Files:**
- Modify only files needed to fix issues found during verification.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS with `vue-tsc --noEmit` and `vite build` completing successfully.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite prints a local URL, normally `http://127.0.0.1:5173/`.

- [ ] **Step 4: Browser smoke test**

Open the app in Browser at `http://127.0.0.1:5173/` and verify:

- Set notification time on an unstarred reminder.
- Clear notification time with “不设通知时间”.
- Confirm a long reminder without notification time uses full row width.
- Drop multi-line external text into a reminder list and see multiple reminders.
- Drop external text into the active workspace and see it append at the end.
- Create a workspace and confirm the tab title immediately enters edit mode.
- Edit a quick button and confirm the dialog has “取消” instead of “删除”.
- Show completed reminders and click divider `clear`.

- [ ] **Step 5: Commit verification fixes**

When verification requires fixes, commit them:

```bash
git add src docs
git commit -m "fix: complete board iteration phase 1 verification"
```

When verification requires no fixes, do not create an empty commit.

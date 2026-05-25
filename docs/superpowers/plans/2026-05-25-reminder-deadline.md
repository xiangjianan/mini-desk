# Reminder Deadline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight deadline reminders to starred todo items, including date/hour selection, deadline-aware sorting, urgency labels, and confirmation when removing a star.

**Architecture:** Keep deadline math in a small state utility module, keep persistence normalization in `storage.ts`, and keep UI state local to `TodoPanel.vue`. `App.vue` remains the owner of persisted board state and companion confirmation bubbles.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Vue Test Utils, existing Naive UI components and local companion bubble system.

---

## Pre-Flight

The current worktree has a pre-existing modification in `src/state/messages.ts`. Before executing, run:

```bash
git status --short
```

Expected: `src/state/messages.ts` may already be modified. Do not revert it. When touching that file, preserve any existing user changes and inspect the diff before committing.

## File Map

- Create: `src/state/deadlines.ts`
  - Owns deadline time options, local date parsing, deadline timestamp creation, urgency classification, and display labels.
- Create: `src/__tests__/deadlines.test.ts`
  - Unit tests for `src/state/deadlines.ts`.
- Modify: `src/types.ts`
  - Adds `deadlineAt?: number` to `TodoItem`.
- Modify: `src/state/storage.ts`
  - Normalizes persisted/imported `deadlineAt` values and drops invalid values.
- Modify: `src/state/todos.ts`
  - Extends `starTodo` and updates `getOrderedTodos` to sort starred tasks with deadlines.
- Modify: `src/state/messages.ts`
  - Adds cancel-star confirmation message keys and 10 variants for each key.
- Modify: `src/App.vue`
  - Handles new `TodoPanel` star event payload and requests confirmation before un-starring.
- Modify: `src/components/TodoPanel.vue`
  - Adds the deadline selector, deadline labels, urgency classes, and updated star event payloads.
- Modify: `src/styles.css`
  - Adds compact deadline selector, label, left warning line, and urgency colors.
- Modify: `src/__tests__/state.test.ts`
  - Covers storage normalization and todo sorting behavior.
- Modify: `src/__tests__/messages.test.ts`
  - Covers new message keys and length exception for the longer cancel-star deadline copy.
- Modify: `src/__tests__/app-render.test.ts`
  - Covers app-level star/unstar persistence and confirmation behavior.
- Modify: `src/__tests__/todo-panel.test.ts`
  - Covers deadline selector UI, emitted events, labels, classes, and row layout.
- Modify: `src/__tests__/naive-components.test.ts`
  - Updates source-level assertions affected by the deadline slot and selector.
- Modify: `README.md`
  - Documents the new starred deadline reminder behavior.

## Task 1: Deadline Utility Module

**Files:**
- Create: `src/state/deadlines.ts`
- Create: `src/__tests__/deadlines.test.ts`

- [ ] **Step 1: Write the failing deadline utility tests**

Create `src/__tests__/deadlines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEADLINE_TIME_OPTIONS,
  DEFAULT_DEADLINE_TIME,
  createDeadlineAt,
  getDeadlineDisplay,
  getLocalDateInputValue,
} from "../state/deadlines";

describe("deadline helpers", () => {
  it("uses a small set of common whole-hour choices", () => {
    expect(DEADLINE_TIME_OPTIONS).toEqual(["09:00", "12:00", "15:00", "18:00", "21:00"]);
    expect(DEFAULT_DEADLINE_TIME).toBe("18:00");
  });

  it("creates a local timestamp from a date and whole-hour time", () => {
    const timestamp = createDeadlineAt("2026-05-30", "15:00");

    expect(timestamp).toBe(new Date(2026, 4, 30, 15, 0, 0, 0).getTime());
  });

  it("defaults missing time to 18:00 and rejects malformed dates", () => {
    expect(createDeadlineAt("2026-05-30")).toBe(new Date(2026, 4, 30, 18, 0, 0, 0).getTime());
    expect(createDeadlineAt("", "18:00")).toBeNull();
    expect(createDeadlineAt("2026/05/30", "18:00")).toBeNull();
    expect(createDeadlineAt("2026-13-30", "18:00")).toBeNull();
    expect(createDeadlineAt("2026-05-30", "18:30")).toBeNull();
  });

  it("formats local dates for native date inputs", () => {
    expect(getLocalDateInputValue(new Date(2026, 4, 7, 9))).toBe("2026-05-07");
  });

  it("classifies overdue, due-soon, upcoming, and later deadlines", () => {
    const now = new Date(2026, 4, 25, 10).getTime();

    expect(getDeadlineDisplay(new Date(2026, 4, 25, 9).getTime(), now)).toEqual({
      label: "! 已超期",
      urgency: "overdue",
    });
    expect(getDeadlineDisplay(new Date(2026, 4, 25, 18).getTime(), now)).toEqual({
      label: "! 今天 18",
      urgency: "due-soon",
    });
    expect(getDeadlineDisplay(new Date(2026, 4, 26, 9).getTime(), now)).toEqual({
      label: "! 明天 09",
      urgency: "due-soon",
    });
    expect(getDeadlineDisplay(new Date(2026, 4, 27, 18).getTime(), now)).toEqual({
      label: "2天后 18",
      urgency: "upcoming",
    });
    expect(getDeadlineDisplay(new Date(2026, 5, 2, 18).getTime(), now)).toEqual({
      label: "6/2 18",
      urgency: "later",
    });
  });

  it("returns null for missing or invalid deadline timestamps", () => {
    expect(getDeadlineDisplay(undefined)).toBeNull();
    expect(getDeadlineDisplay(Number.NaN)).toBeNull();
    expect(getDeadlineDisplay(-1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the deadline tests to verify they fail**

Run:

```bash
npm test -- src/__tests__/deadlines.test.ts
```

Expected: FAIL because `src/state/deadlines.ts` does not exist.

- [ ] **Step 3: Implement `src/state/deadlines.ts`**

Create `src/state/deadlines.ts`:

```ts
export const DEADLINE_TIME_OPTIONS = ["09:00", "12:00", "15:00", "18:00", "21:00"] as const;
export const DEFAULT_DEADLINE_TIME = "18:00";

export type DeadlineTimeOption = typeof DEADLINE_TIME_OPTIONS[number];
export type DeadlineUrgency = "overdue" | "due-soon" | "upcoming" | "later";

export interface DeadlineDisplay {
  label: string;
  urgency: DeadlineUrgency;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT_PATTERN = /^(\d{2}):00$/;

export function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDeadlineAt(dateValue: string, timeValue = DEFAULT_DEADLINE_TIME): number | null {
  const dateMatch = dateValue.match(DATE_INPUT_PATTERN);
  const timeMatch = timeValue.match(TIME_INPUT_PATTERN);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23) return null;

  const deadline = new Date(year, month - 1, day, hour, 0, 0, 0);
  if (
    deadline.getFullYear() !== year ||
    deadline.getMonth() !== month - 1 ||
    deadline.getDate() !== day ||
    deadline.getHours() !== hour
  ) {
    return null;
  }

  return deadline.getTime();
}

export function getDeadlineDisplay(deadlineAt: number | undefined, now = Date.now()): DeadlineDisplay | null {
  if (!isValidDeadlineAt(deadlineAt)) return null;

  const diff = deadlineAt - now;
  const deadline = new Date(deadlineAt);
  const hour = String(deadline.getHours()).padStart(2, "0");
  if (diff < 0) return { label: "! 已超期", urgency: "overdue" };

  const dayDiff = getLocalDayDiff(now, deadlineAt);
  if (diff <= DAY_MS) {
    if (dayDiff === 0) return { label: `! 今天 ${hour}`, urgency: "due-soon" };
    if (dayDiff === 1) return { label: `! 明天 ${hour}`, urgency: "due-soon" };
    return { label: `! ${deadline.getMonth() + 1}/${deadline.getDate()} ${hour}`, urgency: "due-soon" };
  }

  if (diff <= 3 * DAY_MS) {
    return { label: `${Math.max(1, dayDiff)}天后 ${hour}`, urgency: "upcoming" };
  }

  return { label: `${deadline.getMonth() + 1}/${deadline.getDate()} ${hour}`, urgency: "later" };
}

export function isValidDeadlineAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function getLocalDayDiff(now: number, deadlineAt: number): number {
  const start = startOfLocalDay(new Date(now)).getTime();
  const end = startOfLocalDay(new Date(deadlineAt)).getTime();
  return Math.round((end - start) / DAY_MS);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
```

- [ ] **Step 4: Run the deadline tests to verify they pass**

Run:

```bash
npm test -- src/__tests__/deadlines.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit deadline utilities**

Run:

```bash
git add src/state/deadlines.ts src/__tests__/deadlines.test.ts
git commit -m "feat: add deadline helpers"
```

## Task 2: Types and Storage Normalization

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/storage.ts`
- Modify: `src/__tests__/state.test.ts`

- [ ] **Step 1: Write failing storage tests for `deadlineAt`**

In `src/__tests__/state.test.ts`, update the `"normalizes persisted spaces and starred reminders"` test so the imported todo includes a valid deadline:

```ts
todos: {
  morning: [{ id: "a", text: "重点", done: false, starred: true, deadlineAt: 1779721200000 }],
},
```

Change the expectation in that test to:

```ts
expect(state.todos.morning[0]).toMatchObject({ starred: true, deadlineAt: 1779721200000 });
```

Add this test inside `describe("state compatibility", () => { ... })`:

```ts
it("drops invalid or non-starred todo deadlines during import", () => {
  const state = normalizeImportedState({
    todos: {
      morning: [
        { id: "a", text: "有效截止", done: false, starred: true, deadlineAt: 1779721200000 },
        { id: "b", text: "非法截止", done: false, starred: true, deadlineAt: "2026-05-30" },
        { id: "c", text: "非重点截止", done: false, starred: false, deadlineAt: 1779721200000 },
      ],
    },
  });

  expect(state.todos.morning[0]).toMatchObject({ starred: true, deadlineAt: 1779721200000 });
  expect(state.todos.morning[1]).toMatchObject({ starred: true });
  expect(state.todos.morning[1]).not.toHaveProperty("deadlineAt");
  expect(state.todos.morning[2]).toMatchObject({ starred: false });
  expect(state.todos.morning[2]).not.toHaveProperty("deadlineAt");
});
```

- [ ] **Step 2: Run state tests to verify they fail**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: FAIL because `TodoItem` and `normalizeTodo` do not preserve valid `deadlineAt`.

- [ ] **Step 3: Add `deadlineAt` to `TodoItem`**

In `src/types.ts`, change `TodoItem` to:

```ts
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  starred?: boolean;
  deadlineAt?: number;
}
```

- [ ] **Step 4: Normalize valid starred deadlines**

In `src/state/storage.ts`, add this import:

```ts
import { isValidDeadlineAt } from "./deadlines";
```

Replace `normalizeTodo` with:

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
  if (starred && isValidDeadlineAt(record.deadlineAt)) {
    todo.deadlineAt = record.deadlineAt;
  }
  return todo;
}
```

- [ ] **Step 5: Run state tests to verify they pass**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit type and storage support**

Run:

```bash
git add src/types.ts src/state/storage.ts src/__tests__/state.test.ts
git commit -m "feat: persist todo deadlines"
```

## Task 3: Todo State Sorting and Star Mutations

**Files:**
- Modify: `src/state/todos.ts`
- Modify: `src/__tests__/state.test.ts`

- [ ] **Step 1: Write failing todo state tests**

In `src/__tests__/state.test.ts`, change the import from `../state/todos` to include `starTodo`:

```ts
import { addTodo, completeTodo, getOrderedTodos, moveTodo, starTodo } from "../state/todos";
```

Add these tests inside `describe("todo behavior", () => { ... })`:

```ts
it("orders starred todos with deadlines before other open todos", () => {
  const todos = [
    { id: "ordinary", text: "普通", done: false },
    { id: "later", text: "晚一点", done: false, starred: true, deadlineAt: 3000 },
    { id: "starred", text: "重点无时间", done: false, starred: true },
    { id: "sooner", text: "更近", done: false, starred: true, deadlineAt: 1000 },
    { id: "done", text: "完成", done: true, starred: true, deadlineAt: 500 },
  ];

  expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual([
    "sooner",
    "later",
    "starred",
    "ordinary",
    "done",
  ]);
});

it("keeps same-deadline starred todos in their original relative order", () => {
  const todos = [
    { id: "b", text: "第二个", done: false, starred: true, deadlineAt: 1000 },
    { id: "a", text: "第一个", done: false, starred: true, deadlineAt: 1000 },
  ];

  expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual(["b", "a"]);
});

it("sets and clears todo deadlines through starTodo", () => {
  const state = defaultState();
  state.todos.morning = [{ id: "a", text: "重点", done: false }];

  const starred = starTodo(state.todos, "morning", "a", true, 1779721200000);
  expect(starred.morning[0]).toMatchObject({ starred: true, deadlineAt: 1779721200000 });

  const unstarred = starTodo(starred, "morning", "a", false);
  expect(unstarred.morning[0]).toMatchObject({ starred: false });
  expect(unstarred.morning[0]).not.toHaveProperty("deadlineAt");
});
```

- [ ] **Step 2: Run state tests to verify they fail**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: FAIL because `getOrderedTodos` still only prioritizes starred tasks and `starTodo` has no deadline parameter.

- [ ] **Step 3: Update todo ordering and star mutation**

In `src/state/todos.ts`, add the import:

```ts
import { isValidDeadlineAt } from "./deadlines";
```

Replace `starTodo` with:

```ts
export function starTodo(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  starred: boolean,
  deadlineAt?: number,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period].find((item) => item.id === id);
  if (!todo) return next;
  todo.starred = starred;
  if (!starred) {
    delete todo.deadlineAt;
  } else if (isValidDeadlineAt(deadlineAt)) {
    todo.deadlineAt = deadlineAt;
  } else {
    delete todo.deadlineAt;
  }
  return next;
}
```

Replace `prioritizeStarred` with:

```ts
function prioritizeStarred(todos: TodoItem[]): TodoItem[] {
  return todos
    .map((todo, index) => ({ todo, index }))
    .sort((left, right) => {
      const leftRank = getOpenTodoRank(left.todo);
      const rightRank = getOpenTodoRank(right.todo);
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (leftRank === 0) {
        const deadlineDiff = (left.todo.deadlineAt ?? 0) - (right.todo.deadlineAt ?? 0);
        if (deadlineDiff !== 0) return deadlineDiff;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.todo);
}

function getOpenTodoRank(todo: TodoItem): number {
  if (todo.starred && isValidDeadlineAt(todo.deadlineAt)) return 0;
  if (todo.starred) return 1;
  return 2;
}
```

- [ ] **Step 4: Run state tests to verify they pass**

Run:

```bash
npm test -- src/__tests__/state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit todo state behavior**

Run:

```bash
git add src/state/todos.ts src/__tests__/state.test.ts
git commit -m "feat: sort starred deadlines"
```

## Task 4: Cancel-Star Confirmation Messages

**Files:**
- Modify: `src/state/messages.ts`
- Modify: `src/__tests__/messages.test.ts`

- [ ] **Step 1: Write failing message catalog tests**

In `src/__tests__/messages.test.ts`, add these keys to `messageKeys` after `"confirmDeleteTodo"`:

```ts
"confirmUnstarTodo",
"confirmUnstarTodoDeadline",
```

In `"keeps prompt copy brief and human with kaomoji-ready wording"`, replace the length assertion with:

```ts
const maxLength = key === "confirmUnstarTodoDeadline" ? 24 : 15;
expect(variant.length, `${key}: ${variant}`).toBeLessThanOrEqual(maxLength);
```

Add this test inside `describe("message catalog", () => { ... })`:

```ts
it("has separate cancel-star confirmation copy for todos with and without deadlines", () => {
  expect(MESSAGE_CATALOG.confirmUnstarTodo.variants).toHaveLength(10);
  expect(MESSAGE_CATALOG.confirmUnstarTodoDeadline.variants).toHaveLength(10);
  expect(MESSAGE_CATALOG.confirmUnstarTodo.variants.join("\n")).not.toContain("截止时间");
  expect(MESSAGE_CATALOG.confirmUnstarTodoDeadline.variants.join("\n")).toContain("截止时间");
});
```

- [ ] **Step 2: Run message tests to verify they fail**

Run:

```bash
npm test -- src/__tests__/messages.test.ts
```

Expected: FAIL because the new message keys do not exist.

- [ ] **Step 3: Add message keys and variants**

In `src/state/messages.ts`, add to `MessageKey` after `"confirmDeleteTodo"`:

```ts
| "confirmUnstarTodo"
| "confirmUnstarTodoDeadline"
```

Add these catalog entries after `confirmDeleteTodo`:

```ts
  confirmUnstarTodo: {
    mood: "warning",
    surface: "companion",
    variants: [
      "确定取消重点吗？",
      "这个任务将不再置顶",
      "确定不再重点关注？",
      "取消后回到普通事项",
      "这个重点要撤掉吗？",
      "取消重点后普通显示",
      "确认取消这个重点？",
      "取消后不进今日重点",
      "这条会变普通事项",
      "确定撤下这个重点？",
    ],
  },
  confirmUnstarTodoDeadline: {
    mood: "warning",
    surface: "companion",
    variants: [
      "取消重点后，截止时间也会一起清掉。",
      "任务不再置顶，截止时间也会移除。",
      "确定取消重点吗？截止时间会同步清除。",
      "取消后回到普通事项，截止时间不保留。",
      "这个重点要撤掉吗？截止时间也会撤掉。",
      "取消重点会停用这条任务的截止提醒。",
      "确认取消重点？相关截止时间也会删除。",
      "取消后不再按截止时间提醒这个任务。",
      "任务会变回普通事项，截止时间会清掉。",
      "确定不再重点关注？截止时间也会移除。",
    ],
  },
```

- [ ] **Step 4: Run message tests to verify they pass**

Run:

```bash
npm test -- src/__tests__/messages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit message catalog updates**

Run:

```bash
git add src/state/messages.ts src/__tests__/messages.test.ts
git commit -m "feat: add cancel star prompts"
```

## Task 5: App-Level Star and Unstar Flow

**Files:**
- Modify: `src/App.vue`
- Modify: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: Write failing app flow tests**

In `src/__tests__/app-render.test.ts`, add these tests inside `describe("App shell", () => { ... })` near the existing todo deletion confirmation tests:

```ts
  it("stars a todo with an optional deadline without showing a confirmation bubble", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "重点提醒", done: false }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".todo-item").element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("star", "morning", "todo-1", true, 1779721200000, anchor);
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({
        starred: true,
        deadlineAt: 1779721200000,
      });
      expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("confirms un-starring and clears the deadline after confirmation", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "重点提醒", done: false, starred: true, deadlineAt: 1779721200000 }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".todo-item").element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("star", "morning", "todo-1", false, undefined, anchor);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).toContain("截止时间");
      expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("取消重点");
      expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("算了");

      await wrapper.get('[data-testid="companion-yes"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({ starred: false });
      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).not.toHaveProperty("deadlineAt");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps a starred todo unchanged when canceling the un-star confirmation", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos: {
          morning: [{ id: "todo-1", text: "重点提醒", done: false, starred: true }],
        },
      }),
    );
    const wrapper = mountApp();

    try {
      const anchor = wrapper.get(".todo-item").element as HTMLElement;
      wrapper.getComponent(TodoPanel).vm.$emit("star", "morning", "todo-1", false, undefined, anchor);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(200);
      await wrapper.vm.$nextTick();

      expect(wrapper.get('[data-testid="companion-confirm"]').text()).not.toContain("截止时间");
      await wrapper.get('[data-testid="companion-no"]').trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(TodoPanel).props("todos").morning[0]).toMatchObject({ starred: true });
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run app tests to verify they fail**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: FAIL because `toggleTodoStar` does not accept deadline payloads or confirm un-starring.

- [ ] **Step 3: Update `toggleTodoStar` in `src/App.vue`**

Replace:

```ts
function toggleTodoStar(period: TodoPeriod, id: string, starred: boolean): void {
  state.todos = starTodo(state.todos, period, id, starred);
  persistNow();
}
```

with:

```ts
function toggleTodoStar(
  period: TodoPeriod,
  id: string,
  starred: boolean,
  deadlineAt?: number,
  anchor?: HTMLElement,
): void {
  if (starred) {
    state.todos = starTodo(state.todos, period, id, true, deadlineAt);
    persistNow();
    return;
  }

  const todo = state.todos[period].find((item) => item.id === id);
  if (!todo?.starred) return;
  const messageKey: MessageKey = todo.deadlineAt ? "confirmUnstarTodoDeadline" : "confirmUnstarTodo";
  requestConfirmation(
    messageKey,
    anchor,
    () => {
      state.todos = starTodo(state.todos, period, id, false);
      persistNow();
    },
    undefined,
    { confirmText: "取消重点", cancelText: "算了" },
  );
}
```

- [ ] **Step 4: Run app tests to verify they pass**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit app star flow**

Run:

```bash
git add src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: confirm removing starred reminders"
```

## Task 6: TodoPanel Deadline Selector

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/__tests__/todo-panel.test.ts`

- [ ] **Step 1: Write failing TodoPanel interaction tests**

In `src/__tests__/todo-panel.test.ts`, update imports:

```ts
import { describe, expect, it, vi } from "vitest";
```

Add these tests inside `describe("TodoPanel", () => { ... })` near the existing star tests:

```ts
  it("opens a deadline selector when starring an unstarred reminder", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false }],
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

    await wrapper.get(".todo-star-button").trigger("click");

    expect(wrapper.get(".deadline-editor").exists()).toBe(true);
    expect((wrapper.get(".deadline-date-input").element as HTMLInputElement).value).toBe("2026-05-25");
    expect(wrapper.findAll(".deadline-time-button").map((button) => button.text())).toEqual([
      "09:00",
      "12:00",
      "15:00",
      "18:00",
      "21:00",
    ]);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("confirms a selected deadline and emits star with a timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false }],
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

    await wrapper.get(".todo-star-button").trigger("click");
    await wrapper.get(".deadline-date-input").setValue("2026-05-30");
    await wrapper.findAll(".deadline-time-button").find((button) => button.text() === "15:00")?.trigger("click");
    await wrapper.get(".deadline-confirm-button").trigger("click");

    expect(wrapper.emitted("star")?.[0]).toEqual([
      "morning",
      "a",
      true,
      new Date(2026, 4, 30, 15).getTime(),
      expect.any(HTMLElement),
    ]);
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("can ignore deadline selection and only set the star", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false }],
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

    await wrapper.get(".todo-star-button").trigger("click");
    await wrapper.get(".deadline-ignore-button").trigger("click");

    expect(wrapper.emitted("star")?.[0]).toEqual(["morning", "a", true, undefined, expect.any(HTMLElement)]);
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("closes deadline selection without changing the reminder", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false }],
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

    await wrapper.get(".todo-star-button").trigger("click");
    await wrapper.get(".deadline-close-button").trigger("click");

    expect(wrapper.emitted("star")).toBeUndefined();
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("emits an un-star request with an anchor for already starred reminders", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "重点事项", done: false, starred: true, deadlineAt: 1779721200000 }],
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

    await wrapper.get(".todo-star-button").trigger("click");

    expect(wrapper.emitted("star")?.[0]).toEqual(["morning", "a", false, undefined, expect.any(HTMLElement)]);
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("opens the deadline selector from the reminder context menu when starring", async () => {
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

    await wrapper.get(".todo-item").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "星标")?.trigger("click");

    expect(wrapper.get(".deadline-editor").exists()).toBe(true);
    expect(wrapper.emitted("star")).toBeUndefined();
    wrapper.unmount();
  });
```

Update the existing `"emits star toggles and aggregates starred reminders into today's focus"` expectation from:

```ts
expect(wrapper.emitted("star")?.[0]).toEqual(["morning", "a", false]);
```

to:

```ts
expect(wrapper.emitted("star")?.[0]).toEqual(["morning", "a", false, undefined, expect.any(HTMLElement)]);
```

- [ ] **Step 2: Run TodoPanel tests to verify they fail**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: FAIL because the deadline selector and new event payload do not exist.

- [ ] **Step 3: Update TodoPanel imports and emit typing**

In `src/components/TodoPanel.vue`, add this import:

```ts
import {
  DEADLINE_TIME_OPTIONS,
  DEFAULT_DEADLINE_TIME,
  createDeadlineAt,
  getLocalDateInputValue,
} from "../state/deadlines";
```

Change the `star` emit type to:

```ts
star: [period: TodoPeriod, id: string, starred: boolean, deadlineAt?: number, anchor?: HTMLElement];
```

- [ ] **Step 4: Add deadline editor state and handlers**

In `src/components/TodoPanel.vue`, add after `selectedMenuTodoKey`:

```ts
const deadlineEditor = ref<{
  period: TodoPeriod;
  id: string;
  anchor: HTMLElement;
  date: string;
  time: string;
} | null>(null);
```

Add these functions near the other todo action handlers:

```ts
function handleStarClick(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  event.preventDefault();
  event.stopPropagation();
  const anchor = event.currentTarget as HTMLElement;
  if (todo.starred) {
    closeDeadlineEditor();
    emit("star", period, todo.id, false, undefined, anchor);
    return;
  }
  openDeadlineEditor(period, todo.id, anchor);
}

function openDeadlineEditor(period: TodoPeriod, id: string, anchor: HTMLElement): void {
  selectedMenuTodoKey.value = null;
  deadlineEditor.value = {
    period,
    id,
    anchor,
    date: getLocalDateInputValue(),
    time: DEFAULT_DEADLINE_TIME,
  };
}

function selectDeadlineTime(time: string): void {
  if (!deadlineEditor.value) return;
  deadlineEditor.value = { ...deadlineEditor.value, time };
}

function updateDeadlineDate(value: string): void {
  if (!deadlineEditor.value) return;
  deadlineEditor.value = { ...deadlineEditor.value, date: value };
}

function confirmDeadlineEditor(): void {
  const editor = deadlineEditor.value;
  if (!editor) return;
  const deadlineAt = createDeadlineAt(editor.date, editor.time);
  if (deadlineAt === null) return;
  emit("star", editor.period, editor.id, true, deadlineAt, editor.anchor);
  deadlineEditor.value = null;
}

function ignoreDeadlineEditor(): void {
  const editor = deadlineEditor.value;
  if (!editor) return;
  emit("star", editor.period, editor.id, true, undefined, editor.anchor);
  deadlineEditor.value = null;
}

function closeDeadlineEditor(): void {
  deadlineEditor.value = null;
}
```

In `handleMenuSelect`, replace the existing star branch:

```ts
if (key === "star") emit("star", period, id, !getTodoById(period, id)?.starred);
```

with:

```ts
if (key === "star" && id) {
  const todo = getTodoById(period, id);
  if (!todo) return;
  if (todo.starred) {
    emit("star", period, id, false, undefined, anchor);
  } else if (anchor) {
    openDeadlineEditor(period, id, anchor);
  }
}
```

- [ ] **Step 5: Replace star button click handlers**

In both the today focus star button and regular todo star button, replace direct emits:

```vue
@click.stop="emit('star', item.period, item.todo.id, false)"
```

and:

```vue
@click.stop="emit('star', period, entry.todo.id, !entry.todo.starred)"
```

with:

```vue
@click="handleStarClick($event, item.period, item.todo)"
```

and:

```vue
@click="handleStarClick($event, period, entry.todo)"
```

respectively.

- [ ] **Step 6: Add the deadline editor template**

Add this block before the existing `<NDropdown ...>` in `src/components/TodoPanel.vue`:

```vue
    <section
      v-if="deadlineEditor"
      class="deadline-editor"
      aria-label="设置截止时间"
    >
      <div class="deadline-editor-heading">
        <span>设置截止时间</span>
        <button
          class="deadline-close-button icon-button"
          type="button"
          aria-label="关闭截止时间选择"
          @click="closeDeadlineEditor"
        >
          ×
        </button>
      </div>
      <input
        class="deadline-date-input"
        type="date"
        :value="deadlineEditor.date"
        @input="updateDeadlineDate(($event.target as HTMLInputElement).value)"
      />
      <div class="deadline-time-options" aria-label="选择截止整点">
        <button
          v-for="time in DEADLINE_TIME_OPTIONS"
          :key="time"
          class="deadline-time-button"
          :class="{ 'is-selected': deadlineEditor.time === time }"
          type="button"
          @click="selectDeadlineTime(time)"
        >
          {{ time }}
        </button>
      </div>
      <div class="deadline-editor-actions">
        <button
          class="deadline-ignore-button"
          type="button"
          @click="ignoreDeadlineEditor"
        >
          忽略
        </button>
        <button
          class="deadline-confirm-button"
          type="button"
          @click="confirmDeadlineEditor"
        >
          确定
        </button>
      </div>
    </section>
```

- [ ] **Step 7: Run TodoPanel interaction tests to verify they pass**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: PASS for the new selector tests. Some layout tests may still fail until Task 7 updates the deadline slot and styles.

- [ ] **Step 8: Commit deadline selector behavior**

Run this only if `src/__tests__/todo-panel.test.ts` passes. If layout tests fail because the deadline slot is not done, skip the commit and continue to Task 7.

```bash
git add src/components/TodoPanel.vue src/__tests__/todo-panel.test.ts
git commit -m "feat: add todo deadline selector"
```

## Task 7: Deadline Labels and Urgency Styling

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/styles.css`
- Modify: `src/__tests__/todo-panel.test.ts`
- Modify: `src/__tests__/naive-components.test.ts`

- [ ] **Step 1: Write failing label and urgency tests**

In `src/__tests__/todo-panel.test.ts`, add this test near the star/deadline tests:

```ts
  it("shows deadline labels and urgency classes in reminders and today's focus", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [
            { id: "a", text: "超期", done: false, starred: true, deadlineAt: new Date(2026, 4, 25, 9).getTime() },
            { id: "b", text: "今天", done: false, starred: true, deadlineAt: new Date(2026, 4, 25, 18).getTime() },
            { id: "c", text: "三天内", done: false, starred: true, deadlineAt: new Date(2026, 4, 27, 18).getTime() },
            { id: "d", text: "更晚", done: false, starred: true, deadlineAt: new Date(2026, 5, 2, 18).getTime() },
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

    expect(wrapper.findAll(".todo-deadline-label").map((item) => item.text())).toEqual([
      "! 已超期",
      "! 今天 18",
      "2天后 18",
      "6/2 18",
      "! 已超期",
      "! 今天 18",
      "2天后 18",
      "6/2 18",
    ]);
    expect(wrapper.findAll(".todo-item")[0].classes()).toContain("deadline-overdue");
    expect(wrapper.findAll(".todo-item")[1].classes()).toContain("deadline-due-soon");
    expect(wrapper.findAll(".todo-item")[2].classes()).toContain("deadline-upcoming");
    expect(wrapper.findAll(".todo-item")[3].classes()).toContain("deadline-later");
    expect(wrapper.findAll(".today-focus-item")[0].classes()).toContain("deadline-overdue");
    wrapper.unmount();
    vi.useRealTimers();
  });
```

Update the existing row-order tests:

```ts
expect(rowChildren[0]).toContain("todo-drag-handle");
expect(rowChildren[1]).toContain("checkbox-stub");
expect(rowChildren[2]).toContain("todo-input");
expect(rowChildren[3]).toContain("todo-deadline-slot");
expect(rowChildren[4]).toContain("todo-star-button");
```

and:

```ts
expect(rowChildren[0]).toContain("checkbox-stub");
expect(rowChildren[1]).toContain("today-focus-input");
expect(rowChildren[2]).toContain("todo-deadline-slot");
expect(rowChildren[3]).toContain("todo-star-button");
```

- [ ] **Step 2: Run TodoPanel tests to verify they fail**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts
```

Expected: FAIL because deadline labels/classes are not rendered.

- [ ] **Step 3: Add deadline display helpers in `TodoPanel.vue`**

Extend the deadline import in `src/components/TodoPanel.vue`:

```ts
import {
  DEADLINE_TIME_OPTIONS,
  DEFAULT_DEADLINE_TIME,
  createDeadlineAt,
  getDeadlineDisplay,
  getLocalDateInputValue,
  type DeadlineDisplay,
} from "../state/deadlines";
```

Add these functions near `isTodoHighlighted`:

```ts
function getTodoDeadline(todo: TodoItem): DeadlineDisplay | null {
  if (todo.done) return null;
  return getDeadlineDisplay(todo.deadlineAt);
}

function getTodoDeadlineClass(todo: TodoItem): string | null {
  const display = getTodoDeadline(todo);
  return display ? `deadline-${display.urgency}` : null;
}
```

- [ ] **Step 4: Render deadline slots in both todo lists**

In the today focus `<li>`, extend the class binding:

```vue
:class="[
  { 'is-done': item.todo.done, 'is-completing': pendingDoneReorderIds.includes(`${item.period}:${item.todo.id}`), 'is-menu-selected': isTodoHighlighted(item.period, item.todo.id) },
  getTodoDeadlineClass(item.todo),
]"
```

Add this span before the today focus star button:

```vue
          <span class="todo-deadline-slot">
            <span
              v-if="getTodoDeadline(item.todo)"
              class="todo-deadline-label"
            >
              {{ getTodoDeadline(item.todo)?.label }}
            </span>
          </span>
```

In the regular todo `<li>`, extend the class binding:

```vue
:class="[
  { 'is-done': entry.todo.done, 'is-starred': entry.todo.starred, 'is-menu-selected': isTodoHighlighted(period, entry.todo.id) },
  getTodoDeadlineClass(entry.todo),
]"
```

Add this span before the regular star button:

```vue
              <span class="todo-deadline-slot">
                <span
                  v-if="getTodoDeadline(entry.todo)"
                  class="todo-deadline-label"
                >
                  {{ getTodoDeadline(entry.todo)?.label }}
                </span>
              </span>
```

- [ ] **Step 5: Add compact deadline styles**

In `src/styles.css`, update the grid columns:

```css
.today-focus-item {
  grid-template-columns: 42px minmax(0, 1fr) max-content 24px;
}

.todo-item {
  grid-template-columns: 14px 28px minmax(0, 1fr) max-content 24px;
}
```

Add these rules near the existing todo item styles:

```css
.todo-deadline-slot {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  height: 34px;
  padding: 0 4px;
}

.todo-deadline-label {
  display: inline-flex;
  align-items: center;
  max-width: 78px;
  min-height: 20px;
  padding: 0 4px;
  color: var(--muted);
  font-size: calc(var(--app-font-size) - 1px);
  line-height: 1;
  white-space: nowrap;
}

.todo-item.deadline-overdue,
.today-focus-item.deadline-overdue {
  background: rgba(239, 68, 68, 0.12);
}

.todo-item.deadline-overdue::before,
.todo-item.deadline-due-soon::before,
.todo-item.deadline-upcoming::before,
.todo-item.deadline-later::before,
.today-focus-item.deadline-overdue::before,
.today-focus-item.deadline-due-soon::before,
.today-focus-item.deadline-upcoming::before,
.today-focus-item.deadline-later::before {
  content: "";
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 3px;
  pointer-events: none;
}

.todo-item.deadline-overdue::before,
.todo-item.deadline-due-soon::before,
.today-focus-item.deadline-overdue::before,
.today-focus-item.deadline-due-soon::before {
  background: #ef4444;
}

.todo-item.deadline-upcoming::before,
.today-focus-item.deadline-upcoming::before {
  background: #f59e0b;
}

.todo-item.deadline-later::before,
.today-focus-item.deadline-later::before {
  background: var(--muted);
  opacity: 0.45;
}

.deadline-overdue .todo-deadline-label,
.deadline-due-soon .todo-deadline-label {
  color: #b91c1c;
  font-weight: 600;
}

.deadline-upcoming .todo-deadline-label {
  color: #92400e;
}
```

Add deadline editor styles near the todo section styles:

```css
.deadline-editor {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 30;
  width: min(260px, calc(100vw - 36px));
  padding: 10px;
  border: 1px solid var(--line-control);
  background: var(--panel);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.deadline-editor-heading,
.deadline-editor-actions,
.deadline-time-options {
  display: flex;
  align-items: center;
}

.deadline-editor-heading {
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: var(--app-font-size);
}

.deadline-date-input {
  width: 100%;
  height: 30px;
  margin-bottom: 8px;
  padding: 0 6px;
  border: 1px solid var(--line-control);
  background: var(--panel);
  color: var(--text);
  font-size: var(--app-font-size);
}

.deadline-time-options {
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.deadline-time-button,
.deadline-ignore-button,
.deadline-confirm-button {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line-control);
  background: transparent;
  color: var(--text);
  font-size: var(--app-font-size);
}

.deadline-time-button.is-selected,
.deadline-confirm-button {
  background: var(--button-hover);
}

.deadline-editor-actions {
  justify-content: flex-end;
  gap: 6px;
}
```

- [ ] **Step 6: Update source-level UI tests**

In `src/__tests__/naive-components.test.ts`, add assertions to the existing todo layout/style test:

```ts
expect(styles).toContain(".todo-deadline-label");
expect(styles).toContain(".deadline-overdue");
expect(styles).toContain(".deadline-due-soon");
expect(styles).toContain(".deadline-upcoming");
expect(styles).toContain(".deadline-later");
```

If any source assertion expects the star button to be the fourth child, update it to account for `.todo-deadline-slot` before `.todo-star-button`.

- [ ] **Step 7: Run component and source tests**

Run:

```bash
npm test -- src/__tests__/todo-panel.test.ts src/__tests__/naive-components.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit deadline UI display**

Run:

```bash
git add src/components/TodoPanel.vue src/styles.css src/__tests__/todo-panel.test.ts src/__tests__/naive-components.test.ts
git commit -m "feat: show todo deadline urgency"
```

## Task 8: README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the reminder documentation**

In `README.md`, in the `### 提醒事项` section, add these bullets after the existing star/today focus bullets or immediately before `### 今日重点`:

```md
- 点亮星标时会打开截止日期和常用整点选择，可选择截止时间后确认，也可忽略时间只设为重点。
- 有截止时间的星标事项会在所属时间段内按截止时间靠前排序。
- 截止时间会显示在星标前，临近和超期事项会用更明显的标签和左侧警示线提醒。
- 取消星标前会二次确认；确认后会同步清除该事项的截止时间。
```

- [ ] **Step 2: Commit README update**

Run:

```bash
git add README.md
git commit -m "docs: document reminder deadlines"
```

## Task 9: Full Verification

**Files:**
- No source changes unless verification finds a failure.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS with `vue-tsc --noEmit` and Vite build completing successfully.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git status --short
git log --oneline -8
```

Expected:

- No unintended unstaged changes except pre-existing user changes that were intentionally preserved.
- Recent commits correspond to the tasks above.

- [ ] **Step 4: If all verification passes, stop**

Do not merge, push, or open a PR unless explicitly requested.

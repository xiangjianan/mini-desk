import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTodoNotifications } from "../composables/useTodoNotifications";
import { defaultState, defaultWorkspace } from "../state/defaults";
import type { TodoItem } from "../types";

const engines: ReturnType<typeof useTodoNotifications>[] = [];
const delivered = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  delivered.mockReset();
  vi.stubGlobal("Notification", class {
    static permission = "granted";
    constructor(title: string, options?: NotificationOptions) { delivered(title, options); }
  });
});

afterEach(() => {
  engines.splice(0).forEach((engine) => engine.clearTimers());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(todos: TodoItem[]) {
  const state = defaultState();
  const workspace = state.workspaces[0];
  workspace.todoLists = [{ id: "today", title: "今天", collapsed: false, compact: false }];
  workspace.todos = { today: todos };
  const prompt = vi.fn();
  const blocked = vi.fn(() => false);
  const engine = useTodoNotifications(state, {
    isMounted: () => true,
    boardTitle: () => "Mini Desk",
    showCrossWorkspacePrompt: prompt,
    isBoardBlocked: blocked,
    hasPendingConfirm: () => false,
  });
  engines.push(engine);
  return { state, workspace, engine, prompt, blocked };
}

function todo(id: string, notifyAt?: number): TodoItem {
  return { id, text: id, done: false, notifyAt };
}

describe("reminder refresh", () => {
  it("walks the board once per refresh, even with thousands of ordinary todos", () => {
    const items = Array.from({ length: 10_000 }, (_, i) => todo(String(i)));
    items.push(todo("due", Date.now()), todo("future", Date.now() + 1000));
    const { workspace, engine } = setup(items);
    const reads = vi.fn(() => items);
    Object.defineProperty(workspace.todos, "today", { configurable: true, get: reads });
    engine.refreshTodoNotifications();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(delivered).toHaveBeenCalledTimes(2);
  });

  it("ignores completed/invalid reminders and reschedules edited deadlines", () => {
    const future = todo("future", Date.now() + 1000);
    const { engine } = setup([
      todo("ordinary"), todo("invalid", NaN), todo("infinite", Infinity),
      { ...todo("done", Date.now()), done: true }, future,
    ]);
    engine.refreshTodoNotifications();
    future.notifyAt = Date.now() + 2000;
    engine.scheduleNextTodoNotification();
    vi.advanceTimersByTime(1000);
    expect(delivered).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(delivered).toHaveBeenCalledExactlyOnceWith("【今天】", expect.objectContaining({ body: "future" }));
    engine.refreshTodoNotifications();
    expect(delivered).toHaveBeenCalledTimes(1);
  });

  it("keeps blocked cross-workspace reminders pending and prompts for the earliest first", () => {
    const { state, engine, prompt, blocked } = setup([]);
    const other = defaultWorkspace("other");
    other.todoLists = [{ id: "today", title: "今天", collapsed: false, compact: false }];
    other.todos = { today: [todo("later", Date.now() - 100), todo("earlier", Date.now() - 200)] };
    state.workspaces.push(other);
    blocked.mockReturnValue(true);
    engine.refreshTodoNotifications();
    expect(prompt).not.toHaveBeenCalled();
    blocked.mockReturnValue(false);
    engine.refreshTodoNotifications();
    expect(prompt.mock.calls[0][0].todo.id).toBe("earlier");
    engine.refreshTodoNotifications();
    expect(prompt.mock.calls[1][0].todo.id).toBe("later");
    expect(delivered).not.toHaveBeenCalled();
  });

  it("retries notification failures and allows reminders to be completed then reopened", () => {
    const item = todo("retry", Date.now());
    const { engine } = setup([item]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    delivered.mockImplementationOnce(() => { throw new Error("temporary failure"); });
    engine.refreshTodoNotifications();
    engine.refreshTodoNotifications();
    engine.refreshTodoNotifications();
    expect(delivered).toHaveBeenCalledTimes(2);
    item.done = true;
    engine.refreshTodoNotifications();
    item.done = false;
    engine.refreshTodoNotifications();
    expect(delivered).toHaveBeenCalledTimes(3);
  });
});

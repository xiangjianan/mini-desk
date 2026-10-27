import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTodoNotifications } from "../composables/useTodoNotifications";
import { defaultState, defaultWorkspace } from "../state/defaults";
import type { TodoItem } from "../types";

const engines: ReturnType<typeof useTodoNotifications>[] = [];
const delivered = vi.fn();
let lastNotification: { onclick?: () => void; onerror?: (() => void) | null; close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  delivered.mockReset();
  vi.stubGlobal("Notification", class {
    static permission = "granted";
    onclick?: () => void;
    onerror?: (() => void) | null;
    close = vi.fn();
    constructor(title: string, options?: NotificationOptions) { delivered(title, options); lastNotification = this; }
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
  const issue = vi.fn();
  const engine = useTodoNotifications(state, {
    isMounted: () => true,
    boardTitle: () => "Mini Desk",
    showCrossWorkspacePrompt: prompt,
    isBoardBlocked: blocked,
    hasPendingConfirm: () => false,
    showNotificationIssue: issue,
  });
  engines.push(engine);
  return { state, workspace, engine, prompt, blocked, issue };
}

function todo(id: string, notifyAt?: number): TodoItem {
  return { id, text: id, done: false, notifyAt };
}

describe("reminder refresh", () => {
  it("focuses the originating page and closes the notification when clicked", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    const { engine } = setup([todo("due", Date.now())]);
    engine.refreshTodoNotifications();
    expect(engine.notificationTitleFlashing()).toBe(true);
    lastNotification.onclick!();
    expect(focus).toHaveBeenCalledOnce();
    expect(lastNotification.close).toHaveBeenCalledOnce();
    expect(engine.notificationTitleFlashing()).toBe(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    engine.handleNotificationReturn();
    expect(engine.notificationTitleFlashing()).toBe(false);
  });

  it.each(["denied", "default", "missing", "throws"])("keeps background title attention when native notifications are %s", async (mode) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    if (mode === "missing") vi.stubGlobal("Notification", undefined);
    else if (mode === "throws") delivered.mockImplementation(() => { throw new Error("unavailable"); });
    else Object.defineProperty(Notification, "permission", { value: mode });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { engine, issue } = setup([todo("due", Date.now() + 1000)]);
    await engine.prepareTodoNotifications();
    if (mode !== "throws") expect(issue).toHaveBeenCalledWith(mode === "missing" ? "unsupported" : "permission");
    vi.advanceTimersByTime(1000);
    expect(document.title).toContain("新提醒");
    vi.advanceTimersByTime(750);
    expect(document.title).toBe("Mini Desk");
    engine.handleNotificationReturn();
    expect(engine.notificationTitleFlashing()).toBe(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    engine.handleNotificationReturn();
    expect(engine.notificationFlashKeys.value).toContain("today:due");
    expect(engine.notificationTitleFlashing()).toBe(false);
  });

  it("flashes when switching away after a foreground reminder, then acknowledges it on return", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { engine } = setup([todo("due", Date.now())]);
    engine.refreshTodoNotifications();
    expect(engine.notificationTitleFlashing()).toBe(false);
    visibility.mockReturnValue("hidden");
    engine.handleNotificationVisibilityChange();
    expect(engine.notificationTitleFlashing()).toBe(true);
    expect(delivered).toHaveBeenCalledOnce();
    visibility.mockReturnValue("visible");
    engine.handleNotificationVisibilityChange();
    visibility.mockReturnValue("hidden");
    engine.handleNotificationVisibilityChange();
    expect(engine.notificationTitleFlashing()).toBe(false);
  });

  it("checks overdue reminders immediately when the tab is hidden or returns after a suspended timer", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { engine } = setup([todo("due", Date.now() + 1000)]);
    engine.refreshTodoNotifications();
    vi.setSystemTime(Date.now() + 2000);
    visibility.mockReturnValue("hidden");
    engine.handleNotificationVisibilityChange();
    expect(delivered).toHaveBeenCalledOnce();
    expect(engine.notificationTitleFlashing()).toBe(true);
    visibility.mockReturnValue("visible");
    engine.handleNotificationVisibilityChange();
    expect(delivered).toHaveBeenCalledOnce();
    expect(engine.notificationTitleFlashing()).toBe(false);
  });

  it("falls back to persistent notifications and avoids duplicate sends while delivery is pending", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    delivered.mockImplementation(() => { throw new Error("page notifications unavailable"); });
    const showNotification = vi.fn(async () => {});
    const getRegistration = vi.fn(async () => ({ active: {}, showNotification }));
    const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration } });
    try {
      const { engine } = setup([todo("due", Date.now())]);
      engine.refreshTodoNotifications();
      engine.refreshTodoNotifications();
      expect(delivered).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(0);
      expect(showNotification).toHaveBeenCalledExactlyOnceWith("【今天】", expect.objectContaining({ body: "due", data: { url: window.location.href } }));
      engine.refreshTodoNotifications();
      expect(delivered).toHaveBeenCalledOnce();
    } finally {
      if (original) Object.defineProperty(navigator, "serviceWorker", original);
      else Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });

  it.each([false, true])("retries asynchronous display failures with a service worker available=%s", async (persistent) => {
    const showNotification = vi.fn(async () => {});
    const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: persistent
      ? { getRegistration: vi.fn(async () => ({ active: {}, showNotification })) } : undefined });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      const { engine } = setup([todo("due", Date.now())]);
      engine.refreshTodoNotifications();
      expect(delivered).toHaveBeenCalledOnce();
      lastNotification.onerror!();
      expect(lastNotification.onerror).toBeNull();
      expect(engine.notificationTitleFlashing()).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      engine.refreshTodoNotifications();
      if (persistent) {
        expect(showNotification).toHaveBeenCalledOnce();
        expect(delivered).toHaveBeenCalledOnce();
      } else expect(delivered).toHaveBeenCalledTimes(2);
      visibility.mockReturnValue("visible");
      engine.handleNotificationReturn();
      expect(engine.notificationTitleFlashing()).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, "serviceWorker", original);
      else Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });

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

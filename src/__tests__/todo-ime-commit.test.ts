import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState, defaultWorkspace, STORAGE_KEY } from "../state/defaults";
import { mountApp } from "./helpers/mount-app";

vi.mock("naive-ui", async () => {
  const { createNaiveUiStubModule } = await import("./helpers/naive-ui-mock");
  return createNaiveUiStubModule();
});

function seedEmptyTodo() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...defaultState(),
    workspaces: [{
      ...defaultWorkspace(),
      todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
      todos: {
        work: [{ id: "n1", text: "", done: false }],
      },
      showCompletedTodos: { work: true },
    }],
  }));
}

function readSavedTodoText(): string | undefined {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  return saved.workspaces?.[0]?.todos?.work?.[0]?.text;
}

describe("todo IME commit persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    seedEmptyTodo();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("keeps and saves committed text when clicking away after IME input (Chromium input-before-compositionend order)", async () => {
    const wrapper = mountApp();
    try {
      const input = wrapper.get('[data-testid="todo-input-work"]');

      await input.trigger("focus");
      await input.trigger("compositionstart");
      (input.element as HTMLInputElement).value = "提醒";
      await input.trigger("input");
      await input.trigger("compositionupdate");
      // Chromium's final commit input still arrives mid-session…
      (input.element as HTMLInputElement).value = "提醒事项测试";
      await input.trigger("input");
      // …then the session closes.
      await input.trigger("compositionend");

      // Clicking elsewhere blurs the row.
      await input.trigger("blur");
      await nextTick();

      // The blur-empty cleanup timer must not treat the row as still empty.
      await vi.advanceTimersByTimeAsync(400);
      await nextTick();

      const row = wrapper.find(".todo-item[data-todo-id]");
      expect(row.exists()).toBe(true);
      expect((wrapper.get('[data-testid="todo-input-work"]').element as HTMLInputElement).value).toBe("提醒事项测试");
      expect(readSavedTodoText()).toBe("提醒事项测试");
    } finally {
      wrapper.unmount();
    }
  });
});

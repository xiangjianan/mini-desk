import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState, defaultWorkspace, STORAGE_KEY } from "../state/defaults";
import { mountApp } from "./helpers/mount-app";

vi.mock("naive-ui", async () => {
  const { createNaiveUiStubModule } = await import("./helpers/naive-ui-mock");
  return createNaiveUiStubModule();
});

function seedTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...defaultState(),
    workspaces: [{
      ...defaultWorkspace(),
      todoLists: [{ id: "work", title: "工作", collapsed: false, compact: false }],
      todos: {
        work: [
          { id: "a", text: "A", done: false },
          { id: "b", text: "B", done: false },
          { id: "c", text: "C", done: false },
          { id: "d", text: "D", done: false },
        ],
      },
      showCompletedTodos: { work: false },
    }],
  }));
}

/** Right-click the first remaining todo and pick the 删除 menu option. */
async function deleteViaMenu(wrapper: ReturnType<typeof mountApp>) {
  const item = wrapper.findAll(".todo-item[data-todo-id]")[0];
  await item.trigger("contextmenu");
  await nextTick();
  const option = wrapper.findAll(".dropdown-option").find((o) => o.text() === "删除");
  await option?.trigger("click");
  await vi.advanceTimersByTimeAsync(200);
  await nextTick();
}

function remainingTodos(wrapper: ReturnType<typeof mountApp>): number {
  return wrapper.findAll(".todo-item[data-todo-id]").length;
}

function confirmButtonsVisible(wrapper: ReturnType<typeof mountApp>): boolean {
  return wrapper.find('[data-testid="companion-yes"]').exists();
}

function bubbleText(wrapper: ReturnType<typeof mountApp>): string {
  return wrapper.find('[data-testid="companion-confirm"]').text();
}

async function clickConfirm(wrapper: ReturnType<typeof mountApp>, testid: "companion-yes" | "companion-no") {
  await wrapper.get(`[data-testid="${testid}"]`).trigger("click");
  await nextTick();
}

describe("todo delete confirmation streak", () => {
  beforeEach(() => {
    localStorage.clear();
    seedTodos();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("asks for confirmation on the first and second delete", async () => {
    const wrapper = mountApp();
    try {
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(3);
      expect(bubbleText(wrapper)).toMatch(/已删|已移除|已清|删除完成/);

      // Regression: the second consecutive delete must also show the confirm
      // bubble (it used to appear missing while the previous toast was up).
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(2);
    } finally {
      wrapper.unmount();
    }
  });

  it("deletes directly (no bubble prompt) from the third consecutive delete on", async () => {
    const wrapper = mountApp();
    try {
      await deleteViaMenu(wrapper);
      await clickConfirm(wrapper, "companion-yes");
      await deleteViaMenu(wrapper);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(2);

      // Third consecutive delete: streak exceeds the limit, no prompt.
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(false);
      expect(remainingTodos(wrapper)).toBe(1);
      expect(bubbleText(wrapper)).toMatch(/已删|已移除|已清|删除完成/);

      // Fourth delete: still inside the active streak, still no prompt.
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(false);
      expect(remainingTodos(wrapper)).toBe(0);
    } finally {
      wrapper.unmount();
    }
  });

  it("asks again after the streak expires", async () => {
    const wrapper = mountApp();
    try {
      await deleteViaMenu(wrapper);
      await clickConfirm(wrapper, "companion-yes");
      await deleteViaMenu(wrapper);
      await clickConfirm(wrapper, "companion-yes");
      await deleteViaMenu(wrapper);
      expect(remainingTodos(wrapper)).toBe(1);

      // Beyond the streak reset window the confirm bubble returns.
      await vi.advanceTimersByTimeAsync(31_000);
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(0);
    } finally {
      wrapper.unmount();
    }
  });

  it("cancelling a confirm restarts the streak", async () => {
    const wrapper = mountApp();
    try {
      await deleteViaMenu(wrapper);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(3);

      // Cancel the second delete: nothing is removed and the streak resets.
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-no");
      expect(remainingTodos(wrapper)).toBe(3);

      // Because the streak restarted, the next delete still prompts.
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(2);
    } finally {
      wrapper.unmount();
    }
  });
});

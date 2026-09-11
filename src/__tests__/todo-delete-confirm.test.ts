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

describe("todo delete confirmation", () => {
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

  it("prompts on every consecutive delete, including the third and fourth", async () => {
    const wrapper = mountApp();
    try {
      // Regression 1: the second consecutive delete must also show the confirm
      // bubble (it used to appear missing while the previous toast was up).
      // Regression 2: a former streak bypass deleted directly from the third
      // delete on — every delete must prompt, with no time-window exemption.
      for (let nth = 1; nth <= 4; nth += 1) {
        await deleteViaMenu(wrapper);
        expect(confirmButtonsVisible(wrapper), `第 ${nth} 次删除必须弹出确认`).toBe(true);
        await clickConfirm(wrapper, "companion-yes");
        expect(remainingTodos(wrapper)).toBe(4 - nth);
        expect(bubbleText(wrapper)).toMatch(/已删|已移除|已清|删除完成/);
      }
    } finally {
      wrapper.unmount();
    }
  });

  it("cancelling keeps the todo and the next delete still prompts", async () => {
    const wrapper = mountApp();
    try {
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-no");
      expect(remainingTodos(wrapper)).toBe(4);

      // The next delete is not remembered as part of any streak — it prompts again.
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(3);
    } finally {
      wrapper.unmount();
    }
  });

  it("still prompts after a long gap since the last delete", async () => {
    const wrapper = mountApp();
    try {
      await deleteViaMenu(wrapper);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(3);

      // A former streak expired here; now there is no streak at all, so the
      // prompt must appear regardless of elapsed time.
      await vi.advanceTimersByTimeAsync(60_000);
      await deleteViaMenu(wrapper);
      expect(confirmButtonsVisible(wrapper)).toBe(true);
      await clickConfirm(wrapper, "companion-yes");
      expect(remainingTodos(wrapper)).toBe(2);
    } finally {
      wrapper.unmount();
    }
  });
});

import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.vue";
import { defaultState, defaultWorkspace, STORAGE_KEY } from "../state/defaults";

vi.mock("naive-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("naive-ui")>();
  return {
    ...actual,
    NDropdown: { name: "NDropdown", template: "<div><slot /></div>" },
    NPopover: {
      name: "NPopover",
      props: ["show"],
      template: '<div v-bind="$attrs"><slot name="trigger" /><div v-if="show" class="n-popover"><slot /></div></div>',
    },
    NTooltip: { name: "NTooltip", template: '<span><slot name="trigger" /><slot /></span>' },
    NModal: {
      name: "NModal",
      props: ["show", "title"],
      template: '<section v-if="show" class="n-modal"><h2>{{ title }}</h2><slot /></section>',
    },
  };
});

const dropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: `
    <div>
      <slot />
      <button
        v-for="option in options"
        :key="option.key"
        class="dropdown-option"
        :data-key="option.key"
        :disabled="option.disabled"
        type="button"
        @click="!option.disabled && $emit('select', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  `,
};

function mountApp() {
  return mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        NDropdown: dropdownStub,
        NPopover: {
          props: ["show"],
          template: '<div v-bind="$attrs"><slot name="trigger" /><div v-if="show" class="n-popover"><slot /></div></div>',
        },
        NTooltip: { template: '<span><slot name="trigger" /><slot /></span>' },
        NModal: { props: ["show", "title"], template: '<section v-if="show" class="n-modal"><h2>{{ title }}</h2><slot /></section>' },
      },
    },
  });
}

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

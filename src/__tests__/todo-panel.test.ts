import { defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TodoPanel from "../components/TodoPanel.vue";
import { DEFAULT_TITLES } from "../state/defaults";
import { completeTodo } from "../state/todos";
import type { TodoMap, TodoPeriod } from "../types";

const checkboxStub = {
  props: ["checked"],
  emits: ["update:checked"],
  template: '<button class="checkbox-stub" type="button" @click="$emit(\'update:checked\', true)"></button>',
};

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

const tooltipStub = {
  template: '<span><slot name="trigger" /><slot /></span>',
};

function values(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll("input.todo-input").map((input) => (input.element as HTMLInputElement).value);
}

describe("TodoPanel", () => {
  it("keeps empty todo lists visually blank while preserving click-to-create", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [],
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

    expect(wrapper.find(".todo-empty").exists()).toBe(false);
    expect(wrapper.get(".todo-empty-hint").text()).toBe("");

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.emitted("create")?.[0]).toEqual(["morning"]);
  });

  it("does not create a todo from a click on controls inside blank list space", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [],
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

    await wrapper.get(".editable-title").trigger("click");

    expect(wrapper.emitted("create")).toBeUndefined();
  });

  it("hides completed reminders by default while keeping period progress", () => {
    const wrapper = mount(TodoPanel, {
      props: {
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

    expect(wrapper.find('.todo-section[data-period="morning"] .todo-count').text()).toBe("1/2");
    expect(values(wrapper)).toEqual(["未完成"]);
    expect(wrapper.find(".todo-completed-divider").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows completed reminders and a weak divider when enabled", () => {
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

    expect(values(wrapper)).toEqual(["未完成", "已完成"]);
    expect(wrapper.get(".todo-completed-divider").text()).toBe("已完成");
    wrapper.unmount();
  });

  it("uses a period three-dot menu for completed visibility and clearing", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        showCompleted: { morning: false, noon: false, evening: false },
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

    await wrapper.get('.todo-section[data-period="morning"] .todo-section-menu-button').trigger("click");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "显示已完成",
      "清理已完成",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "显示已完成")?.trigger("click");
    expect(wrapper.emitted("toggleCompletedVisibility")?.[0]).toEqual(["morning", true]);

    await wrapper.get('.todo-section[data-period="morning"] .todo-section-menu-button').trigger("click");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "清理已完成")?.trigger("click");
    expect(wrapper.emitted("clearCompleted")?.[0]).toEqual(["morning", expect.any(HTMLElement)]);

    wrapper.unmount();
  });

  it("applies completed visibility per reminder section", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        showCompleted: { morning: true, noon: false, evening: false },
        todos: {
          morning: [
            { id: "a", text: "早上未完成", done: false },
            { id: "b", text: "早上已完成", done: true },
          ],
          noon: [
            { id: "c", text: "中午未完成", done: false },
            { id: "d", text: "中午已完成", done: true },
          ],
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

    expect(values(wrapper)).toEqual(["早上未完成", "早上已完成", "中午未完成"]);

    await wrapper.get('.todo-section[data-period="noon"] .todo-section-menu-button').trigger("click");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "显示已完成",
      "清理已完成",
      "Tips",
    ]);

    wrapper.unmount();
  });

  it("emits star toggles and aggregates starred reminders into today's focus", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "重点未完成", done: false, starred: true }],
          noon: [{ id: "b", text: "重点已完成", done: true, starred: true }],
          evening: [{ id: "c", text: "普通事项", done: false }],
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

    expect(wrapper.get(".today-focus-section").text()).toContain("❗️ 今日重点");
    expect(wrapper.findAll(".today-focus-input").map((item) => (item.element as HTMLInputElement).value)).toEqual([
      "重点未完成",
      "重点已完成",
    ]);
    expect(wrapper.findAll(".today-focus-item")[1].classes()).toContain("is-done");

    await wrapper.get(".today-focus-item .todo-star-button").trigger("click");

    expect(wrapper.emitted("star")?.[0]).toEqual([
      {
        period: "morning",
        id: "a",
        starred: false,
        anchor: expect.any(HTMLElement),
      },
    ]);

    await wrapper.get(".todo-item .todo-star-button").trigger("click");

    expect(wrapper.emitted("star")?.[1]).toEqual([
      {
        period: "morning",
        id: "a",
        starred: false,
        anchor: expect.any(HTMLElement),
      },
    ]);
    wrapper.unmount();
  });

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
    expect(wrapper.emitted("star")).toBeUndefined();
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
      {
        period: "morning",
        id: "a",
        starred: true,
        deadlineAt: new Date(2026, 4, 30, 15).getTime(),
        anchor: expect.any(HTMLElement),
      },
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

    expect(wrapper.emitted("star")?.[0]).toEqual([
      { period: "morning", id: "a", starred: true, anchor: expect.any(HTMLElement) },
    ]);
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

    expect(wrapper.emitted("star")?.[0]).toEqual([
      { period: "morning", id: "a", starred: false, anchor: expect.any(HTMLElement) },
    ]);
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

  it("edits the today focus title through the shared title model", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "重点事项", done: false, starred: true }],
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

    await wrapper.get(".today-focus-heading .editable-title").trigger("dblclick");
    await wrapper.get(".today-focus-heading .title-edit-input").setValue("❗️ 本日重点");
    await wrapper.get(".today-focus-heading .title-edit-input").trigger("blur");

    expect(wrapper.emitted("titleUpdate")?.[0]).toEqual(["today-focus-title", "❗️ 本日重点"]);
    wrapper.unmount();
  });

  it("opens the reminder context menu from today's focus items", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "重点事项", done: false, starred: true }],
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

    await wrapper.get(".today-focus-item").trigger("contextmenu");

    expect(wrapper.get(".today-focus-item").classes()).toContain("is-menu-selected");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "复制",
      "删除",
      "取消星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除")?.trigger("click");

    expect(wrapper.emitted("remove")?.[0]).toEqual(["morning", "a", expect.any(HTMLElement)]);
    wrapper.unmount();
  });

  it("places the reminder star action at the far right of the row", () => {
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

    const rowChildren = Array.from(wrapper.get(".todo-item").element.children).map((child) =>
      (child as HTMLElement).className,
    );

    expect(rowChildren[0]).toContain("todo-drag-handle");
    expect(rowChildren[1]).toContain("checkbox-stub");
    expect(rowChildren[2]).toContain("todo-input");
    expect(rowChildren[3]).toContain("todo-star-button");
    wrapper.unmount();
  });

  it("places the today focus star action at the far right of the row", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "重点事项", done: false, starred: true }],
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

    const rowChildren = Array.from(wrapper.get(".today-focus-item").element.children).map((child) =>
      (child as HTMLElement).className,
    );

    expect(rowChildren[0]).toContain("checkbox-stub");
    expect(rowChildren[1]).toContain("today-focus-input");
    expect(rowChildren[2]).toContain("todo-star-button");
    wrapper.unmount();
  });

  it("emits the todo section as the completion anchor", async () => {
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

    await wrapper.get(".todo-item .checkbox-stub").trigger("click");

    const emitted = wrapper.emitted("complete")?.[0];
    expect(emitted?.slice(0, 3)).toEqual(["morning", "a", true]);
    expect((emitted?.[3] as HTMLElement).classList.contains("todo-section")).toBe(true);
    wrapper.unmount();
  });

  it("keeps a newly completed todo in place for 200ms before animated regrouping", async () => {
    vi.useFakeTimers();

    const Harness = defineComponent({
      components: { TodoPanel },
      setup() {
        const todos = ref<TodoMap>({
          morning: [
            { id: "a", text: "第一项", done: false },
            { id: "b", text: "第二项", done: false },
          ],
          noon: [],
          evening: [],
        });
        const complete = (period: TodoPeriod, id: string, done: boolean) => {
          todos.value = completeTodo(todos.value, period, id, done);
        };
        return { todos, complete, titles: DEFAULT_TITLES };
      },
      template: '<TodoPanel :todos="todos" :titles="titles" @complete="complete" />',
    });

    const wrapper = mount(Harness, {
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

    expect(values(wrapper)).toEqual(["第一项", "第二项"]);

    await wrapper.get(".checkbox-stub").trigger("click");
    await nextTick();

    expect(values(wrapper)).toEqual(["第一项", "第二项"]);
    expect(wrapper.find(".todo-completed-divider").exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(199);
    expect(values(wrapper)).toEqual(["第一项", "第二项"]);
    expect(wrapper.find(".todo-completed-divider").exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();

    expect(values(wrapper)).toEqual(["第二项"]);
    expect(wrapper.find(".todo-list.todo-move").exists()).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("creates a new blank todo when a non-empty list blank area is clicked after completing an item", async () => {
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

    await wrapper.get(".checkbox-stub").trigger("click");
    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.emitted("complete")?.[0].slice(0, 3)).toEqual(["morning", "a", true]);
    expect(wrapper.emitted("create")?.[0]).toEqual(["morning"]);
    wrapper.unmount();
  });

  it("creates a blank todo from a single click on non-empty blank list space", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: true }],
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

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.emitted("create")?.[0]).toEqual(["morning"]);
    wrapper.unmount();
  });

  it("keeps existing todo text readonly until the input is clicked", async () => {
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
    const input = wrapper.get("input.todo-input");

    expect(input.attributes("readonly")).toBeDefined();

    await input.trigger("click");

    expect(input.attributes("readonly")).toBeUndefined();
    wrapper.unmount();
  });

  it("allows selecting reminder text before it is being edited", async () => {
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
    const input = wrapper.get("input.todo-input").element as HTMLInputElement;
    const selectSpy = vi.spyOn(input, "select");

    const inputWrapper = wrapper.get("input.todo-input");
    input.setSelectionRange(1, 3);
    await inputWrapper.trigger("click");
    await wrapper.vm.$nextTick();

    expect(selectSpy).not.toHaveBeenCalled();
    expect(inputWrapper.attributes("readonly")).toBeDefined();
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);
    wrapper.unmount();
  });

  it("allows selecting reminder text after it is already being edited", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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
    const inputWrapper = wrapper.get("input.todo-input");
    const input = inputWrapper.element as HTMLInputElement;

    await inputWrapper.trigger("click");
    input.setSelectionRange(1, 3);
    await inputWrapper.trigger("click");
    await wrapper.vm.$nextTick();

    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);
    wrapper.unmount();
  });

  it("keeps the caret at the original clicked position when click editing a reminder", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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
    const input = wrapper.get("input.todo-input").element as HTMLInputElement;

    input.setSelectionRange(3, 3);
    await wrapper.get("input.todo-input").trigger("mouseup");
    input.setSelectionRange(3, 3);
    await wrapper.get("input.todo-input").trigger("click");
    await wrapper.vm.$nextTick();

    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
    wrapper.unmount();
  });

  it("keeps a focused blank todo editable after the first character is entered", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "", done: false }],
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

    await wrapper.get("input.todo-input").trigger("focus");
    await wrapper.setProps({
      todos: {
        morning: [{ id: "a", text: "第", done: false }],
        noon: [],
        evening: [],
      },
    });

    expect(wrapper.get("input.todo-input").attributes("readonly")).toBeUndefined();
    wrapper.unmount();
  });

  it("keeps new todo inputs visually empty instead of showing the old placeholder", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "", done: false }],
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

    expect(wrapper.get("input.todo-input").attributes("placeholder")).toBeUndefined();
    wrapper.unmount();
  });

  it("opens the usage guide from blank reminder area context menus", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [],
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

    await wrapper.get('[data-period="morning"]').trigger("contextmenu");
    await wrapper.get(".dropdown-option").trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["todos", expect.any(HTMLElement), true]);
    wrapper.unmount();
  });

  it("uses compact reminder item context menus", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [
            { id: "a", text: "第一项", done: false },
            { id: "b", text: "第二项", done: false },
            { id: "c", text: "第三项", done: false },
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

    await wrapper.findAll(".todo-item")[1].trigger("contextmenu");

    expect(wrapper.findAll(".todo-item")[1].classes()).toContain("is-menu-selected");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "复制",
      "删除",
      "星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "星标")?.trigger("click");
    expect(wrapper.get(".deadline-editor").exists()).toBe(true);
    expect(wrapper.emitted("star")).toBeUndefined();
    await wrapper.findAll(".todo-item")[1].trigger("contextmenu");

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "复制")?.trigger("click");
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("第二项");
    expect(wrapper.findAll(".todo-item")[1].classes()).not.toContain("is-menu-selected");

    wrapper.unmount();
  });

  it("splits a reminder into two items when Enter is pressed in the middle of editable text", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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
    const inputWrapper = wrapper.get("input.todo-input");
    const input = inputWrapper.element as HTMLInputElement;

    await inputWrapper.trigger("click");
    input.setSelectionRange(2, 2);
    await inputWrapper.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("split")?.[0]).toEqual(["morning", "a", "第一", "项内容"]);
    wrapper.unmount();
  });

  it("does not split reminders while Chinese IME composition is confirming with Enter", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "中文输入", done: false }],
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
    const inputWrapper = wrapper.get("input.todo-input");

    await inputWrapper.trigger("click");
    await inputWrapper.trigger("keydown", { key: "Enter", isComposing: true });
    await inputWrapper.trigger("keydown", { key: "Enter", keyCode: 229 });

    expect(wrapper.emitted("split")).toBeUndefined();
    wrapper.unmount();
  });

  it("only starts dragging reminders from the row handle and keeps text selectable", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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

    expect(wrapper.get(".todo-item").attributes("draggable")).toBeUndefined();
    expect(wrapper.get(".todo-input").attributes("draggable")).toBe("false");
    expect(wrapper.get(".todo-drag-handle").attributes("draggable")).toBe("true");

    await wrapper.get(".todo-drag-handle").trigger("dragstart");
    expect(wrapper.get(".todo-item").classes()).toContain("is-menu-selected");

    await wrapper.get(".todo-drag-handle").trigger("dragend");
    expect(wrapper.get(".todo-item").classes()).not.toContain("is-menu-selected");

    wrapper.unmount();
  });

  it("keeps the reminder item highlighted while editing or dragging it", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [
            { id: "a", text: "第一项", done: false },
            { id: "b", text: "第二项", done: false },
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

    await wrapper.findAll(".todo-input")[1].trigger("click");

    expect(wrapper.findAll(".todo-item")[1].classes()).toContain("is-menu-selected");

    await wrapper.findAll(".todo-input")[1].trigger("blur");
    await wrapper.findAll(".todo-drag-handle")[1].trigger("dragstart");

    expect(wrapper.findAll(".todo-item")[1].classes()).toContain("is-menu-selected");

    await wrapper.findAll(".todo-drag-handle")[1].trigger("dragend");

    expect(wrapper.findAll(".todo-item")[1].classes()).not.toContain("is-menu-selected");

    wrapper.unmount();
  });

  it("copies the full reminder text from the item context menu", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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
    const inputWrapper = wrapper.get("input.todo-input");

    await inputWrapper.trigger("contextmenu");

    expect(wrapper.get(".todo-item").classes()).toContain("is-menu-selected");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "复制",
      "删除",
      "星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option")[0].trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("第一项内容");
    wrapper.unmount();
  });

  it("keeps the native reminder text context menu when clipboard APIs are unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined });
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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
    const input = wrapper.get("input.todo-input").element as HTMLInputElement;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 16,
    });

    input.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.find(".dropdown-option").exists()).toBe(false);
    wrapper.unmount();
  });

  it("falls back to the browser copy command when reminder copy is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { clipboard: { writeText } });
    Object.assign(document, { execCommand });
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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

    await wrapper.get("input.todo-input").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option")[0].trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("第一项内容");
    expect(execCommand).toHaveBeenCalledWith("copy");
    wrapper.unmount();
  });

  it("pastes clipboard text from an existing reminder context menu", async () => {
    const readText = vi.fn().mockResolvedValue("粘贴内容");
    Object.assign(navigator, { clipboard: { readText, writeText: vi.fn() } });
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
    const inputWrapper = wrapper.get("input.todo-input");
    const input = inputWrapper.element as HTMLInputElement;

    expect(inputWrapper.attributes("readonly")).toBeDefined();
    input.setSelectionRange(input.value.length, input.value.length);
    await inputWrapper.trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "复制",
      "粘贴",
      "删除",
      "星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "粘贴")?.trigger("click");
    await Promise.resolve();

    expect(readText).toHaveBeenCalled();
    expect(wrapper.emitted("update")?.at(-1)).toEqual(["morning", "a", "第一项粘贴内容"]);
    wrapper.unmount();
  });

  it("copies only the selected reminder text from the input context menu", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项内容", done: false }],
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
    const inputWrapper = wrapper.get("input.todo-input");
    const input = inputWrapper.element as HTMLInputElement;

    input.setSelectionRange(1, 3);
    await inputWrapper.trigger("select");
    await inputWrapper.trigger("contextmenu");
    await wrapper.findAll(".dropdown-option")[0].trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("一项");
    wrapper.unmount();
  });
  it("does not show an edit action in reminder context menus", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
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

    await wrapper.get("input.todo-input").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).not.toContain("编辑");
    wrapper.unmount();
  });
});

import { defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TodoPanel from "../components/TodoPanel.vue";
import { DEFAULT_TITLES, EMPTY_HINTS } from "../state/defaults";
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
  it("does not render todo-empty placeholders for empty todo lists", async () => {
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
    expect(wrapper.get(".todo-empty-hint").text()).toBe(EMPTY_HINTS.todos.morning);
    expect(wrapper.get(".todo-empty-hint").text()).not.toMatch(/早上|中午|晚上|上午|下午/);

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
        showCompleted: true,
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
        showCompleted: false,
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
    expect(wrapper.emitted("toggleCompletedVisibility")?.[0]).toEqual([true]);

    await wrapper.get('.todo-section[data-period="morning"] .todo-section-menu-button').trigger("click");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "清理已完成")?.trigger("click");
    expect(wrapper.emitted("clearCompleted")?.[0]).toEqual(["morning", expect.any(HTMLElement)]);

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

    expect(wrapper.get(".today-focus-section").text()).toContain("今日重点");
    expect(wrapper.findAll(".today-focus-input").map((item) => (item.element as HTMLInputElement).value)).toEqual([
      "重点未完成",
      "重点已完成",
    ]);
    expect(wrapper.findAll(".today-focus-item")[1].classes()).toContain("is-done");

    await wrapper.get(".todo-item .todo-star-button").trigger("click");

    expect(wrapper.emitted("star")?.[0]).toEqual(["morning", "a", false]);
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
      "编辑",
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

    await vi.advanceTimersByTimeAsync(199);
    expect(values(wrapper)).toEqual(["第一项", "第二项"]);

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

  it("does not select todo text when clicking to edit", async () => {
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

    input.setSelectionRange(1, 3);
    await wrapper.get("input.todo-input").trigger("click");
    await wrapper.vm.$nextTick();

    expect(selectSpy).not.toHaveBeenCalled();
    expect(input.selectionStart).toBe(input.selectionEnd);
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
    input.setSelectionRange(1, 4);
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
      "编辑",
      "删除",
      "星标",
      "Tips",
    ]);

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
      "编辑",
      "删除",
      "星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option")[0].trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("第一项内容");
    wrapper.unmount();
  });

  it("opens editing from the reminder context menu", async () => {
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

    await inputWrapper.trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑")?.trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.get("input.todo-input").attributes("readonly")).toBeUndefined();
    wrapper.unmount();
  });
});

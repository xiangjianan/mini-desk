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

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("dblclick");

    expect(wrapper.emitted("create")?.[0]).toEqual(["morning"]);
  });

  it("does not create a todo from a single click on blank list space", async () => {
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

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.emitted("create")).toBeUndefined();
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

    expect(values(wrapper)).toEqual(["第二项", "第一项"]);
    expect(wrapper.find(".todo-list.todo-move").exists()).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("does not create a new blank todo when a non-empty list blank area is clicked after completing an item", async () => {
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

    expect(wrapper.emitted("complete")?.[0]).toEqual(["morning", "a", true]);
    expect(wrapper.emitted("create")).toBeUndefined();
    wrapper.unmount();
  });

  it("creates a blank todo from a double click on non-empty blank list space", async () => {
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

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("dblclick");

    expect(wrapper.emitted("create")?.[0]).toEqual(["morning"]);
    wrapper.unmount();
  });

  it("keeps existing todo text readonly until the input is double-clicked", async () => {
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

    await input.trigger("dblclick");

    expect(input.attributes("readonly")).toBeUndefined();
    wrapper.unmount();
  });

  it("does not select todo text when double-clicking to edit", async () => {
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
    await wrapper.get("input.todo-input").trigger("dblclick");
    await wrapper.vm.$nextTick();

    expect(selectSpy).not.toHaveBeenCalled();
    expect(input.selectionStart).toBe(input.selectionEnd);
    wrapper.unmount();
  });

  it("keeps the caret at the original clicked position when double-click editing a reminder", async () => {
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
    await wrapper.get("input.todo-input").trigger("dblclick");
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

  it("adds top and bottom actions to reminder item context menus", async () => {
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
      "置顶",
      "置底",
      "删除",
      "使用指南",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置顶")?.trigger("click");
    expect(wrapper.emitted("move")?.[0]).toEqual([{ period: "morning", id: "b" }, "morning", "a"]);
    expect(wrapper.findAll(".todo-item")[1].classes()).not.toContain("is-menu-selected");

    await wrapper.findAll(".todo-item")[1].trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置底")?.trigger("click");
    expect(wrapper.emitted("move")?.[1]).toEqual([{ period: "morning", id: "b" }, "morning"]);

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

    await inputWrapper.trigger("dblclick");
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

    await wrapper.findAll(".todo-input")[1].trigger("dblclick");

    expect(wrapper.findAll(".todo-item")[1].classes()).toContain("is-menu-selected");

    await wrapper.findAll(".todo-input")[1].trigger("blur");
    await wrapper.findAll(".todo-drag-handle")[1].trigger("dragstart");

    expect(wrapper.findAll(".todo-item")[1].classes()).toContain("is-menu-selected");

    await wrapper.findAll(".todo-drag-handle")[1].trigger("dragend");

    expect(wrapper.findAll(".todo-item")[1].classes()).not.toContain("is-menu-selected");

    wrapper.unmount();
  });

  it("shows copy and paste actions when right-clicking selected editable reminder text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("补充");
    Object.assign(navigator, { clipboard: { writeText, readText } });
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

    await inputWrapper.trigger("dblclick");
    input.setSelectionRange(0, 3);
    await inputWrapper.trigger("select");
    await inputWrapper.trigger("contextmenu");

    expect(wrapper.get(".todo-item").classes()).toContain("is-menu-selected");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "复制",
      "粘贴",
      "置顶",
      "置底",
      "删除",
      "使用指南",
    ]);

    input.setSelectionRange(3, 3);
    await wrapper.findAll(".dropdown-option")[0].trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("第一项");
    wrapper.unmount();
  });

  it("pastes clipboard text into editable reminder text from the context menu", async () => {
    const readText = vi.fn().mockResolvedValue("补充");
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

    await inputWrapper.trigger("dblclick");
    input.setSelectionRange(input.value.length, input.value.length);
    await inputWrapper.trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "粘贴")?.trigger("click");
    await Promise.resolve();

    expect(wrapper.emitted("update")?.at(-1)).toEqual(["morning", "a", "第一项补充"]);
    wrapper.unmount();
  });
});

import { defineComponent, nextTick, ref } from "vue";
import { config, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const datePickerStub = defineComponent({
  name: "NDatePicker",
  props: {
    panel: Boolean,
    value: Number,
    type: String,
    format: String,
    valueFormat: String,
    defaultTime: String,
    timePickerProps: Object,
    actions: Array,
    clearable: Boolean,
  },
  emits: ["update:value", "update:show", "confirm"],
  template: `
    <button
      class="date-picker-stub"
      type="button"
      :data-value="String(value ?? '')"
      :data-type="type"
      @click="$emit('update:show', true)"
    >
      日期时间选择
      <slot name="clear" :onClear="() => $emit('update:value', null)" text="清除" />
      <slot name="now" :onNow="() => $emit('update:value', Date.now())" text="今天" />
      <slot name="confirm" :onConfirm="() => $emit('confirm', value)" :disabled="false" text="确认" />
    </button>
  `,
});

config.global.stubs = {
  ...config.global.stubs,
  DatePicker: datePickerStub,
  NDatePicker: datePickerStub,
};

const tooltipStub = {
  template: '<span><slot name="trigger" /><slot /></span>',
};

function values(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll("input.todo-input").map((input) => (input.element as HTMLInputElement).value);
}

function todayFocusValues(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll("input.today-focus-input").map((input) => (input.element as HTMLInputElement).value);
}

function getTeleportedDatePickerText(): string {
  return document.body.querySelector(".notify-floating-date-picker")?.textContent ?? "";
}

function getLatestNotifyPickerElement(): HTMLElement | null {
  return Array.from(document.body.querySelectorAll<HTMLElement>(".notify-floating-date-picker")).at(-1) ?? null;
}

function clickTeleportedNotifyAction(label: string): void {
  const action = Array.from(getLatestNotifyPickerElement()?.querySelectorAll<HTMLElement>(".notify-panel-action") ?? []).reverse().find((button) =>
    button.textContent?.includes(label),
  );
  action?.click();
}

function clickTeleportedNotifyTime(hour: number, minute: number): void {
  const picker = getLatestNotifyPickerElement();
  (picker?.querySelectorAll(".notify-time-column.is-hour .notify-time-option")[hour] as HTMLButtonElement | undefined)?.click();
  (picker?.querySelectorAll(".notify-time-column.is-minute .notify-time-option")[minute] as HTMLButtonElement | undefined)?.click();
}

const defaultTodoLists = [
  { id: "morning", title: "☀️ 早上", collapsed: false, compact: false },
  { id: "noon", title: "🌤️ 中午", collapsed: false, compact: false },
  { id: "evening", title: "🌙 晚上", collapsed: false, compact: false },
];

describe("TodoPanel", () => {
  it("emits a declutter prompt when a reminder list with at least seven items is focused", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: {
          morning: Array.from({ length: 7 }, (_, index) => ({ id: `todo-${index}`, text: `事项 ${index + 1}`, done: false })),
          noon: [],
          evening: [],
        },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('[data-testid="todo-input-morning"]').trigger("focus");

    expect(wrapper.emitted("declutter")?.[0]).toEqual([expect.any(HTMLElement)]);
  });

  it("does not emit a declutter prompt while a reminder list has fewer than seven items", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: {
          morning: Array.from({ length: 6 }, (_, index) => ({ id: `todo-${index}`, text: `事项 ${index + 1}`, done: false })),
          noon: [],
          evening: [],
        },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('[data-testid="todo-input-morning"]').trigger("focus");

    expect(wrapper.emitted("declutter")).toBeUndefined();
  });

  it("counts only visible reminder items before emitting a declutter prompt", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: {
          morning: [
            ...Array.from({ length: 6 }, (_, index) => ({ id: `todo-${index}`, text: `事项 ${index + 1}`, done: false })),
            { id: "done", text: "已完成事项", done: true },
          ],
          noon: [],
          evening: [],
        },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('[data-testid="todo-input-morning"]').trigger("focus");

    expect(wrapper.findAll('[data-testid="todo-input-morning"]')).toHaveLength(6);
    expect(wrapper.emitted("declutter")).toBeUndefined();
  });

  it("renders reminder sections from configurable todo lists", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: false }],
        todos: { custom: [{ id: "a", text: "A", done: false }] },
        showCompleted: { custom: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    expect(wrapper.find('.todo-section[data-list-id="custom"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="todo-list-custom"]').exists()).toBe(true);
    expect(values(wrapper)).toEqual(["A"]);
  });

  it("opens the shared list menu and dialog before creating a reminder list", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        showCompleted: { morning: true, noon: true, evening: true },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    expect(wrapper.find(".todo-add-list-button").exists()).toBe(false);

    await wrapper.get('.todo-section[data-list-id="morning"]').trigger("contextmenu");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "清理已完成",
      "隐藏已完成",
      "新建列表",
      "编辑列表",
      "删除列表",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "新建列表")?.trigger("click");
    await wrapper.get(".todo-list-create-input").setValue("工作提醒");
    await wrapper.get(".todo-list-create-confirm").trigger("click");

    expect(wrapper.emitted("createList")?.[0]).toEqual([expect.any(HTMLElement), "工作提醒"]);
    expect(wrapper.find(".todo-list-create-dialog").exists()).toBe(false);
  });

  it("emits list title updates", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('.todo-section[data-list-id="morning"] .editable-title').trigger("dblclick");
    await wrapper.get('.todo-section[data-list-id="morning"] .title-edit-input').setValue("上午");
    await wrapper.get('.todo-section[data-list-id="morning"] .title-edit-input').trigger("blur");

    expect(wrapper.emitted("updateListTitle")?.[0]).toEqual(["morning", "上午"]);
  });

  it("opens the shared list menu from a reminder list title and edits the title", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        showCompleted: { morning: true, noon: true, evening: true },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "清理已完成",
      "隐藏已完成",
      "新建列表",
      "编辑列表",
      "删除列表",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑列表")?.trigger("click");
    await nextTick();

    expect(wrapper.find('.todo-section[data-list-id="morning"] .title-edit-input').exists()).toBe(true);
  });

  it("auto-edits the configured list matching editListId", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: [{ id: "custom", title: "未命名列表", collapsed: false, compact: false }],
        editListId: "custom",
        todos: { custom: [] },
        showCompleted: { custom: false },
        titles: DEFAULT_TITLES,
      },
      attachTo: document.body,
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await nextTick();

    const input = wrapper.get('.todo-section[data-list-id="custom"] .title-edit-input');
    expect((input.element as HTMLInputElement).value).toBe("未命名列表");
    expect(document.activeElement).toBe(input.element);

    wrapper.unmount();
  });

  it("uses legacy titles and titleUpdate events when todoLists are omitted", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: { morning: [], noon: [], evening: [] },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: {
          ...DEFAULT_TITLES,
          "todo-morning-title": "🌅 自定义早上",
        },
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    expect(wrapper.get('.todo-section[data-list-id="morning"] .editable-title').text()).toBe("🌅 自定义早上");

    await wrapper.get('.todo-section[data-list-id="morning"] .editable-title').trigger("dblclick");
    await wrapper.get('.todo-section[data-list-id="morning"] .title-edit-input').setValue("上午计划");
    await wrapper.get('.todo-section[data-list-id="morning"] .title-edit-input').trigger("blur");

    expect(wrapper.emitted("titleUpdate")?.[0]).toEqual(["todo-morning-title", "上午计划"]);
    expect(wrapper.emitted("updateListTitle")).toBeUndefined();
  });

  it("toggles list collapse from a centered header icon and keeps compact out of the menu", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [{ id: "a", text: "A", done: false }], noon: [], evening: [] },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-collapse-button').trigger("click");
    await wrapper.get('.todo-section[data-list-id="morning"] .todo-section-menu-button').trigger("click");
    const optionTexts = wrapper.findAll(".dropdown-option").map((option) => option.text());
    expect(optionTexts).not.toContain("折叠");
    expect(optionTexts).not.toContain("展开");
    expect(optionTexts).not.toContain("收缩");
    expect(optionTexts).not.toContain("恢复");

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除列表")?.trigger("click");

    expect(wrapper.emitted("toggleListCollapsed")?.[0]).toEqual(["morning", true]);
    expect(wrapper.emitted("toggleListCompact")).toBeUndefined();
    expect(wrapper.emitted("deleteList")?.[0]).toEqual(["morning", expect.any(HTMLElement)]);
  });

  it("styles the centered collapse icon smaller and lighter than regular icon buttons", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const iconRule = styles.match(/\.todo-collapse-button \.n-icon,[\s\S]*?\.todo-collapse-button svg\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(iconRule).toContain("font-size: 12px");
    expect(iconRule).toContain("opacity: 0.8");
  });

  it("pauses reminder list dragging while the list title is being edited", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };

    await wrapper.get('.todo-section[data-list-id="morning"] .editable-title').trigger("dblclick");
    await nextTick();
    const dragEvent = new Event("dragstart", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragEvent, "dataTransfer", { value: dataTransfer });
    wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').element.dispatchEvent(dragEvent);
    await wrapper.vm.$nextTick();

    expect(dragEvent.defaultPrevented).toBe(true);
    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').attributes("draggable")).toBe("false");
  });

  it("emits list reorder actions from header dragging without moving reminders", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [{ id: "a", text: "A", done: false }], noon: [], evening: [] },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
    };
    const source = readFileSync(resolve(__dirname, "../components/TodoPanel.vue"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(source).toContain('<TransitionGroup name="todo-section-reorder" tag="div" class="todo-sections">');
    expect(styles).toMatch(/\.todo-section-reorder-move,[\s\S]*?\.todo-section-reorder-enter-active,[\s\S]*?\.todo-section-reorder-leave-active\s*\{[^}]*transform 0\.22s/s);

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("dragstart", { dataTransfer });
    expect(wrapper.get('.todo-section[data-list-id="morning"]').classes()).toContain("is-list-dragging");

    await wrapper.get('.todo-section[data-list-id="noon"]').trigger("drop");

    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.setData).not.toHaveBeenCalledWith("text/plain", "☀️ 早上");
    expect(dataTransfer.setData).toHaveBeenCalledWith("application/x-todo-list-id", "morning");
    expect(wrapper.emitted("reorderLists")?.[0]).toEqual(["morning", "noon"]);
    expect(wrapper.emitted("move")).toBeUndefined();

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("dragend");
    expect(wrapper.get('.todo-section[data-list-id="morning"]').classes()).not.toContain("is-list-dragging");
  });

  it("does not treat a dragged reminder list as dropped external text over a list body", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [{ id: "a", text: "A", done: false }], noon: [], evening: [] },
        showCompleted: { morning: false, noon: false, evening: false },
        titles: DEFAULT_TITLES,
      },
      global: {
        stubs: {
          Checkbox: checkboxStub,
          Dropdown: dropdownStub,
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });
    const dataTransfer = {
      effectAllowed: "",
      files: [],
      getData: vi.fn(() => "morning"),
      setData: vi.fn(),
    };

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("dragstart", { dataTransfer });
    await wrapper.get('[data-testid="todo-list-noon"]').trigger("drop", { dataTransfer });

    expect(wrapper.emitted("reorderLists")?.[0]).toEqual(["morning", "noon"]);
    expect(wrapper.emitted("createFromText")).toBeUndefined();
  });

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

  it("creates a reminder from blank space inside a non-empty list scrollbar", async () => {
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

    await wrapper.get('.todo-section[data-period="morning"] .todo-list-scrollbar').trigger("click");

    expect(wrapper.emitted("create")?.[0]).toEqual(["morning"]);
    wrapper.unmount();
  });

  it("does not create a reminder when clicking controls inside a list scrollbar", async () => {
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

    await wrapper.get("input.todo-input").trigger("click");

    expect(wrapper.emitted("create")).toBeUndefined();
    wrapper.unmount();
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

  it("shows completed reminders by default while keeping period progress", () => {
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
    expect(values(wrapper)).toEqual(["未完成", "已完成"]);
    expect(wrapper.find(".todo-completed-divider").exists()).toBe(true);
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
    expect(wrapper.get(".todo-completed-divider").text()).toContain("已完成");
    wrapper.unmount();
  });

  it("shows a clear button on the completed divider", async () => {
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

    await wrapper.get(".todo-completed-clear").trigger("click");

    const emitted = wrapper.emitted("clearCompleted")?.[0];
    expect(emitted?.[0]).toBe("morning");
    expect((emitted?.[1] as HTMLElement).classList.contains("todo-section")).toBe(true);
    expect(wrapper.emitted("create")).toBeUndefined();
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
      "清理已完成",
      "显示已完成",
      "新建列表",
      "编辑列表",
      "删除列表",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "显示已完成")?.trigger("click");
    expect(wrapper.emitted("toggleCompletedVisibility")?.[0]).toEqual(["morning", true]);

    await wrapper.get('.todo-section[data-period="morning"] .todo-section-menu-button').trigger("click");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "清理已完成")?.trigger("click");
    const clearEmitted = wrapper.emitted("clearCompleted")?.[0];
    expect(clearEmitted?.[0]).toBe("morning");
    expect((clearEmitted?.[1] as HTMLElement).classList.contains("todo-section")).toBe(true);

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
      "清理已完成",
      "显示已完成",
      "新建列表",
      "编辑列表",
      "删除列表",
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

    expect(wrapper.get(".today-focus-section").text()).toContain("❗️ 重点事项");
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

  it("filters completed focus reminders through their source list completed visibility", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [
            { id: "a", text: "隐藏列表已完成重点", done: true, starred: true },
            { id: "b", text: "隐藏列表未完成重点", done: false, starred: true },
          ],
          noon: [{ id: "c", text: "显示列表已完成重点", done: true, starred: true }],
          evening: [],
        },
        showCompleted: { morning: false, noon: true, evening: false },
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

    expect(todayFocusValues(wrapper)).toEqual(["隐藏列表未完成重点", "显示列表已完成重点"]);
    expect(wrapper.findAll(".today-focus-item")[1].classes()).toContain("is-done");

    wrapper.unmount();
  });

  it("animates completed focus reminders to the bottom when completed reminders are visible", async () => {
    vi.useFakeTimers();

    const Harness = defineComponent({
      components: { TodoPanel },
      setup() {
        const todos = ref<TodoMap>({
          morning: [
            { id: "a", text: "第一重点", done: false, starred: true },
            { id: "b", text: "第二重点", done: false, starred: true },
          ],
          noon: [],
          evening: [],
        });
        const complete = (period: TodoPeriod, id: string, done: boolean) => {
          todos.value = completeTodo(todos.value, period, id, done);
        };
        return { todos, complete, titles: DEFAULT_TITLES };
      },
      template: '<TodoPanel :todos="todos" :titles="titles" :show-completed="{ morning: true, noon: false, evening: false }" @complete="complete" />',
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

    expect(todayFocusValues(wrapper)).toEqual(["第一重点", "第二重点"]);

    await wrapper.get(".today-focus-item .checkbox-stub").trigger("click");
    await nextTick();

    expect(todayFocusValues(wrapper)).toEqual(["第一重点", "第二重点"]);
    expect(wrapper.find(".today-focus-list.today-focus-move").exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(199);
    expect(todayFocusValues(wrapper)).toEqual(["第一重点", "第二重点"]);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();

    expect(todayFocusValues(wrapper)).toEqual(["第二重点", "第一重点"]);
    expect(wrapper.findAll(".today-focus-item")[1].classes()).toContain("is-done");

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("hides newly completed focus reminders after the transition when their source list hides completed reminders", async () => {
    vi.useFakeTimers();

    const Harness = defineComponent({
      components: { TodoPanel },
      setup() {
        const todos = ref<TodoMap>({
          morning: [
            { id: "a", text: "完成后隐藏重点", done: false, starred: true },
            { id: "b", text: "仍然显示重点", done: false, starred: true },
          ],
          noon: [],
          evening: [],
        });
        const complete = (period: TodoPeriod, id: string, done: boolean) => {
          todos.value = completeTodo(todos.value, period, id, done);
        };
        return { todos, complete, titles: DEFAULT_TITLES };
      },
      template: '<TodoPanel :todos="todos" :titles="titles" :show-completed="{ morning: false, noon: false, evening: false }" @complete="complete" />',
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

    expect(todayFocusValues(wrapper)).toEqual(["完成后隐藏重点", "仍然显示重点"]);

    await wrapper.get(".today-focus-item .checkbox-stub").trigger("click");
    await nextTick();

    expect(todayFocusValues(wrapper)).toEqual(["完成后隐藏重点", "仍然显示重点"]);

    await vi.advanceTimersByTimeAsync(199);
    expect(todayFocusValues(wrapper)).toEqual(["完成后隐藏重点", "仍然显示重点"]);

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();

    expect(todayFocusValues(wrapper)).toEqual(["仍然显示重点"]);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("applies a flowing multicolor text effect to starred reminders", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(styles).toContain("@keyframes starred-text-flow");
    expect(styles).toMatch(/\.todo-item\.is-starred \.todo-input,[\s\S]*?\.today-focus-item \.today-focus-input\s*\{[\s\S]*?linear-gradient/s);
    expect(styles).toMatch(/\.todo-item\.is-starred \.todo-input,[\s\S]*?background-size: 200% 100%/s);
    expect(styles).toMatch(/\.todo-item\.is-starred \.todo-input,[\s\S]*?background-repeat: repeat-x/s);
    expect(styles).toMatch(/\.todo-item\.is-starred \.todo-input,[\s\S]*?animation: starred-text-flow/s);
    expect(styles).toMatch(/\.todo-item\.is-starred\.is-done \.todo-input,[\s\S]*?\.today-focus-item\.is-done \.today-focus-input\s*\{[\s\S]*?linear-gradient/s);
    expect(styles).toMatch(/\.todo-item\.is-starred\.is-done \.todo-input,[\s\S]*?text-decoration: line-through/s);
    expect(styles).toMatch(/\.todo-item\.is-starred\.is-done \.todo-input,[\s\S]*?animation: starred-text-flow/s);
    expect(styles).toMatch(/@keyframes starred-text-flow\s*\{[\s\S]*?background-position: 0% 50%[\s\S]*?background-position: -100% 50%/s);
  });

  it("uses an inset soft background for the reminder editing state", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const editingRule = styles.match(/\.today-focus-item\.is-editing,[\s\S]*?\.todo-item\.is-editing\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const editingBeforeRule = styles.match(/\.today-focus-item\.is-editing::before,[\s\S]*?\.todo-item\.is-editing::before\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(editingRule).toContain("background: transparent");
    expect(editingBeforeRule).toContain("right: 6px");
    expect(editingBeforeRule).toContain("left: 6px");
    expect(editingBeforeRule).toMatch(/background: rgba\([^)]*0\.08\)/);
    expect(editingBeforeRule).toContain("pointer-events: none");
  });

  it("shows deadline labels and urgency classes in reminders and today's focus", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 4, 25, 10));
      const wrapper = mount(TodoPanel, {
        props: {
          todos: {
            morning: [
              { id: "a", text: "超期", done: false, starred: true, notifyAt: new Date(2026, 4, 25, 9).getTime() },
              { id: "b", text: "今天", done: false, starred: true, notifyAt: new Date(2026, 4, 25, 18).getTime() },
              { id: "c", text: "三天内", done: false, starred: true, notifyAt: new Date(2026, 4, 27, 18).getTime() },
              { id: "d", text: "更晚", done: false, starred: true, notifyAt: new Date(2026, 5, 2, 18).getTime() },
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
      try {
        expect(wrapper.findAll(".todo-deadline-label").map((item) => item.text())).toEqual([
          "今天 09",
          "今天 18",
          "2天后 18",
          "6/2 18",
          "今天 09",
          "今天 18",
          "2天后 18",
          "6/2 18",
        ]);
        expect(wrapper.findAll(".todo-item")[0].classes()).toContain("deadline-overdue");
        expect(wrapper.findAll(".todo-item")[1].classes()).toContain("deadline-due-soon");
        expect(wrapper.findAll(".todo-item")[2].classes()).toContain("deadline-upcoming");
        expect(wrapper.findAll(".todo-item")[3].classes()).toContain("deadline-later");
        expect(wrapper.findAll(".today-focus-item")[0].classes()).toContain("deadline-overdue");
        expect(wrapper.findAll(".today-focus-item")[1].classes()).toContain("deadline-due-soon");
        expect(wrapper.findAll(".today-focus-item")[2].classes()).toContain("deadline-upcoming");
        expect(wrapper.findAll(".today-focus-item")[3].classes()).toContain("deadline-later");
      } finally {
        wrapper.unmount();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("sorts today's focus reminders by deadline before undated starred items", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [
            { id: "a", text: "明天早上", done: false, starred: true, notifyAt: new Date(2026, 4, 26, 9).getTime() },
            { id: "b", text: "没有截止时间", done: false, starred: true },
          ],
          noon: [
            { id: "c", text: "今天下午", done: false, starred: true, notifyAt: new Date(2026, 4, 25, 15).getTime() },
          ],
          evening: [
            { id: "d", text: "已完成今天中午", done: true, starred: true, notifyAt: new Date(2026, 4, 25, 12).getTime() },
          ],
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

    expect(wrapper.findAll(".today-focus-input").map((item) => (item.element as HTMLInputElement).value)).toEqual([
      "今天下午",
      "明天早上",
      "没有截止时间",
      "已完成今天中午",
    ]);
    wrapper.unmount();
  });

  it("refreshes deadline labels on the deadline clock without prop changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 9, 59, 30));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [
            {
              id: "a",
              text: "马上到期",
              done: false,
              starred: true,
              notifyAt: new Date(2026, 4, 25, 10, 0, 0).getTime(),
            },
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

    try {
      expect(wrapper.find(".todo-item .todo-deadline-label").text()).toBe("今天 10");

      vi.setSystemTime(new Date(2026, 4, 25, 10, 0, 31));
      await vi.advanceTimersByTimeAsync(60_000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".todo-item .todo-deadline-label").text()).toBe("今天 10");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("refreshes notification labels when the page regains focus", async () => {
    vi.useFakeTimers();
    const notifyAt = new Date(2026, 4, 25, 10).getTime();
    let wrapper: ReturnType<typeof mount> | undefined;
    const visibilityStateSpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const mountPanel = () =>
      mount(TodoPanel, {
        props: {
          todos: {
            morning: [{ id: "a", text: "马上提醒", done: false, notifyAt }],
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

    try {
      vi.setSystemTime(new Date(2026, 4, 25, 9, 59));
      wrapper = mountPanel();

      expect(wrapper.get(".todo-deadline-label").text()).toBe("今天 10");

      vi.setSystemTime(new Date(2026, 4, 25, 10, 1));
      window.dispatchEvent(new Event("focus"));
      await wrapper.vm.$nextTick();

      expect(wrapper.get(".todo-deadline-label").text()).toBe("今天 10");
      wrapper.unmount();
      wrapper = undefined;

      vi.setSystemTime(new Date(2026, 4, 25, 9, 59));
      wrapper = mountPanel();

      expect(wrapper.get(".todo-deadline-label").text()).toBe("今天 10");

      vi.setSystemTime(new Date(2026, 4, 25, 10, 1));
      document.dispatchEvent(new Event("visibilitychange"));
      await wrapper.vm.$nextTick();

      expect(wrapper.get(".todo-deadline-label").text()).toBe("今天 10");
    } finally {
      wrapper?.unmount();
      visibilityStateSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("shows weak deadline labels for completed starred reminders without urgency styling", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        showCompleted: { morning: true, noon: false, evening: false },
        todos: {
          morning: [
            {
              id: "a",
              text: "已完成重点",
              done: true,
              starred: true,
              notifyAt: new Date(2026, 4, 25, 18).getTime(),
            },
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

    try {
      expect(wrapper.find(".todo-item .todo-deadline-label").text()).toBe("今天 18");
      expect(wrapper.find(".today-focus-item .todo-deadline-label").text()).toBe("今天 18");

      const urgencyClasses = ["deadline-overdue", "deadline-due-soon", "deadline-upcoming", "deadline-later"];
      expect(wrapper.get(".todo-item").classes()).not.toEqual(expect.arrayContaining(urgencyClasses));
      expect(wrapper.get(".today-focus-item").classes()).not.toEqual(expect.arrayContaining(urgencyClasses));
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("emits a star request when starring an unstarred reminder", async () => {
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

    expect(wrapper.emitted("star")?.[0]).toEqual([
      { period: "morning", id: "a", starred: true, anchor: expect.any(HTMLElement) },
    ]);
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("opens a row Naive date picker with today 09:00 by default", async () => {
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
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get("input.todo-input").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
    const picker = wrapper.getComponent({ name: "NDatePicker" });

    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    expect(picker.props("panel")).toBe(true);
    expect(picker.props("type")).toBe("date");
    expect(picker.props("format")).toBe("yyyy-MM-dd");
    expect(picker.props("valueFormat")).toBe("timestamp");
    expect(picker.props("actions")).toEqual([]);
    expect(picker.props("value")).toBe(new Date(2026, 4, 25, 9).getTime());
    expect(document.body.querySelectorAll(".notify-time-column")).toHaveLength(2);
    const hourOptions = Array.from(document.body.querySelectorAll(".notify-time-column.is-hour .notify-time-option"));
    const minuteOptions = Array.from(document.body.querySelectorAll(".notify-time-column.is-minute .notify-time-option"));
    expect(hourOptions.length).toBeGreaterThan(24);
    expect(minuteOptions.length).toBeGreaterThan(60);
    expect(hourOptions.slice(0, 27).map((option) => option.textContent?.trim())).toEqual([
      "00",
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
      "00",
      "01",
      "02",
    ]);
    expect(minuteOptions.slice(57, 63).map((option) => option.textContent?.trim())).toEqual(["57", "58", "59", "00", "01", "02"]);
    expect(document.body.querySelector(".notify-time-column.is-hour .notify-time-option.is-active")?.textContent).toContain("09");
    expect(document.body.querySelector(".notify-time-column.is-minute .notify-time-option.is-active")?.textContent).toContain("00");
    expect(getTeleportedDatePickerText()).toContain("清除");
    expect(document.body.querySelector(".notify-panel-action.is-danger")?.textContent).toContain("清除");
    expect(getTeleportedDatePickerText()).toContain("今天");
    expect(getTeleportedDatePickerText()).toContain("确定");

    clickTeleportedNotifyAction("今天");
    await nextTick();
    expect(wrapper.emitted("notify")).toBeUndefined();
    expect(document.body.querySelector(".notify-floating-date-picker")).toBeTruthy();

    (document.body.querySelectorAll(".notify-time-column.is-hour .notify-time-option")[15] as HTMLButtonElement).click();
    (document.body.querySelectorAll(".notify-time-column.is-minute .notify-time-option")[30] as HTMLButtonElement).click();
    await nextTick();
    expect(picker.props("value")).toBe(new Date(2026, 4, 25, 15, 30).getTime());

    await picker.vm.$emit("update:value", new Date(2026, 4, 26).getTime());
    await nextTick();
    expect(picker.props("value")).toBe(new Date(2026, 4, 26, 15, 30).getTime());

    clickTeleportedNotifyAction("确定");

    expect(wrapper.emitted("notify")?.[0]).toEqual([
      "morning",
      "a",
      new Date(2026, 4, 26, 15, 30).getTime(),
      expect.any(HTMLElement),
    ]);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("moves the notification picker date to today while preserving the selected time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false, notifyAt: new Date(2026, 4, 26, 15, 30).getTime() }],
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
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get("input.todo-input").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑通知时间")?.trigger("click");

    clickTeleportedNotifyAction("今天");
    await nextTick();

    expect(wrapper.getComponent({ name: "NDatePicker" }).props("value")).toBe(new Date(2026, 4, 25, 15, 30).getTime());
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("preserves the selected notification time when switching dates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false, notifyAt: new Date(2026, 4, 26, 15, 30).getTime() }],
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
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get("input.todo-input").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑通知时间")?.trigger("click");
    await wrapper.getComponent({ name: "NDatePicker" }).vm.$emit("update:value", new Date(2026, 4, 28, 8, 45).getTime());
    await nextTick();

    expect(wrapper.getComponent({ name: "NDatePicker" }).props("value")).toBe(new Date(2026, 4, 28, 15, 30).getTime());
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("allows changing only the notification time without changing the selected date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false, notifyAt: new Date(2026, 4, 26, 15, 30).getTime() }],
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
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get("input.todo-input").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑通知时间")?.trigger("click");
    clickTeleportedNotifyTime(8, 45);
    await nextTick();

    expect(wrapper.getComponent({ name: "NDatePicker" }).props("value")).toBe(new Date(2026, 4, 26, 8, 45).getTime());
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("confirms a date picker selected notification value", async () => {
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
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get("input.todo-input").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
    await wrapper.getComponent({ name: "NDatePicker" }).vm.$emit("update:value", new Date(2026, 4, 30).getTime());
    clickTeleportedNotifyTime(15, 30);
    await nextTick();
    clickTeleportedNotifyAction("确定");

    expect(wrapper.emitted("notify")?.[0]).toEqual([
      "morning",
      "a",
      new Date(2026, 4, 30, 15, 30).getTime(),
      expect.any(HTMLElement),
    ]);
    expect(wrapper.emitted("star")).toBeUndefined();
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("can clear notification time from the editor", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false, notifyAt: new Date(2026, 4, 30, 15).getTime() }],
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
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑通知时间")?.trigger("click");
    clickTeleportedNotifyAction("清除");
    await nextTick();

    expect(wrapper.emitted("notify")?.[0]).toEqual(["morning", "a", undefined, expect.any(HTMLElement)]);
    expect((wrapper.emitted("notify")?.[0][3] as HTMLElement).classList.contains("todo-section")).toBe(true);
    expect(wrapper.emitted("star")).toBeUndefined();
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("opens the notification editor from the row alarm button", async () => {
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

    expect(wrapper.find(".todo-deadline-slot").exists()).toBe(false);
    expect(wrapper.get(".todo-notify-button").attributes("aria-label")).toBe("设置通知时间");

    await wrapper.get(".todo-notify-button").trigger("click");

    const picker = wrapper.getComponent({ name: "NDatePicker" });
    expect(picker.props("panel")).toBe(true);
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("confirms next-day midnight notification times from the date picker", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10));
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "跨天提醒", done: false }],
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
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get(".todo-notify-button").trigger("click");
    await wrapper.getComponent({ name: "NDatePicker" }).vm.$emit("update:value", new Date(2026, 4, 31).getTime());
    clickTeleportedNotifyTime(0, 15);
    await nextTick();
    clickTeleportedNotifyAction("确定");

    expect(wrapper.emitted("notify")?.[0]).toEqual([
      "morning",
      "a",
      new Date(2026, 4, 31, 0, 15).getTime(),
      expect.any(HTMLElement),
    ]);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("lets collapsed reminder sections stop consuming list height", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const collapsedRule = styles.match(/\.todo-section\.is-collapsed \{([\s\S]*?)\}/)?.[1] ?? "";
    const compactCollapsedRule = styles.match(/\.todo-section\.is-compact\.is-collapsed \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(collapsedRule).toContain("flex: 0 0 34px");
    expect(compactCollapsedRule).toContain("flex: 0 0 34px");
  });

  it("closes notification selection without changing the reminder", async () => {
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
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("star")).toBeUndefined();
    expect(wrapper.emitted("notify")).toBeUndefined();
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    wrapper.unmount();
  });

  it("closes notification selection from an outside click without changing the reminder", async () => {
    const wrapper = mount(TodoPanel, {
      attachTo: document.body,
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
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("star")).toBeUndefined();
    expect(wrapper.emitted("notify")).toBeUndefined();
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

  it("emits star from the reminder context menu without opening notification time", async () => {
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

    expect(wrapper.emitted("star")?.[0]).toEqual([
      { period: "morning", id: "a", starred: true, anchor: expect.any(HTMLElement) },
    ]);
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
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
      "设置通知时间",
      "删除",
      "取消星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除")?.trigger("click");

    const removeEmitted = wrapper.emitted("remove")?.[0];
    expect(removeEmitted?.slice(0, 2)).toEqual(["morning", "a"]);
    expect((removeEmitted?.[2] as HTMLElement).classList.contains("todo-section")).toBe(true);
    wrapper.unmount();
  });

  it("opens a notification editor from today's focus context menu and preloads existing notification times", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [
            {
              id: "a",
              text: "重点事项",
              done: false,
              starred: true,
              notifyAt: new Date(2026, 4, 30, 18).getTime(),
              deadlineAt: new Date(2026, 4, 30, 9).getTime(),
            },
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
          NDatePicker: datePickerStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    await wrapper.get(".today-focus-item").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("编辑通知时间");

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑通知时间")?.trigger("click");
    const picker = wrapper.getComponent({ name: "NDatePicker" });

    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    expect(wrapper.find(".deadline-date-input").exists()).toBe(false);
    expect(picker.props("panel")).toBe(true);
    expect(picker.props("value")).toBe(new Date(2026, 4, 30, 18).getTime());

    clickTeleportedNotifyTime(12, 0);
    await nextTick();
    clickTeleportedNotifyAction("确定");

    expect(wrapper.emitted("notify")?.[0]).toEqual([
      "morning",
      "a",
      new Date(2026, 4, 30, 12).getTime(),
      expect.any(HTMLElement),
    ]);
    expect(wrapper.emitted("star")).toBeUndefined();
    wrapper.unmount();
  });

  it("places the reminder star action at the far right of the row", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "第一项", done: false, notifyAt: new Date(2026, 4, 30, 12).getTime() }],
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
    expect(rowChildren[3]).toContain("todo-deadline-slot");
    expect(rowChildren[4]).toContain("todo-star-button");
    wrapper.unmount();
  });

  it("places the today focus star action at the far right of the row", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "重点事项", done: false, starred: true, notifyAt: new Date(2026, 4, 30, 12).getTime() }],
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
    expect(rowChildren[2]).toContain("todo-deadline-slot");
    expect(rowChildren[3]).toContain("todo-star-button");
    wrapper.unmount();
  });

  it("keeps today focus notification time before the visible star column", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const todoItemRule = styles.match(/\.todo-item \{([\s\S]*?)\}/)?.[1] ?? "";
    const todayFocusItemRule = styles.match(/\.today-focus-item \{([\s\S]*?)\}/)?.[1] ?? "";
    const todoInputSharedRule = styles.match(/\.todo-input,[\s\S]*?\.today-focus-input\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const todayNotifyRule = styles.match(/\.today-focus-item \.todo-notify-button \{([\s\S]*?)\}/)?.[1] ?? "";
    const todayStarRule = styles.match(/\.today-focus-item \.todo-star-button \{([\s\S]*?)\}/)?.[1] ?? "";
    const todayNotifyWidthRule = styles.match(/\.today-focus-item\.has-notify \{([\s\S]*?)\}/)?.[1] ?? "";
    const deadlineLabelRule = styles.match(/\.todo-deadline-label \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(todoItemRule).toContain("align-items: center");
    expect(todayFocusItemRule).toContain("align-items: center");
    expect(todoInputSharedRule).toContain("box-sizing: border-box");
    expect(todoInputSharedRule).toContain("padding: 0 8px");
    expect(todoInputSharedRule).toContain("text-overflow: ellipsis");
    expect(todoInputSharedRule).toContain("white-space: nowrap");
    expect(todayNotifyRule).toContain("grid-column: 3");
    expect(todayStarRule).toContain("grid-column: 4");
    expect(todayNotifyWidthRule).toContain("minmax(0, 64px)");
    expect(deadlineLabelRule).not.toContain("text-overflow: ellipsis");
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

  it("emits the todo section as the focus anchor", async () => {
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

    await wrapper.get("input.todo-input").trigger("focus");

    const emitted = wrapper.emitted("focus")?.[0];
    expect((emitted?.[0] as HTMLElement).classList.contains("todo-section")).toBe(true);
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

    expect(values(wrapper)).toEqual(["第二项", "第一项"]);
    expect(wrapper.find(".todo-completed-divider").exists()).toBe(true);
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

  it("enters edit mode while preserving selected reminder text", async () => {
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
    expect(inputWrapper.attributes("readonly")).toBeUndefined();
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
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");

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
      "设置通知时间",
      "删除",
      "星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "星标")?.trigger("click");
    expect(wrapper.emitted("star")?.[0]).toEqual([
      { period: "morning", id: "b", starred: true, anchor: expect.any(HTMLElement) },
    ]);
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
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

    await wrapper.get(".todo-drag-handle").trigger("dragstart", {
      dataTransfer: { effectAllowed: "", setData: vi.fn() },
    });
    expect(wrapper.get(".todo-item").classes()).toContain("is-menu-selected");

    await wrapper.get(".todo-drag-handle").trigger("dragend");
    expect(wrapper.get(".todo-item").classes()).not.toContain("is-menu-selected");

    wrapper.unmount();
  });

  it("uses the full reminder row as the drag preview instead of only the handle", async () => {
    const setDragImage = vi.fn();
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "拖动时看见这段文字", done: false }],
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

    await wrapper.get(".todo-drag-handle").trigger("dragstart", {
      dataTransfer: { effectAllowed: "", setData: vi.fn(), setDragImage },
    });

    expect(setDragImage).toHaveBeenCalledWith(wrapper.get(".todo-item").element, 0, 0);

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

    expect(wrapper.findAll(".todo-item")[1].classes()).toContain("is-editing");
    expect(wrapper.findAll(".todo-item")[1].classes()).not.toContain("is-menu-selected");

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
      "设置通知时间",
      "删除",
      "星标",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option")[0].trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("第一项内容");
    wrapper.unmount();
  });

  it("keeps reminder actions available when clipboard APIs are unavailable", async () => {
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

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "复制",
      "设置通知时间",
      "删除",
      "星标",
      "Tips",
    ]);
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
      "设置通知时间",
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

  it("allows notification time on an unstarred reminder", async () => {
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

    await wrapper.get('.todo-section[data-period="morning"] input.todo-input').trigger("contextmenu");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toContain("设置通知时间");

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
    const picker = wrapper.getComponent({ name: "NDatePicker" });
    expect(wrapper.find(".deadline-editor").exists()).toBe(false);
    expect(picker.props("panel")).toBe(true);
    expect(getTeleportedDatePickerText()).toContain("清除");
    expect(getTeleportedDatePickerText()).toContain("今天");
    expect(getTeleportedDatePickerText()).toContain("确定");
  });

  it("emits notify updates without changing star state", async () => {
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

    await wrapper.get('.todo-section[data-period="morning"] input.todo-input').trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");
    clickTeleportedNotifyAction("确定");

    expect(wrapper.emitted("notify")?.[0]).toEqual([
      "morning",
      "a",
      expect.any(Number),
      expect.any(HTMLElement),
    ]);
    expect(wrapper.emitted("star")).toBeUndefined();
  });

  it("enters edit mode immediately when selecting reminder text", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "可以直接编辑的提醒", done: false }],
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
    input.setSelectionRange(2, 6);

    await wrapper.get("input.todo-input").trigger("select");

    expect(input.readOnly).toBe(false);
  });

  it("does not render an empty notification slot when no notification time exists", () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "这是一条很长的普通提醒事项", done: false }],
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

    expect(wrapper.find(".todo-deadline-slot").exists()).toBe(false);
  });

  it("emits dropped external text as one reminder per non-empty line", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: { morning: [], noon: [], evening: [] },
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
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "任务 A\n\n任务 B" : ""),
      },
    });

    await wrapper.get('[data-testid="todo-list-morning"]').element.dispatchEvent(event);

    expect(wrapper.emitted("createFromText")?.[0]).toEqual(["morning", ["任务 A", "任务 B"]]);
  });

  it("emits dropped external text from an existing reminder row", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "已有任务", done: false }],
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
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "任务 A\n任务 B" : ""),
      },
    });

    await wrapper.get(".todo-item").element.dispatchEvent(event);

    expect(wrapper.emitted("createFromText")?.[0]).toEqual(["morning", ["任务 A", "任务 B"]]);
  });

  it("emits dropped external text from populated list blank space", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "已有任务", done: false }],
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
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "任务 C\n任务 D" : ""),
      },
    });

    await wrapper.get('[data-testid="todo-list-morning"]').element.dispatchEvent(event);

    expect(wrapper.emitted("createFromText")?.[0]).toEqual(["morning", ["任务 C", "任务 D"]]);
  });

  it("keeps internal reminder drags off the plain-text payload", async () => {
    const setData = vi.fn();
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "拖到工作空间", done: false }],
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

    await wrapper.get(".todo-drag-handle").trigger("dragstart", {
      dataTransfer: { effectAllowed: "", setData },
    });

    expect(setData).not.toHaveBeenCalledWith("text/plain", "拖到工作空间");
    expect(setData).toHaveBeenCalledWith("application/x-todo-id", "morning:a");
  });

  it("keeps internal reminder list drags off the plain-text payload", async () => {
    const setData = vi.fn();
    const wrapper = mount(TodoPanel, {
      props: {
        todoLists: defaultTodoLists,
        todos: { morning: [], noon: [], evening: [] },
        showCompleted: { morning: false, noon: false, evening: false },
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

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-heading').trigger("dragstart", {
      dataTransfer: { effectAllowed: "", setData },
    });

    expect(setData).not.toHaveBeenCalledWith("text/plain", "☀️ 早上");
    expect(setData).toHaveBeenCalledWith("application/x-todo-list-id", "morning");
  });

  it("emits dropped external text from a todo section heading", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "已有任务", done: false }],
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
    const event = new Event("drop", { bubbles: true }) as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "标题区域任务" : ""),
      },
    });

    await wrapper.get('.todo-section[data-period="morning"] .todo-heading').element.dispatchEvent(event);

    expect(wrapper.emitted("createFromText")?.[0]).toEqual(["morning", ["标题区域任务"]]);
  });

  it("keeps internal dragged todo drops from creating external text todos", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "已有任务", done: false }],
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
    const event = new Event("drop", { bubbles: true }) as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "外部任务" : ""),
      },
    });

    await wrapper.get(".todo-drag-handle").trigger("dragstart");
    await wrapper.get('[data-testid="todo-list-noon"]').element.dispatchEvent(event);

    expect(wrapper.emitted("move")?.[0]).toEqual([{ period: "morning", id: "a" }, "noon"]);
    expect(wrapper.emitted("createFromText")).toBeUndefined();
  });

  it("drops an internal reminder into another list at the mouse position instead of always at the bottom", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: {
          morning: [{ id: "a", text: "拖拽项", done: false }],
          noon: [
            { id: "b", text: "中午第一项", done: false },
            { id: "c", text: "中午第二项", done: false },
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
    const noonItems = wrapper.findAll('.todo-section[data-list-id="noon"] .todo-item');
    vi.spyOn(noonItems[0].element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 20,
      width: 200,
      height: 30,
      top: 20,
      left: 0,
      right: 200,
      bottom: 50,
      toJSON: () => ({}),
    });
    vi.spyOn(noonItems[1].element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 60,
      width: 200,
      height: 30,
      top: 60,
      left: 0,
      right: 200,
      bottom: 90,
      toJSON: () => ({}),
    });
    const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, "clientY", { value: 25 });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: () => "",
      },
    });

    await wrapper.get('.todo-section[data-list-id="morning"] .todo-drag-handle').trigger("dragstart");
    wrapper.get('[data-testid="todo-list-noon"]').element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("move")?.[0]).toEqual([{ period: "morning", id: "a" }, "noon", "b"]);
    expect(wrapper.emitted("createFromText")).toBeUndefined();
  });

  it("ignores external text drops that include files", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: { morning: [], noon: [], evening: [] },
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
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [{}],
        getData: (type: string) => (type === "text/plain" ? "任务 A" : ""),
      },
    });

    await wrapper.get('[data-testid="todo-list-morning"]').element.dispatchEvent(event);

    expect(wrapper.emitted("createFromText")).toBeUndefined();
  });

  it("ignores empty external text drops", async () => {
    const wrapper = mount(TodoPanel, {
      props: {
        todos: { morning: [], noon: [], evening: [] },
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
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? " \n\t " : ""),
      },
    });

    await wrapper.get('[data-testid="todo-list-morning"]').element.dispatchEvent(event);

    expect(wrapper.emitted("createFromText")).toBeUndefined();
  });
});

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
  template: "<div><slot /></div>",
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
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    expect(wrapper.find(".todo-empty").exists()).toBe(false);

    await wrapper.get('[data-testid="todo-list-morning"]').trigger("click");

    expect(wrapper.emitted("create")?.[0]).toEqual(["morning"]);
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
          NCheckbox: checkboxStub,
          NDropdown: dropdownStub,
          NTooltip: tooltipStub,
        },
      },
    });

    expect(values(wrapper)).toEqual(["第一项", "第二项"]);

    await wrapper.get(".n-checkbox").trigger("click");
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
});

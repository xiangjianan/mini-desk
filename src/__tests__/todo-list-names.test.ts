import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TodoListCreateDialog from "../components/TodoListCreateDialog.vue";
import { defaultWorkspace } from "../state/defaults";
import { findTodoListByTitle, mergeDuplicateTodoLists } from "../state/todoListNames";
import { normalizeWorkspaceData } from "../state/storage";
import { moveTodoListToWorkspace } from "../state/workspaceMoves";

const list = (id: string, title: string) => ({ id, title, collapsed: false, compact: false, column: 0 });
const data = () => ({
  ...defaultWorkspace("a"),
  todoLists: [list("first", "工作"), list("second", " 工作 "), list("third", "工作")],
  todos: {
    first: [{ id: "same", text: "原提醒", done: false }],
    second: [{ id: "same", text: "完成提醒", done: true, notifyAt: 1798765200000 }],
    third: [{ id: "third-todo", text: "第三提醒", done: false }],
  },
  showCompletedTodos: { first: false, second: true, third: false },
  todoListOrder: ["second", "first", "third"],
  todoColumnLayouts: { "1": [{ id: "first", column: 0 }, { id: "second", column: 0 }] },
});

describe("reminder list names", () => {
  it("compares trimmed display titles in both languages", () => {
    expect(findTodoListByTitle([list("custom", "提醒事项")], " 提醒事项 ", "zh")).toBeDefined();
    const defaults = defaultWorkspace("a").todoLists;
    expect(findTodoListByTitle(defaults, defaults[0].title, "zh")).toBeDefined();
    expect(findTodoListByTitle([list("custom", "Work")], " Work ", "en")).toBeDefined();
    expect(findTodoListByTitle([list("custom", "Work")], "Work", "en", "custom")).toBeUndefined();
  });

  it("merges legacy duplicates without losing reminders, IDs or visibility", () => {
    const input = data();
    const next = mergeDuplicateTodoLists(input, "zh");
    expect(next.todoLists.map(list => list.id)).toEqual(["first"]);
    expect(next.todos.first.map(todo => todo.text)).toEqual(["原提醒", "完成提醒", "第三提醒"]);
    expect(new Set(next.todos.first.map(todo => todo.id)).size).toBe(3);
    expect(next.todos.first[1]).toMatchObject({ done: true, notifyAt: 1798765200000 });
    expect(Object.keys(next.todos)).toEqual(["first"]);
    expect(next.showCompletedTodos).toEqual({ first: true });
    expect(next.todoListOrder).toEqual(["first"]);
    expect(next.todoColumnLayouts).toEqual({ "1": [{ id: "first", column: 0 }] });
    expect(input.todos.second[0].id).toBe("same");
    expect(mergeDuplicateTodoLists(next, "zh")).toBe(next);
    const normalized = normalizeWorkspaceData(input);
    expect(normalized.todoLists).toHaveLength(1);
    expect(normalized.todos.first).toHaveLength(3);
  });

  it("merges a moved list into the existing list, preserving target configuration", () => {
    const source = data();
    const target = { ...defaultWorkspace("b"), todoLists: [{ ...list("target", "工作"), collapsed: true }], todos: { target: [{ id: "same", text: "目标提醒", done: false }] }, showCompletedTodos: { target: false } };
    const result = moveTodoListToWorkspace([source, target], "a", "second", "b");
    expect(result[0].todoLists.map(list => list.id)).toEqual(["first", "third"]);
    expect(result[1].todoLists).toEqual(target.todoLists);
    expect(result[1].todos.target.map(todo => todo.text)).toEqual(["目标提醒", "完成提醒"]);
    expect(new Set(result[1].todos.target.map(todo => todo.id)).size).toBe(2);
    expect(result[1].showCompletedTodos.target).toBe(true);
  });

  it("matches localized default list names before regenerating a moved ID", () => {
    const source = { ...defaultWorkspace("source"), todoLists: [list("morning", "今天"), list("spare", "Spare")], todos: { morning: [{ id: "a", text: "Moved", done: false }], spare: [] } };
    const target = { ...defaultWorkspace("target"), todoLists: [list("morning", "今天")], todos: { morning: [] } };
    const next = moveTodoListToWorkspace([source, target], "source", "morning", "target", "en");
    expect(next[1].todoLists).toEqual(target.todoLists);
    expect(next[1].todos.morning.map(todo => todo.text)).toEqual(["Moved"]);
    const custom = { ...target, todoLists: [list("morning", "Different"), list("today", "Today")], todos: { morning: [], today: [] } };
    const merged = moveTodoListToWorkspace([source, custom], "source", "morning", "target", "en");
    expect(merged[1].todoLists).toEqual(custom.todoLists);
    expect(merged[1].todos.today.map(todo => todo.text)).toEqual(["Moved"]);
  });

  it.each(["zh", "en"] as const)("rejects duplicate creation and keeps the dialog editable (%s)", async language => {
    const wrapper = mount(TodoListCreateDialog, {
      props: { language, lists: [list("work", "Work")] },
      global: { stubs: {
        Modal: { props: ["show"], template: '<section v-if="show"><slot /></section>' },
        NModal: { props: ["show"], template: '<section v-if="show"><slot /></section>' },
        Input: { methods: { focus() {} }, props: ["value"], emits: ["update:value"], template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />' },
        NInput: { methods: { focus() {} }, props: ["value"], emits: ["update:value"], template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />' },
        Button: { template: '<button><slot /></button>' },
        NButton: { template: '<button><slot /></button>' },
      } },
    });
    await wrapper.vm.open();
    await wrapper.get("input").setValue(" Work ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe(language === "zh" ? "列表重名了" : "A list with this name already exists");
    await wrapper.get("input").setValue("Personal");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("confirm")?.[0]?.[1]).toBe("Personal");
    wrapper.unmount();
  });
});

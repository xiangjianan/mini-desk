import { describe, expect, it } from "vitest";
import { defaultState } from "../state/defaults";
import {
  getSerializableState,
  normalizeImportedState,
  serializeTextLines,
} from "../state/storage";
import { addTodo, completeTodo, getOrderedTodos, moveTodo, starTodo } from "../state/todos";
import type { BoardState } from "../types";

describe("state compatibility", () => {
  it("normalizes legacy text fields into line collections", () => {
    const state = normalizeImportedState({
      workspace: "alpha\n\tbeta",
      note: "idea",
      storage: "\tcommand",
    });

    expect(state.workspaceLines).toEqual([
      { text: "alpha", indent: 0 },
      { text: "beta", indent: 1 },
    ]);
    expect(state.noteLines).toEqual([{ text: "idea", indent: 0 }]);
    expect(state.storageLines).toEqual([{ text: "command", indent: 1 }]);
    expect(state.spaces).toEqual([
      {
        id: "workspace",
        title: "工作空间",
        lines: [
          { text: "alpha", indent: 0 },
          { text: "beta", indent: 1 },
        ],
      },
      {
        id: "storage",
        title: "工程文件",
        lines: [{ text: "command", indent: 1 }],
      },
    ]);
    expect(state.activeSpaceId).toBe("workspace");
  });

  it("creates one default workspace space for new users", () => {
    const state = defaultState();

    expect(state.spaces).toEqual([{ id: "workspace", title: "工作空间", lines: [] }]);
    expect(state.activeSpaceId).toBe("workspace");
    expect(state.showCompletedTodos).toEqual({ morning: false, noon: false, evening: false });
  });

  it("serializes image metadata without large payloads for localStorage", () => {
    const state: BoardState = {
      ...defaultState(),
      images: [
        {
          id: "img-1",
          src: "data:image/png;base64,abc",
          createdAt: 1,
        },
      ],
    };

    expect(getSerializableState(state).images).toEqual([
      { id: "img-1", createdAt: 1 },
    ]);
    expect(getSerializableState(state, { includeImageData: true }).images[0]).toMatchObject({
      id: "img-1",
      src: "data:image/png;base64,abc",
    });
  });

  it("normalizes quick buttons, todos, and text line indentation", () => {
    const state = normalizeImportedState({
      quickButtons: [{ title: "Docs", value: "https://example.com", type: "link" }],
      showCompletedTodos: true,
      todos: {
        morning: [{ text: "A", done: true }, { text: "B", done: false }],
      },
      workspaceLines: ["\tchild"],
    });

    expect(state.quickButtons[0]).toMatchObject({
      title: "Docs",
      value: "https://example.com",
      type: "link",
      hidden: false,
    });
    expect(state.todos.morning).toHaveLength(2);
    expect(state.todos.morning[0].starred).toBe(false);
    expect(state.todos.noon).toEqual([]);
    expect(state.workspaceLines).toEqual([{ text: "child", indent: 1 }]);
    expect(state.showCompletedTodos).toEqual({ morning: true, noon: true, evening: true });
  });

  it("normalizes per-period completed reminder visibility", () => {
    const state = normalizeImportedState({
      showCompletedTodos: {
        morning: true,
        noon: false,
      },
    });

    expect(state.showCompletedTodos).toEqual({ morning: true, noon: false, evening: false });
  });

  it("normalizes persisted spaces and starred reminders", () => {
    const state = normalizeImportedState({
      activeSpaceId: "project",
      spaces: [
        {
          id: "project",
          title: "项目",
          lines: [{ text: "note", indent: 0 }],
        },
      ],
      todos: {
        morning: [{ id: "a", text: "重点", done: false, starred: true, deadlineAt: 1779721200000 }],
      },
    });

    expect(state.spaces).toEqual([
      {
        id: "project",
        title: "项目",
        lines: [{ text: "note", indent: 0 }],
      },
    ]);
    expect(state.activeSpaceId).toBe("project");
    expect(state.todos.morning[0]).toMatchObject({ starred: true, deadlineAt: 1779721200000 });
  });

  it("drops invalid or non-starred todo deadlines during import", () => {
    const state = normalizeImportedState({
      todos: {
        morning: [
          { id: "a", text: "有效截止", done: false, starred: true, deadlineAt: 1779721200000 },
          { id: "b", text: "非法截止", done: false, starred: true, deadlineAt: "2026-05-30" },
          { id: "c", text: "非重点截止", done: false, starred: false, deadlineAt: 1779721200000 },
        ],
      },
    });

    expect(state.todos.morning[0]).toMatchObject({ starred: true, deadlineAt: 1779721200000 });
    expect(state.todos.morning[1]).toMatchObject({ starred: true });
    expect(state.todos.morning[1]).not.toHaveProperty("deadlineAt");
    expect(state.todos.morning[2]).toMatchObject({ starred: false });
    expect(state.todos.morning[2]).not.toHaveProperty("deadlineAt");
  });

  it("serializes textarea text into indented line records", () => {
    expect(serializeTextLines("root\n\tchild\n\t\tleaf")).toEqual([
      { text: "root", indent: 0 },
      { text: "child", indent: 1 },
      { text: "leaf", indent: 2 },
    ]);
  });
});

describe("todo behavior", () => {
  it("keeps completed todos at the bottom", () => {
    const todos = [
      { id: "1", text: "done", done: true },
      { id: "2", text: "open", done: false },
    ];

    expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual(["2", "1"]);
  });

  it("orders open starred todos before ordinary open todos and completed todos", () => {
    const todos = [
      { id: "1", text: "open", done: false, starred: false },
      { id: "2", text: "done starred", done: true, starred: true },
      { id: "3", text: "open starred", done: false, starred: true },
    ];

    expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual(["3", "1", "2"]);
  });

  it("orders starred todos with deadlines before other open todos", () => {
    const todos = [
      { id: "ordinary", text: "普通", done: false },
      { id: "later", text: "晚一点", done: false, starred: true, deadlineAt: 3000 },
      { id: "starred", text: "重点无时间", done: false, starred: true },
      { id: "sooner", text: "更近", done: false, starred: true, deadlineAt: 1000 },
      { id: "done", text: "完成", done: true, starred: true, deadlineAt: 500 },
    ];

    expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual([
      "sooner",
      "later",
      "starred",
      "ordinary",
      "done",
    ]);
  });

  it("keeps same-deadline starred todos in their original relative order", () => {
    const todos = [
      { id: "b", text: "第二个", done: false, starred: true, deadlineAt: 1000 },
      { id: "a", text: "第一个", done: false, starred: true, deadlineAt: 1000 },
    ];

    expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual(["b", "a"]);
  });

  it("sets and clears todo deadlines through starTodo", () => {
    const state = defaultState();
    state.todos.morning = [{ id: "a", text: "重点", done: false }];

    const starred = starTodo(state.todos, "morning", "a", true, 1779721200000);
    expect(starred.morning[0]).toMatchObject({ starred: true, deadlineAt: 1779721200000 });

    const missingDeadline = starTodo(starred, "morning", "a", true);
    expect(missingDeadline.morning[0]).toMatchObject({ starred: true });
    expect(missingDeadline.morning[0]).not.toHaveProperty("deadlineAt");

    const invalidDeadline = starTodo(starred, "morning", "a", true, Number.NaN);
    expect(invalidDeadline.morning[0]).toMatchObject({ starred: true });
    expect(invalidDeadline.morning[0]).not.toHaveProperty("deadlineAt");

    const unstarred = starTodo(starred, "morning", "a", false);
    expect(unstarred.morning[0]).toMatchObject({ starred: false });
    expect(unstarred.morning[0]).not.toHaveProperty("deadlineAt");
  });

  it("inserts a new open todo before completed todos to avoid visual reordering", () => {
    const state = defaultState();
    state.todos.morning = [
      { id: "done", text: "已完成", done: true },
    ];

    const next = addTodo(state.todos, "morning", { id: "blank", text: "", done: false });

    expect(next.morning.map((todo) => todo.id)).toEqual(["blank", "done"]);
    expect(getOrderedTodos(next.morning).map((todo) => todo.id)).toEqual(["blank", "done"]);
  });

  it("moves todos across periods and can mark completion", () => {
    const state = defaultState();
    state.todos.morning = [
      { id: "a", text: "Alpha", done: false },
      { id: "b", text: "Beta", done: false },
    ];
    state.todos.noon = [{ id: "c", text: "Gamma", done: false }];

    const moved = moveTodo(state.todos, "morning", "b", "noon", "c");
    const completed = completeTodo(moved, "noon", "b", true);

    expect(completed.morning.map((todo) => todo.id)).toEqual(["a"]);
    expect(completed.noon.map((todo) => todo.id)).toEqual(["b", "c"]);
    expect(completed.noon[0].done).toBe(true);
  });
});

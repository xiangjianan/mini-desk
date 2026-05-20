import { describe, expect, it } from "vitest";
import { defaultState } from "../state/defaults";
import {
  getSerializableState,
  normalizeImportedState,
  serializeTextLines,
} from "../state/storage";
import { completeTodo, getOrderedTodos, moveTodo } from "../state/todos";
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
    expect(state.todos.noon).toEqual([]);
    expect(state.workspaceLines).toEqual([{ text: "child", indent: 1 }]);
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

import { describe, expect, it } from "vitest";
import { DEFAULT_COMPANION_GIF_THEME, getCompanionNotificationIconSrc } from "../state/companionGifThemes";
import { defaultState, STORAGE_KEY } from "../state/defaults";
import {
  getSerializableState,
  normalizeImportedState,
  saveStateWithConflictCheck,
  serializeTextLines,
} from "../state/storage";
import {
  addTodo,
  completeTodo,
  getOrderedTodos,
  moveTodo,
  removeEmptyTodo,
  removeTodoListData,
  reorderTodoLists,
  setTodoNotifyAt,
  starTodo,
  updateTodoText,
} from "../state/todos";
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
        title: "📝 备忘录",
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

    expect(state.language).toBe("zh");
    expect(state.spaces).toEqual([{ id: "workspace", title: "📝 备忘录", lines: [] }]);
    expect(state.activeSpaceId).toBe("workspace");
    expect(state.showCompletedTodos).toEqual({ morning: false });
  });

  it("normalizes and serializes the app language preference", () => {
    const english = normalizeImportedState({ language: "en" });
    const unknown = normalizeImportedState({ language: "fr" });

    expect(english.language).toBe("en");
    expect(getSerializableState(english).language).toBe("en");
    expect(unknown.language).toBe("zh");
  });

  it("drops legacy default custom titles while preserving real custom titles", () => {
    const state = normalizeImportedState({
      customTitles: {
        "image-title": "🎨 图床",
        "note-title": "我的便签",
        "todo-morning-title": "✅ 待办",
        "workspace-title": "📝 Memo.txt",
      },
    });

    expect(state.customTitles).toEqual({ "note-title": "我的便签" });
    expect(state.todoLists[0].title).toBe("✅ 提醒事项");
    expect(state.spaces[0].title).toBe("📝 备忘录");
  });

  it("creates default configurable todo lists for new users", () => {
    const state = defaultState();

    expect(state.todoLists.map((list) => ({ id: list.id, title: list.title }))).toEqual([
      { id: "morning", title: "✅ 提醒事项" },
    ]);
    expect(Object.keys(state.todos)).toEqual(["morning"]);
    expect(state.showCompletedTodos).toEqual({ morning: false });
  });

  it("migrates legacy fixed reminder lists into configurable todoLists", () => {
    const state = normalizeImportedState({
      customTitles: {
        "todo-morning-title": "上午",
        "todo-noon-title": "中段",
      },
      showCompletedTodos: { morning: true },
      todos: {
        morning: [{ id: "a", text: "A", done: false }],
        noon: [{ id: "b", text: "B", done: true }],
        evening: [],
      },
    });

    expect(state.todoLists.map((list) => [list.id, list.title])).toEqual([
      ["morning", "上午"],
      ["noon", "中段"],
      ["evening", "📚 学习"],
    ]);
    expect(state.todos.morning.map((todo) => todo.text)).toEqual(["A"]);
    expect(state.todos.noon.map((todo) => todo.text)).toEqual(["B"]);
    expect(state.showCompletedTodos).toEqual({ morning: true, noon: false, evening: false });
  });

  it("normalizes persisted dynamic todo lists and drops orphan todo records", () => {
    const state = normalizeImportedState({
      todoLists: [
        { id: "work", title: "工作", collapsed: true, compact: false },
        { id: "life", title: "", collapsed: false, compact: true },
      ],
      showCompletedTodos: { work: true, orphan: true },
      todos: {
        work: [{ id: "a", text: "A", done: false }],
        life: [{ id: "b", text: "B", done: true }],
        orphan: [{ id: "x", text: "X", done: false }],
      },
    });

    expect(state.todoLists).toEqual([
      { id: "work", title: "工作", collapsed: true, compact: false },
      { id: "life", title: "未命名列表", collapsed: false, compact: true },
    ]);
    expect(Object.keys(state.todos)).toEqual(["work", "life"]);
    expect(state.showCompletedTodos).toEqual({ work: true, life: false });
  });

  it("renames duplicate persisted todo list ids while keeping list order", () => {
    const state = normalizeImportedState({
      todoLists: [
        { id: "work", title: "工作", collapsed: false, compact: false },
        { id: "work", title: "重复工作", collapsed: true, compact: true },
      ],
      todos: {
        work: [{ id: "a", text: "A", done: false }],
      },
    });

    expect(state.todoLists).toHaveLength(2);
    expect(state.todoLists[0]).toEqual({ id: "work", title: "工作", collapsed: false, compact: false });
    expect(state.todoLists[1]).toMatchObject({ title: "重复工作", collapsed: true, compact: true });
    expect(state.todoLists[1].id).not.toBe("work");
    expect(new Set(state.todoLists.map((list) => list.id)).size).toBe(2);
    expect(Object.keys(state.todos)).toEqual(state.todoLists.map((list) => list.id));
  });

  it("falls back to default todo lists when persisted todoLists is empty or invalid", () => {
    const emptyState = normalizeImportedState({ todoLists: [] });
    const invalidState = normalizeImportedState({
      todoLists: [
        { id: "", title: "空" },
        null,
        { title: "缺少 id" },
      ],
    });

    const expected = [
      { id: "morning", title: "✅ 提醒事项" },
    ];

    expect(emptyState.todoLists.map((list) => ({ id: list.id, title: list.title }))).toEqual(expected);
    expect(invalidState.todoLists.map((list) => ({ id: list.id, title: list.title }))).toEqual(expected);
    expect(Object.keys(emptyState.todos)).toEqual(["morning"]);
    expect(Object.keys(invalidState.todos)).toEqual(["morning"]);
  });

  it("serializes configurable todo lists without orphan records", () => {
    const state = normalizeImportedState({
      todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: true }],
      todos: { custom: [{ id: "a", text: "A", done: false }], ghost: [{ id: "g", text: "G", done: false }] },
      showCompletedTodos: { custom: true, ghost: true },
    });

    const stored = getSerializableState(state);

    expect(stored.todoLists).toEqual([{ id: "custom", title: "自定义", collapsed: false, compact: true }]);
    expect(Object.keys(stored.todos)).toEqual(["custom"]);
    expect(stored.showCompletedTodos).toEqual({ custom: true });
  });

  it("keeps todo helpers safe when fixed-period arrays are missing", () => {
    const state = normalizeImportedState({
      todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: false }],
      todos: { custom: [{ id: "c", text: "C", done: false }] },
    });

    const withMorning = addTodo(state.todos, "morning", { id: "m", text: "M", done: false });

    expect(withMorning.custom.map((todo) => todo.text)).toEqual(["C"]);
    expect(withMorning.morning.map((todo) => todo.text)).toEqual(["M"]);
    expect(removeEmptyTodo(state.todos, "morning", "missing")).toEqual(state.todos);
  });

  it("defaults to the pixel cat companion GIF theme", () => {
    expect(defaultState().companionGifTheme).toBe(DEFAULT_COMPANION_GIF_THEME);
    expect(defaultState().companionGifTheme).toBe("cat");
  });

  it("preserves the disabled companion GIF theme during import and serialization", () => {
    const state = normalizeImportedState({ companionGifTheme: "none" });

    expect(state.companionGifTheme).toBe("none");
    expect(getSerializableState(state).companionGifTheme).toBe("none");
  });

  it("preserves custom companion GIF sources during import and serialization", () => {
    const state = normalizeImportedState({
      companionGifTheme: "custom",
      customCompanionGif: {
        light: "data:image/gif;base64,light",
        dark: "data:image/gif;base64,dark",
      },
    });

    expect(state.companionGifTheme).toBe("custom");
    expect(state.customCompanionGif).toEqual({
      light: "data:image/gif;base64,light",
      dark: "data:image/gif;base64,dark",
    });
    expect(getSerializableState(state).customCompanionGif).toEqual({});
    expect(getSerializableState(state).customCompanionGifStored).toEqual({ light: true, dark: true });
    expect(getSerializableState(state, { includeCustomGifData: true }).customCompanionGif).toEqual(state.customCompanionGif);
  });

  it("normalizes unknown companion GIF themes to the pixel cat", () => {
    expect(normalizeImportedState({ companionGifTheme: "future-theme" }).companionGifTheme).toBe("cat");
    expect(normalizeImportedState({ companionGifTheme: "" }).companionGifTheme).toBe("cat");
    expect(normalizeImportedState({ companionGifTheme: null }).companionGifTheme).toBe("cat");
  });

  it("uses still image assets for built-in reminder notification icons", () => {
    expect(getCompanionNotificationIconSrc("cat", "light")).toContain("mini-desk-cat.png");
    expect(getCompanionNotificationIconSrc("cat", "dark")).toContain("mini-desk-cat-dark.png");
    expect(getCompanionNotificationIconSrc("ikun", "light")).toContain("kun.jpg");
    expect(getCompanionNotificationIconSrc("ikun", "dark")).toContain("kun-dark.jpg");
    expect(getCompanionNotificationIconSrc("hermes", "light")).toContain("yunxia.jpg");
    expect(getCompanionNotificationIconSrc("hermes", "dark")).toContain("yunxia-dark.jpg");
    expect(getCompanionNotificationIconSrc("none", "light")).toBe("");
    expect(getCompanionNotificationIconSrc("custom", "light", { light: "data:image/gif;base64,light" })).toBe("data:image/gif;base64,light");
    expect(getCompanionNotificationIconSrc("custom", "dark", { light: "data:image/gif;base64,light", dark: "data:image/gif;base64,dark" })).toBe("data:image/gif;base64,dark");
  });

  it("serializes image metadata without large payloads for localStorage", () => {
    const state: BoardState = {
      ...defaultState(),
      images: [
        {
          id: "img-1",
          src: "data:image/png;base64,abc",
          createdAt: 1,
          displayWidth: 80,
          displayHeight: 40,
        },
      ],
    };

    expect(getSerializableState(state).images).toEqual([
      { id: "img-1", createdAt: 1, displayWidth: 80, displayHeight: 40 },
    ]);
    expect(getSerializableState(state, { includeImageData: true }).images[0]).toMatchObject({
      id: "img-1",
      src: "data:image/png;base64,abc",
      displayWidth: 80,
      displayHeight: 40,
    });
  });

  it("normalizes persisted image display dimensions", () => {
    const state = normalizeImportedState({
      images: [
        { id: "img-1", createdAt: 1, displayWidth: 80.4, displayHeight: 40.6 },
        { id: "img-2", createdAt: 2, displayWidth: 0, displayHeight: Number.POSITIVE_INFINITY },
      ],
    });

    expect(state.images[0]).toMatchObject({ displayWidth: 80, displayHeight: 41 });
    expect(state.images[1]).not.toHaveProperty("displayWidth");
    expect(state.images[1]).not.toHaveProperty("displayHeight");
  });

  it("merges image additions from a stale tab without overwriting the latest stored state", () => {
    const storage = localStorage;
    storage.clear();
    const latest = normalizeImportedState({
      sync: { revision: 2, updatedAt: 20, clientId: "tab-a" },
      noteLines: [{ text: "new note", indent: 0 }],
      images: [{ id: "a", createdAt: 1 }],
    });
    const staleWithImage = normalizeImportedState({
      sync: { revision: 1, updatedAt: 10, clientId: "tab-b" },
      noteLines: [{ text: "old note", indent: 0 }],
      images: [{ id: "b", src: "data:image/png;base64,b", createdAt: 2 }],
    });

    saveStateWithConflictCheck(latest, { storage, clientId: "tab-a", now: () => 20 });
    const result = saveStateWithConflictCheck(staleWithImage, {
      storage,
      clientId: "tab-b",
      now: () => 30,
      scope: "images",
    });

    const stored = normalizeImportedState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
    expect(result.status).toBe("merged");
    expect(stored.sync.revision).toBe(3);
    expect(stored.noteLines).toEqual([{ text: "new note", indent: 0 }]);
    expect(stored.images.map((image) => image.id)).toEqual(["a", "b"]);
  });

  it("rejects stale text saves instead of silently overwriting newer text", () => {
    const storage = localStorage;
    storage.clear();
    const latest = normalizeImportedState({
      sync: { revision: 2, updatedAt: 20, clientId: "tab-a" },
      spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "new text", indent: 0 }] }],
      activeSpaceId: "workspace",
    });
    const staleTextEdit = normalizeImportedState({
      sync: { revision: 1, updatedAt: 10, clientId: "tab-b" },
      spaces: [{ id: "workspace", title: "Memo", lines: [{ text: "stale edit", indent: 0 }] }],
      activeSpaceId: "workspace",
    });

    saveStateWithConflictCheck(latest, { storage, clientId: "tab-a", now: () => 20 });
    const result = saveStateWithConflictCheck(staleTextEdit, {
      storage,
      clientId: "tab-b",
      now: () => 30,
      scope: "text",
    });

    const stored = normalizeImportedState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
    expect(result.status).toBe("conflict");
    expect(stored.sync.revision).toBe(2);
    expect(stored.spaces[0].lines).toEqual([{ text: "new text", indent: 0 }]);
  });

  it("allows confirmed destructive writes to replace a newer stored revision", () => {
    const storage = localStorage;
    storage.clear();
    const latest = normalizeImportedState({
      sync: { revision: 2, updatedAt: 20, clientId: "tab-a" },
      noteLines: [{ text: "new note", indent: 0 }],
    });
    const confirmedImport = normalizeImportedState({
      sync: { revision: 1, updatedAt: 10, clientId: "tab-b" },
      noteLines: [{ text: "imported note", indent: 0 }],
    });

    saveStateWithConflictCheck(latest, { storage, clientId: "tab-a", now: () => 20 });
    const result = saveStateWithConflictCheck(confirmedImport, {
      storage,
      clientId: "tab-b",
      force: true,
      now: () => 30,
    });

    const stored = normalizeImportedState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
    expect(result.status).toBe("saved");
    expect(stored.sync.revision).toBe(3);
    expect(stored.noteLines).toEqual([{ text: "imported note", indent: 0 }]);
  });

  it("normalizes quick buttons, todos, and text line indentation", () => {
    const state = normalizeImportedState({
      quickButtons: [
        { title: "Docs", value: "https://example.com", type: "link" },
        {
          title: "接口",
          value: "https://api.example.com",
          type: "api",
          apiMethod: "DELETE",
          apiHeaders: [
            { key: "Authorization", value: "Bearer test" },
            { key: "X-Trace-Id", value: "abc" },
          ],
          apiBodyType: "json",
          apiBody: '{"id":1}',
        },
      ],
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
    expect(state.quickButtons[1]).toMatchObject({
      title: "接口",
      value: "https://api.example.com",
      type: "api",
      apiMethod: "DELETE",
      apiHeaders: [
        { key: "Authorization", value: "Bearer test" },
        { key: "X-Trace-Id", value: "abc" },
      ],
      apiBodyType: "json",
      apiBody: '{"id":1}',
      hidden: false,
    });
    expect(state.todos.morning).toHaveLength(2);
    expect(state.todos.morning[0].starred).toBe(false);
    expect(state.workspaceLines).toEqual([{ text: "child", indent: 1 }]);
    expect(state.showCompletedTodos).toEqual({ morning: true });
  });

  it("normalizes per-period completed reminder visibility", () => {
    const state = normalizeImportedState({
      showCompletedTodos: {
        morning: true,
        noon: false,
      },
    });

    expect(state.showCompletedTodos).toEqual({ morning: true });
  });

  it("normalizes legacy API header text into key-value pairs", () => {
    const state = normalizeImportedState({
      quickButtons: [
        {
          title: "旧接口",
          value: "https://api.example.com",
          type: "api",
          apiHeaders: "Authorization: Bearer test\nX-Trace-Id: abc\nInvalid",
        },
      ],
    });

    expect(state.quickButtons[0]).toMatchObject({
      apiHeaders: [
        { key: "Authorization", value: "Bearer test" },
        { key: "X-Trace-Id", value: "abc" },
      ],
    });
  });

  it("normalizes quick action tags and keeps invalid tag references untagged", () => {
    const state = normalizeImportedState({
      quickTags: [
        { id: "tag-a", title: "标签 A" },
        { id: "tag-b", title: "标签 B" },
        { id: "tag-a", title: "重复" },
      ],
      quickButtons: [
        { id: "a", title: "A", value: "a", type: "text", tagId: "tag-a" },
        { id: "orphan", title: "孤儿", value: "x", type: "text", tagId: "missing" },
      ],
    });

    expect(state.quickTags).toEqual([
      { id: "tag-a", title: "标签 A" },
      { id: "tag-b", title: "标签 B" },
    ]);
    expect(state.quickButtons[0]).toMatchObject({ tagId: "tag-a" });
    expect(state.quickButtons[1]).not.toHaveProperty("tagId");
    expect(getSerializableState(state).quickTags).toEqual(state.quickTags);
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
    expect(state.todos.morning[0]).toMatchObject({ starred: true, notifyAt: 1779721200000 });
    expect(state.todos.morning[0]).not.toHaveProperty("deadlineAt");
  });

  it("migrates valid todo deadlines during import regardless of starred state", () => {
    const state = normalizeImportedState({
      todos: {
        morning: [
          { id: "a", text: "有效截止", done: false, starred: true, deadlineAt: 1779721200000 },
          { id: "b", text: "非法截止", done: false, starred: true, deadlineAt: "2026-05-30" },
          { id: "c", text: "非重点截止", done: false, starred: false, deadlineAt: 1779721200000 },
        ],
      },
    });

    expect(state.todos.morning[0]).toMatchObject({ starred: true, notifyAt: 1779721200000 });
    expect(state.todos.morning[1]).toMatchObject({ starred: true });
    expect(state.todos.morning[1]).not.toHaveProperty("notifyAt");
    expect(state.todos.morning[2]).toMatchObject({ starred: false, notifyAt: 1779721200000 });
    expect(state.todos.morning[2]).not.toHaveProperty("deadlineAt");
  });

  it("migrates legacy deadlineAt to notifyAt and serializes only notifyAt", () => {
    const legacyAt = new Date(2026, 4, 25, 18).getTime();
    const state = normalizeImportedState({
      todos: {
        morning: [{ id: "a", text: "legacy", done: false, starred: true, deadlineAt: legacyAt }],
        noon: [],
        evening: [],
      },
    });

    expect(state.todos.morning[0]).toMatchObject({ notifyAt: legacyAt });
    expect("deadlineAt" in state.todos.morning[0]).toBe(false);
    expect(getSerializableState(state).todos.morning[0]).toMatchObject({ notifyAt: legacyAt });
    expect("deadlineAt" in getSerializableState(state).todos.morning[0]).toBe(false);
  });

  it("prefers notifyAt over legacy deadlineAt during import and serialization", () => {
    const notifyAt = new Date(2026, 4, 25, 9).getTime();
    const legacyAt = new Date(2026, 4, 25, 18).getTime();
    const state = normalizeImportedState({
      todos: {
        morning: [{ id: "a", text: "both", done: false, starred: true, notifyAt, deadlineAt: legacyAt }],
        noon: [],
        evening: [],
      },
    });

    expect(state.todos.morning[0]).toMatchObject({ notifyAt });
    expect("deadlineAt" in state.todos.morning[0]).toBe(false);
    expect(getSerializableState(state).todos.morning[0]).toMatchObject({ notifyAt });
    expect("deadlineAt" in getSerializableState(state).todos.morning[0]).toBe(false);
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
  it("edits reminders in arbitrary todo list ids", () => {
    const todos = {
      custom: [{ id: "a", text: "A", done: false }],
    };

    const added = addTodo(todos, "custom", { id: "b", text: "B", done: false });
    const updated = updateTodoText(added, "custom", "b", "B2");
    const notified = setTodoNotifyAt(updated, "custom", "b", new Date(2026, 4, 25, 9).getTime());
    const completed = completeTodo(notified, "custom", "b", true);

    expect(completed.custom.map((todo) => [todo.id, todo.text, todo.done])).toEqual([
      ["a", "A", false],
      ["b", "B2", true],
    ]);
    expect(completed.custom[1].notifyAt).toBe(new Date(2026, 4, 25, 9).getTime());
  });

  it("treats missing todo list ids as no-ops", () => {
    const todos = { custom: [{ id: "a", text: "A", done: false }] };

    expect(updateTodoText(todos, "missing", "a", "B")).toEqual(todos);
    expect(completeTodo(todos, "missing", "a", true)).toEqual(todos);
    expect(moveTodo(todos, "missing", "a", "custom")).toEqual(todos);
    expect(moveTodo(todos, "custom", "a", "missing")).toEqual(todos);
  });

  it("removes and reorders configurable todo lists without mutating reminders", () => {
    const state = normalizeImportedState({
      todoLists: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
        { id: "c", title: "C" },
      ],
      todos: {
        a: [{ id: "ta", text: "A", done: false }],
        b: [{ id: "tb", text: "B", done: false }],
        c: [],
      },
    });

    const reordered = reorderTodoLists(state.todoLists, "c", "a");
    const removed = removeTodoListData(state.todos, state.showCompletedTodos, "b");

    expect(reordered.map((list) => list.id)).toEqual(["c", "a", "b"]);
    expect(Object.keys(removed.todos)).toEqual(["a", "c"]);
    expect(removed.todos.a[0].text).toBe("A");
    expect(removed.showCompletedTodos).toEqual({ a: false, c: false });
  });

  it("leaves todo order unchanged when moving a todo onto itself", () => {
    const todos = {
      custom: [
        { id: "a", text: "A", done: false },
        { id: "b", text: "B", done: false },
        { id: "c", text: "C", done: false },
      ],
    };

    const moved = moveTodo(todos, "custom", "b", "custom", "b");

    expect(moved.custom.map((todo) => todo.id)).toEqual(["a", "b", "c"]);
  });

  it("matches image-style ordering when moving a todo downward onto the next item", () => {
    const todos = {
      custom: [
        { id: "a", text: "A", done: false },
        { id: "b", text: "B", done: false },
        { id: "c", text: "C", done: false },
      ],
    };

    const adjacent = moveTodo(todos, "custom", "a", "custom", "b");
    const nonAdjacent = moveTodo(todos, "custom", "a", "custom", "c");

    expect(adjacent.custom.map((todo) => todo.id)).toEqual(["b", "a", "c"]);
    expect(nonAdjacent.custom.map((todo) => todo.id)).toEqual(["b", "c", "a"]);
  });

  it("reorders configurable todo lists before the target when moving downward", () => {
    const state = normalizeImportedState({
      todoLists: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
        { id: "c", title: "C" },
      ],
      todos: {
        a: [],
        b: [],
        c: [],
      },
    });

    const reordered = reorderTodoLists(state.todoLists, "a", "c");

    expect(reordered.map((list) => list.id)).toEqual(["b", "a", "c"]);
  });

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

  it("keeps starred ordering independent from notification time", () => {
    const todos = [
      { id: "ordinary", text: "普通", done: false },
      { id: "later", text: "晚一点", done: false, starred: true, notifyAt: 3000 },
      { id: "starred", text: "重点无时间", done: false, starred: true },
      { id: "sooner", text: "更近", done: false, starred: true, notifyAt: 1000 },
      { id: "done", text: "完成", done: true, starred: true, notifyAt: 500 },
    ];

    expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual([
      "later",
      "starred",
      "sooner",
      "ordinary",
      "done",
    ]);
  });

  it("keeps starred todos in their original relative order", () => {
    const todos = [
      { id: "b", text: "第二个", done: false, starred: true, notifyAt: 3000 },
      { id: "a", text: "第一个", done: false, starred: true, notifyAt: 1000 },
    ];

    expect(getOrderedTodos(todos).map((todo) => todo.id)).toEqual(["b", "a"]);
  });

  it("keeps notification time when star is removed", () => {
    const notifyAt = new Date(2026, 4, 25, 18).getTime();
    const todos = {
      morning: [{ id: "a", text: "task", done: false, starred: true, notifyAt }],
      noon: [],
      evening: [],
    };

    expect(starTodo(todos, "morning", "a", false).morning[0]).toMatchObject({
      starred: false,
      notifyAt,
    });
  });

  it("maps valid legacy star deadline arguments to notification time", () => {
    const notifyAt = new Date(2026, 4, 25, 18).getTime();
    const todos = {
      morning: [{ id: "a", text: "task", done: false }],
      noon: [],
      evening: [],
    };

    expect(starTodo(todos, "morning", "a", true, notifyAt).morning[0]).toMatchObject({
      starred: true,
      notifyAt,
    });
  });

  it("does not clear existing notification time when starring without a legacy deadline", () => {
    const notifyAt = new Date(2026, 4, 25, 18).getTime();
    const todos = {
      morning: [{ id: "a", text: "task", done: false, notifyAt }],
      noon: [],
      evening: [],
    };

    expect(starTodo(todos, "morning", "a", true).morning[0]).toMatchObject({
      starred: true,
      notifyAt,
    });
  });

  it("sets and clears notification time without changing starred state", () => {
    const notifyAt = new Date(2026, 4, 25, 18).getTime();
    const todos = {
      morning: [{ id: "a", text: "task", done: false, starred: true }],
      noon: [],
      evening: [],
    };

    const withNotify = setTodoNotifyAt(todos, "morning", "a", notifyAt);
    expect(withNotify.morning[0]).toMatchObject({ starred: true, notifyAt });

    const withoutNotify = setTodoNotifyAt(withNotify, "morning", "a", undefined);
    expect(withoutNotify.morning[0]).toMatchObject({ starred: true });
    expect(withoutNotify.morning[0].notifyAt).toBeUndefined();
  });

  it("sets and clears todo star state through starTodo", () => {
    const state = defaultState();
    state.todos.morning = [{ id: "a", text: "重点", done: false }];

    const starred = starTodo(state.todos, "morning", "a", true);
    expect(starred.morning[0]).toMatchObject({ starred: true });
    expect(starred.morning[0]).not.toHaveProperty("notifyAt");

    const missingDeadline = starTodo(starred, "morning", "a", true);
    expect(missingDeadline.morning[0]).toMatchObject({ starred: true });

    const unstarred = starTodo(starred, "morning", "a", false);
    expect(unstarred.morning[0]).toMatchObject({ starred: false });
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

  it("inserts a blank-space todo after existing open todos even when completed todos were stored first", () => {
    const state = defaultState();
    state.todos.morning = [
      { id: "done", text: "已完成", done: true },
      { id: "open", text: "未完成", done: false },
    ];

    const next = addTodo(state.todos, "morning", { id: "blank", text: "", done: false });

    expect(next.morning.map((todo) => todo.id)).toEqual(["done", "open", "blank"]);
    expect(getOrderedTodos(next.morning).map((todo) => todo.id)).toEqual(["open", "blank", "done"]);
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

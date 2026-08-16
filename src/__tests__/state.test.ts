import { describe, expect, it } from "vitest";
import { DEFAULT_COMPANION_GIF_THEME, getCompanionGifSrc, getCompanionNotificationIconSrc } from "../state/companionGifThemes";
import { DEFAULT_ZONE_VISIBILITY, defaultState, defaultWorkspace, STORAGE_KEY } from "../state/defaults";
import {
  getSerializableState,
  getSerializableWorkspace,
  normalizeImportedState,
  normalizeWorkspaceData,
  saveStateWithConflictCheck,
  serializeTextLines,
} from "../state/storage";
import {
  addTodo,
  assignTodoListColumn,
  completeTodo,
  distributeTodoListColumns,
  getOrderedTodos,
  moveTodo,
  removeEmptyTodo,
  removeTodoListData,
  setTodoNotifyAt,
  starTodo,
  updateTodoText,
} from "../state/todos";
import { getQuickTagColor } from "../state/quickButtons";
import type { BoardState } from "../types";

describe("state compatibility", () => {
  it("normalizes legacy text fields into line collections", () => {
    const state = normalizeImportedState({
      workspace: "alpha\n\tbeta",
      note: "idea",
      storage: "\tcommand",
    });
    const ws = () => state.workspaces[0];

    expect(ws().workspaceLines).toEqual([
      { text: "alpha", indent: 0 },
      { text: "beta", indent: 1 },
    ]);
    expect(ws().noteLines).toEqual([{ text: "idea", indent: 0 }]);
    expect(ws().storageLines).toEqual([{ text: "command", indent: 1 }]);
    expect(ws().spaces).toEqual([
      {
        id: "workspace",
        title: "📝 便签",
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
    expect(ws().activeSpaceId).toBe("workspace");
  });

  it("creates one default workspace space for new users", () => {
    const state = defaultState();
    const ws = () => state.workspaces[0];

    expect(state.language).toBe("zh");
    expect(ws().spaces).toEqual([{ id: "workspace", title: "📝 便签", lines: [] }]);
    expect(ws().activeSpaceId).toBe("workspace");
    expect(ws().showCompletedTodos).toEqual({ morning: false });
    expect(ws().quickOtherCollapsed).toBe(false);
  });

  it("normalizes and serializes the Other quick-action group collapse state", () => {
    const state = normalizeImportedState({ quickOtherCollapsed: true });

    expect(state.workspaces[0].quickOtherCollapsed).toBe(true);
    expect(getSerializableState(state).workspaces[0].quickOtherCollapsed).toBe(true);
    expect(normalizeImportedState({}).workspaces[0].quickOtherCollapsed).toBe(false);
  });

  it("normalizes and serializes the app language preference", () => {
    const english = normalizeImportedState({ language: "en" });
    const unknown = normalizeImportedState({ language: "fr" });

    expect(english.language).toBe("en");
    expect(getSerializableState(english).language).toBe("en");
    expect(unknown.language).toBe("zh");
  });

  it("stores zone visibility per workspace and defaults to all visible", () => {
    const allVisible = { ...DEFAULT_ZONE_VISIBILITY };

    expect(defaultWorkspace().zoneVisibility).toEqual(allVisible);
    expect(defaultState().workspaces[0].zoneVisibility).toEqual(allVisible);
    expect(normalizeImportedState({}).workspaces[0].zoneVisibility).toEqual(allVisible);

    const ws = normalizeWorkspaceData({ id: "a", zoneVisibility: { tasks: false, notes: false } });
    expect(ws.zoneVisibility).toEqual({ ...allVisible, tasks: false, notes: false });
  });

  it("serializes and clones each workspace's zone visibility", () => {
    const workspace = defaultWorkspace("a");
    workspace.zoneVisibility = { assets: true, notes: false, tasks: false, workspace: true };
    const serialized = getSerializableWorkspace(workspace);

    expect(serialized.zoneVisibility).toEqual({ assets: true, notes: false, tasks: false, workspace: true });
    // The serialized visibility is an isolated clone.
    workspace.zoneVisibility.notes = true;
    expect(serialized.zoneVisibility.notes).toBe(false);
  });

  it("seeds every workspace from the legacy global zone visibility on load", () => {
    const state = normalizeImportedState({
      zoneVisibility: { tasks: false },
      workspaces: [
        { id: "a", noteLines: [{ text: "a", indent: 0 }] },
        { id: "b", zoneVisibility: { notes: false }, noteLines: [{ text: "b", indent: 0 }] },
      ],
    });

    // A workspace without its own visibility inherits the legacy global value.
    expect(state.workspaces[0].zoneVisibility).toEqual({ assets: true, notes: true, tasks: false, workspace: true });
    // A workspace that already declares its own visibility keeps it.
    expect(state.workspaces[1].zoneVisibility).toEqual({ assets: true, notes: false, tasks: true, workspace: true });
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
    const ws = () => state.workspaces[0];

    expect(ws().customTitles).toEqual({ "note-title": "我的便签" });
    expect(ws().todoLists[0].title).toBe("✅ 提醒事项");
    expect(ws().spaces[0].title).toBe("📝 便签");
  });

  it("creates default configurable todo lists for new users", () => {
    const state = defaultState();
    const ws = () => state.workspaces[0];

    expect(ws().todoLists.map((list) => ({ id: list.id, title: list.title }))).toEqual([
      { id: "morning", title: "✅ 提醒事项" },
    ]);
    expect(Object.keys(ws().todos)).toEqual(["morning"]);
    expect(ws().showCompletedTodos).toEqual({ morning: false });
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
    const ws = () => state.workspaces[0];

    expect(ws().todoLists.map((list) => [list.id, list.title])).toEqual([
      ["morning", "上午"],
      ["noon", "中段"],
      ["evening", "📚 学习"],
    ]);
    expect(ws().todos.morning.map((todo) => todo.text)).toEqual(["A"]);
    expect(ws().todos.noon.map((todo) => todo.text)).toEqual(["B"]);
    expect(ws().showCompletedTodos).toEqual({ morning: true, noon: false, evening: false });
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
    const ws = () => state.workspaces[0];

    expect(ws().todoLists).toEqual([
      { id: "work", title: "工作", collapsed: true, compact: false, column: 0 },
      { id: "life", title: "未命名列表", collapsed: false, compact: true, column: 0 },
    ]);
    expect(Object.keys(ws().todos)).toEqual(["work", "life"]);
    expect(ws().showCompletedTodos).toEqual({ work: true, life: false });
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
    const ws = () => state.workspaces[0];

    expect(ws().todoLists).toHaveLength(2);
    expect(ws().todoLists[0]).toEqual({ id: "work", title: "工作", collapsed: false, compact: false, column: 0 });
    expect(ws().todoLists[1]).toMatchObject({ title: "重复工作", collapsed: true, compact: true });
    expect(ws().todoLists[1].id).not.toBe("work");
    expect(new Set(ws().todoLists.map((list) => list.id)).size).toBe(2);
    expect(Object.keys(ws().todos)).toEqual(ws().todoLists.map((list) => list.id));
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
    const emptyWs = () => emptyState.workspaces[0];
    const invalidWs = () => invalidState.workspaces[0];

    const expected = [
      { id: "morning", title: "✅ 提醒事项" },
    ];

    expect(emptyWs().todoLists.map((list) => ({ id: list.id, title: list.title }))).toEqual(expected);
    expect(invalidWs().todoLists.map((list) => ({ id: list.id, title: list.title }))).toEqual(expected);
    expect(Object.keys(emptyWs().todos)).toEqual(["morning"]);
    expect(Object.keys(invalidWs().todos)).toEqual(["morning"]);
  });

  it("serializes configurable todo lists without orphan records", () => {
    const state = normalizeImportedState({
      todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: true }],
      todos: { custom: [{ id: "a", text: "A", done: false }], ghost: [{ id: "g", text: "G", done: false }] },
      showCompletedTodos: { custom: true, ghost: true },
    });

    const stored = getSerializableState(state);
    const ws = () => stored.workspaces[0];

    expect(ws().todoLists).toEqual([{ id: "custom", title: "自定义", collapsed: false, compact: true, column: 0 }]);
    expect(Object.keys(ws().todos)).toEqual(["custom"]);
    expect(ws().showCompletedTodos).toEqual({ custom: true });
  });

  it("keeps todo helpers safe when fixed-period arrays are missing", () => {
    const state = normalizeImportedState({
      todoLists: [{ id: "custom", title: "自定义", collapsed: false, compact: false }],
      todos: { custom: [{ id: "c", text: "C", done: false }] },
    });
    const ws = () => state.workspaces[0];

    const withMorning = addTodo(ws().todos, "morning", { id: "m", text: "M", done: false });

    expect(withMorning.custom.map((todo) => todo.text)).toEqual(["C"]);
    expect(withMorning.morning.map((todo) => todo.text)).toEqual(["M"]);
    expect(removeEmptyTodo(ws().todos, "morning", "missing")).toEqual(ws().todos);
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

  it("does not reuse one custom companion GIF across light and dark modes", () => {
    expect(getCompanionGifSrc("custom", "light", { light: "data:image/gif;base64,light" })).toBe("data:image/gif;base64,light");
    expect(getCompanionGifSrc("custom", "dark", { light: "data:image/gif;base64,light" })).toBe("");
    expect(getCompanionGifSrc("custom", "light", { dark: "data:image/gif;base64,dark" })).toBe("");
    expect(getCompanionGifSrc("custom", "dark", { dark: "data:image/gif;base64,dark" })).toBe("data:image/gif;base64,dark");
    expect(getCompanionNotificationIconSrc("custom", "dark", { light: "data:image/gif;base64,light" })).toBe("");
  });

  it("serializes image metadata without large payloads for localStorage", () => {
    const state: BoardState = {
      ...defaultState(),
      workspaces: [
        {
          ...defaultWorkspace(),
          images: [
            {
              id: "img-1",
              src: "data:image/png;base64,abc",
              createdAt: 1,
              displayWidth: 80,
              displayHeight: 40,
            },
          ],
        },
      ],
    };

    expect(getSerializableState(state).workspaces[0].images).toEqual([
      { id: "img-1", createdAt: 1, displayWidth: 80, displayHeight: 40 },
    ]);
    expect(getSerializableState(state, { includeImageData: true }).workspaces[0].images[0]).toMatchObject({
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
    const ws = () => state.workspaces[0];

    expect(ws().images[0]).toMatchObject({ displayWidth: 80, displayHeight: 41 });
    expect(ws().images[1]).not.toHaveProperty("displayWidth");
    expect(ws().images[1]).not.toHaveProperty("displayHeight");
  });

  it("normalizes and serializes immutable image payload ids", () => {
    const state = normalizeImportedState({
      images: [
        { id: "img-1", payloadId: "payload-v2", createdAt: 1 },
        { id: "img-2", payloadId: "", createdAt: 2 },
      ],
    });
    const ws = () => state.workspaces[0];

    expect(ws().images[0]).toMatchObject({ id: "img-1", payloadId: "payload-v2" });
    expect(ws().images[1]).not.toHaveProperty("payloadId");
    expect(getSerializableState(state).workspaces[0].images[0]).toMatchObject({
      id: "img-1",
      payloadId: "payload-v2",
      createdAt: 1,
    });
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
    const ws = () => stored.workspaces[0];
    expect(result.status).toBe("merged");
    expect(stored.sync.revision).toBe(3);
    expect(ws().noteLines).toEqual([{ text: "new note", indent: 0 }]);
    expect(ws().images.map((image) => image.id)).toEqual(["a", "b"]);
  });

  it.each([
    { placement: "before" as const, expected: ["other", "new", "target", "tail"] },
    { placement: "after" as const, expected: ["other", "target", "new", "tail"] },
  ])("keeps a stale tab image addition $placement its target", ({ placement, expected }) => {
    const storage = localStorage;
    storage.clear();
    const latest = normalizeImportedState({
      sync: { revision: 2, updatedAt: 20, clientId: "tab-a" },
      noteLines: [{ text: "latest note", indent: 0 }],
      images: [
        { id: "other", createdAt: 1 },
        { id: "target", createdAt: 2 },
        { id: "tail", createdAt: 3 },
      ],
    });
    const staleWithImage = normalizeImportedState({
      sync: { revision: 1, updatedAt: 10, clientId: "tab-b" },
      noteLines: [{ text: "stale note", indent: 0 }],
      images: [
        { id: "target", createdAt: 2 },
        { id: "new", src: "data:image/png;base64,new", createdAt: 4 },
      ],
    });

    saveStateWithConflictCheck(latest, { storage, clientId: "tab-a", now: () => 20 });
    const result = saveStateWithConflictCheck(staleWithImage, {
      storage,
      clientId: "tab-b",
      now: () => 30,
      scope: "images",
      imagePlacement: { imageId: "new", targetId: "target", placement },
    });

    const stored = normalizeImportedState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
    const ws = () => stored.workspaces[0];
    expect(result.status).toBe("merged");
    expect(ws().noteLines).toEqual([{ text: "latest note", indent: 0 }]);
    expect(ws().images.map((image) => image.id)).toEqual(expected);
  });

  it("merges an image replacement only when the latest payload version matches", () => {
    const storage = localStorage;
    storage.clear();
    const latest = normalizeImportedState({
      sync: { revision: 2, updatedAt: 20, clientId: "tab-a" },
      noteLines: [{ text: "latest note", indent: 0 }],
      images: [
        { id: "other", payloadId: "other-v1", createdAt: 1 },
        { id: "target", payloadId: "target-v1", createdAt: 2, displayWidth: 100, displayHeight: 50 },
      ],
    });
    const staleReplacement = normalizeImportedState({
      sync: { revision: 1, updatedAt: 10, clientId: "tab-b" },
      noteLines: [{ text: "stale note", indent: 0 }],
      images: [
        { id: "target", payloadId: "target-v2", createdAt: 2, displayWidth: 240, displayHeight: 120 },
      ],
    });

    saveStateWithConflictCheck(latest, { storage, clientId: "tab-a", now: () => 20 });
    const result = saveStateWithConflictCheck(staleReplacement, {
      storage,
      clientId: "tab-b",
      now: () => 30,
      scope: "images",
      imageReplacement: {
        imageId: "target",
        expectedPayloadId: "target-v1",
        newPayloadId: "target-v2",
      },
    });

    const stored = normalizeImportedState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
    const ws = () => stored.workspaces[0];
    expect(result.status).toBe("merged");
    expect(ws().noteLines).toEqual([{ text: "latest note", indent: 0 }]);
    expect(ws().images.map((image) => image.id)).toEqual(["other", "target"]);
    expect(ws().images[1]).toMatchObject({
      payloadId: "target-v2",
      displayWidth: 240,
      displayHeight: 120,
    });
  });

  it.each([
    {
      name: "deleted",
      latestImages: [{ id: "other", payloadId: "other-v1", createdAt: 1 }],
    },
    {
      name: "replaced",
      latestImages: [{ id: "target", payloadId: "winning-v2", createdAt: 2 }],
    },
  ])("rejects a stale replacement when the latest target was $name", ({ latestImages }) => {
    const storage = localStorage;
    storage.clear();
    const latest = normalizeImportedState({
      sync: { revision: 2, updatedAt: 20, clientId: "tab-a" },
      images: latestImages,
    });
    const staleReplacement = normalizeImportedState({
      sync: { revision: 1, updatedAt: 10, clientId: "tab-b" },
      images: [{ id: "target", payloadId: "losing-v2", createdAt: 2 }],
    });

    saveStateWithConflictCheck(latest, { storage, clientId: "tab-a", now: () => 20 });
    const result = saveStateWithConflictCheck(staleReplacement, {
      storage,
      clientId: "tab-b",
      now: () => 30,
      scope: "images",
      imageReplacement: {
        imageId: "target",
        expectedPayloadId: "target",
        newPayloadId: "losing-v2",
      },
    });

    const stored = normalizeImportedState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
    expect(result.status).toBe("conflict");
    expect(stored.workspaces[0].images).toEqual(latest.workspaces[0].images);
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
    expect(stored.workspaces[0].spaces[0].lines).toEqual([{ text: "new text", indent: 0 }]);
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
    expect(stored.workspaces[0].noteLines).toEqual([{ text: "imported note", indent: 0 }]);
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
        { title: "微信", value: "wechat://", type: "app" },
      ],
      showCompletedTodos: true,
      todos: {
        morning: [{ text: "A", done: true }, { text: "B", done: false }],
      },
      workspaceLines: ["\tchild"],
    });
    const ws = () => state.workspaces[0];

    expect(ws().quickButtons[0]).toMatchObject({
      title: "Docs",
      value: "https://example.com",
      type: "link",
      hidden: false,
    });
    expect(ws().quickButtons[1]).toMatchObject({
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
    expect(ws().quickButtons[2]).toMatchObject({
      title: "微信",
      value: "wechat://",
      type: "app",
      hidden: false,
    });
    expect(ws().todos.morning).toHaveLength(2);
    expect(ws().todos.morning[0].starred).toBe(false);
    expect(ws().workspaceLines).toEqual([{ text: "child", indent: 1 }]);
    expect(ws().showCompletedTodos).toEqual({ morning: true });
  });

  it("drops imported app quick buttons with dangerous URL schemes", () => {
    // A malicious workspace export could plant an "app" button whose scheme
    // executes script on click (stored XSS). Normalization must drop it.
    const state = normalizeImportedState({
      quickButtons: [
        { title: "微信", value: "wechat://", type: "app" },
        { title: "陷阱1", value: "javascript:alert(document.domain)", type: "app" },
        { title: "陷阱2", value: "data:text/html,<script>alert(1)</script>", type: "app" },
        { title: "陷阱3", value: "JAVASCRIPT:alert(1)", type: "app" },
        { title: "陷阱4", value: "jav\tascript:alert(1)", type: "app" },
        { title: "陷阱5", value: "file:///etc/passwd", type: "app" },
      ],
    });

    expect(state.workspaces[0].quickButtons).toHaveLength(1);
    expect(state.workspaces[0].quickButtons[0]).toMatchObject({
      title: "微信",
      value: "wechat://",
      type: "app",
    });
  });

  it("keeps imported app quick buttons with custom but safe schemes", () => {
    const state = normalizeImportedState({
      quickButtons: [
        { title: "IM", value: "im:10012345", type: "app" },
        { title: "VS Code", value: "vscode://file/~/todo.md", type: "app" },
      ],
    });

    expect(state.workspaces[0].quickButtons).toHaveLength(2);
  });

  it("normalizes per-period completed reminder visibility", () => {
    const state = normalizeImportedState({
      showCompletedTodos: {
        morning: true,
        noon: false,
      },
    });

    expect(state.workspaces[0].showCompletedTodos).toEqual({ morning: true });
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

    expect(state.workspaces[0].quickButtons[0]).toMatchObject({
      apiHeaders: [
        { key: "Authorization", value: "Bearer test" },
        { key: "X-Trace-Id", value: "abc" },
      ],
    });
  });

  it("normalizes quick action tags and keeps invalid tag references untagged", () => {
    const state = normalizeImportedState({
      quickTags: [
        { id: "tag-a", title: "标签 A", collapsed: true },
        { id: "tag-b", title: "标签 B" },
        { id: "tag-a", title: "重复" },
      ],
      quickButtons: [
        { id: "a", title: "A", value: "a", type: "text", tagId: "tag-a" },
        { id: "orphan", title: "孤儿", value: "x", type: "text", tagId: "missing" },
      ],
    });
    const ws = () => state.workspaces[0];

    expect(ws().quickTags).toEqual([
      { id: "tag-a", title: "标签 A", collapsed: true, color: getQuickTagColor(0) },
      { id: "tag-b", title: "标签 B", color: getQuickTagColor(1) },
    ]);
    expect(ws().quickButtons[0]).toMatchObject({ tagId: "tag-a" });
    expect(ws().quickButtons[1]).not.toHaveProperty("tagId");
    expect(getSerializableState(state).workspaces[0].quickTags).toEqual(ws().quickTags);
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
    const ws = () => state.workspaces[0];

    expect(ws().spaces).toEqual([
      {
        id: "project",
        title: "项目",
        lines: [{ text: "note", indent: 0 }],
      },
    ]);
    expect(ws().activeSpaceId).toBe("project");
    expect(ws().todos.morning[0]).toMatchObject({ starred: true, notifyAt: 1779721200000 });
    expect(ws().todos.morning[0]).not.toHaveProperty("deadlineAt");
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
    const ws = () => state.workspaces[0];

    expect(ws().todos.morning[0]).toMatchObject({ starred: true, notifyAt: 1779721200000 });
    expect(ws().todos.morning[1]).toMatchObject({ starred: true });
    expect(ws().todos.morning[1]).not.toHaveProperty("notifyAt");
    expect(ws().todos.morning[2]).toMatchObject({ starred: false, notifyAt: 1779721200000 });
    expect(ws().todos.morning[2]).not.toHaveProperty("deadlineAt");
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
    const ws = () => state.workspaces[0];

    expect(ws().todos.morning[0]).toMatchObject({ notifyAt: legacyAt });
    expect("deadlineAt" in ws().todos.morning[0]).toBe(false);
    expect(getSerializableState(state).workspaces[0].todos.morning[0]).toMatchObject({ notifyAt: legacyAt });
    expect("deadlineAt" in getSerializableState(state).workspaces[0].todos.morning[0]).toBe(false);
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
    const ws = () => state.workspaces[0];

    expect(ws().todos.morning[0]).toMatchObject({ notifyAt });
    expect("deadlineAt" in ws().todos.morning[0]).toBe(false);
    expect(getSerializableState(state).workspaces[0].todos.morning[0]).toMatchObject({ notifyAt });
    expect("deadlineAt" in getSerializableState(state).workspaces[0].todos.morning[0]).toBe(false);
  });

  it("serializes textarea text into indented line records", () => {
    expect(serializeTextLines("root\n\tchild\n\t\tleaf")).toEqual([
      { text: "root", indent: 0 },
      { text: "child", indent: 1 },
      { text: "leaf", indent: 2 },
    ]);
  });

  it("defaultState 提供一个默认工作空间", () => {
    const state = defaultState();

    expect(state.workspaces).toHaveLength(1);
    expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);
    expect(state.workspaces[0].spaces).toEqual([{ id: "workspace", title: "📝 便签", lines: [] }]);
    expect(state.workspaces[0].todoLists.map((list) => list.id)).toEqual(["morning"]);
  });

  it("把旧扁平数据迁移进单个工作空间", () => {
    const state = normalizeImportedState({
      language: "en",
      note: "idea",
      images: [{ id: "img-1", createdAt: 1 }],
      todos: { morning: [{ id: "a", text: "A", done: false }] },
    });

    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0].id).toBe("default");
    expect(state.workspaces[0].noteLines).toEqual([{ text: "idea", indent: 0 }]);
    expect(state.workspaces[0].images.map((image) => image.id)).toEqual(["img-1"]);
    expect(state.workspaces[0].todos.morning.map((todo) => todo.text)).toEqual(["A"]);
    expect(state.activeWorkspaceId).toBe("default");
  });

  it("规范化多工作空间结构并回退非法 activeWorkspaceId", () => {
    const state = normalizeImportedState({
      workspaces: [
        { id: "ws-a", customTitles: { "board-title": "A" }, noteLines: [{ text: "a", indent: 0 }] },
        { id: "ws-a", customTitles: { "board-title": "重复" } },
      ],
      activeWorkspaceId: "missing",
    });

    expect(state.workspaces).toHaveLength(2);
    expect(state.workspaces[0].id).toBe("ws-a");
    expect(state.workspaces[1].id).not.toBe("ws-a");
    expect(state.activeWorkspaceId).toBe("ws-a");
    expect(state.workspaces[0].customTitles["board-title"]).toBe("A");
  });

  it("序列化时为每个工作空间剥离图片 payload", () => {
    const state: BoardState = {
      ...defaultState(),
      workspaces: [
        {
          ...defaultWorkspace("ws-1"),
          images: [{ id: "img-1", src: "data:image/png;base64,abc", createdAt: 1 }],
        },
      ],
    };

    const stored = getSerializableState(state);
    expect(stored.workspaces[0].images).toEqual([{ id: "img-1", createdAt: 1 }]);
    expect(getSerializableState(state, { includeImageData: true }).workspaces[0].images[0]).toMatchObject({
      id: "img-1",
      src: "data:image/png;base64,abc",
    });
  });

  it("跨标签把图片新增合并进同一个工作空间（按 id 定位）", () => {
    const storage = localStorage;
    storage.clear();
    const latest = normalizeImportedState({
      sync: { revision: 2, updatedAt: 20, clientId: "tab-a" },
      workspaces: [
        { id: "ws-a", images: [{ id: "a-img", createdAt: 1 }] },
        { id: "ws-b", images: [] },
      ],
      activeWorkspaceId: "ws-a",
    });
    const staleWithImage = normalizeImportedState({
      sync: { revision: 1, updatedAt: 10, clientId: "tab-b" },
      workspaces: [
        { id: "ws-a", images: [{ id: "a-img", createdAt: 1 }] },
        { id: "ws-b", images: [{ id: "b-img", src: "data:image/png;base64,b", createdAt: 2 }] },
      ],
      activeWorkspaceId: "ws-b",
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
    const storedA = stored.workspaces.find((w) => w.id === "ws-a")!;
    const storedB = stored.workspaces.find((w) => w.id === "ws-b")!;
    expect(storedA.images.map((image) => image.id)).toEqual(["a-img"]);
    expect(storedB.images.map((image) => image.id)).toEqual(["b-img"]);
  });

  it("normalizeImportedState 接受多工作空间全量结构", () => {
    const state = normalizeImportedState({
      language: "en",
      workspaces: [
        { id: "a", customTitles: { "board-title": "A" } },
        { id: "b", customTitles: { "board-title": "B" } },
      ],
      activeWorkspaceId: "b",
    });
    expect(state.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
    expect(state.activeWorkspaceId).toBe("b");
    expect(state.language).toBe("en");
  });

  it("normalizeWorkspaceData 解析单空间信封里的 workspace", () => {
    const workspace = normalizeWorkspaceData(
      { id: "x", customTitles: { "board-title": "导入空间" }, noteLines: [{ text: "n", indent: 0 }] },
      "zh",
    );
    expect(workspace.customTitles["board-title"]).toBe("导入空间");
    expect(workspace.noteLines).toEqual([{ text: "n", indent: 0 }]);
    expect(workspace.id).toBe("x");
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
    const ws = () => state.workspaces[0];

    const reordered = assignTodoListColumn(ws().todoLists, "c", 0, "a", true);
    const removed = removeTodoListData(ws().todos, ws().showCompletedTodos, "b");

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

  it("auto-distributes todo lists across columns column-major (balanced)", () => {
    const ids = (lists: { id: string }[]) => lists.map((list) => list.id);
    const columnsOf = (lists: { id: string; column: number }[]) =>
      lists.reduce<Record<string, number>>((acc, list) => ({ ...acc, [list.id]: list.column }), {});

    // 8 lists → 4 columns of 2
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, title: `L${i}`, collapsed: false, compact: false }));
    expect(columnsOf(distributeTodoListColumns(eight, 4) as { id: string; column: number }[])).toEqual({
      l0: 0, l1: 0, l2: 1, l3: 1, l4: 2, l5: 2, l6: 3, l7: 3,
    });
    expect(ids(distributeTodoListColumns(eight, 4))).toEqual(["l0", "l1", "l2", "l3", "l4", "l5", "l6", "l7"]);

    // 7 lists → 3 columns: 3/2/2 (left-biased balanced — the left column is
    // never shorter than the right, and no trailing column is left near-empty)
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, title: `L${i}`, collapsed: false, compact: false }));
    expect(columnsOf(distributeTodoListColumns(seven, 3) as { id: string; column: number }[])).toEqual({
      l0: 0, l1: 0, l2: 0, l3: 1, l4: 1, l5: 2, l6: 2,
    });

    // 4 lists → 3 columns: 2/1/1 (remainder goes to the leftmost column so the
    // rightmost column is never empty, and the left column stays ahead)
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, title: `L${i}`, collapsed: false, compact: false }));
    expect(columnsOf(distributeTodoListColumns(four, 3) as { id: string; column: number }[])).toEqual({
      l0: 0, l1: 0, l2: 1, l3: 2,
    });

    // 1 column → everything in column 0
    expect(columnsOf(distributeTodoListColumns(eight, 1) as { id: string; column: number }[])).toEqual({
      l0: 0, l1: 0, l2: 0, l3: 0, l4: 0, l5: 0, l6: 0, l7: 0,
    });
  });

  it("assigns a dragged todo list into a target column before its anchor list", () => {
    const lists = [
      { id: "a", title: "A", collapsed: false, compact: false, column: 0 },
      { id: "b", title: "B", collapsed: false, compact: false, column: 0 },
      { id: "c", title: "C", collapsed: false, compact: false, column: 1 },
      { id: "d", title: "D", collapsed: false, compact: false, column: 1 },
    ];

    // Drop "a" onto "c" → joins column 1, placed right before "c".
    const onto = assignTodoListColumn(lists, "a", 1, "c", true);
    expect(onto.map((list) => list.id)).toEqual(["b", "a", "c", "d"]);
    expect(onto.map((l) => ({ id: l.id, column: l.column }))).toEqual([
      { id: "b", column: 0 },
      { id: "a", column: 1 },
      { id: "c", column: 1 },
      { id: "d", column: 1 },
    ]);
  });

  it("appends a dragged todo list to a column when dropped into its blank space", () => {
    const lists = [
      { id: "a", title: "A", collapsed: false, compact: false, column: 0 },
      { id: "b", title: "B", collapsed: false, compact: false, column: 0 },
      { id: "c", title: "C", collapsed: false, compact: false, column: 1 },
    ];

    // Drop "a" into column 1's blank space → appended after column 1's last list.
    const moved = assignTodoListColumn(lists, "a", 1, null, false);
    expect(moved.map((l) => ({ id: l.id, column: l.column }))).toEqual([
      { id: "b", column: 0 },
      { id: "c", column: 1 },
      { id: "a", column: 1 },
    ]);
  });

  it("leaves a todo list unchanged when assigning it below itself or onto a missing dragged id", () => {
    const lists = [
      { id: "a", title: "A", collapsed: false, compact: false, column: 0 },
      { id: "b", title: "B", collapsed: false, compact: false, column: 1 },
      { id: "c", title: "C", collapsed: false, compact: false, column: 1 },
    ];

    expect(assignTodoListColumn(lists, "missing", 1, null, false).map((l) => l.id)).toEqual(["a", "b", "c"]);
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
    state.workspaces[0].todos.morning = [{ id: "a", text: "重点", done: false }];

    const starred = starTodo(state.workspaces[0].todos, "morning", "a", true);
    expect(starred.morning[0]).toMatchObject({ starred: true });
    expect(starred.morning[0]).not.toHaveProperty("notifyAt");

    const missingDeadline = starTodo(starred, "morning", "a", true);
    expect(missingDeadline.morning[0]).toMatchObject({ starred: true });

    const unstarred = starTodo(starred, "morning", "a", false);
    expect(unstarred.morning[0]).toMatchObject({ starred: false });
  });

  it("inserts a new open todo before completed todos to avoid visual reordering", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [
      { id: "done", text: "已完成", done: true },
    ];

    const next = addTodo(state.workspaces[0].todos, "morning", { id: "blank", text: "", done: false });

    expect(next.morning.map((todo) => todo.id)).toEqual(["blank", "done"]);
    expect(getOrderedTodos(next.morning).map((todo) => todo.id)).toEqual(["blank", "done"]);
  });

  it("inserts a blank-space todo after existing open todos even when completed todos were stored first", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [
      { id: "done", text: "已完成", done: true },
      { id: "open", text: "未完成", done: false },
    ];

    const next = addTodo(state.workspaces[0].todos, "morning", { id: "blank", text: "", done: false });

    expect(next.morning.map((todo) => todo.id)).toEqual(["done", "open", "blank"]);
    expect(getOrderedTodos(next.morning).map((todo) => todo.id)).toEqual(["open", "blank", "done"]);
  });

  it("moves todos across periods and can mark completion", () => {
    const state = defaultState();
    state.workspaces[0].todos.morning = [
      { id: "a", text: "Alpha", done: false },
      { id: "b", text: "Beta", done: false },
    ];
    state.workspaces[0].todos.noon = [{ id: "c", text: "Gamma", done: false }];

    const moved = moveTodo(state.workspaces[0].todos, "morning", "b", "noon", "c");
    const completed = completeTodo(moved, "noon", "b", true);

    expect(completed.morning.map((todo) => todo.id)).toEqual(["a"]);
    expect(completed.noon.map((todo) => todo.id)).toEqual(["b", "c"]);
    expect(completed.noon[0].done).toBe(true);
  });
});

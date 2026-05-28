import { DEFAULT_SPACE_ID, DEFAULT_SPACE_TITLE, DEFAULT_TODO_LISTS, defaultState, STORAGE_KEY } from "./defaults";
import { isValidDeadlineAt } from "./deadlines";
import { normalizeCompanionGifTheme } from "./companionGifThemes";
import { DEFAULT_SPACE_TITLES, getUiText, normalizeLanguage } from "./i18n";
import type {
  BoardState,
  CompanionCustomGif,
  LineItem,
  QuickButton,
  QuickButtonType,
  SerializableOptions,
  StoredImage,
  TodoCompletedVisibility,
  TodoItem,
  TodoListConfig,
  TodoMap,
  WorkspaceSpace,
} from "../types";

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadState(storage: Storage = localStorage): BoardState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeImportedState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function saveState(state: BoardState, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(getSerializableState(state)));
}

export function getSerializableState(
  state: BoardState,
  options: SerializableOptions = {},
): BoardState {
  const todoLists = cloneTodoLists(state.todoLists);

  return {
    ...state,
    customCompanionGif: cloneCustomCompanionGif(state.customCompanionGif),
    images: state.images.map((image) => {
      if (options.includeImageData) return { ...image };
      return {
        id: image.id,
        createdAt: image.createdAt,
      };
    }),
    todoLists,
    showCompletedTodos: cloneCompletedVisibility(state.showCompletedTodos, todoLists),
    todos: cloneTodos(state.todos, todoLists),
    noteLines: cloneLines(state.noteLines),
    workspaceLines: cloneLines(state.workspaceLines),
    storageLines: cloneLines(state.storageLines),
    spaces: cloneSpaces(state.spaces),
    activeSpaceId: state.spaces.some((space) => space.id === state.activeSpaceId)
      ? state.activeSpaceId
      : state.spaces[0]?.id ?? DEFAULT_SPACE_ID,
    quickButtons: state.quickButtons.map((button) => ({ ...button })),
    customTitles: { ...state.customTitles },
  };
}

export function exportJsonState(state: BoardState): string {
  return JSON.stringify(getSerializableState(state, { includeImageData: true }), null, 2);
}

export function normalizeImportedState(payload: unknown): BoardState {
  const source = isPlainObject(payload) ? payload : {};
  const base = defaultState();
  const typed = source as Record<string, unknown>;
  const customTitles = normalizeStringRecord(typed.customTitles);
  const noteLines = normalizeLineCollection(typed.noteLines ?? typed.note);
  const workspaceLines = normalizeLineCollection(typed.workspaceLines ?? typed.workspace);
  const storageLines = normalizeLineCollection(typed.storageLines ?? typed.storage);
  const spaces = normalizeSpaces(typed.spaces, workspaceLines, storageLines, customTitles);
  const todoLists = normalizeTodoLists(typed.todoLists, customTitles);
  const language = normalizeLanguage(typed.language);

  return {
    ...base,
    language,
    theme: typed.theme === "dark" ? "dark" : "light",
    companionGifTheme: normalizeCompanionGifTheme(typed.companionGifTheme),
    customCompanionGif: normalizeCustomCompanionGif(typed.customCompanionGif),
    customTitles,
    noteLines,
    workspaceLines,
    storageLines,
    spaces,
    activeSpaceId: normalizeActiveSpaceId(typed.activeSpaceId, spaces),
    images: normalizeImages(typed.images),
    quickButtons: normalizeQuickButtons(typed.quickButtons, language),
    showHiddenQuickButtons: Boolean(typed.showHiddenQuickButtons),
    todoLists,
    showCompletedTodos: normalizeCompletedVisibility(typed.showCompletedTodos, todoLists),
    todos: normalizeTodos(typed.todos, todoLists),
  };
}

const LEGACY_TODO_TITLE_IDS: Record<string, string> = {
  morning: "todo-morning-title",
  noon: "todo-noon-title",
  evening: "todo-evening-title",
};

function normalizeTodoLists(value: unknown, customTitles: Record<string, string>): TodoListConfig[] {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const lists = value
      .map((item) => normalizeTodoListConfig(item))
      .filter((item): item is TodoListConfig => Boolean(item))
      .map((list) => {
        let id = list.id;
        while (seen.has(id)) id = createId();
        seen.add(id);
        return { ...list, id };
      });
    if (lists.length > 0) return lists;
  }

  return DEFAULT_TODO_LISTS.map((list) => ({
    ...list,
    title: customTitles[LEGACY_TODO_TITLE_IDS[list.id] ?? ""] || list.title,
  }));
}

function normalizeTodoListConfig(item: unknown): TodoListConfig | null {
  if (!isPlainObject(item)) return null;
  const record = item as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  const title = typeof record.title === "string" && record.title.trim()
    ? record.title.trim()
    : getUiText("zh").app.unnamedList;
  return {
    id: record.id.trim(),
    title,
    collapsed: Boolean(record.collapsed),
    compact: Boolean(record.compact),
  };
}

function normalizeCompletedVisibility(value: unknown, todoLists: TodoListConfig[]): TodoCompletedVisibility {
  if (typeof value === "boolean") {
    return Object.fromEntries(todoLists.map((list) => [list.id, value])) as TodoCompletedVisibility;
  }
  if (!isPlainObject(value)) {
    return Object.fromEntries(todoLists.map((list) => [list.id, false])) as TodoCompletedVisibility;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    todoLists.map((list) => [list.id, Boolean(record[list.id])]),
  ) as TodoCompletedVisibility;
}

export function normalizeSpaces(
  spaces: unknown,
  legacyWorkspaceLines: LineItem[] = [],
  legacyStorageLines: LineItem[] = [],
  customTitles: Record<string, string> = {},
): WorkspaceSpace[] {
  if (Array.isArray(spaces)) {
    const seen = new Set<string>();
    const normalized = spaces
      .map((item) => normalizeSpace(item))
      .filter((item): item is WorkspaceSpace => Boolean(item))
      .map((space) => {
        let id = space.id;
        while (seen.has(id)) id = createId();
        seen.add(id);
        return { ...space, id };
      });
    if (normalized.length > 0) return normalized;
  }

  const result: WorkspaceSpace[] = [
    {
      id: DEFAULT_SPACE_ID,
      title: customTitles["workspace-title"] || DEFAULT_SPACE_TITLE,
      lines: cloneLines(legacyWorkspaceLines),
    },
  ];
  if (legacyStorageLines.length > 0) {
    result.push({
      id: "storage",
      title: customTitles["storage-title"] || DEFAULT_SPACE_TITLES.zh.storage,
      lines: cloneLines(legacyStorageLines),
    });
  }
  return result;
}

function normalizeSpace(item: unknown): WorkspaceSpace | null {
  if (!isPlainObject(item)) return null;
  const record = item as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id : createId();
  const title = typeof record.title === "string" && record.title.trim()
    ? record.title.trim()
    : DEFAULT_SPACE_TITLE;
  return {
    id,
    title,
    lines: normalizeLineCollection(record.lines),
  };
}

function normalizeActiveSpaceId(value: unknown, spaces: WorkspaceSpace[]): string {
  const fallback = spaces[0]?.id ?? DEFAULT_SPACE_ID;
  return typeof value === "string" && spaces.some((space) => space.id === value) ? value : fallback;
}

export function normalizeLineCollection(value: unknown): LineItem[] {
  if (typeof value === "string") return serializeTextLines(value);
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        const [line] = serializeTextLines(item);
        return line;
      }
      if (!isPlainObject(item)) return null;
      const record = item as Record<string, unknown>;
      return {
        text: typeof record.text === "string" ? record.text : "",
        indent: clampInteger(record.indent, 0, 12),
      };
    })
    .filter((item): item is LineItem => Boolean(item));
}

export function serializeTextLines(value = ""): LineItem[] {
  if (!value) return [];
  return value.split("\n").map((line) => {
    const tabs = line.match(/^\t*/)?.[0].length ?? 0;
    return {
      text: line.slice(tabs),
      indent: tabs,
    };
  });
}

export function textLinesToText(lines: LineItem[]): string {
  return lines.map((line) => `${"\t".repeat(line.indent)}${line.text}`).join("\n");
}

export function normalizeImages(images: unknown): StoredImage[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => {
      if (!isPlainObject(item)) return null;
      const record = item as Record<string, unknown>;
      const image: StoredImage = {
        id: typeof record.id === "string" ? record.id : createId(),
        createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      };
      if (typeof record.src === "string") image.src = record.src;
      return image;
    })
    .filter((item): item is StoredImage => Boolean(item));
}

export function normalizeQuickButtons(buttons: unknown, language = "zh"): QuickButton[] {
  if (!Array.isArray(buttons)) return [];
  return buttons
    .map((item) => {
      if (!isPlainObject(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const value = typeof record.value === "string" ? record.value : "";
      const type: QuickButtonType = record.type === "text" ? "text" : "link";
      if (!title && !value) return null;
      return {
        id: typeof record.id === "string" ? record.id : createId(),
        title: title || (type === "link" ? getUiText(normalizeLanguage(language)).quick.untitledLink : getUiText(normalizeLanguage(language)).quick.untitledText),
        value,
        type,
        hidden: Boolean(record.hidden),
      };
    })
    .filter((item): item is QuickButton => Boolean(item));
}

export function normalizeTodos(todos: unknown, todoLists: TodoListConfig[] = DEFAULT_TODO_LISTS): TodoMap {
  const result = Object.fromEntries(todoLists.map((list) => [list.id, []])) as TodoMap;
  if (!isPlainObject(todos)) return result;
  const record = todos as Record<string, unknown>;

  todoLists.forEach((list) => {
    const items = record[list.id];
    result[list.id] = Array.isArray(items)
      ? items
          .map((item) => normalizeTodo(item))
          .filter((item): item is TodoItem => Boolean(item))
      : [];
  });

  return result;
}

function normalizeTodo(item: unknown): TodoItem | null {
  if (!isPlainObject(item)) return null;
  const record = item as Record<string, unknown>;
  const starred = Boolean(record.starred);
  const todo: TodoItem = {
    id: typeof record.id === "string" ? record.id : createId(),
    text: typeof record.text === "string" ? record.text : "",
    done: Boolean(record.done),
    starred,
  };
  const notifyAt = isValidDeadlineAt(record.notifyAt)
    ? record.notifyAt
    : isValidDeadlineAt(record.deadlineAt)
      ? record.deadlineAt
      : undefined;
  if (isValidDeadlineAt(notifyAt)) {
    todo.notifyAt = notifyAt;
  }
  return todo;
}

function normalizeCustomCompanionGif(value: unknown): CompanionCustomGif {
  if (!isPlainObject(value)) return {};
  const record = value as Record<string, unknown>;
  const light = normalizeGifDataUrl(record.light);
  const dark = normalizeGifDataUrl(record.dark);
  return {
    ...(light ? { light } : {}),
    ...(dark ? { dark } : {}),
  };
}

function normalizeGifDataUrl(value: unknown): string | undefined {
  return typeof value === "string" && /^data:image\/gif(?:;[^,]*)?,/i.test(value) ? value : undefined;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function cloneTodoLists(todoLists: TodoListConfig[]): TodoListConfig[] {
  return todoLists.map((list) => ({ ...list }));
}

function cloneCompletedVisibility(
  visibility: TodoCompletedVisibility,
  todoLists: TodoListConfig[],
): TodoCompletedVisibility {
  return Object.fromEntries(
    todoLists.map((list) => [list.id, Boolean(visibility[list.id])]),
  ) as TodoCompletedVisibility;
}

function cloneTodos(todos: TodoMap, todoLists: TodoListConfig[]): TodoMap {
  return Object.fromEntries(
    todoLists.map((list) => [list.id, (todos[list.id] ?? []).map(cloneTodo)]),
  ) as TodoMap;
}

function cloneTodo(todo: TodoItem): TodoItem {
  const next: TodoItem = { ...todo };
  delete next.deadlineAt;
  if (!isValidDeadlineAt(next.notifyAt)) delete next.notifyAt;
  return next;
}

function cloneCustomCompanionGif(value: CompanionCustomGif | undefined): CompanionCustomGif {
  return {
    ...(value?.light ? { light: value.light } : {}),
    ...(value?.dark ? { dark: value.dark } : {}),
  };
}

function cloneLines(lines: LineItem[]): LineItem[] {
  return lines.map((line) => ({ ...line }));
}

function cloneSpaces(spaces: WorkspaceSpace[]): WorkspaceSpace[] {
  return spaces.map((space) => ({
    ...space,
    lines: cloneLines(space.lines),
  }));
}

function clampInteger(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

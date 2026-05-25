import { DEFAULT_SPACE_ID, DEFAULT_SPACE_TITLE, defaultState, STORAGE_KEY, TODO_PERIODS } from "./defaults";
import { isValidDeadlineAt } from "./deadlines";
import type {
  BoardState,
  LineItem,
  QuickButton,
  QuickButtonType,
  SerializableOptions,
  StoredImage,
  TodoCompletedVisibility,
  TodoItem,
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
  return {
    ...state,
    images: state.images.map((image) => {
      if (options.includeImageData) return { ...image };
      return {
        id: image.id,
        createdAt: image.createdAt,
      };
    }),
    todos: cloneTodos(state.todos),
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

  return {
    ...base,
    theme: typed.theme === "dark" ? "dark" : "light",
    customTitles,
    noteLines,
    workspaceLines,
    storageLines,
    spaces,
    activeSpaceId: normalizeActiveSpaceId(typed.activeSpaceId, spaces),
    images: normalizeImages(typed.images),
    quickButtons: normalizeQuickButtons(typed.quickButtons),
    showHiddenQuickButtons: Boolean(typed.showHiddenQuickButtons),
    showCompletedTodos: normalizeCompletedVisibility(typed.showCompletedTodos),
    todos: normalizeTodos(typed.todos),
  };
}

function normalizeCompletedVisibility(value: unknown): TodoCompletedVisibility {
  if (typeof value === "boolean") {
    return {
      morning: value,
      noon: value,
      evening: value,
    };
  }
  if (!isPlainObject(value)) return { ...defaultState().showCompletedTodos };
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    TODO_PERIODS.map((period) => [period, Boolean(record[period])]),
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
      title: customTitles["storage-title"] || "工程文件",
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

export function normalizeQuickButtons(buttons: unknown): QuickButton[] {
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
        title: title || (type === "link" ? "未命名链接" : "未命名文本"),
        value,
        type,
        hidden: Boolean(record.hidden),
      };
    })
    .filter((item): item is QuickButton => Boolean(item));
}

export function normalizeTodos(todos: unknown): TodoMap {
  const result = defaultState().todos;
  if (!isPlainObject(todos)) return result;
  const record = todos as Record<string, unknown>;

  TODO_PERIODS.forEach((period) => {
    const items = record[period];
    result[period] = Array.isArray(items)
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

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function cloneTodos(todos: TodoMap): TodoMap {
  return {
    morning: todos.morning.map(cloneTodo),
    noon: todos.noon.map(cloneTodo),
    evening: todos.evening.map(cloneTodo),
  };
}

function cloneTodo(todo: TodoItem): TodoItem {
  const next: TodoItem = { ...todo };
  delete next.deadlineAt;
  if (!isValidDeadlineAt(next.notifyAt)) delete next.notifyAt;
  return next;
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

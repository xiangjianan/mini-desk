import { defaultState, STORAGE_KEY, TODO_PERIODS } from "./defaults";
import type {
  BoardState,
  LineItem,
  QuickButton,
  QuickButtonType,
  SerializableOptions,
  StoredImage,
  TodoItem,
  TodoMap,
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

  return {
    ...base,
    theme: typed.theme === "dark" ? "dark" : "light",
    customTitles: normalizeStringRecord(typed.customTitles),
    noteLines: normalizeLineCollection(typed.noteLines ?? typed.note),
    workspaceLines: normalizeLineCollection(typed.workspaceLines ?? typed.workspace),
    storageLines: normalizeLineCollection(typed.storageLines ?? typed.storage),
    images: normalizeImages(typed.images),
    quickButtons: normalizeQuickButtons(typed.quickButtons),
    showHiddenQuickButtons: Boolean(typed.showHiddenQuickButtons),
    todos: normalizeTodos(typed.todos),
  };
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
  return {
    id: typeof record.id === "string" ? record.id : createId(),
    text: typeof record.text === "string" ? record.text : "",
    done: Boolean(record.done),
  };
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
    morning: todos.morning.map((todo) => ({ ...todo })),
    noon: todos.noon.map((todo) => ({ ...todo })),
    evening: todos.evening.map((todo) => ({ ...todo })),
  };
}

function cloneLines(lines: LineItem[]): LineItem[] {
  return lines.map((line) => ({ ...line }));
}

function clampInteger(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

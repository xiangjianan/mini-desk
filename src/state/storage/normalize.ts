import { DEFAULT_SPACE_ID, DEFAULT_SPACE_TITLE, DEFAULT_TODO_LISTS, DEFAULT_WORKSPACE_ID, defaultWorkspace } from "../defaults";
import { isValidDeadlineAt } from "../deadlines";
import { normalizeCompanionGifTheme } from "../companionGifThemes";
import { getQuickTagColor, normalizeQuickTagColor } from "../quickButtons";
import { isQuickAppScheme } from "../quickApps";
import { DEFAULT_LANGUAGE, DEFAULT_SPACE_TITLES, DEFAULT_TITLES_BY_LANGUAGE, LEGACY_DEFAULT_TITLES_BY_LANGUAGE, OLDER_LEGACY_DEFAULT_TITLES_BY_LANGUAGE, getLegacyDefaultTodoLists, getUiText, normalizeLanguage } from "../i18n";
import type {
  AppLanguage,
  BoardState,
  CompanionCustomGif,
  CompanionCustomGifStored,
  LineItem,
  QuickApiBodyType,
  QuickApiHeader,
  QuickApiMethod,
  QuickButton,
  QuickButtonType,
  QuickTag,
  StoredImage,
  ThemeMode,
  TodoCompletedVisibility,
  TodoItem,
  TodoListConfig,
  TodoMap,
  WorkspaceData,
  WorkspaceSpace,
  ZoneVisibility,
} from "../../types";
import { clampInteger, createId, isPlainObject, normalizeSyncState } from "./shared";
import { cloneLines, serializeTextLines } from "./serialize";

export function normalizeImportedState(payload: unknown): BoardState {
  const source = isPlainObject(payload) ? payload : {};
  const typed = source as Record<string, unknown>;
  const language = normalizeLanguage(typed.language);

  // The zone-visibility preference was previously a single global field on the
  // board state. It now lives per-workspace, so seed every workspace from the
  // legacy global value (defaulting to all-visible) to preserve the user's
  // existing layout on load.
  const legacyGlobalVisibility = normalizeZoneVisibility(typed.zoneVisibility);

  const shared = {
    sync: normalizeSyncState(typed.sync),
    language,
    theme: (typed.theme === "dark" ? "dark" : "light") as ThemeMode,
    companionGifTheme: normalizeCompanionGifTheme(typed.companionGifTheme),
    customCompanionGif: normalizeCustomCompanionGif(typed.customCompanionGif),
    customCompanionGifStored: normalizeCustomCompanionGifStored(typed.customCompanionGifStored, typed.customCompanionGif),
  };

  if (Array.isArray(typed.workspaces)) {
    const workspaces = normalizeWorkspaceList(typed.workspaces, language, legacyGlobalVisibility);
    return {
      ...shared,
      workspaces,
      activeWorkspaceId: normalizeActiveWorkspaceId(typed.activeWorkspaceId, workspaces),
    };
  }

  const workspace = normalizeLegacyWorkspace(typed, language, legacyGlobalVisibility);
  return {
    ...shared,
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
  };
}

export function normalizeWorkspaceData(item: unknown, language: AppLanguage = DEFAULT_LANGUAGE, fallbackVisibility?: ZoneVisibility): WorkspaceData {
  const typed = isPlainObject(item) ? (item as Record<string, unknown>) : {};
  const customTitles = normalizeCustomTitles(typed.customTitles);
  const noteLines = normalizeLineCollection(typed.noteLines ?? typed.note);
  const workspaceLines = normalizeLineCollection(typed.workspaceLines ?? typed.workspace);
  const storageLines = normalizeLineCollection(typed.storageLines ?? typed.storage);
  const spaces = normalizeSpaces(typed.spaces, workspaceLines, storageLines, customTitles);
  const todoLists = normalizeTodoLists(typed.todoLists, customTitles, typed.todos, typed.showCompletedTodos);
  const quickTags = normalizeQuickTags(typed.quickTags);
  const id = typeof typed.id === "string" && typed.id.trim() ? typed.id.trim() : createId();
  const createdAt = typeof typed.createdAt === "number" && Number.isFinite(typed.createdAt) ? typed.createdAt : 0;
  return {
    id,
    createdAt,
    customTitles,
    noteLines,
    workspaceLines,
    storageLines,
    spaces,
    activeSpaceId: normalizeActiveSpaceId(typed.activeSpaceId, spaces),
    images: normalizeImages(typed.images),
    quickTags,
    quickButtons: normalizeQuickButtons(typed.quickButtons, language, quickTags),
    quickOtherCollapsed: Boolean(typed.quickOtherCollapsed),
    showHiddenQuickButtons: Boolean(typed.showHiddenQuickButtons),
    todoLayoutManual: Boolean(typed.todoLayoutManual),
    todoLists,
    showCompletedTodos: normalizeCompletedVisibility(typed.showCompletedTodos, todoLists),
    todos: normalizeTodos(typed.todos, todoLists),
    zoneVisibility: normalizeZoneVisibility(typed.zoneVisibility ?? fallbackVisibility),
  };
}

function normalizeWorkspaceList(value: unknown, language: AppLanguage, fallbackVisibility?: ZoneVisibility): WorkspaceData[] {
  if (!Array.isArray(value)) return [defaultWorkspace()];
  const seen = new Set<string>();
  const workspaces = value
    .map((item) => normalizeWorkspaceData(item, language, fallbackVisibility))
    .map((workspace) => {
      let id = workspace.id;
      while (seen.has(id)) id = createId();
      seen.add(id);
      return { ...workspace, id };
    });
  return workspaces.length > 0 ? workspaces : [defaultWorkspace()];
}

function normalizeLegacyWorkspace(typed: Record<string, unknown>, language: AppLanguage, fallbackVisibility?: ZoneVisibility): WorkspaceData {
  const workspace = normalizeWorkspaceData(typed, language, fallbackVisibility);
  const sync = isPlainObject(typed.sync) ? (typed.sync as Record<string, unknown>) : {};
  const updatedAt = typeof sync.updatedAt === "number" && Number.isFinite(sync.updatedAt) ? sync.updatedAt : 0;
  return { ...workspace, id: DEFAULT_WORKSPACE_ID, createdAt: updatedAt };
}

export const LEGACY_TODO_TITLE_IDS: Record<string, string> = {
  morning: "todo-morning-title",
  noon: "todo-noon-title",
  evening: "todo-evening-title",
};

export function normalizeTodoLists(
  value: unknown,
  customTitles: Record<string, string>,
  legacyTodos?: unknown,
  legacyCompletedVisibility?: unknown,
): TodoListConfig[] {
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

  const fallbackLists = hasLegacyTodoListState(customTitles, legacyTodos, legacyCompletedVisibility)
    ? getLegacyDefaultTodoLists()
    : DEFAULT_TODO_LISTS;
  return fallbackLists.map((list) => ({
    ...list,
    title: customTitles[LEGACY_TODO_TITLE_IDS[list.id] ?? ""] || list.title,
  }));
}

export function hasLegacyTodoListState(
  customTitles: Record<string, string>,
  todos: unknown,
  completedVisibility: unknown,
): boolean {
  const legacyIds = ["noon", "evening"];
  if (legacyIds.some((id) => customTitles[LEGACY_TODO_TITLE_IDS[id]])) return true;
  if (isPlainObject(todos)) {
    const record = todos as Record<string, unknown>;
    if (legacyIds.some((id) => Array.isArray(record[id]) && record[id].length > 0)) return true;
  }
  if (isPlainObject(completedVisibility)) {
    const record = completedVisibility as Record<string, unknown>;
    if (legacyIds.some((id) => record[id] === true)) return true;
  }
  return false;
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
    // Numeric guard (not Boolean): column 0 is valid and falsy.
    column: typeof record.column === "number" && Number.isFinite(record.column) ? Math.max(0, Math.floor(record.column)) : 0,
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
    todoLists.map((list) => [list.id, list.id in record ? Boolean(record[list.id]) : false]),
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

function normalizeActiveWorkspaceId(value: unknown, workspaces: WorkspaceData[]): string {
  const fallback = workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID;
  return typeof value === "string" && workspaces.some((workspace) => workspace.id === value) ? value : fallback;
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
      if (typeof record.payloadId === "string" && record.payloadId.trim()) image.payloadId = record.payloadId.trim();
      if (typeof record.src === "string") image.src = record.src;
      const displayWidth = normalizeImageDisplayDimension(record.displayWidth);
      const displayHeight = normalizeImageDisplayDimension(record.displayHeight);
      if (displayWidth) image.displayWidth = displayWidth;
      if (displayHeight) image.displayHeight = displayHeight;
      return image;
    })
    .filter((item): item is StoredImage => Boolean(item));
}

function normalizeImageDisplayDimension(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(1, Math.round(value));
}

export function normalizeQuickTags(tags: unknown): QuickTag[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  return tags
    .map((item, index): QuickTag | null => {
      if (!isPlainObject(item)) return null;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!id || !title || seen.has(id)) return null;
      seen.add(id);
      const color = normalizeQuickTagColor(record.color, getQuickTagColor(index));
      return { id, title, color, ...(record.collapsed === true ? { collapsed: true } : {}) };
    })
    .filter((item): item is QuickTag => item !== null);
}

export function normalizeQuickButtons(buttons: unknown, language = "zh", quickTags: QuickTag[] = []): QuickButton[] {
  if (!Array.isArray(buttons)) return [];
  const validTagIds = new Set(quickTags.map((tag) => tag.id));
  return buttons
    .map((item) => {
      if (!isPlainObject(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const value = typeof record.value === "string" ? record.value : "";
      const type: QuickButtonType = record.type === "text" ? "text" : record.type === "api" ? "api" : record.type === "app" ? "app" : "link";
      // Imported "app" buttons may carry script-executing schemes (javascript:,
      // data:, ...) planted by a malicious workspace file — drop them at the
      // normalization boundary so they never reach storage.
      if (type === "app" && value && !isQuickAppScheme(value)) return null;
      const apiMethod = normalizeQuickApiMethod(record.apiMethod);
      const apiBodyType = normalizeQuickApiBodyType(record.apiBodyType);
      if (!title && !value) return null;
      const tagId = typeof record.tagId === "string" && validTagIds.has(record.tagId.trim())
        ? record.tagId.trim()
        : undefined;
      return {
        id: typeof record.id === "string" ? record.id : createId(),
        title: title || getUntitledQuickTitle(type, language),
        value,
        type,
        ...(tagId ? { tagId } : {}),
        ...(type === "api" ? {
          apiMethod,
          apiHeaders: normalizeQuickApiHeaders(record.apiHeaders),
          apiBodyType,
          apiBody: typeof record.apiBody === "string" ? record.apiBody : "",
        } : {}),
        hidden: Boolean(record.hidden),
      };
    })
    .filter((item): item is QuickButton => Boolean(item));
}

function getUntitledQuickTitle(type: QuickButtonType, language: string): string {
  const quickText = getUiText(normalizeLanguage(language)).quick;
  if (type === "link") return quickText.untitledLink;
  if (type === "api") return quickText.untitledApi;
  if (type === "app") return quickText.untitledApp;
  return quickText.untitledText;
}

function normalizeQuickApiMethod(value: unknown): QuickApiMethod {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(String(value))
    ? (value as QuickApiMethod)
    : "GET";
}

function normalizeQuickApiBodyType(value: unknown): QuickApiBodyType {
  return ["none", "json", "text", "form"].includes(String(value))
    ? (value as QuickApiBodyType)
    : "none";
}

function normalizeQuickApiHeaders(value: unknown): QuickApiHeader[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!isPlainObject(item)) return null;
        const record = item as Record<string, unknown>;
        const key = typeof record.key === "string" ? record.key.trim() : "";
        const headerValue = typeof record.value === "string" ? record.value.trim() : "";
        return key ? { key, value: headerValue } : null;
      })
      .filter((item): item is QuickApiHeader => Boolean(item));
  }
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) return null;
      const key = line.slice(0, separatorIndex).trim();
      const headerValue = line.slice(separatorIndex + 1).trim();
      return key ? { key, value: headerValue } : null;
    })
    .filter((item): item is QuickApiHeader => Boolean(item));
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

export function normalizeCustomCompanionGif(value: unknown): CompanionCustomGif {
  if (!isPlainObject(value)) return {};
  const record = value as Record<string, unknown>;
  const light = normalizeGifDataUrl(record.light);
  const dark = normalizeGifDataUrl(record.dark);
  return {
    ...(light ? { light } : {}),
    ...(dark ? { dark } : {}),
  };
}

export function normalizeCustomCompanionGifStored(value: unknown, customCompanionGif: unknown): CompanionCustomGifStored {
  const stored = isPlainObject(value) ? value as Record<string, unknown> : {};
  const custom = normalizeCustomCompanionGif(customCompanionGif);
  return {
    ...((stored.light === true || Boolean(custom.light)) ? { light: true } : {}),
    ...((stored.dark === true || Boolean(custom.dark)) ? { dark: true } : {}),
  };
}

function normalizeGifDataUrl(value: unknown): string | undefined {
  return typeof value === "string" && /^data:image\/gif(?:;[^,]*)?,/i.test(value) ? value : undefined;
}

export function normalizeZoneVisibility(value: unknown): ZoneVisibility {
  const record = isPlainObject(value) ? value as Record<string, unknown> : {};
  return {
    assets: record.assets === false ? false : true,
    notes: record.notes === false ? false : true,
    tasks: record.tasks === false ? false : true,
    workspace: record.workspace === false ? false : true,
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

export function normalizeCustomTitles(value: unknown): Record<string, string> {
  const titles = normalizeStringRecord(value);
  return Object.fromEntries(
    Object.entries(titles).filter(([id, title]) => !isDefaultBoardTitle(id, title)),
  );
}

function isDefaultBoardTitle(id: string, title: string): boolean {
  return [
    ...Object.values(DEFAULT_TITLES_BY_LANGUAGE),
    ...Object.values(LEGACY_DEFAULT_TITLES_BY_LANGUAGE),
    ...Object.values(OLDER_LEGACY_DEFAULT_TITLES_BY_LANGUAGE),
  ].some((titles) => titles[id] === title);
}


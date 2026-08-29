import type { BoardState, TodoListConfig, TodoListId, TodoMap, WorkspaceData, ZoneVisibility } from "../types";
import { DEFAULT_COMPANION_GIF_THEME } from "./companionGifThemes";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_SPACE_TITLES,
  DEFAULT_TITLES_ZH,
  getDefaultTodoLists,
} from "./i18n";

export const STORAGE_KEY = "mini-desk-state-v1";
export const LEGACY_STORAGE_KEY = "todo-board-state-v1";
export const IMAGE_DB_NAME = "mini-desk-images-v1";
export const LEGACY_IMAGE_DB_NAME = "todo-board-images-v1";
export const IMAGE_STORE_NAME = "images";
export const DEFAULT_SPACE_ID = "workspace";
export const DEFAULT_SPACE_TITLE = DEFAULT_SPACE_TITLES.zh.workspace;
export const DEFAULT_WORKSPACE_ID = "default";

export const DEFAULT_BOARD_SLOGAN = "Do less, do it well.";
export const DEFAULT_BOARD_TITLE = "Mini Desk";

/** Every workbench zone visible by default. */
export const DEFAULT_ZONE_VISIBILITY: ZoneVisibility = {
  assets: true,
  notes: true,
  tasks: true,
  workspace: true,
};

export const DEFAULT_TODO_LISTS: TodoListConfig[] = getDefaultTodoLists(DEFAULT_LANGUAGE);

export const DEFAULT_TITLES: Record<string, string> = DEFAULT_TITLES_ZH;

export const GUIDE_MENU_OPTION = { label: "Tips", key: "guide" } as const;

export function defaultWorkspace(id: string = DEFAULT_WORKSPACE_ID): WorkspaceData {
  return {
    id,
    createdAt: 0,
    customTitles: { "board-slogan": DEFAULT_BOARD_SLOGAN },
    noteLines: [],
    workspaceLines: [],
    storageLines: [],
    spaces: [{ id: DEFAULT_SPACE_ID, title: DEFAULT_SPACE_TITLE, lines: [] }],
    activeSpaceId: DEFAULT_SPACE_ID,
    images: [],
    quickTags: [],
    quickButtons: [],
    quickOtherCollapsed: false,
    showHiddenQuickButtons: false,
    todoLayoutManual: false,
    todoLists: cloneDefaultTodoLists(),
    showCompletedTodos: createDefaultCompletedVisibility(),
    todos: createDefaultTodoMap(),
    zoneVisibility: { ...DEFAULT_ZONE_VISIBILITY },
  };
}

export function defaultState(): BoardState {
  return {
    sync: { revision: 0, updatedAt: 0, clientId: "" },
    language: DEFAULT_LANGUAGE,
    theme: "auto",
    companionGifTheme: DEFAULT_COMPANION_GIF_THEME,
    customCompanionGif: {},
    customCompanionGifStored: {},
    workspaces: [defaultWorkspace(DEFAULT_WORKSPACE_ID)],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  };
}

export function cloneDefaultTodoLists(): TodoListConfig[] {
  return DEFAULT_TODO_LISTS.map((list) => ({ ...list }));
}

export function createDefaultCompletedVisibility(): Record<TodoListId, boolean> {
  return Object.fromEntries(DEFAULT_TODO_LISTS.map((list) => [list.id, false]));
}

export function createDefaultTodoMap(): TodoMap {
  return Object.fromEntries(DEFAULT_TODO_LISTS.map((list) => [list.id, []])) as TodoMap;
}

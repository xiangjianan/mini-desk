import type { BoardState, TodoListConfig, TodoListId, TodoMap } from "../types";
import { DEFAULT_COMPANION_GIF_THEME } from "./companionGifThemes";

export const STORAGE_KEY = "todo-board-state-v1";
export const IMAGE_DB_NAME = "todo-board-images-v1";
export const IMAGE_STORE_NAME = "images";
export const DEFAULT_SPACE_ID = "workspace";
export const DEFAULT_SPACE_TITLE = "工作空间";

export const DEFAULT_TODO_LISTS: TodoListConfig[] = [
  { id: "morning", title: "☀️ 早上", collapsed: false, compact: false },
  { id: "noon", title: "🌤️ 中午", collapsed: false, compact: false },
  { id: "evening", title: "🌙 晚上", collapsed: false, compact: false },
];

export const TODO_PERIODS: TodoListId[] = DEFAULT_TODO_LISTS.map((list) => list.id);

export const DEFAULT_TITLES: Record<string, string> = {
  "image-title": "🎨 截图",
  "note-title": "📝 便签",
  "quick-title": "🔗 快捷链接",
  "today-focus-title": "重点事项",
  "todo-morning-title": "☀️ 早上",
  "todo-noon-title": "🌤️ 中午",
  "todo-evening-title": "🌙 晚上",
  "workspace-title": "📁 工作空间",
  "storage-title": "🛠 双击可改名",
};

export const EMPTY_HINTS = {
  images: "Ctrl+V 粘贴截图，可预览整理 (＾▽＾)",
  quickButtons: "常用内容做成按钮，点一下就用 (｡•̀ᴗ-)✧",
  todos: {
    morning: "单击新增提醒 (๑•̀ㅂ•́)و✧",
    noon: "单击新增提醒 (๑•̀ㅂ•́)و✧",
    evening: "单击新增提醒 (๑•̀ㅂ•́)و✧",
  },
};

export const GUIDE_MENU_OPTION = { label: "Tips", key: "guide" } as const;

export const AREA_HELP = {
  images: "截图区：粘贴、预览和整理图片。",
  note: "便签区：先收住临时想法。",
  quickButtons: "快捷区：常用内容一键打开或复制。",
  todos: "提醒区：标题可双击改名。",
  workspace: "工作空间：拆步骤，稳稳推进。",
  storage: "扩展区：放长期保留的内容。",
};

export const CONTROL_HELP = {
  clearCompleted: "清理当前完成项",
  addQuick: "新增快捷内容",
  toggleHiddenQuick: "显示或收起隐藏按钮",
  settings: "打开设置菜单",
  theme: "切换明暗主题",
};

export function defaultState(): BoardState {
  return {
    theme: "light",
    companionGifTheme: DEFAULT_COMPANION_GIF_THEME,
    customCompanionGif: {},
    customTitles: {},
    noteLines: [],
    workspaceLines: [],
    storageLines: [],
    spaces: [{ id: DEFAULT_SPACE_ID, title: DEFAULT_SPACE_TITLE, lines: [] }],
    activeSpaceId: DEFAULT_SPACE_ID,
    images: [],
    quickButtons: [],
    showHiddenQuickButtons: false,
    todoLists: cloneDefaultTodoLists(),
    showCompletedTodos: createDefaultCompletedVisibility(),
    todos: createDefaultTodoMap(),
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

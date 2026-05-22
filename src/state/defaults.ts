import type { BoardState, TodoPeriod } from "../types";

export const STORAGE_KEY = "todo-board-state-v1";
export const IMAGE_DB_NAME = "todo-board-images-v1";
export const IMAGE_STORE_NAME = "images";
export const DEFAULT_SPACE_ID = "workspace";
export const DEFAULT_SPACE_TITLE = "工作空间";

export const TODO_PERIODS: TodoPeriod[] = ["morning", "noon", "evening"];

export const DEFAULT_TITLES: Record<string, string> = {
  "image-title": "🎨 截图",
  "note-title": "📝 便签",
  "quick-title": "🔗 快捷链接",
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
    customTitles: {},
    noteLines: [],
    workspaceLines: [],
    storageLines: [],
    spaces: [{ id: DEFAULT_SPACE_ID, title: DEFAULT_SPACE_TITLE, lines: [] }],
    activeSpaceId: DEFAULT_SPACE_ID,
    images: [],
    quickButtons: [],
    showHiddenQuickButtons: false,
    showCompletedTodos: {
      morning: false,
      noon: false,
      evening: false,
    },
    todos: {
      morning: [],
      noon: [],
      evening: [],
    },
  };
}

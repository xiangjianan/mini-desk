import type { BoardState, TodoPeriod } from "../types";

export const STORAGE_KEY = "todo-board-state-v1";
export const IMAGE_DB_NAME = "todo-board-images-v1";
export const IMAGE_STORE_NAME = "images";

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
  images: "Ctrl+v，把截图或图片粘贴到这里，可预览、复制、拖动排序。",
  quickButtons: "把常用链接或复制文本做成按钮，点击即可复制。",
  todos: {
    morning: "早：放启动任务、晨间提醒和今天最先处理的事项。",
    noon: "中：放午间跟进、临时插入和需要继续推进的事项。",
    evening: "晚：放收尾检查、复盘记录和明天之前要记住的事项。",
  },
};

export const AREA_HELP = {
  images: "截图区：粘贴、预览、复制和拖动整理图片。",
  note: "便签区：记录临时想法、灵感和草稿。",
  quickButtons: "快捷链接区：保存常用链接或可一键复制的文本。",
  todos: "提醒事项区：按早中晚拆分任务，勾选完成后会自动归组。",
  workspace: "工作空间：拆解任务、整理步骤和当前上下文。",
  storage: "扩展记录区：存放需要长期保留的补充内容。",
};

export const CONTROL_HELP = {
  clearCompleted: "清除当前区域已完成事项",
  addQuick: "新增快捷链接或复制文本",
  toggleHiddenQuick: "显示或隐藏已隐藏的快捷按钮",
  settings: "打开数据导入、导出和关于菜单",
  theme: "切换明暗主题",
};

export function defaultState(): BoardState {
  return {
    theme: "light",
    customTitles: {},
    noteLines: [],
    workspaceLines: [],
    storageLines: [],
    images: [],
    quickButtons: [],
    showHiddenQuickButtons: false,
    todos: {
      morning: [],
      noon: [],
      evening: [],
    },
  };
}

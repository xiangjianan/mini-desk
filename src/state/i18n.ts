import type { AppLanguage, GuideKey, TodoListConfig, WorkspaceSpace } from "../types";

export const DEFAULT_LANGUAGE: AppLanguage = "zh";

const DEFAULT_TODO_TITLES: Record<AppLanguage, Record<string, string>> = {
  zh: {
    morning: "☀️ 早上",
    noon: "🌤️ 中午",
    evening: "🌙 晚上",
  },
  en: {
    morning: "☀️ Morning",
    noon: "🌤️ Noon",
    evening: "🌙 Evening",
  },
};

export const DEFAULT_SPACE_TITLES: Record<AppLanguage, Record<string, string>> = {
  zh: {
    workspace: "工作空间",
    storage: "工程文件",
  },
  en: {
    workspace: "Workspace",
    storage: "Project Files",
  },
};

export const DEFAULT_TITLES_BY_LANGUAGE: Record<AppLanguage, Record<string, string>> = {
  zh: {
    "image-title": "🎨 截图",
    "note-title": "📝 便签",
    "quick-title": "🔗 快捷链接",
    "today-focus-title": "重点事项",
    "todo-morning-title": "☀️ 早上",
    "todo-noon-title": "🌤️ 中午",
    "todo-evening-title": "🌙 晚上",
    "workspace-title": "📁 工作空间",
    "storage-title": "🛠 双击可改名",
  },
  en: {
    "image-title": "🎨 Screenshots",
    "note-title": "📝 Notes",
    "quick-title": "🔗 Quick Links",
    "today-focus-title": "Pinned Reminders",
    "todo-morning-title": "☀️ Morning",
    "todo-noon-title": "🌤️ Noon",
    "todo-evening-title": "🌙 Evening",
    "workspace-title": "📁 Workspace",
    "storage-title": "🛠 Double-click to rename",
  },
};

export const DEFAULT_TITLES_ZH = DEFAULT_TITLES_BY_LANGUAGE.zh;

export const EMPTY_HINTS_BY_LANGUAGE = {
  zh: {
    images: "Ctrl+V 粘贴截图，可预览整理 (＾▽＾)",
    quickButtons: "常用内容做成按钮，点一下就用 (｡•̀ᴗ-)✧",
    todos: {
      morning: "单击新增提醒 (๑•̀ㅂ•́)و✧",
      noon: "单击新增提醒 (๑•̀ㅂ•́)و✧",
      evening: "单击新增提醒 (๑•̀ㅂ•́)و✧",
    },
  },
  en: {
    images: "Press Ctrl+V to paste screenshots.",
    quickButtons: "Turn common links or text into buttons.",
    todos: {
      morning: "Click to add a reminder.",
      noon: "Click to add a reminder.",
      evening: "Click to add a reminder.",
    },
  },
};

export const AREA_HELP_BY_LANGUAGE: Record<AppLanguage, Record<"images" | "note" | "quickButtons" | "todos" | "workspace" | "storage", string>> = {
  zh: {
    images: "截图区：粘贴、预览和整理图片。",
    note: "便签区：先收住临时想法。",
    quickButtons: "快捷区：常用内容一键打开或复制。",
    todos: "提醒区：标题可双击改名。",
    workspace: "工作空间：拆步骤，稳稳推进。",
    storage: "扩展区：放长期保留的内容。",
  },
  en: {
    images: "Screenshots: paste, preview, and organize images.",
    note: "Notes: capture temporary thoughts.",
    quickButtons: "Quick Links: open links or copy text.",
    todos: "Reminders: double-click titles to rename.",
    workspace: "Workspace: break work into steps.",
    storage: "Storage: keep long-lived reference material.",
  },
};

export const CONTROL_HELP_BY_LANGUAGE: Record<AppLanguage, Record<"clearCompleted" | "addQuick" | "toggleHiddenQuick" | "settings" | "theme", string>> = {
  zh: {
    clearCompleted: "清理当前完成项",
    addQuick: "新增快捷内容",
    toggleHiddenQuick: "显示或收起隐藏按钮",
    settings: "打开设置菜单",
    theme: "切换明暗主题",
  },
  en: {
    clearCompleted: "Clear completed items",
    addQuick: "Add a quick shortcut",
    toggleHiddenQuick: "Show or hide hidden shortcuts",
    settings: "Open settings",
    theme: "Switch theme",
  },
};

export const GUIDE_MESSAGES: Record<AppLanguage, Record<GuideKey, string[]>> = {
  zh: {
    images: [
      "Ctrl+V 粘贴截图，也可以直接贴图片。",
      "Ctrl+V 可以直接粘贴图片。",
      "试试把外部图片拖到这里。",
      "双击截图标题可以修改名称。",
      "按住图片拖动可以调整顺序。",
      "单击图片可以预览。",
      "右键图片可复制、预览或删除。",
      "预览时滚轮可以缩放。",
      "预览时拖动可以平移。",
      "方向键可以切换图片。",
      "Enter 可以复制当前图片。",
      "Delete 可以删除当前图片。",
      "Esc 可以关闭预览。",
    ],
    note: [
      "点一下开始写便签。",
      "双击标题可以修改名称。",
      "试试把外部文本拖到这里。",
      "试试把工作空间里的文本拖到提醒事项。",
      "编辑文字后停顿 3 秒会自动保存。",
      "Ctrl+S 可以立即保存。",
      "右键可以复制选中文本。",
      "右键可以粘贴文本。",
      "Tab 可以增加缩进。",
      "Shift+Tab 可以取消缩进。",
      "Enter 会延续当前缩进。",
      "适合先收住临时想法。",
      "空白处点一下就能编辑。",
    ],
    quickButtons: [
      "右键菜单可以隐藏链接。",
      "右键菜单可以编辑链接。",
      "按住链接拖动可以排序。",
      "双击标题可以修改名称。",
      "选择复制文本属性，可以一键复制文本。",
      "链接属性会直接打开目标地址。",
      "加号菜单可以新增快捷内容。",
      "显示隐藏项可以找回低频链接。",
      "隐藏不会删除链接数据。",
      "标题和内容都要填写。",
      "常用文本也可以做成快捷按钮。",
      "右键菜单可以删除不需要的入口。",
    ],
    todos: [
      "试试把提醒事项拖到工作空间。",
      "试试把外部文字拖到这里。",
      "按住提醒事项拖动可以排序。",
      "按住列表名拖动可以调整列表顺序。",
      "双击列表名可以修改名称。",
      "点击星标可以置顶提醒事项。",
      "点击闹钟可以设置通知时间。",
      "右键提醒事项列表标题可以删除列表。",
      "空白处右键可以新增提醒事项列表。",
      "单击空白处可以新增提醒事项。",
      "右键提醒事项可以复制、粘贴或删除。",
      "已完成事项可以单独显示或清理。",
    ],
    workspace: [
      "试试把工作空间里的文本拖到提醒事项。",
      "双击空间标签可以修改空间名。",
      "从外部拖入文本，也能直接收进工作空间。",
      "编辑文字后停顿 3 秒会自动保存。",
      "Ctrl+S 可以立即保存。",
      "Tab 可以增加缩进。",
      "Shift+Tab 可以取消缩进。",
      "Enter 会延续当前缩进。",
      "空缩进行按退格会减少缩进。",
      "右键可以复制选中文本。",
      "右键可以粘贴文本。",
      "适合把任务拆成步骤。",
    ],
    storage: [
      "双击标题可以修改名称。",
      "试试把外部文本拖到这里。",
      "编辑文字后停顿 3 秒会自动保存。",
      "Ctrl+S 可以立即保存。",
      "Tab 可以增加缩进。",
      "Shift+Tab 可以取消缩进。",
      "右键可以复制选中文本。",
      "右键可以粘贴文本。",
      "Enter 会延续当前缩进。",
      "适合长期保留资料。",
    ],
    addQuick: [
      "可新增链接入口。",
      "也可新增复制文本。",
      "默认是链接属性。",
      "标题和内容都要填。",
      "链接会直接打开。",
      "文本会复制使用。",
      "保存后出现在快捷区。",
      "常用入口更快触达。",
      "可后续右键编辑。",
      "可隐藏低频入口。",
    ],
    toggleHiddenQuick: [
      "显示隐藏快捷项。",
      "再点一次可收起。",
      "适合收纳低频入口。",
      "展开后仍可编辑。",
      "展开后仍可使用。",
      "隐藏不会删除内容。",
      "界面会更清爽。",
      "低频入口可先藏起。",
      "隐藏项可随时找回。",
      "收起后保留数据。",
    ],
    settings: [
      "可导入导出数据。",
      "导出可保留备份。",
      "导入会先确认覆盖。",
      "这里可以切换中英文。",
      "可打开建议入口。",
      "关于里有项目信息。",
      "版本状态在这里。",
      "有更新会显示圆点。",
      "可刷新静态缓存。",
      "GitHub 入口在关于里。",
    ],
    theme: [
      "点一下切换主题。",
      "可切换明暗色。",
      "页面会记住选择。",
      "白天可用浅色。",
      "夜间可用深色。",
      "切换后立即生效。",
      "主题会自动保存。",
      "图标会跟着变化。",
      "选择更舒服的显示。",
      "随时可以切回来。",
    ],
  },
  en: {
    images: [
      "Try dropping an image from outside here.",
      "Press Ctrl+V to paste an image here.",
      "Double-click the screenshots title to rename it.",
      "Drag images to reorder them.",
      "Click an image to preview it.",
      "Right-click an image to copy, preview, or delete it.",
      "Use the wheel to zoom in preview.",
      "Drag inside preview to pan.",
      "Use arrow keys to switch images.",
      "Press Enter to copy the current image.",
      "Press Delete to remove the current image.",
      "Press Esc to close preview.",
    ],
    note: [
      "Double-click the title to rename it.",
      "Try dropping external text here.",
      "Try dragging workspace text into reminders.",
      "Edited text saves automatically after 3 seconds.",
      "Press Ctrl+S to save immediately.",
      "Right-click to copy selected text.",
      "Right-click to paste text.",
      "Press Tab to indent.",
      "Press Shift+Tab to outdent.",
      "Enter keeps the current indent.",
      "Use notes to catch temporary thoughts.",
      "Click blank space to start editing.",
    ],
    quickButtons: [
      "Use the context menu to hide a link.",
      "Use the context menu to edit a link.",
      "Drag links to reorder them.",
      "Double-click the title to rename it.",
      "Text shortcuts copy their text instantly.",
      "Link shortcuts open their target URL.",
      "Use the menu to add a shortcut.",
      "Show hidden items to recover low-use links.",
      "Hiding a link never deletes its data.",
      "A shortcut needs both title and content.",
      "Common snippets can become quick buttons.",
      "Use the context menu to delete an entry.",
    ],
    todos: [
      "Try dragging a reminder into the workspace.",
      "Try dropping external text here.",
      "Drag reminders to reorder them.",
      "Drag a list name to reorder lists.",
      "Double-click a list name to rename it.",
      "Click the star to pin a reminder.",
      "Click the alarm to set a notification time.",
      "Right-click a reminder list title to delete the list.",
      "Right-click blank space to create a reminder list.",
      "Click blank space to add a reminder.",
      "Right-click a reminder to copy, paste, or delete it.",
      "Completed reminders can be shown or cleared.",
    ],
    workspace: [
      "Try dragging workspace text into reminders.",
      "Double-click a space tab to rename it.",
      "Drop external text here to capture it in the workspace.",
      "Edited text saves automatically after 3 seconds.",
      "Press Ctrl+S to save immediately.",
      "Press Tab to indent.",
      "Press Shift+Tab to outdent.",
      "Enter keeps the current indent.",
      "Backspace on an empty indented line outdents it.",
      "Right-click to copy selected text.",
      "Right-click to paste text.",
      "Use the workspace to break work into steps.",
    ],
    storage: [
      "Double-click the title to rename it.",
      "Try dropping external text here.",
      "Edited text saves automatically after 3 seconds.",
      "Press Ctrl+S to save immediately.",
      "Press Tab to indent.",
      "Press Shift+Tab to outdent.",
      "Right-click to copy selected text.",
      "Right-click to paste text.",
      "Enter keeps the current indent.",
      "Use this area for long-lived reference material.",
    ],
    addQuick: [
      "Add a link shortcut.",
      "You can also add copyable text.",
      "Link is the default type.",
      "Title and content are required.",
      "Links open directly.",
      "Text shortcuts copy text.",
      "Saved items appear in Quick Links.",
      "Common entries stay close at hand.",
      "You can edit them later.",
      "You can hide low-use entries.",
    ],
    toggleHiddenQuick: [
      "Show hidden shortcuts.",
      "Select it again to collapse them.",
      "Useful for low-use entries.",
      "Hidden entries can still be edited.",
      "Hidden entries can still be used.",
      "Hidden does not mean deleted.",
      "The panel stays cleaner.",
      "Low-use links can stay tucked away.",
      "Hidden entries are recoverable.",
      "Collapsing keeps all data.",
    ],
    settings: [
      "Import or export board data.",
      "Export creates a backup.",
      "Import asks before overwriting.",
      "Switch Chinese or English here.",
      "Open the feedback entry.",
      "About includes project information.",
      "Version status lives here.",
      "A dot appears when an update is available.",
      "Refresh static caches after updates.",
      "The GitHub entry is in About.",
    ],
    theme: [
      "Click to switch theme.",
      "Toggle light and dark mode.",
      "The page remembers your choice.",
      "Light mode works well in daytime.",
      "Dark mode works well at night.",
      "The change applies immediately.",
      "Theme changes save automatically.",
      "The icon updates with the theme.",
      "Choose the display that feels clearer.",
      "You can switch back anytime.",
    ],
  },
};

export const UI_TEXT = {
  zh: {
    common: {
      tips: "Tips",
      copy: "复制",
      paste: "粘贴",
      delete: "删除",
      edit: "编辑",
      preview: "预览",
      add: "新增",
      cancel: "取消",
      confirm: "确定",
      save: "保存",
      yes: "是",
      no: "否",
    },
    app: {
      boardLabel: "To Do List 看板",
      mobileLabel: "To Do List 看板移动端引导",
      mobileTitle: "To Do List 看板",
      mobileHeading: "桌面端体验更完整",
      mobileMessage: "建议在电脑浏览器打开，以获得完整体验 (｡•̀ᴗ-)✧",
      mobileDescription: "这个看板为桌面端工作流设计，用来整理截图、便签、提醒事项、快捷链接和工作空间。",
      saved: "已保存",
      saving: "保存中",
      dirty: "有未保存内容",
      theme: "切换主题",
      unnamedList: "未命名列表",
      newSpace: "新空间",
      keepOneSpace: "至少保留一个空间",
      deleteSpace: "删除空间",
      keepOneTodoList: "至少保留一个提醒列表",
      todoListDeleted: "提醒列表已删除",
      todoListAdded: "已新增提醒列表",
      notifyCleared: "已取消通知时间",
      gifDisabled: "已关闭 GIF",
      gifThemeChanged: "已切换 GIF 主题",
      chooseGif: "请选择 GIF 文件",
      customGifSet: "已设置自定义 GIF",
      importOverwrite: "覆盖导入",
      aboutTitle: "To Do List 看板",
      aboutDescription: "一个本地优先的轻量工作台，用来整理截图、便签、提醒事项、快捷链接和工作空间。",
      reminderFallback: "提醒事项",
    },
    settings: {
      button: "设置",
      export: "数据导出",
      import: "数据导入",
      gifTheme: "GIF 主题",
      suggest: "提建议",
      about: "关于",
      update: "更新",
      customGif: "自定义 GIF",
      lightGif: "浅色 GIF",
      darkGif: "深色 GIF",
      chooseLightGif: "选择浅色 GIF",
      chooseDarkGif: "选择深色 GIF",
      language: "Language",
      chinese: "中文",
      english: "English",
    },
    quick: {
      menu: "快捷链接菜单",
      list: "快捷按钮列表",
      add: "新增",
      showHidden: "显示隐藏项",
      hideHidden: "收起隐藏项",
      hide: "隐藏",
      show: "显示",
      dialogAdd: "新增快捷按钮",
      dialogEdit: "编辑快捷按钮",
      title: "标题",
      untitledLink: "未命名链接",
      untitledText: "未命名文本",
      linkType: "链接属性",
      textType: "复制文本属性",
      copyText: "复制文本",
    },
    images: {
      list: "图床图片列表",
      thumbnailAlt: "截图缩略图",
      loading: "图片载入中",
      pasteImage: "粘贴图片",
    },
    space: {
      panel: "空间",
      list: "空间列表",
      editName: "编辑空间名称",
      add: "新增空间",
    },
    todo: {
      todayFocus: "今日重点",
      done: "完成",
      dragList: "拖动提醒列表",
      collapse: "收起提醒列表",
      expand: "展开提醒列表",
      menu: "待办菜单",
      tips: "提醒事项 Tips",
      dragTodo: "拖动提醒事项",
      editNotify: "编辑通知时间",
      setNotify: "设置通知时间",
      unpin: "取消重点",
      pin: "设为重点",
      completed: "已完成",
      clearCompleted: "清理已完成",
      clearCompletedConfirm: "清理",
      hideCompleted: "隐藏已完成",
      showCompleted: "显示已完成",
      editList: "编辑列表",
      newList: "新建列表",
      deleteList: "删除列表",
      createList: "新增提醒列表",
      star: "星标",
      unstar: "取消星标",
      listDialog: "新增提醒列表",
      listName: "列表名称",
      clear: "清除",
      today: "今天",
    },
    preview: {
      close: "取消预览",
      list: "预览图片列表",
      thumbnailAlt: "预览缩略图",
      imageAlt: "图片预览",
      help: "方向键切换 · 滚轮缩放 · 拖动平移 · Enter 复制 · Delete 删除 · Space/Esc 关闭",
    },
  },
  en: {
    common: {
      tips: "Tips",
      copy: "Copy",
      paste: "Paste",
      delete: "Delete",
      edit: "Edit",
      preview: "Preview",
      add: "Add",
      cancel: "Cancel",
      confirm: "Confirm",
      save: "Save",
      yes: "Yes",
      no: "No",
    },
    app: {
      boardLabel: "To Do List Board",
      mobileLabel: "To Do List Board mobile guidance",
      mobileTitle: "To Do List Board",
      mobileHeading: "The desktop experience is more complete",
      mobileMessage: "Open this in a desktop browser for the full experience (｡•̀ᴗ-)✧",
      mobileDescription: "This board is designed for desktop workflows to organize screenshots, notes, reminders, quick links, and workspaces.",
      saved: "Saved",
      saving: "Saving",
      dirty: "Unsaved changes",
      theme: "Switch theme",
      unnamedList: "Untitled List",
      newSpace: "New Space",
      keepOneSpace: "Keep at least one space",
      deleteSpace: "Delete space",
      keepOneTodoList: "Keep at least one reminder list",
      todoListDeleted: "Reminder list deleted",
      todoListAdded: "Reminder list added",
      notifyCleared: "Notification time cleared",
      gifDisabled: "GIF hidden",
      gifThemeChanged: "GIF theme changed",
      chooseGif: "Choose a GIF file",
      customGifSet: "Custom GIF set",
      importOverwrite: "Overwrite import",
      aboutTitle: "To Do List Board",
      aboutDescription: "A local-first lightweight workspace for organizing screenshots, notes, reminders, quick links, and workspaces.",
      reminderFallback: "Reminders",
    },
    settings: {
      button: "Settings",
      export: "Export data",
      import: "Import data",
      gifTheme: "GIF theme",
      suggest: "Feedback",
      about: "About",
      update: "Update",
      customGif: "Custom GIF",
      lightGif: "Light GIF",
      darkGif: "Dark GIF",
      chooseLightGif: "Choose light GIF",
      chooseDarkGif: "Choose dark GIF",
      language: "语言",
      chinese: "中文",
      english: "English",
    },
    quick: {
      menu: "Quick links menu",
      list: "Quick buttons list",
      add: "Add",
      showHidden: "Show hidden items",
      hideHidden: "Hide hidden items",
      hide: "Hide",
      show: "Show",
      dialogAdd: "Add quick button",
      dialogEdit: "Edit quick button",
      title: "Title",
      untitledLink: "Untitled Link",
      untitledText: "Untitled Text",
      linkType: "Link",
      textType: "Copy text",
      copyText: "Copy text",
    },
    images: {
      list: "Screenshot list",
      thumbnailAlt: "Screenshot thumbnail",
      loading: "Loading image",
      pasteImage: "Paste image",
    },
    space: {
      panel: "Space",
      list: "Space list",
      editName: "Edit space name",
      add: "Add space",
    },
    todo: {
      todayFocus: "Pinned reminders",
      done: "Done",
      dragList: "Drag reminder list",
      collapse: "Collapse reminder list",
      expand: "Expand reminder list",
      menu: "Reminder menu",
      tips: "Reminder Tips",
      dragTodo: "Drag reminder",
      editNotify: "Edit notification time",
      setNotify: "Set notification time",
      unpin: "Unpin",
      pin: "Pin",
      completed: "Completed",
      clearCompleted: "Clear completed",
      clearCompletedConfirm: "Clear",
      hideCompleted: "Hide completed",
      showCompleted: "Show completed",
      editList: "Edit list",
      newList: "New list",
      deleteList: "Delete list",
      createList: "New reminder list",
      star: "Star",
      unstar: "Unstar",
      listDialog: "New reminder list",
      listName: "List name",
      clear: "Clear",
      today: "Today",
    },
    preview: {
      close: "Close preview",
      list: "Preview image list",
      thumbnailAlt: "Preview thumbnail",
      imageAlt: "Image preview",
      help: "Arrow keys switch · Wheel zooms · Drag pans · Enter copies · Delete removes · Space/Esc closes",
    },
  },
} as const;

export function normalizeLanguage(value: unknown): AppLanguage {
  return value === "en" ? "en" : DEFAULT_LANGUAGE;
}

export function getDefaultTitles(language: AppLanguage): Record<string, string> {
  return DEFAULT_TITLES_BY_LANGUAGE[normalizeLanguage(language)];
}

export function getDefaultTodoLists(language: AppLanguage = DEFAULT_LANGUAGE): TodoListConfig[] {
  const titles = DEFAULT_TODO_TITLES[normalizeLanguage(language)];
  return [
    { id: "morning", title: titles.morning, collapsed: false, compact: false },
    { id: "noon", title: titles.noon, collapsed: false, compact: false },
    { id: "evening", title: titles.evening, collapsed: false, compact: false },
  ];
}

export function getDisplayTodoListTitle(list: TodoListConfig, language: AppLanguage): string {
  const localized = DEFAULT_TODO_TITLES[normalizeLanguage(language)][list.id];
  if (!localized) return list.title;
  return isDefaultTodoListTitle(list.id, list.title) ? localized : list.title;
}

export function getStoredTodoListTitle(id: string, title: string): string {
  const trimmed = title.trim();
  const defaultTitle = DEFAULT_TODO_TITLES.zh[id];
  return defaultTitle && isDefaultTodoListTitle(id, trimmed) ? defaultTitle : trimmed;
}

export function getDisplaySpaceTitle(space: WorkspaceSpace, language: AppLanguage): string {
  const localized = DEFAULT_SPACE_TITLES[normalizeLanguage(language)][space.id];
  if (!localized) return space.title;
  return isDefaultSpaceTitle(space.id, space.title) ? localized : space.title;
}

export function getStoredSpaceTitle(id: string, title: string): string {
  const trimmed = title.trim();
  const defaultTitle = DEFAULT_SPACE_TITLES.zh[id];
  return defaultTitle && isDefaultSpaceTitle(id, trimmed) ? defaultTitle : trimmed;
}

export function getUiText(language: AppLanguage) {
  return UI_TEXT[normalizeLanguage(language)];
}

export function getAreaHelp(language: AppLanguage) {
  return AREA_HELP_BY_LANGUAGE[normalizeLanguage(language)];
}

export function getControlHelp(language: AppLanguage) {
  return CONTROL_HELP_BY_LANGUAGE[normalizeLanguage(language)];
}

export function getEmptyHints(language: AppLanguage) {
  return EMPTY_HINTS_BY_LANGUAGE[normalizeLanguage(language)];
}

export function getGuideMessages(language: AppLanguage): Record<GuideKey, string[]> {
  return GUIDE_MESSAGES[normalizeLanguage(language)];
}

function isDefaultTodoListTitle(id: string, title: string): boolean {
  return Object.values(DEFAULT_TODO_TITLES).some((titles) => titles[id] === title);
}

function isDefaultSpaceTitle(id: string, title: string): boolean {
  return Object.values(DEFAULT_SPACE_TITLES).some((titles) => titles[id] === title);
}

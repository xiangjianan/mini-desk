export type ThemeMode = "light" | "dark" | "auto";
export type AppLanguage = "zh" | "en";

/** Canonical workbench zones, in left-to-right grid order. */
export type ZoneKey = "assets" | "notes" | "tasks" | "workspace";
/** Per-zone show/hide preference. Owned per-workspace (each space configures its own layout). Defaults to all visible. */
export type ZoneVisibility = Record<ZoneKey, boolean>;
export type CompanionGifTheme = "cat" | "ikun" | "hermes" | "custom" | "none";
export type QuickButtonType = "link" | "text" | "api" | "app";
export type QuickApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type QuickApiBodyType = "none" | "json" | "text" | "form";
export interface QuickApiHeader {
  key: string;
  value: string;
}
export interface QuickTag {
  id: string;
  title: string;
  collapsed?: boolean;
  /** One of QUICK_TAG_COLORS. Persisted so a tag keeps its color for its lifetime. */
  color?: string;
}
export type TodoListId = string;
export type TodoPeriod = TodoListId;
export type TodoCompletedVisibility = Record<TodoListId, boolean>;
export type GuideKey =
  | "images"
  | "note"
  | "quickButtons"
  | "todos"
  | "workspace"
  | "tools"
  | "storage"
  | "addQuick"
  | "toggleHiddenQuick"
  | "settings"
  | "theme";

export interface LineItem {
  text: string;
  indent: number;
}

export interface StoredImage {
  id: string;
  payloadId?: string;
  src?: string;
  createdAt: number;
  displayWidth?: number;
  displayHeight?: number;
}

export type ImagePastePlacement = "append" | "before" | "after" | "replace";

export type ImagePasteRequest =
  | { placement: "append"; anchor?: HTMLElement }
  | {
      placement: "before" | "after" | "replace";
      targetId: string;
      anchor: HTMLElement;
    };

export interface ImagePasteFeedback {
  id: string;
  token: number;
}

export interface QuickButton {
  id: string;
  title: string;
  value: string;
  type: QuickButtonType;
  tagId?: string;
  apiMethod?: QuickApiMethod;
  apiHeaders?: QuickApiHeader[];
  apiBodyType?: QuickApiBodyType;
  apiBody?: string;
  hidden: boolean;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  starred?: boolean;
  notifyAt?: number;
  deadlineAt?: number;
}

export interface CompanionCustomGif {
  light?: string;
  dark?: string;
}

export interface CompanionCustomGifStored {
  light?: boolean;
  dark?: boolean;
}

export interface TodoListConfig {
  id: TodoListId;
  title: string;
  collapsed: boolean;
  compact: boolean;
  /**
   * Which masonry column (0-indexed) this list is pinned to. Auto-distributed
   * while `WorkspaceData.todoLayoutManual` is false; frozen once the user
   * manually reorders. Displayed value is clamped to the current column count.
   * Always present on persisted/migrated data; optional only so test fixtures
   * can omit it (treated as column 0).
   */
  column?: number;
}

export type TodoMap = Record<TodoListId, TodoItem[]>;

export interface TodoStarChange {
  period: TodoPeriod;
  id: string;
  starred: boolean;
  anchor?: HTMLElement;
}

export interface WorkspaceSpace {
  id: string;
  title: string;
  lines: LineItem[];
}

/**
 * A top-level board workspace (identified by `DEFAULT_WORKSPACE_ID`, distinct
 * from the `DEFAULT_SPACE_ID = "workspace"` sub-panel). Each workspace owns its
 * own note/workspace/storage lines, images, quick buttons, todo lists, and a
 * set of `spaces: WorkspaceSpace[]` sub-panels.
 */
export interface WorkspaceData {
  id: string;
  createdAt: number;
  customTitles: Record<string, string>;
  noteLines: LineItem[];
  workspaceLines: LineItem[];
  storageLines: LineItem[];
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  images: StoredImage[];
  quickTags: QuickTag[];
  quickButtons: QuickButton[];
  quickOtherCollapsed: boolean;
  showHiddenQuickButtons: boolean;
  /**
   * Once true, todo lists stop auto-distributing across columns on width/list
   * changes — each list's `column` is only changed by explicit drag reordering.
   */
  todoLayoutManual: boolean;
  todoLists: TodoListConfig[];
  showCompletedTodos: TodoCompletedVisibility;
  todos: TodoMap;
  zoneVisibility: ZoneVisibility;
  inbox?: WorkspaceInbox;
}

/**
 * 手机速记（单向收件箱）配对配置。字段存在即启用该工作区的拉取同步。
 * `code` 兼作加密密钥（12 位 Crockford base32）；`lastSeenAt` 是服务端
 * 时间戳水位线，随工作区导出迁移，防止新机器导入后重灌历史条目。
 */
export interface WorkspaceInbox {
  code: string;
  todoListId: TodoListId;
  /** 便签落点 = 目标空间 Tab 的 id；指向不存在/已删除的空间时回退第一个空间。 */
  noteTarget: string;
  lastSeenAt: number;
}

export interface BoardSyncState {
  revision: number;
  updatedAt: number;
  clientId: string;
}

export interface BoardState {
  sync: BoardSyncState;
  language: AppLanguage;
  theme: ThemeMode;
  companionGifTheme: CompanionGifTheme;
  customCompanionGif: CompanionCustomGif;
  customCompanionGifStored: CompanionCustomGifStored;
  workspaces: WorkspaceData[];
  activeWorkspaceId: string;
}

export interface SerializableOptions {
  includeImageData?: boolean;
  includeCustomGifData?: boolean;
}

export interface DraggedTodo {
  period: TodoPeriod;
  id: string;
}

/** 右键「移动到空间」子菜单的目标工作空间（已排除当前空间）。 */
export interface WorkspaceMoveTarget {
  id: string;
  title: string;
  /** 提醒事项条目移动时需要的第二级列表选择；其他场景不使用。 */
  lists: { id: string; title: string }[];
}

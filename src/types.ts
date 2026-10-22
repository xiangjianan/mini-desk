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
  /**
   * Which masonry column (0-indexed) this tag group is pinned to, mirroring
   * `TodoListConfig.column`. Auto-distributed while `quickLayoutManual` is
   * false; frozen once the user manually drags a tag across columns. Displayed
   * value is clamped to the current column count. Optional only so test
   * fixtures can omit it (treated as column 0).
   */
  column?: number;
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
  | "storage"
  | "addQuick"
  | "toggleHiddenQuick"
  | "settings"
  | "theme";

/** 记事本行内标注格式：全部为不改变字形宽度的格式（镜像渲染层的前提）。 */
export type MarkType = "highlight" | "strike" | "underline" | "color";
/** 语义色名：明暗主题由 CSS 变量各自映射，不存裸 CSS 值。 */
export type MarkColor = "amber" | "rose" | "green" | "blue" | "violet";
/** [start, end) 相对 line.text（不含 4 空格缩进）。strike/underline 无 color；highlight/color 必带。 */
export interface TextMark {
  type: MarkType;
  start: number;
  end: number;
  color?: MarkColor;
}

export interface LineItem {
  text: string;
  indent: number;
  marks?: TextMark[];
}

export interface StoredImage {
  id: string;
  payloadId?: string;
  src?: string;
  createdAt: number;
  displayWidth?: number;
  displayHeight?: number;
}

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
  /** 累计点击次数，点击 +1，以按钮右下角 ×N 显示；缺省 = 0。 */
  clicks?: number;
  hidden: boolean;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  starred?: boolean;
  notifyAt?: number;
  deadlineAt?: number;
  /** 「现在做这个」累计专注毫秒；仅 >0 时存在。 */
  focusElapsedMs?: number;
  /** 「现在做这个」随手记；与便签/空间 Tab 同构（含 marks 高亮元数据）。 */
  focusNotes?: LineItem[];
  /** 「现在做这个」贴图元数据；载荷走 IndexedDB（同工作区贴图设施）。 */
  focusImages?: StoredImage[];
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
   * Current masonry column (0-indexed). Restored from the manual layout for
   * the current column count, or assigned by balanced automatic distribution.
   * Displayed value is clamped to the current column count.
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
  /** true = 紧凑快捷按钮（隐藏类型副标题、压低高度）；默认大按钮。 */
  quickCompact: boolean;
  /**
   * Once true, quick tags stop auto-distributing across columns on width/tag
   * changes — each tag's `column` is only changed by explicit drag reordering.
   */
  quickLayoutManual: boolean;
  /** Legacy flag retained for compatibility; new manual layouts are per count. */
  todoLayoutManual: boolean;
  /** Responsive reminder column limit, defaulting to one for older workspaces. */
  todoMaxColumns?: number;
  /** Relative area widths in visible-zone order (assets, notes, tasks, workspace). */
  zoneWidthRatios?: number[];
  todoListOrder?: string[];
  todoColumnLayouts?: Record<string, { id: string; column: number }[]>;
  todoLists: TodoListConfig[];
  showCompletedTodos: TodoCompletedVisibility;
  todos: TodoMap;
  zoneVisibility: ZoneVisibility;
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
  /** 撤销快照用：剥除 quickButtons[].clicks——点击计数是使用分析而非可撤销内容。 */
  omitQuickButtonClicks?: boolean;
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

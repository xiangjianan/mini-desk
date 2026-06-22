export type ThemeMode = "light" | "dark";
export type AppLanguage = "zh" | "en";
export type CompanionGifTheme = "cat" | "ikun" | "hermes" | "custom" | "none";
export type QuickButtonType = "link" | "text" | "api";
export type QuickApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type QuickApiBodyType = "none" | "json" | "text" | "form";
export interface QuickApiHeader {
  key: string;
  value: string;
}
export interface QuickTag {
  id: string;
  title: string;
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
  src?: string;
  createdAt: number;
  displayWidth?: number;
  displayHeight?: number;
}

export type ImagePastePlacement = "append" | "before" | "after" | "replace";

export interface ImagePasteRequest {
  placement: ImagePastePlacement;
  targetId?: string;
  anchor?: HTMLElement;
}

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
  customTitles: Record<string, string>;
  noteLines: LineItem[];
  workspaceLines: LineItem[];
  storageLines: LineItem[];
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  images: StoredImage[];
  quickTags: QuickTag[];
  quickButtons: QuickButton[];
  showHiddenQuickButtons: boolean;
  todoLists: TodoListConfig[];
  showCompletedTodos: TodoCompletedVisibility;
  todos: TodoMap;
}

export interface SerializableOptions {
  includeImageData?: boolean;
  includeCustomGifData?: boolean;
}

export interface DraggedTodo {
  period: TodoPeriod;
  id: string;
}

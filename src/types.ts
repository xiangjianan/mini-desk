export type ThemeMode = "light" | "dark";
export type CompanionGifTheme = "hermes" | "none";
export type QuickButtonType = "link" | "text";
export type TodoPeriod = "morning" | "noon" | "evening";
export type TodoCompletedVisibility = Record<TodoPeriod, boolean>;
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

export interface LineItem {
  text: string;
  indent: number;
}

export interface StoredImage {
  id: string;
  src?: string;
  createdAt: number;
}

export interface QuickButton {
  id: string;
  title: string;
  value: string;
  type: QuickButtonType;
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

export type TodoMap = Record<TodoPeriod, TodoItem[]>;

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

export interface BoardState {
  theme: ThemeMode;
  companionGifTheme: CompanionGifTheme;
  customTitles: Record<string, string>;
  noteLines: LineItem[];
  workspaceLines: LineItem[];
  storageLines: LineItem[];
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  images: StoredImage[];
  quickButtons: QuickButton[];
  showHiddenQuickButtons: boolean;
  showCompletedTodos: TodoCompletedVisibility;
  todos: TodoMap;
}

export interface SerializableOptions {
  includeImageData?: boolean;
}

export interface DraggedTodo {
  period: TodoPeriod;
  id: string;
}

export type ThemeMode = "light" | "dark";
export type QuickButtonType = "link" | "text";
export type TodoPeriod = "morning" | "noon" | "evening";
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
}

export type TodoMap = Record<TodoPeriod, TodoItem[]>;

export interface BoardState {
  theme: ThemeMode;
  customTitles: Record<string, string>;
  noteLines: LineItem[];
  workspaceLines: LineItem[];
  storageLines: LineItem[];
  images: StoredImage[];
  quickButtons: QuickButton[];
  showHiddenQuickButtons: boolean;
  todos: TodoMap;
}

export interface SerializableOptions {
  includeImageData?: boolean;
}

export interface DraggedTodo {
  period: TodoPeriod;
  id: string;
}

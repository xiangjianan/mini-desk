import { DEFAULT_SPACE_ID, DEFAULT_WORKSPACE_ID } from "../defaults";
import { isValidNotifyAt } from "../deadlines";
import type {
  BoardState,
  CompanionCustomGif,
  CompanionCustomGifStored,
  LineItem,
  QuickTag,
  SerializableOptions,
  TodoCompletedVisibility,
  TodoItem,
  TodoListConfig,
  TodoMap,
  WorkspaceData,
  WorkspaceSpace,
} from "../../types";
import { normalizeSyncState } from "./shared";
import { normalizeZoneVisibility } from "./normalize";

export function getSerializableWorkspace(
  workspace: WorkspaceData,
  options: SerializableOptions = {},
): WorkspaceData {
  const todoLists = cloneTodoLists(workspace.todoLists);
  return {
    id: workspace.id,
    createdAt: workspace.createdAt,
    customTitles: { ...workspace.customTitles },
    noteLines: cloneLines(workspace.noteLines),
    workspaceLines: cloneLines(workspace.workspaceLines),
    storageLines: cloneLines(workspace.storageLines),
    spaces: cloneSpaces(workspace.spaces),
    activeSpaceId: workspace.spaces.some((space) => space.id === workspace.activeSpaceId)
      ? workspace.activeSpaceId
      : workspace.spaces[0]?.id ?? DEFAULT_SPACE_ID,
    images: workspace.images.map((image) => {
      if (options.includeImageData) return { ...image };
      return {
        id: image.id,
        ...(image.payloadId ? { payloadId: image.payloadId } : {}),
        createdAt: image.createdAt,
        ...(image.displayWidth ? { displayWidth: image.displayWidth } : {}),
        ...(image.displayHeight ? { displayHeight: image.displayHeight } : {}),
      };
    }),
    todoLists,
    showCompletedTodos: cloneCompletedVisibility(workspace.showCompletedTodos, todoLists),
    todos: cloneTodos(workspace.todos, todoLists),
    quickTags: cloneQuickTags(workspace.quickTags),
    quickButtons: workspace.quickButtons.map((button) => ({ ...button })),
    quickOtherCollapsed: workspace.quickOtherCollapsed,
    showHiddenQuickButtons: workspace.showHiddenQuickButtons,
    todoLayoutManual: workspace.todoLayoutManual,
    zoneVisibility: normalizeZoneVisibility(workspace.zoneVisibility),
    ...(workspace.inbox ? { inbox: { ...workspace.inbox } } : {}),
  };
}

export function getSerializableState(
  state: BoardState,
  options: SerializableOptions = {},
): BoardState {
  // Fields are listed explicitly (not spread from `state`) so that un-cloned
  // references don't leak into the serialized output. When adding a new global
  // preference, register it both here and in normalizeImportedState's `shared`.
  return {
    sync: { ...normalizeSyncState(state.sync) },
    language: state.language,
    theme: state.theme,
    companionGifTheme: state.companionGifTheme,
    customCompanionGif: options.includeCustomGifData ? cloneCustomCompanionGif(state.customCompanionGif) : {},
    customCompanionGifStored: getCustomCompanionGifStoredState(state.customCompanionGif, state.customCompanionGifStored),
    workspaces: state.workspaces.map((workspace) => getSerializableWorkspace(workspace, options)),
    activeWorkspaceId: state.workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : state.workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID,
  };
}

export function exportUndoSnapshotState(state: BoardState): string {
  return JSON.stringify(getSerializableState(state));
}

export function serializeTextLines(value = ""): LineItem[] {
  if (!value) return [];
  return value.split("\n").map((line) => {
    const tabs = line.match(/^\t*/)?.[0].length ?? 0;
    return {
      text: line.slice(tabs),
      indent: tabs,
    };
  });
}

export function textLinesToText(lines: LineItem[]): string {
  return lines.map((line) => `${"\t".repeat(line.indent)}${line.text}`).join("\n");
}

function cloneTodoLists(todoLists: TodoListConfig[]): TodoListConfig[] {
  return todoLists.map((list) => ({ ...list }));
}

function cloneCompletedVisibility(
  visibility: TodoCompletedVisibility,
  todoLists: TodoListConfig[],
): TodoCompletedVisibility {
  return Object.fromEntries(
    todoLists.map((list) => [list.id, Boolean(visibility[list.id])]),
  ) as TodoCompletedVisibility;
}

function cloneQuickTags(tags: QuickTag[] | undefined): QuickTag[] {
  return (tags ?? []).map((tag) => ({ ...tag }));
}

function cloneTodos(todos: TodoMap, todoLists: TodoListConfig[]): TodoMap {
  return Object.fromEntries(
    todoLists.map((list) => [list.id, (todos[list.id] ?? []).map(cloneTodo)]),
  ) as TodoMap;
}

function cloneTodo(todo: TodoItem): TodoItem {
  const next: TodoItem = { ...todo };
  delete next.deadlineAt;
  if (!isValidNotifyAt(next.notifyAt)) delete next.notifyAt;
  return next;
}

function cloneCustomCompanionGif(value: CompanionCustomGif | undefined): CompanionCustomGif {
  return {
    ...(value?.light ? { light: value.light } : {}),
    ...(value?.dark ? { dark: value.dark } : {}),
  };
}

function getCustomCompanionGifStoredState(
  customGif: CompanionCustomGif | undefined,
  stored: CompanionCustomGifStored | undefined,
): CompanionCustomGifStored {
  return {
    ...((stored?.light || customGif?.light) ? { light: true } : {}),
    ...((stored?.dark || customGif?.dark) ? { dark: true } : {}),
  };
}

export function cloneLines(lines: LineItem[]): LineItem[] {
  return lines.map((line) => ({ ...line }));
}

function cloneSpaces(spaces: WorkspaceSpace[]): WorkspaceSpace[] {
  return spaces.map((space) => ({
    ...space,
    lines: cloneLines(space.lines),
  }));
}


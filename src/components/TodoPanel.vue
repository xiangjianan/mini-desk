<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import {
  AddOutline,
  AlarmOutline,
  CheckmarkDoneOutline,
  ChevronDownOutline,
  ClipboardOutline,
  CopyOutline,
  CreateOutline,
  EyeOffOutline,
  EyeOutline,
  HelpCircleOutline,
  LinkOutline,
  NotificationsOutline,
  Star,
  StarOutline,
  SwapHorizontalOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { NDatePicker, NDropdown, NIcon, NScrollbar } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { DEFAULT_TODO_LISTS, GUIDE_MENU_OPTION } from "../state/defaults";
import { getDisplayTodoListTitle, getUiText } from "../state/i18n";
import {
  getDefaultNotifyDateTimeValue,
  getNotifyDisplay,
  getNotifyPresets,
  isValidDeadlineAt,
  withDefaultNotifyTime,
  type NotifyDisplay,
} from "../state/deadlines";
import { createDragAutoScroll, findDragScrollContainer } from "../utils/dragScroll";
import type {
  DraggedTodo,
  GuideKey,
  AppLanguage,
  TodoCompletedVisibility,
  TodoItem,
  TodoListConfig,
  TodoListId,
  TodoMap,
  TodoPeriod,
  TodoStarChange,
  WorkspaceMoveTarget,
} from "../types";
import { getOrderedTodos, getTodoReorderTarget, todoKey } from "../state/todos";
import { splitDroppedTodoText } from "../utils/textEditor";
import { copySelection, copyTextToClipboard, getSelectionRange, pasteIntoField, readClipboardText } from "../utils/clipboard";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import { renderIcon } from "../utils/dropdownIcons";
import { isImeComposing } from "../utils/ime";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  todoLists?: TodoListConfig[];
  todos: TodoMap;
  titles: Record<string, string>;
  showCompleted?: TodoCompletedVisibility;
  editListId?: TodoListId | null;
  notificationFlashKeys?: string[];
  language?: AppLanguage;
  moveTargets?: WorkspaceMoveTarget[];
}>(), {
  notificationFlashKeys: () => [],
  language: "zh",
  moveTargets: () => [],
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  createList: [anchor?: HTMLElement, title?: string];
  updateListTitle: [listId: TodoListId, title: string];
  toggleListCollapsed: [listId: TodoListId, collapsed: boolean];
  toggleListCompact: [listId: TodoListId, compact: boolean];
  deleteList: [listId: TodoListId, anchor?: HTMLElement];
  columnCountChange: [count: number];
  assignListColumn: [draggedId: TodoListId, targetColumn: number, anchorId: TodoListId | null, insertBefore: boolean];
  create: [period: TodoPeriod, afterId?: string];
  update: [period: TodoPeriod, id: string, text: string];
  split: [period: TodoPeriod, id: string, before: string, after: string];
  complete: [period: TodoPeriod, id: string, done: boolean, anchor?: HTMLElement];
  star: [change: TodoStarChange];
  notify: [period: TodoPeriod, id: string, notifyAt: number | undefined, anchor?: HTMLElement];
  remove: [period: TodoPeriod, id: string, anchor?: HTMLElement];
  clearCompleted: [period: TodoPeriod, anchor?: HTMLElement];
  toggleCompletedVisibility: [period: TodoPeriod, showCompleted: boolean];
  blurEmpty: [period: TodoPeriod, id: string];
  blur: [];
  move: [dragged: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string];
  createFromText: [period: TodoPeriod, texts: string[]];
  focus: [element: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
  declutter: [anchor: HTMLElement];
  moveListToWorkspace: [listId: TodoListId, workspaceId: string];
  moveTodoToWorkspace: [period: TodoPeriod, todoId: string, workspaceId: string, listId: TodoListId];
}>();

const focusedListId = ref<TodoListId | null>(null);
const localEditListId = ref<TodoListId | null>(null);
const menu = ref<{
  x: number;
  y: number;
  period: TodoListId;
  id?: string;
  anchor?: HTMLElement;
  target?: HTMLInputElement;
  sectionActions?: boolean;
} | null>(null);
const dragged = ref<DraggedTodo | null>(null);
const todoDragScroll = createDragAutoScroll();
const draggedListId = ref<TodoListId | null>(null);
const panelRef = ref<HTMLElement | null>(null);
// Measured content width of the todo panel, kept in sync via ResizeObserver.
const measuredPanelWidth = ref(0);
const editingListTitleIds = ref<Set<TodoListId>>(new Set());
const editingTodoKey = ref<string | null>(null);
const selectedMenuTodoKey = ref<string | null>(null);
const dragHoverListId = ref<TodoListId | null>(null);
const notifyPickerRef = ref<HTMLElement | null>(null);
const notifyPicker = ref<{
  period: TodoPeriod;
  id: string;
  anchor: HTMLElement;
  x: number;
  y: number;
} | null>(null);
const notifyPickerDrafts = ref<Record<string, number>>({});
// Quick deadline presets refresh each time the picker opens so the relative
// durations and today-vs-tomorrow time slots stay current.
const notifyPresets = computed(() => {
  if (!notifyPicker.value) return [];
  return getNotifyPresets();
});
const relativeNotifyPresets = computed(() => notifyPresets.value.filter((preset) => preset.group === "relative"));
const timeNotifyPresets = computed(() => notifyPresets.value.filter((preset) => preset.group === "time"));
const listCreateDialogRef = ref<HTMLElement | null>(null);
const listCreateInputRef = ref<HTMLInputElement | null>(null);
const todayFocusTitleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
const listCreateDialog = ref<{
  x: number;
  y: number;
  anchor?: HTMLElement;
  title: string;
} | null>(null);
const pendingDoneReorderIds = ref<string[]>([]);
const reorderTimers = new Map<string, number>();
const lastTodoCarets = new Map<string, number>();
const lastTodoSelections = new Map<string, { start: number; end: number }>();
const todoSectionRefs = new Map<TodoListId, HTMLElement>();
const notifyPickerAnchors = new Map<string, HTMLElement>();
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({ ...GUIDE_MENU_OPTION, label: uiText.value.common.tips }));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);
const legacyTodoTitleIds: Record<TodoListId, string> = {
  morning: "todo-morning-title",
  noon: "todo-noon-title",
  evening: "todo-evening-title",
};
const effectiveTodoLists = computed(() => {
  const lists = props.todoLists ?? DEFAULT_TODO_LISTS.map((list) => ({
    ...list,
    title: getFallbackListTitle(list),
  }));
  return lists.map((list) => ({
    ...list,
    title: getDisplayTodoListTitle(list, props.language),
  }));
});
// Number of masonry columns: derived from the measured panel width and clamped
// to the list count so a few lists never leave empty columns. 1 = single column.
const columnCount = computed(() => computeColumnCount(measuredPanelWidth.value, effectiveTodoLists.value.length));
watch(columnCount, (next) => emit("columnCountChange", next));
// Group lists into explicit column buckets by their pinned `column`, clamped to
// the current column count. Array order within a bucket = vertical order.
const listsByColumn = computed<TodoListConfig[][]>(() => {
  const columns = columnCount.value;
  const buckets: TodoListConfig[][] = Array.from({ length: columns }, () => []);
  effectiveTodoLists.value.forEach((list) => {
    buckets[clampColumn(list.column ?? 0)].push(list);
  });
  return buckets;
});
const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value?.sectionActions) {
    const list = getListById(menu.value.period);
    if (!list) return [guideMenuOption.value];
    return [
      { label: uiText.value.todo.clearCompleted, key: "clear-completed", icon: renderIcon(CheckmarkDoneOutline) },
      { label: isCompletedVisible(list.id) ? uiText.value.todo.hideCompleted : uiText.value.todo.showCompleted, key: "toggle-completed", icon: renderIcon(isCompletedVisible(list.id) ? EyeOffOutline : EyeOutline) },
      { label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) },
      { label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(AddOutline) },
      { label: uiText.value.todo.editList, key: "edit-list", icon: renderIcon(CreateOutline) },
      ...buildListMoveOptions(),
      { label: uiText.value.todo.deleteList, key: "delete-list", disabled: effectiveTodoLists.value.length <= 1, icon: renderIcon(TrashOutline, true) },
      { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
    ];
  }
  const options: DropdownOption[] = [];
  const todo = getMenuTodo();
  if (!menu.value?.id) {
    options.push({ label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(AddOutline) });
  }
  if (menu.value?.id) {
    options.push({ label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) });
    if (menu.value.target && canPasteTodoText(menu.value.period, menu.value.id, menu.value.target)) {
      options.push({ label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) });
    }
    options.push({
      label: isValidDeadlineAt(todo?.notifyAt) ? uiText.value.todo.editNotify : uiText.value.todo.setNotify,
      key: "notify",
      icon: renderIcon(NotificationsOutline),
    });
    options.push({ label: todo?.starred ? uiText.value.todo.unstar : uiText.value.todo.star, key: "star", icon: renderIcon(todo?.starred ? Star : StarOutline) });
    options.push(...buildTodoMoveOptions());
    options.push({ label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline, true) });
  }
  options.push({ ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) });
  return options;
});

/** 列表级「移动到空间」子菜单；仅一个列表时禁用，无目标空间时不渲染。 */
function buildListMoveOptions(): DropdownOption[] {
  if (props.moveTargets.length === 0) return [];
  return [{
    label: uiText.value.common.moveToWorkspace,
    key: "move-list",
    icon: renderIcon(SwapHorizontalOutline),
    disabled: effectiveTodoLists.value.length <= 1,
    children: props.moveTargets.map((target) => ({ label: target.title, key: `move-list-ws:${target.id}` })),
  }];
}

/** 条目级「移动到空间 → 列表」三级子菜单；无目标空间时不渲染。
 * 中间键 `move-todo-ws:*` 仅用于展开与禁用展示，刻意不参与路由。 */
function buildTodoMoveOptions(): DropdownOption[] {
  if (props.moveTargets.length === 0) return [];
  return [{
    label: uiText.value.common.moveToWorkspace,
    key: "move-todo",
    icon: renderIcon(SwapHorizontalOutline),
    children: props.moveTargets.map((target) => ({
      label: target.title,
      key: `move-todo-ws:${target.id}`,
      disabled: target.lists.length === 0,
      children: target.lists.map((list) => ({ label: list.title, key: `move-todo:${target.id}:${list.id}` })),
    })),
  }];
}

const todayFocusTitleId = "today-focus-title";
const DEADLINE_CLOCK_INTERVAL_MS = 60_000;
const DEADLINE_EDITOR_OFFSET = 8;
const NOTIFY_PICKER_WIDTH = 456;
const NOTIFY_PICKER_HEIGHT = 360;
const NOTIFY_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const NOTIFY_MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
const NOTIFY_TIME_LOOP_CYCLES = 5;
const NOTIFY_TIME_LOOP_MIDDLE_CYCLE = Math.floor(NOTIFY_TIME_LOOP_CYCLES / 2);
const NOTIFY_LOOPED_HOURS = createNotifyTimeLoopOptions(NOTIFY_HOURS);
const NOTIFY_LOOPED_MINUTES = createNotifyTimeLoopOptions(NOTIFY_MINUTES);
const LIST_CREATE_DIALOG_WIDTH = 260;
const LIST_CREATE_DIALOG_HEIGHT = 112;
const deadlineNow = ref(Date.now());
const deadlineClockTimer = ref<number | undefined>();
const resettingNotifyTimeColumns = new WeakSet<HTMLElement>();
const centeringTimeColumns = new Map<HTMLElement, number>();

const ordered = computed(() =>
  Object.fromEntries(
    effectiveTodoLists.value.map((list) => {
      const period = list.id;
      const deferredIds = getDeferredTodoIds(period);
      return [period, getOrderedTodos(getTodos(period), deferredIds)];
    }),
  ) as TodoMap,
);

const periodStats = computed(() =>
  Object.fromEntries(
    effectiveTodoLists.value.map((list) => {
      const period = list.id;
      const todos = getTodos(period);
      const total = todos.length;
      const done = todos.filter((todo) => todo.done).length;
      return [period, `${done}/${total}`];
    }),
  ) as Record<TodoListId, string>,
);

type TodayFocusEntry = { period: TodoListId; todo: TodoItem; index: number; deferredDone: boolean };
type NotifyTimeLoopOption = { key: string; value: number; cycle: number; isScrollAnchor: boolean };

const todayFocus = computed(() => {
  const entries: TodayFocusEntry[] = effectiveTodoLists.value.flatMap((list) => {
    const deferredIds = getDeferredTodoIds(list.id);
    return (ordered.value[list.id] ?? [])
      .filter((todo) => todo.starred && (!todo.done || isCompletedVisible(list.id) || deferredIds.has(todo.id)))
      .map((todo) => ({ period: list.id, todo, index: 0, deferredDone: deferredIds.has(todo.id) }));
  });
  entries.forEach((entry, index) => {
    entry.index = index;
  });
  return entries.sort(compareTodayFocusEntries).map(({ period, todo }) => ({ period, todo }));
});

const listCreateDialogStyle = computed(() => {
  if (!listCreateDialog.value) return {};
  return {
    left: `${listCreateDialog.value.x}px`,
    top: `${listCreateDialog.value.y}px`,
  };
});

const notifyPickerStyle = computed(() => {
  if (!notifyPicker.value) return {};
  return {
    left: `${notifyPicker.value.x}px`,
    top: `${notifyPicker.value.y}px`,
  };
});

const notifyDisplays = computed(() => {
  const displays = new Map<TodoItem, NotifyDisplay>();
  const now = deadlineNow.value;
  effectiveTodoLists.value.forEach((list) => {
    getTodos(list.id).forEach((todo) => {
      const display = getNotifyDisplay(todo.notifyAt, now, props.language);
      if (display) displays.set(todo, display);
    });
  });
  return displays;
});

const visibleOrdered = computed(() =>
  Object.fromEntries(
    effectiveTodoLists.value.map((list) => {
      const period = list.id;
      const deferredIds = getDeferredTodoIds(period);
      return [
        period,
        isCompletedVisible(period)
          ? ordered.value[period]
          : ordered.value[period].filter((todo) => !todo.done || deferredIds.has(todo.id)),
      ];
    }),
  ) as TodoMap,
);

type TodoListEntry =
  | { type: "divider"; id: string; period: TodoListId }
  | { type: "todo"; todo: TodoItem };

const listEntries = computed(() =>
  Object.fromEntries(
    effectiveTodoLists.value.map((list) => {
      const period = list.id;
      return [period, buildTodoListEntries(period, visibleOrdered.value[period] ?? [], getDeferredTodoIds(period))];
    }),
  ) as Record<TodoListId, TodoListEntry[]>,
);

// Width below which the panel stays single-column (= 2 × the target column width).
const TODO_MULTI_COLUMN_THRESHOLD = 680;
const TODO_COLUMN_TARGET_WIDTH = 340;
let columnResizeObserver: ResizeObserver | undefined;

/**
 * Map a measured panel content width to a column count: 1 below the threshold,
 * then +1 column per additional TODO_COLUMN_TARGET_WIDTH, clamped to the number
 * of lists (so few lists never leave empty columns).
 */
function computeColumnCount(width: number, listCount: number): number {
  if (width < TODO_MULTI_COLUMN_THRESHOLD || listCount <= 1) return 1;
  const computed = 2 + Math.floor((width - TODO_MULTI_COLUMN_THRESHOLD) / TODO_COLUMN_TARGET_WIDTH);
  return Math.max(1, Math.min(computed, listCount));
}

onMounted(() => {
  exclusiveMenu.mount();
  refreshNotifyNow();
  document.addEventListener("pointerdown", handleFloatingEditorOutsidePointerDown, true);
  window.addEventListener("focus", refreshNotifyNow);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  deadlineClockTimer.value = window.setInterval(refreshNotifyNow, DEADLINE_CLOCK_INTERVAL_MS);
  // Track the panel's content width so the column count reacts to window resize,
  // workbench resizer drags, and zone show/hide (none of which fire window resize).
  if (panelRef.value && typeof ResizeObserver !== "undefined") {
    columnResizeObserver = new ResizeObserver((entries) => {
      measuredPanelWidth.value = entries[0]?.contentRect.width ?? 0;
    });
    columnResizeObserver.observe(panelRef.value);
  }
});

onUnmounted(() => {
  exclusiveMenu.unmount();
  reorderTimers.forEach((timer) => window.clearTimeout(timer));
  document.removeEventListener("pointerdown", handleFloatingEditorOutsidePointerDown, true);
  window.removeEventListener("focus", refreshNotifyNow);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.clearInterval(deadlineClockTimer.value);
  columnResizeObserver?.disconnect();
  columnResizeObserver = undefined;
  hoverScrollCleanup.forEach((cancel) => cancel());
  hoverScrollCleanup.clear();
});

function refreshNotifyNow(): void {
  deadlineNow.value = Date.now();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") refreshNotifyNow();
}

function handleListClick(event: MouseEvent, period: TodoPeriod): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .todo-item, .todo-completed-divider")) return;
  event.stopPropagation();
  emitDeclutterPrompt(period, event.currentTarget as HTMLElement);
  emit("create", period);
}

function handleTodoTextDrop(event: DragEvent, period: TodoPeriod): void {
  dragHoverListId.value = null;
  if (draggedListId.value) {
    event.preventDefault();
    event.stopPropagation();
    const targetList = getListById(period);
    emit("assignListColumn", draggedListId.value, targetList ? clampColumn(targetList.column ?? 0) : 0, period, true);
    draggedListId.value = null;
    return;
  }
  if (dragged.value) return;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) return;
  const texts = splitDroppedTodoText(event.dataTransfer?.getData("text/plain") ?? "");
  if (texts.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  emit("createFromText", period, texts);
}

function handleTodoItemDrop(event: DragEvent, period: TodoPeriod, targetId: string): void {
  if (!dragged.value) {
    handleTodoTextDrop(event, period);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  emitTodoMove(dragged.value, period, getTodoItemDropTargetId(event, period, targetId));
}

function handleTodoSectionDrop(event: DragEvent, period: TodoPeriod): void {
  if (dragged.value) {
    event.preventDefault();
    event.stopPropagation();
    emitTodoMove(dragged.value, period, getTodoDropTargetId(event, period));
    return;
  }
  handleTodoTextDrop(event, period);
}

function handleListSectionDrop(event: DragEvent, list: TodoListConfig): void {
  if (draggedListId.value) {
    event.preventDefault();
    event.stopPropagation();
    // Drop onto a list: join that list's column, placed right before it.
    emit("assignListColumn", draggedListId.value, clampColumn(list.column ?? 0), list.id, true);
    draggedListId.value = null;
    return;
  }
  handleTodoSectionDrop(event, list.id);
}

/**
 * Drop a list into a column's blank space (no list under the cursor): join that
 * column, appended after its last list. Falls through for non-list drags so todo
 * drops keep their existing behaviour.
 */
function handleColumnDrop(event: DragEvent, columnIndex: number): void {
  if (!draggedListId.value) return;
  event.preventDefault();
  event.stopPropagation();
  emit("assignListColumn", draggedListId.value, columnIndex, null, false);
  draggedListId.value = null;
}

function clampColumn(column: number): number {
  return Math.max(0, Math.min(column, columnCount.value - 1));
}

function handleListDragStart(event: DragEvent, listId: TodoListId): void {
  const target = event.target as HTMLElement | null;
  if (isListTitleEditing(listId)) {
    event.preventDefault();
    return;
  }
  if (target?.closest("input, textarea, .title-edit-input, .todo-section-menu-button, .todo-collapse-button")) {
    event.preventDefault();
    return;
  }
  draggedListId.value = listId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-todo-list-id", listId);
  }
}

function handleSectionGuideClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .todo-list")) return;
  emit("guide", "todos", event.currentTarget as HTMLElement);
}

function handleEnter(event: KeyboardEvent, period: TodoPeriod, todo: TodoItem): void {
  if (!isTodoEditable(period, todo)) return;
  if (isImeComposing(event)) return;
  event.preventDefault();
  if (event.shiftKey) {
    emit("create", period, todo.id);
    return;
  }
  const input = event.currentTarget as HTMLInputElement;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  emit("split", period, todo.id, before, after);
}

const TODO_INDENT = "    ";

function getAdjacentTodoInput(currentInput: HTMLInputElement, direction: -1 | 1): HTMLInputElement | null {
  const list = currentInput.closest<HTMLElement>(".todo-list, .today-focus-list");
  if (!list) return null;
  const inputs = Array.from(list.querySelectorAll<HTMLInputElement>("input.todo-input, input.today-focus-input"));
  const index = inputs.indexOf(currentInput);
  if (index < 0) return null;
  return inputs[index + direction] ?? null;
}

function getTodoInputIdentity(input: HTMLInputElement): { period: TodoPeriod; id: string } | null {
  const id = input.dataset.todoId;
  const period = input.dataset.period ?? input.closest<HTMLElement>(".todo-section")?.dataset.period;
  if (!id || !period) return null;
  return { period: period as TodoPeriod, id };
}

function handleTodoArrowKey(event: KeyboardEvent, period: TodoPeriod, todo: TodoItem, allowReorder = false): void {
  if (isImeComposing(event)) return;
  const direction: -1 | 1 | 0 = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
  if (direction === 0) return;
  const input = event.currentTarget as HTMLInputElement;
  // Ctrl/Cmd+Up/Down 在普通列表里移动条目顺序；今日聚焦区（allowReorder=false）
  // 是跨列表置顶视图，回落为普通焦点移动。Shift 组合保留给扩展选择。
  if (allowReorder && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    handleTodoReorder(event, input, period, todo, direction);
    return;
  }
  const target = getAdjacentTodoInput(input, direction);
  if (!target) return;
  event.preventDefault();
  const caret = input.selectionStart ?? input.value.length;
  const identity = getTodoInputIdentity(target);
  if (identity) {
    const targetTodo = getTodoById(identity.period, identity.id);
    if (targetTodo && !targetTodo.done) editingTodoKey.value = todoKey(identity.period, identity.id);
  }
  void nextTick(() => {
    target.focus({ preventScroll: true });
    restoreTodoCaret(target, caret);
  });
}

function restoreTodoCaret(input: HTMLInputElement, caret: number): void {
  void nextTick(() => {
    const position = Math.max(0, Math.min(caret, input.value.length));
    input.setSelectionRange(position, position);
  });
}

/**
 * Ctrl/Cmd+Up/Down：在同一视觉分组内移动条目，焦点与光标随行保留。
 * 真实浏览器里 Vue patch / TransitionGroup FLIP 动画期间可能瞬时 blur，
 * blur 会清掉 editingTodoKey 使输入框变 readonly；因此 nextTick 里重查当前
 * 渲染节点并重申编辑态，再恢复焦点与光标，保证连续移动不掉焦。重查按
 * dataset.todoId 匹配，id 含引号/反斜杠等特殊字符（手改导入数据）也安全。
 */
function handleTodoReorder(event: KeyboardEvent, input: HTMLInputElement, period: TodoPeriod, todo: TodoItem, direction: -1 | 1): void {
  if (input.readOnly) return;
  const target = getTodoReorderTarget(visibleOrdered.value[period] ?? [], todo.id, direction);
  if (!target) return;
  event.preventDefault();
  const caret = input.selectionStart ?? input.value.length;
  if (!todo.done) editingTodoKey.value = todoKey(period, todo.id);
  emitTodoMove({ period, id: todo.id }, period, target.targetId);
  // ++ 必须放在 emitTodoMove 之后：该链路同步穿到 persistNow 的
  // localStorage.setItem（无 try/catch），配额溢出抛错时若已 ++ 而
  // nextTick 未注册，守卫会永久卡在 1，吞掉此后所有真实 blur。要吞的
  // blur 最早也发生在 handler 返回后的 flush 里，这里上闸足够早。
  todoReorderBlurGuard++;
  void nextTick(() => {
    // 不把 todo.id 拼进选择器字符串：特殊字符会产生 SyntaxError（jsdom 无
    // CSS.escape 可用），改为逐个比对 dataset.todoId，天然免疫任意 id 字符。
    const moved = Array.from(todoSectionRefs.get(period)?.querySelectorAll<HTMLInputElement>("input.todo-input") ?? [])
      .find((candidate) => candidate.dataset.todoId === todo.id) ?? input;
    if (!todo.done) editingTodoKey.value = todoKey(period, todo.id);
    moved.focus({ preventScroll: true });
    restoreTodoCaret(moved, caret);
    // 必须在 focus() 之后递减：focus() 抢占他人焦点会同步派发 blur，
    // 同样要吞；挪到 focus() 之前会静默回归。
    todoReorderBlurGuard--;
  });
}

// 上移换序时被物理搬动的恰是焦点行：Vue patch 把它摘离 DOM 的瞬间浏览器
// 会派发 blur。这个 blur 里清 focusedListId/editingTodoKey 不仅是旧失焦
// bug 的源头，还会在同一 flush 里追加一次渲染，把 TransitionGroup 的
// prevChildren 清空，onUpdated 的 FLIP 排序动画因此被整体跳过（上移生
// 硬、下移正常）。用非响应式计数器把这类换序自身造成的 blur 整个吞掉；
// 真实用户 blur 都发生在宏任务里，不会落进这个微任务级窗口。计数器而
// 非布尔值：同一宏任务内嵌套换序（++→++→回调→回调）窗口语义仍正确。
let todoReorderBlurGuard = 0;

/** Ctrl/Cmd+Left/Right 跳到提醒文本的行首/行尾（单行输入，无列表标记）。 */
function handleTodoHorizontalArrow(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || isImeComposing(event)) return;
  const input = event.currentTarget as HTMLInputElement;
  if (input.readOnly) return;
  event.preventDefault();
  const position = event.key === "ArrowLeft" ? 0 : input.value.length;
  input.setSelectionRange(position, position);
}

function handleTodoTab(event: KeyboardEvent, period: TodoPeriod, todo: TodoItem): void {
  if (isImeComposing(event)) return;
  event.preventDefault();
  const input = event.currentTarget as HTMLInputElement;
  const indented = input.value.startsWith(TODO_INDENT);
  const nextText = indented ? input.value.slice(TODO_INDENT.length) : `${TODO_INDENT}${input.value}`;
  if (!todo.done) editingTodoKey.value = todoKey(period, todo.id);
  emit("update", period, todo.id, nextText);
  const caret = input.selectionStart ?? input.value.length;
  restoreTodoCaret(input, caret + (indented ? -TODO_INDENT.length : TODO_INDENT.length));
}

function getTodoLink(todo: TodoItem): string | undefined {
  const match = todo.text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  return match?.replace(/[),.;!?，。；！？]+$/, "");
}

function handleChecked(period: TodoPeriod, id: string, checked: boolean): void {
  const key = `${period}:${id}`;
  clearPendingReorder(key);
  if (checked) {
    pendingDoneReorderIds.value = [...pendingDoneReorderIds.value, key];
    reorderTimers.set(
      key,
      window.setTimeout(() => clearPendingReorder(key), 200),
    );
  }
  emit("complete", period, id, checked, todoSectionRefs.get(period));
}

function handleInputBlur(period: TodoPeriod, id: string): void {
  // 换序 patch 摘下焦点行时派发的瞬时 blur：吞掉（见 todoReorderBlurGuard
  // 声明处注释），焦点与编辑态在同一个交互内就会恢复。
  if (todoReorderBlurGuard > 0) return;
  focusedListId.value = null;
  if (editingTodoKey.value === todoKey(period, id)) editingTodoKey.value = null;
  emit("blurEmpty", period, id);
  emit("blur");
}

// IME composition fires a burst of input events per committed word; suppressing
// update emits during composition keeps the parent's debounced saves (and its
// undo snapshots) from churning on intermediate pinyin states.
const todoComposing = ref(false);

function handleInputComposition(event: CompositionEvent): void {
  todoComposing.value = event.type === "compositionstart";
  if (todoComposing.value) return;
  // Chromium delivers the session's final `input` (holding the committed text)
  // BEFORE `compositionend`, so the template's composing guard swallowed it.
  // Emit the committed value here or state never sees it: the row then reads
  // as empty on blur and the empty-row cleanup deletes the user's text. The
  // text comparison keeps Safari (real input after compositionend) from
  // emitting the same value twice.
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  const identity = input ? getTodoInputIdentity(input) : null;
  if (input && identity && getTodoById(identity.period, identity.id)?.text !== input.value) {
    emit("update", identity.period, identity.id, input.value);
  }
}

function handleInputFocus(period: TodoPeriod, todo: TodoItem, event: FocusEvent): void {
  focusedListId.value = period;
  if (!todo.done && todo.text.trim().length === 0) editingTodoKey.value = todoKey(period, todo.id);
  const anchor = todoSectionRefs.get(period) ?? (event.currentTarget as HTMLElement);
  emit("focus", anchor);
  emitDeclutterPrompt(period, anchor);
}

// Hover-driven horizontal marquee for todo inputs whose text overflows the row.
// Animates the input's native scrollLeft, then resets on mouse leave. It never
// runs while the input is focused/editing so it can't fight the caret, and it
// auto-stops the moment focus lands on the input.
const hoverScrollCleanup = new Map<HTMLInputElement, () => void>();
const HOVER_SCROLL_SPEED = 0.05; // px per ms (~50px/s, comfortable reading pace)
const HOVER_SCROLL_PAUSE_START = 320;
const HOVER_SCROLL_PAUSE_END = 760;

function startHoverScroll(input: HTMLInputElement | null): void {
  if (!input) return;
  if (document.activeElement === input) return;
  const overflow = input.scrollWidth - input.clientWidth;
  if (overflow <= 1) return;
  stopHoverScroll(input);
  // Drop the ellipsis while scrolling so the full text is visible, not "...".
  input.classList.add("is-marquee");

  const maxScroll = overflow;
  const travel = maxScroll / HOVER_SCROLL_SPEED;
  const cycle = HOVER_SCROLL_PAUSE_START + travel + HOVER_SCROLL_PAUSE_END + travel;

  let raf = 0;
  let cancelled = false;
  let origin = 0;

  const tick = (now: number) => {
    if (cancelled || !input.isConnected || document.activeElement === input) return;
    if (!origin) origin = now;
    const t = (now - origin) % cycle;
    let x: number;
    if (t < HOVER_SCROLL_PAUSE_START) {
      x = 0;
    } else if (t < HOVER_SCROLL_PAUSE_START + travel) {
      x = ((t - HOVER_SCROLL_PAUSE_START) / travel) * maxScroll;
    } else if (t < HOVER_SCROLL_PAUSE_START + travel + HOVER_SCROLL_PAUSE_END) {
      x = maxScroll;
    } else {
      x = maxScroll * (1 - (t - HOVER_SCROLL_PAUSE_START - travel - HOVER_SCROLL_PAUSE_END) / travel);
    }
    input.scrollLeft = x;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  hoverScrollCleanup.set(input, () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
  });
}

function stopHoverScroll(input: HTMLInputElement | null): void {
  if (!input) return;
  const cancel = hoverScrollCleanup.get(input);
  if (cancel) {
    cancel();
    hoverScrollCleanup.delete(input);
  }
  input.classList.remove("is-marquee");
  // Don't yank the scroll position while the user is actively editing.
  if (document.activeElement === input) return;
  input.scrollLeft = 0;
}

function handleTodoHover(event: MouseEvent, enter: boolean): void {
  const row = event.currentTarget as HTMLElement | null;
  const input = row?.querySelector<HTMLInputElement>(".todo-input, .today-focus-input") ?? null;
  if (enter) startHoverScroll(input);
  else stopHoverScroll(input);
}

function emitDeclutterPrompt(period: TodoPeriod, anchor: HTMLElement): void {
  if ((visibleOrdered.value[period] ?? []).length < 7) return;
  emit("declutter", anchor);
}

function clearPendingReorder(key: string): void {
  const timer = reorderTimers.get(key);
  if (timer) window.clearTimeout(timer);
  reorderTimers.delete(key);
  pendingDoneReorderIds.value = pendingDoneReorderIds.value.filter((item) => item !== key);
}

function openMenu(event: MouseEvent, period: TodoPeriod, id: string): void {
  event.preventDefault();
  event.stopPropagation();
  selectedMenuTodoKey.value = todoKey(period, id);
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, period, id, anchor: event.currentTarget as HTMLElement };
}

function openTodoTextMenu(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  const target = event.currentTarget as HTMLInputElement;
  event.preventDefault();
  event.stopPropagation();
  selectedMenuTodoKey.value = todoKey(period, todo.id);
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    period,
    id: todo.id,
    anchor: target,
    target,
  };
}

function openSectionMenu(event: MouseEvent, period: TodoPeriod): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .todo-item")) return;
  event.preventDefault();
  event.stopPropagation();
  selectedMenuTodoKey.value = null;
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    period,
    anchor: event.currentTarget as HTMLElement,
    sectionActions: true,
  };
}

// Blank panel space (e.g. below fully-collapsed lists) also opens a menu, so
// 新建列表 stays reachable without expanding anything. Sections and the
// today-focus area own their context menus; clicks that reach this handler
// from inside them are the native-menu cases their own guards allow through.
function openPanelMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest(".todo-section, .today-focus-section, button, input, textarea, [contenteditable]")) return;
  const period = effectiveTodoLists.value[0]?.id;
  if (!period) return;
  event.preventDefault();
  event.stopPropagation();
  selectedMenuTodoKey.value = null;
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  // `period` only satisfies the menu shape — with no id/sectionActions the
  // rendered options are the list-agnostic ones (新建列表 / Tips).
  menu.value = { x: event.clientX, y: event.clientY, period, anchor: event.currentTarget as HTMLElement };
}

function openSectionActions(event: MouseEvent, period: TodoListId): void {
  event.preventDefault();
  event.stopPropagation();
  selectedMenuTodoKey.value = null;
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    period,
    anchor: event.currentTarget as HTMLElement,
    sectionActions: true,
  };
}

function openHeadingActions(event: MouseEvent, period: TodoListId): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .title-edit-input")) return;
  openSectionActions(event, period);
}

function openTodayFocusTitleMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .title-edit-input")) return;
  event.preventDefault();
  event.stopPropagation();
  todayFocusTitleRef.value?.openMenuAt(event.clientX, event.clientY, event);
}

function closeMenu(): void {
  menu.value = null;
  selectedMenuTodoKey.value = null;
}

async function openCreateListDialog(anchor?: HTMLElement, x?: number, y?: number): Promise<void> {
  const position = getListCreateDialogPosition(anchor, x, y);
  listCreateDialog.value = {
    ...position,
    anchor,
    title: "",
  };
  await nextTick();
  listCreateInputRef.value?.focus({ preventScroll: true });
}

function updateCreateListTitle(value: string): void {
  if (!listCreateDialog.value) return;
  listCreateDialog.value = { ...listCreateDialog.value, title: value };
}

function confirmCreateListDialog(): void {
  const dialog = listCreateDialog.value;
  if (!dialog) return;
  const title = dialog.title.trim();
  if (!title) {
    listCreateInputRef.value?.focus({ preventScroll: true });
    return;
  }
  emit("createList", dialog.anchor, title);
  listCreateDialog.value = null;
}

function closeCreateListDialog(): void {
  listCreateDialog.value = null;
}

function handleListTitleUpdate(listId: TodoListId, value: string): void {
  setListTitleEditing(listId, false);
  if (localEditListId.value === listId) localEditListId.value = null;
  if (!props.todoLists) {
    const legacyTitleId = legacyTodoTitleIds[listId];
    if (legacyTitleId) {
      emit("titleUpdate", legacyTitleId, value);
      return;
    }
  }
  emit("updateListTitle", listId, value);
}

function setListTitleEditing(listId: TodoListId, editing: boolean): void {
  const next = new Set(editingListTitleIds.value);
  if (editing) next.add(listId);
  else next.delete(listId);
  editingListTitleIds.value = next;
}

function isListTitleEditing(listId: TodoListId): boolean {
  return editingListTitleIds.value.has(listId);
}

async function startListTitleEdit(listId: TodoListId): Promise<void> {
  if (!getListById(listId)) return;
  localEditListId.value = null;
  await nextTick();
  localEditListId.value = listId;
  await nextTick();
  localEditListId.value = null;
}

function handleStarClick(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  event.preventDefault();
  event.stopPropagation();
  emit("star", { period, id: todo.id, starred: !todo.starred, anchor: event.currentTarget as HTMLElement });
}

function handleNotifyClick(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  event.preventDefault();
  event.stopPropagation();
  openNotifyPicker(period, todo.id, event.currentTarget as HTMLElement);
}

function handleTodoDragStart(event: DragEvent, period: TodoPeriod, todo: TodoItem): void {
  dragged.value = { period, id: todo.id };
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-todo-id", `${period}:${todo.id}`);
  const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const dragPreview = handle?.closest<HTMLElement>(".todo-item");
  if (dragPreview) event.dataTransfer.setDragImage?.(dragPreview, 0, 0);
}

function setNotifyPickerAnchor(period: TodoPeriod, id: string, element: Element | null): void {
  const key = todoKey(period, id);
  if (element instanceof HTMLElement) notifyPickerAnchors.set(key, element);
  else notifyPickerAnchors.delete(key);
}

function openNotifyPicker(period: TodoPeriod, id: string, anchor?: HTMLElement): void {
  if (!anchor) return;
  const key = todoKey(period, id);
  const position = getNotifyPickerPosition(anchor);
  notifyPickerAnchors.set(key, anchor);
  notifyPickerDrafts.value = {
    ...notifyPickerDrafts.value,
    [key]: getNotifyPickerInitialValue(getTodoById(period, id)),
  };
  selectedMenuTodoKey.value = null;
  notifyPicker.value = { period, id, anchor, ...position };
  void nextTick(() => {
    window.requestAnimationFrame(() => scrollNotifyTimePickerActiveItems());
  });
}

function scrollNotifyTimePickerActiveItems(animated = false): void {
  notifyPickerRef.value
    ?.querySelectorAll<HTMLElement>(".notify-time-column")
    .forEach((column) => {
      const active = column.querySelector<HTMLElement>(".notify-time-option.is-scroll-anchor")
        ?? column.querySelector<HTMLElement>(".notify-time-option.is-active");
      if (!active) return;
      // Center the active option. Use layout-only properties (offsetTop/offsetHeight/clientHeight)
      // so the calc is immune to the floating-pop enter transform, which would skew getBoundingClientRect.
      // .notify-time-column is position:relative, so offsetTop is relative to the column's content origin.
      const target = Math.max(0, active.offsetTop - Math.round((column.clientHeight - active.offsetHeight) / 2));
      if (animated && typeof column.scrollTo === "function") {
        // Guard against the infinite-loop snap interrupting the smooth animation.
        window.clearTimeout(centeringTimeColumns.get(column));
        centeringTimeColumns.set(column, window.setTimeout(() => centeringTimeColumns.delete(column), 500));
        column.scrollTo({ top: target, behavior: "smooth" });
        return;
      }
      column.scrollTop = target;
    });
}

function createNotifyTimeLoopOptions(values: number[]): NotifyTimeLoopOption[] {
  return Array.from({ length: values.length * NOTIFY_TIME_LOOP_CYCLES }, (_, index) => {
    const cycle = Math.floor(index / values.length);
    const value = values[index % values.length];
    return {
      key: `${cycle}-${value}`,
      value,
      cycle,
      isScrollAnchor: cycle === NOTIFY_TIME_LOOP_MIDDLE_CYCLE,
    };
  });
}

function handleNotifyTimeColumnScroll(event: Event, valueCount: number): void {
  const column = event.currentTarget;
  if (!(column instanceof HTMLElement) || resettingNotifyTimeColumns.has(column) || centeringTimeColumns.has(column)) return;
  const option = column.querySelector<HTMLElement>(".notify-time-option");
  const optionHeight = option?.offsetHeight ?? 0;
  if (optionHeight <= 0) return;
  const cycleHeight = valueCount * optionHeight;
  const scrollWithinCycle = column.scrollTop % cycleHeight;
  const shouldResetToMiddle = column.scrollTop < cycleHeight * 0.5
    || column.scrollTop > cycleHeight * (NOTIFY_TIME_LOOP_CYCLES - 1.5);
  if (!shouldResetToMiddle) return;
  resettingNotifyTimeColumns.add(column);
  column.scrollTop = (NOTIFY_TIME_LOOP_MIDDLE_CYCLE * cycleHeight) + scrollWithinCycle;
  window.requestAnimationFrame(() => resettingNotifyTimeColumns.delete(column));
}

function getNotifyPickerInitialValue(todo?: TodoItem): number {
  if (isValidDeadlineAt(todo?.notifyAt)) return todo.notifyAt;
  // New todo: today defaults to the next whole hour, per the date-aware rule.
  return withDefaultNotifyTime(Date.now());
}

function getNotifyPickerValue(): number {
  const picker = notifyPicker.value;
  if (!picker) return getDefaultNotifyDateTimeValue();
  const todo = getTodoById(picker.period, picker.id);
  const key = todoKey(picker.period, picker.id);
  return notifyPickerDrafts.value[key] ?? getNotifyPickerInitialValue(todo);
}

function updateNotifyPickerDate(value: number | null): void {
  const picker = notifyPicker.value;
  if (!picker || value === null) return;
  const key = todoKey(picker.period, picker.id);
  // Only the date changes — keep the selected hour:minute intact.
  const next = preserveNotifyTimeOnDateChange(getNotifyPickerValue(), value);
  notifyPickerDrafts.value = { ...notifyPickerDrafts.value, [key]: next };
  commitNotifyPickerSelection(next);
}

function preserveNotifyTimeOnDateChange(currentValue: number, nextValue: number): number {
  const current = new Date(currentValue);
  const next = new Date(nextValue);
  next.setHours(current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds());
  return next.getTime();
}

function applyNotifyPickerToday(): void {
  const picker = notifyPicker.value;
  if (!picker) return;
  const key = todoKey(picker.period, picker.id);
  const next = withDefaultNotifyTime(Date.now());
  notifyPickerDrafts.value = { ...notifyPickerDrafts.value, [key]: next };
  void nextTick(() => {
    window.requestAnimationFrame(() => scrollNotifyTimePickerActiveItems(true));
  });
  commitNotifyPickerSelection(next);
}

function getNotifyPickerHour(): number {
  return new Date(getNotifyPickerValue()).getHours();
}

function getNotifyPickerMinute(): number {
  return new Date(getNotifyPickerValue()).getMinutes();
}

function formatNotifyTimeUnit(value: number): string {
  return String(value).padStart(2, "0");
}

function updateNotifyPickerTime(unit: "hour" | "minute", value: number): void {
  const picker = notifyPicker.value;
  if (!picker) return;
  const key = todoKey(picker.period, picker.id);
  const current = new Date(getNotifyPickerValue());
  if (unit === "hour") current.setHours(value);
  else current.setMinutes(value);
  current.setSeconds(0, 0);
  const next = current.getTime();
  notifyPickerDrafts.value = { ...notifyPickerDrafts.value, [key]: next };
  commitNotifyPickerSelection(next);
}

/**
 * Saves the picked value right away — no confirm step. The picker stays open so
 * the user can keep fine-tuning (every manual date/time pick commits), and a
 * later outside click just dismisses it without discarding the saved value.
 */
function commitNotifyPickerSelection(value: number): void {
  const picker = notifyPicker.value;
  if (!picker) return;
  const key = todoKey(picker.period, picker.id);
  emit("notify", picker.period, picker.id, value, notifyPickerAnchors.get(key));
}

function confirmNotifyPicker(value: number | null): void {
  const picker = notifyPicker.value;
  if (!picker || value === null) return;
  const key = todoKey(picker.period, picker.id);
  emit("notify", picker.period, picker.id, value, notifyPickerAnchors.get(key));
  notifyPicker.value = null;
  removeNotifyPickerDraft(key);
}

function clearNotifyPicker(): void {
  const picker = notifyPicker.value;
  if (!picker) return;
  const key = todoKey(picker.period, picker.id);
  emit("notify", picker.period, picker.id, undefined, getNotifyPickerListAnchor(key));
  notifyPicker.value = null;
  removeNotifyPickerDraft(key);
}

function getNotifyPickerListAnchor(key: string): HTMLElement | undefined {
  return (notifyPickerAnchors.get(key)?.closest(".todo-section") as HTMLElement | null | undefined) ?? notifyPickerAnchors.get(key);
}

function closeNotifyPicker(): void {
  const picker = notifyPicker.value;
  if (picker) removeNotifyPickerDraft(todoKey(picker.period, picker.id));
  notifyPicker.value = null;
}

function getNotifyPickerPosition(anchor: HTMLElement): { x: number; y: number } {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || NOTIFY_PICKER_WIDTH;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || NOTIFY_PICKER_HEIGHT;
  const maxX = Math.max(DEADLINE_EDITOR_OFFSET, viewportWidth - NOTIFY_PICKER_WIDTH - DEADLINE_EDITOR_OFFSET);
  const maxY = Math.max(DEADLINE_EDITOR_OFFSET, viewportHeight - NOTIFY_PICKER_HEIGHT - DEADLINE_EDITOR_OFFSET);
  const preferredX = rect.left;
  const preferredY = rect.bottom + DEADLINE_EDITOR_OFFSET;
  const fallbackY = rect.top - NOTIFY_PICKER_HEIGHT - DEADLINE_EDITOR_OFFSET;
  return {
    x: Math.min(Math.max(DEADLINE_EDITOR_OFFSET, preferredX), maxX),
    y: preferredY <= maxY ? preferredY : Math.max(DEADLINE_EDITOR_OFFSET, fallbackY),
  };
}

function removeNotifyPickerDraft(key: string): void {
  if (!(key in notifyPickerDrafts.value)) return;
  const { [key]: _removed, ...nextDrafts } = notifyPickerDrafts.value;
  notifyPickerDrafts.value = nextDrafts;
}

function getListCreateDialogPosition(anchor?: HTMLElement, x?: number, y?: number): { x: number; y: number } {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || LIST_CREATE_DIALOG_WIDTH;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || LIST_CREATE_DIALOG_HEIGHT;
  const anchorRect = anchor?.getBoundingClientRect();
  const rawX = x ?? (anchorRect ? anchorRect.left + DEADLINE_EDITOR_OFFSET : DEADLINE_EDITOR_OFFSET);
  const rawY = y ?? (anchorRect ? anchorRect.top + DEADLINE_EDITOR_OFFSET : DEADLINE_EDITOR_OFFSET);
  return {
    x: Math.min(Math.max(DEADLINE_EDITOR_OFFSET, rawX), Math.max(DEADLINE_EDITOR_OFFSET, viewportWidth - LIST_CREATE_DIALOG_WIDTH - DEADLINE_EDITOR_OFFSET)),
    y: Math.min(Math.max(DEADLINE_EDITOR_OFFSET, rawY), Math.max(DEADLINE_EDITOR_OFFSET, viewportHeight - LIST_CREATE_DIALOG_HEIGHT - DEADLINE_EDITOR_OFFSET)),
  };
}

function handleFloatingEditorOutsidePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (notifyPicker.value && !notifyPickerRef.value?.contains(target) && !(target as HTMLElement).closest?.(".todo-notify-button")) {
    closeNotifyPicker();
  }
  if (listCreateDialog.value && !listCreateDialogRef.value?.contains(target)) listCreateDialog.value = null;
}

async function handleMenuSelect(key: string): Promise<void> {
  if (!menu.value) return;
  const { period, id, anchor, target, x, y } = menu.value;
  if (key.startsWith("move-list-ws:")) {
    closeMenu();
    emit("moveListToWorkspace", period, key.slice("move-list-ws:".length));
    return;
  }
  if (key.startsWith("move-todo:")) {
    closeMenu();
    // 不用 split(":") 解析三段 key：导入数据的手改 id 可能含冒号会错位；
    // 按生成侧（buildTodoMoveOptions）全键匹配，天然免疫。
    if (!id) return;
    for (const target of props.moveTargets) {
      for (const list of target.lists) {
        if (key === `move-todo:${target.id}:${list.id}`) {
          emit("moveTodoToWorkspace", period, id, target.id, list.id);
          return;
        }
      }
    }
    return;
  }
  if (key === "edit-list") {
    closeMenu();
    await startListTitleEdit(period);
    return;
  }
  if (key === "create-list") {
    closeMenu();
    await openCreateListDialog(anchor, x, y);
    return;
  }
  if (key === "delete-list") {
    closeMenu();
    emit("deleteList", period, anchor);
    return;
  }
  if (key === "toggle-completed") {
    closeMenu();
    emit("toggleCompletedVisibility", period, !isCompletedVisible(period));
    return;
  }
  if (key === "clear-completed") {
    closeMenu();
    emit("clearCompleted", period, getTodoSectionAnchor(period));
    return;
  }
  if (key === "paste" && !id) {
    await pasteTodosFromClipboard(period);
    closeMenu();
    return;
  }
  if (key === "copy" && id) {
    if (target && canCopyTextSelection(period, id, target)) {
      await copyTextSelection(target);
    } else {
      await copyTodoText(period, id);
    }
    closeMenu();
    return;
  }
  if (key === "paste" && id && target) {
    await pasteTextFromClipboard(period, id, target);
    closeMenu();
    return;
  }
  if (key === "notify" && id && anchor) {
    closeMenu();
    openNotifyPicker(period, id, anchor);
    return;
  }
  closeMenu();
  if (key === "guide" && anchor) emit("guide", "todos", anchor, true);
  if (!id) return;
  if (key === "star") {
    const todo = getTodoById(period, id);
    emit("star", { period, id, starred: !todo?.starred, anchor });
  }
  if (key === "delete") emit("remove", period, id, getTodoSectionAnchor(period));
}


function isTodoEditable(period: TodoPeriod, todo: TodoItem): boolean {
  return editingTodoKey.value === todoKey(period, todo.id) || (!todo.done && todo.text.trim().length === 0);
}

function isMenuTodoEditable(): boolean {
  if (!menu.value) return false;
  const todo = getMenuTodo();
  return Boolean(todo && isTodoEditable(menu.value.period, todo));
}

function getMenuTodo(): TodoItem | undefined {
  if (!menu.value?.id) return undefined;
  return getTodoById(menu.value.period, menu.value.id);
}

function getTodoById(period: TodoPeriod, id: string): TodoItem | undefined {
  return getTodos(period).find((item) => item.id === id);
}

function getListById(listId: TodoListId): TodoListConfig | undefined {
  return effectiveTodoLists.value.find((list) => list.id === listId);
}

function getTodoSectionAnchor(period: TodoListId): HTMLElement | undefined {
  return todoSectionRefs.get(period);
}

function getFallbackListTitle(list: TodoListConfig): string {
  const legacyTitleId = legacyTodoTitleIds[list.id];
  return legacyTitleId ? props.titles[legacyTitleId] ?? list.title : list.title;
}

function isTodoHighlighted(period: TodoPeriod, id: string): boolean {
  const key = todoKey(period, id);
  return (
    selectedMenuTodoKey.value === key ||
    (dragged.value?.period === period && dragged.value.id === id)
  );
}

function isTodoNotificationFlashing(period: TodoPeriod, id: string): boolean {
  return props.notificationFlashKeys.includes(todoKey(period, id));
}

function listHasNotificationFlash(listId: TodoListId): boolean {
  const prefix = `${listId}:`;
  return props.notificationFlashKeys.some((key) => key.startsWith(prefix));
}

function isListTitleNotificationFlashing(list: TodoListConfig): boolean {
  return list.collapsed && listHasNotificationFlash(list.id);
}

// Whether a list currently holds any non-done, expired (overdue) reminder. Drives
// the red dot on the list heading so an overdue item is still visible when the
// list is collapsed. Depends on deadlineNow so it re-evaluates every minute.
function listHasOverdue(listId: TodoListId): boolean {
  const now = deadlineNow.value;
  return (ordered.value[listId] ?? []).some(
    (todo) => !todo.done && isValidDeadlineAt(todo.notifyAt) && todo.notifyAt < now,
  );
}

function isTodoEditing(period: TodoPeriod, id: string): boolean {
  return editingTodoKey.value === todoKey(period, id);
}

function getTodoNotify(todo: TodoItem): NotifyDisplay | null {
  return notifyDisplays.value.get(todo) ?? null;
}

function getTodoDeadlineClass(todo: TodoItem): string | null {
  if (todo.done) return null;
  const display = getTodoNotify(todo);
  return display ? `deadline-${display.urgency}` : null;
}

function getTodoCompactNotifyLabel(todo: TodoItem): string | null {
  return getTodoNotify(todo)?.compactLabel ?? null;
}

function compareTodayFocusEntries(left: TodayFocusEntry, right: TodayFocusEntry): number {
  const doneDiff = Number(left.todo.done && !left.deferredDone) - Number(right.todo.done && !right.deferredDone);
  if (doneDiff !== 0) return doneDiff;

  const leftDeadline = left.todo.notifyAt;
  const rightDeadline = right.todo.notifyAt;
  const leftHasDeadline = isValidDeadlineAt(leftDeadline);
  const rightHasDeadline = isValidDeadlineAt(rightDeadline);
  if (leftHasDeadline && rightHasDeadline) {
    const deadlineDiff = leftDeadline - rightDeadline;
    if (deadlineDiff !== 0) return deadlineDiff;
  }
  if (leftHasDeadline !== rightHasDeadline) return leftHasDeadline ? -1 : 1;
  return left.index - right.index;
}

function hasSelection(target: HTMLTextAreaElement | HTMLInputElement): boolean {
  return (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
}

function rememberTodoSelection(period: TodoPeriod, id: string, target: HTMLInputElement): void {
  if (!hasSelection(target)) return;
  lastTodoSelections.set(todoKey(period, id), {
    start: target.selectionStart ?? 0,
    end: target.selectionEnd ?? 0,
  });
}

function getTodoSelectionRange(period: TodoPeriod, id: string, target: HTMLInputElement): { start: number; end: number } {
  return getSelectionRange(target, lastTodoSelections.get(todoKey(period, id)));
}

function canCopyTextSelection(period: TodoPeriod, id: string, target: HTMLInputElement): boolean {
  const range = getTodoSelectionRange(period, id, target);
  return range.start !== range.end;
}

function canPasteTodoText(period: TodoPeriod, id: string, target: HTMLInputElement): boolean {
  const todo = getTodoById(period, id);
  return todo?.done !== true && typeof navigator.clipboard?.readText === "function";
}

async function copyTextSelection(target: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
  const current = menu.value;
  const range = target instanceof HTMLInputElement && current?.id
    ? getTodoSelectionRange(current.period, current.id, target)
    : { start: target.selectionStart ?? 0, end: target.selectionEnd ?? target.selectionStart ?? 0 };
  await copySelection(target, range);
}

async function copyTodoText(period: TodoPeriod, id: string): Promise<void> {
  const text = getTodoById(period, id)?.text ?? "";
  if (!text) return;
  await copyTextToClipboard(text);
}

async function pasteTextFromClipboard(period: TodoPeriod, id: string, target: HTMLInputElement): Promise<void> {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const pasted = await pasteIntoField(target, { start, end });
  if (pasted) emit("update", period, id, target.value);
}

async function pasteTodosFromClipboard(period: TodoPeriod): Promise<void> {
  const text = await readClipboardText();
  const texts = splitDroppedTodoText(text ?? "");
  if (texts.length === 0) return;
  emit("createFromText", period, texts);
}

async function startTodoEdit(event: MouseEvent, period: TodoPeriod, id: string): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const key = todoKey(period, id);
  if (editingTodoKey.value === key) return;
  if (hasSelection(input)) {
    rememberTodoSelection(period, id, input);
    editingTodoKey.value = key;
    await nextTick();
    input.focus({ preventScroll: true });
    const selection = lastTodoSelections.get(key);
    if (selection) input.setSelectionRange(selection.start, selection.end);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const caret = lastTodoCarets.get(key) ?? input.selectionStart ?? input.value.length;
  editingTodoKey.value = key;
  await nextTick();
  input.focus({ preventScroll: true });
  lastTodoSelections.delete(key);
  collapseSelection(input, caret);
}

function rememberTodoCaret(period: TodoPeriod, id: string, event: MouseEvent): void {
  const input = event.currentTarget as HTMLInputElement;
  if (hasSelection(input)) {
    rememberTodoSelection(period, id, input);
    return;
  }
  lastTodoCarets.set(todoKey(period, id), input.selectionStart ?? input.value.length);
}

function handleTodoSelection(period: TodoPeriod, id: string, event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  if (!hasSelection(input)) return;
  const key = todoKey(period, id);
  rememberTodoSelection(period, id, input);
  if (editingTodoKey.value === key) return;
  editingTodoKey.value = key;
  void nextTick(() => {
    input.focus({ preventScroll: true });
    const selection = lastTodoSelections.get(key);
    if (selection) input.setSelectionRange(selection.start, selection.end);
  });
}

function setTodoSectionRef(period: TodoListId, element: Element | null): void {
  if (element instanceof HTMLElement) {
    todoSectionRefs.set(period, element);
    return;
  }
  todoSectionRefs.delete(period);
}

function collapseSelection(input: HTMLInputElement, caret: number): void {
  const position = Math.max(0, Math.min(caret, input.value.length));
  input.setSelectionRange(position, position);
  window.setTimeout(() => {
    if (document.activeElement === input) input.setSelectionRange(position, position);
  });
}

function isCompletedVisible(period: TodoListId): boolean {
  return props.showCompleted?.[period] ?? true;
}

function getListIdFromDragEvent(event: DragEvent): TodoListId | null {
  const el = (event.target as HTMLElement)?.closest<HTMLElement>("[data-list-id]");
  return (el?.dataset.listId as TodoListId) ?? null;
}

function handleTodoDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    dragHoverListId.value = getListIdFromDragEvent(event);
  }
  if (dragged.value) {
    todoDragScroll.update(findDragScrollContainer(event.target, "todo-list-scrollbar"), event.clientY);
  }
}

function handleTodoDragLeave(): void {
  dragHoverListId.value = null;
}

function handleTodoDragEnd(): void {
  handleTodoDragLeave();
  todoDragScroll.stop();
}

function getTodos(period: TodoListId): TodoItem[] {
  return props.todos[period] ?? [];
}

function getDeferredTodoIds(period: TodoListId): Set<string> {
  return new Set(
    pendingDoneReorderIds.value
      .filter((key) => key.startsWith(`${period}:`))
      .map((key) => key.slice(period.length + 1)),
  );
}

function getTodoDropTargetId(event: DragEvent, period: TodoPeriod): string | undefined {
  const y = event.clientY;
  const items = getVisibleTodoItemElements(period);
  return items.find((item) => {
    const rect = item.getBoundingClientRect();
    return y < rect.top + rect.height / 2;
  })?.dataset.todoId;
}

function emitTodoMove(draggedTodo: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string): void {
  if (targetId) emit("move", draggedTodo, destinationPeriod, targetId);
  else emit("move", draggedTodo, destinationPeriod);
}

function getTodoItemDropTargetId(event: DragEvent, period: TodoPeriod, targetId: string): string | undefined {
  const target = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>(".todo-item[data-todo-id]");
  if (!target) return targetId;
  const rect = target.getBoundingClientRect();
  if (event.clientY <= rect.top + rect.height / 2) return targetId;
  return getNextVisibleTodoId(period, targetId);
}

function getNextVisibleTodoId(period: TodoPeriod, currentId: string): string | undefined {
  const ids = getVisibleTodoItemElements(period).map((item) => item.dataset.todoId).filter(Boolean) as string[];
  const index = ids.indexOf(currentId);
  return index >= 0 ? ids[index + 1] : undefined;
}

function getVisibleTodoItemElements(period: TodoPeriod): HTMLElement[] {
  return Array.from(todoSectionRefs.get(period)?.querySelectorAll<HTMLElement>(".todo-item[data-todo-id]") ?? []);
}

function buildTodoListEntries(period: TodoListId, todos: TodoItem[], deferredDoneIds: ReadonlySet<string>): TodoListEntry[] {
  const entries: TodoListEntry[] = [];
  let completedDividerAdded = false;
  todos.forEach((todo) => {
    if (todo.done && !deferredDoneIds.has(todo.id) && !completedDividerAdded) {
      entries.push({ type: "divider", id: `completed-${todo.id}`, period });
      completedDividerAdded = true;
    }
    entries.push({ type: "todo", todo });
  });
  return entries;
}
</script>

<template>
  <section ref="panelRef" class="panel todo-panel" aria-labelledby="todo-title" @contextmenu="openPanelMenu" @dragleave="handleTodoDragLeave" @drop="handleTodoDragLeave" @dragend="handleTodoDragEnd">
    <Transition name="section-reveal" :duration="240">
      <section v-if="todayFocus.length" class="today-focus-section" :aria-label="uiText.todo.todayFocus">
        <div class="today-focus-heading" @contextmenu="openTodayFocusTitleMenu">
          <EditableTitle
            ref="todayFocusTitleRef"
            :id="todayFocusTitleId"
            :value="titles[todayFocusTitleId]"
            :edit-label="uiText.common.rename"
            @update="(id, value) => emit('titleUpdate', id, value)"
          />
        </div>
        <NScrollbar class="today-focus-scrollbar">
        <TransitionGroup
          name="today-focus-move"
          tag="ul"
          class="today-focus-list"
          :class="{ 'today-focus-move': true }"
        >
          <li
            v-for="item in todayFocus"
            :key="`${item.period}-${item.todo.id}`"
            class="today-focus-item"
            :class="[
              { 'is-done': item.todo.done, 'is-completing': pendingDoneReorderIds.includes(`${item.period}:${item.todo.id}`), 'is-editing': isTodoEditing(item.period, item.todo.id), 'is-menu-selected': isTodoHighlighted(item.period, item.todo.id), 'is-notify-flashing': isTodoNotificationFlashing(item.period, item.todo.id), 'has-notify': Boolean(getTodoCompactNotifyLabel(item.todo)), 'has-link': Boolean(getTodoLink(item.todo)) },
              getTodoDeadlineClass(item.todo),
            ]"
            @contextmenu.stop="openMenu($event, item.period, item.todo.id)"
            @mouseenter="handleTodoHover($event, true)"
            @mouseleave="handleTodoHover($event, false)"
          >
            <input
              type="checkbox"
              class="todo-checkbox"
              :checked="item.todo.done"
              :aria-label="uiText.todo.done"
              @change="handleChecked(item.period, item.todo.id, ($event.target as HTMLInputElement).checked)"
            />
            <input
              class="today-focus-input"
              :data-todo-id="item.todo.id"
              :data-period="item.period"
              :value="item.todo.text"
              :readonly="!isTodoEditable(item.period, item.todo)"
              draggable="false"
              @input="!todoComposing && emit('update', item.period, item.todo.id, ($event.target as HTMLInputElement).value)"
              @compositionstart="handleInputComposition"
              @compositionend="handleInputComposition"
              @keydown.enter="handleEnter($event, item.period, item.todo)"
              @keydown.up="handleTodoArrowKey($event, item.period, item.todo)"
              @keydown.down="handleTodoArrowKey($event, item.period, item.todo)"
              @keydown.left="handleTodoHorizontalArrow"
              @keydown.right="handleTodoHorizontalArrow"
              @keydown.tab="handleTodoTab($event, item.period, item.todo)"
              @mouseup="rememberTodoCaret(item.period, item.todo.id, $event)"
              @select="handleTodoSelection(item.period, item.todo.id, $event)"
              @contextmenu.stop="openTodoTextMenu($event, item.period, item.todo)"
              @click="startTodoEdit($event, item.period, item.todo.id)"
              @focus="handleInputFocus(item.period, item.todo, $event)"
              @blur="handleInputBlur(item.period, item.todo.id)"
            />
            <a
              v-if="getTodoLink(item.todo)"
              class="todo-link-button"
              :href="getTodoLink(item.todo)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="uiText.todo.openLink"
              @click.stop
            >
              <NIcon :component="LinkOutline" />
            </a>
            <button
              class="todo-notify-button"
              :class="{ 'todo-deadline-slot': Boolean(getTodoCompactNotifyLabel(item.todo)), 'has-time': Boolean(getTodoCompactNotifyLabel(item.todo)) }"
              :ref="(element) => setNotifyPickerAnchor(item.period, item.todo.id, element as Element | null)"
              type="button"
              :aria-label="getTodoCompactNotifyLabel(item.todo) ? uiText.todo.editNotify : uiText.todo.setNotify"
              @click="handleNotifyClick($event, item.period, item.todo)"
            >
              <span v-if="getTodoCompactNotifyLabel(item.todo)" class="todo-deadline-label">
                {{ getTodoCompactNotifyLabel(item.todo) }}
              </span>
              <NIcon v-else class="todo-notify-icon" :component="AlarmOutline" />
            </button>
            <button
              class="todo-star-button is-starred"
              type="button"
              :aria-label="uiText.todo.unpin"
              @click="handleStarClick($event, item.period, item.todo)"
            >
              ★
            </button>
          </li>
        </TransitionGroup>
        </NScrollbar>
      </section>
    </Transition>
    <div
      class="todo-sections"
      :class="{ 'is-multi-column': columnCount > 1 }"
      :style="columnCount > 1 ? { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` } : undefined"
    >
      <TransitionGroup
        v-for="(bucket, columnIndex) in listsByColumn"
        :key="columnIndex"
        name="todo-section-reorder"
        tag="div"
        class="todo-column"
        @dragover.prevent
        @drop="handleColumnDrop($event, columnIndex)"
      >
      <section
        v-for="list in bucket"
        :key="list.id"
        :ref="(element) => setTodoSectionRef(list.id, element as Element | null)"
        class="todo-section"
        :class="{ 'is-focused': focusedListId === list.id, 'is-collapsed': list.collapsed, 'is-compact': true, 'is-list-dragging': draggedListId === list.id, 'drag-hover': dragHoverListId === list.id }"
        :data-list-id="list.id"
        :data-period="list.id"
        @click="handleSectionGuideClick"
        @contextmenu="openSectionMenu($event, list.id)"
        @dragover.prevent="handleTodoDragOver"
        @drop="handleListSectionDrop($event, list)"
      >
        <div
          class="todo-heading"
          :draggable="!isListTitleEditing(list.id)"
          @contextmenu="openHeadingActions($event, list.id)"
          @dragstart="handleListDragStart($event, list.id)"
          @dragend="draggedListId = null"
          @dragover.prevent
          @drop="handleListSectionDrop($event, list)"
        >
          <span
            class="todo-list-drag-handle"
            :aria-label="uiText.todo.dragList"
          />
          <h3 :class="{ 'is-notify-flashing': isListTitleNotificationFlashing(list) }">
            <span
              v-if="listHasOverdue(list.id)"
              class="todo-overdue-dot"
              role="img"
              :aria-label="uiText.todo.overdue"
            />
            <EditableTitle
              :id="list.id"
              :value="list.title"
              :auto-edit="Boolean(props.todoLists && (props.editListId === list.id || localEditListId === list.id))"
              :menu-enabled="false"
              @update="(_id, value) => handleListTitleUpdate(list.id, value)"
              @edit-state="(_id, editing) => setListTitleEditing(list.id, editing)"
            />
          </h3>
          <button
            type="button"
            class="todo-collapse-button icon-button"
            :class="{ 'is-collapsed': list.collapsed }"
            :aria-label="list.collapsed ? uiText.todo.expand : uiText.todo.collapse"
            @click.stop="emit('toggleListCollapsed', list.id, !list.collapsed)"
          >
            <NIcon :component="ChevronDownOutline" />
          </button>
          <div class="todo-heading-actions">
            <span class="todo-count">{{ periodStats[list.id] }}</span>
            <button
              type="button"
              class="todo-section-menu-button icon-button"
              :aria-label="uiText.todo.menu"
              @click="openSectionActions($event, list.id)"
            >
              ⋯
            </button>
          </div>
        </div>

        <div
          class="todo-list-shell"
          :class="{ 'is-hidden': list.collapsed }"
          :aria-hidden="list.collapsed"
          :inert="list.collapsed"
          @click="handleListClick($event, list.id)"
        >
          <NScrollbar
            v-if="listEntries[list.id].length === 0"
            class="todo-list-scrollbar"
          >
            <ul
              class="todo-list todo-empty-list"
              :data-testid="`todo-list-${list.id}`"
              @dragover.prevent
              @drop="handleTodoTextDrop($event, list.id)"
            >
              <li
                :key="`${list.id}-empty-hint`"
                class="todo-empty-hint"
                :aria-label="uiText.todo.tips"
              />
            </ul>
          </NScrollbar>

          <NScrollbar
            v-else
            class="todo-list-scrollbar"
          >
          <TransitionGroup
            name="todo-move"
            tag="ul"
            class="todo-list"
            :class="{ 'todo-move': true }"
            :data-testid="`todo-list-${list.id}`"
            @dragover.prevent
            @drop="handleTodoTextDrop($event, list.id)"
          >
            <template
              v-for="entry in listEntries[list.id]"
              :key="entry.type === 'todo' ? entry.todo.id : entry.id"
            >
              <li
                v-if="entry.type === 'todo'"
                class="todo-item"
                :data-todo-id="entry.todo.id"
                :class="[
                  { 'is-done': entry.todo.done, 'is-starred': entry.todo.starred, 'is-editing': isTodoEditing(list.id, entry.todo.id), 'is-menu-selected': isTodoHighlighted(list.id, entry.todo.id), 'is-notify-flashing': isTodoNotificationFlashing(list.id, entry.todo.id), 'has-notify': Boolean(getTodoCompactNotifyLabel(entry.todo)), 'has-link': Boolean(getTodoLink(entry.todo)) },
                  getTodoDeadlineClass(entry.todo),
                ]"
                @contextmenu.stop="openMenu($event, list.id, entry.todo.id)"
                @dragover.prevent
                @drop="handleTodoItemDrop($event, list.id, entry.todo.id)"
                @mouseenter="handleTodoHover($event, true)"
                @mouseleave="handleTodoHover($event, false)"
              >
                <button
                  class="todo-drag-handle"
                  type="button"
                  draggable="true"
                  :aria-label="uiText.todo.dragTodo"
                  @dragstart="handleTodoDragStart($event, list.id, entry.todo)"
                  @dragend="dragged = null"
                />
                <input
                  type="checkbox"
                  class="todo-checkbox"
                  :checked="entry.todo.done"
                  :aria-label="uiText.todo.done"
                  @change="handleChecked(list.id, entry.todo.id, ($event.target as HTMLInputElement).checked)"
                />
                <input
                  class="todo-input"
                  :data-testid="`todo-input-${list.id}`"
                  :data-todo-id="entry.todo.id"
                  :data-period="list.id"
                  :value="entry.todo.text"
                  :readonly="!isTodoEditable(list.id, entry.todo)"
                  draggable="false"
                  @input="!todoComposing && emit('update', list.id, entry.todo.id, ($event.target as HTMLInputElement).value)"
                  @compositionstart="handleInputComposition"
                  @compositionend="handleInputComposition"
                  @keydown.enter="handleEnter($event, list.id, entry.todo)"
                  @keydown.up="handleTodoArrowKey($event, list.id, entry.todo, true)"
                  @keydown.down="handleTodoArrowKey($event, list.id, entry.todo, true)"
                  @keydown.left="handleTodoHorizontalArrow"
                  @keydown.right="handleTodoHorizontalArrow"
                  @keydown.tab="handleTodoTab($event, list.id, entry.todo)"
                  @mouseup="rememberTodoCaret(list.id, entry.todo.id, $event)"
                  @select="handleTodoSelection(list.id, entry.todo.id, $event)"
                  @contextmenu.stop="openTodoTextMenu($event, list.id, entry.todo)"
                  @click="startTodoEdit($event, list.id, entry.todo.id)"
                  @focus="handleInputFocus(list.id, entry.todo, $event)"
                  @blur="handleInputBlur(list.id, entry.todo.id)"
                />
                <a
                  v-if="getTodoLink(entry.todo)"
                  class="todo-link-button"
                  :href="getTodoLink(entry.todo)"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="uiText.todo.openLink"
                  @click.stop
                >
                  <NIcon :component="LinkOutline" />
                </a>
                <button
                  class="todo-notify-button"
                  :class="{ 'todo-deadline-slot': Boolean(getTodoCompactNotifyLabel(entry.todo)), 'has-time': Boolean(getTodoCompactNotifyLabel(entry.todo)) }"
                  :ref="(element) => setNotifyPickerAnchor(list.id, entry.todo.id, element as Element | null)"
                  type="button"
                  :aria-label="getTodoCompactNotifyLabel(entry.todo) ? uiText.todo.editNotify : uiText.todo.setNotify"
                  @click="handleNotifyClick($event, list.id, entry.todo)"
                >
                  <span v-if="getTodoCompactNotifyLabel(entry.todo)" class="todo-deadline-label">
                    {{ getTodoCompactNotifyLabel(entry.todo) }}
                  </span>
                  <NIcon v-else class="todo-notify-icon" :component="AlarmOutline" />
                </button>
                <button
                  class="todo-star-button"
                  :class="{ 'is-starred': entry.todo.starred }"
                  type="button"
                  :aria-label="entry.todo.starred ? uiText.todo.unpin : uiText.todo.pin"
                  @click="handleStarClick($event, list.id, entry.todo)"
                >
                  {{ entry.todo.starred ? "★" : "☆" }}
                </button>
              </li>
              <li
                v-else
                class="todo-completed-divider"
              >
                <span>{{ uiText.todo.completed }}</span>
                <button
                  class="todo-completed-clear"
                  type="button"
                  @click.stop="emit('clearCompleted', entry.period, getTodoSectionAnchor(entry.period))"
                >
                  {{ uiText.todo.clear }}
                </button>
              </li>
            </template>
          </TransitionGroup>
          </NScrollbar>
        </div>
      </section>
      </TransitionGroup>
    </div>

    <Teleport to="body">
      <Transition name="floating-pop" :duration="240">
        <div
          v-if="notifyPicker"
          ref="notifyPickerRef"
          class="notify-floating-date-picker"
          :style="notifyPickerStyle"
          :aria-label="uiText.todo.setNotify"
        >
          <NDatePicker
            class="notify-date-picker"
            type="date"
            panel
            :value="getNotifyPickerValue()"
            clearable
            format="yyyy-MM-dd"
            value-format="timestamp"
            :actions="[]"
            @update:value="updateNotifyPickerDate"
          />
          <div class="notify-time-panel" :aria-label="uiText.todo.setNotify">
            <div class="notify-time-preview">
              <span>{{ formatNotifyTimeUnit(getNotifyPickerHour()) }}</span>
              <span>:</span>
              <span>{{ formatNotifyTimeUnit(getNotifyPickerMinute()) }}</span>
            </div>
            <div class="notify-time-columns">
              <div class="notify-time-column is-hour" role="listbox" aria-label="小时" @scroll="handleNotifyTimeColumnScroll($event, NOTIFY_HOURS.length)">
                <div
                  v-for="hour in NOTIFY_LOOPED_HOURS"
                  :key="hour.key"
                  class="notify-time-option"
                  :class="{ 'is-active': getNotifyPickerHour() === hour.value, 'is-scroll-anchor': hour.isScrollAnchor && getNotifyPickerHour() === hour.value }"
                  role="option"
                  :aria-selected="getNotifyPickerHour() === hour.value"
                  @click="updateNotifyPickerTime('hour', hour.value)"
                >
                  {{ formatNotifyTimeUnit(hour.value) }}
                </div>
              </div>
              <div class="notify-time-column is-minute" role="listbox" aria-label="分钟" @scroll="handleNotifyTimeColumnScroll($event, NOTIFY_MINUTES.length)">
                <div
                  v-for="minute in NOTIFY_LOOPED_MINUTES"
                  :key="minute.key"
                  class="notify-time-option"
                  :class="{ 'is-active': getNotifyPickerMinute() === minute.value, 'is-scroll-anchor': minute.isScrollAnchor && getNotifyPickerMinute() === minute.value }"
                  role="option"
                  :aria-selected="getNotifyPickerMinute() === minute.value"
                  @click="updateNotifyPickerTime('minute', minute.value)"
                >
                  {{ formatNotifyTimeUnit(minute.value) }}
                </div>
              </div>
            </div>
          </div>
          <div class="notify-panel-presets">
            <div class="notify-panel-preset-group">
              <span class="notify-panel-preset-label">{{ uiText.todo.notifyPresets.relativeLabel }}</span>
              <button
                v-for="preset in relativeNotifyPresets"
                :key="preset.key"
                type="button"
                class="notify-panel-preset"
                @click="confirmNotifyPicker(preset.at)"
              >
                {{ uiText.todo.notifyPresets[preset.key] }}
              </button>
            </div>
            <div class="notify-panel-preset-group">
              <span class="notify-panel-preset-label">{{ uiText.todo.notifyPresets.timeLabel }}</span>
              <button
                v-for="preset in timeNotifyPresets"
                :key="preset.key"
                type="button"
                class="notify-panel-preset"
                @click="confirmNotifyPicker(preset.at)"
              >
                {{ uiText.todo.notifyPresets[preset.key] }}
              </button>
            </div>
          </div>
          <div class="notify-panel-actions">
            <button class="notify-panel-action is-danger" type="button" @click="clearNotifyPicker">{{ uiText.todo.clear }}</button>
            <button class="notify-panel-action" type="button" @click="applyNotifyPickerToday">{{ uiText.todo.today }}</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="floating-pop" :duration="240">
        <section
          v-if="listCreateDialog"
          ref="listCreateDialogRef"
          class="todo-list-create-dialog"
          :style="listCreateDialogStyle"
          :aria-label="uiText.todo.listDialog"
        >
          <label class="todo-list-create-label" for="todo-list-create-input">{{ uiText.todo.listName }}</label>
          <input
            id="todo-list-create-input"
            ref="listCreateInputRef"
            class="todo-list-create-input"
            :value="listCreateDialog.title"
            @input="updateCreateListTitle(($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="confirmCreateListDialog"
            @keydown.esc.prevent="closeCreateListDialog"
          />
          <div class="todo-list-create-actions">
            <button class="todo-list-create-cancel" type="button" @click="closeCreateListDialog">{{ uiText.common.cancel }}</button>
            <button class="todo-list-create-confirm" type="button" @click="confirmCreateListDialog">{{ uiText.common.confirm }}</button>
          </div>
        </section>
      </Transition>
    </Teleport>

    <NDropdown
      v-if="menu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="menu.x"
      :y="menu.y"
      :z-index="CONTEXT_MENU_Z_INDEX"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="exclusiveMenu.handleClickOutside"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref } from "vue";
import type { Component, VNode } from "vue";
import {
  AlarmOutline,
  CheckmarkDoneOutline,
  ChevronDownOutline,
  ClipboardOutline,
  CopyOutline,
  CreateOutline,
  HelpCircleOutline,
  ListOutline,
  NotificationsOutline,
  Star,
  StarOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { NCheckbox, NDatePicker, NDropdown, NIcon, NScrollbar } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { DEFAULT_TODO_LISTS, GUIDE_MENU_OPTION } from "../state/defaults";
import { getDisplayTodoListTitle, getUiText } from "../state/i18n";
import {
  getDefaultNotifyDateTimeValue,
  getNotifyDisplay,
  isValidDeadlineAt,
  type NotifyDisplay,
} from "../state/deadlines";
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
} from "../types";
import { getOrderedTodos } from "../state/todos";
import { splitDroppedTodoText } from "../utils/textEditor";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  todoLists?: TodoListConfig[];
  todos: TodoMap;
  titles: Record<string, string>;
  showCompleted?: TodoCompletedVisibility;
  editListId?: TodoListId | null;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  createList: [anchor?: HTMLElement, title?: string];
  updateListTitle: [listId: TodoListId, title: string];
  toggleListCollapsed: [listId: TodoListId, collapsed: boolean];
  toggleListCompact: [listId: TodoListId, compact: boolean];
  deleteList: [listId: TodoListId, anchor?: HTMLElement];
  reorderLists: [draggedId: TodoListId, targetId: TodoListId];
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
const draggedListId = ref<TodoListId | null>(null);
const editingTodoKey = ref<string | null>(null);
const selectedMenuTodoKey = ref<string | null>(null);
const isDragHover = ref(false);
const notifyPickerRef = ref<HTMLElement | null>(null);
const notifyPicker = ref<{
  period: TodoPeriod;
  id: string;
  anchor: HTMLElement;
  x: number;
  y: number;
} | null>(null);
const notifyPickerDrafts = ref<Record<string, number>>({});
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
function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
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
const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value?.sectionActions) {
    const list = getListById(menu.value.period);
    if (!list) return [guideMenuOption.value];
    return [
      { label: uiText.value.todo.clearCompleted, key: "clear-completed", icon: renderIcon(CheckmarkDoneOutline) },
      { label: isCompletedVisible(list.id) ? uiText.value.todo.hideCompleted : uiText.value.todo.showCompleted, key: "toggle-completed", icon: renderIcon(CheckmarkDoneOutline) },
      { label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(ListOutline) },
      { label: uiText.value.todo.editList, key: "edit-list", icon: renderIcon(CreateOutline) },
      { label: uiText.value.todo.deleteList, key: "delete-list", disabled: effectiveTodoLists.value.length <= 1, icon: renderIcon(TrashOutline) },
      { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
    ];
  }
  const options: DropdownOption[] = [];
  const todo = getMenuTodo();
  if (!menu.value?.id) {
    options.push({ label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(ListOutline) });
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
    options.push({ label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) });
    options.push({ label: todo?.starred ? uiText.value.todo.unstar : uiText.value.todo.star, key: "star", icon: renderIcon(todo?.starred ? Star : StarOutline) });
  }
  options.push({ ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) });
  return options;
});

const todayFocusTitleId = "today-focus-title";
const DEADLINE_CLOCK_INTERVAL_MS = 60_000;
const DEADLINE_EDITOR_OFFSET = 8;
const NOTIFY_PICKER_WIDTH = 320;
const NOTIFY_PICKER_HEIGHT = 360;
const notifyTimePickerProps = { format: "HH:mm" };
const LIST_CREATE_DIALOG_WIDTH = 260;
const LIST_CREATE_DIALOG_HEIGHT = 112;
const deadlineNow = ref(Date.now());
const deadlineClockTimer = ref<number | undefined>();

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

type TodayFocusEntry = { period: TodoListId; todo: TodoItem; index: number };

const todayFocus = computed(() => {
  const entries: TodayFocusEntry[] = effectiveTodoLists.value.flatMap((list) =>
    (ordered.value[list.id] ?? [])
      .filter((todo) => todo.starred)
      .map((todo) => ({ period: list.id, todo, index: 0 })),
  );
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

onMounted(() => {
  exclusiveMenu.mount();
  refreshNotifyNow();
  document.addEventListener("pointerdown", handleFloatingEditorOutsidePointerDown, true);
  window.addEventListener("focus", refreshNotifyNow);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  deadlineClockTimer.value = window.setInterval(refreshNotifyNow, DEADLINE_CLOCK_INTERVAL_MS);
});

onUnmounted(() => {
  exclusiveMenu.unmount();
  reorderTimers.forEach((timer) => window.clearTimeout(timer));
  document.removeEventListener("pointerdown", handleFloatingEditorOutsidePointerDown, true);
  window.removeEventListener("focus", refreshNotifyNow);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.clearInterval(deadlineClockTimer.value);
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
  emit("create", period);
}

function handleTodoTextDrop(event: DragEvent, period: TodoPeriod): void {
  if (draggedListId.value) {
    event.preventDefault();
    event.stopPropagation();
    emit("reorderLists", draggedListId.value, period);
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
  emit("move", dragged.value, period, targetId);
}

function handleTodoSectionDrop(event: DragEvent, period: TodoPeriod): void {
  if (dragged.value) {
    emit("move", dragged.value, period);
    return;
  }
  handleTodoTextDrop(event, period);
}

function handleListSectionDrop(event: DragEvent, listId: TodoListId): void {
  if (draggedListId.value) {
    event.preventDefault();
    event.stopPropagation();
    emit("reorderLists", draggedListId.value, listId);
    draggedListId.value = null;
    return;
  }
  handleTodoSectionDrop(event, listId);
}

function handleListDragStart(event: DragEvent, listId: TodoListId): void {
  const target = event.target as HTMLElement | null;
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
  if (event.isComposing || event.key === "Process" || event.keyCode === 229) return;
  event.preventDefault();
  const input = event.currentTarget as HTMLInputElement;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  emit("split", period, todo.id, before, after);
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
  focusedListId.value = null;
  if (editingTodoKey.value === todoKey(period, id)) editingTodoKey.value = null;
  emit("blurEmpty", period, id);
  emit("blur");
}

function handleInputFocus(period: TodoPeriod, todo: TodoItem, event: FocusEvent): void {
  focusedListId.value = period;
  if (!todo.done && todo.text.trim().length === 0) editingTodoKey.value = todoKey(period, todo.id);
  emit("focus", todoSectionRefs.get(period) ?? (event.currentTarget as HTMLElement));
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
}

function getNotifyPickerInitialValue(todo?: TodoItem): number {
  return isValidDeadlineAt(todo?.notifyAt) ? todo.notifyAt : getDefaultNotifyDateTimeValue();
}

function getNotifyPickerValue(): number {
  const picker = notifyPicker.value;
  if (!picker) return getDefaultNotifyDateTimeValue();
  const todo = getTodoById(picker.period, picker.id);
  const key = todoKey(picker.period, picker.id);
  return notifyPickerDrafts.value[key] ?? getNotifyPickerInitialValue(todo);
}

function updateNotifyPickerDraft(value: number | null): void {
  const picker = notifyPicker.value;
  if (!picker || value === null) return;
  const key = todoKey(picker.period, picker.id);
  notifyPickerDrafts.value = { ...notifyPickerDrafts.value, [key]: preserveNotifyTimeOnDateChange(getNotifyPickerValue(), value) };
}

function setNotifyPickerDraftToToday(): void {
  const picker = notifyPicker.value;
  if (!picker) return;
  const key = todoKey(picker.period, picker.id);
  const current = new Date(getNotifyPickerValue());
  const today = new Date();
  current.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
  notifyPickerDrafts.value = { ...notifyPickerDrafts.value, [key]: current.getTime() };
}

function preserveNotifyTimeOnDateChange(currentValue: number, nextValue: number): number {
  const current = new Date(currentValue);
  const next = new Date(nextValue);
  const dateChanged =
    current.getFullYear() !== next.getFullYear() ||
    current.getMonth() !== next.getMonth() ||
    current.getDate() !== next.getDate();
  if (!dateChanged) return nextValue;
  next.setHours(current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds());
  return next.getTime();
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

function todoKey(period: TodoPeriod, id: string): string {
  return `${period}:${id}`;
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
    editingTodoKey.value === key ||
    (dragged.value?.period === period && dragged.value.id === id)
  );
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
  const doneDiff = Number(left.todo.done) - Number(right.todo.done);
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
  if (hasSelection(target)) {
    return {
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
    };
  }
  const fallback = lastTodoSelections.get(todoKey(period, id));
  if (fallback && fallback.start !== fallback.end && fallback.end <= target.value.length) return fallback;
  const caret = target.selectionStart ?? 0;
  return { start: caret, end: caret };
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
  const { start, end } = target instanceof HTMLInputElement && current?.id
    ? getTodoSelectionRange(current.period, current.id, target)
    : { start: target.selectionStart ?? 0, end: target.selectionEnd ?? target.selectionStart ?? 0 };
  const selectedText = target.value.slice(start, end);
  if (!selectedText) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(selectedText);
      return;
    } catch {
      // Fall back below when async clipboard access is denied.
    }
  }
  copyTextWithBrowserCommand(selectedText);
}

async function copyTodoText(period: TodoPeriod, id: string): Promise<void> {
  const text = getTodoById(period, id)?.text ?? "";
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back below when async clipboard access is denied.
    }
  }
  copyTextWithBrowserCommand(text);
}

function copyTextWithBrowserCommand(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.focus();
  textarea.setSelectionRange(0, textarea.value.length);
  document.execCommand?.("copy");
  textarea.remove();
}

async function pasteTextFromClipboard(period: TodoPeriod, id: string, target: HTMLInputElement): Promise<void> {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  let pastedText: string | undefined;
  if (navigator.clipboard?.readText) {
    try {
      pastedText = await navigator.clipboard.readText();
    } catch {
      pastedText = undefined;
    }
  }
  if (typeof pastedText === "string") {
    if (!pastedText) return;
    target.setRangeText(pastedText, start, end, "end");
  } else if (!pasteTextWithBrowserCommand(target, { start, end })) {
    return;
  }
  emit("update", period, id, target.value);
}

function pasteTextWithBrowserCommand(target: HTMLInputElement, range: { start: number; end: number }): boolean {
  const before = target.value;
  target.focus({ preventScroll: true });
  target.setSelectionRange(range.start, range.end);
  const pasted = Boolean(document.execCommand?.("paste"));
  return pasted && target.value !== before;
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

function handleTodoDragEnter(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    isDragHover.value = true;
  }
}

function handleTodoDragLeave(): void {
  isDragHover.value = false;
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
  <section class="panel todo-panel" :class="{ 'drag-hover': isDragHover }" aria-labelledby="todo-title" @dragenter="handleTodoDragEnter" @dragleave="handleTodoDragLeave" @drop="handleTodoDragLeave">
    <Transition name="section-reveal" :duration="240">
      <section v-if="todayFocus.length" class="today-focus-section" :aria-label="uiText.todo.todayFocus">
        <div class="today-focus-heading" @contextmenu="openTodayFocusTitleMenu">
          <EditableTitle
            ref="todayFocusTitleRef"
            :id="todayFocusTitleId"
            :value="titles[todayFocusTitleId]"
            :edit-label="uiText.common.edit"
            @update="(id, value) => emit('titleUpdate', id, value)"
          />
        </div>
        <NScrollbar class="today-focus-scrollbar">
        <ul class="today-focus-list">
          <li
            v-for="item in todayFocus"
            :key="`${item.period}-${item.todo.id}`"
            class="today-focus-item"
            :class="[
              { 'is-done': item.todo.done, 'is-completing': pendingDoneReorderIds.includes(`${item.period}:${item.todo.id}`), 'is-menu-selected': isTodoHighlighted(item.period, item.todo.id), 'has-notify': Boolean(getTodoCompactNotifyLabel(item.todo)) },
              getTodoDeadlineClass(item.todo),
            ]"
            @contextmenu.stop="openMenu($event, item.period, item.todo.id)"
          >
            <NCheckbox
              :checked="item.todo.done"
              :aria-label="uiText.todo.done"
              @update:checked="(checked) => handleChecked(item.period, item.todo.id, checked)"
            />
            <input
              class="today-focus-input"
              :value="item.todo.text"
              :readonly="!isTodoEditable(item.period, item.todo)"
              draggable="false"
              @input="emit('update', item.period, item.todo.id, ($event.target as HTMLInputElement).value)"
              @keydown.enter="handleEnter($event, item.period, item.todo)"
              @mouseup="rememberTodoCaret(item.period, item.todo.id, $event)"
              @select="handleTodoSelection(item.period, item.todo.id, $event)"
              @contextmenu.stop="openTodoTextMenu($event, item.period, item.todo)"
              @click="startTodoEdit($event, item.period, item.todo.id)"
              @focus="handleInputFocus(item.period, item.todo, $event)"
              @blur="handleInputBlur(item.period, item.todo.id)"
            />
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
        </ul>
        </NScrollbar>
      </section>
    </Transition>
    <TransitionGroup name="todo-section-reorder" tag="div" class="todo-sections">
      <section
        v-for="list in effectiveTodoLists"
        :key="list.id"
        :ref="(element) => setTodoSectionRef(list.id, element as Element | null)"
        class="todo-section"
        :class="{ 'is-focused': focusedListId === list.id, 'is-collapsed': list.collapsed, 'is-compact': true, 'is-list-dragging': draggedListId === list.id }"
        :data-list-id="list.id"
        :data-period="list.id"
        @click="handleSectionGuideClick"
        @contextmenu="openSectionMenu($event, list.id)"
        @dragover.prevent
        @drop="handleListSectionDrop($event, list.id)"
      >
        <div
          class="todo-heading"
          draggable="true"
          @contextmenu="openHeadingActions($event, list.id)"
          @dragstart="handleListDragStart($event, list.id)"
          @dragend="draggedListId = null"
          @dragover.prevent
          @drop="handleListSectionDrop($event, list.id)"
        >
          <span
            class="todo-list-drag-handle"
            :aria-label="uiText.todo.dragList"
          />
          <h3>
            <EditableTitle
              :id="list.id"
              :value="list.title"
              :auto-edit="Boolean(props.todoLists && (props.editListId === list.id || localEditListId === list.id))"
              :menu-enabled="false"
              @update="(_id, value) => handleListTitleUpdate(list.id, value)"
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
                :class="[
                  { 'is-done': entry.todo.done, 'is-starred': entry.todo.starred, 'is-menu-selected': isTodoHighlighted(list.id, entry.todo.id), 'has-notify': Boolean(getTodoCompactNotifyLabel(entry.todo)) },
                  getTodoDeadlineClass(entry.todo),
                ]"
                @contextmenu.stop="openMenu($event, list.id, entry.todo.id)"
                @dragover.prevent
                @drop="handleTodoItemDrop($event, list.id, entry.todo.id)"
              >
                <button
                  class="todo-drag-handle"
                  type="button"
                  draggable="true"
                  :aria-label="uiText.todo.dragTodo"
                  @dragstart="handleTodoDragStart($event, list.id, entry.todo)"
                  @dragend="dragged = null"
                />
                <NCheckbox
                  :checked="entry.todo.done"
                  :aria-label="uiText.todo.done"
                  @update:checked="(checked) => handleChecked(list.id, entry.todo.id, checked)"
                />
                <input
                  class="todo-input"
                  :data-testid="`todo-input-${list.id}`"
                  :data-todo-id="entry.todo.id"
                  :value="entry.todo.text"
                  :readonly="!isTodoEditable(list.id, entry.todo)"
                  draggable="false"
                  @input="emit('update', list.id, entry.todo.id, ($event.target as HTMLInputElement).value)"
                  @keydown.enter="handleEnter($event, list.id, entry.todo)"
                  @mouseup="rememberTodoCaret(list.id, entry.todo.id, $event)"
                  @select="handleTodoSelection(list.id, entry.todo.id, $event)"
                  @contextmenu.stop="openTodoTextMenu($event, list.id, entry.todo)"
                  @click="startTodoEdit($event, list.id, entry.todo.id)"
                  @focus="handleInputFocus(list.id, entry.todo, $event)"
                  @blur="handleInputBlur(list.id, entry.todo.id)"
                />
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
            type="datetime"
            panel
            :value="getNotifyPickerValue()"
            clearable
            format="yyyy-MM-dd HH:mm"
            value-format="timestamp"
            default-time="09:00:00"
            :time-picker-props="notifyTimePickerProps"
            :actions="['clear', 'now', 'confirm']"
            @update:value="updateNotifyPickerDraft"
            @confirm="confirmNotifyPicker"
          >
            <template #clear>
              <button class="notify-panel-action is-danger" type="button" @click="clearNotifyPicker">{{ uiText.todo.clear }}</button>
            </template>
            <template #now>
              <button class="notify-panel-action" type="button" @click="setNotifyPickerDraftToToday">{{ uiText.todo.today }}</button>
            </template>
            <template #confirm="{ onConfirm, disabled }">
              <button class="notify-panel-action" type="button" :disabled="disabled" @click="onConfirm">{{ uiText.common.confirm }}</button>
            </template>
          </NDatePicker>
        </div>
      </Transition>
    </Teleport>

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

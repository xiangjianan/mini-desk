<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { AlarmOutline, ChevronDownOutline, ChevronForwardOutline } from "@vicons/ionicons5";
import { NCheckbox, NDropdown, NIcon } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { DEFAULT_TODO_LISTS, GUIDE_MENU_OPTION } from "../state/defaults";
import {
  NOTIFY_TIME_OPTIONS,
  NOTIFY_HOUR_OPTIONS,
  NOTIFY_MINUTE_OPTIONS,
  DEFAULT_NOTIFY_TIME,
  createNotifyAt,
  getDefaultNotifySelection,
  getNotifyDisplay,
  getNotifyTimeLabel,
  getLocalDateInputValue,
  isValidDeadlineAt,
  type NotifyDisplay,
  type NotifyHourOption,
  type NotifyMinuteOption,
  type NotifyTimeOption,
} from "../state/deadlines";
import type {
  DraggedTodo,
  GuideKey,
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
import EditableTitle from "./EditableTitle.vue";

const props = defineProps<{
  todoLists?: TodoListConfig[];
  todos: TodoMap;
  titles: Record<string, string>;
  showCompleted?: TodoCompletedVisibility;
  editListId?: TodoListId | null;
}>();

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
const notifyEditorRef = ref<HTMLElement | null>(null);
const listCreateDialogRef = ref<HTMLElement | null>(null);
const listCreateInputRef = ref<HTMLInputElement | null>(null);
const notifyEditor = ref<{
  period: TodoPeriod;
  id: string;
  anchor: HTMLElement;
  date: string;
  month: string;
  time: NotifyTimeOption;
  x: number;
  y: number;
} | null>(null);
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
const guideMenuOption: DropdownOption = { ...GUIDE_MENU_OPTION, label: GUIDE_MENU_OPTION.label || "Tips" };
const legacyTodoTitleIds: Record<TodoListId, string> = {
  morning: "todo-morning-title",
  noon: "todo-noon-title",
  evening: "todo-evening-title",
};
const effectiveTodoLists = computed(() => {
  if (props.todoLists) return props.todoLists;
  return DEFAULT_TODO_LISTS.map((list) => ({
    ...list,
    title: getFallbackListTitle(list),
  }));
});
const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value?.sectionActions) {
    const list = getListById(menu.value.period);
    if (!list) return [guideMenuOption];
    return [
      { label: isCompletedVisible(list.id) ? "隐藏已完成" : "显示已完成", key: "toggle-completed" },
      { label: "清理已完成", key: "clear-completed" },
      { label: "删除列表", key: "delete-list", disabled: effectiveTodoLists.value.length <= 1 },
      guideMenuOption,
    ];
  }
  const options: DropdownOption[] = [];
  const todo = getMenuTodo();
  if (!menu.value?.id) {
    options.push({ label: "新增提醒列表", key: "create-list" });
  }
  if (menu.value?.id) {
    options.push({ label: "复制", key: "copy" });
    if (menu.value.target && canPasteTodoText(menu.value.period, menu.value.id, menu.value.target)) {
      options.push({ label: "粘贴", key: "paste" });
    }
    options.push({
      label: isValidDeadlineAt(todo?.notifyAt) ? "编辑通知时间" : "设置通知时间",
      key: "notify",
    });
    options.push({ label: "删除", key: "delete" });
    options.push({ label: todo?.starred ? "取消星标" : "星标", key: "star" });
  }
  options.push(guideMenuOption);
  return options;
});

const todayFocusTitleId = "today-focus-title";
const DEADLINE_CLOCK_INTERVAL_MS = 60_000;
const DEADLINE_EDITOR_OFFSET = 8;
const DEADLINE_EDITOR_WIDTH = 600;
const DEADLINE_EDITOR_HEIGHT = 360;
const LIST_CREATE_DIALOG_WIDTH = 260;
const LIST_CREATE_DIALOG_HEIGHT = 112;
const CALENDAR_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const NOTIFY_PERIOD_OPTIONS = [
  { key: "am", label: "上午" },
  { key: "pm", label: "下午" },
] as const;
const NOTIFY_CLOCK_HOUR_OPTIONS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
] as const;
const NOTIFY_CLOCK_SIZE = 220;
const NOTIFY_CLOCK_BUTTON_SIZE = 32;
const NOTIFY_CLOCK_RADIUS = 82;
const deadlineNow = ref(Date.now());
const deadlineClockTimer = ref<number | undefined>();
type NotifyPeriodOption = typeof NOTIFY_PERIOD_OPTIONS[number]["key"];
type NotifyClockHourOption = typeof NOTIFY_CLOCK_HOUR_OPTIONS[number];

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

const notifyEditorStyle = computed(() => {
  if (!notifyEditor.value) return {};
  return {
    left: `${notifyEditor.value.x}px`,
    top: `${notifyEditor.value.y}px`,
  };
});

const listCreateDialogStyle = computed(() => {
  if (!listCreateDialog.value) return {};
  return {
    left: `${listCreateDialog.value.x}px`,
    top: `${listCreateDialog.value.y}px`,
  };
});

const notifyCalendarTitle = computed(() => {
  if (!notifyEditor.value) return "";
  const month = parseMonthValue(notifyEditor.value.month);
  if (!month) return "";
  return `${month.year} 年 ${month.month} 月`;
});

const notifyCalendarDays = computed(() => {
  if (!notifyEditor.value) return [];
  const month = parseMonthValue(notifyEditor.value.month);
  if (!month) return [];
  const selectedDate = notifyEditor.value.date;
  const today = getLocalDateInputValue();
  const firstDay = new Date(month.year, month.month - 1, 1).getDay();
  const daysInMonth = new Date(month.year, month.month, 0).getDate();
  const leading = Array.from({ length: firstDay }, (_, index) => ({
    key: `blank-${index}`,
    day: "",
    date: "",
    blank: true,
    selected: false,
    today: false,
  }));
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = formatDateValue(month.year, month.month, day);
    return {
      key: date,
      day: String(day),
      date,
      blank: false,
      selected: date === selectedDate,
      today: date === today,
    };
  });
  return [...leading, ...days];
});

const notifyDisplays = computed(() => {
  const displays = new Map<TodoItem, NotifyDisplay>();
  const now = deadlineNow.value;
  effectiveTodoLists.value.forEach((list) => {
    getTodos(list.id).forEach((todo) => {
      const display = getNotifyDisplay(todo.notifyAt, now);
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
  refreshNotifyNow();
  document.addEventListener("pointerdown", handleFloatingEditorOutsidePointerDown, true);
  window.addEventListener("focus", refreshNotifyNow);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  deadlineClockTimer.value = window.setInterval(refreshNotifyNow, DEADLINE_CLOCK_INTERVAL_MS);
});

onUnmounted(() => {
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
  if (event.target !== event.currentTarget && !target.closest(".todo-empty-hint")) return;
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
  const list = getListById(listId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", list?.title ?? listId);
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
  emit("focus", event.currentTarget as HTMLElement);
}

function clearPendingReorder(key: string): void {
  const timer = reorderTimers.get(key);
  if (timer) window.clearTimeout(timer);
  reorderTimers.delete(key);
  pendingDoneReorderIds.value = pendingDoneReorderIds.value.filter((item) => item !== key);
}

function openMenu(event: MouseEvent, period: TodoPeriod, id: string): void {
  event.preventDefault();
  selectedMenuTodoKey.value = todoKey(period, id);
  menu.value = { x: event.clientX, y: event.clientY, period, id, anchor: event.currentTarget as HTMLElement };
}

function openTodoTextMenu(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  const target = event.currentTarget as HTMLInputElement;
  event.preventDefault();
  selectedMenuTodoKey.value = todoKey(period, todo.id);
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
  selectedMenuTodoKey.value = null;
  menu.value = { x: event.clientX, y: event.clientY, period, anchor: event.currentTarget as HTMLElement };
}

function openSectionActions(event: MouseEvent, period: TodoListId): void {
  event.preventDefault();
  event.stopPropagation();
  selectedMenuTodoKey.value = null;
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    period,
    anchor: event.currentTarget as HTMLElement,
    sectionActions: true,
  };
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
  if (!props.todoLists) {
    const legacyTitleId = legacyTodoTitleIds[listId];
    if (legacyTitleId) {
      emit("titleUpdate", legacyTitleId, value);
      return;
    }
  }
  emit("updateListTitle", listId, value);
}

function handleStarClick(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  event.preventDefault();
  event.stopPropagation();
  emit("star", { period, id: todo.id, starred: !todo.starred, anchor: event.currentTarget as HTMLElement });
}

function handleNotifyClick(event: MouseEvent, period: TodoPeriod, todo: TodoItem): void {
  event.preventDefault();
  event.stopPropagation();
  openNotifyEditor(period, todo.id, event.currentTarget as HTMLElement, todo);
}

function handleTodoDragStart(event: DragEvent, period: TodoPeriod, todo: TodoItem): void {
  dragged.value = { period, id: todo.id };
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", todo.text);
  event.dataTransfer.setData("application/x-todo-id", `${period}:${todo.id}`);
}

function openNotifyEditor(period: TodoPeriod, id: string, anchor: HTMLElement, todo = getTodoById(period, id)): void {
  const { date, time } = getNotifyEditorValues(todo);
  const { x, y } = getNotifyEditorPosition(anchor);
  selectedMenuTodoKey.value = null;
  notifyEditor.value = {
    period,
    id,
    anchor,
    date,
    month: getMonthValue(date),
    time,
    x,
    y,
  };
}

function selectNotifyMinute(minute: NotifyMinuteOption): void {
  if (!notifyEditor.value) return;
  notifyEditor.value = {
    ...notifyEditor.value,
    time: `${getSelectedNotifyHour(notifyEditor.value.time)}:${minute}` as NotifyTimeOption,
  };
}

function getNotifyEditorValues(todo?: TodoItem): { date: string; time: NotifyTimeOption } {
  if (!isValidDeadlineAt(todo?.notifyAt)) return getDefaultNotifySelection();

  const notifyDate = new Date(todo.notifyAt);
  const hour = String(notifyDate.getHours()).padStart(2, "0");
  const minute = getSupportedNotifyMinute(String(notifyDate.getMinutes()).padStart(2, "0"));
  const time = `${hour}:${minute}`;
  const supportedTime = NOTIFY_TIME_OPTIONS.includes(time as NotifyTimeOption)
    ? time as NotifyTimeOption
    : DEFAULT_NOTIFY_TIME;
  return { date: getLocalDateInputValue(notifyDate), time: supportedTime };
}

function getNotifyEditorPosition(anchor: HTMLElement): { x: number; y: number } {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || DEADLINE_EDITOR_WIDTH;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || DEADLINE_EDITOR_HEIGHT;
  const maxX = Math.max(DEADLINE_EDITOR_OFFSET, viewportWidth - DEADLINE_EDITOR_WIDTH - DEADLINE_EDITOR_OFFSET);
  const rightX = rect.right + DEADLINE_EDITOR_OFFSET;
  const fallbackLeftX = rect.left - DEADLINE_EDITOR_WIDTH - DEADLINE_EDITOR_OFFSET;
  const x = rightX <= maxX ? rightX : Math.max(DEADLINE_EDITOR_OFFSET, fallbackLeftX);
  const maxY = Math.max(DEADLINE_EDITOR_OFFSET, viewportHeight - DEADLINE_EDITOR_HEIGHT - DEADLINE_EDITOR_OFFSET);
  const y = Math.min(Math.max(DEADLINE_EDITOR_OFFSET, rect.top), maxY);
  return { x, y };
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

function selectNotifyDate(value: string): void {
  if (!notifyEditor.value) return;
  notifyEditor.value = { ...notifyEditor.value, date: value, month: getMonthValue(value) };
}

function shiftNotifyCalendarMonth(delta: number): void {
  if (!notifyEditor.value) return;
  const month = parseMonthValue(notifyEditor.value.month);
  if (!month) return;
  const next = new Date(month.year, month.month - 1 + delta, 1);
  notifyEditor.value = {
    ...notifyEditor.value,
    month: formatMonthValue(next.getFullYear(), next.getMonth() + 1),
  };
}

function getNotifyHourButtonStyle(hourValue: NotifyClockHourOption): Record<string, string> {
  const hour = Number(hourValue);
  const center = NOTIFY_CLOCK_SIZE / 2;
  const offset = NOTIFY_CLOCK_BUTTON_SIZE / 2;
  if (hour === 0) {
    return {
      left: `${center - offset}px`,
      top: `${center - offset}px`,
    };
  }
  const angle = (hour / 12) * Math.PI * 2 - Math.PI / 2;
  return {
    left: `${center + Math.cos(angle) * NOTIFY_CLOCK_RADIUS - offset}px`,
    top: `${center + Math.sin(angle) * NOTIFY_CLOCK_RADIUS - offset}px`,
  };
}

function getNotifyHourLabel(hour: NotifyClockHourOption): string {
  if (!notifyEditor.value) return hour;
  const period = getSelectedNotifyPeriod(notifyEditor.value.time);
  const minute = notifyEditor.value ? getSelectedNotifyMinute(notifyEditor.value.time) : "00";
  return getNotifyTimeLabel(`${getActualNotifyHour(period, hour)}:${minute}` as NotifyTimeOption);
}

function getSelectedNotifyHour(time: NotifyTimeOption): NotifyHourOption {
  const hour = time.slice(0, 2) as NotifyHourOption;
  return NOTIFY_HOUR_OPTIONS.includes(hour) ? hour : DEFAULT_NOTIFY_TIME.slice(0, 2) as NotifyHourOption;
}

function getSelectedNotifyPeriod(time: NotifyTimeOption): NotifyPeriodOption {
  return Number(getSelectedNotifyHour(time)) <= 12 ? "am" : "pm";
}

function getSelectedNotifyClockHour(time: NotifyTimeOption): NotifyClockHourOption {
  const actualHour = Number(getSelectedNotifyHour(time));
  const displayHour = actualHour <= 12 ? actualHour : actualHour - 12;
  const hour = String(displayHour).padStart(2, "0") as NotifyClockHourOption;
  return NOTIFY_CLOCK_HOUR_OPTIONS.includes(hour) ? hour : "09";
}

function getSelectedNotifyMinute(time: NotifyTimeOption): NotifyMinuteOption {
  return getSupportedNotifyMinute(time.slice(3, 5));
}

function selectNotifyPeriod(period: NotifyPeriodOption): void {
  if (!notifyEditor.value) return;
  const hour = getSelectedNotifyClockHour(notifyEditor.value.time);
  notifyEditor.value = {
    ...notifyEditor.value,
    time: `${getActualNotifyHour(period, hour)}:${getSelectedNotifyMinute(notifyEditor.value.time)}` as NotifyTimeOption,
  };
}

function selectNotifyClockHour(hour: NotifyClockHourOption): void {
  if (!notifyEditor.value) return;
  const period = getSelectedNotifyPeriod(notifyEditor.value.time);
  notifyEditor.value = {
    ...notifyEditor.value,
    time: `${getActualNotifyHour(period, hour)}:${getSelectedNotifyMinute(notifyEditor.value.time)}` as NotifyTimeOption,
  };
}

function getActualNotifyHour(period: NotifyPeriodOption, hour: NotifyClockHourOption): NotifyHourOption {
  const displayHour = Number(hour);
  const actualHour = period === "am" ? displayHour : displayHour + 12;
  return String(actualHour).padStart(2, "0") as NotifyHourOption;
}

function getSupportedNotifyMinute(value: string): NotifyMinuteOption {
  const minute = value as NotifyMinuteOption;
  return NOTIFY_MINUTE_OPTIONS.includes(minute) ? minute : "00";
}

function getMonthValue(dateValue: string): string {
  const parts = parseDateValue(dateValue);
  if (!parts) return formatMonthValue(new Date().getFullYear(), new Date().getMonth() + 1);
  return formatMonthValue(parts.year, parts.month);
}

function parseDateValue(dateValue: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

function parseMonthValue(monthValue: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function formatDateValue(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatMonthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function confirmNotifyEditor(): void {
  const editor = notifyEditor.value;
  if (!editor) return;
  const notifyAt = createNotifyAt(editor.date, editor.time);
  if (notifyAt === null) return;
  emit("notify", editor.period, editor.id, notifyAt, editor.anchor);
  notifyEditor.value = null;
}

function clearNotifyEditor(): void {
  const editor = notifyEditor.value;
  if (!editor) return;
  emit("notify", editor.period, editor.id, undefined, editor.anchor);
  notifyEditor.value = null;
}

function closeNotifyEditor(): void {
  notifyEditor.value = null;
}

function handleFloatingEditorOutsidePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (notifyEditor.value && !notifyEditorRef.value?.contains(target)) notifyEditor.value = null;
  if (listCreateDialog.value && !listCreateDialogRef.value?.contains(target)) listCreateDialog.value = null;
}

async function handleMenuSelect(key: string): Promise<void> {
  if (!menu.value) return;
  const { period, id, anchor, target, x, y } = menu.value;
  const list = getListById(period);
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
    emit("clearCompleted", period, anchor);
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
    const todo = getTodoById(period, id);
    closeMenu();
    openNotifyEditor(period, id, anchor, todo);
    return;
  }
  closeMenu();
  if (key === "guide" && anchor) emit("guide", "todos", anchor, true);
  if (!id) return;
  if (key === "star") {
    const todo = getTodoById(period, id);
    emit("star", { period, id, starred: !todo?.starred, anchor });
  }
  if (key === "delete") emit("remove", period, id, anchor);
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
  return Boolean(props.showCompleted?.[period]);
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
  <section class="panel todo-panel" aria-labelledby="todo-title">
    <section v-if="todayFocus.length" class="today-focus-section" aria-label="今日重点">
      <div class="today-focus-heading">
        <EditableTitle
          :id="todayFocusTitleId"
          :value="titles[todayFocusTitleId]"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </div>
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
            aria-label="完成"
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
            type="button"
            :aria-label="getTodoCompactNotifyLabel(item.todo) ? '编辑通知时间' : '设置通知时间'"
            @click="handleNotifyClick($event, item.period, item.todo)"
          >
            <span v-if="getTodoCompactNotifyLabel(item.todo)" class="todo-deadline-label">
              {{ getTodoCompactNotifyLabel(item.todo) }}
            </span>
            <NIcon v-else :component="AlarmOutline" />
          </button>
          <button
            class="todo-star-button is-starred"
            type="button"
            aria-label="取消重点"
            @click="handleStarClick($event, item.period, item.todo)"
          >
            ★
          </button>
        </li>
      </ul>
    </section>
    <div class="todo-sections">
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
          @dragstart="handleListDragStart($event, list.id)"
          @dragend="draggedListId = null"
          @dragover.prevent
          @drop="handleListSectionDrop($event, list.id)"
        >
          <span
            class="todo-list-drag-handle"
            aria-label="拖动提醒列表"
          />
          <h3>
            <EditableTitle
              :id="list.id"
              :value="list.title"
              :auto-edit="Boolean(props.todoLists && props.editListId === list.id)"
              @update="(_id, value) => handleListTitleUpdate(list.id, value)"
            />
          </h3>
          <button
            type="button"
            class="todo-collapse-button icon-button"
            :aria-label="list.collapsed ? '展开提醒列表' : '收起提醒列表'"
            @click.stop="emit('toggleListCollapsed', list.id, !list.collapsed)"
          >
            <NIcon :component="list.collapsed ? ChevronForwardOutline : ChevronDownOutline" />
          </button>
          <div class="todo-heading-actions">
            <span class="todo-count">{{ periodStats[list.id] }}</span>
            <button
              type="button"
              class="todo-section-menu-button icon-button"
              aria-label="待办菜单"
              @click="openSectionActions($event, list.id)"
            >
              ⋯
            </button>
          </div>
        </div>

        <ul
          v-if="!list.collapsed && listEntries[list.id].length === 0"
          class="todo-list todo-empty-list"
          :data-testid="`todo-list-${list.id}`"
          @click="handleListClick($event, list.id)"
          @dragover.prevent
          @drop="handleTodoTextDrop($event, list.id)"
        >
          <li
            :key="`${list.id}-empty-hint`"
            class="todo-empty-hint"
            aria-label="提醒事项 Tips"
            @click="emit('create', list.id)"
          />
        </ul>

        <TransitionGroup
          v-else-if="!list.collapsed"
          name="todo-move"
          tag="ul"
          class="todo-list"
          :class="{ 'todo-move': true }"
          :data-testid="`todo-list-${list.id}`"
          @click="handleListClick($event, list.id)"
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
                aria-label="拖动提醒事项"
                @dragstart="handleTodoDragStart($event, list.id, entry.todo)"
                @dragend="dragged = null"
              />
              <NCheckbox
                :checked="entry.todo.done"
                aria-label="完成"
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
                type="button"
                :aria-label="getTodoCompactNotifyLabel(entry.todo) ? '编辑通知时间' : '设置通知时间'"
                @click="handleNotifyClick($event, list.id, entry.todo)"
              >
                <span v-if="getTodoCompactNotifyLabel(entry.todo)" class="todo-deadline-label">
                  {{ getTodoCompactNotifyLabel(entry.todo) }}
                </span>
                <NIcon v-else :component="AlarmOutline" />
              </button>
              <button
                class="todo-star-button"
                :class="{ 'is-starred': entry.todo.starred }"
                type="button"
                :aria-label="entry.todo.starred ? '取消重点' : '设为重点'"
                @click="handleStarClick($event, list.id, entry.todo)"
              >
                {{ entry.todo.starred ? "★" : "☆" }}
              </button>
            </li>
            <li
              v-else
              class="todo-completed-divider"
            >
              <span>已完成</span>
              <button
                class="todo-completed-clear"
                type="button"
                @click.stop="emit('clearCompleted', entry.period, $event.currentTarget as HTMLElement)"
              >
                clear
              </button>
            </li>
          </template>
        </TransitionGroup>
      </section>
    </div>

    <section
      v-if="notifyEditor"
      ref="notifyEditorRef"
      class="deadline-editor notify-editor"
      :style="notifyEditorStyle"
      aria-label="设置通知时间"
    >
      <div class="deadline-editor-heading">
        <span>设置通知时间</span>
        <button
          class="deadline-close-button icon-button"
          type="button"
          aria-label="关闭通知时间选择"
          @click="closeNotifyEditor"
        >
          ×
        </button>
      </div>
        <div class="notify-editor-body">
          <div class="notify-date-column">
          <div class="notify-calendar-header">
            <button
              class="notify-calendar-nav"
              type="button"
              aria-label="上个月"
              @click="shiftNotifyCalendarMonth(-1)"
            >
              ‹
            </button>
            <span>{{ notifyCalendarTitle }}</span>
            <button
              class="notify-calendar-nav"
              type="button"
              aria-label="下个月"
              @click="shiftNotifyCalendarMonth(1)"
            >
              ›
            </button>
          </div>
          <div class="notify-calendar-weekdays" aria-hidden="true">
            <span v-for="weekday in CALENDAR_WEEKDAYS" :key="weekday">{{ weekday }}</span>
          </div>
          <div class="notify-calendar-grid" aria-label="选择通知日期">
            <template v-for="day in notifyCalendarDays" :key="day.key">
              <span
                v-if="day.blank"
                class="notify-calendar-placeholder"
              />
              <button
                v-else
                class="notify-calendar-day"
                :class="{ 'is-selected': day.selected, 'is-today': day.today }"
                type="button"
                @click="selectNotifyDate(day.date)"
              >
                {{ day.day }}
              </button>
            </template>
          </div>
        </div>
        <div class="notify-time-column">
          <span class="notify-editor-label">通知时间</span>
          <div class="notify-period-options" aria-label="选择上午或下午">
            <button
              v-for="period in NOTIFY_PERIOD_OPTIONS"
              :key="period.key"
              class="notify-period-checkbox"
              :class="{ 'is-selected': getSelectedNotifyPeriod(notifyEditor.time) === period.key }"
              type="button"
              role="checkbox"
              :aria-checked="getSelectedNotifyPeriod(notifyEditor.time) === period.key"
              @click="selectNotifyPeriod(period.key)"
            >
              {{ period.label }}
            </button>
          </div>
          <span class="notify-time-unit-title notify-hour-title">小时</span>
          <div class="deadline-time-options notify-clock-options" aria-label="选择通知时间">
            <button
              v-for="hour in NOTIFY_CLOCK_HOUR_OPTIONS"
              :key="hour"
              class="deadline-time-button notify-clock-button notify-hour-button"
              :class="[`hour-${hour}`, { 'is-selected': getSelectedNotifyClockHour(notifyEditor.time) === hour }]"
              :style="getNotifyHourButtonStyle(hour)"
              type="button"
              :aria-label="getNotifyHourLabel(hour)"
              @click="selectNotifyClockHour(hour)"
            >
              {{ Number(hour) }}
            </button>
          </div>
          <span class="notify-time-unit-title notify-minute-title">分钟</span>
          <div class="notify-minute-options" aria-label="选择通知分钟">
            <button
              v-for="minute in NOTIFY_MINUTE_OPTIONS"
              :key="minute"
              class="notify-minute-button"
              :class="{ 'is-selected': getSelectedNotifyMinute(notifyEditor.time) === minute }"
              type="button"
              @click="selectNotifyMinute(minute)"
            >
              {{ minute }}
            </button>
          </div>
        </div>
      </div>
      <div class="deadline-editor-actions">
        <button
          class="deadline-ignore-button"
          type="button"
          @click="clearNotifyEditor"
        >
          不设通知时间
        </button>
        <button
          class="deadline-confirm-button"
          type="button"
          @click="confirmNotifyEditor"
        >
          确定
        </button>
      </div>
    </section>

    <section
      v-if="listCreateDialog"
      ref="listCreateDialogRef"
      class="todo-list-create-dialog"
      :style="listCreateDialogStyle"
      aria-label="新增提醒列表"
    >
      <label class="todo-list-create-label" for="todo-list-create-input">列表名称</label>
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
        <button class="todo-list-create-cancel" type="button" @click="closeCreateListDialog">取消</button>
        <button class="todo-list-create-confirm" type="button" @click="confirmCreateListDialog">确定</button>
      </div>
    </section>

    <NDropdown
      v-if="menu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="menu.x"
      :y="menu.y"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="closeMenu"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>

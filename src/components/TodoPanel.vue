<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
import { NButton, NCheckbox, NDropdown } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { GUIDE_MENU_OPTION, TODO_PERIODS } from "../state/defaults";
import type { DraggedTodo, GuideKey, TodoCompletedVisibility, TodoItem, TodoMap, TodoPeriod } from "../types";
import { getOrderedTodos } from "../state/todos";
import EditableTitle from "./EditableTitle.vue";

const props = defineProps<{
  todos: TodoMap;
  titles: Record<string, string>;
  showCompleted?: TodoCompletedVisibility;
}>();

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  create: [period: TodoPeriod, afterId?: string];
  update: [period: TodoPeriod, id: string, text: string];
  split: [period: TodoPeriod, id: string, before: string, after: string];
  complete: [period: TodoPeriod, id: string, done: boolean, anchor?: HTMLElement];
  star: [period: TodoPeriod, id: string, starred: boolean];
  remove: [period: TodoPeriod, id: string, anchor?: HTMLElement];
  clearCompleted: [period: TodoPeriod, anchor?: HTMLElement];
  toggleCompletedVisibility: [period: TodoPeriod, showCompleted: boolean];
  blurEmpty: [period: TodoPeriod, id: string];
  blur: [];
  move: [dragged: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string];
  focus: [element: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
}>();

const focusedPeriod = ref<TodoPeriod | null>(null);
const menu = ref<{
  x: number;
  y: number;
  period: TodoPeriod;
  id?: string;
  anchor?: HTMLElement;
  target?: HTMLInputElement;
  sectionActions?: boolean;
} | null>(null);
const dragged = ref<DraggedTodo | null>(null);
const editingTodoKey = ref<string | null>(null);
const selectedMenuTodoKey = ref<string | null>(null);
const pendingDoneReorderIds = ref<string[]>([]);
const reorderTimers = new Map<string, number>();
const lastTodoCarets = new Map<string, number>();
const lastTodoSelections = new Map<string, { start: number; end: number }>();
const todoSectionRefs = new Map<TodoPeriod, HTMLElement>();
const guideMenuOption: DropdownOption = { ...GUIDE_MENU_OPTION, label: GUIDE_MENU_OPTION.label || "Tips" };
const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value?.sectionActions) {
    const period = menu.value.period;
    return [
      { label: isCompletedVisible(period) ? "隐藏已完成" : "显示已完成", key: "toggle-completed" },
      { label: "清理已完成", key: "clear-completed" },
      guideMenuOption,
    ];
  }
  const options: DropdownOption[] = [];
  const todo = getMenuTodo();
  if (menu.value?.id) {
    options.push({ label: "复制", key: "copy" });
    if (menu.value.target && canPasteTodoText(menu.value.period, menu.value.id, menu.value.target)) {
      options.push({ label: "粘贴", key: "paste" });
    }
    options.push({ label: "删除", key: "delete" });
    options.push({ label: todo?.starred ? "取消星标" : "星标", key: "star" });
  }
  options.push(guideMenuOption);
  return options;
});

const periodLabels: Record<TodoPeriod, string> = {
  morning: "todo-morning-title",
  noon: "todo-noon-title",
  evening: "todo-evening-title",
};
const todayFocusTitleId = "today-focus-title";

const ordered = computed(() =>
  Object.fromEntries(
    TODO_PERIODS.map((period) => {
      const deferredIds = new Set(
        pendingDoneReorderIds.value
          .filter((key) => key.startsWith(`${period}:`))
          .map((key) => key.slice(period.length + 1)),
      );
      return [period, getOrderedTodos(props.todos[period], deferredIds)];
    }),
  ) as TodoMap,
);

const periodStats = computed(() =>
  Object.fromEntries(
    TODO_PERIODS.map((period) => {
      const total = props.todos[period].length;
      const done = props.todos[period].filter((todo) => todo.done).length;
      return [period, `${done}/${total}`];
    }),
  ) as Record<TodoPeriod, string>,
);

const todayFocus = computed(() =>
  TODO_PERIODS.flatMap((period) =>
    ordered.value[period]
      .filter((todo) => todo.starred)
      .map((todo) => ({ period, todo })),
  ),
);

const visibleOrdered = computed(() =>
  Object.fromEntries(
    TODO_PERIODS.map((period) => {
      const deferredIds = new Set(
        pendingDoneReorderIds.value
          .filter((key) => key.startsWith(`${period}:`))
          .map((key) => key.slice(period.length + 1)),
      );
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
  | { type: "divider"; id: string }
  | { type: "todo"; todo: TodoItem };

const listEntries = computed(() =>
  Object.fromEntries(
    TODO_PERIODS.map((period) => [period, buildTodoListEntries(visibleOrdered.value[period], getDeferredTodoIds(period))]),
  ) as Record<TodoPeriod, TodoListEntry[]>,
);

onUnmounted(() => {
  reorderTimers.forEach((timer) => window.clearTimeout(timer));
});

function handleListClick(event: MouseEvent, period: TodoPeriod): void {
  const target = event.target as HTMLElement;
  if (event.target !== event.currentTarget && !target.closest(".todo-empty-hint")) return;
  emit("create", period);
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
  focusedPeriod.value = null;
  if (editingTodoKey.value === todoKey(period, id)) editingTodoKey.value = null;
  emit("blurEmpty", period, id);
  emit("blur");
}

function handleInputFocus(period: TodoPeriod, todo: TodoItem, event: FocusEvent): void {
  focusedPeriod.value = period;
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
  if (!hasAnyClipboardMethod()) {
    closeMenu();
    return;
  }
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

function openSectionActions(event: MouseEvent, period: TodoPeriod): void {
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

async function handleMenuSelect(key: string): Promise<void> {
  if (!menu.value) return;
  const { period, id, anchor, target } = menu.value;
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
  closeMenu();
  if (key === "guide" && anchor) emit("guide", "todos", anchor, true);
  if (!id) return;
  if (key === "star") emit("star", period, id, !getTodoById(period, id)?.starred);
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
  return props.todos[period].find((item) => item.id === id);
}

function isTodoHighlighted(period: TodoPeriod, id: string): boolean {
  const key = todoKey(period, id);
  return (
    selectedMenuTodoKey.value === key ||
    editingTodoKey.value === key ||
    (dragged.value?.period === period && dragged.value.id === id)
  );
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

function hasAnyClipboardMethod(): boolean {
  return typeof navigator.clipboard?.readText === "function" || typeof navigator.clipboard?.writeText === "function";
}

async function startTodoEdit(event: MouseEvent, period: TodoPeriod, id: string): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const key = todoKey(period, id);
  if (editingTodoKey.value === key) return;
  if (hasSelection(input)) {
    rememberTodoSelection(period, id, input);
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
  rememberTodoSelection(period, id, event.currentTarget as HTMLInputElement);
}

function setTodoSectionRef(period: TodoPeriod, element: Element | null): void {
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

function isCompletedVisible(period: TodoPeriod): boolean {
  return Boolean(props.showCompleted?.[period]);
}

function getDeferredTodoIds(period: TodoPeriod): Set<string> {
  return new Set(
    pendingDoneReorderIds.value
      .filter((key) => key.startsWith(`${period}:`))
      .map((key) => key.slice(period.length + 1)),
  );
}

function buildTodoListEntries(todos: TodoItem[], deferredDoneIds: ReadonlySet<string> = new Set()): TodoListEntry[] {
  const entries: TodoListEntry[] = [];
  let completedDividerAdded = false;
  todos.forEach((todo) => {
    if (todo.done && !deferredDoneIds.has(todo.id) && !completedDividerAdded) {
      entries.push({ type: "divider", id: `completed-${todo.id}` });
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
          :class="{ 'is-done': item.todo.done, 'is-completing': pendingDoneReorderIds.includes(`${item.period}:${item.todo.id}`), 'is-menu-selected': isTodoHighlighted(item.period, item.todo.id) }"
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
            class="todo-star-button is-starred"
            type="button"
            aria-label="取消重点"
            @click.stop="emit('star', item.period, item.todo.id, false)"
          >
            ★
          </button>
        </li>
      </ul>
    </section>
    <div class="todo-sections">
      <section
        v-for="period in TODO_PERIODS"
        :key="period"
        :ref="(element) => setTodoSectionRef(period, element as Element | null)"
        class="todo-section"
        :class="{ 'is-focused': focusedPeriod === period }"
        :data-period="period"
        @click="handleSectionGuideClick"
        @contextmenu="openSectionMenu($event, period)"
        @dragover.prevent
        @drop="dragged && emit('move', dragged, period)"
      >
        <div class="todo-heading">
          <h3>
            <EditableTitle
              :id="periodLabels[period]"
              :value="titles[periodLabels[period]]"
              @update="(id, value) => emit('titleUpdate', id, value)"
            />
          </h3>
          <div class="todo-heading-actions">
            <span class="todo-count">{{ periodStats[period] }}</span>
            <button
              type="button"
              class="todo-section-menu-button icon-button"
              aria-label="待办菜单"
              @click="openSectionActions($event, period)"
            >
              ⋯
            </button>
          </div>
        </div>

        <ul
          v-if="listEntries[period].length === 0"
          class="todo-list todo-empty-list"
          :data-testid="`todo-list-${period}`"
          @click="handleListClick($event, period)"
        >
          <li
            :key="`${period}-empty-hint`"
            class="todo-empty-hint"
            aria-label="提醒事项 Tips"
            @click="emit('create', period)"
          />
        </ul>

        <TransitionGroup
          v-else
          name="todo-move"
          tag="ul"
          class="todo-list"
          :class="{ 'todo-move': true }"
          :data-testid="`todo-list-${period}`"
          @click="handleListClick($event, period)"
        >
          <template
            v-for="entry in listEntries[period]"
            :key="entry.type === 'todo' ? entry.todo.id : entry.id"
          >
            <li
              v-if="entry.type === 'todo'"
              class="todo-item"
              :class="{ 'is-done': entry.todo.done, 'is-starred': entry.todo.starred, 'is-menu-selected': isTodoHighlighted(period, entry.todo.id) }"
              @contextmenu.stop="openMenu($event, period, entry.todo.id)"
              @dragover.prevent
              @drop.stop="dragged && emit('move', dragged, period, entry.todo.id)"
            >
              <button
                class="todo-drag-handle"
                type="button"
                draggable="true"
                aria-label="拖动提醒事项"
                @dragstart="dragged = { period, id: entry.todo.id }"
                @dragend="dragged = null"
              />
              <NCheckbox
                :checked="entry.todo.done"
                aria-label="完成"
                @update:checked="(checked) => handleChecked(period, entry.todo.id, checked)"
              />
              <input
                class="todo-input"
                :data-testid="`todo-input-${period}`"
                :data-todo-id="entry.todo.id"
                :value="entry.todo.text"
                :readonly="!isTodoEditable(period, entry.todo)"
                draggable="false"
                @input="emit('update', period, entry.todo.id, ($event.target as HTMLInputElement).value)"
                @keydown.enter="handleEnter($event, period, entry.todo)"
                @mouseup="rememberTodoCaret(period, entry.todo.id, $event)"
                @select="handleTodoSelection(period, entry.todo.id, $event)"
                @contextmenu.stop="openTodoTextMenu($event, period, entry.todo)"
                @click="startTodoEdit($event, period, entry.todo.id)"
                @focus="handleInputFocus(period, entry.todo, $event)"
                @blur="handleInputBlur(period, entry.todo.id)"
              />
              <button
                class="todo-star-button"
                :class="{ 'is-starred': entry.todo.starred }"
                type="button"
                :aria-label="entry.todo.starred ? '取消重点' : '设为重点'"
                @click.stop="emit('star', period, entry.todo.id, !entry.todo.starred)"
              >
                {{ entry.todo.starred ? "★" : "☆" }}
              </button>
            </li>
            <li
              v-else
              class="todo-completed-divider"
            >
              已完成
            </li>
          </template>
        </TransitionGroup>
      </section>
    </div>

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

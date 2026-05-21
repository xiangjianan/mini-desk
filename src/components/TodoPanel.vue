<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
import { NButton, NCheckbox, NDropdown } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { EMPTY_HINTS, GUIDE_MENU_OPTION, TODO_PERIODS } from "../state/defaults";
import type { DraggedTodo, GuideKey, TodoItem, TodoMap, TodoPeriod } from "../types";
import { getOrderedTodos } from "../state/todos";
import EditableTitle from "./EditableTitle.vue";

const props = defineProps<{
  todos: TodoMap;
  titles: Record<string, string>;
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
} | null>(null);
const dragged = ref<DraggedTodo | null>(null);
const editingTodoKey = ref<string | null>(null);
const selectedMenuTodoKey = ref<string | null>(null);
const pendingDoneReorderIds = ref<string[]>([]);
const reorderTimers = new Map<string, number>();
const lastTodoCarets = new Map<string, number>();
const lastTodoSelections = new Map<string, { start: number; end: number }>();
const todoSectionRefs = new Map<TodoPeriod, HTMLElement>();
const guideMenuOption: DropdownOption = { ...GUIDE_MENU_OPTION, label: GUIDE_MENU_OPTION.label || "使用指南" };
const menuOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [];
  const target = menu.value?.target;
  const todo = getMenuTodo();
  if (target && menu.value?.id && canCopyTextSelection(menu.value.period, menu.value.id, target)) {
    options.push({ label: "复制", key: "copy" });
  }
  if (target && isMenuTodoEditable()) options.push({ label: "粘贴", key: "paste" });
  if (menu.value?.id) {
    options.push({ label: todo?.starred ? "取消重点" : "设为重点", key: "star" });
    options.push({ label: "置顶", key: "top" });
    options.push({ label: "置底", key: "bottom" });
  }
  if (menu.value?.id) options.push({ label: "删除", key: "delete" });
  options.push(guideMenuOption);
  return options;
});

const periodLabels: Record<TodoPeriod, string> = {
  morning: "todo-morning-title",
  noon: "todo-noon-title",
  evening: "todo-evening-title",
};

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

type TodoListEntry =
  | { type: "divider"; id: string }
  | { type: "todo"; todo: TodoItem };

const listEntries = computed(() =>
  Object.fromEntries(
    TODO_PERIODS.map((period) => [period, buildTodoListEntries(ordered.value[period])]),
  ) as Record<TodoPeriod, TodoListEntry[]>,
);

onUnmounted(() => {
  reorderTimers.forEach((timer) => window.clearTimeout(timer));
});

function handleListDoubleClick(event: MouseEvent, period: TodoPeriod): void {
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
  event.preventDefault();
  selectedMenuTodoKey.value = todoKey(period, todo.id);
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    period,
    id: todo.id,
    anchor: event.currentTarget as HTMLElement,
    target: event.currentTarget as HTMLInputElement,
  };
}

function openSectionMenu(event: MouseEvent, period: TodoPeriod): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .todo-item")) return;
  event.preventDefault();
  selectedMenuTodoKey.value = null;
  menu.value = { x: event.clientX, y: event.clientY, period, anchor: event.currentTarget as HTMLElement };
}

function closeMenu(): void {
  menu.value = null;
  selectedMenuTodoKey.value = null;
}

async function handleMenuSelect(key: string): Promise<void> {
  if (!menu.value) return;
  const { period, id, anchor, target } = menu.value;
  if (key === "copy" && target) {
    await copyTextSelection(target);
    closeMenu();
    return;
  }
  closeMenu();
  if (key === "paste" && id && target) {
    await pasteTextFromClipboard(period, id, target);
    return;
  }
  if (key === "guide" && anchor) emit("guide", "todos", anchor, true);
  if (!id) return;
  if (key === "star") emit("star", period, id, !getTodoById(period, id)?.starred);
  if (key === "top") moveTodoToTop(period, id);
  if (key === "bottom") emit("move", { period, id }, period);
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

function moveTodoToTop(period: TodoPeriod, id: string): void {
  const first = ordered.value[period].find((todo) => todo.id !== id);
  if (!first) return;
  emit("move", { period, id }, period, first.id);
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

async function copyTextSelection(target: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
  const current = menu.value;
  const { start, end } = target instanceof HTMLInputElement && current?.id
    ? getTodoSelectionRange(current.period, current.id, target)
    : { start: target.selectionStart ?? 0, end: target.selectionEnd ?? target.selectionStart ?? 0 };
  const selectedText = target.value.slice(start, end);
  if (!selectedText) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(selectedText);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = selectedText;
  document.body.append(textarea);
  textarea.setSelectionRange(0, textarea.value.length);
  document.execCommand("copy");
  textarea.remove();
}

async function pasteTextFromClipboard(period: TodoPeriod, id: string, target: HTMLInputElement): Promise<void> {
  const pastedText = await navigator.clipboard?.readText?.();
  if (!pastedText) return;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  target.setRangeText(pastedText, start, end, "end");
  emit("update", period, id, target.value);
}

async function startTodoEdit(event: MouseEvent, period: TodoPeriod, id: string): Promise<void> {
  event.preventDefault();
  const input = event.currentTarget as HTMLInputElement;
  const key = todoKey(period, id);
  const caret = lastTodoCarets.get(key) ?? input.selectionStart ?? input.value.length;
  editingTodoKey.value = todoKey(period, id);
  await nextTick();
  input.focus({ preventScroll: true });
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

function buildTodoListEntries(todos: TodoItem[]): TodoListEntry[] {
  const entries: TodoListEntry[] = [];
  let completedDividerAdded = false;
  todos.forEach((todo) => {
    if (todo.done && !completedDividerAdded) {
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
      <div class="today-focus-heading">今日重点</div>
      <ul class="today-focus-list">
        <li
          v-for="item in todayFocus"
          :key="`${item.period}-${item.todo.id}`"
          class="today-focus-item"
          :class="{ 'is-done': item.todo.done }"
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
            @keydown.enter.prevent="handleEnter($event, item.period, item.todo)"
            @mouseup="rememberTodoCaret(item.period, item.todo.id, $event)"
            @select="handleTodoSelection(item.period, item.todo.id, $event)"
            @dblclick="startTodoEdit($event, item.period, item.todo.id)"
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
            <NButton
              quaternary
              size="tiny"
              class="clear-completed-button icon-button"
              aria-label="清已完成"
              @click="emit('clearCompleted', period, $event.currentTarget as HTMLElement)"
            >
              <svg class="clear-completed-icon" viewBox="0 0 1024 1024" aria-hidden="true">
                <path d="M786.6 715.9c-5.1 0-10.3-1.3-15.1-4.1L295.4 434.7c-14.3-8.3-19.2-26.7-10.8-41 8.3-14.3 26.7-19.2 41-10.8L801.7 660c14.3 8.3 19.2 26.7 10.8 41-5.6 9.5-15.6 14.9-25.9 14.9z" />
                <path d="M629.3 960c-14.7 0-29.3-4.2-42.1-11.6L186.1 714.7c-40-23.3-53.8-75.1-30.7-115.4l166.4-290.5c15-26.1 42.9-42.4 72.9-42.4 14.7 0 29.3 3.9 42.1 11.4l113.2 66 129-225.2c19.1-33.4 54.8-54.1 93.1-54.1 18.8 0 37.4 5 53.7 14.5 51.1 29.8 68.8 95.9 39.3 147.4L735.9 452l102 59.4c40 23.3 53.8 75 30.7 115.3L702.2 917.4c-14.9 26.1-42.9 42.6-72.9 42.6zM394.7 326.4c-8.6 0-16.5 4.7-20.8 12.2L207.5 629.1c-6.7 11.8-2.8 26.9 8.9 33.6l401.1 233.5c3.7 2.1 7.7 3.2 11.9 3.2 8.6 0 16.5-4.7 20.8-12.2l166.4-290.5c6.7-11.8 2.8-26.9-8.8-33.6L680 488.8c-14.2-8.3-19.1-26.5-10.9-40.8L813 196.6c13.2-23 5.4-52.5-17.4-65.7-7.2-4.2-15.3-6.4-23.5-6.4-16.9 0-32.6 9.2-41 23.9l-144 251.4c-4 6.9-10.5 12-18.3 14.1-7.7 2.1-15.9 1-22.9-3.1l-139.4-81.1c-3.6-2.2-7.6-3.3-11.8-3.3z" />
              </svg>
            </NButton>
          </div>
        </div>

        <ul
          v-if="todos[period].length === 0"
          class="todo-list todo-empty-list"
          :data-testid="`todo-list-${period}`"
          @dblclick="handleListDoubleClick($event, period)"
        >
          <li
            :key="`${period}-empty-hint`"
            class="todo-empty-hint"
            @dblclick="emit('create', period)"
          >
            {{ EMPTY_HINTS.todos[period] }}
          </li>
        </ul>

        <TransitionGroup
          v-else
          name="todo-move"
          tag="ul"
          class="todo-list"
          :class="{ 'todo-move': true }"
          :data-testid="`todo-list-${period}`"
          @dblclick="handleListDoubleClick($event, period)"
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
                @keydown.enter.prevent="handleEnter($event, period, entry.todo)"
                @mouseup="rememberTodoCaret(period, entry.todo.id, $event)"
                @select="handleTodoSelection(period, entry.todo.id, $event)"
                @contextmenu.stop="openTodoTextMenu($event, period, entry.todo)"
                @dblclick="startTodoEdit($event, period, entry.todo.id)"
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

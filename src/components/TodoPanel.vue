<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { NButton, NCheckbox, NDropdown } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { TODO_PERIODS } from "../state/defaults";
import type { DraggedTodo, GuideKey, TodoMap, TodoPeriod } from "../types";
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
  complete: [period: TodoPeriod, id: string, done: boolean];
  remove: [period: TodoPeriod, id: string, anchor?: HTMLElement];
  clearCompleted: [period: TodoPeriod, anchor?: HTMLElement];
  blurEmpty: [period: TodoPeriod, id: string];
  blur: [];
  move: [dragged: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string];
  focus: [element: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();

const focusedPeriod = ref<TodoPeriod | null>(null);
const menu = ref<{ x: number; y: number; period: TodoPeriod; id: string; anchor?: HTMLElement } | null>(null);
const dragged = ref<DraggedTodo | null>(null);
const pendingDoneReorderIds = ref<string[]>([]);
const reorderTimers = new Map<string, number>();
const menuOptions: DropdownOption[] = [{ label: "删除", key: "delete" }];

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

onUnmounted(() => {
  reorderTimers.forEach((timer) => window.clearTimeout(timer));
});

function handleListClick(event: MouseEvent, period: TodoPeriod): void {
  if (event.target !== event.currentTarget) return;
  if (props.todos[period].length > 0) return;
  emit("create", period);
}

function handleSectionGuideClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .todo-list")) return;
  emit("guide", "todos", event.currentTarget as HTMLElement);
}

function handleEnter(period: TodoPeriod, id: string): void {
  emit("create", period, id);
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
  emit("complete", period, id, checked);
}

function handleInputBlur(period: TodoPeriod, id: string): void {
  focusedPeriod.value = null;
  emit("blurEmpty", period, id);
  emit("blur");
}

function clearPendingReorder(key: string): void {
  const timer = reorderTimers.get(key);
  if (timer) window.clearTimeout(timer);
  reorderTimers.delete(key);
  pendingDoneReorderIds.value = pendingDoneReorderIds.value.filter((item) => item !== key);
}

function openMenu(event: MouseEvent, period: TodoPeriod, id: string): void {
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY, period, id, anchor: event.currentTarget as HTMLElement };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  if (!menu.value) return;
  const { period, id, anchor } = menu.value;
  closeMenu();
  if (key === "delete") emit("remove", period, id, anchor);
}
</script>

<template>
  <section class="panel todo-panel" aria-labelledby="todo-title">
    <div class="todo-sections">
      <section
        v-for="period in TODO_PERIODS"
        :key="period"
        class="todo-section"
        :class="{ 'is-focused': focusedPeriod === period }"
        :data-period="period"
        @click="handleSectionGuideClick"
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
            <span class="todo-count">{{ todos[period].length }}</span>
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

        <TransitionGroup
          name="todo-move"
          tag="ul"
          class="todo-list"
          :class="{ 'todo-move': true }"
          :data-testid="`todo-list-${period}`"
          @click="handleListClick($event, period)"
        >
          <li
            v-for="todo in ordered[period]"
            :key="todo.id"
            class="todo-item"
            :class="{ 'is-done': todo.done }"
            draggable="true"
            @contextmenu="openMenu($event, period, todo.id)"
            @dragstart="dragged = { period, id: todo.id }"
            @dragover.prevent
            @drop.stop="dragged && emit('move', dragged, period, todo.id)"
            @dragend="dragged = null"
          >
            <NCheckbox
              :checked="todo.done"
              aria-label="完成"
              @update:checked="(checked) => handleChecked(period, todo.id, checked)"
            />
            <input
              class="todo-input"
              :data-testid="`todo-input-${period}`"
              :value="todo.text"
              @input="emit('update', period, todo.id, ($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="handleEnter(period, todo.id)"
              @focus="focusedPeriod = period; emit('focus', $event.currentTarget as HTMLElement)"
              @blur="handleInputBlur(period, todo.id)"
            />
          </li>
        </TransitionGroup>
      </section>
    </div>

    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :show="Boolean(menu)"
      :x="menu?.x"
      :y="menu?.y"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="closeMenu"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu?.x ?? 0}px`, top: `${menu?.y ?? 0}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>

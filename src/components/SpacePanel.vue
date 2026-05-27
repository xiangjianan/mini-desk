<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { NDropdown } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import type { GuideKey, LineItem, WorkspaceSpace } from "../types";
import TextPanel from "./TextPanel.vue";

const props = defineProps<{
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  editSpaceId?: string | null;
}>();

const emit = defineEmits<{
  activate: [id: string];
  create: [];
  rename: [id: string, title: string];
  editDone: [id: string];
  update: [id: string, lines: LineItem[]];
  delete: [id: string];
  reorder: [dragId: string, targetId: string];
  focus: [key: GuideKey, element: HTMLElement];
  blur: [];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
}>();

const editingSpaceId = ref<string | null>(null);
const editingTitle = ref("");
const titleComposing = ref(false);
const draggedSpaceId = ref<string | null>(null);
const menu = ref<{ x: number; y: number; spaceId: string } | null>(null);

const activeSpace = computed(() =>
  props.spaces.find((space) => space.id === props.activeSpaceId) ?? props.spaces[0],
);

const canDeleteSpaces = computed(() => props.spaces.length > 1);
const menuOptions = computed<DropdownOption[]>(() => [
  { label: "编辑", key: "edit" },
  { label: "删除", key: "delete", disabled: !canDeleteSpaces.value },
]);

function handleRename(_titleId: string, title: string): void {
  if (!activeSpace.value) return;
  emit("rename", activeSpace.value.id, title);
}

function handleUpdate(lines: LineItem[]): void {
  if (!activeSpace.value) return;
  emit("update", activeSpace.value.id, lines);
}

function getSpace(id: string): WorkspaceSpace | undefined {
  return props.spaces.find((space) => space.id === id);
}

function startTabEdit(id: string): void {
  const space = getSpace(id);
  if (!space) return;
  closeMenu();
  titleComposing.value = false;
  editingSpaceId.value = id;
  editingTitle.value = space.title;
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(".space-tab-edit-input");
    input?.focus({ preventScroll: true });
    input?.select();
  });
}

watch(
  () => props.editSpaceId,
  (id) => {
    if (!id) return;
    if (!props.spaces.some((space) => space.id === id)) return;
    startTabEdit(id);
  },
  { immediate: true },
);

function commitTabEdit(): void {
  const id = editingSpaceId.value;
  if (!id) return;
  const title = editingTitle.value.trim();
  titleComposing.value = false;
  editingSpaceId.value = null;
  editingTitle.value = "";
  if (title) emit("rename", id, title);
  emit("editDone", id);
}

function cancelTabEdit(): void {
  const id = editingSpaceId.value;
  titleComposing.value = false;
  editingSpaceId.value = null;
  editingTitle.value = "";
  if (id) emit("editDone", id);
}

function handleTabEditEnter(event: KeyboardEvent): void {
  if (titleComposing.value || event.isComposing || event.key === "Process" || event.keyCode === 229) return;
  event.preventDefault();
  commitTabEdit();
}

function openTabMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY, spaceId: id };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  const current = menu.value;
  if (!current) return;
  closeMenu();
  if (key === "edit") {
    startTabEdit(current.spaceId);
    return;
  }
  if (key === "delete" && canDeleteSpaces.value) emit("delete", current.spaceId);
}

function handleDragStart(event: DragEvent, id: string): void {
  draggedSpaceId.value = id;
  event.dataTransfer?.setData("text/plain", id);
  event.dataTransfer?.setDragImage?.(event.currentTarget as Element, 0, 0);
}

function handleDrop(id: string): void {
  const dragId = draggedSpaceId.value;
  if (!dragId || dragId === id) return;
  emit("reorder", dragId, id);
}

function handleTabsWheel(event: WheelEvent): void {
  const tabs = event.currentTarget as HTMLElement;
  if (tabs.scrollWidth <= tabs.clientWidth) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  tabs.scrollLeft += delta;
}
</script>

<template>
  <section class="panel space-panel" aria-label="空间">
    <div class="space-tabs" role="tablist" aria-label="空间列表" @wheel="handleTabsWheel">
      <template v-for="space in spaces" :key="space.id">
        <button
          v-if="editingSpaceId !== space.id"
          class="space-tab"
          :class="{ 'is-active': space.id === activeSpaceId, 'is-dragging': draggedSpaceId === space.id }"
          type="button"
          role="tab"
          draggable="true"
          :aria-selected="space.id === activeSpaceId"
          @click="emit('activate', space.id)"
          @dblclick.stop="startTabEdit(space.id)"
          @contextmenu.stop.prevent="openTabMenu($event, space.id)"
          @dragstart="handleDragStart($event, space.id)"
          @dragend="draggedSpaceId = null"
          @dragover.prevent
          @drop.stop.prevent="handleDrop(space.id)"
        >
          {{ space.title }}
        </button>
        <input
          v-else
          v-model="editingTitle"
          class="space-tab-edit-input"
          aria-label="编辑空间名称"
          @compositionstart="titleComposing = true"
          @compositionend="titleComposing = false"
          @keydown.enter="handleTabEditEnter"
          @keydown.esc.prevent="cancelTabEdit"
          @blur="commitTabEdit"
        />
      </template>
      <button
        class="space-add-button icon-button"
        type="button"
        aria-label="新增空间"
        @click="emit('create')"
      >
        +
      </button>
    </div>

    <div class="space-text-stage">
      <Transition name="space-panel-switch" mode="out-in" :duration="180">
        <TextPanel
          v-if="activeSpace"
          :key="activeSpace.id"
          class="space-text-panel"
          :title-id="`space-${activeSpace.id}-title`"
          :title="activeSpace.title"
          :lines="activeSpace.lines"
          hide-header
          @title-update="handleRename"
          @update="handleUpdate"
          @focus="emit('focus', 'workspace', $event)"
          @guide="(anchor, immediate) => emit('guide', 'workspace', anchor, immediate)"
          @blur="emit('blur')"
        />
      </Transition>
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

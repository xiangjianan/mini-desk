<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { NDropdown, NIcon } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { CreateOutline } from "@vicons/ionicons5";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";

const props = withDefaults(defineProps<{
  id: string;
  value: string;
  autoEdit?: boolean;
  editLabel?: string;
  menuEnabled?: boolean;
}>(), {
  editLabel: "重命名",
  menuEnabled: true,
});

const emit = defineEmits<{
  update: [id: string, value: string];
}>();

const editing = ref(false);
const draft = ref(props.value);
const inputRef = ref<HTMLInputElement | null>(null);
const composing = ref(false);
const menu = ref<{ x: number; y: number } | null>(null);
const menuOptions = computed<DropdownOption[]>(() => [{ label: props.editLabel, key: "edit", icon: renderIcon(CreateOutline) }]);

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
const exclusiveMenu = createExclusiveContextMenu(closeMenu);

onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);

watch(
  () => props.value,
  (value) => {
    draft.value = value;
  },
);

watch(
  () => props.autoEdit,
  (autoEdit) => {
    if (autoEdit) void enterEditing();
  },
  { immediate: true },
);

async function enterEditing(): Promise<void> {
  closeMenu();
  composing.value = false;
  editing.value = true;
  await nextTick();
  const input = inputRef.value;
  if (!input) return;
  const caret = input.value.length;
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
  window.setTimeout(() => {
    if (document.activeElement === input) input.setSelectionRange(caret, caret);
  });
}

async function startEditing(event: MouseEvent): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  await enterEditing();
}

function openMenu(event: MouseEvent): void {
  if (!props.menuEnabled) return;
  event.preventDefault();
  event.stopPropagation();
  openMenuAt(event.clientX, event.clientY, event);
}

function openMenuAt(x: number, y: number, event?: Event): void {
  if (!props.menuEnabled) return;
  if (editing.value) return;
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x, y };
}

function closeMenu(): void {
  menu.value = null;
}

async function handleMenuSelect(key: string): Promise<void> {
  closeMenu();
  if (key === "edit") await enterEditing();
}

function commit(): void {
  const value = draft.value.trim() || props.value;
  composing.value = false;
  editing.value = false;
  closeMenu();
  emit("update", props.id, value);
}

function cancel(): void {
  composing.value = false;
  editing.value = false;
  closeMenu();
}

function handleEnter(event: KeyboardEvent): void {
  if (composing.value || event.isComposing || event.key === "Process" || event.keyCode === 229) return;
  event.preventDefault();
  commit();
}

defineExpose({ openMenuAt });
</script>

<template>
  <input
    v-if="editing"
    ref="inputRef"
    v-model="draft"
    class="title-edit-input"
    @compositionstart="composing = true"
    @compositionend="composing = false"
    @keydown.enter="handleEnter"
    @keydown.esc.prevent="cancel"
    @blur="commit"
  />
  <span v-else class="editable-title" @dblclick="startEditing" @contextmenu="openMenu">{{ value }}</span>
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
</template>

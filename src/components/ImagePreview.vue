<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { ChevronBackOutline, ChevronForwardOutline, CloseOutline, CopyOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
import { NButton, NDropdown, NIcon, NModal } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { getUiText } from "../state/i18n";
import type { AppLanguage, StoredImage } from "../types";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";

const props = withDefaults(defineProps<{
  images: StoredImage[];
  activeId?: string;
  language?: AppLanguage;
  closing?: boolean;
}>(), {
  language: "zh",
  closing: false,
});

const emit = defineEmits<{
  close: [];
  copy: [id: string];
  delete: [id: string, anchor?: HTMLElement];
  navigate: [direction: number];
}>();

const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
const localClosing = ref(false);
const start = ref({ x: 0, y: 0, ox: 0, oy: 0 });
const menu = ref<{ x: number; y: number; id: string; anchor?: HTMLElement } | null>(null);
let closeTimer: number | undefined;

const uiText = computed(() => getUiText(props.language));
const active = computed(() => props.images.find((image) => image.id === props.activeId));
const activeIndex = computed(() => props.images.findIndex((image) => image.id === props.activeId));
const canNavigatePrevious = computed(() => activeIndex.value > 0);
const canNavigateNext = computed(() => activeIndex.value >= 0 && activeIndex.value < props.images.length - 1);
const isClosing = computed(() => props.closing || localClosing.value);
const menuOptions = computed<DropdownOption[]>(() => [
  { label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) },
  { label: uiText.value.preview.close, key: "close", icon: renderIcon(CloseOutline) },
  { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) },
  { label: uiText.value.common.tips, key: "tips", icon: renderIcon(HelpCircleOutline) },
]);
const exclusiveMenu = createExclusiveContextMenu(closeMenu);

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

onMounted(exclusiveMenu.mount);
onUnmounted(() => {
  exclusiveMenu.unmount();
  window.clearTimeout(closeTimer);
});

watch(
  () => props.activeId,
  () => {
    window.clearTimeout(closeTimer);
    closeTimer = undefined;
    localClosing.value = false;
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
  },
);

function requestClose(): void {
  if (localClosing.value || props.closing) return;
  closeMenu();
  dragging.value = false;
  localClosing.value = true;
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    closeTimer = undefined;
    emit("close");
  }, 220);
}

function wheel(event: WheelEvent): void {
  event.preventDefault();
  if (event.deltaY === 0) return;
  navigate(event.deltaY > 0 ? 1 : -1);
}

function navigate(direction: number): void {
  if (direction < 0 && !canNavigatePrevious.value) return;
  if (direction > 0 && !canNavigateNext.value) return;
  closeMenu();
  emit("navigate", direction);
}

function down(event: MouseEvent): void {
  dragging.value = true;
  start.value = { x: event.clientX, y: event.clientY, ox: offset.value.x, oy: offset.value.y };
}

function move(event: MouseEvent): void {
  if (!dragging.value) return;
  offset.value = {
    x: start.value.ox + event.clientX - start.value.x,
    y: start.value.oy + event.clientY - start.value.y,
  };
}

function openMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  const current = menu.value;
  if (!current) return;
  closeMenu();
  if (key === "tips") {
    window.alert(uiText.value.preview.help);
    return;
  }
  if (key === "copy") emit("copy", current.id);
  if (key === "close") requestClose();
  if (key === "delete") emit("delete", current.id, current.anchor);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!active.value) return;
  if (event.key === "Escape" || event.key === " ") {
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    emit("copy", active.value.id);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    emit("delete", active.value.id);
  }
}

</script>

<template>
  <NModal
    v-if="active"
    :show="true"
    :mask-closable="false"
    :auto-focus="false"
    :trap-focus="false"
    :block-scroll="false"
    :mask-style="{ pointerEvents: 'none' }"
    @update:show="(show) => !show && requestClose()"
  >
    <div
      class="image-preview"
      :class="{ 'is-closing': isClosing }"
      aria-hidden="false"
      tabindex="0"
      @mousemove="move"
      @mouseup="dragging = false"
      @mouseleave="dragging = false"
      @keydown="handleKeydown"
      @contextmenu.prevent="openMenu($event, active.id)"
    >
      <main class="preview-main">
        <button
          type="button"
          class="preview-close-button"
          :aria-label="uiText.preview.close"
          @click.stop.prevent="requestClose"
          @keydown.enter.stop.prevent="requestClose"
          @keydown.space.stop.prevent="requestClose"
        >
          <NIcon size="20">
            <CloseOutline />
          </NIcon>
        </button>
        <button
          type="button"
          class="preview-nav-button is-previous"
          :aria-label="uiText.preview.previous"
          :disabled="!canNavigatePrevious"
          @click="navigate(-1)"
        >
          <NIcon size="24">
            <ChevronBackOutline />
          </NIcon>
        </button>
        <button
          type="button"
          class="preview-nav-button is-next"
          :aria-label="uiText.preview.next"
          :disabled="!canNavigateNext"
          @click="navigate(1)"
        >
          <NIcon size="24">
            <ChevronForwardOutline />
          </NIcon>
        </button>
        <div class="preview-stage" @wheel="wheel" @mousedown="down">
          <img
            v-if="active.src"
            :key="active.id"
            :src="active.src"
            :alt="uiText.preview.imageAlt"
            draggable="false"
            :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }"
            @contextmenu.prevent="openMenu($event, active.id)"
          />
        </div>
        <div class="preview-actions">
          <span>{{ uiText.preview.help }}</span>
          <NButton size="small" @click="emit('copy', active.id)">{{ uiText.common.copy }}</NButton>
          <NButton size="small" type="error" ghost @click="emit('delete', active.id, $event.currentTarget as HTMLElement)">
            {{ uiText.common.delete }}
          </NButton>
        </div>
      </main>
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
    </div>
  </NModal>
</template>

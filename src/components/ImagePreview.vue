<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { AddOutline, CloseOutline, CopyOutline, HelpCircleOutline, RemoveOutline, TrashOutline } from "@vicons/ionicons5";
import { NDropdown, NIcon, NModal } from "naive-ui";
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

const WHEEL_NAVIGATION_COOLDOWN_MS = 380;
const WHEEL_NAVIGATION_IDLE_MS = 180;
const WHEEL_NAVIGATION_REPEAT_DELTA = 260;
const WHEEL_DELTA_LINE_PIXELS = 40;
const WHEEL_DELTA_PAGE_PIXELS = 800;
const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.1;
const DOUBLE_CLICK_SCALE = 2;

const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
const localClosing = ref(false);
const wheelNavigationLocked = ref(false);
const start = ref({ x: 0, y: 0, ox: 0, oy: 0 });
const menu = ref<{ x: number; y: number; id: string; anchor?: HTMLElement } | null>(null);
let closeTimer: number | undefined;
let wheelNavigationTimer: number | undefined;
let wheelGestureIdleTimer: number | undefined;
let wheelRepeatDelta = 0;
let wheelRepeatDirection = 0;

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
  clearWheelNavigationLock();
});

watch(
  () => props.activeId,
  (nextId) => {
    window.clearTimeout(closeTimer);
    closeTimer = undefined;
    localClosing.value = false;
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
    if (!nextId) clearWheelNavigationLock();
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
  const direction = Math.sign(event.deltaY);
  if (direction === 0) return;

  scheduleWheelGestureIdleReset();
  if (wheelNavigationLocked.value) {
    trackWheelRepeat(event, direction);
    return;
  }
  if (!navigate(direction)) return;

  startWheelNavigationLock(direction);
}

function startWheelNavigationLock(direction: number): void {
  wheelNavigationLocked.value = true;
  wheelRepeatDirection = direction;
  wheelRepeatDelta = 0;
  scheduleWheelNavigationRepeat();
}

function scheduleWheelNavigationRepeat(): void {
  window.clearTimeout(wheelNavigationTimer);
  wheelNavigationTimer = window.setTimeout(() => {
    wheelNavigationTimer = undefined;
    repeatWheelNavigation();
  }, WHEEL_NAVIGATION_COOLDOWN_MS);
}

function clearWheelNavigationLock(): void {
  window.clearTimeout(wheelNavigationTimer);
  window.clearTimeout(wheelGestureIdleTimer);
  wheelNavigationTimer = undefined;
  wheelGestureIdleTimer = undefined;
  wheelNavigationLocked.value = false;
  wheelRepeatDelta = 0;
  wheelRepeatDirection = 0;
}

function scheduleWheelGestureIdleReset(): void {
  window.clearTimeout(wheelGestureIdleTimer);
  wheelGestureIdleTimer = window.setTimeout(clearWheelNavigationLock, WHEEL_NAVIGATION_IDLE_MS);
}

function trackWheelRepeat(event: WheelEvent, direction: number): void {
  if (direction !== wheelRepeatDirection) {
    wheelRepeatDirection = direction;
    wheelRepeatDelta = 0;
  }
  wheelRepeatDelta += Math.abs(normalizeWheelDelta(event));
}

function repeatWheelNavigation(): void {
  if (!wheelNavigationLocked.value) return;
  if (wheelRepeatDirection === 0 || wheelRepeatDelta < WHEEL_NAVIGATION_REPEAT_DELTA) {
    scheduleWheelNavigationRepeat();
    return;
  }

  const direction = wheelRepeatDirection;
  wheelRepeatDelta = 0;
  if (!navigate(direction)) {
    clearWheelNavigationLock();
    return;
  }

  scheduleWheelNavigationRepeat();
}

function normalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_DELTA_LINE_PIXELS;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_DELTA_PAGE_PIXELS;
  return event.deltaY;
}

function navigate(direction: number): boolean {
  if (direction < 0 && !canNavigatePrevious.value) return false;
  if (direction > 0 && !canNavigateNext.value) return false;
  closeMenu();
  emit("navigate", direction);
  return true;
}

function clampScale(value: number): number {
  return Number(Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)).toFixed(2));
}

function adjustZoom(delta: number): void {
  scale.value = clampScale(scale.value + delta);
  if (scale.value === 1) offset.value = { x: 0, y: 0 };
}

function getAnchoredZoomOffset(event: MouseEvent, nextScale: number): { x: number; y: number } {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!target || scale.value <= 0) return offset.value;

  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const pointX = event.clientX - centerX;
  const pointY = event.clientY - centerY;
  const sourceX = (pointX - offset.value.x) / scale.value;
  const sourceY = (pointY - offset.value.y) / scale.value;
  return {
    x: Number((pointX - nextScale * sourceX).toFixed(2)),
    y: Number((pointY - nextScale * sourceY).toFixed(2)),
  };
}

function toggleZoom(event: MouseEvent): void {
  if (scale.value === 1) {
    offset.value = getAnchoredZoomOffset(event, DOUBLE_CLICK_SCALE);
    scale.value = DOUBLE_CLICK_SCALE;
    return;
  }

  scale.value = 1;
  offset.value = { x: 0, y: 0 };
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
        <div class="preview-stage" @wheel="wheel" @mousedown="down">
          <img
            v-if="active.src"
            :key="active.id"
            :src="active.src"
            :alt="uiText.preview.imageAlt"
            draggable="false"
            :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }"
            @contextmenu.prevent="openMenu($event, active.id)"
            @dblclick.stop.prevent="toggleZoom"
          />
        </div>
        <div class="preview-actions">
          <span>{{ uiText.preview.help }}</span>
          <button type="button" class="preview-zoom-button is-zoom-out" :aria-label="uiText.preview.zoomOut" @click="adjustZoom(-ZOOM_STEP)">
            <NIcon size="19">
              <RemoveOutline />
            </NIcon>
          </button>
          <button type="button" class="preview-zoom-button is-zoom-in" :aria-label="uiText.preview.zoomIn" @click="adjustZoom(ZOOM_STEP)">
            <NIcon size="19">
              <AddOutline />
            </NIcon>
          </button>
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

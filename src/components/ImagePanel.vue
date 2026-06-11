<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, ComponentPublicInstance, VNode } from "vue";
import { NDropdown, NIcon, NScrollbar } from "naive-ui";
import { ClipboardOutline, CloseOutline, CopyOutline, EyeOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
import type { DropdownOption } from "naive-ui";
import type { AppLanguage, GuideKey, StoredImage } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getUiText } from "../state/i18n";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  title: string;
  images: StoredImage[];
  activePreviewId?: string;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  preview: [id: string];
  closePreview: [];
  copy: [id: string];
  delete: [id: string, anchor?: HTMLElement];
  reorder: [dragId: string, targetId: string];
  paste: [anchor?: HTMLElement];
  dropFiles: [files: File[], anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
}>();

const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement } | null>(null);
const draggingId = ref<string | null>(null);
const isDragHover = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
const imageCardRefs = new Map<string, HTMLElement>();
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({ ...GUIDE_MENU_OPTION, label: uiText.value.common.tips }));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);
const isPreviewCloseMenuItem = computed(() => Boolean(menu.value?.id && props.activePreviewId));
const DRAG_EDGE_SCROLL_THRESHOLD = 44;
const DRAG_EDGE_SCROLL_STEP = 8;
const DRAG_WHEEL_AUTO_SCROLL_PAUSE_MS = 150;
let dragScrollFrame: number | undefined;
let dragScrollContainer: HTMLElement | null = null;
let dragScrollDirection: -1 | 0 | 1 = 0;
let dragWheelPauseTimer: number | undefined;

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

onMounted(() => {
  exclusiveMenu.mount();
  window.addEventListener("wheel", handleImageDragWheel, { capture: true, passive: false });
});
onUnmounted(() => {
  exclusiveMenu.unmount();
  window.removeEventListener("wheel", handleImageDragWheel, { capture: true });
  resetImageDragAutoScroll();
});

watch(
  () => props.activePreviewId,
  () => {
    void scrollActivePreviewIntoView();
  },
  { flush: "post" },
);

const menuOptions = computed<DropdownOption[]>(() =>
  menu.value?.id
    ? [
        {
          label: isPreviewCloseMenuItem.value ? uiText.value.preview.close : uiText.value.common.preview,
          key: isPreviewCloseMenuItem.value ? "close-preview" : "preview",
          icon: renderIcon(isPreviewCloseMenuItem.value ? CloseOutline : EyeOutline),
        },
        { label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) },
        { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) },
        { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
      ]
    : [{ label: uiText.value.images.pasteImage, key: "paste", icon: renderIcon(ClipboardOutline) }, { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) }],
);

function openMenu(event: MouseEvent, id?: string): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function openTitleMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea")) return;
  event.preventDefault();
  event.stopPropagation();
  titleRef.value?.openMenuAt(event.clientX, event.clientY, event);
}

function closeMenu(): void {
  menu.value = null;
}

function setImageCardRef(id: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) {
    imageCardRefs.set(id, element);
    return;
  }

  imageCardRefs.delete(id);
}

async function scrollActivePreviewIntoView(): Promise<void> {
  const id = props.activePreviewId;
  if (!id) return;

  await nextTick();
  imageCardRefs.get(id)?.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
}

function handleMenuSelect(key: string): void {
  const id = menu.value?.id;
  const anchor = menu.value?.anchor;
  closeMenu();
  if (key === "paste") emit("paste", anchor);
  if (key === "guide" && anchor) emit("guide", "images", anchor, true);
  if (!id) return;
  if (key === "preview") emit("preview", id);
  if (key === "close-preview") emit("closePreview");
  if (key === "copy") emit("copy", id);
  if (key === "delete") emit("delete", id, anchor);
}

function handleGuideClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .image-card")) return;
  emit("guide", "images", event.currentTarget as HTMLElement);
}

function handleExternalDrop(event: DragEvent): void {
  isDragHover.value = false;
  resetImageDragAutoScroll();
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  emit("dropFiles", files, event.currentTarget as HTMLElement);
}

function handleImageDragEnter(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    isDragHover.value = true;
  }
}

function handleImageDragLeave(): void {
  isDragHover.value = false;
  resetImageDragAutoScroll();
}

function getImageListScrollContainer(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const scrollbar = target.classList.contains("image-list-scrollbar") ? target : target.closest<HTMLElement>(".image-list-scrollbar");
  return scrollbar?.querySelector<HTMLElement>(".n-scrollbar-container") ?? null;
}

function getCurrentImageListScrollContainer(): HTMLElement | null {
  return panelRef.value?.querySelector<HTMLElement>(".image-list-scrollbar .n-scrollbar-container") ?? null;
}

function stopImageDragAutoScroll(): void {
  if (dragScrollFrame !== undefined) window.cancelAnimationFrame(dragScrollFrame);
  dragScrollFrame = undefined;
  dragScrollContainer = null;
  dragScrollDirection = 0;
}

function resetImageDragAutoScroll(): void {
  stopImageDragAutoScroll();
  if (dragWheelPauseTimer !== undefined) window.clearTimeout(dragWheelPauseTimer);
  dragWheelPauseTimer = undefined;
}

function pauseImageDragAutoScrollForWheel(): void {
  stopImageDragAutoScroll();
  if (dragWheelPauseTimer !== undefined) window.clearTimeout(dragWheelPauseTimer);
  dragWheelPauseTimer = window.setTimeout(() => {
    dragWheelPauseTimer = undefined;
  }, DRAG_WHEEL_AUTO_SCROLL_PAUSE_MS);
}

function runImageDragAutoScroll(): void {
  const container = dragScrollContainer;
  if (!container || !draggingId.value || dragScrollDirection === 0) {
    stopImageDragAutoScroll();
    return;
  }

  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const nextScrollTop =
    dragScrollDirection < 0
      ? Math.max(0, container.scrollTop - DRAG_EDGE_SCROLL_STEP)
      : Math.min(maxScrollTop, container.scrollTop + DRAG_EDGE_SCROLL_STEP);
  container.scrollTop = nextScrollTop;

  if ((dragScrollDirection < 0 && nextScrollTop === 0) || (dragScrollDirection > 0 && nextScrollTop === maxScrollTop)) {
    stopImageDragAutoScroll();
    return;
  }

  dragScrollFrame = window.requestAnimationFrame(runImageDragAutoScroll);
}

function startImageDragAutoScroll(container: HTMLElement, direction: -1 | 1): void {
  dragScrollContainer = container;
  dragScrollDirection = direction;
  if (dragScrollFrame === undefined) dragScrollFrame = window.requestAnimationFrame(runImageDragAutoScroll);
}

function scrollImageListDuringDrag(event: DragEvent): void {
  if (!draggingId.value) return;
  if (dragWheelPauseTimer !== undefined) return;
  const container = getImageListScrollContainer(event.currentTarget);
  if (!container) return;

  const rect = container.getBoundingClientRect();
  if (event.clientY <= rect.top + DRAG_EDGE_SCROLL_THRESHOLD) {
    startImageDragAutoScroll(container, -1);
    return;
  }

  if (event.clientY >= rect.bottom - DRAG_EDGE_SCROLL_THRESHOLD) {
    startImageDragAutoScroll(container, 1);
    return;
  }

  stopImageDragAutoScroll();
}

function scrollImageListByWheel(container: HTMLElement, event: WheelEvent): void {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const delta =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * container.clientHeight
        : event.deltaY;
  container.scrollTop = Math.min(maxScrollTop, Math.max(0, container.scrollTop + delta));
}

function handleImageDragWheel(event: WheelEvent): void {
  if (!draggingId.value) return;
  const container = getImageListScrollContainer(event.target) ?? getCurrentImageListScrollContainer();
  if (!container) return;

  event.preventDefault();
  event.stopPropagation();
  pauseImageDragAutoScrollForWheel();
  scrollImageListByWheel(container, event);
}
</script>

<template>
  <section
    ref="panelRef"
    class="panel image-panel"
    :class="{ 'drag-hover': isDragHover }"
    aria-labelledby="image-title"
    tabindex="-1"
    @click="handleGuideClick"
    @dragover.prevent
    @drop.prevent.stop="handleExternalDrop"
    @dragenter="handleImageDragEnter"
    @dragleave="handleImageDragLeave"
    @dragend="handleImageDragLeave"
    @contextmenu="openMenu($event)"
  >
    <div class="panel-header" @contextmenu="openTitleMenu">
      <h1 id="image-title">
        <EditableTitle
          ref="titleRef"
          id="image-title"
          :value="title"
          :edit-label="uiText.common.rename"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </h1>
      <span class="count">{{ images.length }}</span>
    </div>

    <NScrollbar
      class="image-list-scrollbar"
      :aria-label="uiText.images.list"
      @click="closeMenu"
      @dragover.prevent="scrollImageListDuringDrag"
      @drop.prevent.stop="handleExternalDrop"
      @contextmenu.prevent.stop="openMenu($event)"
    >
      <TransitionGroup name="image-reorder" tag="div" class="image-list">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        :ref="(element) => setImageCardRef(image.id, element)"
        class="image-card"
        :class="{ 'is-dragging': draggingId === image.id, 'is-active': image.id === activePreviewId }"
        type="button"
        draggable="true"
        @click="emit('preview', image.id)"
        @dblclick.stop.prevent="emit('copy', image.id)"
        @contextmenu.stop="openMenu($event, image.id)"
        @dragstart="draggingId = image.id"
        @dragover.prevent
        @drop="draggingId && draggingId !== image.id && emit('reorder', draggingId, image.id)"
        @dragend="draggingId = null; resetImageDragAutoScroll()"
      >
        <span class="image-index">{{ index + 1 }}</span>
        <img v-if="image.src" :src="image.src" :alt="uiText.images.thumbnailAlt" draggable="false" />
        <span v-else class="image-missing">{{ uiText.images.loading }}</span>
      </button>
      </TransitionGroup>
    </NScrollbar>

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

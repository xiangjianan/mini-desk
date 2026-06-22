<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, ComponentPublicInstance, VNode } from "vue";
import { NDropdown, NIcon, NScrollbar } from "naive-ui";
import { ArrowDownOutline, ArrowUpOutline, ClipboardOutline, CloseOutline, CopyOutline, CreateOutline, EyeOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
import type { DropdownOption } from "naive-ui";
import type { AppLanguage, GuideKey, ImagePasteFeedback, ImagePasteRequest, StoredImage } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getBlankImageContextMenuItems, getImageItemContextMenuItems } from "../state/imageContextMenu";
import type { ImageContextMenuKey } from "../state/imageContextMenu";
import { getUiText } from "../state/i18n";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  title: string;
  images: StoredImage[];
  activePreviewId?: string;
  pasteFeedback?: ImagePasteFeedback;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  preview: [id: string];
  closePreview: [];
  copy: [id: string];
  edit: [id: string];
  delete: [id: string, anchor?: HTMLElement];
  reorder: [dragId: string, targetId: string];
  moveToBottom: [id: string];
  paste: [request: ImagePasteRequest];
  dropFiles: [files: File[], anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
}>();

interface ImagePointerDrag {
  id: string;
  image: StoredImage;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  started: boolean;
  scrollContainer: HTMLElement | null;
}

interface ImageDragPreview {
  id: string;
  src?: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement } | null>(null);
const draggingId = ref<string | null>(null);
const isDragHover = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
const imageCardRefs = new Map<string, HTMLElement>();
const imageDragPreview = ref<ImageDragPreview | null>(null);
const pasteHighlightedId = ref<string | null>(null);
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({ ...GUIDE_MENU_OPTION, label: uiText.value.common.tips }));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);
const isPreviewCloseMenuItem = computed(() => Boolean(menu.value?.id && props.activePreviewId));
const imageDragPreviewStyle = computed<Record<string, string>>(() => {
  const preview = imageDragPreview.value;
  if (!preview) return {} as Record<string, string>;
  return {
    width: `${preview.width}px`,
    height: `${preview.height}px`,
    transform: `translate3d(${preview.x}px, ${preview.y}px, 0)`,
  };
});
const DRAG_START_THRESHOLD = 5;
const DRAG_EDGE_SCROLL_THRESHOLD = 44;
const DRAG_EDGE_SCROLL_STEP = 8;
const DRAG_WHEEL_AUTO_SCROLL_PAUSE_MS = 150;
const IMAGE_CLICK_SUPPRESS_MS = 350;
let imagePointerDrag: ImagePointerDrag | null = null;
let suppressImageClickUntil = 0;
let dragScrollFrame: number | undefined;
let dragScrollContainer: HTMLElement | null = null;
let dragScrollDirection: -1 | 0 | 1 = 0;
let dragWheelPauseTimer: number | undefined;
let pasteHighlightTimer: number | undefined;
const PASTE_HIGHLIGHT_MS = 700;

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

function getImageMenuIcon(key: ImageContextMenuKey): Component {
  if (key === "preview") return EyeOutline;
  if (key === "close-preview") return CloseOutline;
  if (key === "copy") return CopyOutline;
  if (key === "edit") return CreateOutline;
  if (key === "delete") return TrashOutline;
  if (key === "pin-top") return ArrowUpOutline;
  if (key === "pin-bottom") return ArrowDownOutline;
  if (key === "paste") return ClipboardOutline;
  return HelpCircleOutline;
}

onMounted(() => {
  exclusiveMenu.mount();
  window.addEventListener("wheel", handleImageDragWheel, { capture: true, passive: false });
});
onUnmounted(() => {
  exclusiveMenu.unmount();
  window.removeEventListener("wheel", handleImageDragWheel, { capture: true });
  cleanupImagePointerDrag();
  resetImageDragAutoScroll();
  if (pasteHighlightTimer !== undefined) window.clearTimeout(pasteHighlightTimer);
});

watch(
  () => props.activePreviewId,
  () => {
    void scrollActivePreviewIntoView();
  },
  { flush: "post" },
);

watch(
  () => props.pasteFeedback?.token,
  async (token) => {
    const previousHighlightedId = pasteHighlightedId.value;
    if (pasteHighlightTimer !== undefined) window.clearTimeout(pasteHighlightTimer);
    pasteHighlightTimer = undefined;
    pasteHighlightedId.value = null;

    await nextTick();
    if (props.pasteFeedback?.token !== token) return;
    const id = props.pasteFeedback?.id;
    if (!id) return;
    const card = imageCardRefs.get(id);
    if (!card) return;

    if (previousHighlightedId === id) void card.offsetWidth;
    card.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
    pasteHighlightedId.value = id;
    pasteHighlightTimer = window.setTimeout(() => {
      pasteHighlightedId.value = null;
      pasteHighlightTimer = undefined;
    }, PASTE_HIGHLIGHT_MS);
  },
  { flush: "post" },
);

const menuOptions = computed<DropdownOption[]>(() =>
  menu.value?.id
    ? getImageItemContextMenuItems(uiText.value, isPreviewCloseMenuItem.value, true).map((option) => ({
        ...option,
        icon: renderIcon(getImageMenuIcon(option.key)),
      }))
    : getBlankImageContextMenuItems(uiText.value).map((option) => ({
        ...option,
        ...(option.key === "tips" ? guideMenuOption.value : {}),
        icon: renderIcon(getImageMenuIcon(option.key)),
      })),
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
  if (key === "paste") {
    if (id && anchor) emit("paste", { placement: "after", targetId: id, anchor });
    else emit("paste", { placement: "append", anchor });
  }
  if (key === "guide" && anchor) emit("guide", "images", anchor, true);
  if (!id) return;
  if (key === "pin-top") {
    const firstImageId = props.images[0]?.id;
    if (firstImageId && firstImageId !== id) emit("reorder", id, firstImageId);
  }
  if (key === "pin-bottom") {
    const lastImageId = props.images.at(-1)?.id;
    if (lastImageId && lastImageId !== id) emit("moveToBottom", id);
  }
  if (key === "preview") emit("preview", id);
  if (key === "close-preview") emit("closePreview");
  if (key === "copy") emit("copy", id);
  if (key === "edit") emit("edit", id);
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

function getImageDragMimeType(src?: string): string {
  const match = src?.match(/^data:([^;,]+)/);
  return match?.[1] || "image/png";
}

function getImageDragExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function getImageDragFileName(image: StoredImage, index: number): string {
  const mimeType = getImageDragMimeType(image.src);
  return `mini-desk-image-${index + 1}.${getImageDragExtension(mimeType)}`;
}

function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mimeType });
}

function handleImageNativeDragStart(event: DragEvent, image: StoredImage, index: number): void {
  const transfer = event.dataTransfer;
  if (!transfer || !image.src) return;

  cleanupImagePointerDrag();
  const mimeType = getImageDragMimeType(image.src);
  const fileName = getImageDragFileName(image, index);
  transfer.effectAllowed = "copy";
  transfer.setData("DownloadURL", `${mimeType}:${fileName}:${image.src}`);
  transfer.setData("text/uri-list", image.src);
  transfer.setData("text/plain", image.src);

  const file = dataUrlToFile(image.src, fileName);
  if (file) transfer.items?.add(file);
  transfer.setDragImage?.(event.currentTarget as Element, 0, 0);
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

function scrollImageListNearDragEdge(container: HTMLElement | null, clientY: number): void {
  if (!draggingId.value) return;
  if (dragWheelPauseTimer !== undefined) return;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  if (clientY <= rect.top + DRAG_EDGE_SCROLL_THRESHOLD) {
    startImageDragAutoScroll(container, -1);
    return;
  }

  if (clientY >= rect.bottom - DRAG_EDGE_SCROLL_THRESHOLD) {
    startImageDragAutoScroll(container, 1);
    return;
  }

  stopImageDragAutoScroll();
}

function getPointerId(event: PointerEvent): number {
  return typeof event.pointerId === "number" ? event.pointerId : 1;
}

function updateImageDragPreview(state: ImagePointerDrag, event: PointerEvent): void {
  state.currentX = event.clientX;
  state.currentY = event.clientY;
  const imageIndex = props.images.findIndex((image) => image.id === state.id);
  imageDragPreview.value = {
    id: state.id,
    src: state.image.src,
    index: imageIndex >= 0 ? imageIndex + 1 : 0,
    x: event.clientX - state.offsetX,
    y: event.clientY - state.offsetY,
    width: Math.max(1, state.width),
    height: Math.max(1, state.height),
  };
}

function startImagePointerDrag(state: ImagePointerDrag, event: PointerEvent): void {
  state.started = true;
  draggingId.value = state.id;
  closeMenu();
  updateImageDragPreview(state, event);
  scrollImageListNearDragEdge(state.scrollContainer ?? getCurrentImageListScrollContainer(), event.clientY);
}

function getImageDropTargetId(clientY: number): string | null {
  let closest: { id: string; distance: number } | null = null;

  for (const image of props.images) {
    const element = imageCardRefs.get(image.id);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) return image.id;

    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - centerY);
    if (!closest || distance < closest.distance) closest = { id: image.id, distance };
  }

  return closest?.id ?? null;
}

function removeImagePointerListeners(): void {
  window.removeEventListener("pointermove", handleImagePointerMove);
  window.removeEventListener("pointerup", handleImagePointerUp);
  window.removeEventListener("pointercancel", handleImagePointerCancel);
}

function cleanupImagePointerDrag(): void {
  removeImagePointerListeners();
  imagePointerDrag = null;
  imageDragPreview.value = null;
  draggingId.value = null;
  resetImageDragAutoScroll();
}

function finishImagePointerDrag(event?: PointerEvent, canceled = false): void {
  const state = imagePointerDrag;
  if (!state) return;

  removeImagePointerListeners();
  if (state.started && event && !canceled) {
    event.preventDefault();
    suppressImageClickUntil = performance.now() + IMAGE_CLICK_SUPPRESS_MS;
    const targetId = getImageDropTargetId(event.clientY);
    if (targetId && targetId !== state.id) emit("reorder", state.id, targetId);
  }

  imagePointerDrag = null;
  imageDragPreview.value = null;
  draggingId.value = null;
  resetImageDragAutoScroll();
}

function handleImagePointerDown(event: PointerEvent, image: StoredImage): void {
  if (event.button !== 0) return;
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  cleanupImagePointerDrag();
  imagePointerDrag = {
    id: image.id,
    image,
    pointerId: getPointerId(event),
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    started: false,
    scrollContainer: getCurrentImageListScrollContainer(),
  };
  window.addEventListener("pointermove", handleImagePointerMove, { passive: false });
  window.addEventListener("pointerup", handleImagePointerUp);
  window.addEventListener("pointercancel", handleImagePointerCancel);
}

function handleImagePointerMove(event: PointerEvent): void {
  const state = imagePointerDrag;
  if (!state || getPointerId(event) !== state.pointerId) return;

  const moveDistance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
  if (!state.started) {
    if (moveDistance < DRAG_START_THRESHOLD) return;
    startImagePointerDrag(state, event);
  }

  event.preventDefault();
  updateImageDragPreview(state, event);
  scrollImageListNearDragEdge(state.scrollContainer ?? getCurrentImageListScrollContainer(), event.clientY);
}

function handleImagePointerUp(event: PointerEvent): void {
  if (!imagePointerDrag || getPointerId(event) !== imagePointerDrag.pointerId) return;
  finishImagePointerDrag(event);
}

function handleImagePointerCancel(event: PointerEvent): void {
  if (!imagePointerDrag || getPointerId(event) !== imagePointerDrag.pointerId) return;
  finishImagePointerDrag(event, true);
}

function handleImageCardClick(event: MouseEvent, id: string): void {
  if (performance.now() < suppressImageClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  emit("preview", id);
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
      @dragover.prevent
      @drop.prevent.stop="handleExternalDrop"
      @contextmenu.prevent.stop="openMenu($event)"
    >
      <TransitionGroup name="image-reorder" tag="div" class="image-list">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        :ref="(element) => setImageCardRef(image.id, element)"
        class="image-card"
        :class="{
          'is-dragging': draggingId === image.id,
          'is-active': image.id === activePreviewId,
          'is-paste-highlighted': image.id === pasteHighlightedId,
        }"
        type="button"
        @click="handleImageCardClick($event, image.id)"
        @keydown.enter.stop.prevent="emit('edit', image.id)"
        @dblclick.stop.prevent="emit('copy', image.id)"
        @contextmenu.stop="openMenu($event, image.id)"
        @pointerdown="handleImagePointerDown($event, image)"
      >
        <span class="image-index">{{ index + 1 }}</span>
        <img
          v-if="image.src"
          :src="image.src"
          :alt="uiText.images.thumbnailAlt"
          loading="lazy"
          decoding="async"
          draggable="true"
          @dragstart.stop="handleImageNativeDragStart($event, image, index)"
        />
        <span v-else class="image-missing">{{ uiText.images.loading }}</span>
      </button>
      </TransitionGroup>
    </NScrollbar>

    <div
      v-if="imageDragPreview"
      class="image-drag-preview"
      :style="imageDragPreviewStyle"
      aria-hidden="true"
    >
      <span class="image-index">{{ imageDragPreview.index }}</span>
      <img v-if="imageDragPreview.src" :src="imageDragPreview.src" :alt="uiText.images.thumbnailAlt" draggable="false" />
      <span v-else class="image-missing">{{ uiText.images.loading }}</span>
    </div>

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

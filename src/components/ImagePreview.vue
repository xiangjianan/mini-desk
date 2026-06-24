<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { AddOutline, ArrowDownOutline, ArrowUpOutline, ChevronDownOutline, ChevronUpOutline, CloseOutline, CopyOutline, CreateOutline, HelpCircleOutline, RemoveOutline, TrashOutline } from "@vicons/ionicons5";
import { NDropdown, NIcon, NModal } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { getImageItemContextMenuItems } from "../state/imageContextMenu";
import type { ImageContextMenuKey } from "../state/imageContextMenu";
import { getUiText } from "../state/i18n";
import type { AppLanguage, ImagePasteRequest, StoredImage } from "../types";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import ImageEditor from "./ImageEditor.vue";

const props = withDefaults(defineProps<{
  images: StoredImage[];
  activeId?: string;
  editId?: string;
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
  reorder: [dragId: string, targetId: string];
  moveToBottom: [id: string];
  paste: [request: ImagePasteRequest];
  tips: [anchor?: HTMLElement];
  saveEdit: [payload: { id: string; src: string; displayWidth: number; displayHeight: number }];
}>();

const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.1;
const DOUBLE_CLICK_SCALE = 2;

interface ImageSize {
  width: number;
  height: number;
}

const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
const editing = ref(props.editId === props.activeId && Boolean(props.activeId));
const localClosing = ref(false);
const previewRef = ref<HTMLElement | null>(null);
const previewImageRef = ref<HTMLImageElement | null>(null);
const editorRef = ref<InstanceType<typeof ImageEditor> | null>(null);
const start = ref({ x: 0, y: 0, ox: 0, oy: 0 });
const menu = ref<{ x: number; y: number; id: string; anchor?: HTMLElement } | null>(null);
const editorFrame = ref<{ width: number; height: number } | null>(null);
let closeTimer: number | undefined;

const uiText = computed(() => getUiText(props.language));
const active = computed(() => props.images.find((image) => image.id === props.activeId));
const activeIndex = computed(() => props.images.findIndex((image) => image.id === props.activeId));
const canNavigatePrevious = computed(() => activeIndex.value > 0);
const canNavigateNext = computed(() => activeIndex.value >= 0 && activeIndex.value < props.images.length - 1);
const isClosing = computed(() => props.closing || localClosing.value);
const isDirectEditMode = computed(() => Boolean(props.activeId) && props.editId === props.activeId);
const activeImageStyle = computed(() => {
  const style = {
    transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`,
  };
  return style;
});
const menuOptions = computed<DropdownOption[]>(() => [
  ...getImageItemContextMenuItems(uiText.value, true).map((option) => ({
    ...option,
    icon: renderIcon(getImageMenuIcon(option.key)),
  })),
]);
const exclusiveMenu = createExclusiveContextMenu(closeMenu);

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

function getImageMenuIcon(key: ImageContextMenuKey): Component {
  if (key === "preview") return ChevronDownOutline;
  if (key === "close-preview") return CloseOutline;
  if (key === "copy") return CopyOutline;
  if (key === "edit") return CreateOutline;
  if (key === "delete") return TrashOutline;
  if (key === "pin-top") return ArrowUpOutline;
  if (key === "pin-bottom") return ArrowDownOutline;
  return HelpCircleOutline;
}

onMounted(() => {
  exclusiveMenu.mount();
  window.addEventListener("keydown", handleWindowKeydown, { capture: true });
  void syncDirectEditorFrame();
});
onUnmounted(() => {
  exclusiveMenu.unmount();
  window.removeEventListener("keydown", handleWindowKeydown, { capture: true });
  window.clearTimeout(closeTimer);
});

watch(
  () => props.activeId,
  () => {
    window.clearTimeout(closeTimer);
    closeTimer = undefined;
    localClosing.value = false;
    editing.value = props.editId === props.activeId && Boolean(props.activeId);
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
    editorFrame.value = null;
    void syncDirectEditorFrame();
  },
);

watch(
  () => props.editId,
  () => {
    editing.value = props.editId === props.activeId && Boolean(props.activeId);
    void syncDirectEditorFrame();
  },
);

function requestClose(): void {
  if (localClosing.value || props.closing) return;
  closeMenu();
  editing.value = false;
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
}

function navigate(direction: number): boolean {
  if (direction < 0 && !canNavigatePrevious.value) return false;
  if (direction > 0 && !canNavigateNext.value) return false;
  closeMenu();
  editing.value = false;
  emit("navigate", direction);
  return true;
}

function focusPreviewSurface(): void {
  previewRef.value?.focus({ preventScroll: true });
}

function navigateFromToolbar(direction: number): void {
  if (navigate(direction)) focusPreviewSurface();
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

function openEditor(): void {
  if (!active.value?.src) return;
  closeMenu();
  dragging.value = false;
  editorFrame.value = measurePreviewImageFrame();
  editing.value = true;
}

function closeEditor(): void {
  editing.value = false;
  editorFrame.value = null;
}

function exitEditorFromShortcut(): void {
  requestClose();
}

function saveEditor(payload: { id: string; src: string; displayWidth: number; displayHeight: number }): void {
  emit("saveEdit", payload);
  editing.value = false;
  editorFrame.value = null;
}

function saveOpenEditor(): void {
  editorRef.value?.saveImage();
}

function measurePreviewImageFrame(): { width: number; height: number } | null {
  const rect = previewImageRef.value?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const currentScale = scale.value || 1;
  return {
    width: rect.width / currentScale,
    height: rect.height / currentScale,
  };
}

async function syncDirectEditorFrame(): Promise<void> {
  if (!editing.value || !isDirectEditMode.value) return;
  const image = active.value;
  const id = image?.id;
  const src = image?.src;
  if (!image || !id) return;
  await nextTick();
  const imageSize = await resolveImageSize(image);
  if (!imageSize || !editing.value || !isDirectEditMode.value || active.value?.id !== id || active.value?.src !== src) return;
  await nextTick();
  const frame = measureDirectEditorFrame(imageSize);
  if (frame) editorFrame.value = frame;
}

async function resolveImageSize(image: StoredImage): Promise<ImageSize | null> {
  if (image.displayWidth && image.displayHeight && image.displayWidth > 0 && image.displayHeight > 0) {
    return { width: image.displayWidth, height: image.displayHeight };
  }
  if (!image.src) return null;
  return readImageSize(image.src);
}

function readImageSize(src: string): Promise<ImageSize | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function measureDirectEditorFrame(imageSize: ImageSize): { width: number; height: number } | null {
  const stage = previewRef.value?.querySelector<HTMLElement>(".image-editor-stage");
  const rect = stage?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const fitScale = Math.min(1, rect.width / imageSize.width, rect.height / imageSize.height);
  return {
    width: imageSize.width * fitScale,
    height: imageSize.height * fitScale,
  };
}

function handleMenuSelect(key: string): void {
  const current = menu.value;
  if (!current) return;
  closeMenu();
  if (key === "tips") {
    emit("tips", current.anchor);
    return;
  }
  if (key === "pin-top") {
    const firstImageId = props.images[0]?.id;
    if (firstImageId && firstImageId !== current.id) emit("reorder", current.id, firstImageId);
    return;
  }
  if (key === "pin-bottom") {
    const lastImageId = props.images.at(-1)?.id;
    if (lastImageId && lastImageId !== current.id) emit("moveToBottom", current.id);
    return;
  }
  if (key === "copy") emit("copy", current.id);
  if (key === "edit") openEditor();
  if (key === "close-preview") requestClose();
  if (key === "delete") emit("delete", current.id, current.anchor);
}

function deleteActive(event: MouseEvent): void {
  if (!active.value) return;
  closeMenu();
  emit("delete", active.value.id, event.currentTarget as HTMLElement);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!active.value) return;
  const key = event.key.toLowerCase();
  if (editing.value && isTextEntryTarget(event.target)) return;
  if (editing.value && event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    saveOpenEditor();
    return;
  }
  if (editing.value && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    exitEditorFromShortcut();
    return;
  }
  if (editing.value && isPreviewShortcutKey(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!editing.value && (event.ctrlKey || event.metaKey)) {
    if (key === "c") {
      event.preventDefault();
      event.stopPropagation();
      emit("copy", active.value.id);
      return;
    }
    if (key === "v") {
      const anchor = previewImageRef.value ?? previewRef.value;
      if (anchor) {
        event.preventDefault();
        event.stopPropagation();
        emit("paste", { placement: "after", targetId: active.value.id, anchor });
      }
      return;
    }
  }
  if (event.key === "Escape" || event.key === " ") {
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    openEditor();
    return;
  }
  if (event.key === "5") {
    event.preventDefault();
    emit("copy", active.value.id);
    return;
  }
  if (key === "w" || key === "a") {
    event.preventDefault();
    navigate(-1);
    return;
  }
  if (key === "s" || key === "d") {
    event.preventDefault();
    navigate(1);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    emit("delete", active.value.id);
  }
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (!editing.value || !active.value) return;
  if (isEditorRedoShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    editorRef.value?.redoEdit();
    return;
  }
  if (isEditorUndoShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    editorRef.value?.undoEdit();
    return;
  }
  if (event.key === "Enter") {
    if (isTextEntryTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    saveOpenEditor();
    return;
  }
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  exitEditorFromShortcut();
}

function isEditorUndoShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
}

function isEditorRedoShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return (event.ctrlKey || event.metaKey) && ((event.shiftKey && key === "z") || key === "y");
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => Element | null } | null;
  if (typeof element?.closest !== "function") return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function isPreviewShortcutKey(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return key === "escape"
    || key === " "
    || key === "spacebar"
    || key === "enter"
    || key === "5"
    || key === "backspace"
    || key === "delete"
    || key === "w"
    || key === "a"
    || key === "s"
    || key === "d";
}

</script>

<template>
  <NModal
    v-if="active"
    :show="true"
    :mask-closable="false"
    :close-on-esc="false"
    :auto-focus="false"
    :trap-focus="false"
    :block-scroll="false"
    :mask-style="{ pointerEvents: 'none' }"
    @update:show="(show) => !show && requestClose()"
  >
    <div
      ref="previewRef"
      class="image-preview"
      :class="{ 'is-closing': isClosing }"
      aria-hidden="false"
      tabindex="0"
      @mousemove="move"
      @mouseup="dragging = false"
      @mouseleave="dragging = false"
      @keydown="handleKeydown"
      @selectstart.prevent
      @contextmenu.prevent="openMenu($event, active.id)"
    >
      <main class="preview-main" :class="{ 'is-editing': editing }">
        <ImageEditor
          v-if="editing"
          ref="editorRef"
          :image="active"
          :language="language"
          preview-layout
          :preview-transform="activeImageStyle.transform"
          :preview-frame="editorFrame"
          @cancel="closeEditor"
          @save="saveEditor"
        />
        <template v-else>
          <div class="preview-stage" @wheel="wheel" @mousedown="down">
            <img
              v-if="active.src"
              ref="previewImageRef"
              :key="active.id"
              :src="active.src"
              :alt="uiText.preview.imageAlt"
              draggable="false"
              :style="activeImageStyle"
              @contextmenu.prevent="openMenu($event, active.id)"
              @dblclick.stop.prevent="toggleZoom"
            />
          </div>
          <div class="preview-actions" role="toolbar" :aria-label="uiText.preview.help">
            <button
              type="button"
              class="preview-toolbar-button preview-nav-button is-previous"
              :aria-label="uiText.preview.previous"
              :aria-disabled="!canNavigatePrevious"
              :disabled="!canNavigatePrevious"
              @click.stop.prevent="navigateFromToolbar(-1)"
              @keydown.enter.stop.prevent="navigateFromToolbar(-1)"
              @keydown.space.stop.prevent="requestClose"
            >
              <NIcon size="20">
                <ChevronUpOutline />
              </NIcon>
            </button>
            <button
              type="button"
              class="preview-toolbar-button preview-nav-button is-next"
              :aria-label="uiText.preview.next"
              :aria-disabled="!canNavigateNext"
              :disabled="!canNavigateNext"
              @click.stop.prevent="navigateFromToolbar(1)"
              @keydown.enter.stop.prevent="navigateFromToolbar(1)"
              @keydown.space.stop.prevent="requestClose"
            >
              <NIcon size="20">
                <ChevronDownOutline />
              </NIcon>
            </button>
            <button type="button" class="preview-toolbar-button preview-zoom-button is-zoom-out" :aria-label="uiText.preview.zoomOut" @click.stop.prevent="adjustZoom(-ZOOM_STEP)">
              <NIcon size="18">
                <RemoveOutline />
              </NIcon>
            </button>
            <button type="button" class="preview-toolbar-button preview-zoom-button is-zoom-in" :aria-label="uiText.preview.zoomIn" @click.stop.prevent="adjustZoom(ZOOM_STEP)">
              <NIcon size="18">
                <AddOutline />
              </NIcon>
            </button>
            <button type="button" class="preview-toolbar-button is-edit" :aria-label="uiText.common.edit" @click.stop.prevent="openEditor">
              <NIcon size="18">
                <CreateOutline />
              </NIcon>
            </button>
            <button type="button" class="preview-toolbar-button is-delete" :aria-label="uiText.common.delete" @click.stop.prevent="deleteActive">
              <NIcon size="18">
                <TrashOutline />
              </NIcon>
            </button>
            <button
              type="button"
              class="preview-toolbar-button is-close"
              :aria-label="uiText.preview.close"
              @click.stop.prevent="requestClose"
              @keydown.enter.stop.prevent="requestClose"
              @keydown.space.stop.prevent="requestClose"
            >
              <NIcon size="18">
                <CloseOutline />
              </NIcon>
            </button>
          </div>
        </template>
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

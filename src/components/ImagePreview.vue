<script setup lang="ts">
import ContextMenu from "./ContextMenu.vue";
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { ArrowDownOutline, ArrowUpOutline, ChevronDownOutline, CloseOutline, CopyOutline, CreateOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
import { NModal } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { getImageItemContextMenuItems } from "../state/imageContextMenu";
import type { ImageContextMenuKey } from "../state/imageContextMenu";
import { getUiText } from "../state/i18n";
import { useImageTransform } from "../composables/useImageTransform";
import type { AppLanguage, ImagePasteRequest, StoredImage } from "../types";
import { createExclusiveContextMenu } from "../utils/contextMenu";
import { isTextEntryTarget } from "../utils/dom";
import { renderIcon } from "../utils/dropdownIcons";
import ImageEditor from "./ImageEditor.vue";
import ImagePreviewToolbar from "./ImagePreviewToolbar.vue";

const props = withDefaults(defineProps<{
  images: StoredImage[];
  activeId?: string;
  editId?: string;
  language?: AppLanguage;
  closing?: boolean;
  /** false = 抑制编辑入口（专注弹窗内预览）：工具栏「编辑」按钮、右键「编辑」项与 Enter
   *  快捷键全部隐藏/失效，「Tips」项一并隐藏（无 tips 接线的宿主里是死路）。默认 true。 */
  canEdit?: boolean;
}>(), {
  language: "zh",
  closing: false,
  canEdit: true,
});

const emit = defineEmits<{
  close: [];
  copy: [id: string];
  delete: [id: string, anchor?: HTMLElement];
  navigate: [direction: number];
  reorder: [dragId: string, targetId: string];
  moveToBottom: [id: string];
  paste: [request: ImagePasteRequest];
  dropFiles: [files: File[], anchor: HTMLElement, targetId: string];
  tips: [anchor?: HTMLElement];
  saveEdit: [payload: { id: string; src: string; displayWidth: number; displayHeight: number }];
}>();

interface ImageSize {
  width: number;
  height: number;
}

const editing = ref(props.editId === props.activeId && Boolean(props.activeId));
const localClosing = ref(false);
const previewRef = ref<HTMLElement | null>(null);
const previewImageRef = ref<HTMLImageElement | null>(null);
const editorRef = ref<InstanceType<typeof ImageEditor> | null>(null);
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
const { scale, dragging, activeImageStyle, adjustZoom, toggleZoom, wheel, down, move, resetTransform } = useImageTransform();
const menuOptions = computed<DropdownOption[]>(() => [
  // canEdit=false：编辑入口与无 tips 接线的「Tips」引导项一并隐藏。
  ...getImageItemContextMenuItems(uiText.value, true)
    .filter((option) => props.canEdit || (option.key !== "edit" && option.key !== "tips"))
    .map((option) => ({
      ...option,
      icon: renderIcon(getImageMenuIcon(option.key), option.key === "delete"),
    })),
]);
const exclusiveMenu = createExclusiveContextMenu(closeMenu);


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
    resetTransform();
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

function handleExternalDrop(event: DragEvent): void {
  if (!active.value) return;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  emit("dropFiles", files, event.currentTarget as HTMLElement, active.value.id);
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
    // canEdit=false：编辑入口被抑制，Enter 无操作（预览本身已打开）。
    if (props.canEdit) openEditor();
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
      @dragover.prevent
      @drop.prevent.stop="handleExternalDrop"
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
            <Transition name="preview-photo" appear>
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
            </Transition>
          </div>
          <ImagePreviewToolbar :language="language" :can-navigate-previous="canNavigatePrevious"
            :can-navigate-next="canNavigateNext" :can-edit="canEdit"
            @navigate="navigateFromToolbar" @zoom="adjustZoom" @edit="openEditor"
            @delete="deleteActive" @close="requestClose" />
        </template>
      </main>
      <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :options="menuOptions"

      @select="handleMenuSelect" @clickoutside="exclusiveMenu.handleClickOutside" />
    </div>
  </NModal>
</template>

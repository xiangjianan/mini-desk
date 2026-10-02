<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NIcon, NModal } from "naive-ui";
import { AddOutline, ChevronDownOutline, ChevronUpOutline, CloseOutline, CreateOutline, RemoveOutline, TimeOutline, TrashOutline } from "@vicons/ionicons5";
import type { AppLanguage, ImagePasteRequest, LineItem, StoredImage } from "../types";
import { getUiText } from "../state/i18n";
import { formatFocusDuration } from "../state/todos";
import { isTextEntryTarget } from "../utils/dom";
import { clamp } from "../utils/math";
import type { PolishKind, PolishResult, PolishStyle } from "../sync/polishClient";
import TextPanel from "./TextPanel.vue";
import ImagePanel from "./ImagePanel.vue";
import ImageEditor from "./ImageEditor.vue";

export interface FocusImageSavePayload {
  id: string;
  src: string;
  displayWidth: number;
  displayHeight: number;
}

const props = withDefaults(defineProps<{
  show: boolean;
  /** 任务文本（弹窗正文标题）。 */
  title: string;
  /** 已累计专注毫秒（App 每 60s checkpoint 时提升）。 */
  baseMs: number;
  notes: LineItem[];
  images: StoredImage[];
  language?: AppLanguage;
  polish?: (kind: PolishKind, text: string, style?: PolishStyle) => Promise<PolishResult>;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  /** 关闭（=暂停）：App 计算并合并本次增量到任务的 focusElapsedMs（单一事实源在 App 的 focusSession）。 */
  close: [];
  notesUpdate: [lines: LineItem[]];
  pasteImage: [request: ImagePasteRequest];
  dropImageFiles: [files: File[], targetId?: string];
  copyImage: [id: string];
  deleteImage: [id: string, anchor?: HTMLElement];
  reorderImages: [dragId: string, targetId: string];
  moveImageToBottom: [id: string];
  saveImage: [payload: FocusImageSavePayload];
}>();

const uiText = computed(() => getUiText(props.language));
const nowTick = ref(Date.now());
const segmentStartAt = ref(Date.now());
let displayTimer: number | undefined;

/** 1s 心跳只在实际展示期间运行：App 常驻挂载（只切 show）时，隐藏期空转是纯浪费。 */
function startDisplayTimer(): void {
  if (displayTimer !== undefined) return;
  displayTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
}

function stopDisplayTimer(): void {
  if (displayTimer === undefined) return;
  window.clearInterval(displayTimer);
  displayTimer = undefined;
}

onMounted(() => {
  if (props.show) startDisplayTimer();
});

// App checkpoint 提升 baseMs 时重置段起点：显示 = baseMs + (now − 段起点)，接续不跳变。
watch(() => props.baseMs, () => {
  segmentStartAt.value = Date.now();
});

const displayMs = computed(() => props.baseMs + Math.max(0, nowTick.value - segmentStartAt.value));
const displayDuration = computed(() => formatFocusDuration(displayMs.value));
const displayDurationIso = computed(() => `PT${Math.ceil(displayMs.value / 1000)}S`);

// —— 贴图预览/编辑：内嵌在右侧记事本区上方的浮层（不离开弹窗），记事本在下层原样保留。
//    工具栏与缩放/拖拽/键盘交互完全复刻主页面 ImagePreview（.preview-actions /
//    .preview-stage 全局样式直接复用），差异只在：数据源是 focusImages、保存经
//    saveImage 上抛 App、关预览是收浮层而非撤全屏。 ——
const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.1;
const DOUBLE_CLICK_SCALE = 2;

const activePreviewId = ref<string>();
const editorActive = ref(false);
const previewRef = ref<HTMLElement>();
const previewImageRef = ref<HTMLImageElement>();
const editorRef = ref<InstanceType<typeof ImageEditor> | null>(null);
const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
const start = ref({ x: 0, y: 0, ox: 0, oy: 0 });
// 删除预览中的图片后按主页面口径跳邻图：记录最近的下标，悬空时按它选邻居。
const lastPreviewIndex = ref(0);

const previewImage = computed(() =>
  props.images.find((image) => image.id === activePreviewId.value));
const activeIndex = computed(() =>
  props.images.findIndex((image) => image.id === activePreviewId.value));
const canNavigatePrevious = computed(() => activeIndex.value > 0);
const canNavigateNext = computed(() => activeIndex.value >= 0 && activeIndex.value < props.images.length - 1);
const activeImageStyle = computed(() => ({
  transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`,
}));

function clampScale(value: number): number {
  return Number(clamp(value, MIN_SCALE, MAX_SCALE).toFixed(2));
}

function adjustZoom(delta: number): void {
  scale.value = clampScale(scale.value + delta);
  if (scale.value === 1) offset.value = { x: 0, y: 0 };
}

function getAnchoredZoomOffset(event: MouseEvent | WheelEvent, nextScale: number): { x: number; y: number } {
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

function wheel(event: WheelEvent): void {
  event.preventDefault();
  if (!event.ctrlKey && !event.metaKey) return;
  const nextScale = clampScale(scale.value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  if (nextScale === scale.value) return;
  offset.value = getAnchoredZoomOffset(event, nextScale);
  scale.value = nextScale;
  if (scale.value === 1) offset.value = { x: 0, y: 0 };
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

function navigateFocus(direction: number): boolean {
  if (direction < 0 && !canNavigatePrevious.value) return false;
  if (direction > 0 && !canNavigateNext.value) return false;
  const next = props.images[activeIndex.value + direction];
  if (next) {
    activePreviewId.value = next.id;
    editorActive.value = false;
  }
  return true;
}

function focusPreviewSurface(): void {
  previewRef.value?.focus({ preventScroll: true });
}

function navigateFromToolbar(direction: number): void {
  if (navigateFocus(direction)) focusPreviewSurface();
}

function openPreview(id: string): void {
  activePreviewId.value = id;
  editorActive.value = false;
}

// 打开/切换预览：重置缩放/拖拽态（主页面同口径）并把焦点收进浮层——回车进编辑、
// 空格关预览的键盘语义随即生效（浮层是 tabindex=-1 容器，不进 Tab 序列）。
watch(activePreviewId, async (id) => {
  scale.value = 1;
  offset.value = { x: 0, y: 0 };
  dragging.value = false;
  if (!id) return;
  await nextTick();
  focusPreviewSurface();
});

watch(activeIndex, (index) => {
  if (index >= 0) lastPreviewIndex.value = index;
});

function clearPreview(): void {
  activePreviewId.value = undefined;
  editorActive.value = false;
}

function enterEditor(): void {
  if (!previewImage.value?.src) return;
  editorActive.value = true;
}

function exitEditor(): void {
  editorActive.value = false;
}

// 键盘语义完全复刻 ImagePreview.handleKeydown：Esc/空格关、回车编辑、5 复制、
// w/a/s/d 翻页、Delete 删除、Ctrl+C/Ctrl+V 复制/贴到图后；编辑态回车保存、
// Esc 关整预览。document 捕获阶段截停——外层 NModal 的 FocusTrap 在冒泡阶段
// 收 Esc 会关掉整个弹窗（专注会话被误暂停）。
function handlePreviewKeydown(event: KeyboardEvent): void {
  if (!activePreviewId.value) return;
  const key = event.key.toLowerCase();
  if (editorActive.value && isTextEntryTarget(event.target)) return;
  if (editorActive.value && event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    editorRef.value?.saveImage();
    return;
  }
  if (editorActive.value && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    clearPreview();
    return;
  }
  if (editorActive.value && isPreviewShortcutKey(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!editorActive.value && (event.ctrlKey || event.metaKey)) {
    if (key === "c") {
      event.preventDefault();
      event.stopPropagation();
      if (previewImage.value) emit("copyImage", previewImage.value.id);
      return;
    }
    if (key === "v") {
      const anchor = previewImageRef.value ?? previewRef.value;
      if (anchor && previewImage.value) {
        event.preventDefault();
        event.stopPropagation();
        emit("pasteImage", { placement: "after", targetId: previewImage.value.id, anchor });
      }
      return;
    }
  }
  if (event.key === "Escape" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    clearPreview();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    enterEditor();
    return;
  }
  if (event.key === "5") {
    event.preventDefault();
    event.stopPropagation();
    if (previewImage.value) emit("copyImage", previewImage.value.id);
    return;
  }
  if (key === "w" || key === "a") {
    event.preventDefault();
    event.stopPropagation();
    navigateFocus(-1);
    return;
  }
  if (key === "s" || key === "d") {
    event.preventDefault();
    event.stopPropagation();
    navigateFocus(1);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    event.stopPropagation();
    if (previewImage.value) emit("deleteImage", previewImage.value.id);
  }
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

watch(() => Boolean(activePreviewId.value), (open) => {
  if (open) document.addEventListener("keydown", handlePreviewKeydown, { capture: true });
  else document.removeEventListener("keydown", handlePreviewKeydown, { capture: true });
});

// 预览中的图片被删：按主页面口径跳邻图（同侧邻居优先），全部删光才收浮层。
// 主动关闭（clearPreview 已把 activePreviewId 清空）不算悬空，不复活。
watch(() => props.images.some((image) => image.id === activePreviewId.value), (exists, was) => {
  if (exists || !was) return;
  if (!activePreviewId.value) return;
  const neighbor = props.images[Math.min(lastPreviewIndex.value, props.images.length - 1)];
  if (neighbor) {
    activePreviewId.value = neighbor.id;
    editorActive.value = false;
    return;
  }
  clearPreview();
});

// NModal 常驻挂载（App 只切 show 不 v-if）：show 翻转既管预览态也管计时段。
watch(() => props.show, (visible) => {
  if (visible) {
    // 重开弹窗重置段起点与刻度：隐藏期间的空闲间隔不计入专注时长
    //（关闭时增量已并入 App 的 baseMs，显示从新 baseMs 重新起步）。
    segmentStartAt.value = Date.now();
    nowTick.value = Date.now();
    startDisplayTimer();
    return;
  }
  stopDisplayTimer();
  // 撤下即清预览态：重开弹窗不得复活陈旧预览；activePreviewId 归零连带摘掉键盘监听。
  clearPreview();
});

onBeforeUnmount(() => {
  stopDisplayTimer();
  document.removeEventListener("keydown", handlePreviewKeydown, { capture: true });
});

// 关闭只认右上角 ✕ 与 Esc（mask 不关——专注会话经显式操作暂停）。NModal 理论上
// 不会再发 update:show(false)，保留转发作为兜底：任何程序化撤下同样视作关闭（=暂停）。
function handleModalShow(value: boolean): void {
  if (!value) emit("close");
}
</script>

<template>
  <!-- preset=card 不传 title 且 closable=false：卡片自带的「正在做」头与内置 ✕
       （M6 双头）弃用，头部完全由组件内 .focus-now-header（标题+计时+关闭）承担；
       aria-label 落到卡根元素保住对话框的可读名。mask 不关弹窗；Esc 在预览/编辑
       打开期间被浮层键盘层截停（只收浮层），预览收起后 Esc 才关弹窗。 -->
  <NModal
    :show="show"
    class="focus-now-modal"
    preset="card"
    :closable="false"
    :aria-label="uiText.todo.focusDoing"
    :mask-closable="false"
    :close-on-esc="!activePreviewId"
    @update:show="handleModalShow"
  >
    <div class="focus-now-stage">
      <header class="focus-now-header">
        <div class="focus-now-header-spacer" aria-hidden="true"></div>
        <h2 class="focus-now-title" :title="title">{{ title }}</h2>
        <div class="focus-now-header-controls">
          <span class="focus-now-timer-group">
            <NIcon class="focus-now-timer-icon" :size="26" :aria-label="uiText.todo.focusTimer" aria-hidden="true">
              <TimeOutline />
            </NIcon>
            <time
              class="focus-now-timer"
              role="timer"
              :aria-label="uiText.todo.focusTimer"
              :datetime="displayDurationIso"
            >{{ displayDuration }}</time>
          </span>
          <button
            class="focus-now-close"
            type="button"
            :aria-label="uiText.todo.focusClosePause"
            :title="uiText.todo.focusClosePause"
            @click="emit('close')"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </header>
      <div class="focus-now-body">
        <aside class="focus-now-images" :aria-label="uiText.todo.focusImagesLabel">
          <ImagePanel
            :title="uiText.todo.focusImagesLabel"
            :images="images"
            :active-preview-id="activePreviewId"
            :language="language"
            :can-edit="false"
            hide-header
            @preview="openPreview"
            @close-preview="clearPreview"
            @copy="(id: string) => emit('copyImage', id)"
            @delete="(id: string, anchor?: HTMLElement) => emit('deleteImage', id, anchor)"
            @reorder="(dragId: string, targetId: string) => emit('reorderImages', dragId, targetId)"
            @move-to-bottom="(id: string) => emit('moveImageToBottom', id)"
            @paste="(request: ImagePasteRequest) => emit('pasteImage', request)"
            @drop-files="(files: File[], _anchor: HTMLElement | undefined, targetId: string | undefined) => emit('dropImageFiles', files, targetId)"
          />
        </aside>
        <!-- 右侧区域 = 记事本 + 预览/编辑浮层：浮层绝对定位盖住（而非 v-show 藏起
             记事本——display:none 会丢滚动位置），关预览即原样露出。 -->
        <section class="focus-now-notes">
          <TextPanel
            title-id="focus-now-notes-title"
            :title="uiText.todo.focusDoing"
            :lines="notes"
            :placeholder="uiText.todo.focusNotesPlaceholder"
            :language="language"
            :polish="polish"
            hide-header
            @update="(lines: LineItem[]) => emit('notesUpdate', lines)"
          />
          <div
            v-if="activePreviewId"
            ref="previewRef"
            class="focus-now-preview"
            tabindex="-1"
            :aria-label="uiText.todo.focusImagesLabel"
            @mousemove="move"
            @mouseup="dragging = false"
            @mouseleave="dragging = false"
            @selectstart.prevent
          >
            <ImageEditor
              v-if="editorActive && previewImage?.src"
              ref="editorRef"
              class="focus-now-editor"
              :image="previewImage"
              :language="language"
              @cancel="exitEditor"
              @save="(payload: FocusImageSavePayload) => emit('saveImage', payload)"
            />
            <template v-else>
              <div class="preview-stage focus-now-preview-stage" @wheel="wheel" @mousedown="down">
                <img
                  ref="previewImageRef"
                  :key="activePreviewId"
                  class="focus-now-preview-image"
                  :src="previewImage?.src ?? ''"
                  :alt="uiText.todo.focusImagesLabel"
                  :style="activeImageStyle"
                  draggable="false"
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
                  @keydown.space.stop.prevent="clearPreview"
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
                  @keydown.space.stop.prevent="clearPreview"
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
                <button type="button" class="preview-toolbar-button is-edit" :aria-label="uiText.common.edit" @click.stop.prevent="enterEditor">
                  <NIcon size="18">
                    <CreateOutline />
                  </NIcon>
                </button>
                <button type="button" class="preview-toolbar-button is-delete" :aria-label="uiText.common.delete" @click.stop.prevent="previewImage && emit('deleteImage', previewImage.id)">
                  <NIcon size="18">
                    <TrashOutline />
                  </NIcon>
                </button>
                <button
                  type="button"
                  class="preview-toolbar-button is-close"
                  :aria-label="uiText.preview.close"
                  @click.stop.prevent="clearPreview"
                  @keydown.enter.stop.prevent="clearPreview"
                  @keydown.space.stop.prevent="clearPreview"
                >
                  <NIcon size="18">
                    <CloseOutline />
                  </NIcon>
                </button>
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>
  </NModal>
</template>

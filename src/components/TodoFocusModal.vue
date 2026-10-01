<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NModal } from "naive-ui";
import type { AppLanguage, ImagePasteRequest, LineItem, StoredImage } from "../types";
import { getUiText } from "../state/i18n";
import { formatFocusDuration } from "../state/todos";
import type { PolishKind, PolishResult, PolishStyle } from "../sync/polishClient";
import TextPanel from "./TextPanel.vue";
import ImagePanel from "./ImagePanel.vue";

// 预览是「弹窗上的弹窗」：懒加载（App.vue 同款先例），后开者 z-index 更高天然盖住本弹窗。
const ImagePreview = defineAsyncComponent(() => import("./ImagePreview.vue"));

// ImagePreview 离场淡出时长（App.vue IMAGE_PREVIEW_CLOSE_MS 同口径）。
const PREVIEW_CLOSE_MS = 220;

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
}>();

const uiText = computed(() => getUiText(props.language));
const nowTick = ref(Date.now());
const segmentStartAt = ref(Date.now());
let displayTimer: number | undefined;

onMounted(() => {
  displayTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});

// App checkpoint 提升 baseMs 时重置段起点：显示 = baseMs + (now − 段起点)，接续不跳变。
watch(() => props.baseMs, () => {
  segmentStartAt.value = Date.now();
});

const displayMs = computed(() => props.baseMs + Math.max(0, nowTick.value - segmentStartAt.value));
const displayDuration = computed(() => formatFocusDuration(displayMs.value));
const displayDurationIso = computed(() => `PT${Math.ceil(displayMs.value / 1000)}S`);

// —— 贴图预览：预览态是本组件私有，App 只通过 images/copy/delete 等 props+emits 参与 ——
const activePreviewId = ref<string>();
const closingPreviewId = ref<string>();
let previewCloseTimer: number | undefined;

const displayedPreviewId = computed(() => activePreviewId.value ?? closingPreviewId.value);
const previewClosing = computed(() => Boolean(closingPreviewId.value) && !activePreviewId.value);

function openPreview(id: string): void {
  window.clearTimeout(previewCloseTimer);
  previewCloseTimer = undefined;
  closingPreviewId.value = undefined;
  activePreviewId.value = id;
}

function closePreview(): void {
  // ImagePreview 自带 220ms 离场淡出，emit close 时动画已播完，直接卸载即可
  //（App.vue clearImagePreview 同口径）。
  window.clearTimeout(previewCloseTimer);
  previewCloseTimer = undefined;
  activePreviewId.value = undefined;
  closingPreviewId.value = undefined;
}

// 预览中的图片被删除（images 经 App 更新回落）时：走 closing 相位播完淡出再卸载，
// 避免预览层连同图片一起瞬间消失。
watch(() => props.images.some((image) => image.id === displayedPreviewId.value), (exists, was) => {
  if (exists || !was) return;
  const closingId = displayedPreviewId.value;
  if (!closingId) return;
  activePreviewId.value = undefined;
  closingPreviewId.value = closingId;
  window.clearTimeout(previewCloseTimer);
  previewCloseTimer = window.setTimeout(() => {
    previewCloseTimer = undefined;
    closingPreviewId.value = undefined;
  }, PREVIEW_CLOSE_MS);
});

// 预览内上一张/下一张：只移动 activePreviewId（App.vue navigatePreview 同口径）。
function navigatePreview(direction: number): void {
  const index = props.images.findIndex((image) => image.id === activePreviewId.value);
  if (index < 0) return;
  const next = props.images[index + direction];
  if (next) activePreviewId.value = next.id;
}

onBeforeUnmount(() => {
  window.clearInterval(displayTimer);
  window.clearTimeout(previewCloseTimer);
});

// Esc/遮罩点击：NModal 撤下 show（update:show(false)）同样视作关闭（=暂停）。
function handleModalShow(value: boolean): void {
  if (!value) emit("close");
}
</script>

<template>
  <NModal
    :show="show"
    class="focus-now-modal"
    preset="card"
    :title="uiText.todo.focusDoing"
    :mask-closable="true"
    @update:show="handleModalShow"
  >
    <div class="focus-now-stage">
      <header class="focus-now-header">
        <h2 class="focus-now-title" :title="title">{{ title }}</h2>
        <time
          class="focus-now-timer"
          role="timer"
          :aria-label="uiText.todo.focusTimer"
          :datetime="displayDurationIso"
        >{{ displayDuration }}</time>
        <button
          class="focus-now-close"
          type="button"
          :aria-label="uiText.todo.focusClosePause"
          :title="uiText.todo.focusClosePause"
          @click="emit('close')"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <div class="focus-now-body">
        <aside class="focus-now-images" :aria-label="uiText.todo.focusImagesLabel">
          <ImagePanel
            :title="uiText.todo.focusImagesLabel"
            :images="images"
            :active-preview-id="activePreviewId"
            :language="language"
            hide-header
            @preview="openPreview"
            @close-preview="closePreview"
            @copy="(id: string) => emit('copyImage', id)"
            @delete="(id: string, anchor?: HTMLElement) => emit('deleteImage', id, anchor)"
            @reorder="(dragId: string, targetId: string) => emit('reorderImages', dragId, targetId)"
            @move-to-bottom="(id: string) => emit('moveImageToBottom', id)"
            @paste="(request: ImagePasteRequest) => emit('pasteImage', request)"
            @drop-files="(files: File[], _anchor: HTMLElement | undefined, targetId: string | undefined) => emit('dropImageFiles', files, targetId)"
          />
        </aside>
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
        </section>
      </div>
    </div>
    <!-- 预览内编辑（editId/saveEdit）v1 显式不接：编辑浮层依赖 App 的图片存储/保存链路，留后续接入。 -->
    <ImagePreview
      v-if="displayedPreviewId"
      :images="images"
      :active-id="displayedPreviewId"
      :closing="previewClosing"
      :language="language"
      @close="closePreview"
      @copy="(id: string) => emit('copyImage', id)"
      @delete="(id: string, anchor?: HTMLElement) => emit('deleteImage', id, anchor)"
      @navigate="navigatePreview"
      @reorder="(dragId: string, targetId: string) => emit('reorderImages', dragId, targetId)"
      @move-to-bottom="(id: string) => emit('moveImageToBottom', id)"
      @paste="(request: ImagePasteRequest) => emit('pasteImage', request)"
      @drop-files="(files: File[], _anchor: HTMLElement, targetId: string) => emit('dropImageFiles', files, targetId)"
    />
  </NModal>
</template>

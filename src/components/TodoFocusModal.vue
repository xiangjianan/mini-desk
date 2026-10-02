<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NModal } from "naive-ui";
import type { AppLanguage, ImagePasteRequest, LineItem, StoredImage } from "../types";
import { getUiText } from "../state/i18n";
import { formatFocusDuration } from "../state/todos";
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

// —— 贴图预览/编辑：内嵌在右侧记事本区上方的浮层（不离开弹窗），记事本在下层原样保留 ——
const activePreviewId = ref<string>();
const editorActive = ref(false);
const previewRef = ref<HTMLElement>();

const previewImage = computed(() =>
  props.images.find((image) => image.id === activePreviewId.value));

function openPreview(id: string): void {
  activePreviewId.value = id;
  editorActive.value = false;
}

// 打开/切换预览即把焦点收进浮层：回车进编辑、空格关预览的键盘语义随即生效，
// 也避免焦点滞留在缩略卡按钮上让 Enter 语义分叉（浮层是 tabindex=-1 的容器，
// 不进 Tab 序列、不抢屏幕阅读器焦点语义）。
watch(activePreviewId, async (id) => {
  if (!id) return;
  await nextTick();
  previewRef.value?.focus({ preventScroll: true });
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

// 预览/编辑浮层的键盘语义（document 捕获阶段，浮层关闭即摘除）：
// - 预览态：Esc/空格关预览；回车进编辑（焦点在按钮等交互元素上时不抢键）。
// - 编辑态：Esc 退出编辑回预览（ImageEditor 自身只拦撤销/重做）。
// - 预览打开期间 Esc 必须截停：外层 NModal 的 FocusTrap 在冒泡阶段收 Esc
//   会关掉整个弹窗（专注会话被误暂停），捕获层先到先得。
function handlePreviewKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (editorActive.value) exitEditor();
    else clearPreview();
    return;
  }
  if (editorActive.value) return;
  const onInteractiveTarget = event.target instanceof HTMLElement &&
    Boolean(event.target.closest("button, input, textarea, [contenteditable]"));
  if (onInteractiveTarget) return;
  if (event.key === "Enter") {
    event.preventDefault();
    enterEditor();
    return;
  }
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    clearPreview();
  }
}

watch(() => Boolean(activePreviewId.value), (open) => {
  if (open) document.addEventListener("keydown", handlePreviewKeydown, { capture: true });
  else document.removeEventListener("keydown", handlePreviewKeydown, { capture: true });
});

// 防悬空 id：预览中的图片被删后收起浮层（连同编辑态）。
watch(() => props.images.some((image) => image.id === activePreviewId.value), (exists, was) => {
  if (exists || !was) return;
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
        <!-- 右侧区域 = 记事本 + 预览/编辑浮层：点左栏缩略图在右侧看大图，回车进编辑，
             空格/Esc 关预览回到记事本。浮层绝对定位盖住（而非 v-show 藏起记事本）：
             display:none 会丢记事本滚动位置。 -->
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
          >
            <ImageEditor
              v-if="editorActive && previewImage?.src"
              class="focus-now-editor"
              :image="previewImage"
              :language="language"
              @cancel="exitEditor"
              @save="(payload: FocusImageSavePayload) => emit('saveImage', payload)"
            />
            <template v-else>
              <img class="focus-now-preview-image" :src="previewImage?.src ?? ''" :alt="uiText.todo.focusImagesLabel" draggable="false" />
              <div class="focus-now-preview-toolbar" role="toolbar" :aria-label="uiText.todo.focusImagesLabel">
                <button
                  class="focus-now-preview-action"
                  type="button"
                  :disabled="!previewImage?.src"
                  @click="enterEditor"
                >{{ uiText.todo.focusEditImage }}</button>
                <button
                  class="focus-now-preview-action"
                  type="button"
                  @click="previewImage && emit('copyImage', previewImage.id)"
                >{{ uiText.common.copy }}</button>
                <button
                  class="focus-now-preview-action is-danger"
                  type="button"
                  @click="previewImage && emit('deleteImage', previewImage.id)"
                >{{ uiText.common.delete }}</button>
                <button
                  class="focus-now-preview-close"
                  type="button"
                  :aria-label="uiText.todo.focusClosePreview"
                  :title="uiText.todo.focusClosePreview"
                  @click="clearPreview"
                >{{ uiText.todo.focusClosePreview }}</button>
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>
  </NModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NModal } from "naive-ui";
import type { AppLanguage, ImagePasteRequest, LineItem, StoredImage } from "../types";
import { getUiText } from "../state/i18n";
import { formatFocusDuration } from "../state/todos";
import type { PolishKind, PolishResult, PolishStyle } from "../sync/polishClient";
import TextPanel from "./TextPanel.vue";
import ImagePanel from "./ImagePanel.vue";

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

// —— 贴图预览：内嵌在右侧记事本区上方的浮层（不离开弹窗），记事本在下层原样保留 ——
const activePreviewId = ref<string>();

const previewSrc = computed(() =>
  props.images.find((image) => image.id === activePreviewId.value)?.src ?? "");

function openPreview(id: string): void {
  activePreviewId.value = id;
}

function clearPreview(): void {
  activePreviewId.value = undefined;
}

// 预览打开期间 Esc 只关预览：本弹窗 NModal 已 close-on-esc=false，但 App 的全局
// keydown 也听 Esc（贴图预览快捷键等），捕获阶段截停避免穿透。
function handlePreviewKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  clearPreview();
}

watch(activePreviewId, (id) => {
  if (id) document.addEventListener("keydown", handlePreviewKeydown, { capture: true });
  else document.removeEventListener("keydown", handlePreviewKeydown, { capture: true });
});

// 防悬空 id：预览中的图片被删后收起浮层。
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
  // 撤下即清预览态：重开弹窗不得复活陈旧预览；activePreviewId 归零连带摘掉 Esc 捕获监听。
  clearPreview();
});

onBeforeUnmount(() => {
  stopDisplayTimer();
  document.removeEventListener("keydown", handlePreviewKeydown, { capture: true });
});

// 关闭只认右上角 ✕（mask/Esc 均不触发）。NModal 理论上不会再发 update:show(false)，
// 保留转发作为兜底：任何程序化撤下同样视作关闭（=暂停）。
function handleModalShow(value: boolean): void {
  if (!value) emit("close");
}
</script>

<template>
  <!-- preset=card 不传 title 且 closable=false：卡片自带的「正在做」头与内置 ✕
       （M6 双头）弃用，头部完全由组件内 .focus-now-header（标题+计时+关闭）承担；
       aria-label 落到卡根元素保住对话框的可读名。mask/Esc 都不关弹窗——专注会话
       只经右上角 ✕ 显式暂停。 -->
  <NModal
    :show="show"
    class="focus-now-modal"
    preset="card"
    :closable="false"
    :aria-label="uiText.todo.focusDoing"
    :mask-closable="false"
    :close-on-esc="false"
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
        <!-- 右侧区域 = 记事本 + 预览浮层：点左栏缩略图在右侧看大图，关预览回到记事本。
             浮层绝对定位盖住（而非 v-show 藏起记事本）：display:none 会丢记事本滚动位置。 -->
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
          <div v-if="activePreviewId" class="focus-now-preview" :aria-label="uiText.todo.focusImagesLabel">
            <img class="focus-now-preview-image" :src="previewSrc" :alt="uiText.todo.focusImagesLabel" draggable="false" />
            <button
              class="focus-now-preview-close"
              type="button"
              :aria-label="uiText.todo.focusClosePreview"
              :title="uiText.todo.focusClosePreview"
              @click="clearPreview"
            >
              {{ uiText.todo.focusClosePreview }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </NModal>
</template>

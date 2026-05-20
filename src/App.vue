<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { LogoGithub, MoonOutline, SunnyOutline } from "@vicons/ionicons5";
import { createDiscreteApi, darkTheme, NButton, NConfigProvider, NGlobalStyle, NIcon } from "naive-ui";
import CompanionBubble from "./components/CompanionBubble.vue";
import ImagePanel from "./components/ImagePanel.vue";
import ImagePreview from "./components/ImagePreview.vue";
import QuickButtons from "./components/QuickButtons.vue";
import SettingsMenu from "./components/SettingsMenu.vue";
import TextPanel from "./components/TextPanel.vue";
import TodoPanel from "./components/TodoPanel.vue";
import { AREA_HELP, CONTROL_HELP, DEFAULT_TITLES } from "./state/defaults";
import { deleteStoredImage, hydrateStoredImages, persistImagePayloads, storeImagePayload } from "./state/images";
import { getMessage, withKaomoji, type MessageKey } from "./state/messages";
import {
  addTodo as addTodoToMap,
  clearCompleted,
  completeTodo,
  moveTodo as moveTodoInMap,
  removeEmptyTodo,
  removeTodo as removeTodoFromMap,
  updateTodoText,
} from "./state/todos";
import {
  createId,
  exportJsonState,
  loadState,
  normalizeImportedState,
  saveState,
} from "./state/storage";
import {
  clearStaticCaches,
  getIndexAppVersion,
  getStoredAppVersion,
  markAppVersionSeen,
} from "./state/version";
import type { BoardState, DraggedTodo, GuideKey, LineItem, QuickButtonType, TodoPeriod } from "./types";

const state = reactive<BoardState>(loadState());
const activePreviewId = ref<string | undefined>();
const bubbleMessage = ref("");
const bubbleVisible = ref(false);
const companionFocused = ref(false);
const companionPosition = ref<{ right: string; bottom: string } | undefined>();
const pendingConfirm = ref<{ onConfirm: () => void | Promise<void> } | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const importFeedbackAnchor = ref<HTMLElement | undefined>();
const textSaveTimer = ref<number | undefined>();
const bubbleTimer = ref<number | undefined>();
const guideTimer = ref<number | undefined>();
const appVersion = ref(getIndexAppVersion());
const storedAppVersion = ref<string | null>(null);
const versionPromptVisible = ref(false);
const { message: naiveMessage, dialog: naiveDialog } = createDiscreteApi(["message", "dialog"]);

type BubbleOptions = {
  hideCompanionAfter?: boolean;
  guideKey?: GuideKey;
};

type GuideOptions = {
  keepCompanionAfter?: boolean;
};

const GUIDE_MESSAGES: Record<GuideKey, string> = {
  images: `${AREA_HELP.images} 快捷键：Ctrl+V 粘贴图片，预览时方向键切换。`,
  note: `${AREA_HELP.note} 快捷键：Tab 缩进，Shift+Tab 反向缩进，Ctrl+S 保存。`,
  quickButtons: `${AREA_HELP.quickButtons} 快捷键：Enter 确认表单，Esc 可关闭弹窗。`,
  todos: `${AREA_HELP.todos} 快捷键：Enter 新增下一条，方向键可辅助浏览。`,
  workspace: `${AREA_HELP.workspace} 快捷键：Tab 缩进，Shift+Tab 反向缩进，Ctrl+S 保存。`,
  storage: `${AREA_HELP.storage} 快捷键：Tab 缩进，Ctrl+S 保存。`,
  addQuick: `${CONTROL_HELP.addQuick} 快捷键：Enter 保存，Esc 关闭弹窗。`,
  toggleHiddenQuick: `${CONTROL_HELP.toggleHiddenQuick} 快捷键：再次点击可切回显示状态。`,
  settings: `${CONTROL_HELP.settings} 快捷键：导入导出后会在这里给出反馈。`,
  theme: `${CONTROL_HELP.theme} 快捷键：也可以继续使用鼠标快速切换。`,
};
const GUIDE_DELAY_MIN_MS = 600;
const GUIDE_DELAY_RANGE_MS = 1600;
const GUIDE_MESSAGE_DURATION_MS = 4000;
const GUIDE_GLOBAL_COOLDOWN_MS = 20_000;
const GUIDE_KEY_COOLDOWN_MIN_MS = 60_000;
const GUIDE_KEY_COOLDOWN_RANGE_MS = 60_000;
const GUIDE_FIRST_CHANCE = 0.7;
const GUIDE_REPEAT_CHANCE = 0.25;
const GITHUB_REPO_NAME = "xiangjianan/todolist";
const GITHUB_REPO_URL = "https://github.com/xiangjianan/todolist";
const guideSeenKeys = new Set<GuideKey>();
const guideNextAllowedAt = new Map<GuideKey, number>();
const lastGuideShownAt = ref(Number.NEGATIVE_INFINITY);
const activeGuideKey = ref<GuideKey | null>(null);

const naiveTheme = computed(() => (state.theme === "dark" ? darkTheme : null));
const companionVisible = computed(() => companionFocused.value || bubbleVisible.value);

const titles = computed(() =>
  Object.fromEntries(
    Object.entries(DEFAULT_TITLES).map(([id, title]) => [id, state.customTitles[id] || title]),
  ) as Record<string, string>,
);

onMounted(async () => {
  applyTheme();
  state.images = await hydrateStoredImages(state.images);
  await persistImagePayloads(state.images);
  checkAppVersion();
  window.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("paste", handlePaste);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  document.removeEventListener("paste", handlePaste);
  clearTimers();
});

watch(
  () => state.theme,
  () => {
    applyTheme();
    persistNow();
  },
);

function updateTitle(id: string, value: string): void {
  state.customTitles[id] = value || DEFAULT_TITLES[id] || value;
  persistNow();
}

function updateLines(key: "noteLines" | "workspaceLines" | "storageLines", lines: LineItem[]): void {
  state[key] = lines;
  scheduleTextSave();
}

function scheduleTextSave(): void {
  window.clearTimeout(textSaveTimer.value);
  textSaveTimer.value = window.setTimeout(() => {
    persistNow();
    showSaveBubble();
  }, 3000);
}

function flushTextSave(): void {
  window.clearTimeout(textSaveTimer.value);
  persistNow();
}

function showCompanion(anchor?: HTMLElement, guideKey?: GuideKey): void {
  hideBubbleMessage();
  companionFocused.value = true;
  companionPosition.value = getCompanionPosition(anchor);
  activeGuideKey.value = guideKey ?? null;
}

function handleGuideFocus(key: GuideKey, anchor?: HTMLElement): void {
  showCompanion(anchor, key);
  maybeShowGuideBubble(key, anchor, { keepCompanionAfter: true });
}

function handleGuideClick(key: GuideKey, anchor?: HTMLElement): void {
  invalidateGuideCompanion(key);
  maybeShowGuideBubble(key, anchor);
}

function handleEditorBlur(): void {
  if (pendingConfirm.value) return;
  companionFocused.value = false;
  activeGuideKey.value = null;
  flushTextSave();
}

function handleCompanionBlur(): void {
  if (pendingConfirm.value) return;
  companionFocused.value = false;
  activeGuideKey.value = null;
}

function persistNow(): void {
  saveState(state);
}

async function handlePaste(event: ClipboardEvent): Promise<void> {
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;
  await addImageFile(file);
}

async function pasteImageFromClipboard(): Promise<void> {
  const clipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  };
  if (!clipboard.read) {
    showToast("clipboardPasteUnsupported");
    return;
  }
  const items = await clipboard.read();
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    await addImageFile(new File([blob], "clipboard-image", { type }));
    return;
  }
  showToast("clipboardImageMissing");
}

async function addImageFile(file: File): Promise<void> {
  const image = {
    id: createId(),
    src: await fileToDataUrl(file),
    createdAt: Date.now(),
  };
  state.images.unshift(image);
  await storeImagePayload(image);
  persistNow();
  showToast("imageAdded");
}

function reorderImages(dragId: string, targetId: string): void {
  moveItem(state.images, dragId, targetId);
  persistNow();
}

function deleteImage(id: string, anchor?: HTMLElement): void {
  requestConfirmation("confirmDeleteImage", anchor, async () => {
    state.images = state.images.filter((image) => image.id !== id);
    if (activePreviewId.value === id) activePreviewId.value = state.images[0]?.id;
    await deleteStoredImage(id);
    persistNow();
  });
}

async function copyImage(id: string): Promise<void> {
  const image = state.images.find((item) => item.id === id);
  if (!image?.src) return;
  const clipboard = navigator.clipboard as Clipboard & {
    write?: (items: ClipboardItem[]) => Promise<void>;
  };
  if (clipboard.write && "ClipboardItem" in window) {
    const blob = await (await fetch(image.src)).blob();
    await clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showToast("imageCopied");
    return;
  }
  if (await copyText(image.src)) showToast("imageDataCopied");
}

function saveQuick(payload: { id?: string; title: string; value: string; type: QuickButtonType }): void {
  if (!payload.title && !payload.value) return;
  if (payload.id) {
    const button = state.quickButtons.find((item) => item.id === payload.id);
    if (button) {
      button.title = payload.title || button.title;
      button.value = payload.value;
      button.type = payload.type;
    }
  } else {
    state.quickButtons.push({
      id: createId(),
      title: payload.title || (payload.type === "link" ? "未命名链接" : "未命名文本"),
      value: payload.value,
      type: payload.type,
      hidden: false,
    });
  }
  persistNow();
}

function deleteQuick(id: string, anchor?: HTMLElement): void {
  requestConfirmation("confirmDeleteQuick", anchor, () => {
    state.quickButtons = state.quickButtons.filter((button) => button.id !== id);
    persistNow();
  });
}

function toggleQuickHidden(id: string): void {
  const button = state.quickButtons.find((item) => item.id === id);
  if (!button) return;
  button.hidden = !button.hidden;
  persistNow();
}

function reorderQuickButtons(dragId: string, targetId: string): void {
  moveItem(state.quickButtons, dragId, targetId);
  persistNow();
}

async function handleQuickButton(id: string, anchor?: HTMLElement): Promise<void> {
  const button = state.quickButtons.find((item) => item.id === id);
  if (!button) return;
  if (button.type === "link") {
    window.open(normalizeLink(button.value), "_blank", "noopener,noreferrer");
    return;
  }
  showBubble((await copyText(button.value)) ? "quickTextCopied" : "quickTextCopyFailed", anchor, {
    hideCompanionAfter: true,
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function createTodo(period: TodoPeriod, afterId?: string): void {
  state.todos = addTodoToMap(
    state.todos,
    period,
    {
      id: createId(),
      text: "",
      done: false,
    },
    afterId,
  );
  persistNow();
  nextTick(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>(`[data-testid="todo-input-${period}"]`);
    inputs[inputs.length - 1]?.focus();
  });
}

function updateTodo(period: TodoPeriod, id: string, text: string): void {
  state.todos = updateTodoText(state.todos, period, id, text);
  persistNow();
}

function complete(period: TodoPeriod, id: string, done: boolean): void {
  state.todos = completeTodo(state.todos, period, id, done);
  persistNow();
  if (done) showBubble("todoCompleted");
}

function removeTodo(period: TodoPeriod, id: string, anchor?: HTMLElement): void {
  requestConfirmation("confirmDeleteTodo", anchor, () => {
    state.todos = removeTodoFromMap(state.todos, period, id);
    persistNow();
  });
}

function clearDone(period: TodoPeriod, anchor?: HTMLElement): void {
  if (!state.todos[period].some((todo) => todo.done)) {
    showBubble("noCompletedTodos", anchor);
    return;
  }
  requestConfirmation("confirmClearCompleted", anchor, () => {
    state.todos = clearCompleted(state.todos, period);
    persistNow();
  });
}

function blurEmptyTodo(period: TodoPeriod, id: string): void {
  state.todos = removeEmptyTodo(state.todos, period, id);
  persistNow();
}

function moveTodo(dragged: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string): void {
  state.todos = moveTodoInMap(state.todos, dragged.period, dragged.id, destinationPeriod, targetId);
  persistNow();
}

function toggleTheme(): void {
  state.theme = state.theme === "dark" ? "light" : "dark";
}

function handleThemeClick(event: MouseEvent): void {
  toggleTheme();
  handleGuideClick("theme", event.currentTarget as HTMLElement);
}

function applyTheme(): void {
  document.documentElement.dataset.theme = state.theme;
}

function exportData(anchor?: HTMLElement): void {
  const blob = new Blob([exportJsonState(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `todo-board-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showBubble("dataExported", anchor, { hideCompanionAfter: true });
}

function requestImport(anchor?: HTMLElement): void {
  importFeedbackAnchor.value = anchor;
  importInput.value?.click();
}

async function importData(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  const next = normalizeImportedState(JSON.parse(text));
  Object.assign(state, next);
  await persistImagePayloads(state.images);
  persistNow();
  showBubble("dataImported", importFeedbackAnchor.value, { hideCompanionAfter: true });
  importFeedbackAnchor.value = undefined;
  input.value = "";
}

function about(): void {
  naiveDialog.info({
    title: "关于",
    content: () =>
      h("div", { class: "about-dialog-content" }, [
        h("p", { class: "about-dialog-text" }, getMessage("about")),
        h(
          "a",
          {
            class: "about-github-link",
            href: GITHUB_REPO_URL,
            target: "_blank",
            rel: "noreferrer",
          },
          [h(NIcon, { component: LogoGithub, size: 18 }), h("span", GITHUB_REPO_NAME)],
        ),
      ]),
    positiveText: "知道了",
  });
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && companionVisible.value) {
    hideCompanion();
    (document.activeElement as HTMLElement | null)?.blur();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    flushTextSave();
    showSaveBubble();
  }
  if (activePreviewId.value) {
    if (event.key === "Escape" || event.key === " ") activePreviewId.value = undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") navigatePreview(-1);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") navigatePreview(1);
  }
}

function navigatePreview(direction: number): void {
  const index = state.images.findIndex((image) => image.id === activePreviewId.value);
  if (index < 0) return;
  const next = state.images[index + direction];
  if (next) activePreviewId.value = next.id;
}

function showSaveBubble(): void {
  showBubble("save");
}

function showBubble(messageKey: MessageKey, anchor?: HTMLElement, options: BubbleOptions = {}): void {
  showBubbleText(getMessage(messageKey), anchor, options);
}

function showBubbleText(message: string, anchor?: HTMLElement, options: BubbleOptions = {}, duration = 3000): void {
  clearGuideTimer();
  window.clearTimeout(bubbleTimer.value);
  pendingConfirm.value = null;
  bubbleMessage.value = message;
  activeGuideKey.value = options.guideKey ?? null;
  if (anchor) {
    companionFocused.value = true;
    companionPosition.value = getCompanionPosition(anchor);
  }
  bubbleVisible.value = true;
  bubbleTimer.value = window.setTimeout(() => {
    bubbleVisible.value = false;
    bubbleMessage.value = "";
    if (options.hideCompanionAfter) {
      companionFocused.value = false;
      activeGuideKey.value = null;
    }
  }, duration);
}

function hideBubbleMessage(): void {
  clearGuideTimer();
  window.clearTimeout(bubbleTimer.value);
  pendingConfirm.value = null;
  bubbleVisible.value = false;
  bubbleMessage.value = "";
}

function hideCompanion(): void {
  hideBubbleMessage();
  companionFocused.value = false;
  activeGuideKey.value = null;
}

function requestConfirmation(
  messageKey: MessageKey,
  anchor: HTMLElement | undefined,
  onConfirm: () => void | Promise<void>,
): void {
  clearGuideTimer();
  window.clearTimeout(bubbleTimer.value);
  bubbleMessage.value = getMessage(messageKey);
  pendingConfirm.value = { onConfirm };
  activeGuideKey.value = null;
  bubbleVisible.value = true;
  companionFocused.value = true;
  companionPosition.value = getCompanionPosition(anchor);
}

async function confirmCompanionAction(): Promise<void> {
  const action = pendingConfirm.value;
  if (!action) return;
  pendingConfirm.value = null;
  bubbleVisible.value = false;
  bubbleMessage.value = "";
  activeGuideKey.value = null;
  await action.onConfirm();
}

function cancelCompanionAction(): void {
  hideCompanion();
}

function showToast(messageKey: MessageKey): void {
  naiveMessage.info(getMessage(messageKey), { duration: 1800 });
}

function clearTimers(): void {
  window.clearTimeout(textSaveTimer.value);
  window.clearTimeout(bubbleTimer.value);
  clearGuideTimer();
}

function maybeShowGuideBubble(key: GuideKey, anchor?: HTMLElement, options: GuideOptions = {}): void {
  const now = Date.now();
  if (pendingConfirm.value || bubbleVisible.value) return;
  if (now - lastGuideShownAt.value < GUIDE_GLOBAL_COOLDOWN_MS) return;
  if (now < (guideNextAllowedAt.get(key) ?? 0)) return;
  const chance = guideSeenKeys.has(key) ? GUIDE_REPEAT_CHANCE : GUIDE_FIRST_CHANCE;
  if (Math.random() > chance) return;

  clearGuideTimer();
  const delay = GUIDE_DELAY_MIN_MS + Math.floor(Math.random() * GUIDE_DELAY_RANGE_MS);
  guideTimer.value = window.setTimeout(() => {
    guideTimer.value = undefined;
    if (pendingConfirm.value || bubbleVisible.value) return;
    showBubbleText(
      withKaomoji(GUIDE_MESSAGES[key], "encouraging"),
      anchor,
      { hideCompanionAfter: !options.keepCompanionAfter, guideKey: key },
      GUIDE_MESSAGE_DURATION_MS,
    );
    const shownAt = Date.now();
    lastGuideShownAt.value = shownAt;
    guideSeenKeys.add(key);
    guideNextAllowedAt.set(
      key,
      shownAt + GUIDE_KEY_COOLDOWN_MIN_MS + Math.floor(Math.random() * GUIDE_KEY_COOLDOWN_RANGE_MS),
    );
  }, delay);
}

function clearGuideTimer(): void {
  window.clearTimeout(guideTimer.value);
  guideTimer.value = undefined;
}

function invalidateGuideCompanion(nextKey: GuideKey): void {
  clearGuideTimer();
  if (!activeGuideKey.value || activeGuideKey.value === nextKey || pendingConfirm.value) return;
  hideCompanion();
}

function checkAppVersion(): void {
  storedAppVersion.value = getStoredAppVersion();
  if (!storedAppVersion.value) {
    markAppVersionSeen(appVersion.value);
    storedAppVersion.value = appVersion.value;
    return;
  }
  versionPromptVisible.value = storedAppVersion.value !== appVersion.value;
}

async function updateStaticVersion(): Promise<void> {
  await clearStaticCaches();
  markAppVersionSeen(appVersion.value);
  versionPromptVisible.value = false;
  window.location.reload();
}

function getCompanionPosition(anchor?: HTMLElement): { right: string; bottom: string } | undefined {
  const target = anchor?.closest(".image-preview, .preview-main, .preview-stage, .todo-list, .todo-section, .quick-block, .text-panel, .split-block, .panel") as HTMLElement | null;
  if (!target) return undefined;
  const rect = target.getBoundingClientRect();
  if (!rect.width && !rect.height) return undefined;
  return {
    right: `calc(100vw - ${Math.round(rect.right)}px + 10px)`,
    bottom: `calc(100vh - ${Math.round(rect.bottom)}px + 10px)`,
  };
}

function normalizeLink(value: string): string {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function moveItem<T extends { id: string }>(items: T[], dragId: string, targetId: string): void {
  const sourceIndex = items.findIndex((item) => item.id === dragId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [item] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, item);
}

</script>

<template>
  <NConfigProvider :theme="naiveTheme">
    <NGlobalStyle />
    <main class="board" aria-label="To Do List 看板">
      <ImagePanel
        :title="titles['image-title']"
        :images="state.images"
        @title-update="updateTitle"
        @preview="activePreviewId = $event"
        @copy="copyImage"
        @delete="deleteImage"
        @reorder="reorderImages"
        @paste="pasteImageFromClipboard"
        @guide="handleGuideClick"
      />

      <section class="panel note-link-panel" aria-labelledby="note-title">
        <TextPanel
          split
          title-id="note-title"
          :title="titles['note-title']"
          :lines="state.noteLines"
          placeholder="随手记：临时想法、灵感、草稿先放这里。Tab 可缩进。"
          @title-update="updateTitle"
          @update="updateLines('noteLines', $event)"
          @focus="handleGuideFocus('note', $event)"
          @blur="handleEditorBlur"
        />
        <QuickButtons
          :title="titles['quick-title']"
          :buttons="state.quickButtons"
          :show-hidden="state.showHiddenQuickButtons"
          @title-update="updateTitle"
          @save="saveQuick"
          @delete="deleteQuick"
          @copy="handleQuickButton"
          @toggle-hidden="toggleQuickHidden"
          @toggle-show-hidden="state.showHiddenQuickButtons = !state.showHiddenQuickButtons; persistNow()"
          @reorder="reorderQuickButtons"
          @guide="handleGuideClick"
        />
      </section>

      <TodoPanel
        :todos="state.todos"
        :titles="titles"
        @title-update="updateTitle"
        @create="createTodo"
        @update="updateTodo"
        @complete="complete"
        @remove="removeTodo"
        @clear-completed="clearDone"
        @blur-empty="blurEmptyTodo"
        @blur="handleCompanionBlur"
        @move="moveTodo"
        @focus="handleGuideFocus('todos', $event)"
        @guide="handleGuideClick"
      />

      <TextPanel
        title-id="workspace-title"
        :title="titles['workspace-title']"
        :lines="state.workspaceLines"
        placeholder="工作空间：拆任务、写步骤、整理当前上下文。Tab 可缩进。"
        @title-update="updateTitle"
        @update="updateLines('workspaceLines', $event)"
        @focus="handleGuideFocus('workspace', $event)"
        @blur="handleEditorBlur"
      />

      <div class="mobile-banner">
        <p>为了更好的体验，推荐在电脑端使用完整功能。</p>
      </div>

      <TextPanel
        title-id="storage-title"
        :title="titles['storage-title']"
        :lines="state.storageLines"
        placeholder="尽情发挥吧"
        @title-update="updateTitle"
        @update="updateLines('storageLines', $event)"
        @focus="handleGuideFocus('storage', $event)"
        @blur="handleEditorBlur"
      />
    </main>

    <ImagePreview
      :images="state.images"
      :active-id="activePreviewId"
      @close="activePreviewId = undefined"
      @copy="copyImage"
      @delete="deleteImage"
      @activate="activePreviewId = $event"
    />

    <CompanionBubble
      :visible="companionVisible"
      :message="bubbleMessage"
      :confirm="Boolean(pendingConfirm)"
      :position="companionPosition"
      @yes="confirmCompanionAction"
      @no="cancelCompanionAction"
    />
    <div class="top-actions">
      <SettingsMenu
        :app-version="appVersion"
        :update-available="versionPromptVisible"
        @export="exportData"
        @import="requestImport"
        @about="about"
        @update="updateStaticVersion"
        @guide="handleGuideClick"
      />
      <NButton quaternary size="small" class="theme-btn icon-button" aria-label="切换主题" @click="handleThemeClick">
        <NIcon :component="state.theme === 'dark' ? SunnyOutline : MoonOutline" />
      </NButton>
    </div>
    <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importData" />
  </NConfigProvider>
</template>

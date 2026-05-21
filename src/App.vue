<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { LogoGithub, MoonOutline, SunnyOutline } from "@vicons/ionicons5";
import { createDiscreteApi, darkTheme, NButton, NConfigProvider, NGlobalStyle, NIcon, NModal } from "naive-ui";
import CompanionBubble from "./components/CompanionBubble.vue";
import ImagePanel from "./components/ImagePanel.vue";
import ImagePreview from "./components/ImagePreview.vue";
import QuickButtons from "./components/QuickButtons.vue";
import SettingsMenu from "./components/SettingsMenu.vue";
import TextPanel from "./components/TextPanel.vue";
import TodoPanel from "./components/TodoPanel.vue";
import { AREA_HELP, CONTROL_HELP, DEFAULT_TITLES, TODO_PERIODS } from "./state/defaults";
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
const companionPosition = ref<{ right: string; bottom?: string; top?: string } | undefined>();
const pendingConfirm = ref<{ onConfirm: () => void | Promise<void> } | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const importFeedbackAnchor = ref<HTMLElement | undefined>();
const textSaveTimer = ref<number | undefined>();
const bubbleTimer = ref<number | undefined>();
const emptyTodoRemovalTimers = new Map<string, number>();
const appVersion = ref(getIndexAppVersion());
const storedAppVersion = ref<string | null>(null);
const versionPromptVisible = ref(false);
const aboutVisible = ref(false);
const aboutMessage = ref(getMessage("about"));
const { message: naiveMessage } = createDiscreteApi(["message"]);

type BubbleOptions = {
  hideCompanionAfter?: boolean;
  guideKey?: GuideKey;
};

const GUIDE_MESSAGES: Record<GuideKey, string[]> = {
  images: [
    `${AREA_HELP.images} Ctrl+V 粘贴图片，点击缩略图预览，方向键切换。`,
    "截图区支持粘贴、拖拽排序、右键复制/删除，也可以置顶置底。",
    "预览图片时可滚轮缩放、拖动平移，右键可复制、删除或取消预览。",
  ],
  note: [
    `${AREA_HELP.note} 双击开始编辑，Ctrl+S 可立即保存。`,
    "便签区适合临时记录，右键可复制/粘贴，也能打开使用指南。",
    "写下零散想法后不用急着整理，停顿片刻会自动保存。",
  ],
  quickButtons: [
    `${AREA_HELP.quickButtons} 链接会直接打开，文本会复制到剪贴板。`,
    "快捷区可新增链接或复制文本，隐藏按钮可收起不常用入口。",
    "编辑快捷内容时可以选择链接属性或复制文本属性，保存前会校验标题和内容。",
  ],
  todos: [
    `${AREA_HELP.todos} 双击空白处新增，双击文字开始编辑。`,
    "提醒事项可勾选完成，右键可复制/粘贴、删除、置顶或置底。",
    "完成项可以统一清理；没有完成项时会给出提示，不会误删内容。",
  ],
  workspace: [
    `${AREA_HELP.workspace} 双击编辑，Tab 缩进，Shift+Tab 取消缩进。`,
    "工作空间适合拆步骤，缩进行会显示短横线，空缩进行按 Enter 会退出缩进。",
    "编辑时 Ctrl+S 可立即保存，右键可复制/粘贴并查看指南。",
  ],
  storage: [
    `${AREA_HELP.storage} 双击编辑，Ctrl+S 保存，适合放长期内容。`,
    "扩展区支持和工作空间一样的缩进、换行、复制与粘贴。",
    "需要长期保留的资料可以放这里，自动保存会帮你收好。",
  ],
  addQuick: [
    `${CONTROL_HELP.addQuick} 可新增链接或复制文本，默认是链接属性。`,
    "新增快捷内容时，标题和内容都要填写，链接与复制文本只能选一个。",
    "快捷按钮保存后会出现在快捷区，常用入口可以更快触达。",
  ],
  toggleHiddenQuick: [
    `${CONTROL_HELP.toggleHiddenQuick} 再点一次可切回。`,
    "隐藏按钮适合收纳低频入口，展开后可以继续编辑或使用。",
    "想清理界面时，把不常用的快捷内容隐藏起来就好。",
  ],
  settings: [
    `${CONTROL_HELP.settings} 可导入导出数据、查看关于和版本状态。`,
    "设置里能备份看板数据，也能在版本更新时刷新静态缓存。",
    "关于弹窗里有项目名和 GitHub 入口，版本信息也收在这里。",
  ],
  theme: [
    `${CONTROL_HELP.theme} 点一下就换风格。`,
    "主题按钮可在明暗色之间切换，页面会记住你的选择。",
    "白天和夜间都可以切换到更舒服的显示状态。",
  ],
};
const GUIDE_MESSAGE_DURATION_MS = 4000;
const GITHUB_REPO_NAME = "xiangjianan/todolist";
const GITHUB_REPO_URL = "https://github.com/xiangjianan/todolist";
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
}

function handleGuideClick(key: GuideKey, anchor?: HTMLElement, immediate = false): void {
  invalidateGuideCompanion(key);
  if (immediate) {
    showGuideBubble(key, anchor);
    return;
  }
  showCompanion(anchor, key);
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

function moveImageToTop(id: string): void {
  moveItemToStart(state.images, id);
  persistNow();
}

function moveImageToBottom(id: string): void {
  moveItemToEnd(state.images, id);
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

function openImagePreview(id: string): void {
  hideCompanion();
  activePreviewId.value = id;
}

async function copyImage(id: string): Promise<void> {
  const image = state.images.find((item) => item.id === id);
  if (!image?.src) return;
  const clipboard = navigator.clipboard as Clipboard & {
    write?: (items: ClipboardItem[]) => Promise<void>;
  };
  if (clipboard.write && "ClipboardItem" in window) {
    const blob = await (await fetch(image.src)).blob();
    await clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
    showBubble("imageCopied", undefined, { hideCompanionAfter: true });
    return;
  }
  if (await copyText(image.src)) showBubble("imageDataCopied", undefined, { hideCompanionAfter: true });
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
  if (!afterId) {
    const blankTodo = findOpenBlankTodo();
    if (blankTodo) {
      cancelEmptyTodoRemoval(blankTodo.period, blankTodo.id);
      nextTick(() => focusTodoInput(blankTodo.period, blankTodo.id));
      return;
    }
  }
  const id = createId();
  state.todos = addTodoToMap(
    state.todos,
    period,
    {
      id,
      text: "",
      done: false,
    },
    afterId,
  );
  persistNow();
  nextTick(() => focusTodoInput(period, id));
}

function findOpenBlankTodo(): { period: TodoPeriod; id: string } | undefined {
  for (const period of TODO_PERIODS) {
    const blankTodo = state.todos[period].find((todo) => !todo.done && todo.text.trim().length === 0);
    if (blankTodo) return { period, id: blankTodo.id };
  }
  return undefined;
}

function focusTodoInput(period: TodoPeriod, id: string): void {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`[data-testid="todo-input-${period}"]`));
  const input = inputs.find((item) => item.dataset.todoId === id) ?? inputs.at(-1);
  if (!input) return;
  const caret = input.value.length;
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
}

function updateTodo(period: TodoPeriod, id: string, text: string): void {
  cancelEmptyTodoRemoval(period, id);
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
  cancelEmptyTodoRemoval(period, id);
  const todo = state.todos[period].find((item) => item.id === id);
  if (!todo || todo.text.trim()) return;
  emptyTodoRemovalTimers.set(
    todoKey(period, id),
    window.setTimeout(() => {
      state.todos = removeEmptyTodo(state.todos, period, id);
      emptyTodoRemovalTimers.delete(todoKey(period, id));
      persistNow();
    }, 260),
  );
}

function moveTodo(dragged: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string): void {
  state.todos = moveTodoInMap(state.todos, dragged.period, dragged.id, destinationPeriod, targetId);
  persistNow();
}

function toggleTheme(): void {
  state.theme = state.theme === "dark" ? "light" : "dark";
}

function handleThemeClick(): void {
  toggleTheme();
  hideCompanion();
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
  aboutMessage.value = getMessage("about");
  aboutVisible.value = true;
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
    if (event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      activePreviewId.value = undefined;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      navigatePreview(-1);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      navigatePreview(1);
    }
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
  hideCompanion();
  (document.activeElement as HTMLElement | null)?.blur();
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
  emptyTodoRemovalTimers.forEach((timer) => window.clearTimeout(timer));
  emptyTodoRemovalTimers.clear();
}

function todoKey(period: TodoPeriod, id: string): string {
  return `${period}:${id}`;
}

function cancelEmptyTodoRemoval(period: TodoPeriod, id: string): void {
  const key = todoKey(period, id);
  const timer = emptyTodoRemovalTimers.get(key);
  if (!timer) return;
  window.clearTimeout(timer);
  emptyTodoRemovalTimers.delete(key);
}

function showGuideBubble(key: GuideKey, anchor?: HTMLElement): void {
  if (pendingConfirm.value) return;
  showBubbleText(
    withKaomoji(randomGuideMessage(key), "encouraging"),
    anchor,
    { hideCompanionAfter: true, guideKey: key },
    GUIDE_MESSAGE_DURATION_MS,
  );
}

function randomGuideMessage(key: GuideKey): string {
  const messages = GUIDE_MESSAGES[key];
  return messages[Math.floor(Math.random() * messages.length)];
}

function invalidateGuideCompanion(nextKey: GuideKey): void {
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

function getCompanionPosition(anchor?: HTMLElement): { right: string; bottom?: string; top?: string } | undefined {
  if (isMobileLayout()) {
    return {
      right: "12px",
      top: "118px",
    };
  }
  const target = anchor?.closest(".image-preview, .preview-main, .preview-stage, .todo-list, .todo-section, .quick-block, .text-panel, .split-block, .panel") as HTMLElement | null;
  if (!target) return undefined;
  const rect = target.getBoundingClientRect();
  if (!rect.width && !rect.height) return undefined;
  return {
    right: `calc(100vw - ${Math.round(rect.right)}px + 10px)`,
    bottom: `calc(100vh - ${Math.round(rect.bottom)}px + 10px)`,
  };
}

function isMobileLayout(): boolean {
  return window.matchMedia?.("(max-width: 900px)").matches ?? window.innerWidth <= 900;
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

function moveItemToStart<T extends { id: string }>(items: T[], id: string): void {
  const index = items.findIndex((item) => item.id === id);
  if (index <= 0) return;
  const [item] = items.splice(index, 1);
  items.unshift(item);
}

function moveItemToEnd<T extends { id: string }>(items: T[], id: string): void {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0 || index === items.length - 1) return;
  const [item] = items.splice(index, 1);
  items.push(item);
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
        @preview="openImagePreview"
        @copy="copyImage"
        @delete="deleteImage"
        @reorder="reorderImages"
        @move-top="moveImageToTop"
        @move-bottom="moveImageToBottom"
        @paste="pasteImageFromClipboard"
        @guide="handleGuideClick"
      />

      <section class="panel note-link-panel" aria-labelledby="note-title">
        <TextPanel
          split
          title-id="note-title"
          :title="titles['note-title']"
          :lines="state.noteLines"
          placeholder="灵感先放这里，双击开始写 (＾▽＾)"
          @title-update="updateTitle"
          @update="updateLines('noteLines', $event)"
          @focus="handleGuideFocus('note', $event)"
          @guide="(anchor, immediate) => handleGuideClick('note', anchor, immediate)"
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

      <div class="mobile-banner">
        <p>移动端保留工作区编辑，桌面版体验更完整 (｡•̀ᴗ-)✧</p>
      </div>

      <TextPanel
        class="workspace-panel"
        title-id="workspace-title"
        :title="titles['workspace-title']"
        :lines="state.workspaceLines"
        placeholder="拆任务、写步骤，双击开始推进 (๑•̀ㅂ•́)و✧"
        @title-update="updateTitle"
        @update="updateLines('workspaceLines', $event)"
        @focus="handleGuideFocus('workspace', $event)"
        @guide="(anchor, immediate) => handleGuideClick('workspace', anchor, immediate)"
        @blur="handleEditorBlur"
      />

      <TextPanel
        title-id="storage-title"
        :title="titles['storage-title']"
        :lines="state.storageLines"
        placeholder="长期内容放这里，安心留一份 (＾－＾)V"
        @title-update="updateTitle"
        @update="updateLines('storageLines', $event)"
        @focus="handleGuideFocus('storage', $event)"
        @guide="(anchor, immediate) => handleGuideClick('storage', anchor, immediate)"
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
      :theme="state.theme"
      @yes="confirmCompanionAction"
      @no="cancelCompanionAction"
    />
    <NModal
      v-model:show="aboutVisible"
      preset="card"
      title="关于"
      class="about-modal"
      :mask-closable="true"
      :auto-focus="false"
    >
      <div class="about-dialog-content">
        <p class="about-dialog-text">{{ aboutMessage }}</p>
        <a
          class="about-github-link"
          :href="GITHUB_REPO_URL"
          target="_blank"
          rel="noreferrer"
        >
          <NIcon :component="LogoGithub" :size="18" />
          <span>{{ GITHUB_REPO_NAME }}</span>
        </a>
      </div>
      <template #footer>
        <div class="about-dialog-actions">
          <NButton class="about-confirm-button" @click="aboutVisible = false">知道了</NButton>
        </div>
      </template>
    </NModal>
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

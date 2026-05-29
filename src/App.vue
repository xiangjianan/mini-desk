<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { MoonOutline, SunnyOutline } from "@vicons/ionicons5";
import { darkTheme, dateEnUS, dateZhCN, enUS, NButton, NConfigProvider, NGlobalStyle, NIcon, zhCN } from "naive-ui";
import CompanionBubble from "./components/CompanionBubble.vue";
import ImagePanel from "./components/ImagePanel.vue";
import ImagePreview from "./components/ImagePreview.vue";
import QuickButtons from "./components/QuickButtons.vue";
import SettingsMenu from "./components/SettingsMenu.vue";
import SpacePanel from "./components/SpacePanel.vue";
import TextPanel from "./components/TextPanel.vue";
import TodoPanel from "./components/TodoPanel.vue";
import { getCompanionGifSrc, getCompanionNotificationIconSrc } from "./state/companionGifThemes";
import { deleteStoredImage, hydrateStoredImages, persistImagePayloads, storeImagePayload } from "./state/images";
import { getMessage, withKaomoji, type MessageKey } from "./state/messages";
import {
  getDefaultTitles,
  getDisplaySpaceTitle,
  getDisplayTodoListTitle,
  getGuideMessages,
  getStoredSpaceTitle,
  getStoredTodoListTitle,
  getUiText,
  normalizeLanguage,
} from "./state/i18n";
import {
  addTodo as addTodoToMap,
  clearCompleted,
  completeTodo,
  moveTodo as moveTodoInMap,
  removeEmptyTodo,
  removeTodo as removeTodoFromMap,
  removeTodoListData,
  reorderTodoLists,
  setTodoNotifyAt,
  splitTodo as splitTodoInMap,
  starTodo,
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
import type { AppLanguage, BoardState, CompanionGifTheme, DraggedTodo, GuideKey, LineItem, QuickButtonType, StoredImage, TodoItem, TodoListConfig, TodoListId, TodoPeriod, TodoStarChange, WorkspaceSpace } from "./types";

const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";
const TODO_NOTIFICATION_FALLBACK_INTERVAL_MS = 30_000;
const MAX_TODO_NOTIFICATION_TIMEOUT_MS = 2_147_483_647;
const mobileCompanionPosition: { right: string; bottom: string } = { right: "18px", bottom: "28px" };

function getInitialMobileBlocked(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}

const state = reactive<BoardState>(loadState());
const activePreviewId = ref<string | undefined>();
const bubbleMessage = ref("");
const bubbleLink = ref<{ text: string; href: string } | null>(null);
const bubbleVisible = ref(false);
const companionFocused = ref(false);
const companionPosition = ref<{ right: string; bottom?: string; top?: string } | undefined>();
const pendingConfirm = ref<{
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  confirmText: string;
  cancelText: string;
  danger: boolean;
} | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const importFeedbackAnchor = ref<HTMLElement | undefined>();
const pendingEditSpaceId = ref<string | null>(null);
const pendingEditTodoListId = ref<string | null>(null);
const textSaveTimer = ref<number | undefined>();
const bubbleTimer = ref<number | undefined>();
const bubbleFadeTimer = ref<number | undefined>();
const bubbleRemainingMs = ref(0);
const bubbleTimerStartedAt = ref(0);
const bubbleTimerOptions = ref<BubbleOptions>({});
const bubbleClearSignal = ref(0);
const saveStatusTimer = ref<number | undefined>();
const todoNotificationTimer = ref<number | undefined>();
const todoNotificationDueTimer = ref<number | undefined>();
const emptyTodoRemovalTimers = new Map<string, number>();
const sentTodoNotifications = new Set<string>();
const appVersion = ref(getIndexAppVersion());
const storedAppVersion = ref<string | null>(null);
const versionPromptVisible = ref(false);
const versionBadgeVisible = ref(false);
const isMobileBlocked = ref(getInitialMobileBlocked());
const mobileMediaQuery = ref<MediaQueryList | null>(null);
let appMounted = false;

type BubbleOptions = {
  hideCompanionAfter?: boolean;
  guideKey?: GuideKey;
  linkText?: string;
  linkHref?: string;
};

const GUIDE_MESSAGE_DURATION_MS = 5000;
const GITHUB_ISSUE_URL = "https://github.com/xiangjianan/todolist/issues/new";
const GITHUB_REPO_URL = "https://github.com/xiangjianan/todolist";
const GITHUB_REPO_LABEL = "xiangjianan / todolist";
const ABOUT_MESSAGE_DURATION_MS = 10000;
const VERSION_BADGE_MAX_VISIBLE_MS = 10000;
const MIN_COMPANION_POPOVER_RIGHT_EDGE = 260;
const activeGuideKey = ref<GuideKey | null>(null);
const versionBadgeTimer = ref<number | undefined>();

const naiveTheme = computed(() => (state.theme === "dark" ? darkTheme : null));
const naiveLocale = computed(() => (state.language === "en" ? enUS : zhCN));
const naiveDateLocale = computed(() => (state.language === "en" ? dateEnUS : dateZhCN));
const uiText = computed(() => getUiText(state.language));
const companionVisible = computed(() => companionFocused.value || bubbleVisible.value);
const activeCompanionVisible = computed(() => isMobileBlocked.value || companionVisible.value);
const activeCompanionMessage = computed(() => (isMobileBlocked.value ? uiText.value.app.mobileMessage : bubbleMessage.value));
const activeCompanionPosition = computed(() => (isMobileBlocked.value ? mobileCompanionPosition : companionPosition.value));
const saveStatus = ref<"saved" | "saving" | "dirty">("saved");
const saveStatusLabel = computed(() => {
  if (saveStatus.value === "dirty") return uiText.value.app.dirty;
  if (saveStatus.value === "saving") return uiText.value.app.saving;
  return uiText.value.app.saved;
});

const titles = computed(() =>
  Object.fromEntries(
    Object.entries(getDefaultTitles(state.language)).map(([id, title]) => [id, state.customTitles[id] || title]),
  ) as Record<string, string>,
);
const displayTodoLists = computed<TodoListConfig[]>(() =>
  state.todoLists.map((list) => ({
    ...list,
    title: getDisplayTodoListTitle(list, state.language),
  })),
);
const displaySpaces = computed<WorkspaceSpace[]>(() =>
  state.spaces.map((space) => ({
    ...space,
    title: getDisplaySpaceTitle(space, state.language),
  })),
);

function updateMobileBlocked(source?: MediaQueryList | MediaQueryListEvent): void {
  const matches = Boolean(source?.matches ?? mobileMediaQuery.value?.matches);
  const wasMobileBlocked = isMobileBlocked.value;
  if (matches && !wasMobileBlocked) {
    activePreviewId.value = undefined;
    if (textSaveTimer.value !== undefined) flushTextSave();
    clearPendingConfirm(true);
    hideBubbleMessage({ clearRetainedContent: true });
    companionFocused.value = false;
    activeGuideKey.value = null;
  }
  isMobileBlocked.value = matches;
}

function shouldBlockBoardEffects(): boolean {
  return isMobileBlocked.value;
}

function setupMobileBreakpoint(): void {
  if (!window.matchMedia) return;
  const query = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
  mobileMediaQuery.value = query;
  updateMobileBlocked(query);
  if (query.addEventListener) {
    query.addEventListener("change", updateMobileBlocked);
    return;
  }
  query.addListener(updateMobileBlocked);
}

function teardownMobileBreakpoint(): void {
  const query = mobileMediaQuery.value;
  if (!query) return;
  if (query.removeEventListener) {
    query.removeEventListener("change", updateMobileBlocked);
  } else {
    query.removeListener(updateMobileBlocked);
  }
  mobileMediaQuery.value = null;
}

onMounted(async () => {
  appMounted = true;
  applyTheme();
  setupMobileBreakpoint();
  state.images = await hydrateStoredImages(state.images);
  await persistImagePayloads(state.images);
  if (!appMounted) return;
  checkAppVersion();
  window.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("paste", handlePaste);
  todoNotificationTimer.value = window.setInterval(refreshTodoNotifications, TODO_NOTIFICATION_FALLBACK_INTERVAL_MS);
  refreshTodoNotifications();
});

onUnmounted(() => {
  appMounted = false;
  window.removeEventListener("keydown", handleGlobalKeydown);
  document.removeEventListener("paste", handlePaste);
  teardownMobileBreakpoint();
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
  const title = value.trim();
  if (title) state.customTitles[id] = title;
  else delete state.customTitles[id];
  persistNow();
}

function updateLanguage(language: AppLanguage): void {
  const next = normalizeLanguage(language);
  if (state.language === next) return;
  state.language = next;
  persistNow();
}

function updateLines(key: "noteLines" | "workspaceLines" | "storageLines", lines: LineItem[]): void {
  state[key] = lines;
  markDirty();
  scheduleTextSave();
}

function updateSpaceLines(id: string, lines: LineItem[]): void {
  const space = state.spaces.find((item) => item.id === id);
  if (!space) return;
  space.lines = lines;
  syncLegacySpaceLines();
  markDirty();
  scheduleTextSave();
}

function activateSpace(id: string): void {
  if (!state.spaces.some((space) => space.id === id)) return;
  state.activeSpaceId = id;
  persistNow();
}

function createSpace(): void {
  const id = createId();
  state.spaces.push({
    id,
    title: nextSpaceTitle(),
    lines: [],
  });
  state.activeSpaceId = id;
  pendingEditSpaceId.value = id;
  syncLegacySpaceLines();
  persistNow();
}

function renameSpace(id: string, title: string): void {
  const space = state.spaces.find((item) => item.id === id);
  if (!space) return;
  space.title = getStoredSpaceTitle(id, title) || space.title;
  if (pendingEditSpaceId.value === id) pendingEditSpaceId.value = null;
  persistNow();
}

function finishSpaceEdit(id: string): void {
  if (pendingEditSpaceId.value === id) pendingEditSpaceId.value = null;
}

function deleteSpace(id: string): void {
  if (state.spaces.length <= 1) {
    showBubbleText(uiText.value.app.keepOneSpace);
    return;
  }
  const anchor = getSpacePanelAnchor();
  requestConfirmation("confirmDeleteSpace", anchor, () => {
    const index = state.spaces.findIndex((space) => space.id === id);
    if (index < 0 || state.spaces.length <= 1) return;
    state.spaces.splice(index, 1);
    if (state.activeSpaceId === id) {
      state.activeSpaceId = state.spaces[Math.max(0, index - 1)]?.id ?? state.spaces[0].id;
    }
    syncLegacySpaceLines();
    persistNow();
    showBubble("deleteSpace", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.app.deleteSpace, cancelText: uiText.value.common.cancel });
}

function reorderSpaces(dragId: string, targetId: string): void {
  moveItem(state.spaces, dragId, targetId);
  syncLegacySpaceLines();
  persistNow();
}

function nextSpaceTitle(): string {
  const base = uiText.value.app.newSpace;
  const titles = new Set(state.spaces.map((space) => space.title));
  if (!titles.has(base)) return base;
  let index = 2;
  while (titles.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function syncLegacySpaceLines(): void {
  state.workspaceLines = state.spaces[0]?.lines.map((line) => ({ ...line })) ?? [];
  state.storageLines = state.spaces[1]?.lines.map((line) => ({ ...line })) ?? [];
}

function scheduleTextSave(): void {
  window.clearTimeout(textSaveTimer.value);
  textSaveTimer.value = window.setTimeout(() => {
    textSaveTimer.value = undefined;
    persistNow();
    showSaveBubble();
  }, 3000);
}

function flushTextSave(): void {
  window.clearTimeout(textSaveTimer.value);
  textSaveTimer.value = undefined;
  persistNow();
}

function showCompanion(anchor?: HTMLElement, guideKey?: GuideKey): void {
  hideBubbleMessage({ clearRetainedContent: true });
  companionFocused.value = true;
  companionPosition.value = getCompanionPosition(anchor);
  activeGuideKey.value = guideKey ?? null;
}

function handleGuideFocus(key: GuideKey, anchor?: HTMLElement): void {
  showAreaGuide(key, anchor);
}

function handleGuideClick(key: GuideKey, anchor?: HTMLElement, immediate = false): void {
  invalidateGuideCompanion(key);
  if (immediate) {
    showGuideBubble(key, anchor);
    return;
  }
  showAreaGuide(key, anchor);
}

function showAreaGuide(key: GuideKey, anchor?: HTMLElement): void {
  if (isGuideAreaEmpty(key, anchor)) {
    showGuideBubble(key, anchor, false);
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
  markSaving();
  saveState(state);
  markSavedSoon();
}

function markDirty(): void {
  window.clearTimeout(saveStatusTimer.value);
  saveStatus.value = "dirty";
}

function markSaving(): void {
  window.clearTimeout(saveStatusTimer.value);
  saveStatus.value = "saving";
}

function markSavedSoon(): void {
  window.clearTimeout(saveStatusTimer.value);
  saveStatusTimer.value = window.setTimeout(() => {
    saveStatus.value = "saved";
  }, 100);
}

async function handlePaste(event: ClipboardEvent): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;
  await addImageFile(file);
}

async function pasteImageFromClipboard(anchor?: HTMLElement): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const clipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  };
  if (!clipboard?.read) {
    if (pasteImageWithBrowserCommand(anchor)) return;
    showBubble("clipboardPasteUnsupported", undefined, { hideCompanionAfter: true });
    return;
  }
  let items: ClipboardItem[];
  try {
    items = await clipboard.read();
  } catch {
    if (shouldBlockBoardEffects()) return;
    if (pasteImageWithBrowserCommand(anchor)) return;
    showBubble("clipboardPermissionDenied", undefined, { hideCompanionAfter: true });
    return;
  }
  if (shouldBlockBoardEffects()) return;
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith("image/"));
    if (!type) continue;
    let blob: Blob;
    try {
      blob = await item.getType(type);
    } catch {
      if (shouldBlockBoardEffects()) return;
      showBubble("imageReadFailed", undefined, { hideCompanionAfter: true });
      return;
    }
    if (shouldBlockBoardEffects()) return;
    await addImageFile(new File([blob], "clipboard-image", { type }));
    return;
  }
  if (shouldBlockBoardEffects()) return;
  showBubble("clipboardImageMissing", undefined, { hideCompanionAfter: true });
}

function pasteImageWithBrowserCommand(anchor?: HTMLElement): boolean {
  anchor?.focus({ preventScroll: true });
  return Boolean(document.execCommand?.("paste"));
}

async function addImageFile(file: File, options: { showMessage?: boolean } = {}): Promise<StoredImage | undefined> {
  if (shouldBlockBoardEffects()) return undefined;
  let src: string;
  try {
    src = await fileToDataUrl(file);
  } catch {
    if (shouldBlockBoardEffects()) return undefined;
    showBubble("imageReadFailed", undefined, { hideCompanionAfter: true });
    return undefined;
  }
  if (shouldBlockBoardEffects()) return undefined;
  const image = {
    id: createId(),
    src,
    createdAt: Date.now(),
  };
  try {
    await storeImagePayload(image);
  } catch {
    if (shouldBlockBoardEffects()) return undefined;
    showBubble("imageStoreFailed", undefined, { hideCompanionAfter: true });
    return undefined;
  }
  if (shouldBlockBoardEffects()) {
    try {
      await deleteStoredImage(image.id);
    } catch {
      // Best-effort cleanup for payloads that were stored just before mobile handoff.
    }
    return undefined;
  }
  state.images.push(image);
  persistNow();
  if (options.showMessage ?? true) showBubble("imageAdded", undefined, { hideCompanionAfter: true });
  return image;
}

async function addImageFiles(files: File[], anchor?: HTMLElement): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const ignoredCount = files.length - imageFiles.length;
  if (imageFiles.length === 0) {
    showBubble("imageDropEmpty", anchor, { hideCompanionAfter: true });
    return;
  }

  const added: StoredImage[] = [];
  for (const file of imageFiles) {
    const image = await addImageFile(file, { showMessage: false });
    if (shouldBlockBoardEffects()) return;
    if (image) added.push(image);
  }
  if (added.length === 0) return;
  if (shouldBlockBoardEffects()) return;
  await copyImage(added.at(-1)!.id, anchor);
  if (shouldBlockBoardEffects()) return;
  if (ignoredCount > 0) showBubble("imageDropIgnored", anchor, { hideCompanionAfter: true });
}

function handleBoardDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  const anchor = document.querySelector<HTMLElement>(".image-panel") ?? (event.currentTarget as HTMLElement);
  void addImageFiles(files, anchor);
}

function reorderImages(dragId: string, targetId: string): void {
  moveItem(state.images, dragId, targetId);
  persistNow();
}

function deleteImage(id: string, anchor?: HTMLElement): void {
  const feedbackAnchor = getImageUndoAnchor(anchor);
  requestConfirmation("confirmDeleteImage", anchor, async () => {
    const index = state.images.findIndex((image) => image.id === id);
    if (index < 0) return;
    state.images = state.images.filter((image) => image.id !== id);
    if (activePreviewId.value === id) activePreviewId.value = undefined;
    await deleteStoredImage(id);
    persistNow();
    showBubble("deleteImage", feedbackAnchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
}

function openImagePreview(id: string): void {
  hideCompanion();
  activePreviewId.value = id;
}

async function copyImage(id: string, anchor?: HTMLElement): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const image = state.images.find((item) => item.id === id);
  if (!image?.src) return;
  const clipboard = navigator.clipboard as Clipboard & {
    write?: (items: ClipboardItem[]) => Promise<void>;
  };
  if (!clipboard?.write || !("ClipboardItem" in window)) {
    showBubble("imageCopyFailed", anchor, { hideCompanionAfter: true });
    return;
  }
  try {
    const dataUrlBlob = getImageDataUrlBlob(image.src);
    if (dataUrlBlob) {
      const payload = dataUrlBlob.type === "image/png" ? dataUrlBlob : imageSourceToPngBlob(image.src);
      await clipboard.write([new window.ClipboardItem({ "image/png": payload })]);
      if (shouldBlockBoardEffects()) return;
      showBubble("imageCopied", anchor, { hideCompanionAfter: true });
      return;
    }
    const response = await fetch(image.src);
    if (shouldBlockBoardEffects()) return;
    const blob = await response.blob();
    if (shouldBlockBoardEffects()) return;
    const type = blob.type || getImageSourceType(image.src);
    const typedBlob = type && !blob.type ? blob.slice(0, blob.size, type) : blob;
    const payload = type === "image/png" ? typedBlob : imageSourceToPngBlob(image.src);
    await clipboard.write([new window.ClipboardItem({ "image/png": payload })]);
    if (shouldBlockBoardEffects()) return;
    showBubble("imageCopied", anchor, { hideCompanionAfter: true });
  } catch {
    if (shouldBlockBoardEffects()) return;
    showBubble("imageCopyFailed", anchor, { hideCompanionAfter: true });
  }
}

function getImageSourceType(src: string): string | undefined {
  return src.match(/^data:(image\/[^;,]+)/)?.[1];
}

function getImageDataUrlBlob(src: string): Blob | undefined {
  const match = src.match(/^data:(image\/[^;,]+)(;base64)?,(.*)$/);
  if (!match) return undefined;
  const [, type, base64Flag, payload] = match;
  const binary = base64Flag ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

function imageSourceToPngBlob(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is unavailable"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("PNG conversion failed"));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Image decoding failed"));
    image.src = src;
  });
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
      title: payload.title || (payload.type === "link" ? uiText.value.quick.untitledLink : uiText.value.quick.untitledText),
      value: payload.value,
      type: payload.type,
      hidden: false,
    });
  }
  persistNow();
}

function deleteQuick(id: string, anchor?: HTMLElement): void {
  requestConfirmation("confirmDeleteQuick", anchor, () => {
    const index = state.quickButtons.findIndex((button) => button.id === id);
    if (index < 0) return;
    state.quickButtons = state.quickButtons.filter((button) => button.id !== id);
    persistNow();
    showBubble("deleteQuick", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
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
    const opened = window.open(normalizeLink(button.value), "_blank", "noopener,noreferrer");
    if (!opened) showBubble("linkOpenFailed", anchor, { hideCompanionAfter: true });
    return;
  }
  const copied = await copyText(button.value, shouldBlockBoardEffects);
  if (shouldBlockBoardEffects()) return;
  showBubble(copied ? "quickTextCopied" : "quickTextCopyFailed", anchor, {
    hideCompanionAfter: true,
  });
}

async function copyText(text: string, shouldAbort: () => boolean = () => false): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (shouldAbort()) return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function createTodoList(anchor?: HTMLElement, title?: string): void {
  const id = createId();
  const trimmedTitle = title?.trim() ?? "";
  state.todoLists.push({ id, title: trimmedTitle || uiText.value.app.unnamedList, collapsed: false, compact: false });
  state.todos[id] = [];
  state.showCompletedTodos[id] = true;
  pendingEditTodoListId.value = trimmedTitle ? null : id;
  persistNow();
  showBubbleText(uiText.value.app.todoListAdded, anchor);
}

function updateTodoListTitle(listId: TodoListId, title: string): void {
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.title = getStoredTodoListTitle(listId, title) || uiText.value.app.unnamedList;
  if (pendingEditTodoListId.value === listId) pendingEditTodoListId.value = null;
  persistNow();
}

function toggleTodoListCollapsed(listId: TodoListId, collapsed: boolean): void {
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.collapsed = collapsed;
  persistNow();
}

function toggleTodoListCompact(listId: TodoListId, compact: boolean): void {
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.compact = compact;
  persistNow();
}

function deleteTodoList(listId: TodoListId, anchor?: HTMLElement): void {
  if (state.todoLists.length <= 1) {
    showBubbleText(uiText.value.app.keepOneTodoList, anchor);
    return;
  }
  const list = state.todoLists.find((item) => item.id === listId);
  if (!list) return;
  const remove = () => removeTodoList(listId, anchor);
  requestConfirmation(
    "confirmDeleteTodoList",
    anchor,
    remove,
    undefined,
    { confirmText: uiText.value.todo.deleteList, cancelText: uiText.value.common.cancel, danger: true },
  );
}

function removeTodoList(listId: TodoListId, anchor?: HTMLElement): void {
  const index = state.todoLists.findIndex((list) => list.id === listId);
  if (index < 0 || state.todoLists.length <= 1) return;
  state.todoLists.splice(index, 1);
  const next = removeTodoListData(state.todos, state.showCompletedTodos, listId);
  state.todos = next.todos;
  state.showCompletedTodos = next.showCompletedTodos;
  clearEmptyTodoRemovalTimersForList(listId);
  if (pendingEditTodoListId.value === listId) pendingEditTodoListId.value = null;
  persistNow();
  showBubbleText(uiText.value.app.todoListDeleted, anchor, { hideCompanionAfter: true });
}

function reorderTodoListSections(draggedId: TodoListId, targetId: TodoListId): void {
  const sourceIndex = state.todoLists.findIndex((list) => list.id === draggedId);
  const targetIndex = state.todoLists.findIndex((list) => list.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  state.todoLists = reorderTodoLists(state.todoLists, draggedId, targetId);
  persistNow();
}

function createTodo(period: TodoPeriod, afterId?: string): void {
  if (!isConfiguredTodoListId(period)) return;
  if (!afterId) {
    const blankTodo = findOpenBlankTodo();
    if (blankTodo) {
      cancelEmptyTodoRemoval(blankTodo.period, blankTodo.id);
      if (blankTodo.period === period) {
        nextTick(() => focusTodoInput(blankTodo.period, blankTodo.id));
        return;
      }
      state.todos = removeTodoFromMap(state.todos, blankTodo.period, blankTodo.id);
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

function createTodosFromText(period: TodoPeriod, texts: string[]): void {
  if (!isConfiguredTodoListId(period)) return;
  texts.forEach((text) => {
    state.todos = addTodoToMap(state.todos, period, {
      id: createId(),
      text,
      done: false,
    });
  });
  persistNow();
}

function findOpenBlankTodo(): { period: TodoPeriod; id: string } | undefined {
  for (const period of getTodoListIds()) {
    const blankTodo = getTodos(period).find((todo) => !todo.done && todo.text.trim().length === 0);
    if (blankTodo) return { period, id: blankTodo.id };
  }
  return undefined;
}

function focusTodoInput(period: TodoPeriod, id: string): void {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".todo-input"))
    .filter((item) => item.dataset.testid === `todo-input-${period}`);
  const input = inputs.find((item) => item.dataset.todoId === id) ?? inputs.at(-1);
  if (!input) return;
  const caret = input.value.length;
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
}

function updateTodo(period: TodoPeriod, id: string, text: string): void {
  if (!isConfiguredTodoListId(period)) return;
  cancelEmptyTodoRemoval(period, id);
  state.todos = updateTodoText(state.todos, period, id, text);
  persistNow();
}

function splitTodo(period: TodoPeriod, id: string, before: string, after: string): void {
  if (!isConfiguredTodoListId(period)) return;
  cancelEmptyTodoRemoval(period, id);
  const nextId = createId();
  state.todos = splitTodoInMap(
    state.todos,
    period,
    id,
    {
      id: nextId,
      text: after,
      done: false,
    },
    before,
  );
  persistNow();
  nextTick(() => focusTodoInput(period, nextId));
}

function complete(period: TodoPeriod, id: string, done: boolean, anchor?: HTMLElement): void {
  if (!isConfiguredTodoListId(period)) return;
  state.todos = completeTodo(state.todos, period, id, done);
  persistNow();
  if (done) showBubble("todoCompleted", anchor);
}

function toggleTodoStar(change: TodoStarChange): void {
  const { period, id, starred } = change;
  if (!isConfiguredTodoListId(period)) return;
  const todo = getTodos(period).find((item) => item.id === id);
  if (!todo) return;
  if (!starred && !todo.starred) return;
  state.todos = starTodo(state.todos, period, id, starred);
  persistNow();
}

function updateTodoNotify(period: TodoPeriod, id: string, notifyAt: number | undefined, anchor?: HTMLElement): void {
  if (!isConfiguredTodoListId(period)) return;
  state.todos = setTodoNotifyAt(state.todos, period, id, notifyAt);
  persistNow();
  scheduleNextTodoNotification();
  if (notifyAt === undefined) showBubbleText(uiText.value.app.notifyCleared, anchor);
  else void prepareTodoNotifications();
}

function removeTodo(period: TodoPeriod, id: string, anchor?: HTMLElement): void {
  if (!isConfiguredTodoListId(period)) return;
  requestConfirmation("confirmDeleteTodo", anchor, () => {
    if (!isConfiguredTodoListId(period)) return;
    const index = getTodos(period).findIndex((todo) => todo.id === id);
    if (index < 0) return;
    state.todos = removeTodoFromMap(state.todos, period, id);
    persistNow();
    showBubble("deleteTodo", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
}

function clearDone(period: TodoPeriod, anchor?: HTMLElement): void {
  if (!isConfiguredTodoListId(period)) return;
  if (!getTodos(period).some((todo) => todo.done)) {
    showBubble("noCompletedTodos", anchor);
    return;
  }
  requestConfirmation(
    "confirmClearCompleted",
    anchor,
    () => {
      if (!isConfiguredTodoListId(period)) return;
      state.todos = clearCompleted(state.todos, period);
      persistNow();
      showBubble("clearCompleted", anchor, { hideCompanionAfter: true });
    },
    undefined,
    { confirmText: uiText.value.todo.clearCompletedConfirm, cancelText: uiText.value.common.cancel },
  );
}

function toggleCompletedVisibility(period: TodoPeriod, showCompleted: boolean): void {
  if (!isConfiguredTodoListId(period)) return;
  state.showCompletedTodos[period] = showCompleted;
  persistNow();
}

function blurEmptyTodo(period: TodoPeriod, id: string): void {
  if (!isConfiguredTodoListId(period)) return;
  cancelEmptyTodoRemoval(period, id);
  const todo = getTodos(period).find((item) => item.id === id);
  if (!todo || todo.text.trim()) return;
  const key = todoKey(period, id);
  emptyTodoRemovalTimers.set(
    key,
    window.setTimeout(() => {
      if (!isConfiguredTodoListId(period)) {
        emptyTodoRemovalTimers.delete(key);
        return;
      }
      state.todos = removeEmptyTodo(state.todos, period, id);
      emptyTodoRemovalTimers.delete(key);
      persistNow();
    }, 260),
  );
}

function moveTodo(dragged: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string): void {
  if (!isConfiguredTodoListId(dragged.period) || !isConfiguredTodoListId(destinationPeriod)) return;
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

function updateCompanionGifTheme(theme: CompanionGifTheme, anchor?: HTMLElement): void {
  state.companionGifTheme = theme;
  persistNow();
  showBubbleText(theme === "none" ? uiText.value.app.gifDisabled : uiText.value.app.gifThemeChanged, anchor);
}

async function updateCustomCompanionGif(files: { light?: File; dark?: File }, anchor?: HTMLElement): Promise<void> {
  const light = await readGifFile(files.light);
  const dark = await readGifFile(files.dark);
  const fallback = light ?? dark;
  if (!fallback) {
    showBubbleText(uiText.value.app.chooseGif, anchor);
    return;
  }
  state.customCompanionGif = {
    light: light ?? fallback,
    dark: dark ?? fallback,
  };
  state.companionGifTheme = "custom";
  persistNow();
  showBubbleText(uiText.value.app.customGifSet, anchor);
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
  if (importInput.value) {
    importInput.value.value = "";
  }
  importInput.value?.click();
}

async function importData(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  if (shouldBlockBoardEffects()) {
    importFeedbackAnchor.value = undefined;
    input.value = "";
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    showBubble("importJsonInvalid", importFeedbackAnchor.value, { hideCompanionAfter: true });
    importFeedbackAnchor.value = undefined;
    input.value = "";
    return;
  }
  if (!isImportPayload(parsed)) {
    showBubble("importDataInvalid", importFeedbackAnchor.value, { hideCompanionAfter: true });
    importFeedbackAnchor.value = undefined;
    input.value = "";
    return;
  }
  let next: BoardState;
  try {
    next = normalizeImportedState(parsed);
  } catch {
    showBubble("importDataInvalid", importFeedbackAnchor.value, { hideCompanionAfter: true });
    importFeedbackAnchor.value = undefined;
    input.value = "";
    return;
  }
  requestConfirmation(
    "confirmImportData",
    importFeedbackAnchor.value,
    async () => {
      Object.assign(state, next);
      await persistImagePayloads(state.images);
      persistNow();
      refreshTodoNotifications();
      showBubble("dataImported", importFeedbackAnchor.value, { hideCompanionAfter: true });
      importFeedbackAnchor.value = undefined;
      input.value = "";
    },
    () => {
      importFeedbackAnchor.value = undefined;
      input.value = "";
    },
    { confirmText: uiText.value.app.importOverwrite, cancelText: uiText.value.common.cancel, danger: true },
  );
}

function about(anchor?: HTMLElement): void {
  showBubbleText(
    [uiText.value.app.aboutTitle, uiText.value.app.aboutDescription].join("\n"),
    anchor,
    { hideCompanionAfter: true, linkText: GITHUB_REPO_LABEL, linkHref: GITHUB_REPO_URL },
    ABOUT_MESSAGE_DURATION_MS,
  );
}

function suggestIssue(): void {
  window.open(GITHUB_ISSUE_URL, "_blank", "noopener,noreferrer");
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (isMobileBlocked.value) return;
  if (event.key === "Escape" && companionVisible.value) {
    hideCompanion();
    (document.activeElement as HTMLElement | null)?.blur();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    flushTextSave();
    showSaveBubble();
  }
  const previewId = activePreviewId.value;
  if (previewId) {
    if (event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      activePreviewId.value = undefined;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void copyImage(previewId, document.querySelector<HTMLElement>(".image-preview") ?? undefined);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteImage(previewId, document.querySelector<HTMLElement>(".image-preview") ?? undefined);
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

function showSaveStatusTip(anchor?: HTMLElement): void {
  showBubble("saveStatusLegend", anchor);
}

function showBubble(messageKey: MessageKey, anchor?: HTMLElement, options: BubbleOptions = {}): void {
  showBubbleText(getMessage(messageKey, Math.random, state.language), anchor, options);
}

function showBubbleText(message: string, anchor?: HTMLElement, options: BubbleOptions = {}, duration = 3000): void {
  if (shouldBlockBoardEffects()) return;
  window.clearTimeout(bubbleTimer.value);
  window.clearTimeout(bubbleFadeTimer.value);
  clearPendingConfirm();
  bubbleMessage.value = message;
  bubbleLink.value = options.linkText && options.linkHref ? { text: options.linkText, href: options.linkHref } : null;
  activeGuideKey.value = options.guideKey ?? null;
  companionFocused.value = true;
  if (anchor) {
    companionPosition.value = getCompanionPosition(anchor);
  }
  bubbleVisible.value = true;
  bubbleTimerOptions.value = options;
  startBubbleTimer(duration);
}

function hideBubbleMessage(options: { clearRetainedContent?: boolean } = {}): void {
  window.clearTimeout(bubbleTimer.value);
  window.clearTimeout(bubbleFadeTimer.value);
  bubbleTimer.value = undefined;
  bubbleRemainingMs.value = 0;
  bubbleTimerStartedAt.value = 0;
  bubbleTimerOptions.value = {};
  clearPendingConfirm();
  bubbleVisible.value = false;
  bubbleMessage.value = "";
  bubbleLink.value = null;
  if (options.clearRetainedContent) bubbleClearSignal.value += 1;
}

function hideCompanion(): void {
  hideBubbleMessage();
  companionFocused.value = false;
  activeGuideKey.value = null;
}

function startBubbleTimer(duration: number): void {
  bubbleRemainingMs.value = duration;
  bubbleTimerStartedAt.value = Date.now();
  bubbleTimer.value = window.setTimeout(finishBubbleTimer, duration);
}

function finishBubbleTimer(): void {
  const options = bubbleTimerOptions.value;
  bubbleTimer.value = undefined;
  bubbleRemainingMs.value = 0;
  bubbleTimerStartedAt.value = 0;
  bubbleVisible.value = false;
  bubbleMessage.value = "";
  bubbleLink.value = null;
  if (options.guideKey) activeGuideKey.value = null;
  if (options.hideCompanionAfter) {
    bubbleFadeTimer.value = window.setTimeout(() => {
      companionFocused.value = false;
    }, 260);
  }
}

function pauseBubbleTimer(): void {
  if (!bubbleVisible.value || pendingConfirm.value || !bubbleTimer.value) return;
  window.clearTimeout(bubbleTimer.value);
  bubbleTimer.value = undefined;
  const elapsed = Date.now() - bubbleTimerStartedAt.value;
  bubbleRemainingMs.value = Math.max(0, bubbleRemainingMs.value - elapsed);
  bubbleTimerStartedAt.value = 0;
}

function resumeBubbleTimer(): void {
  if (!bubbleVisible.value || pendingConfirm.value || bubbleTimer.value) return;
  if (!bubbleMessage.value && !bubbleLink.value) return;
  if (bubbleRemainingMs.value <= 0) {
    finishBubbleTimer();
    return;
  }
  bubbleTimerStartedAt.value = Date.now();
  bubbleTimer.value = window.setTimeout(finishBubbleTimer, bubbleRemainingMs.value);
}

function requestConfirmation(
  messageKey: MessageKey,
  anchor: HTMLElement | undefined,
  onConfirm: () => void | Promise<void>,
  onCancel?: () => void,
  options: { confirmText?: string; cancelText?: string; danger?: boolean } = {},
): void {
  if (shouldBlockBoardEffects()) return;
  window.clearTimeout(bubbleTimer.value);
  window.clearTimeout(bubbleFadeTimer.value);
  bubbleTimer.value = undefined;
  bubbleRemainingMs.value = 0;
  bubbleTimerStartedAt.value = 0;
  bubbleTimerOptions.value = {};
  bubbleMessage.value = getMessage(messageKey, Math.random, state.language);
  bubbleLink.value = null;
  pendingConfirm.value = {
    onConfirm,
    onCancel,
    confirmText: options.confirmText ?? uiText.value.common.yes,
    cancelText: options.cancelText ?? uiText.value.common.no,
    danger: options.danger ?? /删除|清理|Delete|Clear/.test(options.confirmText ?? ""),
  };
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
  clearPendingConfirm(true);
  hideCompanion();
}

function clearPendingConfirm(runCancel = false): void {
  const action = pendingConfirm.value;
  pendingConfirm.value = null;
  if (runCancel) action?.onCancel?.();
}

function showToast(messageKey: MessageKey): void {
  showBubble(messageKey, undefined, { hideCompanionAfter: true });
}

function isImportPayload(payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = new Set(Object.keys(payload));
  return [
    "theme",
    "companionGifTheme",
    "customCompanionGif",
    "customTitles",
    "noteLines",
    "workspaceLines",
    "storageLines",
    "spaces",
    "activeSpaceId",
    "images",
    "quickButtons",
    "showHiddenQuickButtons",
    "todoLists",
    "showCompletedTodos",
    "todos",
    "note",
    "workspace",
    "storage",
  ].some((key) => keys.has(key));
}

function clearTimers(): void {
  window.clearTimeout(textSaveTimer.value);
  window.clearTimeout(bubbleTimer.value);
  window.clearTimeout(bubbleFadeTimer.value);
  window.clearTimeout(saveStatusTimer.value);
  window.clearTimeout(versionBadgeTimer.value);
  window.clearTimeout(todoNotificationDueTimer.value);
  versionBadgeTimer.value = undefined;
  window.clearInterval(todoNotificationTimer.value);
  todoNotificationDueTimer.value = undefined;
  todoNotificationTimer.value = undefined;
  emptyTodoRemovalTimers.forEach((timer) => window.clearTimeout(timer));
  emptyTodoRemovalTimers.clear();
}

function getNotificationApi(): typeof Notification | undefined {
  return typeof Notification === "undefined" ? undefined : Notification;
}

async function prepareTodoNotifications(): Promise<void> {
  const notificationApi = getNotificationApi();
  if (!notificationApi) return;
  if (notificationApi.permission === "default" && typeof notificationApi.requestPermission === "function") {
    try {
      await notificationApi.requestPermission();
    } catch (error) {
      console.warn("Failed to request reminder notification permission", error);
    }
  }
  refreshTodoNotifications();
}

function refreshTodoNotifications(): void {
  triggerDueTodoNotifications();
  scheduleNextTodoNotification();
}

function triggerDueTodoNotifications(): void {
  const notificationApi = getNotificationApi();
  pruneSentTodoNotifications();
  if (!notificationApi || notificationApi.permission !== "granted") return;
  const now = Date.now();
  const notificationIcon = getReminderNotificationIcon();
  for (const period of getTodoListIds()) {
    for (const todo of getTodos(period)) {
      if (todo.done || !Number.isFinite(todo.notifyAt) || todo.notifyAt === undefined || todo.notifyAt > now) continue;
      const key = getTodoNotificationKey(period, todo);
      if (sentTodoNotifications.has(key)) continue;
      const options: NotificationOptions = {
        body: todo.text,
        tag: getTodoNotificationTag(todo),
      };
      if (notificationIcon) options.icon = notificationIcon;
      try {
        new notificationApi(getTodoListTitle(period), options);
        sentTodoNotifications.add(key);
      } catch (error) {
        console.warn("Failed to show reminder notification", error);
      }
    }
  }
}

function scheduleNextTodoNotification(): void {
  if (!appMounted) return;
  window.clearTimeout(todoNotificationDueTimer.value);
  todoNotificationDueTimer.value = undefined;
  const now = Date.now();
  let nextNotifyAt: number | undefined;
  for (const period of getTodoListIds()) {
    for (const todo of getTodos(period)) {
      if (todo.done || !Number.isFinite(todo.notifyAt) || todo.notifyAt === undefined || todo.notifyAt <= now) continue;
      if (sentTodoNotifications.has(getTodoNotificationKey(period, todo))) continue;
      if (nextNotifyAt === undefined || todo.notifyAt < nextNotifyAt) nextNotifyAt = todo.notifyAt;
    }
  }
  if (nextNotifyAt === undefined) return;
  const delay = Math.min(nextNotifyAt - now, MAX_TODO_NOTIFICATION_TIMEOUT_MS);
  todoNotificationDueTimer.value = window.setTimeout(refreshTodoNotifications, delay);
}

function pruneSentTodoNotifications(): void {
  const activeKeys = new Set<string>();
  for (const period of getTodoListIds()) {
    for (const todo of getTodos(period)) {
      if (Number.isFinite(todo.notifyAt) && todo.notifyAt !== undefined && !todo.done) {
        activeKeys.add(getTodoNotificationKey(period, todo));
      }
    }
  }
  for (const key of sentTodoNotifications) {
    if (!activeKeys.has(key)) sentTodoNotifications.delete(key);
  }
}

function getTodoNotificationKey(period: TodoPeriod, todo: TodoItem): string {
  return `${period}:${todo.id}:${todo.notifyAt}`;
}

function getTodoNotificationTag(todo: TodoItem): string {
  return `${todo.id}:${todo.notifyAt}`;
}

function getReminderNotificationIcon(): string {
  const src = getCompanionNotificationIconSrc(state.companionGifTheme, state.theme, state.customCompanionGif);
  if (!src) return "";
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
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

function clearEmptyTodoRemovalTimersForList(listId: TodoListId): void {
  for (const [key, timer] of emptyTodoRemovalTimers) {
    if (!key.startsWith(`${listId}:`)) continue;
    window.clearTimeout(timer);
    emptyTodoRemovalTimers.delete(key);
  }
}

function showGuideBubble(key: GuideKey, anchor?: HTMLElement, hideCompanionAfter = true): void {
  if (pendingConfirm.value) return;
  if (isRepeatLockedGuide(key)) {
    if (anchor) companionPosition.value = getCompanionPosition(anchor);
    return;
  }
  showBubbleText(
    withKaomoji(randomGuideMessage(key), "encouraging"),
    anchor,
    { hideCompanionAfter, guideKey: key },
    GUIDE_MESSAGE_DURATION_MS,
  );
}

function isRepeatLockedGuide(key: GuideKey): boolean {
  return ["images", "quickButtons", "todos"].includes(key) && activeGuideKey.value === key && bubbleVisible.value && Boolean(bubbleMessage.value);
}

function isGuideAreaEmpty(key: GuideKey, anchor?: HTMLElement): boolean {
  if (key === "images") return state.images.length === 0;
  if (key === "note") return !hasLineContent(state.noteLines);
  if (key === "quickButtons") {
    return state.quickButtons.filter((button) => state.showHiddenQuickButtons || !button.hidden).length === 0;
  }
  if (key === "workspace") {
    const active = state.spaces.find((space) => space.id === state.activeSpaceId) ?? state.spaces[0];
    return !active || !hasLineContent(active.lines);
  }
  if (key === "storage") return !hasLineContent(state.storageLines);
  if (key === "todos") {
    const period = getTodoPeriodFromAnchor(anchor);
    if (!period) return getTodoListIds().every((item) => isTodoPeriodEmpty(item));
    return isTodoPeriodEmpty(period);
  }
  return false;
}

function hasLineContent(lines: LineItem[]): boolean {
  return lines.some((line) => line.text.trim().length > 0);
}

function isTodoPeriodEmpty(period: TodoPeriod): boolean {
  const visible = getTodos(period).filter((todo) => state.showCompletedTodos[period] || !todo.done);
  return visible.length === 0 || visible.every((todo) => todo.text.trim().length === 0);
}

function getTodos(period: TodoPeriod): TodoItem[] {
  return state.todos[period] ?? [];
}

function isConfiguredTodoListId(listId: TodoListId): listId is TodoListId {
  return state.todoLists.some((list) => list.id === listId);
}

function getTodoPeriodFromAnchor(anchor?: HTMLElement): TodoPeriod | undefined {
  const section = anchor?.closest(".todo-section[data-period]") as HTMLElement | null | undefined;
  const period = section?.dataset.period;
  return isTodoPeriod(period) ? period : undefined;
}

function isTodoPeriod(value: unknown): value is TodoPeriod {
  return typeof value === "string" && isConfiguredTodoListId(value);
}

function getTodoListIds(): TodoListId[] {
  return state.todoLists.map((list) => list.id);
}

function getTodoListTitle(listId: TodoListId): string {
  const list = state.todoLists.find((item) => item.id === listId);
  if (list?.title) return getDisplayTodoListTitle(list, state.language);
  return getDefaultTitles(state.language)[`todo-${listId}-title`] ?? uiText.value.app.reminderFallback;
}

function randomGuideMessage(key: GuideKey): string {
  const messages = getGuideMessages(state.language)[key];
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
    versionBadgeVisible.value = false;
    return;
  }
  versionPromptVisible.value = storedAppVersion.value !== appVersion.value;
  startVersionBadgeTimer();
}

async function updateStaticVersion(): Promise<void> {
  await clearStaticCaches();
  markAppVersionSeen(appVersion.value);
  versionPromptVisible.value = false;
  versionBadgeVisible.value = false;
  window.clearTimeout(versionBadgeTimer.value);
  versionBadgeTimer.value = undefined;
  window.location.reload();
}

function startVersionBadgeTimer(): void {
  window.clearTimeout(versionBadgeTimer.value);
  versionBadgeTimer.value = undefined;
  versionBadgeVisible.value = versionPromptVisible.value;
  if (!versionBadgeVisible.value) return;
  versionBadgeTimer.value = window.setTimeout(() => {
    versionBadgeVisible.value = false;
    versionBadgeTimer.value = undefined;
  }, VERSION_BADGE_MAX_VISIBLE_MS);
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
  const safeRight = Math.max(Math.round(rect.right), MIN_COMPANION_POPOVER_RIGHT_EDGE);
  return {
    right: `calc(100vw - ${safeRight}px + 10px)`,
    bottom: `calc(100vh - ${Math.round(rect.bottom)}px + 10px)`,
  };
}

function getImageUndoAnchor(anchor?: HTMLElement): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(".image-panel") ?? anchor;
}

function getSpacePanelAnchor(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(".space-panel") ?? undefined;
}

function isMobileLayout(): boolean {
  return window.matchMedia?.(MOBILE_BREAKPOINT_QUERY).matches ?? window.innerWidth <= 900;
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

async function readGifFile(file?: File): Promise<string | undefined> {
  if (!file) return undefined;
  const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
  if (!isGif) return undefined;
  return fileToDataUrl(file);
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
  <NConfigProvider :theme="naiveTheme" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <NGlobalStyle />
    <main
      v-if="!isMobileBlocked"
      class="board"
      :aria-label="uiText.app.boardLabel"
      @dragover.prevent
      @drop.prevent="handleBoardDrop"
    >
      <ImagePanel
        :title="titles['image-title']"
        :images="state.images"
        :language="state.language"
        @title-update="updateTitle"
        @preview="openImagePreview"
        @copy="copyImage"
        @delete="deleteImage"
        @reorder="reorderImages"
        @paste="pasteImageFromClipboard"
        @drop-files="addImageFiles"
        @guide="handleGuideClick"
      />

      <section class="panel note-link-panel" aria-labelledby="note-title">
        <TextPanel
          split
          class="note-panel"
          title-id="note-title"
          :title="titles['note-title']"
          :lines="state.noteLines"
          :language="state.language"
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
          :language="state.language"
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
        :todo-lists="displayTodoLists"
        :edit-list-id="pendingEditTodoListId"
        :todos="state.todos"
        :titles="titles"
        :show-completed="state.showCompletedTodos"
        :language="state.language"
        @title-update="updateTitle"
        @create-list="createTodoList"
        @update-list-title="updateTodoListTitle"
        @toggle-list-collapsed="toggleTodoListCollapsed"
        @toggle-list-compact="toggleTodoListCompact"
        @delete-list="deleteTodoList"
        @reorder-lists="reorderTodoListSections"
        @create="createTodo"
        @create-from-text="createTodosFromText"
        @update="updateTodo"
        @split="splitTodo"
        @complete="complete"
        @star="toggleTodoStar"
        @notify="updateTodoNotify"
        @remove="removeTodo"
        @clear-completed="clearDone"
        @toggle-completed-visibility="toggleCompletedVisibility"
        @blur-empty="blurEmptyTodo"
        @blur="handleCompanionBlur"
        @move="moveTodo"
        @focus="handleGuideFocus('todos', $event)"
        @guide="handleGuideClick"
      />

      <SpacePanel
        class="workspace-panel"
        :spaces="displaySpaces"
        :active-space-id="state.activeSpaceId"
        :edit-space-id="pendingEditSpaceId"
        :language="state.language"
        @activate="activateSpace"
        @create="createSpace"
        @rename="renameSpace"
        @edit-done="finishSpaceEdit"
        @update="updateSpaceLines"
        @delete="deleteSpace"
        @reorder="reorderSpaces"
        @focus="(_, element) => handleGuideFocus('workspace', element)"
        @guide="(_, anchor, immediate) => handleGuideClick('workspace', anchor, immediate)"
        @blur="handleEditorBlur"
      />
    </main>

    <main v-else class="mobile-handoff" :aria-label="uiText.app.mobileLabel">
      <header class="mobile-handoff-header">
        <h1 class="mobile-handoff-title">{{ uiText.app.mobileTitle }}</h1>
        <NButton quaternary size="small" class="mobile-handoff-theme" :aria-label="uiText.app.theme" @click="handleThemeClick">
          <NIcon :component="state.theme === 'dark' ? SunnyOutline : MoonOutline" />
        </NButton>
      </header>

      <section class="mobile-handoff-body" aria-labelledby="mobile-handoff-title">
        <div class="mobile-handoff-message">
          <h2 id="mobile-handoff-title">{{ uiText.app.mobileHeading }}</h2>
          <p>{{ uiText.app.mobileDescription }}</p>
          <p>{{ uiText.app.mobileMessage }}</p>
        </div>
      </section>
    </main>

    <ImagePreview
      v-if="!isMobileBlocked"
      :images="state.images"
      :active-id="activePreviewId"
      :language="state.language"
      @close="activePreviewId = undefined"
      @copy="copyImage"
      @delete="deleteImage"
      @activate="activePreviewId = $event"
    />

    <CompanionBubble
      :visible="activeCompanionVisible"
      :message="activeCompanionMessage"
      :link-text="isMobileBlocked ? undefined : bubbleLink?.text"
      :link-href="isMobileBlocked ? undefined : bubbleLink?.href"
      :confirm="!isMobileBlocked && Boolean(pendingConfirm)"
      :confirm-danger="!isMobileBlocked && Boolean(pendingConfirm?.danger)"
      :confirm-text="isMobileBlocked ? undefined : pendingConfirm?.confirmText"
      :cancel-text="isMobileBlocked ? undefined : pendingConfirm?.cancelText"
      :clear-signal="bubbleClearSignal"
      :persistent="isMobileBlocked"
      :position="activeCompanionPosition"
      :theme="state.theme"
      :language="state.language"
      :gif-theme="state.companionGifTheme"
      :custom-gif-light-src="state.customCompanionGif.light"
      :custom-gif-dark-src="state.customCompanionGif.dark"
      @yes="confirmCompanionAction"
      @no="cancelCompanionAction"
      @pause="pauseBubbleTimer"
      @resume="resumeBubbleTimer"
    />
    <div v-if="!isMobileBlocked" class="top-actions">
      <span
        class="save-status"
        data-testid="save-status"
        :data-state="saveStatus"
        :aria-label="saveStatusLabel"
        :title="saveStatusLabel"
        aria-live="polite"
        role="button"
        tabindex="0"
        @click="showSaveStatusTip($event.currentTarget as HTMLElement)"
        @keydown.enter.prevent="showSaveStatusTip($event.currentTarget as HTMLElement)"
        @keydown.space.prevent="showSaveStatusTip($event.currentTarget as HTMLElement)"
      >
        <span class="save-status-label">{{ saveStatusLabel }}</span>
      </span>
      <SettingsMenu
        :app-version="appVersion"
        :update-available="versionPromptVisible"
        :update-badge-visible="versionBadgeVisible"
        :companion-gif-theme="state.companionGifTheme"
        :language="state.language"
        @export="exportData"
        @import="requestImport"
        @about="about"
        @suggest="suggestIssue"
        @update="updateStaticVersion"
        @language="updateLanguage"
        @gif-theme="updateCompanionGifTheme"
        @custom-gif="updateCustomCompanionGif"
        @guide="handleGuideClick"
      />
      <NButton quaternary size="small" class="theme-btn icon-button" :aria-label="uiText.app.theme" @click="handleThemeClick">
        <NIcon :component="state.theme === 'dark' ? SunnyOutline : MoonOutline" />
      </NButton>
    </div>
    <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importData" />
  </NConfigProvider>
</template>

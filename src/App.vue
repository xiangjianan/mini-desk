<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { MoonOutline, SunnyOutline } from "@vicons/ionicons5";
import { darkTheme, dateEnUS, dateZhCN, enUS, NButton, NConfigProvider, NGlobalStyle, NIcon, zhCN } from "naive-ui";
import CompanionBubble from "./components/CompanionBubble.vue";
import ImagePanel from "./components/ImagePanel.vue";
import QuickButtons from "./components/QuickButtons.vue";
import SettingsMenu from "./components/SettingsMenu.vue";
import SpacePanel from "./components/SpacePanel.vue";
import TodoPanel from "./components/TodoPanel.vue";
import WorkbenchShell from "./components/WorkbenchShell.vue";
import { getCompanionGifSrc, getCompanionNotificationIconSrc } from "./state/companionGifThemes";
import {
  clearStoredImagePayloads,
  deleteStoredImage,
  getImagePayloadId,
  hydrateCustomCompanionGif,
  hydrateStoredImages,
  persistCustomCompanionGifPayloads,
  persistImagePayloads,
  pruneStoredImagePayloads,
  storeImagePayload,
} from "./state/images";
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
import { defaultState, STORAGE_KEY } from "./state/defaults";
import { QUICK_DENSITY_THRESHOLD } from "./state/quickButtons";
import {
  createId,
  exportJsonState,
  exportUndoSnapshotState,
  loadState,
  normalizeImportedState,
  saveStateWithConflictCheck,
} from "./state/storage";
import {
  APP_VERSION_CHECK_INTERVAL_MS,
  clearStaticCaches,
  fetchLatestAppVersion,
  getIndexAppVersion,
  getStoredAppVersion,
  markAppVersionSeen,
} from "./state/version";
import type { ImagePlacementHint, ImageReplacementHint, SaveScope } from "./state/storage";
import type { AppLanguage, BoardState, CompanionGifTheme, DraggedTodo, GuideKey, ImagePasteFeedback, ImagePasteRequest, LineItem, QuickApiBodyType, QuickApiHeader, QuickApiMethod, QuickButton, QuickButtonType, StoredImage, TodoItem, TodoListConfig, TodoListId, TodoPeriod, TodoStarChange, WorkspaceSpace } from "./types";

const ImagePreview = defineAsyncComponent(() => import("./components/ImagePreview.vue"));
const ShortcutHelp = defineAsyncComponent(() => import("./components/ShortcutHelp.vue"));

const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";
const TODO_NOTIFICATION_FALLBACK_INTERVAL_MS = 30_000;
const MAX_TODO_NOTIFICATION_TIMEOUT_MS = 2_147_483_647;
const UNDO_HISTORY_LIMIT = 50;
const IMAGE_PREVIEW_CLOSE_MS = 220;
const IMAGE_DENSITY_THRESHOLD = 10;
const TODO_DENSITY_THRESHOLD = 7;
const WORKSPACE_DENSITY_GROUP_TIP_CHANCE = 0.5;
const STATE_SYNC_CHANNEL = "mini-desk-state-sync";
const mobileCompanionPosition: { right: string; bottom: string } = { right: "18px", bottom: "28px" };

function getInitialMobileBlocked(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}

const state = reactive<BoardState>(loadState());
const syncClientId = createId();
const undoSnapshots = ref<string[]>([]);
const lastUndoSnapshot = ref(createUndoSnapshot());
const activePreviewId = ref<string | undefined>();
const pasteFeedback = ref<ImagePasteFeedback | undefined>();
const closingPreviewId = ref<string | undefined>();
const previewCloseTimer = ref<number | undefined>();
const activeEditorId = ref<string | undefined>();
const bubbleMessage = ref("");
const bubbleLink = ref<{ text: string; href: string } | null>(null);
const bubbleSignature = ref("");
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
const companionFadeRemaining = ref(2000);
const companionFadeStartedAt = ref(0);
const bubbleTimerOptions = ref<BubbleOptions>({});
const bubbleClearSignal = ref(0);
const saveStatusTimer = ref<number | undefined>();
const imagePayloadPruneTimer = ref<number | undefined>();
const todoNotificationTimer = ref<number | undefined>();
const todoNotificationDueTimer = ref<number | undefined>();
const titleFlashTimer = ref<number | undefined>();
const titleFlashActive = ref(false);
const titleFlashAltVisible = ref(false);
const notificationFlashKeys = ref<string[]>([]);
const pendingNotificationFlashKeys = ref<string[]>([]);
const emptyTodoRemovalTimers = new Map<string, number>();
const sentTodoNotifications = new Set<string>();
const notificationFlashTimers = new Map<string, number>();
const appVersion = ref(getIndexAppVersion());
const availableAppVersion = ref(appVersion.value);
const storedAppVersion = ref<string | null>(null);
const versionPromptVisible = ref(false);
const shortcutHelpVisible = ref(false);
const isMobileBlocked = ref(getInitialMobileBlocked());
const mobileMediaQuery = ref<MediaQueryList | null>(null);
let appMounted = false;
let pendingBrowserImagePasteRequest: { request: ImagePasteRequest; token: number } | undefined;
let browserImagePasteRequestToken = 0;
let pasteFeedbackToken = 0;
let restoringUndo = false;
let undoInFlight = false;
let textEditGeneration = 0;
let savedTextGeneration = 0;
let stateSyncChannel: BroadcastChannel | null = null;

type BubbleOptions = {
  hideCompanionAfter?: boolean;
  guideKey?: GuideKey;
  linkText?: string;
  linkHref?: string;
  signatureText?: string;
};

type PersistOptions = {
  force?: boolean;
  imagePlacement?: ImagePlacementHint;
  imageReplacement?: ImageReplacementHint;
};

type WorkspaceDensityState = "saved" | "saving" | "dirty";
type DensityAreaType = "todos" | "quickButtons" | "images";

type DensityArea = {
  type: DensityAreaType;
  label: string;
  count: number;
};

const GUIDE_MESSAGE_DURATION_MS = 5000;
const GITHUB_ISSUE_URL = "https://github.com/xiangjianan/mini-desk/issues/new";
const GITHUB_REPO_URL = "https://github.com/xiangjianan/mini-desk";
const GITHUB_REPO_LABEL = "xiangjianan / mini-desk";
const ABOUT_MESSAGE_DURATION_MS = 10000;
const COMPANION_FADE_MS = 2000;
const MIN_COMPANION_POPOVER_RIGHT_EDGE = 260;
const DEFAULT_DOCUMENT_TITLE = "Mini Desk";
const NOTIFICATION_DOCUMENT_TITLE = "🔔 新提醒 · Mini Desk";
const TITLE_FLASH_INTERVAL_MS = 750;
const TODO_NOTIFICATION_FLASH_MS = 2400;
const activeGuideKey = ref<GuideKey | null>(null);
const versionCheckTimer = ref<number | undefined>();

const naiveTheme = computed(() => (state.theme === "dark" ? darkTheme : null));
const naiveLocale = computed(() => (state.language === "en" ? enUS : zhCN));
const naiveDateLocale = computed(() => (state.language === "en" ? dateEnUS : dateZhCN));
const uiText = computed(() => getUiText(state.language));
const companionVisible = computed(() => companionFocused.value || bubbleVisible.value);
const activeCompanionVisible = computed(() => isMobileBlocked.value || companionVisible.value);
const activeCompanionMessage = computed(() => (isMobileBlocked.value ? uiText.value.app.mobileMessage : bubbleMessage.value));
const activeCompanionPosition = computed(() => (isMobileBlocked.value ? mobileCompanionPosition : companionPosition.value));
const displayedPreviewId = computed(() => activePreviewId.value ?? closingPreviewId.value);
const imagePreviewClosing = computed(() => Boolean(closingPreviewId.value) && !activePreviewId.value);
const settingsAppVersion = computed(() => (versionPromptVisible.value ? availableAppVersion.value : appVersion.value));
const saveStatus = ref<"saved" | "saving" | "dirty">("saved");
const densityGroupingTipKeys: Partial<Record<DensityAreaType, MessageKey>> = {
  todos: "workspaceDensityTodoGroup",
  quickButtons: "workspaceDensityQuickGroup",
};
const densityAreas = computed(() => getDensityAreas());
const overLimitDensityAreas = computed(() => densityAreas.value.filter((area) => area.count > getDensityThreshold(area.type)));
const workspaceDensityStatus = computed<WorkspaceDensityState>(() => {
  const overTypes = new Set(overLimitDensityAreas.value.map((area) => area.type));
  if (overTypes.size >= 3) return "dirty";
  if (overTypes.size > 0) return "saving";
  return "saved";
});
const workspaceDensityLabel = computed(() => {
  if (workspaceDensityStatus.value === "dirty") return uiText.value.app.densityCrowded;
  if (workspaceDensityStatus.value === "saving") return uiText.value.app.densityWarning;
  return uiText.value.app.densityGood;
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
    clearImagePreview();
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
  try {
    state.customCompanionGif = await hydrateCustomCompanionGif(state.customCompanionGif, state.customCompanionGifStored);
    state.customCompanionGifStored = {
      ...(state.customCompanionGif.light ? { light: true } : {}),
      ...(state.customCompanionGif.dark ? { dark: true } : {}),
    };
    if (state.customCompanionGif.light || state.customCompanionGif.dark) {
      await persistCustomCompanionGifPayloads(state.customCompanionGif);
      persistNow();
      lastUndoSnapshot.value = createUndoSnapshot();
    }
  } catch {
    state.customCompanionGifStored = {};
  }
  const inlineImagePayloads = state.images.filter((image): image is StoredImage & { src: string } => Boolean(image.src));
  state.images = await hydrateStoredImages(state.images, { persistLegacyPayloads: true });
  await persistImagePayloads(inlineImagePayloads);
  if (!appMounted) return;
  checkAppVersion();
  void checkLatestAppVersion();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("focus", handleNotificationReturn);
  window.addEventListener("storage", handleStorageEvent);
  document.addEventListener("paste", handlePaste);
  document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
  setupStateSyncChannel();
  versionCheckTimer.value = window.setInterval(() => {
    void checkLatestAppVersion();
  }, APP_VERSION_CHECK_INTERVAL_MS);
  todoNotificationTimer.value = window.setInterval(refreshTodoNotifications, TODO_NOTIFICATION_FALLBACK_INTERVAL_MS);
  refreshTodoNotifications();
});

onUnmounted(() => {
  appMounted = false;
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("focus", handleNotificationReturn);
  window.removeEventListener("storage", handleStorageEvent);
  document.removeEventListener("paste", handlePaste);
  document.removeEventListener("visibilitychange", handleDocumentVisibilityChange);
  teardownStateSyncChannel();
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
  textEditGeneration += 1;
  markDirty();
  scheduleTextSave();
}

function updateSpaceLines(id: string, lines: LineItem[]): void {
  const space = state.spaces.find((item) => item.id === id);
  if (!space) return;
  space.lines = lines;
  textEditGeneration += 1;
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
    void persistPendingText();
  }, 3000);
}

function flushTextSave(): void {
  window.clearTimeout(textSaveTimer.value);
  textSaveTimer.value = undefined;
  void persistPendingText();
}

function resetTextGenerationBaseline(): void {
  window.clearTimeout(textSaveTimer.value);
  textSaveTimer.value = undefined;
  savedTextGeneration = textEditGeneration;
}

async function persistPendingText(options: { retryOnce?: boolean } = {}): Promise<void> {
  if (textEditGeneration === savedTextGeneration) return;
  const attemptGeneration = textEditGeneration;
  const persisted = persistNow("text");
  if (!persisted) {
    if (options.retryOnce && textEditGeneration !== savedTextGeneration) scheduleTextSave();
    return;
  }
  savedTextGeneration = Math.max(savedTextGeneration, attemptGeneration);
  if (textEditGeneration !== savedTextGeneration) {
    scheduleTextSave();
    return;
  }
  showSaveBubble();
}

function showCompanion(anchor?: HTMLElement, guideKey?: GuideKey): void {
  hideBubbleMessage({ clearRetainedContent: true });
  companionPosition.value = getCompanionPosition(anchor);
  activeGuideKey.value = guideKey ?? null;
}

function handleGuideFocus(key: GuideKey, anchor?: HTMLElement): void {
  showAreaGuide(key, anchor);
}

function handleGuideClick(key: GuideKey, anchor?: HTMLElement, immediate = false): void {
  invalidateGuideCompanion(key);
  if (immediate) {
    void showGuideBubble(key, anchor, true, activeGuideKey.value === key || bubbleVisible.value);
    return;
  }
  showAreaGuide(key, anchor);
}

function showAreaGuide(key: GuideKey, anchor?: HTMLElement): void {
  if (activeGuideKey.value === key && bubbleVisible.value && Boolean(bubbleMessage.value)) {
    if (anchor) companionPosition.value = getCompanionPosition(anchor);
    return;
  }
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

function persistNow(scope: SaveScope = "all", options: PersistOptions = {}): boolean {
  recordUndoCheckpoint();
  markSaving();
  const result = saveStateWithConflictCheck(state, {
    clientId: syncClientId,
    force: options.force,
    scope,
    imagePlacement: options.imagePlacement,
    imageReplacement: options.imageReplacement,
  });
  if (result.status === "conflict") {
    window.clearTimeout(saveStatusTimer.value);
    saveStatus.value = "dirty";
    showToast("stateConflict");
    return false;
  }
  state.sync = result.state.sync;
  if (result.status === "merged") {
    state.images = mergeVisibleImages(result.state.images, state.images);
  }
  broadcastStateSaved();
  markSavedSoon();
  scheduleImagePayloadPrune();
  return true;
}

function mergeVisibleImages(savedImages: StoredImage[], visibleImages: StoredImage[]): StoredImage[] {
  const visibleById = new Map(visibleImages.map((image) => [image.id, image]));
  return savedImages.map((image) => {
    const visible = visibleById.get(image.id);
    return {
      ...image,
      src: image.src ?? (visible && getImagePayloadId(visible) === getImagePayloadId(image) ? visible.src : undefined),
    };
  });
}

async function persistImageReplacement(
  replacement: StoredImage,
  expectedPayloadId: string,
): Promise<boolean> {
  const previousSnapshot = createUndoSnapshot();
  const nextImages = state.images.map((image) => image.id === replacement.id ? replacement : image);
  markSaving();
  const result = saveStateWithConflictCheck({ ...state, images: nextImages }, {
    clientId: syncClientId,
    scope: "images",
    imageReplacement: {
      imageId: replacement.id,
      expectedPayloadId,
      newPayloadId: getImagePayloadId(replacement),
    },
  });
  if (result.status === "conflict") {
    await applyImageReplacementConflict(result.state);
    return false;
  }
  state.sync = result.state.sync;
  state.images = result.status === "merged"
    ? mergeVisibleImages(result.state.images, nextImages)
    : nextImages;
  if (!restoringUndo) {
    undoSnapshots.value = [
      ...undoSnapshots.value.slice(-(UNDO_HISTORY_LIMIT - 1)),
      previousSnapshot,
    ];
    lastUndoSnapshot.value = createUndoSnapshot();
  }
  broadcastStateSaved();
  markSavedSoon();
  scheduleImagePayloadPrune();
  return true;
}

async function applyImageReplacementConflict(
  latest = loadState(),
): Promise<void> {
  window.clearTimeout(saveStatusTimer.value);
  saveStatus.value = "dirty";
  showToast("stateConflict");
  while (true) {
    latest.images = await hydrateStoredImages(latest.images);
    const newest = loadState();
    if (newest.sync.revision <= latest.sync.revision) break;
    latest = newest;
  }
  if (!appMounted || latest.sync.revision < state.sync.revision) return;
  if (textEditGeneration !== savedTextGeneration) {
    const localText = {
      noteLines: state.noteLines.map((line) => ({ ...line })),
      spaces: state.spaces.map((space) => ({
        ...space,
        lines: space.lines.map((line) => ({ ...line })),
      })),
      workspaceLines: state.workspaceLines.map((line) => ({ ...line })),
      storageLines: state.storageLines.map((line) => ({ ...line })),
    };
    Object.assign(state, latest, localText);
    applyTheme();
    window.clearTimeout(saveStatusTimer.value);
    saveStatus.value = "dirty";
    void persistPendingText({ retryOnce: true });
    return;
  }
  Object.assign(state, latest);
  resetTextGenerationBaseline();
  applyTheme();
  lastUndoSnapshot.value = createUndoSnapshot();
  window.clearTimeout(saveStatusTimer.value);
  saveStatus.value = "saved";
}

function scheduleImagePayloadPrune(): void {
  window.clearTimeout(imagePayloadPruneTimer.value);
  imagePayloadPruneTimer.value = window.setTimeout(() => {
    imagePayloadPruneTimer.value = undefined;
    void pruneStoredImagePayloads(collectRetainedImagePayloadIds()).catch(() => {
      // Payload pruning is best-effort and must not interrupt board persistence.
    });
  }, 500);
}

function collectRetainedImagePayloadIds(): Set<string> {
  const retained = new Set(state.images.map((image) => getImagePayloadId(image)));
  const addSnapshot = (snapshot: string) => {
    try {
      const parsed = JSON.parse(snapshot) as { images?: unknown };
      if (!Array.isArray(parsed?.images)) return;
      parsed.images.forEach((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" && record.id.trim() ? record.id : undefined;
        const payloadId = typeof record.payloadId === "string" && record.payloadId.trim()
          ? record.payloadId
          : undefined;
        if (payloadId ?? id) retained.add((payloadId ?? id)!);
      });
    } catch {
      // Ignore malformed undo snapshots without normalizing them into generated IDs.
    }
  };
  undoSnapshots.value.forEach(addSnapshot);
  addSnapshot(lastUndoSnapshot.value);
  const authoritative = localStorage.getItem(STORAGE_KEY);
  if (authoritative) addSnapshot(authoritative);
  return retained;
}

function setupStateSyncChannel(): void {
  if (!("BroadcastChannel" in window)) return;
  stateSyncChannel = new BroadcastChannel(STATE_SYNC_CHANNEL);
  stateSyncChannel.addEventListener("message", handleStateSyncMessage);
}

function teardownStateSyncChannel(): void {
  stateSyncChannel?.removeEventListener("message", handleStateSyncMessage);
  stateSyncChannel?.close();
  stateSyncChannel = null;
}

function broadcastStateSaved(): void {
  stateSyncChannel?.postMessage({
    type: "saved",
    revision: state.sync.revision,
    clientId: syncClientId,
  });
}

function handleStateSyncMessage(event: MessageEvent): void {
  const payload = event.data as { type?: string; revision?: number; clientId?: string };
  if (payload.type !== "saved" || payload.clientId === syncClientId) return;
  if (typeof payload.revision === "number" && payload.revision <= state.sync.revision) return;
  void applyExternalStoredState();
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  void applyExternalStoredState(event.newValue);
}

async function applyExternalStoredState(raw?: string): Promise<void> {
  if (hasUnsavedLocalChanges()) {
    showToast("stateConflict");
    return;
  }
  try {
    const source = raw ?? localStorage.getItem(STORAGE_KEY);
    if (!source) return;
    const nextState = normalizeImportedState(JSON.parse(source));
    if (nextState.sync.revision <= state.sync.revision) return;
    nextState.images = await hydrateStoredImages(nextState.images);
    if (!appMounted) return;
    Object.assign(state, nextState);
    resetTextGenerationBaseline();
    applyTheme();
    lastUndoSnapshot.value = createUndoSnapshot();
  } catch {
    // External storage may be mid-write or unavailable; keep this tab's current state.
  }
}

function hasUnsavedLocalChanges(): boolean {
  return textEditGeneration !== savedTextGeneration || saveStatus.value !== "saved";
}

function markDirty(): void {
  recordUndoCheckpoint();
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
  const request = pendingBrowserImagePasteRequest?.request ?? { placement: "append" as const };
  pendingBrowserImagePasteRequest = undefined;
  if (shouldBlockBoardEffects()) return;
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;
  await addPastedImageFile(file, request);
}

async function pasteImageFromClipboard(request: ImagePasteRequest): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const clipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  };
  if (!clipboard?.read) {
    if (pasteImageWithBrowserCommand(request)) return;
    showBubble("clipboardPasteUnsupported", undefined, { hideCompanionAfter: true });
    return;
  }
  let items: ClipboardItem[];
  try {
    items = await clipboard.read();
  } catch {
    if (shouldBlockBoardEffects()) return;
    if (pasteImageWithBrowserCommand(request)) return;
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
    await addPastedImageFile(new File([blob], "clipboard-image", { type }), request);
    return;
  }
  if (shouldBlockBoardEffects()) return;
  showBubble("clipboardImageMissing", undefined, { hideCompanionAfter: true });
}

function pasteImageWithBrowserCommand(request: ImagePasteRequest): boolean {
  request.anchor?.focus({ preventScroll: true });
  const token = ++browserImagePasteRequestToken;
  pendingBrowserImagePasteRequest = { request, token };
  const pasted = Boolean(document.execCommand?.("paste"));
  if (!pasted) {
    if (pendingBrowserImagePasteRequest?.token === token) pendingBrowserImagePasteRequest = undefined;
    return false;
  }
  window.setTimeout(() => {
    if (pendingBrowserImagePasteRequest?.token === token) pendingBrowserImagePasteRequest = undefined;
  }, 0);
  return pasted;
}

async function addPastedImageFile(file: File, request: ImagePasteRequest): Promise<StoredImage | undefined> {
  if (request.placement === "append") {
    return addImageFile(file, {
      matchDisplaySizeToDevicePixelRatio: true,
      onPersisted: (image) => publishPasteFeedback(image.id),
    });
  }
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

  const target = state.images.find((image) => image.id === request.targetId);
  if (!target) return undefined;
  if (request.placement === "replace") {
    const expectedPayloadId = getImagePayloadId(target);
    const replacement = { ...target, payloadId: createId(), src };
    try {
      await storeImagePayload(replacement);
    } catch {
      if (shouldBlockBoardEffects()) return undefined;
      showBubble("imageStoreFailed", undefined, { hideCompanionAfter: true });
      return undefined;
    }
    const currentTarget = state.images.find((image) => image.id === request.targetId);
    if (shouldBlockBoardEffects() || !currentTarget || getImagePayloadId(currentTarget) !== expectedPayloadId) {
      try {
        await deleteStoredImage(replacement);
      } catch {
        // Best-effort cleanup for an uncommitted replacement payload.
      }
      if (!shouldBlockBoardEffects()) await applyImageReplacementConflict();
      return undefined;
    }
    if (!(await persistImageReplacement(replacement, expectedPayloadId))) {
      try {
        await deleteStoredImage(replacement);
      } catch {
        // Best-effort cleanup for a replacement that lost a storage conflict.
      }
      return undefined;
    }
    publishPasteFeedback(replacement.id);
    showBubble("imageAdded", undefined, { hideCompanionAfter: true });
    return replacement;
  }

  const displaySize = await getDevicePixelRatioDisplaySize(src);
  if (shouldBlockBoardEffects()) return undefined;
  if (!state.images.some((image) => image.id === request.targetId)) return undefined;
  const image: StoredImage = {
    id: createId(),
    src,
    createdAt: Date.now(),
    ...(displaySize ?? {}),
  };
  try {
    await storeImagePayload(image);
  } catch {
    if (shouldBlockBoardEffects()) return undefined;
    showBubble("imageStoreFailed", undefined, { hideCompanionAfter: true });
    return undefined;
  }
  const targetIndex = state.images.findIndex((item) => item.id === request.targetId);
  if (shouldBlockBoardEffects() || targetIndex < 0) {
    try {
      await deleteStoredImage(image);
    } catch {
      // Best-effort cleanup when the target disappears after payload storage.
    }
    return undefined;
  }
  state.images.splice(targetIndex + (request.placement === "after" ? 1 : 0), 0, image);
  const persisted = persistNow("images", {
    imagePlacement: {
      imageId: image.id,
      targetId: request.targetId,
      placement: request.placement,
    },
  });
  if (persisted) publishPasteFeedback(image.id);
  showBubble("imageAdded", undefined, { hideCompanionAfter: true });
  return image;
}

function publishPasteFeedback(id: string): void {
  pasteFeedback.value = { id, token: ++pasteFeedbackToken };
}

async function addImageFile(
  file: File,
  options: {
    showMessage?: boolean;
    matchDisplaySizeToDevicePixelRatio?: boolean;
    onPersisted?: (image: StoredImage) => void;
  } = {},
): Promise<StoredImage | undefined> {
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
  const displaySize = options.matchDisplaySizeToDevicePixelRatio
    ? await getDevicePixelRatioDisplaySize(src)
    : undefined;
  if (shouldBlockBoardEffects()) return undefined;
  const image: StoredImage = {
    id: createId(),
    src,
    createdAt: Date.now(),
    ...(displaySize ?? {}),
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
      await deleteStoredImage(image);
    } catch {
      // Best-effort cleanup for payloads that were stored just before mobile handoff.
    }
    return undefined;
  }
  state.images.push(image);
  if (persistNow("images")) options.onPersisted?.(image);
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

function moveImageToBottom(id: string): void {
  const index = state.images.findIndex((image) => image.id === id);
  if (index < 0 || index === state.images.length - 1) return;
  const [image] = state.images.splice(index, 1);
  state.images.push(image);
  persistNow();
}

function deleteImage(id: string, anchor?: HTMLElement): void {
  const feedbackAnchor = getImageUndoAnchor(anchor);
  requestConfirmation("confirmDeleteImage", anchor, async () => {
    const index = state.images.findIndex((image) => image.id === id);
    if (index < 0) return;
    const nextPreviewImage = state.images[index + 1] ?? state.images[index - 1];
    state.images = state.images.filter((image) => image.id !== id);
    if (activePreviewId.value === id) {
      if (nextPreviewImage) {
        activePreviewId.value = nextPreviewImage.id;
        activeEditorId.value = undefined;
        closingPreviewId.value = undefined;
        window.clearTimeout(previewCloseTimer.value);
        previewCloseTimer.value = undefined;
      } else {
        clearImagePreview();
      }
    } else if (closingPreviewId.value === id) {
      clearImagePreview();
    }
    persistNow();
    showBubble("deleteImage", feedbackAnchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
}

function openImagePreview(id: string): void {
  window.clearTimeout(previewCloseTimer.value);
  previewCloseTimer.value = undefined;
  closingPreviewId.value = undefined;
  hideCompanion();
  activeEditorId.value = undefined;
  activePreviewId.value = id;
  if (state.images.length > IMAGE_DENSITY_THRESHOLD) {
    showBubble("imageOverload", document.querySelector<HTMLElement>(".image-panel") ?? undefined, { hideCompanionAfter: true });
  }
}

function openImageEditor(id: string): void {
  window.clearTimeout(previewCloseTimer.value);
  previewCloseTimer.value = undefined;
  closingPreviewId.value = undefined;
  hideCompanion();
  activePreviewId.value = id;
  activeEditorId.value = id;
}

function closeImagePreview(): void {
  const previewId = activePreviewId.value;
  if (!previewId) return;
  window.clearTimeout(previewCloseTimer.value);
  closingPreviewId.value = previewId;
  activePreviewId.value = undefined;
  activeEditorId.value = undefined;
  previewCloseTimer.value = window.setTimeout(() => {
    closingPreviewId.value = undefined;
    previewCloseTimer.value = undefined;
  }, IMAGE_PREVIEW_CLOSE_MS);
}

function clearImagePreview(): void {
  window.clearTimeout(previewCloseTimer.value);
  previewCloseTimer.value = undefined;
  activePreviewId.value = undefined;
  activeEditorId.value = undefined;
  closingPreviewId.value = undefined;
}

async function saveEditedImage(payload: { id: string; src: string; displayWidth: number; displayHeight: number }): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const image = state.images.find((item) => item.id === payload.id);
  if (!image) return;
  const expectedPayloadId = getImagePayloadId(image);
  const nextImage: StoredImage = {
    ...image,
    payloadId: createId(),
    src: payload.src,
    displayWidth: payload.displayWidth,
    displayHeight: payload.displayHeight,
  };
  try {
    await storeImagePayload(nextImage);
  } catch {
    if (shouldBlockBoardEffects()) return;
    showBubble("imageStoreFailed", document.querySelector<HTMLElement>(".image-preview") ?? undefined, { hideCompanionAfter: true });
    return;
  }
  const currentImage = state.images.find((item) => item.id === payload.id);
  if (shouldBlockBoardEffects() || !currentImage || getImagePayloadId(currentImage) !== expectedPayloadId) {
    try {
      await deleteStoredImage(nextImage);
    } catch {
      // Best-effort cleanup for an uncommitted edited payload.
    }
    if (!shouldBlockBoardEffects()) await applyImageReplacementConflict();
    return;
  }
  if (!(await persistImageReplacement(nextImage, expectedPayloadId))) {
    try {
      await deleteStoredImage(nextImage);
    } catch {
      // Best-effort cleanup for an edit that lost a storage conflict.
    }
    return;
  }
  activeEditorId.value = undefined;
  showBubble("imageEdited", document.querySelector<HTMLElement>(".image-preview") ?? undefined, { hideCompanionAfter: true });
}

function showPreviewTips(anchor?: HTMLElement): void {
  showBubbleText(uiText.value.preview.help, anchor ?? document.querySelector<HTMLElement>(".image-preview") ?? undefined, { hideCompanionAfter: true }, 5200);
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

function saveQuick(payload: { id?: string; title: string; value: string; type: QuickButtonType; tagTitle?: string; apiMethod?: QuickApiMethod; apiHeaders?: QuickApiHeader[]; apiBodyType?: QuickApiBodyType; apiBody?: string }): void {
  if (!payload.title && !payload.value) return;
  const tagId = resolveQuickTagId(payload.tagTitle);
  if (payload.id) {
    const button = state.quickButtons.find((item) => item.id === payload.id);
    if (button) {
      button.title = payload.title || button.title;
      button.value = payload.value;
      button.type = payload.type;
      applyQuickTag(button, tagId);
      applyQuickApiConfig(button, payload);
    }
  } else {
    const button: QuickButton = {
      id: createId(),
      title: payload.title || getUntitledQuickTitle(payload.type),
      value: payload.value,
      type: payload.type,
      hidden: false,
    };
    applyQuickTag(button, tagId);
    applyQuickApiConfig(button, payload);
    state.quickButtons.push(button);
  }
  persistNow();
}

function resolveQuickTagId(tagTitle?: string): string | undefined {
  const title = tagTitle?.trim();
  if (!title) return undefined;
  const existing = state.quickTags.find((tag) => tag.title === title);
  if (existing) return existing.id;
  const tag = { id: createId(), title };
  state.quickTags.push(tag);
  return tag.id;
}

function saveQuickTag(payload: { id?: string; title: string }): void {
  const title = payload.title.trim();
  if (!title) return;
  if (!payload.id) {
    if (state.quickTags.some((tag) => tag.title === title)) return;
    state.quickTags.push({ id: createId(), title });
    persistNow();
    return;
  }

  const current = state.quickTags.find((tag) => tag.id === payload.id);
  if (!current) return;
  const duplicate = state.quickTags.find((tag) => tag.id !== payload.id && tag.title === title);
  if (duplicate) {
    moveQuickButtonsToTag(payload.id, duplicate.id);
    state.quickTags = state.quickTags.filter((tag) => tag.id !== payload.id);
  } else {
    current.title = title;
  }
  persistNow();
}

function deleteQuickTag(id: string, anchor?: HTMLElement): void {
  const tag = state.quickTags.find((item) => item.id === id);
  if (!tag) return;
  requestConfirmation("confirmDeleteQuickTag", anchor, () => {
    state.quickTags = state.quickTags.filter((item) => item.id !== id);
    moveQuickButtonsToTag(id, undefined);
    persistNow();
    showBubble("deleteQuickTag", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
}

function moveQuickButtonsToTag(fromTagId: string, toTagId: string | undefined): void {
  state.quickButtons.forEach((button) => {
    if (button.tagId !== fromTagId) return;
    applyQuickTag(button, toTagId);
  });
}

function applyQuickTag(button: QuickButton, tagId: string | undefined): void {
  if (tagId) {
    button.tagId = tagId;
    return;
  }
  delete button.tagId;
}

function getUntitledQuickTitle(type: QuickButtonType): string {
  if (type === "link") return uiText.value.quick.untitledLink;
  if (type === "api") return uiText.value.quick.untitledApi;
  return uiText.value.quick.untitledText;
}

function applyQuickApiConfig(
  button: QuickButton,
  payload: { type: QuickButtonType; apiMethod?: QuickApiMethod; apiHeaders?: QuickApiHeader[]; apiBodyType?: QuickApiBodyType; apiBody?: string },
): void {
  if (payload.type !== "api") {
    delete button.apiMethod;
    delete button.apiHeaders;
    delete button.apiBodyType;
    delete button.apiBody;
    return;
  }
  button.apiMethod = payload.apiMethod ?? "GET";
  button.apiHeaders = payload.apiHeaders ?? [];
  button.apiBodyType = payload.apiBodyType ?? "none";
  button.apiBody = payload.apiBody ?? "";
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

function reorderQuickTags(dragId: string, targetId: string): void {
  moveItem(state.quickTags, dragId, targetId);
  persistNow();
}

function moveQuickButtonToTag(buttonId: string, tagId?: string, targetId?: string): void {
  const button = state.quickButtons.find((item) => item.id === buttonId);
  if (!button) return;
  if (tagId && !state.quickTags.some((tag) => tag.id === tagId)) return;
  applyQuickTag(button, tagId);
  if (targetId) moveItem(state.quickButtons, buttonId, targetId);
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
  if (button.type === "api") {
    await callQuickApi(button, anchor);
    return;
  }
  const copied = await copyText(button.value, shouldBlockBoardEffects);
  if (shouldBlockBoardEffects()) return;
  showBubble(copied ? "quickTextCopied" : "quickTextCopyFailed", anchor, {
    hideCompanionAfter: true,
  });
}

async function callQuickApi(button: QuickButton, anchor?: HTMLElement): Promise<void> {
  showBubbleText(getQuickApiInvokedMessage(button.title), anchor, { hideCompanionAfter: true }, 2200);
  try {
    const response = await fetch(normalizeApiUrl(button.value), buildQuickApiRequest(button));
    if (shouldBlockBoardEffects()) return;
    const responseBody = await readQuickApiResponseBody(response);
    if (shouldBlockBoardEffects()) return;
    showBubbleText(getQuickApiStatusMessage(response.status, responseBody), anchor, { hideCompanionAfter: true }, 5200);
  } catch {
    if (shouldBlockBoardEffects()) return;
    showBubbleText(state.language === "en" ? "❌ API request failed. Check the URL, CORS, or network (；′⌒`)" : "❌ 接口调用失败，检查 URL、跨域或网络吧 (；′⌒`)", anchor, { hideCompanionAfter: true }, 4200);
  }
}

function buildQuickApiRequest(button: QuickButton): RequestInit {
  const method = button.apiMethod ?? "GET";
  const bodyType = button.apiBodyType ?? "none";
  const headers = new Headers();
  applyQuickApiHeaders(headers, button.apiHeaders ?? []);
  const init: RequestInit = { method, headers };
  if (["GET", "HEAD"].includes(method) || bodyType === "none") return init;
  if (bodyType === "json") {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    init.body = button.apiBody ?? "";
  } else if (bodyType === "form") {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    init.body = button.apiBody ?? "";
  } else {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "text/plain;charset=UTF-8");
    init.body = button.apiBody ?? "";
  }
  return init;
}

function applyQuickApiHeaders(headers: Headers, apiHeaders: QuickApiHeader[]): void {
  apiHeaders.forEach((header) => {
    const name = header.key.trim();
    if (!name) return;
    headers.set(name, header.value.trim());
  });
}

function normalizeApiUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getQuickApiInvokedMessage(title: string): string {
  return state.language === "en"
    ? `🚀 API "${title}" has been called (｡•̀ᴗ-)✧`
    : `🚀 接口「${title}」已发起调用 (｡•̀ᴗ-)✧`;
}

async function readQuickApiResponseBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const normalized = text.trim();
    return normalized || (state.language === "en" ? "(empty)" : "空");
  } catch {
    return state.language === "en" ? "Unable to read response body" : "无法读取响应体";
  }
}

function getQuickApiStatusMessage(status: number, responseBody?: string): string {
  const bodyLine = responseBody === undefined
    ? ""
    : `\n${state.language === "en" ? "Response body" : "响应体"}：${formatQuickApiResponseBody(responseBody)}`;
  if (status >= 200 && status < 300) {
    return state.language === "en"
      ? `✅ ${status} Success, the API responded normally (＾▽＾)${bodyLine}`
      : `✅ ${status} 调用成功，接口正常响应啦 (＾▽＾)${bodyLine}`;
  }
  if (status >= 300 && status < 400) {
    return state.language === "en"
      ? `↪️ ${status} Redirect response received (・_・ヾ${bodyLine}`
      : `↪️ ${status} 收到重定向响应，可能需要检查跳转地址 (・_・ヾ${bodyLine}`;
  }
  if (status >= 400 && status < 500) {
    return state.language === "en"
      ? `⚠️ ${status} Client-side request issue, check parameters or permission (；′⌒\`)${bodyLine}`
      : `⚠️ ${status} 请求侧可能有问题，检查参数或权限吧 (；′⌒\`)${bodyLine}`;
  }
  if (status >= 500) {
    return state.language === "en"
      ? `💥 ${status} Server-side error, the API is unhappy Σ(っ °Д °;)っ${bodyLine}`
      : `💥 ${status} 服务端异常，接口有点不开心 Σ(っ °Д °;)っ${bodyLine}`;
  }
  return state.language === "en"
    ? `ℹ️ ${status} Response received, status is uncommon (・∀・)${bodyLine}`
    : `ℹ️ ${status} 已收到响应，这个状态码比较少见 (・∀・)${bodyLine}`;
}

function formatQuickApiResponseBody(value: string): string {
  const maxLength = 500;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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
  const trimmedTitle = title?.trim() ?? "";
  if (!trimmedTitle) return;
  const id = createId();
  state.todoLists.push({ id, title: trimmedTitle, collapsed: false, compact: false });
  state.todos[id] = [];
  state.showCompletedTodos[id] = false;
  pendingEditTodoListId.value = null;
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
        const input = getTodoInput(blankTodo.period, blankTodo.id);
        input?.blur();
        state.todos = removeTodoFromMap(state.todos, blankTodo.period, blankTodo.id);
        persistNow();
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
  const input = getTodoInput(period, id) ?? getTodoInputs(period).at(-1);
  if (!input) return;
  const caret = input.value.length;
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
}

function getTodoInputs(period: TodoPeriod): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(".todo-input"))
    .filter((item) => item.dataset.testid === `todo-input-${period}`);
}

function getTodoInput(period: TodoPeriod, id: string): HTMLInputElement | undefined {
  return getTodoInputs(period).find((item) => item.dataset.todoId === id);
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
  if (!light && !dark) {
    showBubbleText(uiText.value.app.chooseGif, anchor);
    return;
  }
  const nextCustomGif = {
    ...(state.customCompanionGif.light ? { light: state.customCompanionGif.light } : {}),
    ...(state.customCompanionGif.dark ? { dark: state.customCompanionGif.dark } : {}),
    ...(light ? { light } : {}),
    ...(dark ? { dark } : {}),
  };
  state.customCompanionGif = {
    ...nextCustomGif,
  };
  state.customCompanionGifStored = {
    ...(nextCustomGif.light ? { light: true } : {}),
    ...(nextCustomGif.dark ? { dark: true } : {}),
  };
  state.companionGifTheme = "custom";
  await persistCustomCompanionGifPayloads(state.customCompanionGif);
  persistNow();
  showBubbleText(uiText.value.app.customGifSet, anchor);
}

function applyTheme(): void {
  document.documentElement.dataset.theme = state.theme;
}

function exportData(anchor?: HTMLElement): void {
  const content = exportJsonState(state);
  const filename = `mini-desk-${new Date().toISOString().slice(0, 10)}.json`;
  downloadExportFile(content, filename);
  showBubble("dataExported", anchor, { hideCompanionAfter: true });
}

function clearData(anchor?: HTMLElement): void {
  requestConfirmation(
    "confirmClearData",
    anchor,
    async () => {
      window.clearTimeout(textSaveTimer.value);
      textSaveTimer.value = undefined;
      emptyTodoRemovalTimers.forEach((timer) => window.clearTimeout(timer));
      emptyTodoRemovalTimers.clear();
      clearImagePreview();
      pendingEditSpaceId.value = null;
      pendingEditTodoListId.value = null;
      undoSnapshots.value = [];
      Object.assign(state, defaultState());
      resetTextGenerationBaseline();
      await clearStoredImagePayloads();
      persistNow("all", { force: true });
      refreshTodoNotifications();
      lastUndoSnapshot.value = createUndoSnapshot();
      showBubble("dataCleared", anchor, { hideCompanionAfter: true });
    },
    undefined,
    { confirmText: uiText.value.settings.clearData, cancelText: uiText.value.common.cancel, danger: true },
  );
}

function downloadExportFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
      resetTextGenerationBaseline();
      await persistCustomCompanionGifPayloads(state.customCompanionGif);
      await persistImagePayloads(state.images);
      persistNow("all", { force: true });
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
    [`${uiText.value.app.aboutTitle} ${uiText.value.app.aboutSignature}`, uiText.value.app.aboutDescription].join("\n"),
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
  if (event.defaultPrevented) return;
  const previewId = activePreviewId.value;
  if (previewId) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "c") {
      event.preventDefault();
      void copyImage(previewId, document.querySelector<HTMLElement>(".image-preview") ?? undefined);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "v") {
      event.preventDefault();
      const anchor = document.querySelector<HTMLElement>(".preview-stage img")
        ?? document.querySelector<HTMLElement>(".image-preview")
        ?? document.body;
      void pasteImageFromClipboard({ placement: "after", targetId: previewId, anchor });
      return;
    }
    if (event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      closeImagePreview();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openImageEditor(previewId);
      return;
    }
    if (event.key === "5") {
      event.preventDefault();
      void copyImage(previewId, document.querySelector<HTMLElement>(".image-preview") ?? undefined);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteImage(previewId, document.querySelector<HTMLElement>(".image-preview") ?? undefined);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      navigatePreview(-1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      navigatePreview(1);
      return;
    }
    if (key === "w" || key === "a") {
      event.preventDefault();
      navigatePreview(-1);
      return;
    }
    if (key === "s" || key === "d") {
      event.preventDefault();
      navigatePreview(1);
      return;
    }
  }
  if (isUndoShortcut(event) && !shouldSkipGlobalUndo(event.target)) {
    event.preventDefault();
    void undoLastBoardChange();
    return;
  }
  if (event.key === "Escape") {
    const hadCompanion = companionVisible.value;
    if (hadCompanion) hideCompanion();
    const didBlur = blurActiveBoardElement();
    if (hadCompanion || didBlur) event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    flushTextSave();
    showSaveBubble();
  }
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
}

function shouldSkipGlobalUndo(target: EventTarget | null): boolean {
  if (document.querySelector(".image-editor")) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest(".image-editor")) return true;
  if (target.closest(".title-edit-input, .space-tab-edit-input, .todo-list-create-input, .gif-theme-custom-dialog")) return true;
  if (target instanceof HTMLTextAreaElement && target.closest(".text-panel")) return true;
  return false;
}

function blurActiveBoardElement(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return false;
  if (!active.closest(".workbench-shell")) return false;
  active.blur();
  return true;
}

function recordUndoCheckpoint(): void {
  if (restoringUndo) {
    lastUndoSnapshot.value = createUndoSnapshot();
    return;
  }
  const current = createUndoSnapshot();
  if (current === lastUndoSnapshot.value) return;
  undoSnapshots.value = [
    ...undoSnapshots.value.slice(-(UNDO_HISTORY_LIMIT - 1)),
    lastUndoSnapshot.value,
  ];
  lastUndoSnapshot.value = current;
}

async function undoLastBoardChange(): Promise<void> {
  if (undoInFlight || restoringUndo) return;
  const snapshot = undoSnapshots.value.at(-1);
  if (!snapshot) return;
  let nextState: BoardState;
  try {
    nextState = normalizeImportedState(JSON.parse(snapshot));
  } catch {
    lastUndoSnapshot.value = createUndoSnapshot();
    return;
  }

  const stateAtStart = createUndoSnapshot();
  undoInFlight = true;
  try {
    nextState.images = await hydrateStoredImages(nextState.images);
    if (!appMounted || createUndoSnapshot() !== stateAtStart || undoSnapshots.value.at(-1) !== snapshot) return;
    restoringUndo = true;
    undoSnapshots.value = undoSnapshots.value.slice(0, -1);
    window.clearTimeout(textSaveTimer.value);
    textSaveTimer.value = undefined;
    emptyTodoRemovalTimers.forEach((timer) => window.clearTimeout(timer));
    emptyTodoRemovalTimers.clear();
    clearImagePreview();
    pendingEditSpaceId.value = null;
    pendingEditTodoListId.value = null;
    Object.assign(state, nextState);
    resetTextGenerationBaseline();
    persistNow();
    lastUndoSnapshot.value = createUndoSnapshot();
  } finally {
    restoringUndo = false;
    undoInFlight = false;
  }
}

function createUndoSnapshot(): string {
  return exportUndoSnapshotState(state);
}

function navigatePreview(direction: number): void {
  const index = state.images.findIndex((image) => image.id === activePreviewId.value);
  if (index < 0) return;
  const next = state.images[index + direction];
  if (next) {
    activePreviewId.value = next.id;
    activeEditorId.value = undefined;
  }
}

function showSaveBubble(): void {
  showBubble("save");
}

function showSaveStatusTip(anchor?: HTMLElement): void {
  if (workspaceDensityStatus.value === "saved") {
    showBubble("workspaceDensityGood", anchor);
    return;
  }
  if (workspaceDensityStatus.value === "dirty") {
    const summary = overLimitDensityAreas.value
      .map((area) => `${area.label} ${area.count}`)
      .join("、");
    showBubbleText(
      formatDensitySummaryMessage(getMessage("workspaceDensityAllOver", Math.random, state.language), summary),
      anchor,
    );
    return;
  }
  const area = randomDensityArea(overLimitDensityAreas.value);
  if (!area) {
    showBubble("workspaceDensityGood", anchor);
    return;
  }
  const groupingTipKey = densityGroupingTipKeys[area.type];
  if (groupingTipKey && Math.random() < WORKSPACE_DENSITY_GROUP_TIP_CHANCE) {
    showBubbleText(getMessage(groupingTipKey, Math.random, state.language), anchor);
    return;
  }
  showBubbleText(
    formatDensityMessage(getMessage("workspaceDensityAreaOver", Math.random, state.language), area),
    anchor,
  );
}

function getDensityAreas(): DensityArea[] {
  return [
    {
      type: "todos",
      label: getDensityAreaLabel("todos"),
      count: getLargestTodoListCount(),
    },
    {
      type: "quickButtons",
      label: getDensityAreaLabel("quickButtons"),
      count: getLargestQuickCategoryCount(),
    },
    {
      type: "images",
      label: getDensityAreaLabel("images"),
      count: state.images.length,
    },
  ];
}

function getDensityThreshold(type: DensityAreaType): number {
  if (type === "todos") return TODO_DENSITY_THRESHOLD;
  if (type === "quickButtons") return QUICK_DENSITY_THRESHOLD;
  return IMAGE_DENSITY_THRESHOLD;
}

function getDensityAreaLabel(type: DensityAreaType): string {
  if (state.language === "en") {
    if (type === "todos") return "Reminders";
    if (type === "quickButtons") return "Quick Actions";
    return "Images";
  }
  if (type === "todos") return "提醒事项";
  if (type === "quickButtons") return "快捷动作";
  return "图片";
}

function getLargestTodoListCount(): number {
  let max = 0;
  for (const list of state.todoLists) {
    let activeCount = 0;
    for (const todo of state.todos[list.id] ?? []) {
      if (!todo.done) activeCount += 1;
    }
    if (activeCount > max) max = activeCount;
  }
  return max;
}

function getLargestQuickCategoryCount(): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const button of state.quickButtons) {
    if (button.hidden) continue;
    const tagId = button.tagId ?? "__untagged";
    const count = (counts.get(tagId) ?? 0) + 1;
    counts.set(tagId, count);
    if (count > max) max = count;
  }
  return max;
}

function randomDensityArea(areas: DensityArea[]): DensityArea | undefined {
  if (areas.length === 0) return undefined;
  return areas[Math.floor(Math.random() * areas.length)];
}

function formatDensityMessage(message: string, area: DensityArea): string {
  return message
    .replaceAll("{area}", area.label)
    .replaceAll("{count}", String(area.count));
}

function formatDensitySummaryMessage(message: string, summary: string): string {
  return message.replaceAll("{summary}", summary);
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
  bubbleSignature.value = options.signatureText ?? "";
  activeGuideKey.value = options.guideKey ?? null;
  companionFocused.value = true;
  if (anchor) {
    companionPosition.value = getCompanionPosition(anchor);
  }
  bubbleVisible.value = true;
  bubbleTimerOptions.value = options;
  startBubbleTimer(duration);
}

function showToolBubble(message: string, anchor?: HTMLElement): void {
  showBubbleText(message, anchor, { hideCompanionAfter: true }, 3000);
}

function showDeclutterBubble(anchor?: HTMLElement): void {
  showBubble("declutter", anchor, { guideKey: "todos" });
}

function showQuickDeclutterBubble(anchor?: HTMLElement): void {
  showBubble("quickDeclutter", anchor, { guideKey: "quickButtons" });
}

function dismissToolBubble(): void {
  hideBubbleMessage({ clearRetainedContent: true });
  companionFocused.value = false;
  activeGuideKey.value = null;
}

function hideBubbleMessage(options: { clearRetainedContent?: boolean } = {}): void {
  window.clearTimeout(bubbleTimer.value);
  window.clearTimeout(bubbleFadeTimer.value);
  bubbleTimer.value = undefined;
  bubbleFadeTimer.value = undefined;
  bubbleRemainingMs.value = 0;
  bubbleTimerStartedAt.value = 0;
  companionFadeRemaining.value = 0;
  companionFadeStartedAt.value = 0;
  bubbleTimerOptions.value = {};
  clearPendingConfirm();
  bubbleVisible.value = false;
  bubbleMessage.value = "";
  bubbleLink.value = null;
  bubbleSignature.value = "";
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
  bubbleSignature.value = "";
  if (options.guideKey) activeGuideKey.value = null;
  window.clearTimeout(bubbleFadeTimer.value);
  companionFadeRemaining.value = COMPANION_FADE_MS;
  companionFadeStartedAt.value = Date.now();
  bubbleFadeTimer.value = window.setTimeout(finishCompanionFade, COMPANION_FADE_MS);
}

function finishCompanionFade(): void {
  bubbleFadeTimer.value = undefined;
  companionFadeRemaining.value = 0;
  companionFadeStartedAt.value = 0;
  companionFocused.value = false;
}

function pauseBubbleTimer(): void {
  if (bubbleVisible.value && bubbleTimer.value && !pendingConfirm.value) {
    window.clearTimeout(bubbleTimer.value);
    bubbleTimer.value = undefined;
    const elapsed = Date.now() - bubbleTimerStartedAt.value;
    bubbleRemainingMs.value = Math.max(0, bubbleRemainingMs.value - elapsed);
    bubbleTimerStartedAt.value = 0;
  }
  if (bubbleFadeTimer.value) {
    window.clearTimeout(bubbleFadeTimer.value);
    bubbleFadeTimer.value = undefined;
    const elapsed = Date.now() - companionFadeStartedAt.value;
    companionFadeRemaining.value = Math.max(0, companionFadeRemaining.value - elapsed);
    companionFadeStartedAt.value = 0;
  }
}

function resumeBubbleTimer(): void {
  if (bubbleVisible.value && !bubbleTimer.value && !pendingConfirm.value && (bubbleMessage.value || bubbleLink.value || bubbleSignature.value)) {
    if (bubbleRemainingMs.value <= 0) {
      finishBubbleTimer();
      return;
    }
    bubbleTimerStartedAt.value = Date.now();
    bubbleTimer.value = window.setTimeout(finishBubbleTimer, bubbleRemainingMs.value);
  }
  if (!bubbleFadeTimer.value && companionFadeRemaining.value > 0 && !bubbleVisible.value) {
    companionFadeStartedAt.value = Date.now();
    bubbleFadeTimer.value = window.setTimeout(finishCompanionFade, companionFadeRemaining.value);
  }
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
  bubbleSignature.value = "";
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
    "quickTags",
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
  window.clearTimeout(imagePayloadPruneTimer.value);
  window.clearInterval(versionCheckTimer.value);
  window.clearTimeout(todoNotificationDueTimer.value);
  window.clearInterval(titleFlashTimer.value);
  window.clearTimeout(previewCloseTimer.value);
  previewCloseTimer.value = undefined;
  imagePayloadPruneTimer.value = undefined;
  versionCheckTimer.value = undefined;
  window.clearInterval(todoNotificationTimer.value);
  todoNotificationDueTimer.value = undefined;
  todoNotificationTimer.value = undefined;
  titleFlashTimer.value = undefined;
  titleFlashActive.value = false;
  titleFlashAltVisible.value = false;
  notificationFlashTimers.forEach((timer) => window.clearTimeout(timer));
  notificationFlashTimers.clear();
  notificationFlashKeys.value = [];
  pendingNotificationFlashKeys.value = [];
  document.title = DEFAULT_DOCUMENT_TITLE;
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

const URL_LINE_PATTERN = /^https?:\/\//i;

function formatNotificationBody(text: string, language: AppLanguage): string {
  const prefix = language === "en" ? "From ——\n" : "来自于——\n";
  const lines = text.split("\n");
  const result = lines.map((line) => (URL_LINE_PATTERN.test(line.trim()) ? prefix + line : line));
  return result.join("\n");
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
      const title = `【${getTodoListTitle(period)}】`;
      const body = formatNotificationBody(todo.text, state.language);
      const options: NotificationOptions = {
        body,
        tag: getTodoNotificationTag(todo),
      };
      if (notificationIcon) options.icon = notificationIcon;
      try {
        new notificationApi(title, options);
        sentTodoNotifications.add(key);
        startNotificationTitleFlash();
        queueTodoNotificationFlash(period, todo.id);
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

function startNotificationTitleFlash(): void {
  if (document.visibilityState === "visible") return;
  if (titleFlashActive.value) return;
  titleFlashActive.value = true;
  titleFlashAltVisible.value = true;
  document.title = NOTIFICATION_DOCUMENT_TITLE;
  titleFlashTimer.value = window.setInterval(toggleNotificationTitle, TITLE_FLASH_INTERVAL_MS);
}

function toggleNotificationTitle(): void {
  if (!titleFlashActive.value) return;
  titleFlashAltVisible.value = !titleFlashAltVisible.value;
  document.title = titleFlashAltVisible.value ? NOTIFICATION_DOCUMENT_TITLE : DEFAULT_DOCUMENT_TITLE;
}

function stopNotificationTitleFlash(): void {
  window.clearInterval(titleFlashTimer.value);
  titleFlashTimer.value = undefined;
  titleFlashActive.value = false;
  titleFlashAltVisible.value = false;
  document.title = DEFAULT_DOCUMENT_TITLE;
}

function handleDocumentVisibilityChange(): void {
  if (document.visibilityState === "visible") handleNotificationReturn();
}

function handleNotificationReturn(): void {
  stopNotificationTitleFlash();
  flushPendingTodoNotificationFlashes();
}

function queueTodoNotificationFlash(period: TodoPeriod, id: string): void {
  const key = todoKey(period, id);
  if (document.visibilityState === "visible") {
    flashTodoNotificationKey(key);
    return;
  }
  if (!pendingNotificationFlashKeys.value.includes(key)) {
    pendingNotificationFlashKeys.value = [...pendingNotificationFlashKeys.value, key];
  }
}

function flushPendingTodoNotificationFlashes(): void {
  if (pendingNotificationFlashKeys.value.length === 0) return;
  const keys = pendingNotificationFlashKeys.value;
  pendingNotificationFlashKeys.value = [];
  keys.forEach(flashTodoNotificationKey);
}

function flashTodoNotificationKey(key: string): void {
  const existingTimer = notificationFlashTimers.get(key);
  if (existingTimer !== undefined) window.clearTimeout(existingTimer);
  if (!notificationFlashKeys.value.includes(key)) {
    notificationFlashKeys.value = [...notificationFlashKeys.value, key];
  }
  notificationFlashTimers.set(
    key,
    window.setTimeout(() => {
      notificationFlashTimers.delete(key);
      notificationFlashKeys.value = notificationFlashKeys.value.filter((item) => item !== key);
    }, TODO_NOTIFICATION_FLASH_MS),
  );
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

async function showGuideBubble(key: GuideKey, anchor?: HTMLElement, hideCompanionAfter = true, force = false): Promise<void> {
  if (pendingConfirm.value) return;
  if (!force && isRepeatLockedGuide(key)) {
    if (anchor) companionPosition.value = getCompanionPosition(anchor);
    return;
  }
  if (force) {
    hideBubbleMessage({ clearRetainedContent: true });
    await nextTick();
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
    return !state.quickButtons.some((button) => state.showHiddenQuickButtons || !button.hidden);
  }
  if (key === "workspace") {
    const active = state.spaces.find((space) => space.id === state.activeSpaceId) ?? state.spaces[0];
    return !active || !hasLineContent(active.lines);
  }
  if (key === "tools") return false;
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
  for (const todo of getTodos(period)) {
    if (!state.showCompletedTodos[period] && todo.done) continue;
    if (todo.text.trim().length > 0) return false;
  }
  return true;
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
  if (storedAppVersion.value !== appVersion.value) {
    markAppVersionSeen(appVersion.value);
    storedAppVersion.value = appVersion.value;
  }
  availableAppVersion.value = appVersion.value;
  versionPromptVisible.value = false;
}

async function checkLatestAppVersion(): Promise<void> {
  const latestVersion = await fetchLatestAppVersion();
  if (!appMounted || !latestVersion) return;

  if (latestVersion === appVersion.value) {
    availableAppVersion.value = appVersion.value;
    versionPromptVisible.value = false;
    return;
  }

  availableAppVersion.value = latestVersion;
  versionPromptVisible.value = true;
}

async function updateStaticVersion(): Promise<void> {
  await clearStaticCaches();
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
  const target = anchor?.closest(".image-preview, .preview-main, .preview-stage, .todo-section, .quick-block, .text-panel, .split-block, .panel") as HTMLElement | null;
  if (!target) return undefined;
  const rect = target.getBoundingClientRect();
  if (!rect.width && !rect.height) return undefined;
  const safeRight = Math.max(Math.round(rect.right), MIN_COMPANION_POPOVER_RIGHT_EDGE);
  const safeBottom = Math.min(Math.round(rect.bottom), window.innerHeight);
  return {
    right: `calc(100vw - ${safeRight}px + 10px)`,
    bottom: `calc(100vh - ${safeBottom}px + 10px)`,
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

async function getDevicePixelRatioDisplaySize(src: string): Promise<Pick<StoredImage, "displayWidth" | "displayHeight"> | undefined> {
  const pixelRatio = window.devicePixelRatio;
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 1) return undefined;
  const naturalSize = await readImageNaturalSize(src);
  if (!naturalSize) return undefined;
  return {
    displayWidth: Math.max(1, Math.round(naturalSize.width / pixelRatio)),
    displayHeight: Math.max(1, Math.round(naturalSize.height / pixelRatio)),
  };
}

function readImageNaturalSize(src: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      resolve(width > 0 && height > 0 ? { width, height } : undefined);
    };
    image.onerror = () => resolve(undefined);
    image.src = src;
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
    <WorkbenchShell
      v-if="!isMobileBlocked"
      title="Mini Desk"
      slogan="Do less, do it well."
      :save-status-label="workspaceDensityLabel"
      :theme="state.theme"
      @theme="handleThemeClick"
      @dragover.prevent
      @drop.prevent="handleBoardDrop"
    >
      <template #status>
        <span
          class="save-status"
          data-testid="save-status"
          :data-state="workspaceDensityStatus"
          :aria-label="workspaceDensityLabel"
          :title="workspaceDensityLabel"
          aria-live="polite"
          role="button"
          tabindex="0"
          @click="showSaveStatusTip($event.currentTarget as HTMLElement)"
          @keydown.enter.prevent="showSaveStatusTip($event.currentTarget as HTMLElement)"
          @keydown.space.prevent="showSaveStatusTip($event.currentTarget as HTMLElement)"
        >
          <span class="save-status-label">{{ workspaceDensityLabel }}</span>
        </span>
      </template>

      <template #actions>
        <SettingsMenu
          :app-version="settingsAppVersion"
          :update-available="versionPromptVisible"
          :companion-gif-theme="state.companionGifTheme"
          :custom-companion-gif="state.customCompanionGif"
          :has-custom-companion-gif="Boolean(state.customCompanionGif.light || state.customCompanionGif.dark || state.customCompanionGifStored.light || state.customCompanionGifStored.dark)"
          :language="state.language"
          @export="exportData"
          @import="requestImport"
          @clear-data="clearData"
          @about="about"
          @suggest="suggestIssue"
          @shortcut-help="shortcutHelpVisible = true"
          @update="updateStaticVersion"
          @language="updateLanguage"
          @gif-theme="updateCompanionGifTheme"
          @custom-gif="updateCustomCompanionGif"
          @guide="handleGuideClick"
        />
      </template>

      <template #assets>
        <ImagePanel
          :title="titles['image-title']"
          :images="state.images"
          :active-preview-id="activePreviewId"
          :paste-feedback="pasteFeedback"
          :language="state.language"
          @title-update="updateTitle"
          @preview="openImagePreview"
          @close-preview="closeImagePreview"
          @copy="copyImage"
          @edit="openImageEditor"
          @delete="deleteImage"
          @reorder="reorderImages"
          @move-to-bottom="moveImageToBottom"
          @paste="pasteImageFromClipboard"
          @drop-files="addImageFiles"
          @guide="handleGuideClick"
        />
      </template>

      <template #notes>
        <QuickButtons
          :title="titles['quick-title']"
          :tags="state.quickTags"
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
          @reorder-tag="reorderQuickTags"
          @move-to-tag="moveQuickButtonToTag"
          @save-tag="saveQuickTag"
          @delete-tag="deleteQuickTag"
          @guide="handleGuideClick"
          @declutter="showQuickDeclutterBubble"
        />
      </template>

      <template #tasks>
        <TodoPanel
          :todo-lists="displayTodoLists"
          :edit-list-id="pendingEditTodoListId"
          :notification-flash-keys="notificationFlashKeys"
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
          @declutter="showDeclutterBubble"
        />
      </template>

      <template #workspace>
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
      </template>
    </WorkbenchShell>

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
      v-if="!isMobileBlocked && displayedPreviewId"
      :images="state.images"
      :active-id="displayedPreviewId"
      :edit-id="activeEditorId"
      :closing="imagePreviewClosing"
      :language="state.language"
      @close="clearImagePreview"
      @copy="copyImage"
      @paste="pasteImageFromClipboard"
      @delete="deleteImage"
      @navigate="navigatePreview"
      @reorder="reorderImages"
      @move-to-bottom="moveImageToBottom"
      @tips="showPreviewTips"
      @save-edit="saveEditedImage"
    />

    <CompanionBubble
      :visible="activeCompanionVisible"
      :message="activeCompanionMessage"
      :link-text="isMobileBlocked ? undefined : bubbleLink?.text"
      :link-href="isMobileBlocked ? undefined : bubbleLink?.href"
      :signature-text="isMobileBlocked ? undefined : bubbleSignature"
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
      @gif-theme-change="(theme: string) => updateCompanionGifTheme(theme as CompanionGifTheme)"
    />
    <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importData" />
    <ShortcutHelp v-if="shortcutHelpVisible" :show="shortcutHelpVisible" :language="state.language" @close="shortcutHelpVisible = false" />
  </NConfigProvider>
</template>

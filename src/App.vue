<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { MoonOutline, SunnyOutline } from "@vicons/ionicons5";
import { darkTheme, dateEnUS, dateZhCN, enUS, NButton, NConfigProvider, NGlobalStyle, NIcon, NInput, NModal, zhCN } from "naive-ui";
import CompanionBubble from "./components/CompanionBubble.vue";
import ImagePanel from "./components/ImagePanel.vue";
import MobileInboxCapture from "./components/MobileInboxCapture.vue";
import QuickButtons from "./components/QuickButtons.vue";
import SettingsMenu from "./components/SettingsMenu.vue";
import SpacePanel from "./components/SpacePanel.vue";
import TodoPanel from "./components/TodoPanel.vue";
import WorkbenchShell from "./components/WorkbenchShell.vue";
import WorkspaceSwitcher from "./components/WorkspaceSwitcher.vue";
import miniDeskLogo from "../static/img/mini-desk-cat.png?url";
import miniDeskDarkLogo from "../static/img/mini-desk-cat-dark.png?url";
import { getCompanionGifSrc, getCompanionNotificationIconSrc } from "./state/companionGifThemes";
import {
  deleteImageDatabases,
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
  assignTodoListColumn,
  clearCompleted,
  completeTodo,
  distributeTodoListColumns,
  moveTodo as moveTodoInMap,
  removeEmptyTodo,
  removeTodo as removeTodoFromMap,
  removeTodoListData,
  setTodoNotifyAt,
  splitTodo as splitTodoInMap,
  starTodo,
  todoKey,
  updateTodoText,
} from "./state/todos";
import { DEFAULT_BOARD_TITLE, defaultState, STORAGE_KEY } from "./state/defaults";
import { applyThemeColor } from "./state/theme-color";
import { createWorkspaceData, ensureUniqueWorkspaceTitle, getWorkspaceBoardTitle, projectLegacySpaceLines, removeWorkspace, reorderWorkspaces } from "./state/workspaces";
import * as workspaceMover from "./state/workspaceMoves";
import { QUICK_BUTTON_OTHER_GROUP_ID, QUICK_DENSITY_THRESHOLD, formatQuickCopiedPreview, getQuickTagColor } from "./state/quickButtons";
import { isQuickAppScheme } from "./state/quickApps";
import { INBOX_FOCUS_THROTTLE_MS, INBOX_PULL_INTERVAL_MS } from "./sync/config";
import {
  clearRememberedInboxCode,
  formatInboxCode,
  importedPayloadHasInbox,
  isValidInboxCode,
  loadRememberedInboxCode,
  normalizeInboxCode,
  parseInboxFragment,
  saveRememberedInboxCode,
} from "./sync/pairing";
import { applyInboxItems, pullAllInboxes } from "./sync/pull";
import { inboxKeyHash } from "./sync/crypto";
import { revokeInboxKey } from "./sync/inboxClient";
import { copyTextWithBrowserCommand } from "./utils/clipboard";
import { extractRetainedImageIds, useUndoHistory } from "./composables/useUndoHistory";
import { useTodoNotifications } from "./composables/useTodoNotifications";
import { useCompanionBubble } from "./composables/useCompanionBubble";
import { useBoardPersistence } from "./composables/useBoardPersistence";
import { useAppVersionCheck } from "./composables/useAppVersionCheck";
import type { NotifiableTodo } from "./composables/useTodoNotifications";
import {
  createId,
  exportUndoSnapshotState,
  getSerializableWorkspace,
  loadState,
  normalizeImportedState,
  normalizeWorkspaceData,
  saveStateWithConflictCheck,
} from "./state/storage";
import type { ImagePlacementHint, ImageReplacementHint, SaveScope } from "./state/storage";
import type { AppLanguage, BoardState, CompanionGifTheme, DraggedTodo, GuideKey, ImagePasteFeedback, ImagePasteRequest, LineItem, QuickApiBodyType, QuickApiHeader, QuickApiMethod, QuickButton, QuickButtonType, StoredImage, TodoItem, TodoListConfig, TodoListId, TodoPeriod, TodoStarChange, WorkspaceData, WorkspaceInbox, WorkspaceMoveTarget, WorkspaceSpace, ZoneKey } from "./types";

const ImagePreview = defineAsyncComponent(() => import("./components/ImagePreview.vue"));
const ShortcutHelp = defineAsyncComponent(() => import("./components/ShortcutHelp.vue"));
const SupportAuthor = defineAsyncComponent(() => import("./components/SupportAuthor.vue"));
const VersionHistory = defineAsyncComponent(() => import("./components/VersionHistory.vue"));
// 配对弹窗含 qrcode 依赖，异步加载避免二维码库进主包；v-if + :key 用法与同步组件一致。
const WorkspaceInboxDialog = defineAsyncComponent(() => import("./components/WorkspaceInboxDialog.vue"));

const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";
const IMAGE_DELETE_GRACE_MS = 5000;
const IMAGE_PREVIEW_CLOSE_MS = 220;
const IMAGE_DENSITY_THRESHOLD = 10;
const TODO_DENSITY_THRESHOLD = 7;
// Consecutive-delete confirmation: the first TODO_DELETE_CONFIRM_MAX deletes in
// a streak each ask for confirmation; once the streak exceeds that (and stays
// within TODO_DELETE_STREAK_RESET_MS between deletes) the rest delete directly.
const TODO_DELETE_CONFIRM_MAX = 2;
const TODO_DELETE_STREAK_RESET_MS = 30_000;
const WORKSPACE_DENSITY_GROUP_TIP_CHANCE = 0.5;
const STATE_SYNC_CHANNEL = "mini-desk-state-sync";
const mobileCompanionPosition: { right: string; bottom: string } = { right: "18px", bottom: "28px" };

function getInitialMobileBlocked(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}

const state = reactive<BoardState>(loadState());
const activeWorkspace = computed<WorkspaceData>(
  () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0],
);
/** 右键「移动到空间」子菜单的目标（已排除当前空间；标题与切换器一致）。 */
const workspaceMoveTargets = computed<WorkspaceMoveTarget[]>(() =>
  state.workspaces
    .filter((workspace) => workspace.id !== state.activeWorkspaceId)
    .map((workspace) => ({
      id: workspace.id,
      title: getWorkspaceBoardTitle(workspace),
      lists: workspace.todoLists.map((list) => ({ id: list.id, title: getDisplayTodoListTitle(list, state.language) })),
    })),
);
const syncClientId = createId();
const {
  undoSnapshots,
  lastUndoSnapshot,
  recordUndoCheckpoint,
  createUndoSnapshot,
  undoLastBoardChange,
  resetHistory: resetUndoHistory,
  isRestoring: isUndoRestoring,
} = useUndoHistory(state, {
  isMounted: () => appMounted,
  cancelPendingEdits: () => {
    window.clearTimeout(textSaveTimer.value);
    textSaveTimer.value = undefined;
    flushTodoSave();
    emptyTodoRemovalTimers.forEach((timer) => window.clearTimeout(timer));
    emptyTodoRemovalTimers.clear();
  },
  clearTransientUi: () => {
    clearImagePreview();
    pendingEditSpaceId.value = null;
    pendingEditTodoListId.value = null;
  },
  persistAfterRestore: () => {
    resetTextGenerationBaseline();
    persistNow();
  },
});

const {
  saveStatus,
  textSaveTimer,
  todoSaveTimer,
  scheduleTextSave,
  scheduleTodoSave,
  flushTodoSave,
  flushTextSave,
  resetTextGenerationBaseline,
  bumpTextGeneration,
  persistPendingText,
  persistNow,
  markDirty,
  markSaving,
  markSavedNow,
  markSavedSoon,
  hasUnsavedLocalChanges,
  hasPendingEdits,
  clearTimers: clearPersistenceTimers,
} = useBoardPersistence({
  state,
  clientId: syncClientId,
  onBeforeSave: recordUndoCheckpoint,
  onConflict: () => showToast("stateConflict"),
  onMerged: (savedImages) => {
    activeWorkspace.value.images = mergeVisibleImages(savedImages as StoredImage[], activeWorkspace.value.images);
  },
  onSaved: broadcastStateSaved,
  scheduleImagePayloadPrune,
  showSaveBubble,
});

const {
  appVersion,
  availableAppVersion,
  versionPromptVisible,
  checkAppVersion,
  checkLatestAppVersion,
  updateStaticVersion,
  startPolling: startVersionPolling,
  clearTimers: clearVersionTimers,
} = useAppVersionCheck(() => appMounted);

const {
  notificationFlashKeys,
  notificationTitleFlashing,
  prepareTodoNotifications,
  refreshTodoNotifications,
  scheduleNextTodoNotification,
  fireNativeTodoNotification,
  startNotificationTitleFlash,
  queueTodoNotificationFlash,
  handleNotificationReturn,
  startFallbackInterval: startNotificationFallbackInterval,
  clearTimers: clearNotificationTimers,
} = useTodoNotifications(state, {
  isMounted: () => appMounted,
  boardTitle: () => boardTitle.value,
  isBoardBlocked: shouldBlockBoardEffects,
  hasPendingConfirm: () => Boolean(pendingConfirm.value),
  showCrossWorkspacePrompt: showCrossWorkspaceReminderPrompt,
});

const {
  bubbleMessage,
  bubbleLink,
  bubbleSignature,
  bubbleVisible,
  companionFocused,
  companionPosition,
  pendingConfirm,
  bubbleClearSignal,
  showBubble,
  showBubbleText,
  hideBubbleMessage,
  pauseBubbleTimer,
  resumeBubbleTimer,
  requestConfirmation,
  confirmCompanionAction,
  secondaryCompanionAction,
  cancelCompanionAction,
  clearPendingConfirm,
  getCompanionPosition,
  setBubbleExpiredHandler,
  setHostHideCompanion,
  clearTimers: clearBubbleTimers,
} = useCompanionBubble({
  state,
  setActiveGuideKey: (key) => { activeGuideKey.value = key; },
  confirmLabels: () => ({ yes: uiText.value.common.yes, no: uiText.value.common.no }),
  isBoardBlocked: shouldBlockBoardEffects,
  isMobileLayout,
});
setBubbleExpiredHandler((options) => {
  if (options.guideKey) activeGuideKey.value = null;
});
setHostHideCompanion(() => {
  hideBubbleMessage();
  companionFocused.value = false;
  activeGuideKey.value = null;
});
// Bumped after "clear data" so the whole workbench shell remounts and its
// entrance choreography (command bar settles, zones rise left→right) replays —
// the same animation as a fresh page load.
const boardEpoch = ref(0);
const activePreviewId = ref<string | undefined>();
const pasteFeedback = ref<ImagePasteFeedback | undefined>();
const closingPreviewId = ref<string | undefined>();
const previewCloseTimer = ref<number | undefined>();
const activeEditorId = ref<string | undefined>();
const importInput = ref<HTMLInputElement | null>(null);
const importFeedbackAnchor = ref<HTMLElement | undefined>();
const pendingEditSpaceId = ref<string | null>(null);
const pendingEditTodoListId = ref<string | null>(null);
const workspaceDialogVisible = ref(false);
const workspaceDialogMode = ref<"create" | "rename">("create");
const workspaceDialogId = ref<string | null>(null);
const workspaceDraftTitle = ref("");
const workspaceDraftSlogan = ref("");
const inboxPairingWorkspaceId = ref<string | null>(null);
const inboxPairTarget = computed(() => state.workspaces.find((workspace) => workspace.id === inboxPairingWorkspaceId.value) ?? null);
const imagePayloadPruneTimer = ref<number | undefined>();
const emptyTodoRemovalTimers = new Map<string, number>();
const pendingImagePayloadDeletions = new Map<string, number>();
const shortcutHelpVisible = ref(false);
const supportDialogVisible = ref(false);
const changelogVisible = ref(false);
const isMobileBlocked = ref(getInitialMobileBlocked());
const mobileMediaQuery = ref<MediaQueryList | null>(null);
// URL 带 #inbox=<12位码> 时优先；否则回退手机壳本地记忆（主屏图标/微信入口丢 fragment 的场景）。
const mobileInboxCode = ref<string | null>(parseInboxFragment(window.location.hash) ?? loadRememberedInboxCode());
const mobileInboxDraftCode = ref("");
const mobileInboxCodeError = ref(false);
// 手机速记草稿上提：换码卸载重挂（甚至跨会话内的多次换码）内容不丢。
const mobileInboxDraftText = ref("");
// 手机壳内任何来源（初始 URL 解析/hashchange/手动输码）的有效码都顺手记住，裸访问下次自动配对；
// 桌面端不写（不产生手机记忆副作用）。immediate 覆盖初始 fragment 场景，重复写入幂等。
watch(
  [mobileInboxCode, isMobileBlocked],
  ([code, blocked]) => {
    if (blocked && code) saveRememberedInboxCode(code);
  },
  { immediate: true },
);
let appMounted = false;
let pendingBrowserImagePasteRequest: { request: ImagePasteRequest; token: number } | undefined;
let browserImagePasteRequestToken = 0;
let pasteFeedbackToken = 0;
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
const SUGGEST_EMAIL = "xiang9872@gmail.com";
const GITHUB_REPO_URL = "https://github.com/xiangjianan/mini-desk";
const GITHUB_REPO_LABEL = "xiangjianan / mini-desk";
const ABOUT_MESSAGE_DURATION_MS = 10000;
const activeGuideKey = ref<GuideKey | null>(null);

const naiveTheme = computed(() => (state.theme === "dark" ? darkTheme : null));
const naiveLocale = computed(() => (state.language === "en" ? enUS : zhCN));
const naiveDateLocale = computed(() => (state.language === "en" ? dateEnUS : dateZhCN));
const uiText = computed(() => getUiText(state.language));
const companionVisible = computed(() => companionFocused.value || bubbleVisible.value);
const activeCompanionVisible = computed(() => (isMobileBlocked.value && mobileInboxCode.value === null) || companionVisible.value);
const activeCompanionMessage = computed(() => (isMobileBlocked.value ? uiText.value.app.mobileMessage : bubbleMessage.value));
const activeCompanionPosition = computed(() => (isMobileBlocked.value ? mobileCompanionPosition : companionPosition.value));
const displayedPreviewId = computed(() => activePreviewId.value ?? closingPreviewId.value);
const imagePreviewClosing = computed(() => Boolean(closingPreviewId.value) && !activePreviewId.value);
const settingsAppVersion = computed(() => (versionPromptVisible.value ? availableAppVersion.value : appVersion.value));
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

const boardTitle = computed(() => getWorkspaceBoardTitle(activeWorkspace.value));
const boardSlogan = computed(() => activeWorkspace.value.customTitles["board-slogan"]?.trim() ?? "");
const notificationDocumentTitle = computed(() => `${uiText.value.app.notificationTitle} · ${boardTitle.value}`);
const titles = computed(() =>
  Object.fromEntries(
    Object.entries(getDefaultTitles(state.language)).map(([id, title]) => [id, activeWorkspace.value.customTitles[id] || title]),
  ) as Record<string, string>,
);
const displayTodoLists = computed<TodoListConfig[]>(() =>
  activeWorkspace.value.todoLists.map((list) => ({
    ...list,
    title: getDisplayTodoListTitle(list, state.language),
  })),
);
const displaySpaces = computed<WorkspaceSpace[]>(() =>
  activeWorkspace.value.spaces.map((space) => ({
    ...space,
    title: getDisplaySpaceTitle(space, state.language),
  })),
);

function updateMobileBlocked(source?: MediaQueryList | MediaQueryListEvent): void {
  const matches = Boolean(source?.matches ?? mobileMediaQuery.value?.matches);
  const wasMobileBlocked = isMobileBlocked.value;
  if (matches && !wasMobileBlocked) {
    clearImagePreview();
    if (textSaveTimer.value !== undefined || todoSaveTimer.value !== undefined) {
      flushTodoSave();
      flushTextSave();
    }
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

function handleHashChange(): void {
  // 仅在有合法码时跟进：清掉 fragment 不退出速记页，避免误触返回键丢失入口。
  const code = parseInboxFragment(window.location.hash);
  if (code) mobileInboxCode.value = code;
}

function confirmMobileInboxCode(): void {
  const code = normalizeInboxCode(mobileInboxDraftCode.value);
  if (!isValidInboxCode(code)) {
    // 移动壳上 showBubbleText 被 shouldBlockBoardEffects 拦截，提示就近显示在输码区。
    mobileInboxCodeError.value = true;
    return;
  }
  mobileInboxCodeError.value = false;
  mobileInboxCode.value = code;
  mobileInboxDraftCode.value = "";
  // 写回 fragment：刷新/再次打开仍停留在速记页。
  window.location.hash = `#inbox=${code}`;
}

/** 更换配对码：清本地记忆与 URL 残留 fragment（replaceState 不触发 hashchange，也不留历史记录），回到输码表单并重置错误态。
 *  不弹确认——没有可破坏的数据，码随时可从桌面配对面板重新获得。 */
function forgetMobileInboxCode(): void {
  clearRememberedInboxCode();
  mobileInboxCode.value = null;
  mobileInboxCodeError.value = false;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

/** 页脚分组码：模板内 vue-tsc 不跨元素收窄 string|null，挪进 computed（同 MobileInboxCapture.sentText 模式）。 */
const mobileInboxCodeLabel = computed(() => {
  const code = mobileInboxCode.value;
  return code === null ? "" : uiText.value.app.mobileInboxPairedAs.replace("{code}", () => formatInboxCode(code));
});

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
  document.title = boardTitle.value;
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
  const inlineImagePayloads: (StoredImage & { src: string })[] = [];
  for (const workspace of state.workspaces) {
    for (const image of workspace.images) {
      if (image.src) inlineImagePayloads.push(image as StoredImage & { src: string });
    }
  }
  // One-time legacy migration still walks every workspace (inline payloads must
  // reach IndexedDB before any src is dropped), but runtime hydration below only
  // needs the active workspace — inactive ones hydrate lazily on switch.
  await persistImagePayloads(inlineImagePayloads);
  const startupWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0];
  if (startupWorkspace) {
    startupWorkspace.images = await hydrateStoredImages(startupWorkspace.images, { persistLegacyPayloads: true });
  }
  releaseInactiveWorkspaceImages(state.activeWorkspaceId);
  if (!appMounted) return;
  checkAppVersion();
  void checkLatestAppVersion();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("focus", handleNotificationReturn);
  window.addEventListener("storage", handleStorageEvent);
  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("paste", handlePaste);
  document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
  setupStateSyncChannel();
  window.addEventListener("focus", handleWindowFocusInbox);
  window.addEventListener("hashchange", handleHashChange);
  // 启动拉取非阻塞（不 await）：首屏渲染不等收件箱网络往返。
  if (hasInboxConfigured.value) {
    void pullInboxes();
    startInboxPolling();
  }
  startVersionPolling();
  startNotificationFallbackInterval();
  refreshTodoNotifications();
});

onUnmounted(() => {
  appMounted = false;
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("focus", handleNotificationReturn);
  window.removeEventListener("storage", handleStorageEvent);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  document.removeEventListener("paste", handlePaste);
  document.removeEventListener("visibilitychange", handleDocumentVisibilityChange);
  teardownStateSyncChannel();
  window.removeEventListener("focus", handleWindowFocusInbox);
  window.removeEventListener("hashchange", handleHashChange);
  stopInboxPolling();
  teardownMobileBreakpoint();
  clearTimers();
});

// Closing the tab mid-debounce would drop the last second of todo/line edits;
// flush synchronously before the page goes away.
function handleBeforeUnload(): void {
  if (!hasPendingEdits()) return;
  flushTodoSave();
  flushTextSave();
}

watch(
  () => state.theme,
  () => {
    applyTheme();
    persistNow();
  },
);

watch(boardTitle, (value) => {
  if (!notificationTitleFlashing()) document.title = value;
});

const todoColumnCount = ref(1);
// distributionKey dedupes the auto-distribute watcher so it only re-runs when
// the workspace, column count, or list count actually changes (not every tick).
const distributionKey = ref("");

// Auto-distribute todo lists across columns while the layout is not yet manual.
// Re-runs only when the active workspace, measured column count, or list count
// changes (distributionKey dedupes). Once `todoLayoutManual` is true this is a
// no-op — assignments are frozen and only changed by explicit drag reordering.
watch(
  () => [state.activeWorkspaceId, todoColumnCount.value, activeWorkspace.value.todoLists.length],
  () => {
    if (activeWorkspace.value.todoLayoutManual) return;
    // Single column ⇒ nothing to distribute (every list is column 0; narrower
    // windows just clamp the display). Skipping here also avoids a pointless
    // persist that would race with async image-sync handling.
    if (todoColumnCount.value <= 1) return;
    const key = `${state.activeWorkspaceId}:${todoColumnCount.value}:${activeWorkspace.value.todoLists.length}`;
    if (key === distributionKey.value) return;
    distributionKey.value = key;
    activeWorkspace.value.todoLists = distributeTodoListColumns(
      activeWorkspace.value.todoLists,
      todoColumnCount.value,
    );
    persistNow();
  },
);

function updateTitle(id: string, value: string): void {
  const title = value.trim();
  if (title) activeWorkspace.value.customTitles[id] = title;
  else delete activeWorkspace.value.customTitles[id];
  persistNow();
}

function updateLanguage(language: AppLanguage): void {
  const next = normalizeLanguage(language);
  if (state.language === next) return;
  state.language = next;
  persistNow();
}

function toggleWorkspaceZone(workspaceId: string, zone: ZoneKey): void {
  state.workspaces = state.workspaces.map((workspace) =>
    workspace.id === workspaceId
      ? { ...workspace, zoneVisibility: { ...workspace.zoneVisibility, [zone]: !workspace.zoneVisibility[zone] } }
      : workspace,
  );
  persistNow();
}

function updateLines(key: "noteLines" | "workspaceLines" | "storageLines", lines: LineItem[]): void {
  activeWorkspace.value[key] = lines;
  bumpTextGeneration();
  markDirty();
  scheduleTextSave();
}

function updateSpaceLines(id: string, lines: LineItem[]): void {
  const space = activeWorkspace.value.spaces.find((item) => item.id === id);
  if (!space) return;
  space.lines = lines;
  bumpTextGeneration();
  syncLegacySpaceLines();
  markDirty();
  scheduleTextSave();
}

function activateSpace(id: string): void {
  if (!activeWorkspace.value.spaces.some((space) => space.id === id)) return;
  activeWorkspace.value.activeSpaceId = id;
  persistNow();
}

function createSpace(): void {
  const id = createId();
  activeWorkspace.value.spaces.push({
    id,
    title: nextSpaceTitle(),
    lines: [],
  });
  activeWorkspace.value.activeSpaceId = id;
  pendingEditSpaceId.value = id;
  syncLegacySpaceLines();
  persistNow();
}

function renameSpace(id: string, title: string): void {
  const space = activeWorkspace.value.spaces.find((item) => item.id === id);
  if (!space) return;
  space.title = getStoredSpaceTitle(id, title) || space.title;
  if (pendingEditSpaceId.value === id) pendingEditSpaceId.value = null;
  persistNow();
}

function finishSpaceEdit(id: string): void {
  if (pendingEditSpaceId.value === id) pendingEditSpaceId.value = null;
}

function deleteSpace(id: string): void {
  if (activeWorkspace.value.spaces.length <= 1) {
    showBubbleText(uiText.value.app.keepOneSpace);
    return;
  }
  const anchor = getSpacePanelAnchor();
  requestConfirmation("confirmDeleteSpace", anchor, () => {
    const index = activeWorkspace.value.spaces.findIndex((space) => space.id === id);
    if (index < 0 || activeWorkspace.value.spaces.length <= 1) return;
    activeWorkspace.value.spaces.splice(index, 1);
    if (activeWorkspace.value.activeSpaceId === id) {
      activeWorkspace.value.activeSpaceId = activeWorkspace.value.spaces[Math.max(0, index - 1)]?.id ?? activeWorkspace.value.spaces[0].id;
    }
    syncLegacySpaceLines();
    persistNow();
    showBubble("deleteSpace", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.app.deleteSpace, cancelText: uiText.value.common.cancel });
}

function reorderSpaces(dragId: string, targetId: string): void {
  moveItem(activeWorkspace.value.spaces, dragId, targetId);
  syncLegacySpaceLines();
  persistNow();
}

function applyWorkspaceMove(next: WorkspaceData[]): void {
  if (next === state.workspaces) return;
  state.workspaces = next;
  persistNow();
}

function moveQuickButtonAcrossWorkspaces(buttonId: string, workspaceId: string): void {
  applyWorkspaceMove(workspaceMover.moveQuickButtonToWorkspace(state.workspaces, state.activeWorkspaceId, buttonId, workspaceId));
}

function moveQuickTagAcrossWorkspaces(tagId: string, workspaceId: string): void {
  applyWorkspaceMove(workspaceMover.moveQuickTagToWorkspace(state.workspaces, state.activeWorkspaceId, tagId, workspaceId));
}

function moveTodoListAcrossWorkspaces(listId: TodoListId, workspaceId: string): void {
  if (displayTodoLists.value.length <= 1) {
    showBubbleText(uiText.value.app.keepOneTodoList);
    return;
  }
  applyWorkspaceMove(workspaceMover.moveTodoListToWorkspace(state.workspaces, state.activeWorkspaceId, listId, workspaceId));
}

// TodoPeriod ≡ TodoListId：period 即该提醒所属源列表的键，位置上直接转发。
function moveTodoAcrossWorkspaces(period: TodoPeriod, todoId: string, workspaceId: string, listId: TodoListId): void {
  applyWorkspaceMove(workspaceMover.moveTodoToWorkspace(state.workspaces, state.activeWorkspaceId, period, todoId, workspaceId, listId));
}

function moveSpaceAcrossWorkspaces(spaceId: string, workspaceId: string): void {
  if (activeWorkspace.value.spaces.length <= 1) {
    showBubbleText(uiText.value.app.keepOneSpace);
    return;
  }
  const next = workspaceMover.moveSpaceToWorkspace(state.workspaces, state.activeWorkspaceId, spaceId, workspaceId);
  if (next === state.workspaces) return;
  if (pendingEditSpaceId.value === spaceId) pendingEditSpaceId.value = null;
  state.workspaces = next;
  syncLegacySpaceLines();
  persistNow();
}

function workspaceCreatedMessage(): string {
  return state.language === "en" ? "Workspace created (｡•̀ᴗ-)✧" : "已新建空间 (｡•̀ᴗ-)✧";
}

function createWorkspace(title: string, slogan: string): void {
  const workspace = ensureUniqueWorkspaceTitle(createWorkspaceData(title, slogan, Date.now()), state.workspaces, DEFAULT_BOARD_TITLE);
  state.workspaces = [...state.workspaces, workspace];
  state.activeWorkspaceId = workspace.id;
  pendingEditSpaceId.value = null;
  pendingEditTodoListId.value = null;
  clearImagePreview();
  persistNow();
  showBubbleText(workspaceCreatedMessage());
}

async function switchWorkspace(id: string): Promise<void> {
  if (!state.workspaces.some((workspace) => workspace.id === id) || state.activeWorkspaceId === id) return;
  if (hasPendingEdits()) {
    flushTodoSave();
    flushTextSave();
  }
  const target = state.workspaces.find((workspace) => workspace.id === id);
  if (target) {
    // Hydrate the target workspace's image payloads before it becomes visible.
    // Cross-tab sync / undo / conflict resolution only hydrate the active workspace,
    // so an inactive workspace may carry src-less metadata until switched to.
    target.images = await hydrateStoredImages(target.images);
  }
  state.activeWorkspaceId = id;
  // Free the previous workspace's hydrated payload strings; its metadata stays
  // and rehydrates on next switch. Keeps memory at O(active) instead of O(all).
  releaseInactiveWorkspaceImages(id);
  pendingEditSpaceId.value = null;
  pendingEditTodoListId.value = null;
  clearImagePreview();
  persistNow();
}

/** Drop in-memory data URLs of every workspace except `keepActiveId`. */
function releaseInactiveWorkspaceImages(keepActiveId: string): void {
  for (const workspace of state.workspaces) {
    if (workspace.id === keepActiveId) continue;
    if (!workspace.images.some((image) => image.src)) continue;
    workspace.images = workspace.images.map((image) => ({ ...image, src: undefined }));
  }
}

function openCreateWorkspace(): void {
  workspaceDialogMode.value = "create";
  workspaceDialogId.value = null;
  workspaceDraftTitle.value = "";
  workspaceDraftSlogan.value = "";
  workspaceDialogVisible.value = true;
}

function renameWorkspace(id: string, title: string, slogan: string): void {
  workspaceDialogMode.value = "rename";
  workspaceDialogId.value = id;
  // The title is always displayed (falling back to the brand default), so the
  // dialog mirrors that. The slogan, though, is optional: leave it blank when
  // unset instead of surfacing the default tagline as if the user typed it.
  workspaceDraftTitle.value = title.trim() || DEFAULT_BOARD_TITLE;
  workspaceDraftSlogan.value = slogan.trim();
  workspaceDialogVisible.value = true;
}

function confirmWorkspaceDialog(): void {
  const title = workspaceDraftTitle.value.trim();
  if (!title) return;
  if (workspaceDialogMode.value === "create") {
    createWorkspace(title, workspaceDraftSlogan.value);
  } else {
    const workspace = state.workspaces.find((item) => item.id === workspaceDialogId.value);
    if (workspace) {
      const trimmedSlogan = workspaceDraftSlogan.value.trim();
      const nextTitles: Record<string, string> = { ...workspace.customTitles, "board-title": title };
      if (trimmedSlogan) nextTitles["board-slogan"] = trimmedSlogan;
      else delete nextTitles["board-slogan"];
      workspace.customTitles = nextTitles;
      persistNow();
    }
  }
  workspaceDialogVisible.value = false;
  workspaceDialogId.value = null;
}

function slugifyTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "workspace";
  return trimmed.replace(/[\\/:*?"<>|]/g, "").slice(0, 24).trim() || "workspace";
}

function exportWorkspaceById(id: string, anchor?: HTMLElement): void {
  const workspace = state.workspaces.find((item) => item.id === id);
  if (!workspace) return;
  const serialized = getSerializableWorkspace(workspace, { includeImageData: true });
  const content = JSON.stringify({ miniDeskWorkspaceExport: true, version: 1, workspace: serialized }, null, 2);
  const title = getWorkspaceBoardTitle(workspace);
  downloadExportFile(content, `mini-desk-${slugifyTitle(title)}-${new Date().toISOString().slice(0, 10)}.json`);
  showBubble("dataExported", anchor, { hideCompanionAfter: true });
}

function exportCurrentWorkspace(anchor?: HTMLElement): void {
  exportWorkspaceById(state.activeWorkspaceId, anchor);
}

/** 配对弹窗更新/清除：按 id 不可变替换目标工作区并立即落盘。弹窗开合由弹窗自身的 close 事件驱动（轮换仅更新、不关闭）。 */
function handleInboxUpdate(inbox: WorkspaceInbox | null): void {
  const id = inboxPairingWorkspaceId.value;
  if (!id) return;
  const workspace = state.workspaces.find((item) => item.id === id);
  if (!workspace) return;
  const oldCode = workspace.inbox?.code;
  let next: WorkspaceData;
  if (inbox) {
    next = { ...workspace, inbox };
  } else {
    next = { ...workspace };
    delete next.inbox;
  }
  state.workspaces = state.workspaces.map((item) => (item.id === id ? next : item));
  persistNow();
  showBubbleText(inbox ? uiText.value.app.inboxSaved : uiText.value.app.inboxCleared, undefined, { hideCompanionAfter: true });
  // 清除或轮换（新码≠旧码）：旧码云端队列一并注销；失败不阻塞本地变更，仅气泡警告。
  if (oldCode !== undefined && (inbox === null || inbox.code !== oldCode)) {
    void revokeInbox(oldCode);
  }
}

/** 注销旧配对码：任何失败（网络/服务端/哈希异常）只提示，不抛出。 */
async function revokeInbox(oldCode: string): Promise<void> {
  try {
    const ok = await revokeInboxKey(await inboxKeyHash(oldCode));
    if (!ok) showBubbleText(uiText.value.app.inboxRevokeFailed, undefined, { hideCompanionAfter: true });
  } catch {
    showBubbleText(uiText.value.app.inboxRevokeFailed, undefined, { hideCompanionAfter: true });
  }
}

// 手机速记拉取（单向收件箱）：启动/窗口聚焦（节流）/定时/Ctrl+S 四个触发点共用 pullInboxes，
// in-flight 守卫串行化并发快照（pullAllInboxes 契约要求，否则并发合并会以新 ID 重复导入）。
let inboxPullTimer: number | undefined;
let inboxLastPullAt = 0;
let inboxPullInFlight = false;
// 轮询跟随当前活动空间：只有停在配置过配对码的空间才拉取；
// 切到未配对空间时定时/聚焦/启动/Ctrl+S 全部静默，不发任何请求。
const hasInboxConfigured = computed(() => activeWorkspace.value.inbox !== undefined);

async function pullInboxes(): Promise<void> {
  if (!appMounted || inboxPullInFlight || !hasInboxConfigured.value) return;
  inboxPullInFlight = true;
  inboxLastPullAt = Date.now();
  try {
    const { patches, reports, changed } = await pullAllInboxes(state.workspaces);
    if (!appMounted) return;
    // 水位线单调门控：拉取在途期间，跨标签页广播采纳（applyExternalStoredState 整体覆盖）
    // 或同名导入覆盖都可能已把同批条目合入并推进水位线。补丁水位线未严格领先即说明本批
    // 已被应用过，重放会以新 ID 重复导入同文本——先按当前活对象过滤，只保留仍严格领先的补丁。
    const applicable = patches.filter((patch) => {
      const workspace = state.workspaces.find((item) => item.id === patch.workspaceId);
      return workspace?.inbox !== undefined && patch.lastSeenAt > workspace.inbox.lastSeenAt;
    });
    // 补丁全部失配（工作区已删/配对已清/水位线已被采纳或导入推进）：无落点或本批已应用过，
    // 直接返回，跳过空转的整组替换与持久化，也不弹「收到 N 条」。
    if (!changed || applicable.length === 0) return;
    // 补丁重放：在 await 之后的同一同步块内对当前活对象合并，读-合-写之间零宏任务间隙，
    // 用户在途编辑（同对象字段替换，不换数组身份）无法插入，也就不会被旧快照覆盖。
    // 结构性变更天然安全：工作区已删则按 id 查无目标自然跳过；配对已清除则不在 applicable 中。
    state.workspaces = state.workspaces.map((workspace) => {
      const patch = applicable.find((candidate) => candidate.workspaceId === workspace.id);
      return patch ? applyInboxItems(workspace, patch.plains, patch.lastSeenAt) : workspace;
    });
    persistNow();
    for (const report of reports) {
      // 被门控跳过的补丁不提示：跨标签页场景条目实际由另一标签页应用，两边各弹一次会误导。
      if (!applicable.some((patch) => patch.workspaceId === report.workspaceId)) continue;
      const workspace = state.workspaces.find((item) => item.id === report.workspaceId);
      if (!workspace) continue;
      showBubbleText(
        uiText.value.app.inboxReceived.replace("{count}", () => String(report.imported)).replace("{title}", () => getWorkspaceBoardTitle(workspace)),
        undefined,
        { hideCompanionAfter: true },
      );
    }
  } finally {
    inboxPullInFlight = false;
  }
}

function startInboxPolling(): void {
  if (inboxPullTimer !== undefined) return;
  inboxPullTimer = window.setInterval(() => {
    void pullInboxes();
  }, INBOX_PULL_INTERVAL_MS);
}

function stopInboxPolling(): void {
  if (inboxPullTimer === undefined) return;
  window.clearInterval(inboxPullTimer);
  inboxPullTimer = undefined;
}

function handleWindowFocusInbox(): void {
  if (Date.now() - inboxLastPullAt < INBOX_FOCUS_THROTTLE_MS) return;
  void pullInboxes();
}

watch(hasInboxConfigured, (configured) => {
  if (configured) startInboxPolling();
  else stopInboxPolling();
});

function deleteWorkspace(id: string, anchor?: HTMLElement): void {
  if (state.workspaces.length <= 1) {
    showBubbleText(uiText.value.app.keepOneWorkspace, anchor);
    return;
  }
  requestConfirmation(
    "confirmDeleteWorkspace",
    anchor,
    () => {
      const result = removeWorkspace(state.workspaces, state.activeWorkspaceId, id);
      if (result.workspaces === state.workspaces) return;
      state.workspaces = result.workspaces;
      state.activeWorkspaceId = result.activeWorkspaceId;
      pendingEditSpaceId.value = null;
      pendingEditTodoListId.value = null;
      clearImagePreview();
      persistNow();
      showBubble("deleteWorkspace", anchor, { hideCompanionAfter: true });
    },
    undefined,
    { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel, danger: true },
  );
}

function reorderWorkspaceSections(dragId: string, targetId: string): void {
  state.workspaces = reorderWorkspaces(state.workspaces, dragId, targetId);
  persistNow();
}

function nextSpaceTitle(): string {
  const base = uiText.value.app.newSpace;
  const titles = new Set(activeWorkspace.value.spaces.map((space) => space.title));
  if (!titles.has(base)) return base;
  let index = 2;
  while (titles.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function syncLegacySpaceLines(): void {
  const projected = projectLegacySpaceLines(activeWorkspace.value.spaces);
  activeWorkspace.value.workspaceLines = projected.workspaceLines;
  activeWorkspace.value.storageLines = projected.storageLines;
}

// Todo input saves share the text pipeline's generation baseline so a debounced
// todo edit and a debounced line edit can never overwrite each other, while the
// separate timer keeps "stop typing in todos" from delaying a pending line save
// (and vice versa).


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
  flushTodoSave();
  flushTextSave();
}

function handleCompanionBlur(): void {
  if (pendingConfirm.value) return;
  companionFocused.value = false;
  activeGuideKey.value = null;
  flushTodoSave();
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
  const nextImages = activeWorkspace.value.images.map((image) => (image.id === replacement.id ? replacement : image));
  markSaving();
  const stateWithReplacement: BoardState = {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === state.activeWorkspaceId ? { ...workspace, images: nextImages } : workspace,
    ),
  };
  const result = saveStateWithConflictCheck(stateWithReplacement, {
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
  const savedActive = result.state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? result.state.workspaces[0];
  activeWorkspace.value.images = result.status === "merged"
    ? mergeVisibleImages(savedActive?.images ?? [], nextImages)
    : nextImages;
  if (!isUndoRestoring()) {
    undoSnapshots.value = [
      ...undoSnapshots.value,
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
  markDirty();
  showToast("stateConflict");
  while (true) {
    const activeLatest = latest.workspaces.find((w) => w.id === latest.activeWorkspaceId) ?? latest.workspaces[0];
    if (activeLatest) {
      activeLatest.images = await hydrateStoredImages(activeLatest.images);
    }
    const newest = loadState();
    if (newest.sync.revision <= latest.sync.revision) break;
    latest = newest;
  }
  if (!appMounted || latest.sync.revision < state.sync.revision) return;
  if (hasPendingEdits()) {
    const active = activeWorkspace.value;
    const localTextWorkspace: WorkspaceData = {
      ...active,
      noteLines: active.noteLines.map((line) => ({ ...line })),
      spaces: active.spaces.map((space) => ({ ...space, lines: space.lines.map((line) => ({ ...line })) })),
      workspaceLines: active.workspaceLines.map((line) => ({ ...line })),
      storageLines: active.storageLines.map((line) => ({ ...line })),
    };
    Object.assign(state, latest, {
      workspaces: latest.workspaces.map((workspace) => (workspace.id === active.id ? localTextWorkspace : workspace)),
    });
    applyTheme();
    markDirty();
    void persistPendingText({ retryOnce: true });
    return;
  }
  Object.assign(state, latest);
  resetTextGenerationBaseline();
  applyTheme();
  lastUndoSnapshot.value = createUndoSnapshot();
  markSavedNow();
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

function isImagePayloadRetained(payloadId: string): boolean {
  return state.workspaces.some((workspace) =>
    workspace.images.some((image) => getImagePayloadId(image) === payloadId),
  );
}

// A deleted image's IndexedDB payload is kept for a short grace window so the user
// can undo the deletion. If the image has not come back by the time the window
// expires, the payload is reclaimed.
function scheduleImagePayloadDeletion(payloadId: string): void {
  const existing = pendingImagePayloadDeletions.get(payloadId);
  if (existing !== undefined) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    pendingImagePayloadDeletions.delete(payloadId);
    if (isImagePayloadRetained(payloadId)) return;
    void deleteStoredImage(payloadId).catch(() => {
      // Best-effort IndexedDB cleanup; the board state already dropped the image.
    });
  }, IMAGE_DELETE_GRACE_MS);
  pendingImagePayloadDeletions.set(payloadId, timer);
}

function clearPendingImagePayloadDeletions(): void {
  pendingImagePayloadDeletions.forEach((timer) => window.clearTimeout(timer));
  pendingImagePayloadDeletions.clear();
}

function collectRetainedImagePayloadIds(): Set<string> {
  const retained = new Set<string>();
  for (const workspace of state.workspaces) {
    for (const image of workspace.images) retained.add(getImagePayloadId(image));
  }
  // Snapshots carry pre-extracted payload-id sets, so retention checks no longer
  // re-parse every historical snapshot string on each save.
  for (const snapshot of undoSnapshots.value) {
    snapshot.retainedImageIds.forEach((id) => retained.add(id));
  }
  lastUndoSnapshot.value.retainedImageIds.forEach((id) => retained.add(id));
  try {
    const authoritative = localStorage.getItem(STORAGE_KEY);
    if (authoritative) {
      extractRetainedImageIds(JSON.parse(authoritative)).forEach((id) => retained.add(id));
    }
  } catch {
    // Ignore malformed stored state without normalizing it into generated IDs.
  }
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
    const activeExternal = nextState.workspaces.find((w) => w.id === nextState.activeWorkspaceId) ?? nextState.workspaces[0];
    if (activeExternal) {
      activeExternal.images = await hydrateStoredImages(activeExternal.images);
    }
    if (!appMounted) return;
    Object.assign(state, nextState);
    resetTextGenerationBaseline();
    applyTheme();
    lastUndoSnapshot.value = createUndoSnapshot();
  } catch {
    // External storage may be mid-write or unavailable; keep this tab's current state.
  }
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

  const target = activeWorkspace.value.images.find((image) => image.id === request.targetId);
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
    const currentTarget = activeWorkspace.value.images.find((image) => image.id === request.targetId);
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
  if (!activeWorkspace.value.images.some((image) => image.id === request.targetId)) return undefined;
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
  const targetIndex = activeWorkspace.value.images.findIndex((item) => item.id === request.targetId);
  if (shouldBlockBoardEffects() || targetIndex < 0) {
    try {
      await deleteStoredImage(image);
    } catch {
      // Best-effort cleanup when the target disappears after payload storage.
    }
    return undefined;
  }
  activeWorkspace.value.images.splice(targetIndex + (request.placement === "after" ? 1 : 0), 0, image);
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

function insertStoredImage(image: StoredImage, afterId?: string): void {
  if (!afterId) {
    activeWorkspace.value.images.push(image);
    return;
  }
  const index = activeWorkspace.value.images.findIndex((item) => item.id === afterId);
  if (index < 0) {
    activeWorkspace.value.images.push(image);
    return;
  }
  activeWorkspace.value.images.splice(index + 1, 0, image);
}

async function addImageFile(
  file: File,
  options: {
    showMessage?: boolean;
    matchDisplaySizeToDevicePixelRatio?: boolean;
    insertAfterId?: string;
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
  insertStoredImage(image, options.insertAfterId);
  if (persistNow("images")) options.onPersisted?.(image);
  if (options.showMessage ?? true) showBubble("imageAdded", undefined, { hideCompanionAfter: true });
  return image;
}

async function addImageFiles(files: File[], anchor?: HTMLElement, targetId?: string): Promise<void> {
  if (shouldBlockBoardEffects()) return;
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const ignoredCount = files.length - imageFiles.length;
  if (imageFiles.length === 0) {
    showBubble("imageDropEmpty", anchor, { hideCompanionAfter: true });
    return;
  }

  const added: StoredImage[] = [];
  // When a target is supplied, chain each file after the previous insert so a
  // multi-file drop keeps its file order immediately after the target image.
  let insertAfterId = targetId;
  for (const file of imageFiles) {
    const image = await addImageFile(file, { showMessage: false, insertAfterId });
    if (shouldBlockBoardEffects()) return;
    if (image) {
      added.push(image);
      insertAfterId = image.id;
    }
  }
  if (added.length === 0) return;
  if (shouldBlockBoardEffects()) return;
  if (targetId) {
    publishPasteFeedback(added.at(-1)!.id);
  } else {
    await copyImage(added.at(-1)!.id, anchor);
  }
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
  moveItem(activeWorkspace.value.images, dragId, targetId);
  persistNow();
}

function moveImageToBottom(id: string): void {
  const index = activeWorkspace.value.images.findIndex((image) => image.id === id);
  if (index < 0 || index === activeWorkspace.value.images.length - 1) return;
  const [image] = activeWorkspace.value.images.splice(index, 1);
  activeWorkspace.value.images.push(image);
  persistNow();
}

function deleteImage(id: string, anchor?: HTMLElement): void {
  const feedbackAnchor = getImageUndoAnchor(anchor);
  requestConfirmation("confirmDeleteImage", anchor, async () => {
    const index = activeWorkspace.value.images.findIndex((image) => image.id === id);
    if (index < 0) return;
    const deletedImage = activeWorkspace.value.images[index];
    const nextPreviewImage = activeWorkspace.value.images[index + 1] ?? activeWorkspace.value.images[index - 1];
    activeWorkspace.value.images = activeWorkspace.value.images.filter((image) => image.id !== id);
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
    scheduleImagePayloadDeletion(getImagePayloadId(deletedImage));
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
  if (activeWorkspace.value.images.length > IMAGE_DENSITY_THRESHOLD) {
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
  const image = activeWorkspace.value.images.find((item) => item.id === payload.id);
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
  const currentImage = activeWorkspace.value.images.find((item) => item.id === payload.id);
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
  const image = activeWorkspace.value.images.find((item) => item.id === id);
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
    const button = activeWorkspace.value.quickButtons.find((item) => item.id === payload.id);
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
    activeWorkspace.value.quickButtons.push(button);
  }
  persistNow();
}

function resolveQuickTagId(tagTitle?: string): string | undefined {
  const title = tagTitle?.trim();
  if (!title) return undefined;
  const existing = activeWorkspace.value.quickTags.find((tag) => tag.title === title);
  if (existing) return existing.id;
  const tag = { id: createId(), title, color: getQuickTagColor(activeWorkspace.value.quickTags.length) };
  activeWorkspace.value.quickTags.push(tag);
  return tag.id;
}

function saveQuickTag(payload: { id?: string; title: string; color?: string }): void {
  const title = payload.title.trim();
  if (!title) return;
  if (!payload.id) {
    if (activeWorkspace.value.quickTags.some((tag) => tag.title === title)) return;
    const color = payload.color ?? getQuickTagColor(activeWorkspace.value.quickTags.length);
    activeWorkspace.value.quickTags.push({ id: createId(), title, color });
    persistNow();
    return;
  }

  const current = activeWorkspace.value.quickTags.find((tag) => tag.id === payload.id);
  if (!current) return;
  const duplicate = activeWorkspace.value.quickTags.find((tag) => tag.id !== payload.id && tag.title === title);
  if (duplicate) {
    moveQuickButtonsToTag(payload.id, duplicate.id);
    activeWorkspace.value.quickTags = activeWorkspace.value.quickTags.filter((tag) => tag.id !== payload.id);
  } else {
    current.title = title;
    if (payload.color) current.color = payload.color;
  }
  persistNow();
}

function toggleQuickTagCollapsed(id: string): void {
  if (id === QUICK_BUTTON_OTHER_GROUP_ID) {
    activeWorkspace.value.quickOtherCollapsed = !activeWorkspace.value.quickOtherCollapsed;
    persistNow();
    return;
  }
  const tag = activeWorkspace.value.quickTags.find((item) => item.id === id);
  if (!tag) return;
  tag.collapsed = !tag.collapsed;
  persistNow();
}

function deleteQuickTag(id: string, anchor?: HTMLElement): void {
  const tag = activeWorkspace.value.quickTags.find((item) => item.id === id);
  if (!tag) return;
  requestConfirmation("confirmDeleteQuickTag", anchor, () => {
    activeWorkspace.value.quickTags = activeWorkspace.value.quickTags.filter((item) => item.id !== id);
    moveQuickButtonsToTag(id, undefined);
    persistNow();
    showBubble("deleteQuickTag", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
}

function moveQuickButtonsToTag(fromTagId: string, toTagId: string | undefined): void {
  activeWorkspace.value.quickButtons.forEach((button) => {
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
  if (type === "app") return uiText.value.quick.untitledApp;
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
    const index = activeWorkspace.value.quickButtons.findIndex((button) => button.id === id);
    if (index < 0) return;
    activeWorkspace.value.quickButtons = activeWorkspace.value.quickButtons.filter((button) => button.id !== id);
    persistNow();
    showBubble("deleteQuick", anchor, { hideCompanionAfter: true });
  }, undefined, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
}

function toggleQuickHidden(id: string): void {
  const button = activeWorkspace.value.quickButtons.find((item) => item.id === id);
  if (!button) return;
  button.hidden = !button.hidden;
  persistNow();
}

function reorderQuickButtons(dragId: string, targetId: string): void {
  moveItem(activeWorkspace.value.quickButtons, dragId, targetId);
  persistNow();
}

function reorderQuickTags(dragId: string, targetId: string): void {
  moveItem(activeWorkspace.value.quickTags, dragId, targetId);
  persistNow();
}

function moveQuickButtonToTag(buttonId: string, tagId?: string, targetId?: string): void {
  const button = activeWorkspace.value.quickButtons.find((item) => item.id === buttonId);
  if (!button) return;
  if (tagId && !activeWorkspace.value.quickTags.some((tag) => tag.id === tagId)) return;
  applyQuickTag(button, tagId);
  if (targetId) moveItem(activeWorkspace.value.quickButtons, buttonId, targetId);
  persistNow();
}

function getQuickTextCopiedMessage(value: string): string {
  const preview = formatQuickCopiedPreview(value);
  return state.language === "en" ? `📋 Copied: ${preview}` : `📋 已复制：${preview}`;
}

function getQuickAppOpeningMessage(title: string): string {
  return state.language === "en" ? `🚀 Opening ${title}…` : `🚀 正在打开 ${title}…`;
}

function getQuickAppInvalidSchemeMessage(): string {
  return state.language === "en" ? "⚠️ Invalid app scheme" : "⚠️ 应用协议格式不正确";
}

/**
 * Launch a native app via its registered URL scheme (e.g. `wechat://`). Browsers
 * cannot reliably report whether the app actually opened, so we only signal that
 * the launch was requested. A hidden anchor click is the most reliable trigger:
 * it isn't blocked by popup blockers and doesn't navigate the page away.
 */
function openQuickApp(button: QuickButton, anchor?: HTMLElement): void {
  const scheme = button.value.trim();
  if (!isQuickAppScheme(scheme)) {
    showBubbleText(getQuickAppInvalidSchemeMessage(), anchor, { hideCompanionAfter: true }, 3000);
    return;
  }
  const trigger = document.createElement("a");
  trigger.href = scheme;
  trigger.style.display = "none";
  document.body.appendChild(trigger);
  trigger.click();
  trigger.remove();
  showBubbleText(getQuickAppOpeningMessage(button.title || scheme), anchor, { hideCompanionAfter: true }, 2200);
}

async function handleQuickButton(id: string, anchor?: HTMLElement): Promise<void> {
  const button = activeWorkspace.value.quickButtons.find((item) => item.id === id);
  if (!button) return;
  if (button.type === "link") {
    const opened = window.open(normalizeLink(button.value), "_blank", "noopener,noreferrer");
    if (!opened) showBubble("linkOpenFailed", anchor, { hideCompanionAfter: true });
    return;
  }
  if (button.type === "app") {
    openQuickApp(button, anchor);
    return;
  }
  if (button.type === "api") {
    await callQuickApi(button, anchor);
    return;
  }
  const copied = await copyText(button.value, shouldBlockBoardEffects);
  if (shouldBlockBoardEffects()) return;
  if (copied) {
    showBubbleText(getQuickTextCopiedMessage(button.value), anchor, { hideCompanionAfter: true }, 4000);
  } else {
    showBubble("quickTextCopyFailed", anchor, { hideCompanionAfter: true });
  }
}

async function copyQuickLink(id: string, anchor?: HTMLElement): Promise<void> {
  const button = activeWorkspace.value.quickButtons.find((item) => item.id === id);
  if (!button) return;
  const copied = await copyText(button.value, shouldBlockBoardEffects);
  if (shouldBlockBoardEffects()) return;
  if (copied) {
    showBubbleText(getQuickTextCopiedMessage(button.value), anchor, { hideCompanionAfter: true }, 4000);
  } else {
    showBubble("quickTextCopyFailed", anchor, { hideCompanionAfter: true });
  }
}

async function copyQuickText(id: string, anchor?: HTMLElement): Promise<void> {
  const button = activeWorkspace.value.quickButtons.find((item) => item.id === id);
  if (!button) return;
  const copied = await copyText(button.title, shouldBlockBoardEffects);
  if (shouldBlockBoardEffects()) return;
  if (copied) {
    showBubbleText(getQuickTextCopiedMessage(button.title), anchor, { hideCompanionAfter: true }, 4000);
  } else {
    showBubble("quickTextCopyFailed", anchor, { hideCompanionAfter: true });
  }
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
    return copyTextWithBrowserCommand(text);
  }
}

function createTodoList(anchor?: HTMLElement, title?: string): void {
  const trimmedTitle = title?.trim() ?? "";
  if (!trimmedTitle) return;
  const id = createId();
  activeWorkspace.value.todoLists.push({ id, title: trimmedTitle, collapsed: false, compact: false, column: 0 });
  activeWorkspace.value.todos[id] = [];
  activeWorkspace.value.showCompletedTodos[id] = false;
  pendingEditTodoListId.value = null;
  persistNow();
  showBubbleText(uiText.value.app.todoListAdded, anchor);
}

function updateTodoListTitle(listId: TodoListId, title: string): void {
  const list = activeWorkspace.value.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.title = getStoredTodoListTitle(listId, title) || uiText.value.app.unnamedList;
  if (pendingEditTodoListId.value === listId) pendingEditTodoListId.value = null;
  persistNow();
}

function toggleTodoListCollapsed(listId: TodoListId, collapsed: boolean): void {
  const list = activeWorkspace.value.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.collapsed = collapsed;
  persistNow();
}

function toggleTodoListCompact(listId: TodoListId, compact: boolean): void {
  const list = activeWorkspace.value.todoLists.find((item) => item.id === listId);
  if (!list) return;
  list.compact = compact;
  persistNow();
}

function deleteTodoList(listId: TodoListId, anchor?: HTMLElement): void {
  if (activeWorkspace.value.todoLists.length <= 1) {
    showBubbleText(uiText.value.app.keepOneTodoList, anchor);
    return;
  }
  const list = activeWorkspace.value.todoLists.find((item) => item.id === listId);
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
  const index = activeWorkspace.value.todoLists.findIndex((list) => list.id === listId);
  if (index < 0 || activeWorkspace.value.todoLists.length <= 1) return;
  activeWorkspace.value.todoLists.splice(index, 1);
  const next = removeTodoListData(activeWorkspace.value.todos, activeWorkspace.value.showCompletedTodos, listId);
  activeWorkspace.value.todos = next.todos;
  activeWorkspace.value.showCompletedTodos = next.showCompletedTodos;
  clearEmptyTodoRemovalTimersForList(listId);
  if (pendingEditTodoListId.value === listId) pendingEditTodoListId.value = null;
  persistNow();
  showBubbleText(uiText.value.app.todoListDeleted, anchor, { hideCompanionAfter: true });
}

function onTodoColumnCountChange(count: number): void {
  todoColumnCount.value = count;
}

function assignTodoListSections(
  draggedId: TodoListId,
  targetColumn: number,
  anchorId: TodoListId | null,
  insertBefore: boolean,
): void {
  // Any manual drag freezes auto-distribution permanently for this workspace.
  activeWorkspace.value.todoLayoutManual = true;
  activeWorkspace.value.todoLists = assignTodoListColumn(
    activeWorkspace.value.todoLists,
    draggedId,
    targetColumn,
    anchorId,
    insertBefore,
  );
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
        activeWorkspace.value.todos = removeTodoFromMap(activeWorkspace.value.todos, blankTodo.period, blankTodo.id);
        persistNow();
        return;
      }
      activeWorkspace.value.todos = removeTodoFromMap(activeWorkspace.value.todos, blankTodo.period, blankTodo.id);
    }
  }
  const id = createId();
  activeWorkspace.value.todos = addTodoToMap(
    activeWorkspace.value.todos,
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
    activeWorkspace.value.todos = addTodoToMap(activeWorkspace.value.todos, period, {
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
  activeWorkspace.value.todos = updateTodoText(activeWorkspace.value.todos, period, id, text);
  // Text edits are cheap to redo but full-state saves are not (serialization +
  // localStorage round-trip per keystroke, amplified by IME composition). Debounce
  // through the shared text pipeline; blur/Enter/structural edits flush via
  // persistNow, and undo snapshots still record every change.
  bumpTextGeneration();
  markDirty();
  scheduleTodoSave();
}

function splitTodo(period: TodoPeriod, id: string, before: string, after: string): void {
  if (!isConfiguredTodoListId(period)) return;
  cancelEmptyTodoRemoval(period, id);
  const nextId = createId();
  activeWorkspace.value.todos = splitTodoInMap(
    activeWorkspace.value.todos,
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
  activeWorkspace.value.todos = completeTodo(activeWorkspace.value.todos, period, id, done);
  persistNow();
  if (done) showBubble("todoCompleted", anchor);
}

function toggleTodoStar(change: TodoStarChange): void {
  const { period, id, starred } = change;
  if (!isConfiguredTodoListId(period)) return;
  const todo = getTodos(period).find((item) => item.id === id);
  if (!todo) return;
  if (!starred && !todo.starred) return;
  activeWorkspace.value.todos = starTodo(activeWorkspace.value.todos, period, id, starred);
  persistNow();
}

function updateTodoNotify(period: TodoPeriod, id: string, notifyAt: number | undefined, anchor?: HTMLElement): void {
  if (!isConfiguredTodoListId(period)) return;
  activeWorkspace.value.todos = setTodoNotifyAt(activeWorkspace.value.todos, period, id, notifyAt);
  persistNow();
  scheduleNextTodoNotification();
  if (notifyAt === undefined) showBubbleText(uiText.value.app.notifyCleared, anchor);
  else void prepareTodoNotifications();
}

let consecutiveTodoDeletes = 0;
let lastTodoDeleteAt = 0;

function todoDeleteStreakActive(): boolean {
  return consecutiveTodoDeletes > 0 && Date.now() - lastTodoDeleteAt <= TODO_DELETE_STREAK_RESET_MS;
}

function deleteTodoNow(period: TodoPeriod, id: string, anchor?: HTMLElement): boolean {
  if (!isConfiguredTodoListId(period)) return false;
  if (getTodos(period).findIndex((todo) => todo.id === id) < 0) return false;
  activeWorkspace.value.todos = removeTodoFromMap(activeWorkspace.value.todos, period, id);
  persistNow();
  lastTodoDeleteAt = Date.now();
  showBubble("deleteTodo", anchor, { hideCompanionAfter: true });
  return true;
}

function removeTodo(period: TodoPeriod, id: string, anchor?: HTMLElement): void {
  if (!isConfiguredTodoListId(period)) return;
  // Beyond the confirm limit inside an active streak the delete runs directly,
  // so bulk cleanups are not interrupted by one confirm bubble per todo.
  if (todoDeleteStreakActive() && consecutiveTodoDeletes >= TODO_DELETE_CONFIRM_MAX) {
    deleteTodoNow(period, id, anchor);
    return;
  }
  requestConfirmation("confirmDeleteTodo", anchor, () => {
    if (!deleteTodoNow(period, id, anchor)) return;
    consecutiveTodoDeletes += 1;
  }, () => {
    consecutiveTodoDeletes = 0;
  }, { confirmText: uiText.value.common.delete, cancelText: uiText.value.common.cancel });
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
      activeWorkspace.value.todos = clearCompleted(activeWorkspace.value.todos, period);
      persistNow();
      showBubble("clearCompleted", anchor, { hideCompanionAfter: true });
    },
    undefined,
    { confirmText: uiText.value.todo.clearCompletedConfirm, cancelText: uiText.value.common.cancel },
  );
}

function toggleCompletedVisibility(period: TodoPeriod, showCompleted: boolean): void {
  if (!isConfiguredTodoListId(period)) return;
  activeWorkspace.value.showCompletedTodos[period] = showCompleted;
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
      activeWorkspace.value.todos = removeEmptyTodo(activeWorkspace.value.todos, period, id);
      emptyTodoRemovalTimers.delete(key);
      persistNow();
    }, 260),
  );
}

function moveTodo(dragged: DraggedTodo, destinationPeriod: TodoPeriod, targetId?: string): void {
  if (!isConfiguredTodoListId(dragged.period) || !isConfiguredTodoListId(destinationPeriod)) return;
  activeWorkspace.value.todos = moveTodoInMap(activeWorkspace.value.todos, dragged.period, dragged.id, destinationPeriod, targetId);
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
  // standalone 标题栏颜色随应用主题联动（浅色 #f5f5f7 / 深色 #1c1c1e）。
  applyThemeColor(state.theme);
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
      clearPendingImagePayloadDeletions();
      clearImagePreview();
      pendingEditSpaceId.value = null;
      pendingEditTodoListId.value = null;
      resetUndoHistory();
      Object.assign(state, defaultState());
      resetTextGenerationBaseline();
      // Flush reactive watchers (the theme watcher persists on change) before wiping, so
      // their writes land first and the clear below leaves localStorage truly empty.
      await nextTick();
      localStorage.clear();
      await deleteImageDatabases();
      refreshTodoNotifications();
      lastUndoSnapshot.value = createUndoSnapshot();
      // Remount the workbench shell so its entrance choreography (bar settles,
      // zones rise left→right) replays — the same animation as a fresh page load.
      boardEpoch.value += 1;
      showBubble("dataCleared", anchor, { hideCompanionAfter: true });
    },
    undefined,
    { confirmText: uiText.value.settings.clearData, cancelText: uiText.value.common.cancel, danger: true, confirmHint: uiText.value.settings.clearDataHint },
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

async function persistWorkspaceImages(workspaces: WorkspaceData[]): Promise<void> {
  const inline: (StoredImage & { src: string })[] = [];
  for (const workspace of workspaces) {
    for (const image of workspace.images) {
      if (image.src) inline.push(image as StoredImage & { src: string });
    }
  }
  if (inline.length > 0) await persistImagePayloads(inline);
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
  // 配对码即手机录入通道的密钥：导出文件携带 inbox 意味着「分享文件 = 分享通道」，
  // 导入成功后提示来自他人的文件应轮换配对码。
  const importedHasInbox = importedPayloadHasInbox(parsed);

  if (isSingleWorkspaceExport(parsed as Record<string, unknown>)) {
    let importedWorkspace: WorkspaceData;
    try {
      const raw = (parsed as { workspace?: unknown }).workspace;
      importedWorkspace = normalizeWorkspaceData(raw, state.language);
    } catch {
      showBubble("importDataInvalid", importFeedbackAnchor.value, { hideCompanionAfter: true });
      importFeedbackAnchor.value = undefined;
      input.value = "";
      return;
    }
    const finishImport = async (workspace: WorkspaceData): Promise<void> => {
      await persistWorkspaceImages([workspace]);
      persistNow("all", { force: true });
      refreshTodoNotifications();
      showBubble("dataImported", importFeedbackAnchor.value, { hideCompanionAfter: true });
      if (importedHasInbox) {
        showBubbleText(uiText.value.app.inboxImportNotice, importFeedbackAnchor.value, { hideCompanionAfter: true }, 5000);
      }
      importFeedbackAnchor.value = undefined;
      input.value = "";
    };
    const cancelImport = (): void => {
      importFeedbackAnchor.value = undefined;
      input.value = "";
    };
    // Add as a new workspace; a colliding title is auto-suffixed with a number so
    // duplicate names are never created.
    const addAsNewWorkspace = async (): Promise<void> => {
      const workspace = ensureUniqueWorkspaceTitle(
        { ...importedWorkspace, id: createId(), createdAt: Date.now() },
        state.workspaces,
        DEFAULT_BOARD_TITLE,
      );
      state.workspaces = [...state.workspaces, workspace];
      state.activeWorkspaceId = workspace.id;
      await finishImport(workspace);
    };
    // Overwrite the existing same-name workspace in place (keep its id/createdAt,
    // take content from the import); falls back to add-new if the target vanished.
    const overwriteConflictWorkspace = async (targetId: string): Promise<void> => {
      const target = state.workspaces.find((item) => item.id === targetId);
      if (!target) {
        await addAsNewWorkspace();
        return;
      }
      const replacement: WorkspaceData = { ...importedWorkspace, id: target.id, createdAt: target.createdAt };
      state.workspaces = state.workspaces.map((item) => (item.id === target.id ? replacement : item));
      state.activeWorkspaceId = target.id;
      await finishImport(replacement);
    };

    // Resolve titles with the "Mini Desk" fallback so default-named (unnamed)
    // workspaces are treated as their displayed title, not as empty/non-matching.
    const resolveTitle = (workspace: WorkspaceData): string => getWorkspaceBoardTitle(workspace);
    const importedTitle = resolveTitle(importedWorkspace);
    const conflictTarget = state.workspaces.find((item) => resolveTitle(item) === importedTitle);

    if (conflictTarget) {
      // Same-name workspace exists: offer overwrite vs add-new (which auto-numbers).
      requestConfirmation(
        "confirmImportWorkspaceConflict",
        importFeedbackAnchor.value,
        () => overwriteConflictWorkspace(conflictTarget.id),
        cancelImport,
        {
          confirmText: uiText.value.common.overwrite,
          cancelText: uiText.value.common.cancel,
          danger: true,
          confirmHint: importedTitle,
          secondaryText: uiText.value.common.add,
          onSecondary: addAsNewWorkspace,
        },
      );
      return;
    }

    requestConfirmation(
      "confirmImportWorkspace",
      importFeedbackAnchor.value,
      addAsNewWorkspace,
      cancelImport,
      { confirmText: uiText.value.common.add, cancelText: uiText.value.common.cancel },
    );
    return;
  }

  // 整盘导出/导入已停用：导入只接收单个空间文件（同名时可选覆盖或新增）。
  showBubble("importSingleWorkspaceOnly", importFeedbackAnchor.value, { hideCompanionAfter: true });
  importFeedbackAnchor.value = undefined;
  input.value = "";
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
  const subject = encodeURIComponent(uiText.value.app.suggestEmailSubject);
  const body = encodeURIComponent(uiText.value.app.suggestEmailBody);
  window.open(`mailto:${SUGGEST_EMAIL}?subject=${subject}&body=${body}`, "_blank", "noopener,noreferrer");
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
    flushTodoSave();
    flushTextSave();
    showSaveBubble();
    void pullInboxes();
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

function navigatePreview(direction: number): void {
  const index = activeWorkspace.value.images.findIndex((image) => image.id === activePreviewId.value);
  if (index < 0) return;
  const next = activeWorkspace.value.images[index + direction];
  if (next) {
    activePreviewId.value = next.id;
    activeEditorId.value = undefined;
  }
}

function showSaveBubble(): void {
  showBubble("save");
}

// The Ctrl+S bubble animation is a spectacle; firing it on every debounced
// todo auto-save would be noise, so auto-saves only nudge the save status.
function showSaveBubbleSoon(): void {
  // no-op placeholder kept separate from showSaveBubble so explicit saves can
  // keep the celebration while automatic ones stay quiet.
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
      count: activeWorkspace.value.images.length,
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
  for (const list of activeWorkspace.value.todoLists) {
    let activeCount = 0;
    for (const todo of activeWorkspace.value.todos[list.id] ?? []) {
      if (!todo.done) activeCount += 1;
    }
    if (activeCount > max) max = activeCount;
  }
  return max;
}

function getLargestQuickCategoryCount(): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const button of activeWorkspace.value.quickButtons) {
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

function hideCompanion(): void {
  hideBubbleMessage();
  companionFocused.value = false;
  activeGuideKey.value = null;
}

function showToast(messageKey: MessageKey): void {
  showBubble(messageKey, undefined, { hideCompanionAfter: true });
}

function isImportPayload(payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = new Set(Object.keys(payload as Record<string, unknown>));
  if (keys.has("miniDeskWorkspaceExport")) return true;
  if (keys.has("workspaces")) return true;
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
    "quickOtherCollapsed",
    "showHiddenQuickButtons",
    "todoLists",
    "showCompletedTodos",
    "todos",
    "note",
    "workspace",
    "storage",
  ].some((key) => keys.has(key));
}

function isSingleWorkspaceExport(payload: Record<string, unknown>): boolean {
  return payload.miniDeskWorkspaceExport === true;
}

function clearTimers(): void {
  clearPersistenceTimers();
  clearBubbleTimers();
  window.clearTimeout(imagePayloadPruneTimer.value);
  clearVersionTimers();
  window.clearTimeout(previewCloseTimer.value);
  previewCloseTimer.value = undefined;
  imagePayloadPruneTimer.value = undefined;
  clearNotificationTimers();
  document.title = boardTitle.value;
  emptyTodoRemovalTimers.forEach((timer) => window.clearTimeout(timer));
  emptyTodoRemovalTimers.clear();
  clearPendingImagePayloadDeletions();
}

/** Shows the "another workspace has a reminder — switch?" companion bubble. */
function handleDocumentVisibilityChange(): void {
  if (document.visibilityState === "visible") handleNotificationReturn();
}

function showCrossWorkspaceReminderPrompt(item: NotifiableTodo): void {
  const workspaceTitle = getWorkspaceBoardTitle(item.workspace);
  const prompt = uiText.value.app.crossWorkspaceReminder
    .replace("{workspace}", workspaceTitle)
    .replace("{text}", item.todo.text.trim());
  hideBubbleMessage();
  bubbleMessage.value = prompt;
  pendingConfirm.value = {
    onConfirm: () => void switchToWorkspaceWithReminder(item),
    onCancel: undefined,
    confirmText: uiText.value.common.yes,
    cancelText: uiText.value.common.no,
    danger: false,
  };
  activeGuideKey.value = null;
  bubbleVisible.value = true;
  companionFocused.value = true;
  companionPosition.value = undefined;
}

/** "Yes" handler for the cross-workspace prompt: switch and surface the
 *  reminder in context. The todo is already marked sent, so we fire it directly
 *  rather than relying on the next scan. */
async function switchToWorkspaceWithReminder(item: NotifiableTodo): Promise<void> {
  if (item.workspaceId !== state.activeWorkspaceId) {
    await switchWorkspace(item.workspaceId);
  }
  fireNativeTodoNotification(item);
  startNotificationTitleFlash();
  queueTodoNotificationFlash(item.period, item.todo.id);
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
  if (key === "images") return activeWorkspace.value.images.length === 0;
  if (key === "note") return !hasLineContent(activeWorkspace.value.noteLines);
  if (key === "quickButtons") {
    return !activeWorkspace.value.quickButtons.some((button) => activeWorkspace.value.showHiddenQuickButtons || !button.hidden);
  }
  if (key === "workspace") {
    const active = activeWorkspace.value.spaces.find((space) => space.id === activeWorkspace.value.activeSpaceId) ?? activeWorkspace.value.spaces[0];
    return !active || !hasLineContent(active.lines);
  }
  if (key === "tools") return false;
  if (key === "storage") return !hasLineContent(activeWorkspace.value.storageLines);
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
    if (!activeWorkspace.value.showCompletedTodos[period] && todo.done) continue;
    if (todo.text.trim().length > 0) return false;
  }
  return true;
}

function getTodos(period: TodoPeriod): TodoItem[] {
  return activeWorkspace.value.todos[period] ?? [];
}

function isConfiguredTodoListId(listId: TodoListId): listId is TodoListId {
  return activeWorkspace.value.todoLists.some((list) => list.id === listId);
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
  return activeWorkspace.value.todoLists.map((list) => list.id);
}

function randomGuideMessage(key: GuideKey): string {
  const messages = getGuideMessages(state.language)[key];
  return messages[Math.floor(Math.random() * messages.length)];
}

function invalidateGuideCompanion(nextKey: GuideKey): void {
  if (!activeGuideKey.value || activeGuideKey.value === nextKey || pendingConfirm.value) return;
  hideCompanion();
}

// "Update now" from the changelog modal — close it, then run the same cache-clear + reload.
async function applyChangelogUpdate(): Promise<void> {
  changelogVisible.value = false;
  await updateStaticVersion();
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
      :key="boardEpoch"
      :title="boardTitle"
      :slogan="boardSlogan"
      :save-status-label="workspaceDensityLabel"
      :theme="state.theme"
      :language="state.language"
      :assets-title="titles['image-title']"
      :notes-title="titles['quick-title']"
      :image-preview-open="Boolean(displayedPreviewId)"
      :zone-visibility="activeWorkspace.zoneVisibility"
      @theme="handleThemeClick"
      @dragover.prevent
      @drop.prevent="handleBoardDrop"
    >
      <template #workspace-trigger>
        <WorkspaceSwitcher
          :workspaces="state.workspaces"
          :active-workspace-id="state.activeWorkspaceId"
          :theme="state.theme"
          :language="state.language"
          @switch="switchWorkspace"
          @create="openCreateWorkspace"
          @rename="renameWorkspace"
          @delete="deleteWorkspace"
          @reorder="reorderWorkspaceSections"
          @export-workspace="exportWorkspaceById"
          @import="requestImport"
          @pair-inbox="(id: string) => { inboxPairingWorkspaceId = id; }"
          @toggle-zone="toggleWorkspaceZone"
        />
      </template>

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
          @create-workspace="openCreateWorkspace"
          @export-workspace="exportCurrentWorkspace"
          @import="requestImport"
          @clear-data="clearData"
          @about="about"
          @suggest="suggestIssue"
          @support="supportDialogVisible = true"
          @shortcut-help="shortcutHelpVisible = true"
          @changelog="changelogVisible = true"
          @language="updateLanguage"
          @gif-theme="updateCompanionGifTheme"
          @custom-gif="updateCustomCompanionGif"
          @guide="handleGuideClick"
        />
      </template>


      <template #assets>
        <ImagePanel
          :title="titles['image-title']"
          :images="activeWorkspace.images"
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
          :tags="activeWorkspace.quickTags"
          :buttons="activeWorkspace.quickButtons"
          :other-collapsed="activeWorkspace.quickOtherCollapsed"
          :show-hidden="activeWorkspace.showHiddenQuickButtons"
          :language="state.language"
          :move-targets="workspaceMoveTargets"
          @title-update="updateTitle"
          @save="saveQuick"
          @delete="deleteQuick"
          @copy="handleQuickButton"
          @copy-link="copyQuickLink"
          @copy-text="copyQuickText"
          @toggle-hidden="toggleQuickHidden"
          @toggle-show-hidden="activeWorkspace.showHiddenQuickButtons = !activeWorkspace.showHiddenQuickButtons; persistNow()"
          @reorder="reorderQuickButtons"
          @reorder-tag="reorderQuickTags"
          @move-to-tag="moveQuickButtonToTag"
          @move-button-to-workspace="moveQuickButtonAcrossWorkspaces"
          @move-tag-to-workspace="moveQuickTagAcrossWorkspaces"
          @save-tag="saveQuickTag"
          @toggle-tag-collapsed="toggleQuickTagCollapsed"
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
          :todos="activeWorkspace.todos"
          :titles="titles"
          :show-completed="activeWorkspace.showCompletedTodos"
          :language="state.language"
          :move-targets="workspaceMoveTargets"
          @title-update="updateTitle"
          @create-list="createTodoList"
          @update-list-title="updateTodoListTitle"
          @toggle-list-collapsed="toggleTodoListCollapsed"
          @toggle-list-compact="toggleTodoListCompact"
          @delete-list="deleteTodoList"
          @column-count-change="onTodoColumnCountChange"
          @assign-list-column="assignTodoListSections"
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
          @move-list-to-workspace="moveTodoListAcrossWorkspaces"
          @move-todo-to-workspace="moveTodoAcrossWorkspaces"
          @focus="handleGuideFocus('todos', $event)"
          @guide="handleGuideClick"
          @declutter="showDeclutterBubble"
        />
      </template>

      <template #workspace>
        <SpacePanel
          class="workspace-panel"
          :spaces="displaySpaces"
          :active-space-id="activeWorkspace.activeSpaceId"
          :edit-space-id="pendingEditSpaceId"
          :language="state.language"
          :move-targets="workspaceMoveTargets"
          @activate="activateSpace"
          @create="createSpace"
          @rename="renameSpace"
          @edit-done="finishSpaceEdit"
          @update="updateSpaceLines"
          @delete="deleteSpace"
          @reorder="reorderSpaces"
          @move-space-to-workspace="moveSpaceAcrossWorkspaces"
          @focus="(_, element) => handleGuideFocus('workspace', element)"
          @guide="(_, anchor, immediate) => handleGuideClick('workspace', anchor, immediate)"
          @blur="handleEditorBlur"
        />
      </template>
    </WorkbenchShell>

    <main v-else class="mobile-handoff" :aria-label="uiText.app.mobileLabel">
      <header class="mobile-handoff-header">
        <div class="mobile-handoff-brand">
          <img
            class="mobile-handoff-logo"
            :src="state.theme === 'dark' ? miniDeskDarkLogo : miniDeskLogo"
            alt=""
            aria-hidden="true"
            width="20"
            height="20"
          />
          <h1 class="mobile-handoff-title">{{ uiText.app.mobileTitle }}</h1>
        </div>
        <NButton quaternary size="small" class="mobile-handoff-theme" :aria-label="uiText.app.theme" @click="handleThemeClick">
          <NIcon :component="state.theme === 'dark' ? SunnyOutline : MoonOutline" />
        </NButton>
      </header>

      <section
        class="mobile-handoff-body"
        :aria-labelledby="mobileInboxCode ? 'mobile-inbox-heading' : 'mobile-handoff-title'"
      >
        <template v-if="mobileInboxCode">
          <MobileInboxCapture v-model="mobileInboxDraftText" :code="mobileInboxCode" :language="state.language" @change-code="forgetMobileInboxCode" />
          <div class="mobile-inbox-paired">
            <p class="mobile-inbox-paired-code" data-testid="mobile-inbox-paired-code">
              {{ mobileInboxCodeLabel }}
            </p>
            <button
              type="button"
              class="mobile-inbox-paired-change"
              data-testid="mobile-inbox-change-code"
              @click="forgetMobileInboxCode"
            >
              {{ uiText.app.mobileInboxChangeCode }}
            </button>
          </div>
        </template>
        <div v-else class="mobile-handoff-message">
          <h2 id="mobile-handoff-title">{{ uiText.app.mobileHeading }}</h2>
          <p>{{ uiText.app.mobileDescription }}</p>
          <p>{{ uiText.app.mobileMessage }}</p>
          <div class="mobile-inbox-code-entry">
            <label class="mobile-inbox-code-label" for="mobile-inbox-code-input">{{ uiText.app.mobileInboxEnterCode }}</label>
            <div class="mobile-inbox-code-row">
              <input
                id="mobile-inbox-code-input"
                v-model="mobileInboxDraftCode"
                class="mobile-inbox-code-input"
                type="text"
                maxlength="16"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                data-testid="mobile-inbox-code-input"
                :placeholder="uiText.app.mobileInboxCodePlaceholder"
                :aria-invalid="mobileInboxCodeError ? 'true' : undefined"
                :aria-describedby="mobileInboxCodeError ? 'mobile-inbox-code-error' : undefined"
                @input="mobileInboxCodeError = false"
                @keydown.enter="confirmMobileInboxCode"
              />
              <NButton
                size="small"
                type="primary"
                data-testid="mobile-inbox-code-confirm"
                @click="confirmMobileInboxCode"
              >
                {{ uiText.app.mobileInboxCodeConfirm }}
              </NButton>
            </div>
            <p
              v-if="mobileInboxCodeError"
              id="mobile-inbox-code-error"
              class="mobile-inbox-code-error"
              data-testid="mobile-inbox-code-error"
            >
              {{ uiText.app.mobileInboxCodeInvalid }}
            </p>
          </div>
        </div>
      </section>
    </main>

    <WorkspaceInboxDialog
      v-if="inboxPairTarget"
      :key="inboxPairTarget.id"
      :workspace="inboxPairTarget"
      :language="state.language"
      @update="handleInboxUpdate"
      @close="inboxPairingWorkspaceId = null"
    />

    <ImagePreview
      v-if="!isMobileBlocked && displayedPreviewId"
      :images="activeWorkspace.images"
      :active-id="displayedPreviewId"
      :edit-id="activeEditorId"
      :closing="imagePreviewClosing"
      :language="state.language"
      @close="clearImagePreview"
      @copy="copyImage"
      @paste="pasteImageFromClipboard"
      @drop-files="addImageFiles"
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
      :confirm-hint="isMobileBlocked ? undefined : pendingConfirm?.confirmHint"
      :secondary-text="isMobileBlocked ? undefined : pendingConfirm?.secondaryText"
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
      @secondary="secondaryCompanionAction"
      @pause="pauseBubbleTimer"
      @resume="resumeBubbleTimer"
      @gif-theme-change="(theme: string) => updateCompanionGifTheme(theme as CompanionGifTheme)"
    />
    <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importData" />
    <ShortcutHelp :show="shortcutHelpVisible" :language="state.language" @close="shortcutHelpVisible = false" />
    <SupportAuthor :show="supportDialogVisible" :language="state.language" @close="supportDialogVisible = false" />
    <VersionHistory
      :show="changelogVisible"
      :language="state.language"
      :update-available="versionPromptVisible"
      :available-version="availableAppVersion"
      @close="changelogVisible = false"
      @update="applyChangelogUpdate"
    />
    <NModal
      v-model:show="workspaceDialogVisible"
      preset="card"
      class="workspace-dialog-modal"
      :title="workspaceDialogMode === 'create' ? uiText.app.newWorkspace : uiText.common.rename"
      style="max-width: 360px"
      :mask-closable="false"
    >
      <div style="display:flex; flex-direction:column; gap:12px;">
        <label style="display:flex; flex-direction:column; gap:4px;">
          <span>{{ uiText.app.workspaceTitle }}</span>
          <NInput v-model:value="workspaceDraftTitle" :placeholder="uiText.app.workspaceTitlePlaceholder" />
        </label>
        <label style="display:flex; flex-direction:column; gap:4px;">
          <span>{{ uiText.app.workspaceSlogan }}</span>
          <NInput v-model:value="workspaceDraftSlogan" :placeholder="uiText.app.workspaceSloganPlaceholder" />
        </label>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <NButton @click="workspaceDialogVisible = false">{{ uiText.common.cancel }}</NButton>
          <NButton type="primary" :disabled="!workspaceDraftTitle.trim()" @click="confirmWorkspaceDialog">{{ uiText.common.confirm }}</NButton>
        </div>
      </div>
    </NModal>
  </NConfigProvider>
</template>

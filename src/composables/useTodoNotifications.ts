import { computed, ref } from "vue";
import { todoKey } from "../state/todos";
import { getDisplayTodoListTitle, getDefaultTitles, getUiText } from "../state/i18n";
import { getCompanionNotificationIconSrc } from "../state/companionGifThemes";
import type { AppLanguage, BoardState, TodoItem, TodoListId, TodoPeriod, WorkspaceData } from "../types";

const TODO_NOTIFICATION_FALLBACK_INTERVAL_MS = 30_000;
const MAX_TODO_NOTIFICATION_TIMEOUT_MS = 2_147_483_647;
const TITLE_FLASH_INTERVAL_MS = 750;
const TODO_NOTIFICATION_FLASH_MS = 2400;

export interface NotifiableTodo {
  workspaceId: string;
  workspace: WorkspaceData;
  period: TodoPeriod;
  todo: TodoItem;
}

/** Host hooks the notification engine cannot own (bubble UI lives in App). */
export interface TodoNotificationDeps {
  isMounted: () => boolean;
  boardTitle: () => string;
  /** Cross-workspace due reminders surface as a companion confirm, owned by App. */
  showCrossWorkspacePrompt: (item: NotifiableTodo) => void;
  /** True while mobile handoff or another overlay blocks board effects. */
  isBoardBlocked: () => boolean;
  /** Whether a confirm bubble is already mid-flight. */
  hasPendingConfirm: () => boolean;
}

/**
 * Reminder notification engine: scans every workspace for due reminders, fires
 * native notifications for the active workspace (plus the in-app row flash and
 * tab-title flashing), and defers non-active-workspace reminders to the host's
 * switch prompt. Also owns the precise "next due" timer between scans.
 */
export function useTodoNotifications(state: BoardState, deps: TodoNotificationDeps) {
  const todoNotificationTimer = ref<number | undefined>();
  const todoNotificationDueTimer = ref<number | undefined>();
  const titleFlashTimer = ref<number | undefined>();
  const titleFlashActive = ref(false);
  const titleFlashAltVisible = ref(false);
  const notificationFlashKeys = ref<string[]>([]);
  const pendingNotificationFlashKeys = ref<string[]>([]);
  const sentTodoNotifications = new Set<string>();
  const notificationFlashTimers = new Map<string, number>();

  const uiText = computed(() => getUiText(state.language));
  const notificationDocumentTitle = computed(() => `${uiText.value.app.notificationTitle} · ${deps.boardTitle()}`);

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

  /** Every todo carrying a reminder across ALL workspaces. Reminders fire
   *  workspace-agnostically: a due reminder in a non-active workspace must still
   *  surface, otherwise it silently waits until the user switches back. */
  function collectNotifiableTodos(): NotifiableTodo[] {
    const result: NotifiableTodo[] = [];
    for (const workspace of state.workspaces) {
      for (const list of workspace.todoLists) {
        const period = list.id;
        for (const todo of workspace.todos[period] ?? []) {
          result.push({ workspaceId: workspace.id, workspace, period, todo });
        }
      }
    }
    return result;
  }

  function getWorkspaceTodoListTitle(workspace: WorkspaceData, listId: TodoListId): string {
    const list = workspace.todoLists.find((item) => item.id === listId);
    if (list?.title) return getDisplayTodoListTitle(list, state.language);
    return getDefaultTitles(state.language)[`todo-${listId}-title`] ?? uiText.value.app.reminderFallback;
  }

  function fireNativeTodoNotification(item: NotifiableTodo): boolean {
    const notificationApi = getNotificationApi();
    if (!notificationApi || notificationApi.permission !== "granted") return false;
    const title = `【${getWorkspaceTodoListTitle(item.workspace, item.period)}】`;
    const options: NotificationOptions = {
      body: formatNotificationBody(item.todo.text, state.language),
      tag: getTodoNotificationTag(item.todo),
    };
    const icon = getReminderNotificationIcon();
    if (icon) options.icon = icon;
    try {
      new notificationApi(title, options);
      return true;
    } catch (error) {
      console.warn("Failed to show reminder notification", error);
      return false;
    }
  }

  function triggerDueTodoNotifications(): void {
    pruneSentTodoNotifications();
    const now = Date.now();
    const all = collectNotifiableTodos();

    // Phase 1 — active workspace: fire native notifications + in-app flash
    // (permission-gated, unchanged behavior).
    for (const item of all) {
      if (item.workspaceId !== state.activeWorkspaceId) continue;
      const { period, todo } = item;
      if (todo.done || !Number.isFinite(todo.notifyAt) || todo.notifyAt === undefined || todo.notifyAt > now) continue;
      const key = getTodoNotificationKey(item.workspaceId, period, todo);
      if (sentTodoNotifications.has(key)) continue;
      // On constructor failure, leave the todo unsent so the fallback interval
      // retries it (the browser Notification constructor can fail transiently).
      if (!fireNativeTodoNotification(item)) continue;
      sentTodoNotifications.add(key);
      startNotificationTitleFlash();
      queueTodoNotificationFlash(period, todo.id);
    }

    // Phase 2 — non-active workspace: prompt to switch (one at a time). This is
    // an in-app companion-bubble prompt, so it does NOT depend on notification
    // permission. Skip while another confirm is mid-flight; the todo stays unsent
    // so the next refresh retries instead of being silently dropped.
    if (deps.hasPendingConfirm() || deps.isBoardBlocked()) return;
    let target: NotifiableTodo | undefined;
    for (const item of all) {
      if (item.workspaceId === state.activeWorkspaceId) continue;
      const { todo } = item;
      if (todo.done || !Number.isFinite(todo.notifyAt) || todo.notifyAt === undefined || todo.notifyAt > now) continue;
      if (sentTodoNotifications.has(getTodoNotificationKey(item.workspaceId, item.period, todo))) continue;
      if (!target || (todo.notifyAt ?? 0) < (target.todo.notifyAt ?? 0)) target = item;
    }
    if (!target) return;
    sentTodoNotifications.add(getTodoNotificationKey(target.workspaceId, target.period, target.todo));
    startNotificationTitleFlash();
    deps.showCrossWorkspacePrompt(target);
  }

  function scheduleNextTodoNotification(): void {
    if (!deps.isMounted()) return;
    window.clearTimeout(todoNotificationDueTimer.value);
    todoNotificationDueTimer.value = undefined;
    const now = Date.now();
    let nextNotifyAt: number | undefined;
    for (const item of collectNotifiableTodos()) {
      const { todo } = item;
      if (todo.done || !Number.isFinite(todo.notifyAt) || todo.notifyAt === undefined || todo.notifyAt <= now) continue;
      if (sentTodoNotifications.has(getTodoNotificationKey(item.workspaceId, item.period, todo))) continue;
      if (nextNotifyAt === undefined || todo.notifyAt < nextNotifyAt) nextNotifyAt = todo.notifyAt;
    }
    if (nextNotifyAt === undefined) return;
    const delay = Math.min(nextNotifyAt - now, MAX_TODO_NOTIFICATION_TIMEOUT_MS);
    todoNotificationDueTimer.value = window.setTimeout(refreshTodoNotifications, delay);
  }

  function pruneSentTodoNotifications(): void {
    const activeKeys = new Set<string>();
    for (const item of collectNotifiableTodos()) {
      const { todo } = item;
      if (Number.isFinite(todo.notifyAt) && todo.notifyAt !== undefined && !todo.done) {
        activeKeys.add(getTodoNotificationKey(item.workspaceId, item.period, todo));
      }
    }
    for (const key of sentTodoNotifications) {
      if (!activeKeys.has(key)) sentTodoNotifications.delete(key);
    }
  }

  function getTodoNotificationKey(workspaceId: string, period: TodoPeriod, todo: TodoItem): string {
    return `${workspaceId}:${period}:${todo.id}:${todo.notifyAt}`;
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
    document.title = notificationDocumentTitle.value;
    titleFlashTimer.value = window.setInterval(toggleNotificationTitle, TITLE_FLASH_INTERVAL_MS);
  }

  function toggleNotificationTitle(): void {
    if (!titleFlashActive.value) return;
    titleFlashAltVisible.value = !titleFlashAltVisible.value;
    document.title = titleFlashAltVisible.value ? notificationDocumentTitle.value : deps.boardTitle();
  }

  function stopNotificationTitleFlash(): void {
    window.clearInterval(titleFlashTimer.value);
    titleFlashTimer.value = undefined;
    titleFlashActive.value = false;
    titleFlashAltVisible.value = false;
    document.title = deps.boardTitle();
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

  /** Start the 30s fallback scan interval (call once on mount). */
  function startFallbackInterval(): void {
    todoNotificationTimer.value = window.setInterval(refreshTodoNotifications, TODO_NOTIFICATION_FALLBACK_INTERVAL_MS);
  }

  function clearTimers(): void {
    window.clearInterval(todoNotificationTimer.value);
    window.clearTimeout(todoNotificationDueTimer.value);
    window.clearInterval(titleFlashTimer.value);
    todoNotificationTimer.value = undefined;
    todoNotificationDueTimer.value = undefined;
    titleFlashTimer.value = undefined;
    titleFlashActive.value = false;
    titleFlashAltVisible.value = false;
    notificationFlashTimers.forEach((timer) => window.clearTimeout(timer));
    notificationFlashTimers.clear();
    notificationFlashKeys.value = [];
  }

  function notificationTitleFlashing(): boolean {
    return titleFlashActive.value;
  }

  return {
    notificationFlashKeys,
    notificationTitleFlashing,
    prepareTodoNotifications,
    refreshTodoNotifications,
    scheduleNextTodoNotification,
    fireNativeTodoNotification,
    startNotificationTitleFlash,
    queueTodoNotificationFlash,
    handleNotificationReturn,
    startFallbackInterval,
    clearTimers,
  };
}

import { ref } from "vue";
import { getMessage, type MessageKey } from "../state/messages";
import type { BoardState, GuideKey } from "../types";
import { getLastPointerPosition, startPointerTracking } from "../utils/pointerPosition";

const COMPANION_FADE_MS = 2000;
/** 确认弹框的 GIF 尺寸（与 .focus-companion img 一致）。 */
const CONFIRM_GIF_SIZE = 50;
/** 确认弹框的 GIF 与鼠标的水平间距：鼠标在 GIF 左侧、大致落在删除按钮正下方。 */
const CONFIRM_POINTER_GAP = 52;
/** 确认弹框的 GIF 距视口右缘的最小留白。 */
const CONFIRM_VIEWPORT_MARGIN = 8;
/** 确认弹框上方为弹框本体预留的高度：鼠标贴近顶部时 GIF 下压到此线，
 * 避免 NPopover 上方空间不足翻转到 GIF 下方（那会让按钮跑到鼠标下面）。 */
const CONFIRM_TOP_RESERVE = 150;
/** 移动端伴宠的固定落点（无鼠标可依）。 */
const MOBILE_COMPANION_POSITION = { right: "12px", top: "118px" } as const;
/** 二次确认在场时标记在被删元素上的属性（样式见 styles.css）。用 data- 属性而非
 *  class：Vue 重渲染会整体重写 class 绑定，手工加的类会被抹掉，属性则不受影响。 */
const CONFIRM_TARGET_MARK = "data-confirm-target";

export interface BubbleOptions {
  hideCompanionAfter?: boolean;
  guideKey?: GuideKey;
  linkText?: string;
  linkHref?: string;
  signatureText?: string;
}

export interface PendingConfirm {
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  confirmHint?: string;
  secondaryText?: string;
  onSecondary?: () => void | Promise<void>;
}

export interface CompanionBubbleDeps {
  state: BoardState;
  /** Guide bubbles tag activeGuideKey; host owns that key (guide area logic). */
  setActiveGuideKey: (key: GuideKey | null) => void;
  /** Confirm/cancel button labels from the active ui text. */
  confirmLabels: () => { yes: string; no: string };
  /** Board effects are suppressed (mobile handoff / overlay open). */
  isBoardBlocked: () => boolean;
  isMobileLayout: () => boolean;
}

/**
 * Companion bubble + confirm-dialog state machine: message/link/signature
 * content, visibility, the pause/resume-aware auto-dismiss timer, the
 * post-dismiss companion fade, and pending-confirm orchestration.
 */
export function useCompanionBubble(deps: CompanionBubbleDeps) {
  startPointerTracking();
  const bubbleMessage = ref("");
  const bubbleLink = ref<{ text: string; href: string } | null>(null);
  const bubbleSignature = ref("");
  const bubbleVisible = ref(false);
  const companionFocused = ref(false);
  const companionPosition = ref<{ right: string; bottom?: string; top?: string } | undefined>();
  /** 当前气泡的锚点：GIF 点击 Tips 用它解析气泡归属的区域。 */
  const bubbleAnchor = ref<HTMLElement | null>(null);
  const pendingConfirm = ref<PendingConfirm | null>(null);
  const bubbleTimer = ref<number | undefined>();
  const bubbleFadeTimer = ref<number | undefined>();
  const bubbleRemainingMs = ref(0);
  const bubbleTimerStartedAt = ref(0);
  const companionFadeRemaining = ref(COMPANION_FADE_MS);
  const companionFadeStartedAt = ref(0);
  const bubbleTimerOptions = ref<BubbleOptions>({});
  const bubbleClearSignal = ref(0);
  /** 当前被二次确认高亮的元素：确认框在场时给被删元素加 is-confirm-target。 */
  let confirmHighlightTarget: HTMLElement | null = null;

  /** 高亮即将被删除/清理的元素；传 null 仅清除（如清空数据/导入这类无具体目标的确认）。 */
  function setConfirmHighlight(element: HTMLElement | null): void {
    confirmHighlightTarget?.removeAttribute(CONFIRM_TARGET_MARK);
    confirmHighlightTarget = element;
    confirmHighlightTarget?.setAttribute(CONFIRM_TARGET_MARK, "");
  }

  /** 所有提示消息气泡的统一落点：屏幕右下角（桌面交给 CSS 默认值，移动端沿用固定提示位）。 */
  function getToastPosition(): { right: string; bottom?: string; top?: string } | undefined {
    if (deps.isMobileLayout()) {
      return { ...MOBILE_COMPANION_POSITION };
    }
    return undefined;
  }

  /**
   * 二次确认弹框的落点：鼠标右上方 —— GIF 在鼠标右侧（水平间距 40px，鼠标大致
   * 落在弹框删除按钮的正下方），GIF 垂直中心对齐鼠标；弹框本体由 NPopover 的
   * top-end 布局弹在 GIF 上方，按钮始终在鼠标上方。鼠标贴近视口顶缘时 GIF 下压
   * 到预留线，保证弹框不必翻转；贴近视口右缘时钳制在边缘内。没有指针记录时
   * （纯键盘触发的新页面等）回退到屏幕右下角。
   */
  function getConfirmPosition(): { right: string; bottom?: string; top?: string } | undefined {
    if (deps.isMobileLayout()) {
      return { ...MOBILE_COMPANION_POSITION };
    }
    const pointer = getLastPointerPosition();
    if (!pointer) return getToastPosition();
    const top = Math.max(pointer.y - CONFIRM_GIF_SIZE / 2, CONFIRM_TOP_RESERVE);
    const gifRightEdge = Math.min(
      pointer.x + CONFIRM_POINTER_GAP + CONFIRM_GIF_SIZE,
      window.innerWidth - CONFIRM_VIEWPORT_MARGIN,
    );
    return {
      right: `calc(100vw - ${Math.round(gifRightEdge)}px)`,
      bottom: "auto",
      top: `${Math.round(top)}px`,
    };
  }

  function showBubble(messageKey: MessageKey, anchor?: HTMLElement, options: BubbleOptions = {}): void {
    showBubbleText(getMessage(messageKey, Math.random, deps.state.language), anchor, options);
  }

  function showBubbleText(message: string, anchor?: HTMLElement, options: BubbleOptions = {}, duration = 3000): void {
    if (deps.isBoardBlocked()) return;
    window.clearTimeout(bubbleTimer.value);
    window.clearTimeout(bubbleFadeTimer.value);
    clearPendingConfirm();
    bubbleMessage.value = message;
    bubbleLink.value = options.linkText && options.linkHref ? { text: options.linkText, href: options.linkHref } : null;
    bubbleSignature.value = options.signatureText ?? "";
    deps.setActiveGuideKey(options.guideKey ?? null);
    companionFocused.value = true;
    bubbleAnchor.value = anchor ?? null;
    // 所有提示消息气泡 —— 普通 toast、整理提醒、右键「Tips」、确认后的成功提示 ——
    // 统一落到屏幕右下角；只有二次确认弹框例外，贴近鼠标。
    companionPosition.value = getToastPosition();
    bubbleVisible.value = true;
    bubbleTimerOptions.value = options;
    startBubbleTimer(duration);
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
    window.clearTimeout(bubbleFadeTimer.value);
    companionFadeRemaining.value = COMPANION_FADE_MS;
    companionFadeStartedAt.value = Date.now();
    bubbleFadeTimer.value = window.setTimeout(finishCompanionFade, COMPANION_FADE_MS);
    return applyGuideClear(options);
  }

  /** Guide bubbles clear activeGuideKey on expiry; kept as a host hook. */
  let onBubbleExpired: ((options: BubbleOptions) => void) | undefined;
  function setBubbleExpiredHandler(handler: (options: BubbleOptions) => void): void {
    onBubbleExpired = handler;
  }

  function applyGuideClear(options: BubbleOptions): void {
    onBubbleExpired?.(options);
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
    options: { confirmText?: string; cancelText?: string; danger?: boolean; confirmHint?: string; secondaryText?: string; onSecondary?: () => void | Promise<void>; highlightTarget?: HTMLElement | null } = {},
  ): void {
    if (deps.isBoardBlocked()) return;
    window.clearTimeout(bubbleTimer.value);
    window.clearTimeout(bubbleFadeTimer.value);
    bubbleTimer.value = undefined;
    bubbleFadeTimer.value = undefined;
    bubbleRemainingMs.value = 0;
    bubbleTimerStartedAt.value = 0;
    // Cancel any in-progress companion fade: the confirm keeps the companion
    // visible until it is answered, so no leftover fade may resume afterwards.
    companionFadeRemaining.value = 0;
    companionFadeStartedAt.value = 0;
    bubbleTimerOptions.value = {};
    bubbleMessage.value = getMessage(messageKey, Math.random, deps.state.language);
    bubbleLink.value = null;
    bubbleSignature.value = "";
    bubbleAnchor.value = anchor ?? null;
    const labels = deps.confirmLabels();
    pendingConfirm.value = {
      onConfirm,
      onCancel,
      confirmText: options.confirmText ?? labels.yes,
      cancelText: options.cancelText ?? labels.no,
      danger: options.danger ?? /删除|清理|Delete|Clear/.test(options.confirmText ?? ""),
      confirmHint: options.confirmHint,
      secondaryText: options.secondaryText,
      onSecondary: options.onSecondary,
    };
    bubbleVisible.value = true;
    companionFocused.value = true;
    companionPosition.value = getConfirmPosition();
    setConfirmHighlight(options.highlightTarget === null ? null : options.highlightTarget ?? anchor ?? null);
  }

  async function confirmCompanionAction(): Promise<void> {
    const action = pendingConfirm.value;
    if (!action) return;
    // 确认即落定：先清掉待确认状态与目标高亮（宿主钩子仍负责收起气泡 UI），
    // 不依赖宿主注册与否。
    clearPendingConfirm();
    hideHostCompanion();
    (document.activeElement as HTMLElement | null)?.blur();
    await action.onConfirm();
  }

  async function secondaryCompanionAction(): Promise<void> {
    const action = pendingConfirm.value;
    if (!action?.onSecondary) return;
    hideHostCompanion();
    (document.activeElement as HTMLElement | null)?.blur();
    pendingConfirm.value = null;
    setConfirmHighlight(null);
    await action.onSecondary();
  }

  function cancelCompanionAction(): void {
    clearPendingConfirm(true);
    hideHostCompanion();
  }

  /** Host-level hide that also clears guide state via the expired handler. */
  let hostHideCompanion: (() => void) | undefined;
  function setHostHideCompanion(handler: () => void): void {
    hostHideCompanion = handler;
  }

  function hideHostCompanion(): void {
    hostHideCompanion?.();
  }

  function clearPendingConfirm(runCancel = false): void {
    const action = pendingConfirm.value;
    pendingConfirm.value = null;
    setConfirmHighlight(null);
    if (runCancel) action?.onCancel?.();
  }

  function clearTimers(): void {
    window.clearTimeout(bubbleTimer.value);
    window.clearTimeout(bubbleFadeTimer.value);
    bubbleTimer.value = undefined;
    bubbleFadeTimer.value = undefined;
  }

  return {
    bubbleMessage,
    bubbleLink,
    bubbleSignature,
    bubbleVisible,
    companionFocused,
    companionPosition,
    bubbleAnchor,
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
    getToastPosition,
    setBubbleExpiredHandler,
    setHostHideCompanion,
    clearTimers,
  };
}

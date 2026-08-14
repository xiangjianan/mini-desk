import { ref } from "vue";
import { getMessage, type MessageKey } from "../state/messages";
import type { BoardState, GuideKey } from "../types";

const COMPANION_FADE_MS = 2000;
const MIN_COMPANION_POPOVER_RIGHT_EDGE = 260;

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
  const bubbleMessage = ref("");
  const bubbleLink = ref<{ text: string; href: string } | null>(null);
  const bubbleSignature = ref("");
  const bubbleVisible = ref(false);
  const companionFocused = ref(false);
  const companionPosition = ref<{ right: string; bottom?: string; top?: string } | undefined>();
  const pendingConfirm = ref<PendingConfirm | null>(null);
  const bubbleTimer = ref<number | undefined>();
  const bubbleFadeTimer = ref<number | undefined>();
  const bubbleRemainingMs = ref(0);
  const bubbleTimerStartedAt = ref(0);
  const companionFadeRemaining = ref(COMPANION_FADE_MS);
  const companionFadeStartedAt = ref(0);
  const bubbleTimerOptions = ref<BubbleOptions>({});
  const bubbleClearSignal = ref(0);

  function getCompanionPosition(anchor?: HTMLElement): { right: string; bottom?: string; top?: string } | undefined {
    if (deps.isMobileLayout()) {
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
    options: { confirmText?: string; cancelText?: string; danger?: boolean; confirmHint?: string; secondaryText?: string; onSecondary?: () => void | Promise<void> } = {},
  ): void {
    if (deps.isBoardBlocked()) return;
    window.clearTimeout(bubbleTimer.value);
    window.clearTimeout(bubbleFadeTimer.value);
    bubbleTimer.value = undefined;
    bubbleRemainingMs.value = 0;
    bubbleTimerStartedAt.value = 0;
    bubbleTimerOptions.value = {};
    bubbleMessage.value = getMessage(messageKey, Math.random, deps.state.language);
    bubbleLink.value = null;
    bubbleSignature.value = "";
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
    companionPosition.value = getCompanionPosition(anchor);
  }

  async function confirmCompanionAction(): Promise<void> {
    const action = pendingConfirm.value;
    if (!action) return;
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
    clearTimers,
  };
}

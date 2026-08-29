/**
 * Edge auto-scroll for native HTML5 drag-and-drop.
 *
 * The browser suppresses `wheel` events while a native drag is in progress, so
 * scroll-by-wheel is impossible mid-drag. Instead we auto-scroll the hovered
 * scroll container whenever the pointer enters its top/bottom edge zone — the
 * same pattern used by the image panel. Call `update()` from a `dragover`
 * handler and `stop()` on `drop`/`dragend`/`dragleave`.
 */

export interface DragAutoScrollOptions {
  /** Distance (px) from the top/bottom edge that triggers scrolling. */
  edgeThreshold?: number;
  /** Pixels scrolled per animation frame. */
  step?: number;
  /** Wheel-pause window: `pauseForWheel()` silences updates for this long (0 = stop only). */
  wheelPauseMs?: number;
  /** Per-frame gate (e.g. internal pointer-drag still active); the loop stops when it turns false. */
  shouldContinue?: () => boolean;
}

export interface DragAutoScrollController {
  /** Recompute scroll direction for the container under the pointer. No-op edge → stops. */
  update: (container: HTMLElement | null, clientY: number) => void;
  /** Cancel any in-flight scrolling. */
  stop: () => void;
  /** Stop scrolling and clear the wheel-pause window (drag end / leave cleanup). */
  reset: () => void;
  /** Stop scrolling and pause updates for `wheelPauseMs`, letting user wheel input take over. */
  pauseForWheel: () => void;
}

const DEFAULT_EDGE_THRESHOLD = 56;
const DEFAULT_STEP = 14;

export function createDragAutoScroll(options: DragAutoScrollOptions = {}): DragAutoScrollController {
  const edgeThreshold = options.edgeThreshold ?? DEFAULT_EDGE_THRESHOLD;
  const step = options.step ?? DEFAULT_STEP;
  const wheelPauseMs = options.wheelPauseMs ?? 0;
  const shouldContinue = options.shouldContinue;

  let container: HTMLElement | null = null;
  let direction = 0;
  let frame: number | undefined;
  let wheelPauseTimer: number | undefined;

  function stop(): void {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    container = null;
    direction = 0;
  }

  function reset(): void {
    stop();
    if (wheelPauseTimer !== undefined) window.clearTimeout(wheelPauseTimer);
    wheelPauseTimer = undefined;
  }

  function pauseForWheel(): void {
    stop();
    if (wheelPauseTimer !== undefined) window.clearTimeout(wheelPauseTimer);
    wheelPauseTimer = undefined;
    if (!wheelPauseMs) return;
    wheelPauseTimer = window.setTimeout(() => {
      wheelPauseTimer = undefined;
    }, wheelPauseMs);
  }

  function run(): void {
    if (!container || direction === 0 || (shouldContinue && !shouldContinue())) {
      stop();
      return;
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop =
      direction < 0
        ? Math.max(0, container.scrollTop - step)
        : Math.min(maxScrollTop, container.scrollTop + step);
    container.scrollTop = nextScrollTop;

    if ((direction < 0 && nextScrollTop === 0) || (direction > 0 && nextScrollTop === maxScrollTop)) {
      stop();
      return;
    }

    frame = window.requestAnimationFrame(run);
  }

  function update(nextContainer: HTMLElement | null, clientY: number): void {
    if (wheelPauseTimer !== undefined) return;
    if (!nextContainer || nextContainer.scrollHeight <= nextContainer.clientHeight) {
      stop();
      return;
    }

    const rect = nextContainer.getBoundingClientRect();
    let nextDirection = 0;
    if (clientY <= rect.top + edgeThreshold) nextDirection = -1;
    else if (clientY >= rect.bottom - edgeThreshold) nextDirection = 1;

    if (nextDirection === 0) {
      stop();
      return;
    }

    if (container !== nextContainer || direction !== nextDirection) {
      container = nextContainer;
      direction = nextDirection;
      if (frame === undefined) frame = window.requestAnimationFrame(run);
    }
  }

  return { update, stop, reset, pauseForWheel };
}

/**
 * Resolves the Naive UI scrollbar scroll container (`.n-scrollbar-container`)
 * for the element under the pointer, scoped to a root that carries `scopeClass`.
 * Returns null when the container is not scrollable.
 */
export function findDragScrollContainer(target: EventTarget | null, scopeClass: string): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const scope = target.classList.contains(scopeClass) ? target : target.closest<HTMLElement>(`.${scopeClass}`);
  const container = scope?.querySelector<HTMLElement>(".n-scrollbar-container");
  if (!container) return null;
  return container.scrollHeight > container.clientHeight ? container : null;
}

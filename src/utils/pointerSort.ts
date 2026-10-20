/** Pointer-driven in-page sorting keeps wheel events available during a drag.
 * Existing drag handlers receive synthetic events, preserving their drop rules.
 */
export function installPointerSort(root: HTMLElement, selector: string, pauseAutoScroll: () => void): () => void {
  let source: HTMLElement | null = null;
  let transfer: DataTransfer | null = null;
  let preview: HTMLElement | null = null;
  let target: Element | null = null;
  let started = false;
  let x = 0, y = 0, startX = 0, startY = 0, pointerId = 0;
  let suppressClick = false;
  let clickTimer: number | undefined;
  let previousUserSelect = "";

  function dispatch(element: Element, type: string): boolean {
    return element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y }));
  }
  function updateTarget(): void {
    const next = document.elementFromPoint(x, y);
    if (next !== target) {
      if (target) dispatch(target, "dragleave");
      if (next) dispatch(next, "dragenter");
      target = next;
    }
    if (target) dispatch(target, "dragover");
  }
  function cleanup(): void {
    if (started && source) dispatch(source, "dragend");
    preview?.remove();
    if (started) document.body.style.userSelect = previousUserSelect;
    source = null; transfer = null; preview = null; target = null; started = false;
    pauseAutoScroll();
  }
  function down(event: PointerEvent): void {
    // Alt preserves native drag-out for destinations outside the page.
    if (event.altKey || event.button !== 0 || (event.pointerType && event.pointerType !== "mouse")) return;
    const element = event.target instanceof Element ? event.target : null;
    const candidate = element?.closest<HTMLElement>(selector);
    if (!candidate || !root.contains(candidate) || candidate.draggable === false) return;
    if (element?.closest("input, textarea, [contenteditable], button") && !candidate.matches("button")) return;
    cleanup();
    source = candidate; pointerId = event.pointerId;
    startX = x = event.clientX; startY = y = event.clientY;
    // Prevent the browser from initiating native drag or selecting heading text.
    event.preventDefault();
  }
  function move(event: PointerEvent): void {
    if (!source || event.pointerId !== pointerId) return;
    x = event.clientX; y = event.clientY;
    if (!started) {
      if (Math.hypot(x - startX, y - startY) < 5) return;
      transfer = new DataTransfer();
      if (!dispatch(source, "dragstart")) { cleanup(); return; }
      started = true;
      previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      const element = source.closest<HTMLElement>(".todo-item") ?? source;
      const rect = element.getBoundingClientRect();
      preview = element.cloneNode(true) as HTMLElement;
      preview.setAttribute("aria-hidden", "true");
      preview.inert = true;
      preview.style.cssText = `position:fixed;z-index:11000;pointer-events:none;width:${rect.width}px;max-height:180px;overflow:hidden;opacity:0.8;margin:0;transform:translateY(-50%);transition:none;animation:none;`;
      document.body.appendChild(preview);
    }
    event.preventDefault();
    if (preview) { preview.style.left = `${x + 12}px`; preview.style.top = `${y}px`; }
    updateTarget();
  }
  function up(event: PointerEvent): void {
    if (!source || event.pointerId !== pointerId) return;
    if (started) {
      x = event.clientX; y = event.clientY; updateTarget();
      if (target) dispatch(target, "drop");
      suppressClick = true;
      clickTimer = window.setTimeout(() => { suppressClick = false; }, 0);
    }
    cleanup();
  }
  function cancel(): void { cleanup(); }
  function key(event: KeyboardEvent): void { if (event.key === "Escape") cleanup(); }
  function click(event: MouseEvent): void {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }
  function nativeStart(event: DragEvent): void {
    if (source && event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function wheel(event: WheelEvent): void {
    if (!started) return;
    let container: HTMLElement | null = target instanceof HTMLElement ? target : source;
    while (container) {
      const style = getComputedStyle(container);
      if (container.scrollHeight > container.clientHeight && /auto|scroll/.test(style.overflowY)) break;
      container = container.parentElement;
    }
    if (!container) return;
    event.preventDefault(); event.stopPropagation();
    pauseAutoScroll();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
    container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + delta));
    updateTarget();
  }
  root.addEventListener("pointerdown", down);
  root.addEventListener("dragstart", nativeStart, true);
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", key);
  window.addEventListener("click", click, true);
  window.addEventListener("wheel", wheel, { capture: true, passive: false });
  return () => {
    cleanup();
    if (clickTimer !== undefined) window.clearTimeout(clickTimer);
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("dragstart", nativeStart, true);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", key);
    window.removeEventListener("click", click, true);
    window.removeEventListener("wheel", wheel, true);
  };
}

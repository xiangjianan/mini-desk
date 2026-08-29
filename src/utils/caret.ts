/** Clamps a caret position into `[0, textLength]` before applying it to a selection. */
export function clampCaret(position: number, textLength: number): number {
  return Math.max(0, Math.min(position, textLength));
}

/**
 * Applies a selection range and re-asserts it in the next macrotask while the
 * element still holds focus. Vue patching (and the transient blurs it can
 * trigger during FLIP/reorder animations) may drop the first application, so
 * the deferred second pass is what actually keeps the caret where the caller
 * put it.
 */
export function setStickySelection(element: HTMLInputElement | HTMLTextAreaElement, start: number, end: number): void {
  element.setSelectionRange(start, end);
  window.setTimeout(() => {
    if (document.activeElement === element) element.setSelectionRange(start, end);
  });
}

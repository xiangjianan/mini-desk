/**
 * Clipboard helpers shared by the text/todo editors, quick buttons, and tools.
 * Every write prefers the async Clipboard API and falls back to a hidden
 * textarea + `document.execCommand("copy")` for browsers/embedded webviews
 * where `navigator.clipboard` is missing or permission-denied.
 */

export type SelectionRange = { start: number; end: number };

export function hasSelection(target: HTMLTextAreaElement | HTMLInputElement): boolean {
  return (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
}

/** Resolve a selection range, falling back to a remembered range (menus blur the field). */
export function getSelectionRange(
  target: HTMLTextAreaElement | HTMLInputElement,
  fallback?: SelectionRange,
): SelectionRange {
  if (hasSelection(target)) {
    return { start: target.selectionStart ?? 0, end: target.selectionEnd ?? 0 };
  }
  if (fallback && fallback.start !== fallback.end && fallback.end <= target.value.length) return fallback;
  const caret = target.selectionStart ?? 0;
  return { start: caret, end: caret };
}

/** Copy text via the async Clipboard API, falling back to a hidden textarea.
 *  `shouldAbort` runs after a failed async write: returning true skips the
 *  execCommand fallback (e.g. the caller's UI state changed meanwhile). */
export async function copyTextToClipboard(text: string, shouldAbort: () => boolean = () => false): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back below when async clipboard access is denied.
    }
  }
  if (shouldAbort()) return false;
  return copyTextWithBrowserCommand(text);
}

/** Legacy synchronous copy through an off-screen textarea (execCommand). */
export function copyTextWithBrowserCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.focus();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand?.("copy") ?? false;
  textarea.remove();
  return copied;
}

/** Copy the selected slice of an editor field (async API first, execCommand fallback). */
export async function copySelection(
  target: HTMLTextAreaElement | HTMLInputElement,
  range: SelectionRange,
): Promise<void> {
  const selectedText = target.value.slice(range.start, range.end);
  if (!selectedText) return;
  await copyTextToClipboard(selectedText);
}

/** Read clipboard text; undefined when the async API is unavailable or denied. */
export async function readClipboardText(): Promise<string | undefined> {
  if (navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Paste into an editor field. Returns true when the field value changed. */
export async function pasteIntoField(
  target: HTMLTextAreaElement | HTMLInputElement,
  range: SelectionRange,
): Promise<boolean> {
  const pastedText = await readClipboardText();
  if (typeof pastedText === "string") {
    if (!pastedText) return false;
    target.setRangeText(pastedText, range.start, range.end, "end");
    return true;
  }
  return pasteWithBrowserCommand(target, range);
}

/** execCommand("paste") fallback (most modern browsers no-op this). */
export function pasteWithBrowserCommand(
  target: HTMLTextAreaElement | HTMLInputElement,
  range: SelectionRange,
): boolean {
  const before = target.value;
  target.focus({ preventScroll: true });
  target.setSelectionRange(range.start, range.end);
  const pasted = Boolean(document.execCommand?.("paste"));
  return pasted && target.value !== before;
}

export function hasAsyncClipboard(): boolean {
  return typeof navigator.clipboard?.readText === "function" && typeof navigator.clipboard?.writeText === "function";
}

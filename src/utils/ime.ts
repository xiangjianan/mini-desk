/**
 * IME composition guards. Browsers report in-flight IME (pinyin/kana/…)
 * composition through several overlapping signals; older engines use
 * `key === "Process"` or the legacy `keyCode === 229` instead of
 * `event.isComposing`. Treat any of them as "composing" so keyboard
 * shortcuts (Enter to commit, arrow navigation, …) don't fire mid-composition.
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.key === "Process" || event.keyCode === 229;
}

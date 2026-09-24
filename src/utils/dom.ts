/**
 * 判断事件落点是否在文本录入元素上（输入框/文本域/下拉/可编辑区）。
 * window 级快捷键监听在接管按键前必须先放行这些目标：焦点在任意编辑器里
 * 打字、退格、复制都应保持原生行为，不能被全局动作（预览快捷键等）劫持。
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof Element &&
      target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"),
  );
}

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

/**
 * 把 input/textarea 的选区折叠成光标（保留光标位置）。失焦只会让选区高亮
 * 消失，selectionStart/End 仍然保留：迟到的 select 事件与「记忆选区」都会
 * 把它复活，旧选区就在不可见的状态下继续接管下一次打字（空格打飞选中文字）。
 * 浮层（图片预览/编辑器）接管键盘前先折叠，选区才算真正取消。
 */
export function collapseTextEntrySelection(target: EventTarget | null): void {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
  const caret = target.selectionStart ?? target.selectionEnd ?? 0;
  target.setSelectionRange(caret, caret);
}

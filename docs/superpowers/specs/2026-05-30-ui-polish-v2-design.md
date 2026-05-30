# UI Polish v2 Design

Date: 2026-05-30

## Overview

9 improvements: deadline style reset, bug fixes, context menu icon/label tweaks, ImagePreview menu icons, drag-paste at cursor, and a keyboard shortcuts help modal.

## 1. All Deadline Indicators Removed

**Files:** `src/styles.css`

Remove background color and left-border pseudo-element from ALL urgency levels, not just overdue:

- `deadline-overdue` — already transparent, no border. Label color: light red `#e88`.
- `deadline-due-soon` — background → `transparent`, remove `::before` rule.
- `deadline-upcoming` — background → `transparent`, remove `::before` rule.
- `deadline-later` — background → `transparent`, remove `::before` rule.

All four `::before` rules (positioning + color variants) are deleted entirely. Only the label text color varies by urgency:
- overdue: `#e88` (light red)
- due-soon: `#b91c1c` (keep existing)
- upcoming: `#92400e` (keep existing)
- later: default muted (keep existing)

## 2. Workspace Drag Fix (Selected Text)

**Files:** `src/components/TextPanel.vue`

Bug: when text is selected in the textarea, clicking the empty frame area and dragging moves the entire panel. The previous fix handled the no-selection case but not the selected-text case.

Root cause: the textarea has `draggable="true"` when text is selected (`canDragSelectedText` computed). When the user starts dragging from the frame (not the textarea), the browser treats the panel as a drag source.

Fix: in `handleDragOver`, check if the drag event originated from outside the component. Only call `preventDefault()` when the drag types include `text/plain` AND the event target is NOT the textarea element itself (i.e., the drag came from outside). Also verify the `@drop` handler on the frame clears `isDragHover`.

## 3. Drag Highlight Not Disappearing

**Files:** `src/components/TextPanel.vue`, `src/components/QuickButtons.vue`, `src/components/ImagePanel.vue`, `src/components/TodoPanel.vue`

Bug: after a successful drop, the `drag-hover` dashed outline persists because `isDragHover` is not reset.

Fix: ensure every drop handler sets `isDragHover.value = false`. Check all four components:
- TextPanel: `handleExternalTextDrop` + the `@drop="handleDragLeaveClear"` on the section
- QuickButtons: `handleQuickDrop` already sets it, but verify `@drop` on section also clears it
- ImagePanel: verify `handleExternalDrop` clears `isDragHover`
- TodoPanel: verify `@drop="handleTodoDragLeave"` clears `isDragHover`

Also add `@dragend` handler as a safety net to clear highlight in all panels.

## 4-5. TodoPanel Context Menu Icon Adjustments

**Files:** `src/components/TodoPanel.vue`

Changes to the `sectionActions` branch of `menuOptions`:

- `create-list`: change icon from `ListOutline` to `AddOutline` (plus icon)
- `toggle-completed`: change icon from `CheckmarkDoneOutline` to `EyeOutline` (when showing) or `EyeOffOutline` (when hiding)

Import `AddOutline`, `EyeOutline`, `EyeOffOutline` — some may already be imported.

## 6. Keyboard Shortcuts Help Modal

**Files:**
- Create: `src/components/ShortcutHelp.vue`
- Modify: `src/components/SettingsMenu.vue`
- Modify: `src/state/i18n.ts`
- Modify: `src/App.vue` (wire up modal visibility)

**ShortcutHelp.vue:**
- Props: `show: boolean`, `language: AppLanguage`
- Emits: `close` (sets show to false)
- Uses `NModal` with `preset="card"`, title "快捷键指南" / "Keyboard Shortcuts"
- Content grouped by area with headings, each entry is a key-description pair

**Content (zh / en):**

| Area | Key | Description |
|---|---|---|
| 全局 / Global | Ctrl+S | 立即保存 / Save immediately |
| 文本编辑 / Text Editing | Tab | 增加缩进 / Increase indent |
| | Shift+Tab | 减少缩进 / Decrease indent |
| | Enter | 换行（延续缩进）/ New line (keep indent) |
| | Backspace (空缩进行) | 减少缩进 / Decrease indent |
| | Right-click | 复制/粘贴 / Copy/Paste |
| 提醒事项 / Reminders | Click blank | 新增提醒 / Add reminder |
| | Drag | 调整顺序 / Reorder |
| | Right-click | 复制/删除/星标/通知 / Copy/Delete/Star/Notify |
| 截图 / Screenshots | Ctrl+V | 粘贴截图 / Paste screenshot |
| | Scroll wheel (preview) | 缩放 / Zoom |
| | ←/→ (preview) | 切换图片 / Switch image |
| | Enter (preview) | 复制图片 / Copy image |
| | Delete (preview) | 删除图片 / Delete image |
| | Esc / Space | 关闭预览 / Close preview |
| 快捷动作 / Quick Actions | Drag text/URL | 自动创建动作 / Auto-create action |
| | Right-click | 编辑/隐藏/删除 / Edit/Hide/Delete |

**SettingsMenu.vue:**
- Add new menu item "快捷键" / "Keyboard Shortcuts" before "关于" / "About"
- Icon: `KeyboardOutline` from `@vicons/ionicons5`
- Emits: `shortcutHelp` event
- App.vue handles the event to toggle `ShortcutHelp` visibility

**i18n additions:**
- `settings.shortcutHelp`: "快捷键" / "Keyboard Shortcuts"
- Full shortcut help text in both languages (can be a structured object or inline in component)

## 7. "编辑" → "重命名" in Context Menus

**Files:** `src/state/i18n.ts`, `src/components/SpacePanel.vue`, `src/components/EditableTitle.vue`

Changes:
- Add `common.rename` key to UI_TEXT: `"重命名"` / `"Rename"`
- SpacePanel `menuOptions`: use `uiText.value.common.rename` instead of `uiText.value.common.edit`, icon stays `CreateOutline`
- EditableTitle context menu: use `common.rename` instead of `common.edit`, add `CreateOutline` icon
- This affects titles in: ImagePanel, TextPanel (notes/workspace), QuickButtons, TodoPanel (today focus heading)

Note: other context menus (todo item right-click → edit notification, QuickButtons button → edit) keep using `common.edit` since those are editing actions, not renaming.

## 8. ImagePreview Context Menu Icons + Tips

**Files:** `src/components/ImagePreview.vue`

Current menu has 3 items (复制、关闭预览、删除) without icons or Tips.

Changes:
- Add `renderIcon` helper (same pattern as other components)
- Add icons: Copy → `CopyOutline`, Close preview → `CloseOutline` (already imported), Delete → `TrashOutline`, Tips → `HelpCircleOutline`
- Add Tips as the last menu item (same pattern as ImagePanel)
- Need to wire up a guide emit or show a tooltip — since ImagePreview doesn't currently emit `guide`, add a simple inline tips message or emit a guide event to App.vue

Icons needed: `CopyOutline`, `CloseOutline` (already imported), `TrashOutline`, `HelpCircleOutline`
Also need `h` from vue, `Component`/`VNode` types.

## 9. Drag-Paste at Cursor Position

**Files:** `src/components/TextPanel.vue`

Current behavior: dragged text is appended to the END of the textarea content (`appendPlainTextToEditorText`).

New behavior: text is inserted at the mouse cursor position within the textarea.

**During dragover:**
- Use the browser's `document.caretPositionFromPoint(x, y)` (Firefox) or `document.caretRangeFromPoint(x, y)` (Chrome/Safari) to compute the character offset from the mouse coordinates.
- Track the target offset in a reactive ref (`dropCaretOffset`).
- Render a blinking caret indicator (1px wide vertical line) at the computed position using a CSS overlay or by manipulating the textarea's selection visual.

**On drop:**
- Read the stored `dropCaretOffset`.
- Insert the dropped text at that offset (split the current textarea value at offset, concatenate `before + dropped + after`).
- Place the textarea cursor at the end of the inserted text.
- Clear the caret indicator and `dropCaretOffset`.

**On dragleave / dragend:**
- Clear the caret indicator and `dropCaretOffset`.

**Edge cases:**
- If the textarea is not in editing mode when drag starts, enter editing mode on first dragover.
- If `caretRangeFromPoint` returns null (e.g., mouse outside textarea bounds), fall back to appending at end.
- Single-line text: offset calculation works on the flat string.

## Implementation Notes

- All features are independent UI-layer changes; no state schema changes required.
- #6 (ShortcutHelp) is the only new component; the rest modify existing files.
- No new dependencies needed.

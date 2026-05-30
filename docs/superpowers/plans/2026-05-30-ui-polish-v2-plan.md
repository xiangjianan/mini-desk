# UI Polish v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 9 UI improvements — deadline style reset, drag bugs, menu icon tweaks, ImagePreview menu, rename labels, shortcut help modal, drag-paste at cursor.

**Architecture:** All UI-layer changes. One new component (ShortcutHelp.vue), rest modify existing files.

**Tech Stack:** Vue 3, TypeScript, Naive UI, @vicons/ionicons5, CSS custom properties.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `src/styles.css` | Modify | Remove all deadline backgrounds/borders |
| `src/components/TextPanel.vue` | Modify | Fix drag bugs, drag-paste at cursor |
| `src/components/QuickButtons.vue` | Modify | Fix drag highlight clear |
| `src/components/ImagePanel.vue` | Modify | Fix drag highlight clear |
| `src/components/TodoPanel.vue` | Modify | Fix drag highlight, adjust menu icons |
| `src/components/ImagePreview.vue` | Modify | Add menu icons + Tips |
| `src/components/SpacePanel.vue` | Modify | Rename "编辑" → "重命名" |
| `src/components/EditableTitle.vue` | Modify | Rename "编辑" → "重命名", add icon |
| `src/components/ShortcutHelp.vue` | Create | Keyboard shortcuts help modal |
| `src/components/SettingsMenu.vue` | Modify | Add shortcut help menu entry |
| `src/state/i18n.ts` | Modify | Add rename key, shortcut help text |
| `src/App.vue` | Modify | Wire up ShortcutHelp modal |

---

### Task 1: Remove All Deadline Backgrounds and Borders

**Files:** `src/styles.css`

- [ ] **Step 1: Remove backgrounds from due-soon, upcoming, later**

Lines 1249-1262. Replace the three background rules:

```css
.todo-item.deadline-due-soon,
.today-focus-item.deadline-due-soon {
  background: transparent;
}

.todo-item.deadline-upcoming,
.today-focus-item.deadline-upcoming {
  background: transparent;
}

.todo-item.deadline-later,
.today-focus-item.deadline-later {
  background: transparent;
}
```

- [ ] **Step 2: Delete all ::before pseudo-element rules**

Delete lines 1264-1293 entirely (the positioning rule + all three color rules for due-soon, upcoming, later).

- [ ] **Step 3: Update overdue label color to light red**

Line 1295-1297. Change from `#9ca3af` to `#e88`:

```css
.deadline-overdue .todo-deadline-label {
  color: #e88;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "feat: remove all deadline backgrounds and left-border indicators"
```

---

### Task 2: Fix Workspace Drag with Selected Text

**Files:** `src/components/TextPanel.vue`

- [ ] **Step 1: Update handleDragOver to reject internal drags**

Current `handleDragOver` (around line 177):

```typescript
function handleDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") || types.includes("text/uri-list")) {
    event.preventDefault();
    isDragHover.value = true;
  }
}
```

Replace with:

```typescript
function handleDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  const isInternalDrag = (event.target as HTMLElement)?.closest?.("textarea");
  if (!isInternalDrag && (types.includes("text/plain") || types.includes("text/uri-list"))) {
    event.preventDefault();
    isDragHover.value = true;
  }
}
```

The key change: skip `preventDefault()` when the drag event's target is inside the textarea (i.e., an internal text selection drag).

- [ ] **Step 2: Commit**

```bash
git add src/components/TextPanel.vue
git commit -m "fix: prevent workspace panel drag when text is selected"
```

---

### Task 3: Fix Drag Highlight Not Disappearing

**Files:** All 4 panel components

- [ ] **Step 1: TextPanel.vue — ensure @drop on section clears highlight**

The root section (line 532) already has `@drop="handleDragLeaveClear"`. Also verify that `handleExternalTextDrop` (line 185) calls `isDragHover.value = false` at the end. If not, add it.

Add a `@dragend="handleDragLeaveClear"` to the root section as a safety net:

```html
<section class="text-panel" :class="[textPanelClasses, { 'drag-hover': isDragHover }]" @dragenter="handleDragEnter" @dragleave="handleDragLeaveClear" @drop="handleDragLeaveClear" @dragend="handleDragLeaveClear">
```

- [ ] **Step 2: QuickButtons.vue — add dragend handler**

Update the root section (around line 216) to add `@dragend="handleQuickDragLeave"`:

```html
<section
  class="split-block quick-block"
  :class="{ 'drag-hover': isDragHover }"
  @click="handleAreaClick"
  @contextmenu="openAreaMenu"
  @dragover="handleQuickDragOver"
  @dragleave="handleQuickDragLeave"
  @drop="handleQuickDrop"
  @dragend="handleQuickDragLeave"
>
```

- [ ] **Step 3: ImagePanel.vue — add dragend handler**

Update the root section (around line 115) to add `@dragend="handleImageDragLeave"`:

Add `@dragend="handleImageDragLeave"` to the section element.

- [ ] **Step 4: TodoPanel.vue — add dragend handler**

Update the root section (around line 1046) to add `@dragend="handleTodoDragLeave"`:

Add `@dragend="handleTodoDragLeave"` to the section element.

- [ ] **Step 5: Commit**

```bash
git add src/components/TextPanel.vue src/components/QuickButtons.vue src/components/ImagePanel.vue src/components/TodoPanel.vue
git commit -m "fix: clear drag highlight on drop and dragend events"
```

---

### Task 4: TodoPanel Menu Icon Adjustments

**Files:** `src/components/TodoPanel.vue`

- [ ] **Step 1: Add missing icon imports**

Add `AddOutline`, `EyeOutline`, `EyeOffOutline` to the existing import block (line 4-17). `EyeOutline` and `EyeOffOutline` may already be there; `AddOutline` needs to be added.

- [ ] **Step 2: Update sectionActions menuOptions**

In the `sectionActions` branch (around line 143-153):
- Change `create-list` icon from `ListOutline` to `AddOutline`
- Change `toggle-completed` icon from `CheckmarkDoneOutline` to `EyeOutline` when hiding, `EyeOffOutline` when showing

```typescript
{ label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(AddOutline) },
```

```typescript
{ label: isCompletedVisible(list.id) ? uiText.value.todo.hideCompleted : uiText.value.todo.showCompleted, key: "toggle-completed", icon: renderIcon(isCompletedVisible(list.id) ? EyeOffOutline : EyeOutline) },
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TodoPanel.vue
git commit -m "feat: use AddOutline for new-list and Eye icons for show/hide completed"
```

---

### Task 5: ImagePreview Context Menu Icons + Tips

**Files:** `src/components/ImagePreview.vue`

- [ ] **Step 1: Add imports**

Add to vue imports: `h` and `type Component, VNode`.
Add icon imports: `CopyOutline`, `HelpCircleOutline`, `TrashOutline` from `@vicons/ionicons5`.
(`CloseOutline` is already imported.)

- [ ] **Step 2: Add renderIcon helper**

```typescript
function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
```

- [ ] **Step 3: Update menuOptions with icons and add Tips**

```typescript
const menuOptions = computed<DropdownOption[]>(() => [
  { label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) },
  { label: uiText.value.preview.close, key: "close", icon: renderIcon(CloseOutline) },
  { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) },
  { label: uiText.value.common.tips, key: "tips", icon: renderIcon(HelpCircleOutline) },
]);
```

- [ ] **Step 4: Handle "tips" menu selection**

In `handleMenuSelect`, add a case for `"tips"`. Since ImagePreview doesn't have a guide system, show an `alert()` with the preview help text from `uiText.value.preview.help`, or emit a guide event. Simplest approach: just show an alert.

Add to `handleMenuSelect` (find the existing key checks):

```typescript
if (key === "tips") {
  window.alert(uiText.value.preview.help);
  return;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ImagePreview.vue
git commit -m "feat: add icons and Tips to ImagePreview context menu"
```

---

### Task 6: Rename "编辑" → "重命名"

**Files:** `src/state/i18n.ts`, `src/components/SpacePanel.vue`, `src/components/EditableTitle.vue`

- [ ] **Step 1: Add rename key to i18n**

In `UI_TEXT.zh.common` (around line 384-398), add after `edit`:

```typescript
rename: "重命名",
```

In `UI_TEXT.en.common` (around line 510-523), add after `edit`:

```typescript
rename: "Rename",
```

- [ ] **Step 2: Update SpacePanel menuOptions**

Change from `uiText.value.common.edit` to `uiText.value.common.rename`:

```typescript
const menuOptions = computed<DropdownOption[]>(() => [
  { label: uiText.value.common.rename, key: "edit", icon: renderIcon(CreateOutline) },
  { label: uiText.value.common.delete, key: "delete", disabled: !canDeleteSpaces.value, icon: renderIcon(TrashOutline) },
]);
```

- [ ] **Step 3: Update EditableTitle to use rename label + icon**

Read `/Users/xiangjianan/github/todolist/src/components/EditableTitle.vue`.

Add imports:
```typescript
import { h } from "vue";
import type { Component, VNode } from "vue";
import { NIcon } from "naive-ui";
import { CreateOutline } from "@vicons/ionicons5";
```

Add `renderIcon` helper (same pattern).

Update `menuOptions` (line 27) to use `props.editLabel` (which parent can now pass as "重命名") and add icon. But better: change the default `editLabel` prop to "重命名":

Change the default value of `editLabel` prop from `"编辑"` to `"重命名"`.

Add icon to menuOptions:
```typescript
const menuOptions = computed<DropdownOption[]>(() => [
  { label: props.editLabel, key: "edit", icon: renderIcon(CreateOutline) },
]);
```

- [ ] **Step 4: Update parent components passing editLabel**

Check if any parent passes `edit-label` prop to EditableTitle. If they pass "编辑", update to "重命名". If they don't pass it (use default), the default change handles it.

- [ ] **Step 5: Commit**

```bash
git add src/state/i18n.ts src/components/SpacePanel.vue src/components/EditableTitle.vue
git commit -m "feat: rename context menu label from 编辑 to 重命名 with icon"
```

---

### Task 7: Keyboard Shortcuts Help Modal

**Files:** Create `src/components/ShortcutHelp.vue`, modify `src/components/SettingsMenu.vue`, `src/state/i18n.ts`, `src/App.vue`

- [ ] **Step 1: Add i18n keys for shortcut help**

In `UI_TEXT.zh`, add inside `settings`:
```typescript
shortcutHelp: "快捷键",
```

In `UI_TEXT.en.settings`:
```typescript
shortcutHelp: "Shortcuts",
```

Add a new top-level key `shortcutHelp` in both zh and en with structured shortcut data. Place it after `UI_TEXT`:

```typescript
export const SHORTCUT_HELP: Record<AppLanguage, { area: string; shortcuts: { key: string; desc: string }[] }[]> = {
  zh: [
    { area: "全局", shortcuts: [
      { key: "Ctrl + S", desc: "立即保存" },
    ]},
    { area: "文本编辑", shortcuts: [
      { key: "Tab", desc: "增加缩进" },
      { key: "Shift + Tab", desc: "减少缩进" },
      { key: "Enter", desc: "换行（延续缩进）" },
      { key: "Backspace", desc: "空缩进行减少缩进" },
      { key: "右键", desc: "复制 / 粘贴" },
    ]},
    { area: "提醒事项", shortcuts: [
      { key: "单击空白", desc: "新增提醒" },
      { key: "拖动", desc: "调整顺序" },
      { key: "右键", desc: "复制 / 删除 / 星标 / 通知" },
    ]},
    { area: "截图", shortcuts: [
      { key: "Ctrl + V", desc: "粘贴截图" },
      { key: "预览中滚轮", desc: "缩放" },
      { key: "← / →", desc: "切换图片" },
      { key: "Enter", desc: "复制图片" },
      { key: "Delete", desc: "删除图片" },
      { key: "Esc / Space", desc: "关闭预览" },
    ]},
    { area: "快捷动作", shortcuts: [
      { key: "拖入文本/URL", desc: "自动创建动作" },
      { key: "右键", desc: "编辑 / 隐藏 / 删除" },
    ]},
  ],
  en: [
    { area: "Global", shortcuts: [
      { key: "Ctrl + S", desc: "Save immediately" },
    ]},
    { area: "Text Editing", shortcuts: [
      { key: "Tab", desc: "Increase indent" },
      { key: "Shift + Tab", desc: "Decrease indent" },
      { key: "Enter", desc: "New line (keep indent)" },
      { key: "Backspace", desc: "Decrease indent on empty line" },
      { key: "Right-click", desc: "Copy / Paste" },
    ]},
    { area: "Reminders", shortcuts: [
      { key: "Click blank", desc: "Add reminder" },
      { key: "Drag", desc: "Reorder" },
      { key: "Right-click", desc: "Copy / Delete / Star / Notify" },
    ]},
    { area: "Screenshots", shortcuts: [
      { key: "Ctrl + V", desc: "Paste screenshot" },
      { key: "Scroll wheel (preview)", desc: "Zoom" },
      { key: "← / →", desc: "Switch image" },
      { key: "Enter", desc: "Copy image" },
      { key: "Delete", desc: "Delete image" },
      { key: "Esc / Space", desc: "Close preview" },
    ]},
    { area: "Quick Actions", shortcuts: [
      { key: "Drag text/URL", desc: "Auto-create action" },
      { key: "Right-click", desc: "Edit / Hide / Delete" },
    ]},
  ],
};
```

- [ ] **Step 2: Create ShortcutHelp.vue**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { NModal, NScrollbar } from "naive-ui";
import type { AppLanguage } from "../types";
import { getUiText } from "../state/i18n";
import { SHORTCUT_HELP } from "../state/i18n";

const props = withDefaults(defineProps<{
  show: boolean;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{ close: [] }>();
const uiText = computed(() => getUiText(props.language));
const sections = computed(() => SHORTCUT_HELP[props.language === "en" ? "en" : "zh"]);
</script>

<template>
  <NModal :show="show" preset="card" :title="uiText.settings.shortcutHelp" class="shortcut-help-modal" @update:show="(v) => !v && emit('close')">
    <NScrollbar class="shortcut-help-content">
      <div v-for="section in sections" :key="section.area" class="shortcut-section">
        <h4>{{ section.area }}</h4>
        <div v-for="item in section.shortcuts" :key="item.key" class="shortcut-row">
          <kbd>{{ item.key }}</kbd>
          <span>{{ item.desc }}</span>
        </div>
      </div>
    </NScrollbar>
  </NModal>
</template>
```

- [ ] **Step 3: Add shortcut help CSS**

Add to `src/styles.css`:

```css
.shortcut-help-modal .n-card__content {
  padding: 0 !important;
}

.shortcut-help-content {
  max-height: 60vh;
  padding: 16px 20px;
}

.shortcut-section {
  margin-bottom: 16px;
}

.shortcut-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  font-size: var(--app-font-size);
}

.shortcut-row kbd {
  display: inline-block;
  min-width: 120px;
  padding: 2px 8px;
  background: var(--button);
  border: 1px solid var(--line-subtle);
  border-radius: 4px;
  font-family: inherit;
  font-size: calc(var(--app-font-size) - 1px);
  text-align: center;
  color: var(--text);
}

.shortcut-row span {
  color: var(--text);
}
```

- [ ] **Step 4: Update SettingsMenu.vue**

Add import: `KeyboardOutline` from `@vicons/ionicons5`.

Add `shortcutHelp` to the emit:
```typescript
const emit = defineEmits<{
  // ... existing emits
  shortcutHelp: [];
}>();
```

In the `options` computed, add a new entry before "About" (`InformationCircleOutline`):
```typescript
{ label: uiText.value.settings.shortcutHelp, key: "shortcut-help", icon: () => h(NIcon, { size: 16 }, { default: () => h(KeyboardOutline) }) },
```

In `handleMenuSelect`, add:
```typescript
if (key === "shortcut-help") {
  emit("shortcutHelp");
  return;
}
```

- [ ] **Step 5: Wire up in App.vue**

Import `ShortcutHelp` component. Add a ref `shortcutHelpVisible = ref(false)`. Add the component to the template:

```html
<ShortcutHelp :show="shortcutHelpVisible" :language="language" @close="shortcutHelpVisible = false" />
```

Connect the SettingsMenu's `@shortcut-help` event to set `shortcutHelpVisible = true`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ShortcutHelp.vue src/components/SettingsMenu.vue src/state/i18n.ts src/App.vue src/styles.css
git commit -m "feat: add keyboard shortcuts help modal in settings"
```

---

### Task 8: Drag-Paste at Cursor Position

**Files:** `src/components/TextPanel.vue`

- [ ] **Step 1: Add dropCaretOffset ref**

```typescript
const dropCaretOffset = ref<number | null>(null);
```

- [ ] **Step 2: Create computeCaretOffset helper**

```typescript
function computeCaretOffset(event: DragEvent): number | null {
  const textarea = textareaRef.value;
  if (!textarea) return null;
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
    ?? (document as any).caretPositionFromPoint?.(event.clientX, event.clientY);
  if (!range) return null;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(textarea);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}
```

Note: `caretRangeFromPoint` is Chrome/Safari. `caretPositionFromPoint` is Firefox. Textarea is a single text node so the offset is the character position.

Actually — textarea elements are NOT contenteditable. `caretRangeFromPoint` works on the DOM, not on textarea internals. For a `<textarea>`, we need a different approach:

Calculate offset from the mouse position relative to the textarea bounds, using the textarea's scroll position and the font metrics. But this is fragile.

**Simpler approach:** On drop, use `textarea.selectionStart` after programmatically setting it. But dragover doesn't set selection on textarea.

**Practical approach for textarea:** Calculate the approximate character position from the click coordinates using a hidden mirror div or use `textarea.value.length` split by lines and estimate from Y position.

**Simplest working approach:**
1. During `handleDragOver`, compute the caret offset using a canvas measurement of text width to find the column, plus line height to find the row.
2. On drop, insert at that computed position.

Actually, the simplest reliable approach for a plain `<textarea>`:

```typescript
function getTextOffsetAtPoint(textarea: HTMLTextAreaElement, clientX: number, clientY: number): number {
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const paddingTop = parseFloat(style.paddingTop) || 0;

  const y = clientY - rect.top - paddingTop + textarea.scrollTop;
  const lineIndex = Math.min(Math.floor(y / lineHeight), textarea.value.split("\n").length - 1);
  const lines = textarea.value.split("\n");

  // Calculate column using canvas text measurement
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${style.fontSize} ${style.fontFamily}`;
  const lineText = lines[lineIndex];
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const x = clientX - rect.left - paddingLeft + textarea.scrollLeft;

  let col = 0;
  for (let i = 0; i < lineText.length; i++) {
    if (ctx.measureText(lineText.slice(0, i + 1)).width >= x) break;
    col = i + 1;
  }

  // Return absolute offset
  return lines.slice(0, lineIndex).reduce((sum, l) => sum + l.length + 1, 0) + col;
}
```

- [ ] **Step 3: Update handleDragOver to track caret position**

```typescript
function handleDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  const isInternalDrag = (event.target as HTMLElement)?.closest?.("textarea");
  if (!isInternalDrag && (types.includes("text/plain") || types.includes("text/uri-list"))) {
    event.preventDefault();
    isDragHover.value = true;
    const textarea = textareaRef.value;
    if (textarea && editing.value) {
      dropCaretOffset.value = getTextOffsetAtPoint(textarea, event.clientX, event.clientY);
    }
  }
}
```

- [ ] **Step 4: Update handleExternalTextDrop to insert at offset**

Replace the existing `handleExternalTextDrop` with:

```typescript
function handleExternalTextDrop(event: DragEvent): void {
  isDragHover.value = false;
  dropCaretOffset.value = null;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) return;
  const dropped = event.dataTransfer?.getData("text/plain") ?? "";
  if (!dropped.trim()) return;
  event.preventDefault();
  event.stopPropagation();
  const textarea = textareaRef.value;
  if (textarea && !editing.value) startEditingFromTextarea(textarea);
  const offset = getTextOffsetAtPoint(textarea!, event.clientX, event.clientY);
  const current = text.value;
  const before = current.slice(0, offset);
  const after = current.slice(offset);
  const next = before + dropped + after;
  applyEditorText(next);
  if (textarea) {
    const cursorPos = offset + dropped.length;
    textarea.setSelectionRange(cursorPos, cursorPos);
  }
  emit("update", editorTextToLines(text.value));
}
```

- [ ] **Step 5: Clear caret on dragleave**

Update `handleDragLeaveClear`:

```typescript
function handleDragLeaveClear(): void {
  isDragHover.value = false;
  dropCaretOffset.value = null;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TextPanel.vue
git commit -m "feat: insert dropped text at cursor position instead of appending"
```

---

### Task 9: Update Tests and Final Verification

- [ ] **Step 1: Run tests**

```bash
npm test
```

Fix any failing tests caused by i18n changes (common.rename, settings.shortcutHelp).

- [ ] **Step 2: Run build**

```bash
npm run build
```

- [ ] **Step 3: Commit test fixes if needed**

```bash
git add -A
git commit -m "test: update expectations for v2 changes"
```

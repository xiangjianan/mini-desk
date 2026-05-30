# UI Polish & Interaction Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8 UI improvements — naming changes, overdue style deprioritization, drag-and-drop enhancements, drag highlight, and context menu icons.

**Architecture:** All changes are UI-layer only. No state schema changes. Uses existing HTML5 Drag & Drop API and existing `@vicons/ionicons5` dependency.

**Tech Stack:** Vue 3, TypeScript, Naive UI, @vicons/ionicons5, CSS custom properties.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `src/state/i18n.ts` | Modify | Rename titles, labels, aria text |
| `src/styles.css` | Modify | Overdue style reset, drag-hover class |
| `src/components/QuickButtons.vue` | Modify | Drag-in URL/text handlers, menu icons |
| `src/components/TextPanel.vue` | Modify | Fix empty-area drag, drag highlight, menu icons |
| `src/components/TodoPanel.vue` | Modify | Menu icons |
| `src/components/ImagePanel.vue` | Modify | Menu icons |
| `src/components/SpacePanel.vue` | Modify | Menu icons |
| `src/components/TextPanel.vue` | Modify | Menu icons, drag highlight |

---

### Task 1: Naming Changes in i18n

**Files:**
- Modify: `src/state/i18n.ts`

- [ ] **Step 1: Update DEFAULT_TODO_TITLES** (lines 5-16)

Replace the emoji prefixes and names for all three todo periods in both languages:

```typescript
const DEFAULT_TODO_TITLES: Record<AppLanguage, Record<string, string>> = {
  zh: {
    morning: "☑️ 待办",
    noon: "💼 工作",
    evening: "📚 学习",
  },
  en: {
    morning: "☑️ To-Do",
    noon: "💼 Work",
    evening: "📚 Study",
  },
};
```

- [ ] **Step 2: Update DEFAULT_TITLES_BY_LANGUAGE** (lines 29-52)

Replace the zh and en entries for todo titles, workspace title, quick title, and image title:

```typescript
export const DEFAULT_TITLES_BY_LANGUAGE: Record<AppLanguage, Record<string, string>> = {
  zh: {
    "image-title": "🖼️ 图床",
    "note-title": "📝 便签",
    "quick-title": "⚡ 快捷动作",
    "today-focus-title": "重点事项",
    "todo-morning-title": "☑️ 待办",
    "todo-noon-title": "💼 工作",
    "todo-evening-title": "📚 学习",
    "workspace-title": "📝 记事本.txt",
    "storage-title": "🛠 双击可改名",
  },
  en: {
    "image-title": "🖼️ Image Bed",
    "note-title": "📝 Notes",
    "quick-title": "⚡ Quick Actions",
    "today-focus-title": "Pinned Reminders",
    "todo-morning-title": "☑️ To-Do",
    "todo-noon-title": "💼 Work",
    "todo-evening-title": "📚 Study",
    "workspace-title": "📝 Notepad.txt",
    "storage-title": "🛠 Double-click to rename",
  },
};
```

- [ ] **Step 3: Update AREA_HELP_BY_LANGUAGE quickButtons and workspace entries** (lines 77-94)

```typescript
zh: {
  // ... images and note stay the same
  quickButtons: "快捷区：常用内容一键打开或复制。",
  todos: "提醒区：标题可双击改名。",
  workspace: "记事本：拆步骤，稳稳推进。",
  storage: "扩展区：放长期保留的内容。",
},
en: {
  // ... images and note stay the same
  quickButtons: "Quick Actions: open links or copy text.",
  todos: "Reminders: double-click titles to rename.",
  workspace: "Notepad: break work into steps.",
  storage: "Storage: keep long-lived reference material.",
},
```

- [ ] **Step 4: Update UI_TEXT quick.menu and images.list** (lines 382-635)

In the `zh` section:
```typescript
quick: {
  menu: "快捷动作菜单",
  // ... rest stays the same, but update untitledLink → untitledAction if desired
  // Actually, keep individual item names as-is, only change "menu" and aria labels
},
images: {
  list: "图床图片列表",
  // ... rest stays the same
},
```

In the `en` section:
```typescript
quick: {
  menu: "Quick actions menu",
  list: "Quick buttons list",
  // ... rest unchanged
},
images: {
  list: "Image list",
  // ... rest unchanged
},
```

- [ ] **Step 5: Update app.aboutDescription** (lines 382-551)

zh: `"一个本地优先的轻量工作台，用来整理截图、便签、提醒事项、快捷动作和工作空间。"`
en: `"A local-first lightweight workspace for organizing screenshots, notes, reminders, quick actions, and workspaces."`

- [ ] **Step 6: Update GUIDE_MESSAGES quickButtons references** (lines 145-157 zh, 277-289 en)

In zh quickButtons guide messages, replace "链接" with "动作" where appropriate:
- `"右键菜单可以隐藏链接。"` → `"右键菜单可以隐藏动作。"`
- `"右键菜单可以编辑链接。"` → `"右键菜单可以编辑动作。"`
- `"按住链接拖动可以排序。"` → `"按住动作拖动可以排序。"`
- `"显示隐藏项可以找回低频链接。"` → `"显示隐藏项可以找回低频动作。"`
- `"隐藏不会删除链接数据。"` → `"隐藏不会删除动作数据。"`

In en quickButtons:
- `"Use the context menu to hide a link."` → `"Use the context menu to hide an action."`
- `"Use the context menu to edit a link."` → `"Use the context menu to edit an action."`
- `"Drag links to reorder them."` → `"Drag actions to reorder them."`
- `"Show hidden items to recover low-use links."` → `"Show hidden items to recover low-use actions."`
- `"Hiding a link never deletes its data."` → `"Hiding an action never deletes its data."`

Also update en addQuick messages (lines 338-342):
- `"Saved items appear in Quick Links."` → `"Saved items appear in Quick Actions."`

- [ ] **Step 7: Commit**

```bash
git add src/state/i18n.ts
git commit -m "feat: rename panels and update i18n labels"
```

---

### Task 2: Overdue Style Deprioritization

**Files:**
- Modify: `src/styles.css` (lines 1244-1307)

- [ ] **Step 1: Reset deadline-overdue background and border**

Replace lines 1244-1247:

```css
.todo-item.deadline-overdue,
.today-focus-item.deadline-overdue {
  background: transparent;
}
```

- [ ] **Step 2: Remove overdue from the ::before border-left rule**

Replace lines 1264-1279 so the `::before` pseudo-element rule no longer includes `deadline-overdue`:

```css
.todo-item.deadline-due-soon::before,
.todo-item.deadline-upcoming::before,
.todo-item.deadline-later::before,
.today-focus-item.deadline-due-soon::before,
.today-focus-item.deadline-upcoming::before,
.today-focus-item.deadline-later::before {
  content: "";
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 3px;
  pointer-events: none;
}
```

- [ ] **Step 3: Remove overdue from the red border rule**

Replace lines 1281-1286 to remove `deadline-overdue` from the red border selectors:

```css
.todo-item.deadline-due-soon::before,
.today-focus-item.deadline-due-soon::before {
  background: #ef4444;
}
```

- [ ] **Step 4: Update overdue label color**

Replace lines 1299-1303 so overdue uses gray instead of bold red:

```css
.deadline-overdue .todo-deadline-label {
  color: #9ca3af;
}
```

Note: `deadline-due-soon` keeps its own rule on the next line:
```css
.deadline-due-soon .todo-deadline-label {
  color: #b91c1c;
  font-weight: 600;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/styles.css
git commit -m "feat: deprioritize overdue styling to low-stimulus gray"
```

---

### Task 3: Workspace Empty-Area Drag Fix

**Files:**
- Modify: `src/components/TextPanel.vue`

- [ ] **Step 1: Replace @dragover.prevent with a conditional handler**

On line 518, change:
```html
<div class="text-editor-frame" @contextmenu="openTextMenu" @dragover.prevent @drop="handleExternalTextDrop">
```

to:
```html
<div class="text-editor-frame" @contextmenu="openTextMenu" @dragover="handleDragOver" @drop="handleExternalTextDrop">
```

- [ ] **Step 2: Add handleDragOver function**

Add this function before `handleExternalTextDrop` (around line 157):

```typescript
function handleDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") || types.includes("text/uri-list")) {
    event.preventDefault();
  }
}
```

- [ ] **Step 3: Verify handleExternalTextDrop still works**

The existing `handleExternalTextDrop` (lines 158-174) already reads `text/plain` data and calls `event.preventDefault()`. No changes needed there — it only fires on actual drops.

- [ ] **Step 4: Commit**

```bash
git add src/components/TextPanel.vue
git commit -m "fix: prevent workspace panel drag on empty area"
```

---

### Task 4: Quick Action Drag-in URL and Text

**Files:**
- Modify: `src/components/QuickButtons.vue`

- [ ] **Step 1: Add drag-over and drop handlers to the panel container**

On line 182, add drag event handlers to the section element:

```html
<section
  class="split-block quick-block"
  @click="handleAreaClick"
  @contextmenu="openAreaMenu"
  @dragover="handleQuickDragOver"
  @dragleave="handleQuickDragLeave"
  @drop="handleQuickDrop"
>
```

- [ ] **Step 2: Add the drag handler functions**

Add these functions after `handleToggleShowHidden` (around line 178):

```typescript
function handleQuickDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain")) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
  }
}

function handleQuickDragLeave(): void {
  // highlight removal handled by Task 5 drag-hover class
}

function handleQuickDrop(event: DragEvent): void {
  event.preventDefault();
  const text = event.dataTransfer?.getData("text/plain") ?? "";
  if (!text.trim()) return;

  const isUrl = /^https?:\/\//.test(text.trim());
  const title = isUrl
    ? (() => { try { return new URL(text.trim()).hostname; } catch { return text.trim().slice(0, 20); } })()
    : text.trim().slice(0, 20);
  const type: QuickButtonType = isUrl ? "link" : "text";

  emit("save", { title, value: text.trim(), type });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickButtons.vue
git commit -m "feat: drag URL or text into quick actions to auto-create"
```

---

### Task 5: Drag Text Highlight

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/TextPanel.vue`
- Modify: `src/components/QuickButtons.vue`
- Modify: `src/components/ImagePanel.vue`
- Modify: `src/components/TodoPanel.vue`

- [ ] **Step 1: Add drag-hover CSS class to styles.css**

Add at the end of `styles.css` (before any @media queries):

```css
/* Drag text highlight */
.panel.drag-hover,
.text-panel.drag-hover,
.split-block.drag-hover,
.todo-panel.drag-hover {
  outline: 2px dashed var(--line-focus);
  outline-offset: -2px;
  transition: outline 0.15s ease;
}
```

Note: Uses `var(--line-focus)` (#6f7b88 light / #9aa6b2 dark) instead of a non-existent `--accent` variable.

- [ ] **Step 2: Add drag highlight to TextPanel.vue**

In the `<script setup>`, add:

```typescript
const isDragHover = ref(false);

function handleDragEnter(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    isDragHover.value = true;
  }
}

function handleDragLeaveClear(): void {
  isDragHover.value = false;
}
```

Update `handleDragOver` from Task 3 to also set `isDragHover`:

```typescript
function handleDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") || types.includes("text/uri-list")) {
    event.preventDefault();
    isDragHover.value = true;
  }
}
```

In the template, update the section element (line 505):

```html
<section class="text-panel" :class="[textPanelClasses, { 'drag-hover': isDragHover }]" @dragenter="handleDragEnter" @dragleave="handleDragLeaveClear" @drop="handleDragLeaveClear">
```

- [ ] **Step 3: Add drag highlight to QuickButtons.vue**

Add reactive state and update the handlers from Task 4:

```typescript
const isDragHover = ref(false);

function handleQuickDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
    isDragHover.value = true;
  }
}

function handleQuickDragLeave(): void {
  isDragHover.value = false;
}

function handleQuickDrop(event: DragEvent): void {
  event.preventDefault();
  isDragHover.value = false;
  // ... rest of drop logic from Task 4
}
```

Update the section element in template:

```html
<section
  class="split-block quick-block"
  :class="{ 'drag-hover': isDragHover }"
  @click="handleAreaClick"
  @contextmenu="openAreaMenu"
  @dragover="handleQuickDragOver"
  @dragleave="handleQuickDragLeave"
  @drop="handleQuickDrop"
>
```

- [ ] **Step 4: Add drag highlight to ImagePanel.vue**

Add in script:

```typescript
const isDragHover = ref(false);

function handleImageDragEnter(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    isDragHover.value = true;
  }
}

function handleImageDragLeave(): void {
  isDragHover.value = false;
}
```

On the root section element, add `:class="{ 'drag-hover': isDragHover }"` and `@dragenter="handleImageDragEnter" @dragleave="handleImageDragLeave" @drop="handleImageDragLeave"`.

- [ ] **Step 5: Add drag highlight to TodoPanel.vue**

Add in script:

```typescript
const isDragHover = ref(false);

function handleTodoDragEnter(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    isDragHover.value = true;
  }
}

function handleTodoDragLeave(): void {
  isDragHover.value = false;
}
```

On the root section element, add `:class="{ 'drag-hover': isDragHover }"` and `@dragenter="handleTodoDragEnter" @dragleave="handleTodoDragLeave" @drop="handleTodoDragLeave"`.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/components/TextPanel.vue src/components/QuickButtons.vue src/components/ImagePanel.vue src/components/TodoPanel.vue
git commit -m "feat: highlight panels when dragging text over them"
```

---

### Task 6: Context Menu Icons — ImagePanel

**Files:**
- Modify: `src/components/ImagePanel.vue`

- [ ] **Step 1: Add icon imports**

At the top of the `<script setup>`, add:

```typescript
import { NIcon } from "naive-ui";
import { ClipboardOutline, CopyOutline, EyeOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
```

- [ ] **Step 2: Create icon rendering helper**

Add a helper function:

```typescript
function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
```

Add the necessary imports at top:
```typescript
import { computed, h, onMounted, onUnmounted, ref } from "vue";
import type { Component, VNode } from "vue";
```

- [ ] **Step 3: Update menuOptions with icons**

```typescript
const menuOptions = computed<DropdownOption[]>(() =>
  menu.value?.id
    ? [
        { label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) },
        { label: uiText.value.common.preview, key: "preview", icon: renderIcon(EyeOutline) },
        { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) },
        { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
      ]
    : [
        { label: uiText.value.images.pasteImage, key: "paste", icon: renderIcon(ClipboardOutline) },
        { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
      ],
);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ImagePanel.vue
git commit -m "feat: add icons to ImagePanel context menu"
```

---

### Task 7: Context Menu Icons — QuickButtons

**Files:**
- Modify: `src/components/QuickButtons.vue`

- [ ] **Step 1: Add icon imports**

Add to existing imports:

```typescript
import { h } from "vue";
import type { Component, VNode } from "vue";
import { AddOutline, CreateOutline, EyeOffOutline, EyeOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
```

Note: `CopyOutline` and `NIcon` are already imported.

- [ ] **Step 2: Add renderIcon helper**

```typescript
function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
```

- [ ] **Step 3: Update menuOptions with icons**

```typescript
const menuOptions = computed<DropdownOption[]>(() => {
  const button = props.buttons.find((item) => item.id === menu.value?.id);
  if (!menu.value?.id) {
    return [
      { label: uiText.value.quick.add, key: "add", icon: renderIcon(AddOutline) },
      { label: props.showHidden ? uiText.value.quick.hideHidden : uiText.value.quick.showHidden, key: "toggle-show-hidden", icon: renderIcon(props.showHidden ? EyeOffOutline : EyeOutline) },
      { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
    ];
  }
  return [
    { label: uiText.value.common.edit, key: "edit", icon: renderIcon(CreateOutline) },
    { label: button?.hidden ? uiText.value.quick.show : uiText.value.quick.hide, key: "toggle-hidden", icon: renderIcon(button?.hidden ? EyeOutline : EyeOffOutline) },
    { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) },
    { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
  ];
});
```

- [ ] **Step 4: Commit**

```bash
git add src/components/QuickButtons.vue
git commit -m "feat: add icons to QuickButtons context menu"
```

---

### Task 8: Context Menu Icons — TodoPanel

**Files:**
- Modify: `src/components/TodoPanel.vue`

- [ ] **Step 1: Add icon imports**

Add to existing icon imports (line 3):

```typescript
import {
  AlarmOutline,
  CheckmarkDoneOutline,
  ChevronDownOutline,
  ClipboardOutline,
  CopyOutline,
  CreateOutline,
  HelpCircleOutline,
  ListOutline,
  NotificationsOutline,
  Star,
  StarOutline,
  TrashOutline,
} from "@vicons/ionicons5";
```

Add `h` to vue imports:
```typescript
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { Component, VNode } from "vue";
```

- [ ] **Step 2: Add renderIcon helper**

```typescript
function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
```

- [ ] **Step 3: Update menuOptions with icons**

For the `sectionActions` branch:

```typescript
if (menu.value?.sectionActions) {
  const list = getListById(menu.value.period);
  if (!list) return [{ ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) }];
  return [
    { label: uiText.value.todo.clearCompleted, key: "clear-completed", icon: renderIcon(CheckmarkDoneOutline) },
    { label: isCompletedVisible(list.id) ? uiText.value.todo.hideCompleted : uiText.value.todo.showCompleted, key: "toggle-completed", icon: renderIcon(CheckmarkDoneOutline) },
    { label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(ListOutline) },
    { label: uiText.value.todo.editList, key: "edit-list", icon: renderIcon(CreateOutline) },
    { label: uiText.value.todo.deleteList, key: "delete-list", disabled: effectiveTodoLists.value.length <= 1, icon: renderIcon(TrashOutline) },
    { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
  ];
}
```

For the empty-area branch:

```typescript
if (!menu.value?.id) {
  options.push({ label: uiText.value.todo.newList, key: "create-list", icon: renderIcon(ListOutline) });
}
```

For the specific-todo branch:

```typescript
if (menu.value?.id) {
  options.push({ label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) });
  if (menu.value.target && canPasteTodoText(menu.value.period, menu.value.id, menu.value.target)) {
    options.push({ label: uiText.value.common.paste, key: "paste", icon: renderIcon(ClipboardOutline) });
  }
  options.push({
    label: isValidDeadlineAt(todo?.notifyAt) ? uiText.value.todo.editNotify : uiText.value.todo.setNotify,
    key: "notify",
    icon: renderIcon(NotificationsOutline),
  });
  options.push({ label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) });
  options.push({ label: todo?.starred ? uiText.value.todo.unstar : uiText.value.todo.star, key: "star", icon: renderIcon(todo?.starred ? Star : StarOutline) });
}
options.push({ ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) });
```

- [ ] **Step 4: Commit**

```bash
git add src/components/TodoPanel.vue
git commit -m "feat: add icons to TodoPanel context menu"
```

---

### Task 9: Context Menu Icons — SpacePanel

**Files:**
- Modify: `src/components/SpacePanel.vue`

- [ ] **Step 1: Add icon imports**

```typescript
import { h } from "vue";
import type { Component, VNode } from "vue";
import { NIcon } from "naive-ui";
import { CreateOutline, TrashOutline } from "@vicons/ionicons5";
```

- [ ] **Step 2: Add renderIcon helper**

```typescript
function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
```

- [ ] **Step 3: Update menuOptions with icons**

```typescript
const menuOptions = computed<DropdownOption[]>(() => [
  { label: uiText.value.common.edit, key: "edit", icon: renderIcon(CreateOutline) },
  { label: uiText.value.common.delete, key: "delete", disabled: !canDeleteSpaces.value, icon: renderIcon(TrashOutline) },
]);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SpacePanel.vue
git commit -m "feat: add icons to SpacePanel context menu"
```

---

### Task 10: Context Menu Icons — TextPanel

**Files:**
- Modify: `src/components/TextPanel.vue`

- [ ] **Step 1: Add icon imports**

```typescript
import { h } from "vue";
import type { Component, VNode } from "vue";
import { NIcon } from "naive-ui";
import { ClipboardOutline, CopyOutline, HelpCircleOutline } from "@vicons/ionicons5";
```

- [ ] **Step 2: Add renderIcon helper**

```typescript
function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}
```

- [ ] **Step 3: Update menuOptions with icons**

```typescript
const menuOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [];
  const target = menu.value?.target;
  if (target) {
    options.push({ label: uiText.value.common.copy, key: "copy", disabled: !canCopyTextSelection(target), icon: renderIcon(CopyOutline) });
    options.push({ label: uiText.value.common.paste, key: "paste", disabled: !menu.value?.canPaste, icon: renderIcon(ClipboardOutline) });
  }
  options.push({ ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) });
  return options;
});
```

- [ ] **Step 4: Commit**

```bash
git add src/components/TextPanel.vue
git commit -m "feat: add icons to TextPanel context menu"
```

---

### Task 11: Verify and Final Test

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

1. Todo period titles show "☑️ 待办", "💼 工作", "📚 学习"
2. Workspace title shows "📝 记事本.txt"
3. Quick action title shows "⚡ 快捷动作"
4. Image panel title shows "🖼️ 图床"
5. Overdue items have no red background/border, only gray label text
6. Cannot drag workspace panel by clicking empty area
7. Dragging text over any panel shows dashed outline highlight
8. Dragging files does NOT show highlight
9. Dragging URL into quick actions creates a link button
10. Dragging plain text into quick actions creates a text button
11. All right-click menus show icons before each item
12. Right-click menu icons are 16px, vertically centered

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address verification findings"
```

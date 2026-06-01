# UI Polish & Interaction Improvements Design

Date: 2026-05-30

## Overview

8 UI improvements covering naming, styling, drag-and-drop, and context menu icons for the todo board app.

## 1. Overdue Styling Deprioritization

**Files:** `src/styles.css`, `src/components/TodoPanel.vue`

Remove visual urgency from overdue items. Current red background + red border + bold red text is replaced with:

- No background color (transparent)
- No left border (none)
- Deadline label text color: `#9ca3af` (muted gray), no bold
- Todo text color: unchanged (normal)

The `.deadline-overdue` CSS class keeps its name but all red styling is removed. Only the gray label text provides a minimal status hint.

## 2. Workspace Empty-Area Drag Fix

**Files:** `src/components/TextPanel.vue`

Bug: dragging on empty workspace area moves the entire panel. Cause: `@dragover.prevent` on `.text-editor-frame` unconditionally prevents default.

Fix: in dragover/drop handlers, only call `preventDefault()` when `dataTransfer.types` contains `text/plain` or `text/uri-list`. Let browser handle empty drags naturally (nothing happens).

## 3. Naming Changes

**Files:** `src/state/i18n.ts`

| Key | Current (zh) | New (zh) | Current (en) | New (en) |
|---|---|---|---|---|
| DEFAULT_TODO_TITLES morning | `☀️ 早上` | `☑️ 待办` | `☀️ Morning` | `☑️ To-Do` |
| DEFAULT_TODO_TITLES noon | `🌤️ 中午` | `💼 工作` | `🌤️ Noon` | `💼 Work` |
| DEFAULT_TODO_TITLES evening | `🌙 晚上` | `📚 学习` | `🌙 Evening` | `📚 Study` |
| workspace-title | `📁 工作空间` | `📝 记事本.txt` | `📁 Workspace` | `📝 Notepad.txt` |
| quick-title | `🔗 快捷链接` | `⚡ 快捷动作` | `🔗 Quick Links` | `⚡ Quick Actions` |
| image-title | `🎨 截图` | `🖼️ 图床` | `🎨 Screenshots` | `🖼️ Image Bed` |

All aria/help text referencing "链接书签" or "link bookmark" updated to "动作" / "action".

## 4. Quick Action Area: Drag-in URL

**Files:** `src/components/QuickButtons.vue`

- Panel container listens for `dragover` + `drop`
- On drop, read `dataTransfer.getData('text/plain')`
- If text matches `/^https?:\/\//`, auto-create `{ type: "link", value: url, title: hostname from URL }`
- Emit new button to parent for state persistence
- Click behavior unchanged: `window.open(value, '_blank')`

## 5. Quick Action Area: Drag-in Plain Text

**Files:** `src/components/QuickButtons.vue`

- Same drop handler as #4
- If text does NOT match URL pattern, auto-create `{ type: "text", value: text, title: text.slice(0, 20) }`
- Click behavior: `navigator.clipboard.writeText(value)` + toast/feedback bubble confirming copy

## 6. Drag Text Highlight

**Files:** `src/styles.css`, `src/App.vue`, panel components

Behavior:
- `dragenter`: check `dataTransfer.types` for `text/plain` — if present, add `.drag-hover` class to panel container
- `dragleave` + `drop`: remove `.drag-hover`
- File drags (`types` contains `Files`) do NOT trigger highlight

Style:
```css
.panel.drag-hover {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
  background: rgba(var(--accent-rgb), 0.04);
}
```

## 7. Quick Action Naming

Covered by #3 naming changes. All UI text, aria labels, and help messages use "动作" / "action" terminology.

## 8. Context Menu Icons

**Files:** All components with right-click menus (`ImagePanel.vue`, `QuickButtons.vue`, `TodoPanel.vue`, `TextPanel.vue`, `SpacePanel.vue`)

Use `@vicons/ionicons5` (already a project dependency). Render as `<NIcon :size="16">` before menu text, vertically centered, 6px gap.

| Menu Item | Icon |
|---|---|
| Add | `AddOutline` |
| Edit | `CreateOutline` |
| Delete | `TrashOutline` |
| Copy | `CopyOutline` |
| Paste | `ClipboardOutline` |
| Preview | `EyeOutline` |
| Star | `StarOutline` |
| Unstar | `Star` |
| Hide | `EyeOffOutline` |
| Show | `EyeOutline` |
| Clear completed | `CheckmarkDoneOutline` |
| Create list | `ListOutline` |
| Edit list | `CreateOutline` |
| Delete list | `TrashOutline` |
| Guide/Help | `HelpCircleOutline` |
| Set notification | `NotificationsOutline` |
| Expand hidden | `ExpandOutline` |
| Collapse hidden | `ContractOutline` |

## Implementation Notes

- All features are independent UI-layer changes; no state schema changes required.
- Drag-and-drop features (#2, #4, #5, #6) use native HTML5 Drag & Drop API (consistent with existing codebase).
- No new dependencies needed — `@vicons/ionicons5` and `naive-ui` are already installed.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page To Do List kanban board built with Vue 3, Naive UI, TypeScript, and Vite. Run it with `npm run dev`, build it with `npm run build`, and test it with `npm test`.

## Architecture

The app mounts from `src/main.ts` into `#app` and composes the board in `src/App.vue`. Domain logic is split into typed modules under `src/state/`, with presentational and workflow components under `src/components/`.

### Layout

CSS Grid 4-column layout (`.workbench-grid`, assembled by `src/components/WorkbenchShell.vue`): the four zones split the full page width left-to-right in the ratio (1−0.618):0.618:0.618:1 (`PHI`-derived `DEFAULT_COLUMN_WEIGHTS` = [1−1/φ, 1/φ, 1/φ, 1], normalized ≈ 14.6%/23.6%/23.6%/38.2%) — Workspace (notes + storage) is the golden emphasis. The weights describe the divider-to-divider on-screen span; the outer zones hug the page edges (grid gap/padding are 0, and `splitWidthByWeights` in WorkbenchShell.vue divides the full width by weight so the ratios hold exactly and survive window resizes). Every zone is collapsible via a rail and resizable via separator handles.

### State Management

- All state is held in a single `state` object, persisted to `localStorage` under key `mini-desk-state-v1`, with legacy reads from `todo-board-state-v1`.
- `loadState()` and `normalizeImportedState()` live in `src/state/storage.ts` and handle legacy migrations, malformed imports, and missing collections. Legacy single-board (flat) payloads are wrapped into a single `WorkspaceData` on load; multi-workspace payloads are normalized per workspace.
- `saveState()` serializes the full state while omitting large image payloads from localStorage.
- **Multi-workspace:** the board supports multiple independent workspaces. Global prefs (theme/language/companion GIF) are shared; all board content lives per-workspace. The active workspace is read/mutated through an `activeWorkspace` computed projection in `App.vue` (`activeWorkspace.value.*`); switching only changes `state.activeWorkspaceId`. Workspace helpers live in `src/state/workspaces.ts`; image payload pruning scans every workspace (and undo snapshots).

### Key State Shape

```
state = {
  // global prefs (shared across all workspaces)
  theme: "light" | "dark",
  language: "zh" | "en",
  companionGifTheme, customCompanionGif, customCompanionGifStored,
  sync: { revision, updatedAt, clientId },
  workspaces: [WorkspaceData],   // each workspace is a fully independent board
  activeWorkspaceId: string,
}

WorkspaceData = {
  id, createdAt,
  customTitles: { [headingId]: string },  // incl. "board-title", "board-slogan", and panel titles
  noteLines, workspaceLines, storageLines: [{ text, indent }],
  spaces: [{ id, title, lines }], activeSpaceId,  // middle-column sub-tabs
  images: [{ id, src (data URL), createdAt }],
  quickTags, quickButtons: [{ id, title, value, type: "link"|"text"|"api", hidden }],
  quickOtherCollapsed, showHiddenQuickButtons,
  todoLists: [{ id, title, collapsed, compact }],
  showCompletedTodos: { [listId]: boolean },
  todos: { [listId]: [{ id, text, done }] },
}
```

### Line Editors

The notes area (`SpacePanel.vue` space tabs) shares a single `TextPanel.vue` whose editor is one native `<textarea>` (plain text, `\n`-separated lines, 4-space indent via `INDENT_UNIT` in `src/utils/textEditor.ts`). Tab/Shift+Tab indents, Enter continues list markers, Cmd+arrows move/jump lines, and `renumberOrderedListText` rewrites ordered-list prefixes on every input.

### Save Triggers

- `Ctrl+S`: immediate full save with save bubble animation.
- Line editor input: 3-second debounce, flushed on blur.
- Todo text input: 1-second debounce (shares the text pipeline's generation baseline), flushed on blur, Ctrl+S, structural saves, workspace switch, and beforeunload. IME composition events are suppressed until commit.
- Structural edits (add/split/complete/remove/...) save immediately via `persistNow()` and supersede pending debounced saves.
- Save bubble shows a random message + kaomoji from predefined arrays (explicit saves only; debounced auto-saves stay quiet).

### Theme System

Light/dark mode toggled via `data-theme` attribute on `<html>`. CSS custom properties in `:root` and `html[data-theme="dark"]` in `styles.css`.

### Focus Companion

A GIF avatar (`static/video/mini-desk-cat.gif` by default — themes: cat / ikun / custom / none) that appears near the focused editor or at the bottom-right corner on `Ctrl+S`. Positioned absolutely relative to the editor's bounding rect.

## Development

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

`npm run preview` builds and serves the production bundle locally — the only way to verify Service Worker offline behavior, since dev mode deliberately never registers the SW (unhashed assets + HMR make SW caching in dev an anti-pattern).

「现在做这个」专注弹窗：提醒事项右键菜单首项与行内累计时长徽标（`⏱ h:mm`，点击续做，两处行渲染）双入口打开 `src/components/TodoFocusModal.vue`——90% 屏占比的 NModal（专属 18px 强虚化遮罩 `:has(.focus-now-modal)` 作用域，卡片头弃用由 `.focus-now-header` 承担：居中标题/带时钟图标的计时/右上 ✕），下方左 10% 贴图条（`ImagePanel` 的 `hide-header`+`can-edit=false` 紧凑形态）+ 右 90% 记事本（直嵌 `TextPanel`，desk.css 补 `.focus-now-modal` 作用域对齐 `.workbench-shell` 的 14px 排版——弹窗挂在 body 下吃不到原规则）。数据挂 `TodoItem` 可选字段 `focusElapsedMs`/`focusNotes`/`focusImages`（`updateTodoFocus` 迁移、序列化剥载荷、归一化收字段）；计时单一事实源在 App 的 `focusSession`（60s checkpoint `persistNow({recordCheckpoint:false})` 不产生撤销快照、关窗/beforeunload 合并增量、任务消失即丢弃会话）；预览/编辑浮层内嵌右侧记事本区上方（绝对定位保滚动位置），工具栏与键盘交互完全复刻主页面 ImagePreview（`.preview-actions` 全局样式直用：翻页/缩放/拖拽/5、WASD、Ctrl+C/V、Enter 编辑、编辑器保存经 `saveImage` 上抛 App 做载荷版本切换+旧载荷宽限回收）。生命周期：完成=保留全部专注数据作追溯备份（徽标在已完成行继续可读）；右键删除/清空已完成/删列表/删工作区/失焦空删五路连坐清空并 `scheduleImagePayloadDeletion`；保留 id 扫描（`isImagePayloadRetained`/`collectRetainedImagePayloadIds`/`extractRetainedImageIds`）与启动/导入内联载荷迁移（`collectInlineImagePayloads`）都覆盖 `focusImages`。打开弹窗时懒水合该任务贴图（幽灵过滤后**总是写回**——只按长度变化写回会让 src 永远进不了 state，预览空图）。

## Conventions

- All UI text is in Chinese (zh-CN).
- Prefer Vue components plus typed state helpers over ad hoc DOM manipulation.
- Image metadata is stored in localStorage; image payloads are stored in IndexedDB (no server-side storage).
- All delete operations require `window.confirm()` confirmation.
- Completed todos are sorted to the bottom of their period section.
- IDs are generated client-side: `${Date.now().toString(36)}-${random}`.

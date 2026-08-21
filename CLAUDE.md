# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page To Do List kanban board built with Vue 3, Naive UI, TypeScript, and Vite. Run it with `npm run dev`, build it with `npm run build`, and test it with `npm test`.

## Architecture

The app mounts from `src/main.ts` into `#app` and composes the board in `src/App.vue`. Domain logic is split into typed modules under `src/state/`, with presentational and workflow components under `src/components/`.

### Layout

CSS Grid 5-column layout (`.board`): Image panel (10%) | Notes+Links (20%) | Todos (20%) | Workspace (25%) | Storage+Theme toggle (25%).

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

### Line Editors (`ws-editor`)

The note, workspace, and storage panels use a custom line editor (not `<textarea>`). Each line is a `<div.ws-row>` containing an `<input.ws-input>`. Tab/Shift+Tab controls indent level. Enter splits the line. Backspace at column 0 merges with the previous line.

### Save Triggers

- `Ctrl+S`: immediate full save with save bubble animation.
- Line editor input: 3-second debounce, flushed on blur.
- Todo text input: 1-second debounce (shares the text pipeline's generation baseline), flushed on blur, Ctrl+S, structural saves, workspace switch, and beforeunload. IME composition events are suppressed until commit.
- Structural edits (add/split/complete/remove/...) save immediately via `persistNow()` and supersede pending debounced saves.
- Save bubble shows a random message + kaomoji from predefined arrays (explicit saves only; debounced auto-saves stay quiet).

### Theme System

Light/dark mode toggled via `data-theme` attribute on `<html>`. CSS custom properties in `:root` and `html[data-theme="dark"]` in `styles.css`.

### Focus Companion

A GIF avatar (`static/video/kun.gif` by default) that appears near the focused editor or at the bottom-right corner on `Ctrl+S`. Positioned absolutely relative to the editor's bounding rect.

## Development

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

`npm run preview` builds and serves the production bundle locally — the only way to verify Service Worker offline behavior, since dev mode deliberately never registers the SW (unhashed assets + HMR make SW caching in dev an anti-pattern).

## Conventions

- All UI text is in Chinese (zh-CN).
- Prefer Vue components plus typed state helpers over ad hoc DOM manipulation.
- Image metadata is stored in localStorage; image payloads are stored in IndexedDB (no server-side storage).
- All delete operations require `window.confirm()` confirmation.
- Completed todos are sorted to the bottom of their period section.
- IDs are generated client-side: `${Date.now().toString(36)}-${random}`.

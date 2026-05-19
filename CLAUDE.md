# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static, single-page To Do List kanban board built with vanilla HTML/CSS/JS. No build tools, no frameworks, no package manager. Open `index.html` directly in a browser to use. Deployed via Cloudflare Pages (`.wrangler` directory present).

## Architecture

The app is a single-file IIFE (`app.js`) wrapped in `DOMContentLoaded`. There is no module system — all state and logic lives in one closure.

### Layout

CSS Grid 5-column layout (`.board`): Image panel (10%) | Notes+Links (20%) | Todos (20%) | Workspace (25%) | Storage+Theme toggle (25%).

### State Management

- All state is held in a single `state` object, persisted to `localStorage` under key `todo-board-state-v1`.
- `loadState()` merges stored data with `defaultState` and handles legacy migrations (e.g. old `workspace` text field → new `workspaceLines` array).
- `saveState()` serializes the full state. There is no diffing — the entire object is written each time.

### Key State Shape

```
state = {
  theme: "light" | "dark",
  customTitles: { [headingId]: string },
  noteLines: [{ text, indent }],
  workspaceLines: [{ text, indent }],
  storageLines: [{ text, indent }],
  images: [{ id, src (data URL), createdAt }],
  quickButtons: [{ id, title, value, type: "link"|"text", hidden }],
  showHiddenQuickButtons: boolean,
  todos: { morning: [], noon: [], evening: [] }  // each: { id, text, done }
}
```

### Line Editors (`ws-editor`)

The note, workspace, and storage panels use a custom line editor (not `<textarea>`). Each line is a `<div.ws-row>` containing an `<input.ws-input>`. Tab/Shift+Tab controls indent level. Enter splits the line. Backspace at column 0 merges with the previous line.

### Save Triggers

- `Ctrl+S`: immediate full save with save bubble animation.
- Line editor input: 3-second debounce, flushed on blur.
- Todo input: saved on each keystroke (no debounce).
- Save bubble shows a random message + kaomoji from predefined arrays.

### Theme System

Light/dark mode toggled via `data-theme` attribute on `<html>`. CSS custom properties in `:root` and `html[data-theme="dark"]` in `styles.css`.

### Focus Companion

A GIF avatar (`static/video/hermes.gif`) that appears near the focused editor or at the bottom-right corner on `Ctrl+S`. Positioned absolutely relative to the editor's bounding rect.

## Development

No build, lint, or test commands. Open `index.html` in a browser. For a local server: `npx serve .` or `python3 -m http.server`.

## Conventions

- All UI text is in Chinese (zh-CN).
- No frameworks or external dependencies — vanilla JS only.
- Images are stored as data URLs in localStorage (no server-side storage).
- All delete operations require `window.confirm()` confirmation.
- Completed todos are sorted to the bottom of their period section.
- IDs are generated client-side: `${Date.now().toString(36)}-${random}`.

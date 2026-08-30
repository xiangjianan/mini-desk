# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page To Do List kanban board built with Vue 3, Naive UI, TypeScript, and Vite. Run it with `npm run dev`, build it with `npm run build`, and test it with `npm test`.

## Architecture

The app mounts from `src/main.ts` into `#app` and composes the board in `src/App.vue`. Domain logic is split into typed modules under `src/state/`, with presentational and workflow components under `src/components/`.

### Layout

CSS Grid 4-column layout (`.workbench-grid`, assembled by `src/components/WorkbenchShell.vue`, `0.15/0.2/0.35/0.3 fr`): Assets (images) | Notes (quick buttons) | Tasks (todos) | Workspace (notes + storage). Every zone is collapsible via a rail and resizable via separator handles.

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
  polishCode,  // 智能粘贴配对码（首次使用生成并注册，清空数据时注销）
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
  inbox?: { code, todoListId, noteTarget, lastSeenAt },  // 手机速记配对（noteTarget 为目标空间 Tab 的 id，失效回退第一个空间）；存在即启用拉取
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

`npm run preview:lan` additionally serves on all interfaces with self-signed HTTPS (`MINI_DESK_LAN=1` + `@vitejs/plugin-basic-ssl`) for real-device LAN testing — the mobile-inbox crypto (`crypto.subtle`) requires a secure context, so plain-HTTP LAN access would break capture sends. Devices must accept the certificate warning once.

The mobile-inbox relay is self-hosted: `server/` is a Flask + MySQL app (legacy-Worker-compatible protocol plus pairing-code registration — `POST /inbox/<key_hash>/register` (desktop registers codes on startup and on save/rotate; `INSERT IGNORE`, revocation is permanent), `GET /inbox/<key_hash>/status` (mobile verifies on code entry, network failures fail open), POSTs to unregistered codes return 404 `unknown_code` and to revoked codes 410; the `pairing_keys` table is created by `server/migrations/2026-08-26-pairing-keys.sql` (run once as root before deploying)). `POST /polish/<key_hash>`（桌面端智能粘贴：`kind∈todo/note` + `text`≤2000 字符，同步返回 `{items:[...]}`，LLM 失败返回 `200 {items:null,fallback:true}`，鉴权同注册制） Mobile captures are sent as **plaintext JSON** (`{"kind","text"}`) — E2E crypto was dropped once the relay moved to the self-hosted box. The server polishes each capture with DeepSeek in a background thread before storing (`server/llm.py`, `DEEPSEEK_API_KEY` env var, 30s timeout): POST acks immediately without storing, `kind=todo` is split into one row per reminder (`#N` id suffixes), `kind=note` is summarized into numbered lines, and any LLM failure falls back to storing the raw text. Non-JSON payloads (SW-cached old capture pages still encrypting) are stored as-is without polishing; the desktop decodes plaintext-JSON rows first and falls back to AES-GCM decryption for legacy rows. The key lives only in `/opt/minidesk-inbox/.env` (sourced by `server/run.sh` on restart); if it's missing the relay logs `[llm] DEEPSEEK_API_KEY 未配置` to stderr and stores raw text without polishing. It runs on the aliyun host at `/opt/minidesk-inbox` behind nginx on `https://relay.minidesk.online:8443`; `server/deploy.sh` rsyncs and restarts it. Local backend tests: `cd server && ./.venv/bin/python -m pytest` (needs MySQL on 127.0.0.1:3306, root passwordless). Local relay testing: point `VITE_INBOX_WORKER_URL` in `.env.local` at `http://127.0.0.1:8787` and run `gunicorn -b 127.0.0.1:8787 app:app` from `server/`.

桌面端智能粘贴：提醒事项/便签右键菜单「智能粘贴」把剪贴板全文发到 `/polish`（提醒区拆条成待办、便签区排版润色），结果直接插入、任何失败退化为原文粘贴并气泡提示；便签区选中文本后右键另有「智能润色」——对选中文本走同一润色流程并替换选区，失败/超长保留原文。配对码为全局 `state.polishCode`（首次使用生成并注册，清空数据时注销）；编排器在 `src/utils/smartPaste.ts`，网络层在 `src/sync/polishClient.ts`，气泡经各面板 `polishMessage` 事件上浮到 App.vue 的 `showBubbleText`。

Desktop clear/rotate of a pairing key fires the relay revocation in the background (failure only warns); switching to (or pairing) a workspace with an inbox triggers an immediate pull in addition to the 5-minute poll, and the mobile capture page shows a dedicated invalid-code error with a change-code action, keeps the draft across code changes, hides the bottom-right hint once paired, and sends via two direct buttons (发送到提醒 / 发送到便签) instead of a kind toggle. Phones verify pairing codes against `/status` when typed manually (fail-open on network errors; URL-fragment and remembered codes skip verification and rely on send-time errors), and send-time 404/410 both offer the change-code action.

Known test-suite noise (both pre-existing, safe to ignore after one re-run): `npm test` always ends with `Errors 1 error` (an unhandled IndexedDB stub rejection from `app-render.test.ts`), and the `输码验证 unknown/revoked` case in that same file flakes intermittently on full runs.

## Conventions

- All UI text is in Chinese (zh-CN).
- Prefer Vue components plus typed state helpers over ad hoc DOM manipulation.
- Image metadata is stored in localStorage; image payloads are stored in IndexedDB (no server-side storage).
- All delete operations require `window.confirm()` confirmation.
- Completed todos are sorted to the bottom of their period section.
- IDs are generated client-side: `${Date.now().toString(36)}-${random}`.

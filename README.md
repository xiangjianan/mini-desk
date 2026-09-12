# Mini Desk

**English** | [简体中文](README.zh-CN.md)

Mini Desk is a quiet little desk.

Screenshots, notes, reminders, and quick actions all live here — but it won't push you to become a machine.

Do less, do it well.

It gathers the loose bits of daily work into a local-first browser desktop: screenshots can wait, ideas can be parked, reminders can be finished slowly. Desktop density becomes a breathing reminder — light, fairly full, or overheated — and the animated companion only pops up gently on save, completion, cleanup, and when content grows.

Mini Desk is built with Vue 3, TypeScript, Vite, and Naive UI. The interface takes cues from Apple's Human Interface Guidelines, aiming for a compact, clear, low-distraction daily experience.

Mini Desk is also an AI coding experiment: the product thinking, interaction trade-offs, and aesthetic judgment come from a human, while 100% of the code — from the UI and state management to the self-hosted relay service — was written by AI (Claude Code) in conversation.

Page state lives in the browser's `localStorage`; image originals and custom GIF assets live in same-site IndexedDB. Apart from the self-hosted mobile-inbox relay, it depends on no backend service, making it a good fit as a personal browser workbench.

## Live site

- <https://minidesk.online>

## Quick start

```bash
npm install     # install dependencies
npm run dev     # start the local dev server
npm test        # run tests
npm run build   # build the production bundle
```

`npm run preview` builds and serves the production bundle — the only way to verify offline behavior (dev mode never registers the Service Worker). For real-device LAN debugging use `npm run preview:lan` (self-signed HTTPS; the mobile-inbox API requires a secure context, and devices must accept the certificate warning once).

## Feature overview

### Workbench

- Four-zone desktop workbench: images, quick actions, reminders, notes; drag the separators to resize zones, with the layout saved automatically.
- Zones shrunk below their minimum width collapse into vertical title rails; click a rail to expand the zone again.
- Each workspace can configure which zones are visible (the grid icon on each workspace-switcher entry).
- Top command bar: workspace switcher, save/density status badge, and slogan on the left; collapse-header, theme toggle, and settings menu on the right; the whole header can be collapsed.
- Manual light/dark theme switching; follows the system until you pick one.
- Zone titles support double-click renaming; major overlays share low-contrast borders and soft backgrounds instead of mixing visual languages.

### Multi-workspace

- Create, switch, rename, delete, and drag-reorder workspaces; the system always keeps at least one.
- Each workspace has independent board content, zone visibility, and mobile-inbox pairing; global preferences such as theme, language, and GIF are shared across workspaces.
- The workspace switcher is a ClickUp-style list; export, pairing, rename, and delete live in each entry's "⋯" menu.
- Import supports full or single-workspace payloads; same-named spaces can be overwritten or auto-numbered as new; the current workspace can be exported alone.

### Image shelf

- Three ways to add: `Ctrl+V` paste a screenshot, drop an image file, or pick a local file through the "+" in the title bar; cards can be dragged out to the desktop to export.
- Pasting is context-aware: right-click an image and choose "Paste image" to insert after it; `Ctrl+V` inside the preview works the same way, and can replace the target image.
- Built-in screenshot editor: crop, brush, rectangle, ellipse, arrow, numbered badge, and text annotations, with undo/redo, exporting PNG.
- Thumbnails support drag-reorder, right-click pin-to-top/bottom, delete, and copy; single-click previews, double-click copies, `Enter` edits.
- The preview supports `Ctrl+wheel` anchor zoom, double-click 2x, drag-to-pan, and toolbar actions.
- Preview shortcuts: `Enter` edit, `5` / `Ctrl+C` copy, `Delete` / `Backspace` delete, `Space` / `Esc` close, arrow keys or `W/A/S/D` switch images.
- With only the image zone visible, the board enters solo large-image mode, still draggable wider.

### Notes & spaces

- The notes zone is made of space tabs: it ships with "📝 Notes"; spaces can be added, double-click renamed, right-click deleted, and drag-reordered.
- Click in and start typing (read-only by default to prevent accidents), with line breaks, `Tab` indent, `Shift+Tab` outdent; indents inherit the sibling list markers, and unmarked lines get a `-` added automatically on `Tab`.
- Ordered lists renumber automatically; `Enter` continues the indent and marker, `Shift+Enter` is a plain line break.
- `Ctrl+Z` undo (an independent 50-step undo stack inside the editor); `Ctrl/⌘ + ←/→` jump to line start/end; `Ctrl/⌘ + ↑/↓` move the current line, with numbering and dashes adapting.
- Drop external text at the cursor to insert it; selected text can be dragged out to copy; the right-click menu offers copy/paste.
- Space tabs support right-click "Move to space"; deleting a space asks for confirmation first.

### Reminders

- Custom list model: right-click empty space to create a list; lists can be renamed, deleted, and collapsed; legacy "morning/noon/evening" data migrates automatically.
- When the panel is wide enough, lists flow into multiple columns; a list can also be dragged to a specific column.
- Each reminder can carry a notification time: quick presets (in 15/30 minutes, today at 10/14/19, tomorrow at 9, and so on) or an exact pick; due items trigger native browser notifications, inline blinking, and tab-title flashing.
- Overdue reminders show a red dot on the list title; time labels are colored by proximity.
- Starred items pin to the top of their list and aggregate into a "Focus" area at the top, sorted by due time with unfinished first.
- Complete, delete, duplicate, and drag across lists; `Ctrl/⌘ + ↑/↓` reorder within a group, `Ctrl/⌘ + ←/→` jump to line start/end.
- Completed items sink to the bottom, dimmed; they can be shown/hidden per list or cleared in one go.
- Pasting or dropping multi-line text bulk-creates items; URLs inside items become link buttons; right-click an item to "Move to space".

### Quick actions

- Four button types: link, copy-text, API request, open app — 15 built-in presets including WeLink, WeChat, DingTalk, Feishu, and VS Code, with risky protocols blocked automatically.
- API buttons support method, headers, body, and response-copy strategies, with getJson / postJson / postForm templates built in.
- Grouped by tag: tags can be colored, collapsed, double-click renamed, and drag-reordered; dragging a button across groups changes its tag.
- Right-click empty space and paste to create a button; URL / app-protocol / text content is classified automatically; dropping text works the same way.
- Buttons can be hidden, with a "show hidden items" toggle and drag-reorder.
- The search icon in the title bar expands a filter input that filters groups by title and content, with hits highlighted.

### Mobile inbox

- Pair from the workspace "⋯" menu on desktop: get a 12-character code, a QR code, and the full pairing address, copyable in one tap or rotatable (old addresses expire immediately).
- Pick the reminder target list and the notes target space; pairing is revoked automatically when the workspace is deleted or data is cleared.
- Open the pairing address on a phone (or type the code) to reach the capture page: multi-line input splits per line, with direct "Send to reminders" / "Send to notes" buttons.
- One-tap clipboard paste (without popping the keyboard), one-tap draft clearing; once a code is remembered, reopening skips re-entry, and typed codes are verified online with clear expiry messaging.
- After pairing, the code shows with the middle four characters masked; tapping it still copies the full code.
- Captures travel as plaintext JSON over HTTPS to a self-hosted relay, authenticated by the pairing-code hash; an optional per-send "AI polish" has the server tidy todos and notes before storing (any failure falls back to raw text).
- Items are removed from the queue once delivered to the desktop, and expire after 30 days.
- The desktop pulls on startup, window focus, every 5 minutes, and `Ctrl+S`; switching to a paired workspace pulls immediately.

### Offline & install

- After the first visit, the app opens fully offline (the Service Worker caches the app shell and static assets).
- It can be installed as a desktop app from the browser menu; no install banner is pushed.

### Settings & feedback

- Settings menu: data (new workspace / import / export current workspace / clear data), language (中文 / English), GIF theme (including custom light/dark GIFs), feedback, help & shortcuts, about.
- The version number at the bottom opens "Release notes"; a red dot appears when a new version is available, and updates install in one click from inside.
- The save status badge at the top shows: saved, saving, or unsaved changes.

### Keyboard shortcuts

- `Ctrl+S`: save immediately and pull the mobile inbox.
- `Ctrl+Z`: board undo (text and image editors keep their own undo stacks).
- Text zones: `Tab` / `Shift+Tab` indent, `Ctrl/⌘ + ←/→` jump to line start/end, `Ctrl/⌘ + ↑/↓` move the current line.
- Reminders: `Ctrl/⌘ + ↑/↓` reorder within the group, `Ctrl/⌘ + ←/→` jump to line start/end.
- Image preview: see the image shelf section above.
- The full keymap and gesture guide live in "Help & shortcuts" in the settings menu.

## Toasts & tips

- Saves, delete confirmations, import/export, copy feedback, and zone tips all surface through one shared toast bubble.
- Bubbles animate in and out.
- Hovering a bubble pauses its auto-dismiss timer; moving away resumes the countdown.
- Tips in the empty zones of the image shelf, quick actions, and reminders don't flip-flop on repeated clicks while showing.
- Switching to another zone cancels that zone's current tip; the new zone can show its own.
- The animated companion shows for at most 10 seconds, then fades out.

## Saving

- `Ctrl+S` saves immediately with a toast, and pulls the mobile inbox at the same time.
- Text input auto-saves 3 seconds after typing stops, and immediately on blur; reminder input debounces at 1 second.
- Structural operations (add, complete, drag, …) save instantly.
- Multiple tabs open at once detect version conflicts and never overwrite each other.
- Import, delete, and clear-data all ask for confirmation first.

## Where data lives

Board state is kept in the browser's `localStorage`:

```text
mini-desk-state-v1
```

Image originals are kept in same-site IndexedDB:

```text
mini-desk-images-v1
```

The phone's remembered pairing code is kept in `mini-desk-inbox-code`. Legacy `todo-board-state-v1` and `todo-board-images-v1` keys migrate automatically on read. Clearing site data wipes board content, images, and custom GIFs; deleting only the `localStorage` keys clears board state, but IndexedDB may still hold image originals.

The mobile-inbox relay stores only the capture items themselves (self-hosted, authenticated by pairing-code hash); items become unreadable once delivered to the desktop or after 30 days, and are removed from the queue on read. The relay keeps no board data, images, or account information.

## Mobile notes

The board is designed for desktop workflows: viewports 900px wide or narrower get a guide page pointing to a desktop browser. On workspaces with mobile inbox paired, phones can open the pairing address to capture reminders and notes, which sync to the desktop through the self-hosted relay.

For local real-device debugging use `npm run preview:lan`; the mobile-inbox API needs a secure context, and devices must accept the self-signed certificate warning once.

## Deployment

The live site runs on Cloudflare Pages (project `todolist`):

- <https://minidesk.online>

```bash
npm run deploy:cloudflare
```

The mobile-inbox relay is a self-hosted service (`server/`, Flask + MySQL) deployed on Aliyun at `/opt/minidesk-inbox`, exposed via nginx at <https://relay.minidesk.online:8443>:

```bash
cd server && ./deploy.sh
```

Build-related environment variables: `VITE_BASE` (deployment subpath), `VITE_INBOX_WORKER_URL` (override the relay URL, for local debugging), `MINI_DESK_LAN` (enable self-signed HTTPS for real-device preview).

To publish a release, build `dist` first, then zip the bundle as a release asset:

```bash
npm run build
cd dist
zip -qr ../dist-<version>.zip .
```

## Project structure

- `src/App.vue`: the board entry point — cross-component state orchestration, saving and conflict detection, import/export, toast bubbles, and global shortcuts.
- `src/components/`: workbench shell, workspace switcher, image shelf / screenshot editor / preview, reminders, quick actions, note spaces, mobile inbox, settings, and help components.
- `src/state/`: default state, message copy, i18n, theme, GIF themes, version & changelog, localStorage/IndexedDB access, import/export normalization, and reminder domain logic.
- `src/sync/`: mobile-inbox pairing codes, legacy payload decoding, and relay clients.
- `src/composables/`: composable logic such as reminder notifications.
- `src/utils/`: text-editing utilities (indent, list markers, line moves) and friends.
- `src/__tests__/`: component rendering, state compatibility, interaction contracts, deployment config, and message copy tests.
- `server/`: the mobile-inbox relay (Flask + MySQL, production).
- `static/`: companion GIFs and image assets; `public/`: Service Worker, manifest, and icons; `samples/`: sample import data.

## On AI coding

How Mini Desk gets built is the project's most interesting experiment: the human only decides "what", and hands everything else to AI.

- Entirely conversational development: 886 commits up to v1.0.155 — roughly 23,000 lines of TypeScript / Vue / Python written by AI, without the human hand-writing a single line of implementation.
- 1,230 automated tests were likewise written by AI test-first (TDD) and kept green throughout; after each change the AI reads the failing tests first, then writes the implementation.
- Releases are automated: a custom release workflow in the repo (`.claude/skills/`) drives the AI through build, full test runs, Cloudflare deployment, GitHub Releases, and changelog upkeep — one person maintaining 100 releases.
- The repo itself is a human-AI collaboration artifact: `CLAUDE.md` is the project manual written for the AI, and every changelog entry in `src/state/changelog.ts` was summarized by the AI at release time.

Put differently: everything described here — from the four-zone workbench to the mobile inbox — is the product of the loop "state the requirement → AI implements → AI self-reviews → AI releases".

## Acknowledgements

Thanks to my girlfriend for her constant support, and for the many valuable suggestions on product details.

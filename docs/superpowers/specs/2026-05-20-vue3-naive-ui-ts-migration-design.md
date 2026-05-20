# Vue3 Naive UI TypeScript Migration Design

## Goal

Rebuild the existing To Do List board as a Vue 3, Naive UI, and TypeScript application while preserving the current user-facing behavior, compact five-column layout, Chinese UI text, local data compatibility, and static deployment model.

## Current Context

The current app is a static vanilla HTML/CSS/JS implementation. All runtime state lives in browser storage:

- `localStorage` key: `todo-board-state-v1`
- IndexedDB database: `todo-board-images-v1`
- IndexedDB object store: `images`

The current baseline test file is stale: on `origin/main`, `node --test tests/static-regression.test.js` reports 2 passing and 6 failing tests because the assertions no longer match the current DOM and copy. Migration will replace these static string tests with contract tests for storage, state normalization, todo ordering, and Vue-rendered controls.

## Architecture

Use Vite as the build tool and keep the app as a client-only single-page application. The entry point will become `src/main.ts`, mounting `src/App.vue` into `#app`. Domain logic will live outside Vue components where practical so it can be tested directly.

Core modules:

- `src/types.ts`: typed state, todo, image, quick button, and editor models.
- `src/state/defaults.ts`: storage keys, default state, labels, empty hints, save messages, and title defaults.
- `src/state/storage.ts`: load, save, serialize, import normalization, export payload creation, and legacy migrations.
- `src/state/images.ts`: IndexedDB image payload storage, hydration, deletion, and serialization helpers.
- `src/state/todos.ts`: todo ordering, insertion, deletion, movement, completion, and empty-item cleanup helpers.
- `src/utils/textEditor.ts`: textarea line serialization and Tab/Shift+Tab behavior.
- `src/App.vue`: board composition and app-level event orchestration.
- `src/components/*`: focused Vue components for images, text panels, quick buttons, todos, settings, preview, and save companion.

## UI And Interaction

The app will preserve the current five-column layout:

1. Screenshot image area.
2. Notes and quick links split vertically.
3. Morning/noon/evening todo column.
4. Workspace textarea.
5. Storage textarea with theme control.

Naive UI will be used for dialogs, dropdown menus, checkboxes, buttons, modal affordances, and feedback messages where it fits without changing the compact line-based visual style. The page will keep the current restrained, utility-first look rather than adopting a decorative dashboard redesign.

Functional requirements to preserve:

- Paste images into the board, store image payloads in IndexedDB, keep metadata in localStorage, preview, zoom, pan, copy, delete, reorder, and use context menus.
- Edit notes, workspace, and storage with textarea-based Tab indentation, Shift+Tab outdent, Enter indentation carry-over, delayed save, blur save, and `Ctrl+S` save.
- Create, edit, copy, hide, unhide, delete, and reorder quick buttons; support link and text types.
- Manage todos in morning/noon/evening sections; add on blank click, edit inline, enter to create next item, check complete, move completed items to bottom, right-click delete, drag reorder within and across sections, and clear completed with confirmation.
- Support custom heading names by double-clicking titles.
- Support light/dark theme, data import/export, settings menu, save companion GIF, save bubble, toast feedback, and mobile warning.

## Data Compatibility

Existing user data must load without manual migration. The new TypeScript loaders will accept current and legacy shapes:

- `workspace`, `note`, or `storage` strings migrate to line arrays.
- Textarea content serializes to `LineItem[]` using leading tabs as indent.
- Image metadata remains in localStorage, while `src` payloads are read from IndexedDB when available.
- Import JSON accepts exported full state and normalizes missing or malformed collections.

## Testing

Use Vitest for unit and component tests. Tests will cover:

- State loading and legacy normalization.
- Serializable state excluding large image payloads.
- Imported quick buttons, todos, images, and editor lines.
- Todo ordering, insertion, completion sorting, and cross-section movement.
- Textarea indentation helpers.
- Vue-rendered app shell contains the five main regions, theme control, settings/import/export affordances, quick dialog, and todo controls.

Final verification will run:

- `npm test`
- `npm run build`
- Browser smoke test on the local Vite dev server for page load, core rendered content, console health, and at least one interaction.

## Non-Goals

- No server-side storage or backend API.
- No visual redesign beyond what is required to fit Vue and Naive UI.
- No storage key rename.
- No removal of current Chinese UI text.

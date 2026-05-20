# Vue3 Naive UI TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the To Do List board as a Vue 3 + Naive UI + TypeScript app without losing existing browser data or user-facing behavior.

**Architecture:** Use Vite for the build pipeline, typed state modules for storage/domain behavior, and focused Vue components for each board surface. Preserve the existing localStorage key, IndexedDB database/store, five-column layout, Chinese UI, and compact line-based visual style.

**Tech Stack:** Vue 3, TypeScript, Vite, Naive UI, Vitest, Vue Test Utils, jsdom.

---

### Task 1: Project Scaffold And Red Tests

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Modify: `index.html`
- Delete: `tests/static-regression.test.js`
- Create: `src/__tests__/state.test.ts`
- Create: `src/__tests__/app-render.test.ts`

- [ ] Add Vite/Vue/TypeScript/Vitest package scripts and configs.
- [ ] Replace the old static HTML entry with `<div id="app"></div>` and module script.
- [ ] Write tests for state normalization, image serialization, todo ordering, and rendered app shell.
- [ ] Run `npm test` and verify the tests fail because implementation modules do not exist yet.

### Task 2: Typed State And Domain Modules

**Files:**
- Create: `src/types.ts`
- Create: `src/state/defaults.ts`
- Create: `src/state/storage.ts`
- Create: `src/state/images.ts`
- Create: `src/state/todos.ts`
- Create: `src/utils/textEditor.ts`

- [ ] Implement TypeScript state types and constants.
- [ ] Implement localStorage loading, saving, serialization, import normalization, and legacy line migrations.
- [ ] Implement IndexedDB image payload helpers.
- [ ] Implement todo ordering and movement helpers.
- [ ] Implement textarea Tab/outdent/line serialization helpers.
- [ ] Run `npm test` and verify state/domain tests pass while app render tests still fail.

### Task 3: Vue Components And App Wiring

**Files:**
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/components/ImagePanel.vue`
- Create: `src/components/TextPanel.vue`
- Create: `src/components/QuickButtons.vue`
- Create: `src/components/TodoPanel.vue`
- Create: `src/components/SaveCompanion.vue`
- Create: `src/components/SettingsMenu.vue`
- Create: `src/components/ImagePreview.vue`
- Create: `src/components/EditableTitle.vue`
- Create: `src/styles.css`

- [ ] Build the five-column board in Vue.
- [ ] Wire image paste, preview, zoom, pan, copy, delete, reorder, and context menu flows.
- [ ] Wire textareas with save debounce, blur save, Ctrl+S, and indentation helpers.
- [ ] Wire quick button create/edit/copy/hide/delete/reorder flows with Naive UI dialogs/dropdowns.
- [ ] Wire todo add/edit/complete/delete/clear/reorder/cross-section drag flows.
- [ ] Wire theme, custom titles, import/export, settings menu, save companion, toast, and mobile banner.
- [ ] Run `npm test` and verify all tests pass.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] Update documentation for the new Vite/Vue build and development commands.
- [ ] Run `npm run build`.
- [ ] Start the dev server and verify the rendered app in browser.
- [ ] Check console health and one core interaction.
- [ ] Inspect `git status` and summarize changed files.

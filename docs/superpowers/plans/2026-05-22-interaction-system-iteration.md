# Interaction System Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved interaction-system iteration across messages, confirmations, todos, images, quick links, text editing, and workspace tabs.

**Architecture:** Keep the current Vue component boundaries, but move shared message wording into a single catalog and route confirmations/results through `App.vue` helpers. Add focused utility functions where behavior is pure (`textEditor.ts`, message catalog helpers), then update components to use compact menus, scoped shortcuts, and region-local feedback anchors.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vite.

---

### Task 1: Message And Confirmation Foundation

**Files:**
- Modify: `src/state/messages.ts`
- Modify: `src/App.vue`
- Modify: `src/components/CompanionBubble.vue`
- Modify: `src/components/SettingsMenu.vue`
- Modify: `src/__tests__/messages.test.ts`
- Modify: `src/__tests__/companion-bubble.test.ts`
- Modify: `src/__tests__/settings-menu.test.ts`

- [ ] Write failing tests proving delete-result messages do not expose undo keys, confirm variants do not mention undo, and about uses companion feedback instead of an about modal.
- [ ] Run focused tests and confirm they fail for the current undo/about behavior.
- [ ] Rename undo-style message keys to delete-result keys and remove undo action plumbing from delete flows.
- [ ] Change `about` from modal state to companion message anchored to settings.
- [ ] Add a 10 second maximum companion GIF visibility timer in `CompanionBubble.vue`.
- [ ] Run focused tests and commit the foundation.

### Task 2: Todo Area Interaction

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/defaults.ts`
- Modify: `src/state/storage.ts`
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Modify: `src/__tests__/todo-panel.test.ts`
- Modify: `src/__tests__/state.test.ts`

- [ ] Write failing tests for default hidden completed todos, persisted `showCompletedTodos`, single-click edit, single-click empty-list create, compact item menu labels, and clear-completed confirmation.
- [ ] Run focused tests and confirm they fail against current double-click and visible-completed behavior.
- [ ] Add `showCompletedTodos` to state normalization and persistence.
- [ ] Filter completed todos from period lists when hidden while keeping progress counts global.
- [ ] Replace clear button with a section-level three-dot menu containing only `显示已完成` / `隐藏已完成` and `清理已完成`.
- [ ] Change todo text editing from double-click to single-click and change empty-list creation to single-click.
- [ ] Update right-click item labels to `复制`, `编辑`, `删除`, `星标` / `取消星标`.
- [ ] Add today-focus checked animation class and CSS.
- [ ] Run focused tests and commit the todo changes.

### Task 3: Image Area And Preview

**Files:**
- Modify: `src/components/ImagePanel.vue`
- Modify: `src/components/ImagePreview.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Modify: `src/__tests__/image-panel.test.ts`
- Modify: `src/__tests__/image-preview.test.ts`

- [ ] Write failing tests for external image drop, preview right-click menu with `取消预览`, preview `Enter` copy on first open, preview delete shortcut, and image delete feedback anchoring.
- [ ] Run focused tests and confirm they fail for missing drop/menu/shortcut behavior.
- [ ] Add image-panel drop handling for multiple files and non-image filtering.
- [ ] Add App-level `addImageFiles` helper that stores all valid images and copies the last added image.
- [ ] Add preview right-click menu with `复制`, `取消预览`, `删除`.
- [ ] Route preview `Enter`, `Delete` / `Backspace`, and `Escape` to the active image immediately after open.
- [ ] Close preview after deleting the active image and show delete-result feedback at the image panel anchor.
- [ ] Run focused tests and commit the image changes.

### Task 4: Quick Link Menus And Copy

**Files:**
- Modify: `src/components/QuickButtons.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Modify: `src/__tests__/quick-buttons.test.ts`

- [ ] Write failing tests for a single three-dot area menu with `新增`, `显示隐藏项`, `收起隐藏项`, compact right-click labels, and multiline text copy.
- [ ] Run focused tests and confirm they fail for the current always-visible action buttons and menu labels.
- [ ] Replace header action buttons with one three-dot menu.
- [ ] Add area menu actions for add and show/收起 hidden items.
- [ ] Add `复制` to quick-button right-click menu and keep `编辑`, `隐藏` / `显示`, `删除`.
- [ ] Ensure text quick buttons copy exact multiline content.
- [ ] Run focused tests and commit the quick link changes.

### Task 5: Text Editor And Workspace Tabs

**Files:**
- Modify: `src/utils/textEditor.ts`
- Modify: `src/components/TextPanel.vue`
- Modify: `src/components/SpacePanel.vue`
- Modify: `src/styles.css`
- Modify: `src/__tests__/text-panel.test.ts`
- Modify: `src/__tests__/space-panel.test.ts`

- [ ] Write failing tests for `Ctrl+Z` editor undo, empty indented-line outdent on delete/backspace, and workspace tab scrollbar behavior.
- [ ] Run focused tests and confirm they fail against the current editor/tab behavior.
- [ ] Add bounded per-editor undo history for input, enter, tab, paste, and delete/outdent changes.
- [ ] Add text-editor utility for outdenting an empty indented current line.
- [ ] Use `overflow-x: auto` with no stable gutter for tabs and keep wheel scrolling when overflowing.
- [ ] Run focused tests and commit the editor/tab changes.

### Task 6: Import Bug And Regression Verification

**Files:**
- Modify: `src/App.vue`
- Modify: `src/__tests__/app-render.test.ts`
- Modify: `src/__tests__/deployment-config.test.ts` if needed only for changed deployment assumptions.

- [ ] Write failing test for selecting an import file, cancelling confirmation, and selecting a file again.
- [ ] Run focused test and confirm it fails for stale file-input state if still present.
- [ ] Reset the file input before every import picker open and after every import branch.
- [ ] Run all focused component/state tests touched by this plan.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit final fixes if any test/build adjustments were needed.

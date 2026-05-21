# Board UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the agreed UX requirements for reminder hierarchy, save status, mobile navigation, and a merged tabbed workspace area.

**Architecture:** Extend the persisted state with optional starred reminders and a `spaces` collection while preserving legacy `workspaceLines` and `storageLines` imports. Keep behavior in existing state helpers, add focused UI components only where existing components would become too broad, and update CSS to preserve the compact tool style.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vite.

---

### Task 1: State Model And Storage Compatibility

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/defaults.ts`
- Modify: `src/state/storage.ts`
- Modify: `src/state/todos.ts`
- Test: `src/__tests__/state.test.ts`

- [ ] Add `starred?: boolean` to `TodoItem`.
- [ ] Add `WorkspaceSpace { id, title, lines }` and `spaces`, `activeSpaceId` to `BoardState`.
- [ ] Make `defaultState()` create one space named `工作空间`.
- [ ] Normalize old states with no `spaces` into one `工作空间`; if legacy storage lines exist, preserve them as an additional `工程文件` space.
- [ ] Preserve `starred` when normalizing todos.
- [ ] Update todo ordering to keep open starred items before open normal items, then completed items.
- [ ] Add tests for default space, legacy workspace/storage migration, and starred todo ordering.

### Task 2: Save Status

**Files:**
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/app-render.test.ts`

- [ ] Track `saveStatus` as `saved | saving | dirty`.
- [ ] Mark text edits dirty immediately and mark saved after debounce/flush persistence.
- [ ] Mark all immediate persistence operations as saved after `saveState`.
- [ ] Render save status near settings/theme controls with Chinese labels `已保存`, `保存中`, `有未保存内容`.
- [ ] Add tests for dirty status after text input and saved status after `Ctrl+S`.

### Task 3: Reminder Hierarchy

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/todo-panel.test.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] Show `已完成 / 总数` progress in each period heading.
- [ ] Insert a weak `已完成` divider before completed items.
- [ ] Add star toggling for reminders.
- [ ] Keep starred open reminders visually before ordinary open reminders.
- [ ] Add a `今日重点` area above morning/noon/evening that aggregates starred reminders and weakens completed starred reminders.
- [ ] Make row drag affordance visually lighter while retaining drag start/end behavior.
- [ ] Add tests for progress, divider, star emit, and focus aggregation.

### Task 4: Merged Tabbed Spaces

**Files:**
- Create: `src/components/SpacePanel.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/space-panel.test.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] Replace the two right-side text panels with one `SpacePanel`.
- [ ] Show one initial tab named `工作空间`.
- [ ] Support adding a space, renaming through the existing editable title behavior, deleting with confirmation, and preventing deletion of the final remaining space.
- [ ] Save each space independently and switch active tab without data loss.
- [ ] Reuse `TextPanel` for the active space editor.
- [ ] Add tests for add, rename, delete emit, last-space delete disabled, and persistence through App.

### Task 5: Notes-Like Text Input

**Files:**
- Modify: `src/utils/textEditor.ts`
- Test: `src/__tests__/text-panel.test.ts`

- [ ] Continue numbered lists after pressing Enter on lines like `1. item`.
- [ ] Continue unordered lists after pressing Enter on lines like `- item`.
- [ ] Exit empty numbered or unordered lists on Enter.
- [ ] Keep existing Tab and Shift+Tab indentation behavior.
- [ ] Add tests for numbered continuation, unordered continuation, and empty list exit.

### Task 6: Mobile Navigation

**Files:**
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/app-render.test.ts`

- [ ] Add a compact mobile menu bar with entries for 图片、便签、快捷、待办、空间.
- [ ] Default mobile active area to `todos`.
- [ ] On mobile, show only the active area instead of only workspace.
- [ ] Keep desktop five-area layout with merged right-side space area.
- [ ] Add tests for rendered mobile menu entries and default todo active class.

### Task 7: Verification

**Files:**
- Verify all modified files.

- [ ] Run targeted tests after each task.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start Vite dev server and do a browser smoke test if time allows.

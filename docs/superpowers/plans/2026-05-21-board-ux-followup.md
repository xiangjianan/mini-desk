# Board UX Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the first UX implementation after mobile and editing behavior testing.

**Architecture:** Keep the existing Vue component boundaries. Adjust `App.vue` for mobile drawer state, `TextPanel.vue` for click-to-edit behavior, `SpacePanel.vue` for tab-level actions and drag ordering, and `TodoPanel.vue` for star placement. Update CSS and Vitest coverage alongside each behavior.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vite.

---

### Task 1: Mobile Drawer Navigation

**Files:**
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/app-render.test.ts`
- Test: `src/__tests__/naive-components.test.ts`

- [ ] Replace the five always-visible mobile area buttons with a hamburger drawer trigger.
- [ ] Show current area next to the hamburger trigger.
- [ ] Expand the drawer to show 图片、便签、快捷、待办、空间.
- [ ] Selecting an item changes the active area and closes the drawer.
- [ ] Keep right-side save/settings/theme controls clear of the mobile nav.

### Task 2: Text Editors Click To Edit

**Files:**
- Modify: `src/components/TextPanel.vue`
- Test: `src/__tests__/text-panel.test.ts`
- Test: `src/__tests__/naive-components.test.ts`

- [ ] Start editing text panels on single click / focus.
- [ ] Keep title editing as double-click through `EditableTitle`.
- [ ] Remove the text panel context-menu `编辑` option.
- [ ] Keep copy, paste, and guide context-menu actions.

### Task 3: Space Tabs Own Space Management

**Files:**
- Modify: `src/components/SpacePanel.vue`
- Modify: `src/App.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/space-panel.test.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] Remove the repeated active-space title row from the editor content.
- [ ] Remove the always-visible delete X button.
- [ ] Make space tab double-click emit rename.
- [ ] Add a right-click menu on tabs with 编辑 and 删除.
- [ ] Disable 删除 when only one space remains.
- [ ] Support dragging tabs to reorder spaces, with `+` fixed at the end.

### Task 4: Todo Star Placement

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/todo-panel.test.ts`
- Test: `src/__tests__/naive-components.test.ts`

- [ ] Move the star button to the far right of each reminder row.
- [ ] Keep drag handle and checkbox on the left.
- [ ] Preserve today's focus star affordance.

### Task 5: Verification

**Files:**
- Verify all modified files.

- [ ] Run focused tests for changed components.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Confirm the LAN dev server URL remains available.

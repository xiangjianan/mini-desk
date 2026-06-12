# Workspace Density Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the top-left status lamp from save-state semantics to workspace density semantics with contextual randomized bubble tips.

**Architecture:** Keep persistence/save state internal, but compute a separate density status for the lamp from current images, todo list sizes, and visible quick action counts. Reuse the shared message catalog for randomized copy and app-level tests for the click interaction.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest, existing companion bubble/message catalog.

---

### Task 1: Add Failing App Tests

**Files:**
- Modify: `src/__tests__/app-render.test.ts`
- Modify: `src/__tests__/messages.test.ts`

- [x] Add tests that assert the lamp shows green when no area is over threshold, yellow when one or two areas are over threshold, and red when images, one todo list, and one quick action category are all over threshold.
- [x] Add tests that clicking yellow/red lamps shows a randomized message containing the selected over-limit area and its count.
- [x] Add the new message keys to `messageKeys` so missing catalog entries fail.
- [x] Run `npm test -- src/__tests__/app-render.test.ts -t "workspace density|status lamp"` and `npm test -- src/__tests__/messages.test.ts`; expected result before implementation: failing tests for old save-state labels/messages and missing message keys.

### Task 2: Implement Density Status

**Files:**
- Modify: `src/App.vue`
- Modify: `src/state/messages.ts`
- Modify: `src/state/i18n.ts` if labels need shared UI text.

- [x] Add thresholds: todo list `> 7`, quick category visible count `> 12`, images `> 20`.
- [x] Compute over-limit areas from current state.
- [x] Derive lamp state: green/saved when zero areas over, yellow/saving when one or two areas over, red/dirty when all three area types are over.
- [x] Replace the lamp label/title/aria text with density wording.
- [x] Change lamp click handler to show green/yellow/red density messages; yellow/red choose randomly from over-limit areas where required and include the area name plus count.
- [x] Add 10 variants per new message key in Chinese and English, keeping message catalog tests passing.

### Task 3: Verify and Commit

**Files:**
- Verify all modified files.

- [x] Run focused tests: `npm test -- src/__tests__/app-render.test.ts -t "workspace density|status lamp"` and `npm test -- src/__tests__/messages.test.ts`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Optionally smoke check in browser if practical.
- [x] Stage and commit only related files.

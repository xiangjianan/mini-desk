# Workflow Workbench Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn MiniDesk's note and quick-link areas into a usable local workflow loop: capture structured notes, convert selected note text into reminders or quick actions, and create quick actions by dropping text or URLs.

**Architecture:** Keep the app local-first and Vue component based. Add a small Markdown-lite renderer/parser utility for display only, extend `TextPanel` with selection actions, and extend `QuickButtons` with drop-to-create inference while preserving existing state shapes.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vite.

---

### Task 1: Markdown-Lite Note Preview

**Files:**
- Create: `src/utils/markdownLite.ts`
- Modify: `src/components/TextPanel.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/text-panel.test.ts`

- [ ] Write failing tests that mount `TextPanel` with lines containing `# Heading`, `- item`, `1. item`, `[ ] task`, `**bold**`, and `==mark==`, then expect `.markdown-preview` blocks, `strong`, and `mark` to render while the textarea remains available.
- [ ] Implement `renderMarkdownLite(text: string)` as typed block/inline tokens with escaped text and no `v-html`.
- [ ] Render preview when `!editing && text.trim()`; keep the textarea as the editing surface and start editing from preview click/double-click.
- [ ] Add compact CSS for headings, lists, checklist rows, bold, and highlight that matches the app's minimal design.

### Task 2: Selection-To-Workflow Actions

**Files:**
- Modify: `src/components/TextPanel.vue`
- Modify: `src/App.vue`
- Modify: `src/state/i18n.ts`
- Test: `src/__tests__/text-panel.test.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] Write failing tests for context menu actions shown only when text is selected: `转为提醒` and `做成快捷动作`.
- [ ] Emit selected non-empty lines through `createTodos` and selected full text through `createQuick`.
- [ ] In `App.vue`, route selected note text to the first configured reminder list and create a copy-text quick action with a short title derived from the first selected line.
- [ ] Add Chinese and English UI labels and short success bubbles.

### Task 3: Quick Actions From Drops

**Files:**
- Modify: `src/components/QuickButtons.vue`
- Modify: `src/state/i18n.ts`
- Test: `src/__tests__/quick-buttons.test.ts`

- [ ] Write failing tests for dropping `https://example.com/docs` into the quick area and expecting a `link` quick action, plus dropping multiline plain text and expecting a `text` quick action.
- [ ] Infer URL drops as link actions with hostname/path title; infer other text as copy-text actions with first-line title.
- [ ] Preserve existing click, context menu, hide/show, and drag reorder behavior.

### Task 4: Verification And Review Loop

**Files:**
- No production file ownership; review and fixes as needed.

- [ ] Run focused tests for text panel, quick buttons, and app render.
- [ ] Run `npm test`, `npm run build`, and `git diff --check`.
- [ ] Use Browser on `http://127.0.0.1:5173/` for desktop and mobile checks.
- [ ] Spawn a review subagent with explicit instructions to find UX, product, and code defects in the implemented workflow.
- [ ] Fix Important/Critical findings and repeat review until no new actionable high-value findings remain in this phase.

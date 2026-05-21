# Message Copy And Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved message copy, kaomoji, guide timing, semantic confirmation, failure feedback, and undoable delete behavior.

**Architecture:** Keep message copy centralized in `src/state/messages.ts`, keep static hints in `src/state/defaults.ts`, and make `CompanionBubble.vue` a reusable surface for normal messages, confirmation messages, and single-action undo messages. `src/App.vue` coordinates behavior-specific state such as pending confirmations and pending undo actions.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vue Test Utils, Vite.

---

### Task 1: Message Catalog And Copy Rules

**Files:**
- Modify: `src/state/messages.ts`
- Modify: `src/state/defaults.ts`
- Modify: `src/__tests__/messages.test.ts`
- Test: `src/__tests__/messages.test.ts`

- [ ] **Step 1: Write the failing message catalog tests**

Add the new message keys to `messageKeys` in `src/__tests__/messages.test.ts`:

```ts
  "undoDeleteImage",
  "undoDeleteQuick",
  "undoDeleteTodo",
  "undoClearCompleted",
  "importJsonInvalid",
  "importDataInvalid",
  "imageStoreFailed",
  "imageReadFailed",
  "clipboardPermissionDenied",
  "imageCopyFailed",
  "linkOpenFailed",
```

Change the kaomoji mood assertion to expect `calm`:

```ts
expect(Object.keys(KAOMOJI_BY_MOOD).sort()).toEqual(["calm", "encouraging", "happy", "surprised", "warning"]);
```

Replace the loose variant-count test with:

```ts
it("provides ten variants for every popup message", () => {
  for (const key of messageKeys) {
    expect(MESSAGE_CATALOG[key].variants.length, key).toBe(10);
  }
});
```

Add a text length test:

```ts
it("keeps bubble body text within the approved limits before kaomoji", () => {
  for (const [key, entry] of Object.entries(MESSAGE_CATALOG)) {
    if (key === "about") continue;
    for (const variant of entry.variants) {
      expect(variant.length, `${key}: ${variant}`).toBeLessThanOrEqual(15);
    }
  }
});
```

Add defaults assertions:

```ts
expect(EMPTY_HINTS.images).toContain("Ctrl+V");
expect(AREA_HELP.todos).not.toMatch(/早|中|晚/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/__tests__/messages.test.ts
```

Expected: fail because the new keys, `calm` mood, 10 variants, and updated hint copy do not exist yet.

- [ ] **Step 3: Implement message catalog changes**

In `src/state/messages.ts`:

- Add `calm` to `MessageMood`.
- Add the new undo and failure keys to `MessageKey`.
- Add 10 variants for every existing and new `MESSAGE_CATALOG` entry.
- Assign `calm` to undo and about messages.
- Assign `warning` to failures and dangerous confirmations.
- Keep ordinary success feedback `happy`, todo completion `encouraging`, and Data URL fallback `surprised`.

In `src/state/defaults.ts`:

- Change image empty hint to include `Ctrl+V`.
- Change `AREA_HELP.todos` so it avoids fixed time-of-day names and mentions editable titles.

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
npm test -- src/__tests__/messages.test.ts
```

Expected: pass.

### Task 2: Companion Bubble Actions

**Files:**
- Modify: `src/components/CompanionBubble.vue`
- Modify: `src/__tests__/companion-bubble.test.ts`
- Test: `src/__tests__/companion-bubble.test.ts`

- [ ] **Step 1: Write failing component tests**

Add a test showing semantic confirm labels:

```ts
it("uses semantic labels for confirmation bubbles", async () => {
  vi.useFakeTimers();
  const wrapper = mount(CompanionBubble, {
    attachTo: document.body,
    props: {
      visible: true,
      message: "确认删除图片",
      confirm: true,
      confirmText: "删除",
      cancelText: "取消",
    },
    global: { stubs: { NButton: buttonStub, NPopover: popoverStub } },
  });

  await vi.advanceTimersByTimeAsync(200);
  await wrapper.vm.$nextTick();

  expect(document.body.querySelector('[data-testid="companion-yes"]')?.textContent).toBe("删除");
  expect(document.body.querySelector('[data-testid="companion-no"]')?.textContent).toBe("取消");

  wrapper.unmount();
});
```

Add a test showing single action undo:

```ts
it("renders a single action button for undo bubbles", async () => {
  vi.useFakeTimers();
  const wrapper = mount(CompanionBubble, {
    attachTo: document.body,
    props: {
      visible: true,
      message: "提醒已删除",
      actionText: "撤销",
    },
    global: { stubs: { NButton: buttonStub, NPopover: popoverStub } },
  });

  await vi.advanceTimersByTimeAsync(200);
  await wrapper.vm.$nextTick();

  expect(document.body.querySelector('[data-testid="companion-action"]')?.textContent).toBe("撤销");
  expect(document.body.querySelector('[data-testid="companion-yes"]')).toBeNull();
  expect(document.body.querySelector('[data-testid="companion-no"]')).toBeNull();

  wrapper.unmount();
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
npm test -- src/__tests__/companion-bubble.test.ts
```

Expected: fail because `confirmText`, `cancelText`, and `actionText` are not supported.

- [ ] **Step 3: Implement companion bubble action props**

In `src/components/CompanionBubble.vue`:

- Add optional props `confirmText?: string`, `cancelText?: string`, and `actionText?: string`.
- Add an `action` emit.
- Preserve previous default labels with `confirmText ?? "是"` and `cancelText ?? "否"`.
- Render one button with `data-testid="companion-action"` when `actionText` is set and `confirm` is false.
- Keep the existing two-button layout for `confirm`.

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
npm test -- src/__tests__/companion-bubble.test.ts
```

Expected: pass.

### Task 3: App-Level Undo And Semantic Confirmations

**Files:**
- Modify: `src/App.vue`
- Modify: `src/__tests__/app-render.test.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: Write failing tests for undoable deletes**

Update the existing clear-completed test so clicking the clear button immediately removes the completed todo and shows a `撤销` action, without a `companion-yes` confirmation button:

```ts
expect(wrapper.find('[data-testid="companion-yes"]').exists()).toBe(false);
expect(wrapper.findAll("input.todo-input").some((input) => (input.element as HTMLInputElement).value === "已完成事项")).toBe(false);
await vi.advanceTimersByTimeAsync(200);
expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/已清理完成项/);
await wrapper.get('[data-testid="companion-action"]').trigger("click");
expect(wrapper.findAll("input.todo-input").some((input) => (input.element as HTMLInputElement).value === "已完成事项")).toBe(true);
```

Add a todo delete test that confirms with semantic labels and restores on undo:

```ts
expect(wrapper.get('[data-testid="companion-yes"]').text()).toBe("删除");
expect(wrapper.get('[data-testid="companion-no"]').text()).toBe("取消");
await wrapper.get('[data-testid="companion-yes"]').trigger("click");
await vi.advanceTimersByTimeAsync(200);
expect(wrapper.find('[data-testid="companion-confirm"]').text()).toMatch(/提醒已删除/);
await wrapper.get('[data-testid="companion-action"]').trigger("click");
expect(wrapper.findAll("input.todo-input").some((input) => (input.element as HTMLInputElement).value === "待删除提醒")).toBe(true);
```

Add an image delete test by seeding one image in `localStorage`, emitting `delete` from `ImagePanel`, checking the confirm labels `删除 / 取消`, confirming, checking the image is removed, then clicking `companion-action` and checking the image returns.

Add a quick button delete test by seeding one quick button in `localStorage`, emitting `delete` from `QuickButtons`, checking the confirm labels `删除 / 取消`, confirming, checking the button is removed, then clicking `companion-action` and checking the button returns.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: fail because clear completed still asks for confirmation, confirmations still use “是/否”, and undo action does not exist.

- [ ] **Step 3: Implement app-level undo and semantic confirmation**

In `src/App.vue`:

- Change `pendingConfirm` to include `confirmText` and `cancelText`.
- Add `pendingAction` for single-action undo bubbles.
- Add `UNDO_BUBBLE_DURATION_MS = 5000`.
- Add `showUndoBubble(messageKey, anchor, onUndo)` that sets `pendingAction` with `actionText: "撤销"` and hides after 5 seconds.
- Pass `confirmText`, `cancelText`, `actionText`, and `@action` into `CompanionBubble`.
- For delete image, delete quick, and delete todo: keep confirmation first, then remove the item and show the relevant undo bubble.
- For clear completed: remove confirmation, clear immediately, and show undo bubble with the removed completed todos.
- Keep delete space as strong confirmation with `删除空间 / 取消` and no undo.
- Keep import overwrite as strong confirmation with `覆盖导入 / 取消` and no undo.

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: pass.

### Task 4: Failure Feedback And Guide Timing

**Files:**
- Modify: `src/App.vue`
- Modify: `src/__tests__/app-render.test.ts`
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:

- Invalid JSON import shows a companion message matching `文件|格式|检查`.
- Invalid imported structure shows a companion message matching `数据|备份|不适用`.
- Clipboard read rejection shows a companion message matching `剪贴板|权限`.
- Image store failure shows a companion message matching `图片|保存|重试`.
- Link open returns null and shows a companion message matching `链接|检查|失败`.
- Guide bubble remains visible after 4 seconds and hides after 5 seconds.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: fail because failure cases are not caught consistently and guide duration is still 4 seconds.

- [ ] **Step 3: Implement failure feedback and 5-second guides**

In `src/App.vue`:

- Change `GUIDE_MESSAGE_DURATION_MS` to `5000`.
- Wrap clipboard image reads in `try/catch` and show `clipboardPermissionDenied` on read failure.
- Wrap image file reading and IndexedDB storage in `try/catch`; show `imageReadFailed` or `imageStoreFailed`.
- Wrap image copy in `try/catch`; show `imageCopyFailed`.
- Wrap import parsing in `try/catch`; show `importJsonInvalid`.
- Treat import normalization exceptions as `importDataInvalid`.
- In `handleQuickButton`, if a link open returns `null`, show `linkOpenFailed`.

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: pass.

### Task 5: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: TypeScript check and Vite build pass.

- [ ] **Step 3: Inspect local diff**

Run:

```bash
git diff --stat
git diff -- src/state/messages.ts src/state/defaults.ts src/components/CompanionBubble.vue src/App.vue src/__tests__/messages.test.ts src/__tests__/companion-bubble.test.ts src/__tests__/app-render.test.ts
```

Expected: only intended implementation and tests are changed. Pre-existing edits in `src/styles.css` and `src/__tests__/naive-components.test.ts` remain untouched unless the implementation requires them.

# Image Context Menu Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add before, after, and replace clipboard-image actions to image item context menus, then reveal and briefly highlight every successfully pasted clipboard image.

**Architecture:** `App.vue` remains the owner of clipboard reads, IndexedDB writes, array placement, and persistence. `ImagePanel.vue` emits typed placement requests and consumes a tokenized success signal to perform DOM-only scrolling and animation without coupling preview state to paste feedback.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, TypeScript, Naive UI dropdowns, IndexedDB image helpers, Vitest, Vue Test Utils, CSS.

---

## File map

- Modify `src/types.ts`: shared paste request and feedback contracts.
- Modify `src/state/i18n.ts`: Chinese and English menu labels.
- Modify `src/state/imageContextMenu.ts`: item menu keys and options.
- Modify `src/components/ImagePanel.vue`: typed menu events, feedback watcher, card highlight class, timer cleanup.
- Modify `src/App.vue`: position-aware clipboard paste pipeline and tokenized success feedback.
- Modify `src/styles.css`: layout-stable paste highlight animation.
- Modify `src/__tests__/image-panel.test.ts`: menu event and DOM feedback behavior.
- Modify `src/__tests__/app-render.test.ts`: insertion, replacement, global paste, and failure behavior.
- Modify `src/__tests__/i18n.test.ts`: bilingual label contract.

### Task 1: Typed context-menu actions and bilingual labels

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/i18n.ts`
- Modify: `src/state/imageContextMenu.ts`
- Test: `src/__tests__/image-panel.test.ts`
- Test: `src/__tests__/i18n.test.ts`

- [ ] **Step 1: Write failing menu and i18n tests**

Add an image-panel assertion that the item menu contains the three paste actions and that selecting each one emits its placement and target:

```ts
expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
  "预览", "复制", "编辑", "删除",
  "粘贴图片到上方", "粘贴图片到下方", "粘贴替换当前图片",
  "置顶", "置底", "Tips",
]);

await selectItemMenuAction(wrapper, 1, "粘贴图片到上方");
expect(wrapper.emitted("paste")?.[0]?.[0]).toMatchObject({ placement: "before", targetId: "b" });
```

Repeat the emission assertion for `after` and `replace`. In `i18n.test.ts`, assert the English values `Paste image above`, `Paste image below`, and `Paste and replace image`.

- [ ] **Step 2: Run tests and verify the missing-feature failure**

Run:

```bash
npm test -- src/__tests__/image-panel.test.ts src/__tests__/i18n.test.ts
```

Expected: FAIL because the three labels and menu keys do not exist.

- [ ] **Step 3: Add the shared types, labels, and menu entries**

Add to `src/types.ts`:

```ts
export type ImagePastePlacement = "append" | "before" | "after" | "replace";

export interface ImagePasteRequest {
  placement: ImagePastePlacement;
  targetId?: string;
  anchor?: HTMLElement;
}

export interface ImagePasteFeedback {
  id: string;
  token: number;
}
```

Add the three label properties under both `images` dictionaries in `src/state/i18n.ts`. Extend `ImageContextMenuKey` with `paste-before`, `paste-after`, and `paste-replace`, then add the corresponding options after delete and before pin actions in `getImageItemContextMenuItems`.

- [ ] **Step 4: Emit typed placement requests from ImagePanel**

Change the paste emit contract to:

```ts
paste: [request: ImagePasteRequest];
```

Map all paste keys to `ClipboardOutline`. In `handleMenuSelect`, emit:

```ts
if (key === "paste") emit("paste", { placement: "append", anchor });
if (id && key === "paste-before") emit("paste", { placement: "before", targetId: id, anchor });
if (id && key === "paste-after") emit("paste", { placement: "after", targetId: id, anchor });
if (id && key === "paste-replace") emit("paste", { placement: "replace", targetId: id, anchor });
```

- [ ] **Step 5: Run the focused tests and commit**

Run the same focused command and expect all tests to pass. Then commit:

```bash
git add src/types.ts src/state/i18n.ts src/state/imageContextMenu.ts src/components/ImagePanel.vue src/__tests__/image-panel.test.ts src/__tests__/i18n.test.ts
git commit -m "feat: add contextual image paste actions"
```

### Task 2: Position-aware clipboard persistence

**Files:**
- Modify: `src/App.vue`
- Test: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: Write failing placement and replacement tests**

Initialize three stored images, mock `navigator.clipboard.read`, emit each request from `ImagePanel`, and assert these order contracts:

```ts
imagePanel.vm.$emit("paste", { placement: "before", targetId: "img-2" });
expect(nextIds).toEqual(["img-1", expect.not.stringMatching(/^img-[123]$/), "img-2", "img-3"]);

imagePanel.vm.$emit("paste", { placement: "after", targetId: "img-2" });
expect(nextIds[2]).toBe(newImageId);
```

For replacement, seed `{ id: "img-2", createdAt: 2, displayWidth: 320, displayHeight: 180 }`, paste over it, and assert its index, ID, creation time, and display size remain unchanged while `src` changes. Assert serialized localStorage still omits `src`.

- [ ] **Step 2: Run the focused app tests and verify RED**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts -t "pastes an image|replaces an image"
```

Expected: FAIL because `pasteImageFromClipboard` ignores placement requests and always appends.

- [ ] **Step 3: Implement the placement-aware add operation**

Import `ImagePasteRequest`. Change `pasteImageFromClipboard` to accept a request with an append default, and pass it to the image mutation path. Extend `addImageFile` options with `pasteRequest?: ImagePasteRequest`.

Before calculating display size, resolve the target:

```ts
const request = options.pasteRequest;
const targetIndex = request?.targetId
  ? state.images.findIndex((item) => item.id === request.targetId)
  : -1;
if (request && request.placement !== "append" && targetIndex < 0) return undefined;
```

For replace, build the next record from the existing image so metadata is retained:

```ts
const image = request?.placement === "replace"
  ? { ...state.images[targetIndex], src }
  : { id: createId(), src, createdAt: Date.now(), ...(displaySize ?? {}) };
```

After `storeImagePayload(image)` succeeds, update the array with `splice(targetIndex, 1, image)` for replace, `splice(targetIndex, 0, image)` for before, `splice(targetIndex + 1, 0, image)` for after, and `push(image)` for append. Keep persistence and existing success messaging after the mutation.

- [ ] **Step 4: Preserve position through the browser paste fallback**

Add a `pendingBrowserImagePasteRequest` ref. Set it immediately before `document.execCommand("paste")`; have the document paste handler consume it once and default to append. Clear it when the command returns false and after the paste event is handled.

```ts
const request = pendingBrowserImagePasteRequest.value ?? { placement: "append" };
pendingBrowserImagePasteRequest.value = undefined;
await addImageFile(file, { matchDisplaySizeToDevicePixelRatio: request.placement !== "replace", pasteRequest: request });
```

- [ ] **Step 5: Run focused tests and commit**

Run the placement/replacement tests plus the existing browser fallback test. Expect all selected tests to pass, then commit:

```bash
git add src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: place pasted images relative to list items"
```

### Task 3: Success feedback, scrolling, and repeated flash animation

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/ImagePanel.vue`
- Modify: `src/styles.css`
- Test: `src/__tests__/app-render.test.ts`
- Test: `src/__tests__/image-panel.test.ts`

- [ ] **Step 1: Write failing parent feedback tests**

After successful global paste and menu paste, assert the `pasteFeedback` prop identifies the created or replaced image and its token increases. Reject the clipboard read in a separate test and assert the prop remains undefined.

```ts
const first = wrapper.getComponent(ImagePanel).props("pasteFeedback");
expect(first).toMatchObject({ id: expect.any(String), token: 1 });
```

- [ ] **Step 2: Write failing ImagePanel DOM tests**

Spy on `scrollIntoView`, enable fake timers, set `{ id: "img-2", token: 1 }`, and assert the card receives `is-paste-highlighted` and scrolls with:

```ts
expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth", inline: "nearest" });
```

Advance 700ms and assert the class clears. Set the same ID with token 2 and assert scrolling and highlighting happen again.

- [ ] **Step 3: Run both tests and verify RED**

Run:

```bash
npm test -- src/__tests__/image-panel.test.ts src/__tests__/app-render.test.ts -t "paste feedback|pasted image"
```

Expected: FAIL because the feedback prop and highlight class do not exist.

- [ ] **Step 4: Publish feedback only after successful clipboard mutations**

Create `const pasteFeedback = ref<ImagePasteFeedback>()` and a counter in `App.vue`. After a clipboard-origin `addImageFile` succeeds and state is persisted, assign `{ id: image.id, token: ++pasteFeedbackToken }`. Do not publish from `addImageFiles`, which is the drag/drop path. Bind `:paste-feedback="pasteFeedback"` on `ImagePanel`.

- [ ] **Step 5: Consume feedback and animate without affecting preview**

Add an optional `pasteFeedback` prop, a temporary `pasteHighlightedId` ref, and a timeout. Watch `props.pasteFeedback?.token` with `flush: "post"`; after `nextTick`, scroll the matching card and set its highlight ID. Clear and restart the timeout on every token, including repeated IDs, and clear it in `onUnmounted`.

Bind the class independently from `is-active`:

```vue
:class="{
  'is-dragging': draggingId === image.id,
  'is-active': image.id === activePreviewId,
  'is-paste-highlighted': pasteHighlightedId === image.id,
}"
```

- [ ] **Step 6: Add the layout-stable CSS animation**

Add a 700ms animation using background, border-color, and inset/outset shadow only:

```css
.image-card.is-paste-highlighted {
  animation: image-paste-highlight 700ms ease-out;
}

@keyframes image-paste-highlight {
  0%, 100% { box-shadow: none; }
  30% { border-color: var(--line-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--line-focus) 24%, transparent); }
}
```

- [ ] **Step 7: Run focused tests and commit**

Run both focused files without `-t`, expect all tests to pass, and commit:

```bash
git add src/App.vue src/components/ImagePanel.vue src/styles.css src/__tests__/app-render.test.ts src/__tests__/image-panel.test.ts
git commit -m "feat: reveal newly pasted images"
```

### Task 4: Full regression and production build

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Run formatting and patch checks**

Run:

```bash
git diff --check
```

Expected: exit 0 with no output.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: all Vitest files and tests pass with zero failures.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite complete with exit 0; do not add `dist/` to Git.

- [ ] **Step 4: Review scope and commit any verification-only corrections**

Inspect `git status --short` and `git diff --stat`. If verification required source corrections, stage only files in this plan and commit:

```bash
git add src/App.vue src/types.ts src/state/i18n.ts src/state/imageContextMenu.ts src/components/ImagePanel.vue src/styles.css src/__tests__/app-render.test.ts src/__tests__/image-panel.test.ts src/__tests__/i18n.test.ts
git commit -m "test: verify contextual image paste behavior"
```

Leave `dist/` and unrelated user changes unstaged.

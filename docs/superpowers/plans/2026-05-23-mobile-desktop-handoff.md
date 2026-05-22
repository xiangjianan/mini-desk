# Mobile Desktop Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mobile region-switching experience with a friendly mobile handoff page that blocks board functionality and points users to the desktop experience.

**Architecture:** Keep the existing desktop board intact and add a viewport-driven shell switch in `App.vue`. Mobile renders a dedicated `mobile-handoff` page plus the existing companion bubble; desktop continues rendering the full board, settings, image preview, keyboard shortcuts, paste handling, and region components.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vite.

---

## File Structure

- Modify `src/App.vue`: remove mobile area-switching state, add `matchMedia`-driven mobile blocking state, render the desktop board only outside the mobile breakpoint, render the mobile handoff page inside the breakpoint, and guard business keyboard/paste handlers while blocked.
- Modify `src/styles.css`: replace the mobile region-switching CSS with mobile handoff page styles and companion positioning.
- Modify `src/__tests__/app-render.test.ts`: replace mobile drawer assertions with mobile handoff assertions and add shortcut/paste blocking coverage.
- Modify `src/__tests__/naive-components.test.ts`: replace static mobile drawer contract checks with static mobile handoff contract checks.

---

### Task 1: App Render Tests For Mobile Blocking

**Files:**
- Modify: `src/__tests__/app-render.test.ts`

- [ ] **Step 1: Add a reusable mobile viewport stub**

Add this helper after `mountAppWithPersistentPopover()`:

```ts
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    matches,
    media: "(max-width: 900px)",
    onchange: null,
    addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.delete(listener);
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn((event: MediaQueryListEvent) => {
      listeners.forEach((listener) => listener(event));
      return true;
    }),
  } as unknown as MediaQueryList;

  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mediaQueryList));
  return mediaQueryList;
}
```

- [ ] **Step 2: Replace the mobile drawer test with a failing handoff test**

Replace the existing `renders a mobile drawer menu with todos selected by default` test with this test:

```ts
it("renders a mobile handoff page instead of board regions on mobile", async () => {
  vi.useFakeTimers();
  stubMatchMedia(true);
  const wrapper = mountApp();

  try {
    expect(wrapper.find(".mobile-handoff").exists()).toBe(true);
    expect(wrapper.get(".mobile-handoff-title").text()).toBe("To Do List 看板");
    expect(wrapper.text()).toContain("建议在电脑浏览器打开，以获得完整体验");
    expect(wrapper.find(".mobile-drawer-trigger").exists()).toBe(false);
    expect(wrapper.find(".mobile-drawer-menu").exists()).toBe(false);
    expect(wrapper.find('[aria-label="To Do List 看板"]').exists()).toBe(false);
    expect(wrapper.findComponent(ImagePanel).exists()).toBe(false);
    expect(wrapper.findComponent(QuickButtons).exists()).toBe(false);
    expect(wrapper.findComponent(TodoPanel).exists()).toBe(false);
    expect(wrapper.findComponent(SpacePanel).exists()).toBe(false);
    expect(wrapper.findComponent(SettingsMenu).exists()).toBe(false);
    expect(wrapper.findComponent(ImagePreview).exists()).toBe(false);
    expect(wrapper.findAll("textarea")).toHaveLength(0);
    expect(wrapper.find('[aria-label="切换主题"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("建议在电脑浏览器打开");
  } finally {
    wrapper.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
```

- [ ] **Step 3: Replace the mobile save feedback test with a failing shortcut guard test**

Replace the existing `keeps mobile save feedback near the upper right without hiding the companion` test with this test:

```ts
it("does not run board shortcuts or paste handling while mobile is blocked", async () => {
  vi.useFakeTimers();
  stubMatchMedia(true);
  const wrapper = mountApp();

  try {
    expect(wrapper.find('[data-testid="save-status"]').exists()).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    const pasteEvent = new Event("paste") as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: { items: [] },
    });
    document.dispatchEvent(pasteEvent);

    await wrapper.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain("保存中");
    expect(wrapper.find('[data-testid="companion-confirm"]').text()).toContain("建议在电脑浏览器打开");
    expect(wrapper.findComponent(ImagePanel).exists()).toBe(false);
  } finally {
    wrapper.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
```

- [ ] **Step 4: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts -t "mobile handoff|mobile is blocked"
```

Expected: both new tests fail because `.mobile-handoff` does not exist and the current mobile drawer board still renders.

- [ ] **Step 5: Commit the failing test changes**

```bash
git add src/__tests__/app-render.test.ts
git commit -m "test: cover mobile desktop handoff"
```

---

### Task 2: Static Contract Tests For Mobile Handoff

**Files:**
- Modify: `src/__tests__/naive-components.test.ts`

- [ ] **Step 1: Replace the mobile area-menu static contract**

Replace the existing `uses a mobile area menu instead of compressing the desktop board` test with this test:

```ts
it("uses a mobile handoff page instead of mobile board regions", () => {
  const app = read("src/App.vue");
  const styles = read("src/styles.css");
  const text = read("src/components/TextPanel.vue");

  expect(app).toContain('class="workspace-panel"');
  expect(app).toContain("MOBILE_BREAKPOINT_QUERY");
  expect(app).toContain("MOBILE_HANDOFF_MESSAGE");
  expect(app).toContain('class="mobile-handoff"');
  expect(app).toContain('class="mobile-handoff-title"');
  expect(app).toContain('class="mobile-handoff-theme"');
  expect(app).toContain('v-if="!isMobileBlocked"');
  expect(app).toContain("isMobileBlocked.value || companionVisible.value");
  expect(app).toContain("建议在电脑浏览器打开，以获得完整体验");
  expect(app).not.toContain('class="mobile-nav"');
  expect(app).not.toContain('class="mobile-drawer-trigger"');
  expect(app).not.toContain('class="mobile-drawer-menu"');
  expect(app).not.toContain('class="mobile-menu-option"');
  expect(app).not.toContain("data-mobile-active");
  expect(app).not.toContain("mobileActiveArea");
  expect(app).not.toContain("mobileNavOpen");
  expect(styles).toMatch(/\.mobile-handoff\s*\{[^}]*display: grid/s);
  expect(styles).toMatch(/\.mobile-handoff\s*\{[^}]*height: 100dvh/s);
  expect(styles).toMatch(/\.mobile-handoff-body\s*\{[^}]*display: grid/s);
  expect(styles).toMatch(/\.mobile-handoff-message\s*\{[^}]*border: 1px solid var\(--line-main\)/s);
  expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*--app-font-size: 14px/s);
  expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.focus-companion\s*\{[^}]*bottom: 28px/s);
  expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.focus-companion img\s*\{[^}]*width: 60px/s);
  expect(styles).not.toContain(".mobile-nav");
  expect(styles).not.toContain(".mobile-drawer-menu");
  expect(styles).not.toContain(".mobile-banner");
  expect(styles).not.toContain("data-mobile-active");
  expect(text).toContain("unlockTextareaForMobileKeyboard");
  expect(text).toContain('@touchstart="handleTouchStart"');
  expect(text).toContain('@pointerdown="handlePointerDown"');
});
```

- [ ] **Step 2: Run the focused static test and confirm it fails**

Run:

```bash
npm test -- src/__tests__/naive-components.test.ts -t "mobile handoff"
```

Expected: the test fails because `App.vue` and `styles.css` still contain the mobile area menu and do not contain `mobile-handoff`.

- [ ] **Step 3: Commit the failing static test**

```bash
git add src/__tests__/naive-components.test.ts
git commit -m "test: assert mobile handoff contract"
```

---

### Task 3: App Shell Mobile Handoff Implementation

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Remove mobile area switching state**

Delete this existing state and type block from `src/App.vue`:

```ts
const mobileActiveArea = ref<MobileArea>("todos");
const mobileNavOpen = ref(false);

type MobileArea = "images" | "note" | "quick" | "todos" | "spaces";

const mobileAreas: Array<{ key: MobileArea; label: string }> = [
  { key: "images", label: "图片" },
  { key: "note", label: "便签" },
  { key: "quick", label: "快捷" },
  { key: "todos", label: "待办" },
  { key: "spaces", label: "空间" },
];
```

Delete this computed value:

```ts
const mobileActiveLabel = computed(() =>
  mobileAreas.find((area) => area.key === mobileActiveArea.value)?.label ?? "待办",
);
```

- [ ] **Step 2: Add mobile handoff constants and responsive state**

Add this block after the imports and before `const state = reactive<BoardState>(loadState());`:

```ts
const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";
const MOBILE_HANDOFF_MESSAGE = "建议在电脑浏览器打开，以获得完整体验 (｡•̀ᴗ-)✧";
const MOBILE_HANDOFF_DESCRIPTION = "这个看板为桌面端工作流设计，用来整理截图、便签、提醒事项、快捷链接和工作空间。";
const mobileCompanionPosition: { right: string; bottom: string } = { right: "18px", bottom: "28px" };

function getInitialMobileBlocked(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}
```

Add this state near the other refs:

```ts
const isMobileBlocked = ref(getInitialMobileBlocked());
const mobileMediaQuery = ref<MediaQueryList | null>(null);
```

Add these computed values after `const companionVisible = computed(...)`:

```ts
const activeCompanionVisible = computed(() => isMobileBlocked.value || companionVisible.value);
const activeCompanionMessage = computed(() => (isMobileBlocked.value ? MOBILE_HANDOFF_MESSAGE : bubbleMessage.value));
const activeCompanionPosition = computed(() => (isMobileBlocked.value ? mobileCompanionPosition : companionPosition.value));
```

- [ ] **Step 3: Wire matchMedia lifecycle**

Add this function block before `onMounted`:

```ts
function updateMobileBlocked(source?: MediaQueryList | MediaQueryListEvent): void {
  const matches = Boolean(source?.matches ?? mobileMediaQuery.value?.matches);
  isMobileBlocked.value = matches;
  if (matches) {
    activePreviewId.value = undefined;
    hideBubbleMessage({ clearRetainedContent: true });
  }
}

function setupMobileBreakpoint(): void {
  if (!window.matchMedia) return;
  const query = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
  mobileMediaQuery.value = query;
  updateMobileBlocked(query);
  if (query.addEventListener) {
    query.addEventListener("change", updateMobileBlocked);
    return;
  }
  query.addListener(updateMobileBlocked);
}

function teardownMobileBreakpoint(): void {
  const query = mobileMediaQuery.value;
  if (!query) return;
  if (query.removeEventListener) {
    query.removeEventListener("change", updateMobileBlocked);
  } else {
    query.removeListener(updateMobileBlocked);
  }
  mobileMediaQuery.value = null;
}
```

Change `onMounted` to call `setupMobileBreakpoint()` before event listeners:

```ts
onMounted(async () => {
  applyTheme();
  setupMobileBreakpoint();
  state.images = await hydrateStoredImages(state.images);
  await persistImagePayloads(state.images);
  checkAppVersion();
  window.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("paste", handlePaste);
});
```

Change `onUnmounted` to call `teardownMobileBreakpoint()`:

```ts
onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  document.removeEventListener("paste", handlePaste);
  teardownMobileBreakpoint();
  clearTimers();
});
```

- [ ] **Step 4: Guard board-only paste and keyboard handlers**

Add this first line inside `handlePaste`:

```ts
  if (isMobileBlocked.value) return;
```

The function should start as:

```ts
async function handlePaste(event: ClipboardEvent): Promise<void> {
  if (isMobileBlocked.value) return;
  const items = Array.from(event.clipboardData?.items ?? []);
```

Add this first line inside `handleGlobalKeydown`:

```ts
  if (isMobileBlocked.value) return;
```

The function should start as:

```ts
function handleGlobalKeydown(event: KeyboardEvent): void {
  if (isMobileBlocked.value) return;
  if (event.key === "Escape" && companionVisible.value) {
```

- [ ] **Step 5: Replace the desktop/mobile template shell**

Change the board `<main>` opening tag from:

```vue
<main class="board" aria-label="To Do List 看板" :data-mobile-active="mobileActiveArea">
```

to:

```vue
<main v-if="!isMobileBlocked" class="board" aria-label="To Do List 看板">
```

Delete the entire `<nav class="mobile-nav" ...>` block and the entire `<div class="mobile-banner">...</div>` block.

After the desktop board closing `</main>`, add this mobile handoff main:

```vue
<main v-else class="mobile-handoff" aria-label="To Do List 看板移动端引导">
  <header class="mobile-handoff-header">
    <h1 class="mobile-handoff-title">To Do List 看板</h1>
    <NButton quaternary size="small" class="mobile-handoff-theme icon-button" aria-label="切换主题" @click="handleThemeClick">
      <NIcon :component="state.theme === 'dark' ? SunnyOutline : MoonOutline" />
    </NButton>
  </header>

  <section class="mobile-handoff-body" aria-labelledby="mobile-handoff-title">
    <div class="mobile-handoff-message">
      <h2 id="mobile-handoff-title">桌面端体验更完整</h2>
      <p>{{ MOBILE_HANDOFF_DESCRIPTION }}</p>
      <p>{{ MOBILE_HANDOFF_MESSAGE }}</p>
    </div>
  </section>
</main>
```

Change the image preview from:

```vue
<ImagePreview
  :images="state.images"
  :active-id="activePreviewId"
  @close="activePreviewId = undefined"
  @copy="copyImage"
  @delete="deleteImage"
  @activate="activePreviewId = $event"
/>
```

to:

```vue
<ImagePreview
  v-if="!isMobileBlocked"
  :images="state.images"
  :active-id="activePreviewId"
  @close="activePreviewId = undefined"
  @copy="copyImage"
  @delete="deleteImage"
  @activate="activePreviewId = $event"
/>
```

Change the companion bubble props to use the active mobile-aware values:

```vue
<CompanionBubble
  :visible="activeCompanionVisible"
  :message="activeCompanionMessage"
  :link-text="isMobileBlocked ? undefined : bubbleLink?.text"
  :link-href="isMobileBlocked ? undefined : bubbleLink?.href"
  :confirm="!isMobileBlocked && Boolean(pendingConfirm)"
  :confirm-text="isMobileBlocked ? undefined : pendingConfirm?.confirmText"
  :cancel-text="isMobileBlocked ? undefined : pendingConfirm?.cancelText"
  :clear-signal="bubbleClearSignal"
  :position="activeCompanionPosition"
  :theme="state.theme"
  @yes="confirmCompanionAction"
  @no="cancelCompanionAction"
  @pause="pauseBubbleTimer"
  @resume="resumeBubbleTimer"
/>
```

Change the top actions wrapper from:

```vue
<div class="top-actions">
```

to:

```vue
<div v-if="!isMobileBlocked" class="top-actions">
```

- [ ] **Step 6: Run focused app render tests**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts -t "mobile handoff|mobile is blocked|preserved board regions"
```

Expected: the new mobile tests pass, and the desktop board shell test still passes.

- [ ] **Step 7: Commit the App shell implementation**

```bash
git add src/App.vue src/__tests__/app-render.test.ts
git commit -m "feat: add mobile desktop handoff shell"
```

---

### Task 4: Mobile Handoff Styling And Static Contract

**Files:**
- Modify: `src/styles.css`
- Modify: `src/__tests__/naive-components.test.ts`

- [ ] **Step 1: Replace mobile region styles with handoff styles**

Delete these base selectors:

```css
.mobile-banner {
  display: none;
}

.mobile-nav {
  display: none;
}
```

Add these base styles in their place:

```css
.mobile-handoff {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100vw;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
}

.mobile-handoff-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  min-height: 47px;
  border-bottom: 1px solid var(--line-main);
  background: var(--panel);
}

.mobile-handoff-title {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 12px;
  font-size: var(--app-font-size);
  font-weight: 400;
}

.mobile-handoff-theme {
  align-self: stretch;
  width: 47px;
  min-width: 47px;
  height: auto;
  min-height: 47px;
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
}

.mobile-handoff-body {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  padding: 24px 16px 112px;
}

.mobile-handoff-message {
  width: min(100%, 360px);
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line-main);
  background: var(--panel);
  color: var(--text);
}

.mobile-handoff-message h2 {
  font-size: 16px;
  font-weight: 400;
  line-height: 1.45;
}

.mobile-handoff-message p {
  color: var(--muted);
  font-size: var(--app-font-size);
  line-height: 1.6;
}
```

- [ ] **Step 2: Replace the mobile media query body**

Inside `@media (max-width: 900px)`, keep the `:root` font-size and `html, body, #app` overflow rules. Delete all rules for:

```css
.board
.mobile-nav
.mobile-drawer-trigger
.mobile-menu-icon
.mobile-drawer-menu
.mobile-menu-option
.mobile-banner
.board[data-mobile-active="images"] > .image-panel
.board[data-mobile-active="note"] > .note-link-panel
.board[data-mobile-active="quick"] > .note-link-panel
.board[data-mobile-active="todos"] > .todo-panel
.board[data-mobile-active="spaces"] > .space-panel
.board[data-mobile-active="note"] .quick-block
.board[data-mobile-active="quick"] .note-panel
.note-link-panel
.workspace-panel
.workspace-panel .panel-header
.workspace-panel .space-tabs
.workspace-panel .text-editor-frame
.workspace-panel .text-editor-textarea
.top-actions
.top-actions .icon-button
```

Keep or add these mobile companion rules:

```css
  .focus-companion {
    top: auto;
    right: 18px;
    bottom: 28px;
    gap: 4px;
    z-index: 3200;
  }

  .focus-companion img {
    width: 60px;
    height: 60px;
  }

  .companion-popover-shell.n-popover {
    max-width: min(220px, calc(100vw - 24px)) !important;
  }

  .image-preview {
    display: none !important;
  }
```

- [ ] **Step 3: Run focused static and render tests**

Run:

```bash
npm test -- src/__tests__/naive-components.test.ts -t "mobile handoff"
npm test -- src/__tests__/app-render.test.ts -t "mobile handoff|mobile is blocked"
```

Expected: both commands pass.

- [ ] **Step 4: Commit styling and static contract**

```bash
git add src/styles.css src/__tests__/naive-components.test.ts
git commit -m "style: replace mobile board layout with handoff page"
```

---

### Task 5: Full Verification And Browser QA

**Files:**
- Verify: `src/App.vue`
- Verify: `src/styles.css`
- Verify: `src/__tests__/app-render.test.ts`
- Verify: `src/__tests__/naive-components.test.ts`

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: `vue-tsc --noEmit` and `vite build` both complete without errors.

- [ ] **Step 3: Start the local dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite serves the app at `http://127.0.0.1:5173/`.

- [ ] **Step 4: Verify desktop in the browser**

Open `http://127.0.0.1:5173/` at a desktop viewport such as `1280x800`.

Expected:

- Full board is visible.
- `截图`, `便签`, `快捷链接`, `早上`, `中午`, `晚上`, and `工作空间` appear.
- Settings and theme controls appear at the upper right.
- Mobile handoff text is absent.

- [ ] **Step 5: Verify mobile in the browser**

Open the same URL at a mobile viewport such as `390x844`.

Expected:

- Only the `mobile-handoff` page is visible.
- The text `建议在电脑浏览器打开，以获得完整体验` is visible.
- No mobile drawer or region-switching menu appears.
- Board regions are absent.
- Settings is absent.
- Theme toggle remains visible.
- Companion bubble appears without overlapping the message card.

- [ ] **Step 6: Commit verification fixes**

When verification requires no code changes, run:

```bash
git status --short
```

Expected: no uncommitted files.

When verification produces a correction, run:

```bash
git add src/App.vue src/styles.css src/__tests__/app-render.test.ts src/__tests__/naive-components.test.ts
git commit -m "fix: stabilize mobile handoff verification"
```

Expected: the correction is committed and `git status --short` shows no uncommitted files.

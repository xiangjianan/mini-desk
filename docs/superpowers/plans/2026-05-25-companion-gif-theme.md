# Companion GIF Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted companion GIF theme setting with current Hermes as the compatible default and a `none` option that shows only the bubble content.

**Architecture:** Keep app state in `BoardState`, normalize the preference in storage, and keep GIF asset resolution inside the companion component boundary. `SettingsMenu` owns only dropdown rendering and emits selected theme ids; `App.vue` owns persistence and passes the selected theme to `CompanionBubble`.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, @vue/test-utils, Naive UI dropdowns/popovers.

---

## File Map

- Modify `src/types.ts`: add `CompanionGifTheme` union and `companionGifTheme` to `BoardState`.
- Create `src/state/companionGifThemes.ts`: define allowed theme ids, labels, default, options, and normalizer without importing image assets.
- Modify `src/state/defaults.ts`: set default `companionGifTheme` to `"hermes"`.
- Modify `src/state/storage.ts`: normalize imported `companionGifTheme` and serialize it.
- Modify `src/components/SettingsMenu.vue`: add `GIF 主题` submenu, selected marker, prop, and emit.
- Modify `src/components/CompanionBubble.vue`: add `gifTheme` prop, resolve Hermes assets locally, and support content-only rendering for `"none"`.
- Modify `src/App.vue`: pass and update the GIF theme setting.
- Modify tests:
  - `src/__tests__/state.test.ts`
  - `src/__tests__/settings-menu.test.ts`
  - `src/__tests__/companion-bubble.test.ts`
  - `src/__tests__/app-render.test.ts`
  - `src/__tests__/naive-components.test.ts`

---

### Task 1: State Model and Persistence

**Files:**
- Modify: `src/types.ts`
- Create: `src/state/companionGifThemes.ts`
- Modify: `src/state/defaults.ts`
- Modify: `src/state/storage.ts`
- Test: `src/__tests__/state.test.ts`

- [ ] **Step 1: Write failing state tests**

Append these tests to `src/__tests__/state.test.ts`, merging imports if the file already imports the same modules:

```ts
import { DEFAULT_COMPANION_GIF_THEME } from "../state/companionGifThemes";
import { defaultState } from "../state/defaults";
import { getSerializableState, normalizeImportedState } from "../state/storage";

it("defaults to the Hermes companion GIF theme", () => {
  expect(defaultState().companionGifTheme).toBe(DEFAULT_COMPANION_GIF_THEME);
});

it("preserves the disabled companion GIF theme during import and serialization", () => {
  const state = normalizeImportedState({ companionGifTheme: "none" });

  expect(state.companionGifTheme).toBe("none");
  expect(getSerializableState(state).companionGifTheme).toBe("none");
});

it("normalizes unknown companion GIF themes to Hermes", () => {
  expect(normalizeImportedState({ companionGifTheme: "future-theme" }).companionGifTheme).toBe("hermes");
  expect(normalizeImportedState({ companionGifTheme: "" }).companionGifTheme).toBe("hermes");
  expect(normalizeImportedState({ companionGifTheme: null }).companionGifTheme).toBe("hermes");
});
```

- [ ] **Step 2: Run the focused state test and verify red**

Run:

```bash
npx vitest run src/__tests__/state.test.ts
```

Expected: FAIL because `DEFAULT_COMPANION_GIF_THEME`, `companionGifTheme`, and the normalizer do not exist yet.

- [ ] **Step 3: Add the type and theme helper**

In `src/types.ts`, add the union type near the other simple exported types:

```ts
export type CompanionGifTheme = "hermes" | "none";
```

In `src/types.ts`, add the field to `BoardState`:

```ts
export interface BoardState {
  theme: ThemeMode;
  companionGifTheme: CompanionGifTheme;
  customTitles: Record<string, string>;
  noteLines: LineItem[];
  workspaceLines: LineItem[];
  storageLines: LineItem[];
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
  images: StoredImage[];
  quickButtons: QuickButton[];
  showHiddenQuickButtons: boolean;
  showCompletedTodos: TodoCompletedVisibility;
  todos: TodoMap;
}
```

Create `src/state/companionGifThemes.ts`:

```ts
import type { CompanionGifTheme } from "../types";

export const DEFAULT_COMPANION_GIF_THEME: CompanionGifTheme = "hermes";

export const COMPANION_GIF_THEME_OPTIONS: Array<{
  value: CompanionGifTheme;
  label: string;
}> = [
  { value: "hermes", label: "默认 Hermes" },
  { value: "none", label: "无 GIF" },
];

export function normalizeCompanionGifTheme(value: unknown): CompanionGifTheme {
  return value === "none" || value === "hermes" ? value : DEFAULT_COMPANION_GIF_THEME;
}
```

- [ ] **Step 4: Persist the new setting**

In `src/state/defaults.ts`, import the default:

```ts
import { DEFAULT_COMPANION_GIF_THEME } from "./companionGifThemes";
```

Then add the default field:

```ts
export function defaultState(): BoardState {
  return {
    theme: "light",
    companionGifTheme: DEFAULT_COMPANION_GIF_THEME,
    customTitles: {},
    noteLines: [],
    workspaceLines: [],
    storageLines: [],
    spaces: [{ id: DEFAULT_SPACE_ID, title: DEFAULT_SPACE_TITLE, lines: [] }],
    activeSpaceId: DEFAULT_SPACE_ID,
    images: [],
    quickButtons: [],
    showHiddenQuickButtons: false,
    showCompletedTodos: {
      morning: false,
      noon: false,
      evening: false,
    },
    todos: {
      morning: [],
      noon: [],
      evening: [],
    },
  };
}
```

In `src/state/storage.ts`, import the normalizer:

```ts
import { normalizeCompanionGifTheme } from "./companionGifThemes";
```

In `normalizeImportedState`, add the normalized value next to `theme`:

```ts
return {
  ...base,
  theme: typed.theme === "dark" ? "dark" : "light",
  companionGifTheme: normalizeCompanionGifTheme(typed.companionGifTheme),
  customTitles,
  noteLines,
  workspaceLines,
  storageLines,
  spaces,
  activeSpaceId: normalizeActiveSpaceId(typed.activeSpaceId, spaces),
  images: normalizeImages(typed.images),
  quickButtons: normalizeQuickButtons(typed.quickButtons),
  showHiddenQuickButtons: Boolean(typed.showHiddenQuickButtons),
  showCompletedTodos: normalizeCompletedVisibility(typed.showCompletedTodos),
  todos: normalizeTodos(typed.todos),
};
```

`getSerializableState` already spreads `state`; no extra serialization code is needed after `BoardState` includes the normalized field.

- [ ] **Step 5: Run the focused state test and verify green**

Run:

```bash
npx vitest run src/__tests__/state.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/types.ts src/state/companionGifThemes.ts src/state/defaults.ts src/state/storage.ts src/__tests__/state.test.ts
git commit -m "feat: persist companion gif theme"
```

---

### Task 2: Settings Menu GIF Theme Selection

**Files:**
- Modify: `src/components/SettingsMenu.vue`
- Test: `src/__tests__/settings-menu.test.ts`

- [ ] **Step 1: Write failing settings menu tests**

Append these tests to `src/__tests__/settings-menu.test.ts`. Update `dropdownStub` to render child options and expose their checked marker:

```ts
const dropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: `
    <div>
      <slot />
      <template v-for="option in options" :key="option.key">
        <button
          class="dropdown-option"
          :data-key="option.key"
          :disabled="option.disabled"
          type="button"
          @click="!option.disabled && $emit('select', option.key)"
        >
          {{ typeof option.label === "function" ? option.key : option.label }}
        </button>
        <button
          v-for="child in option.children || []"
          :key="child.key"
          class="dropdown-option dropdown-child-option"
          :class="{ 'is-selected': Boolean(child.icon) }"
          :data-key="child.key"
          type="button"
          @click="$emit('select', child.key)"
        >
          {{ child.label }}
        </button>
      </template>
    </div>
  `,
};

it("renders companion GIF theme choices and marks the current choice", async () => {
  const wrapper = mount(SettingsMenu, {
    props: {
      appVersion: "1.0.18",
      updateAvailable: false,
      companionGifTheme: "none",
    },
    global: {
      stubs: {
        Dropdown: dropdownStub,
        NDropdown: dropdownStub,
        NBadge: { template: "<span><slot /></span>" },
        NButton: { template: "<button><slot /></button>" },
        NIcon: { template: "<span />" },
      },
    },
  });

  expect(wrapper.find('[data-key="gif-theme"]').text()).toBe("GIF 主题");
  expect(wrapper.find('[data-key="gif-theme:hermes"]').text()).toBe("默认 Hermes");
  expect(wrapper.find('[data-key="gif-theme:none"]').text()).toBe("无 GIF");
  expect(wrapper.find('[data-key="gif-theme:none"]').classes()).toContain("is-selected");
  expect(wrapper.find('[data-key="gif-theme:hermes"]').classes()).not.toContain("is-selected");
});

it("emits the selected companion GIF theme", async () => {
  const wrapper = mount(SettingsMenu, {
    props: {
      appVersion: "1.0.18",
      updateAvailable: false,
      companionGifTheme: "hermes",
    },
    global: {
      stubs: {
        Dropdown: dropdownStub,
        NDropdown: dropdownStub,
        NBadge: { template: "<span><slot /></span>" },
        NButton: { template: "<button><slot /></button>" },
        NIcon: { template: "<span />" },
      },
    },
  });

  await wrapper.find('[data-key="gif-theme:none"]').trigger("click");

  expect(wrapper.emitted("gifTheme")?.[0]).toEqual(["none", expect.any(HTMLElement)]);
});
```

- [ ] **Step 2: Run the focused settings test and verify red**

Run:

```bash
npx vitest run src/__tests__/settings-menu.test.ts
```

Expected: FAIL because `SettingsMenu` has no `companionGifTheme` prop, no GIF submenu, and no `gifTheme` event.

- [ ] **Step 3: Add the settings submenu**

In `src/components/SettingsMenu.vue`, add imports:

```ts
import { CheckmarkOutline, ImagesOutline } from "@vicons/ionicons5";
import { COMPANION_GIF_THEME_OPTIONS } from "../state/companionGifThemes";
import type { CompanionGifTheme, GuideKey } from "../types";
```

Keep existing Ionicon imports and add `CheckmarkOutline` / `ImagesOutline` to that import list rather than creating a duplicate import.

Update props:

```ts
const props = defineProps<{
  appVersion: string;
  updateAvailable: boolean;
  companionGifTheme: CompanionGifTheme;
}>();
```

Update emits:

```ts
const emit = defineEmits<{
  export: [anchor?: HTMLElement];
  import: [anchor?: HTMLElement];
  about: [anchor?: HTMLElement];
  suggest: [anchor?: HTMLElement];
  update: [];
  gifTheme: [theme: CompanionGifTheme, anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();
```

Add the submenu option before `提建议`:

```ts
const options = computed(() => [
  { label: "数据导出", key: "export", icon: renderIcon(CloudDownloadOutline) },
  { label: "数据导入", key: "import", icon: renderIcon(CloudUploadOutline) },
  {
    label: "GIF 主题",
    key: "gif-theme",
    icon: renderIcon(ImagesOutline),
    children: COMPANION_GIF_THEME_OPTIONS.map((option) => ({
      label: option.label,
      key: `gif-theme:${option.value}`,
      icon: option.value === props.companionGifTheme ? renderIcon(CheckmarkOutline) : undefined,
    })),
  },
  { label: "提建议", key: "suggest", icon: renderIcon(CreateOutline) },
  { label: "关于", key: "about", icon: renderIcon(InformationCircleOutline) },
  { type: "divider", key: "version-divider" },
  {
    label: () =>
      h("span", { class: "settings-version-item", "data-testid": "settings-version" }, [
        h("span", `v${props.appVersion}`),
        props.updateAvailable ? h("span", { class: "settings-version-dot", "aria-hidden": "true" }) : null,
        props.updateAvailable ? h("span", { class: "settings-version-action" }, "更新") : null,
      ]),
    key: "version",
    disabled: !props.updateAvailable,
  },
]);
```

Update `handleSelect`:

```ts
function handleSelect(key: string): void {
  if (key === "export") emit("export", triggerRef.value ?? undefined);
  if (key === "import") emit("import", triggerRef.value ?? undefined);
  if (key === "suggest") emit("suggest", triggerRef.value ?? undefined);
  if (key === "about") emit("about", triggerRef.value ?? undefined);
  if (key === "version" && props.updateAvailable) emit("update");
  if (key === "gif-theme:hermes" || key === "gif-theme:none") {
    emit("gifTheme", key.replace("gif-theme:", "") as CompanionGifTheme, triggerRef.value ?? undefined);
  }
}
```

- [ ] **Step 4: Run the focused settings test and verify green**

Run:

```bash
npx vitest run src/__tests__/settings-menu.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/SettingsMenu.vue src/__tests__/settings-menu.test.ts
git commit -m "feat: add gif theme menu"
```

---

### Task 3: Companion Bubble GIF-Free Rendering

**Files:**
- Modify: `src/components/CompanionBubble.vue`
- Test: `src/__tests__/companion-bubble.test.ts`

- [ ] **Step 1: Write failing companion tests**

Append these tests to `src/__tests__/companion-bubble.test.ts`:

```ts
it("renders bubble content without an image when GIF theme is none", async () => {
  vi.useFakeTimers();
  const wrapper = mount(CompanionBubble, {
    props: {
      visible: true,
      message: "只显示气泡",
      gifTheme: "none",
    },
    global: {
      stubs: {
        NPopover: popoverStub,
      },
    },
  });

  expect(wrapper.find("img").exists()).toBe(false);
  await vi.advanceTimersByTimeAsync(200);

  expect(document.body.querySelector('[data-testid="companion-confirm"]')?.textContent).toContain("只显示气泡");
  expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(true);

  wrapper.unmount();
  vi.useRealTimers();
});

it("renders no companion surface for GIF-only visibility when GIF theme is none", () => {
  const wrapper = mount(CompanionBubble, {
    props: {
      visible: true,
      message: "",
      gifTheme: "none",
    },
    global: {
      stubs: {
        NPopover: popoverStub,
      },
    },
  });

  expect(wrapper.find('[data-testid="companion-bubble"]').exists()).toBe(false);

  wrapper.unmount();
});
```

Also update the existing `"switches the companion GIF for dark theme"` test to pass `gifTheme: "hermes"` so the default asset behavior remains explicit:

```ts
props: {
  visible: true,
  message: "",
  theme: "light",
  gifTheme: "hermes",
},
```

- [ ] **Step 2: Run the focused companion test and verify red**

Run:

```bash
npx vitest run src/__tests__/companion-bubble.test.ts
```

Expected: FAIL because `gifTheme` is ignored and the Hermes image still renders for `"none"`.

- [ ] **Step 3: Add GIF theme handling**

In `src/components/CompanionBubble.vue`, add type import:

```ts
import type { CompanionGifTheme } from "../types";
```

Update props:

```ts
const props = defineProps<{
  visible: boolean;
  message: string;
  linkText?: string;
  linkHref?: string;
  confirm?: boolean;
  confirmText?: string;
  cancelText?: string;
  actionText?: string;
  clearSignal?: number;
  persistent?: boolean;
  theme?: "light" | "dark";
  gifTheme?: CompanionGifTheme;
  position?: {
    right: string;
    bottom?: string;
    top?: string;
  };
}>();
```

Replace the `gifSrc` computed with:

```ts
const activeGifTheme = computed(() => props.gifTheme ?? "hermes");
const gifSrc = computed(() => {
  if (activeGifTheme.value === "none") return "";
  return props.theme === "dark" ? hermesDarkGif : hermesGif;
});
const shouldRenderGif = computed(() => Boolean(gifSrc.value));
const hasPopoverPayload = computed(() => Boolean(props.message || props.confirm || props.linkText));
```

Update the visibility computed values:

```ts
const surfaceVisible = computed(() => {
  if (!props.visible) return false;
  if (shouldRenderGif.value) return gifVisible.value || gifFading.value;
  return hasPopoverPayload.value;
});
const popoverVisible = computed(() => {
  if (!props.visible || !hasPopoverPayload.value) return false;
  return shouldRenderGif.value ? gifVisible.value : true;
});
```

In the watcher that starts GIF timers, include `props.gifTheme` in the watched tuple and short-circuit when no GIF should render:

```ts
watch(
  () =>
    [
      props.visible,
      props.message,
      props.linkText,
      props.linkHref,
      props.confirm,
      props.persistent,
      props.gifTheme,
      props.position?.right,
      props.position?.bottom,
      props.position?.top,
    ] as const,
  ([visible]) => {
    window.clearTimeout(gifTimer.value);
    window.clearTimeout(gifFadeTimer.value);
    gifTimer.value = undefined;
    gifFadeTimer.value = undefined;
    gifRemainingMs.value = GIF_MAX_VISIBLE_MS;
    gifTimerStartedAt.value = 0;
    if (!visible || !shouldRenderGif.value) {
      hoveringCompanion.value = false;
      gifVisible.value = false;
      gifFading.value = false;
      return;
    }
    gifVisible.value = true;
    gifFading.value = false;
    if (props.persistent) return;
    if (!hoveringCompanion.value) startGifTimer(GIF_MAX_VISIBLE_MS);
  },
  { immediate: true },
);
```

In the template trigger, render an image only for GIF themes and use a zero-size anchor for content-only mode:

```vue
<template #trigger>
  <img v-if="shouldRenderGif" :src="gifSrc" alt="" />
  <span v-else class="companion-popover-anchor" aria-hidden="true" />
</template>
```

Add CSS to `src/styles.css` in Task 4 if visual browser testing shows the zero-size anchor needs a stable target. Otherwise no CSS is required because the wrapper already positions the popover.

- [ ] **Step 4: Run the focused companion test and verify green**

Run:

```bash
npx vitest run src/__tests__/companion-bubble.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/CompanionBubble.vue src/__tests__/companion-bubble.test.ts
git commit -m "feat: support gif-free companion bubbles"
```

---

### Task 4: App Wiring and Integration Tests

**Files:**
- Modify: `src/App.vue`
- Modify: `src/styles.css` if a content-only anchor rule is needed
- Test: `src/__tests__/app-render.test.ts`
- Test: `src/__tests__/naive-components.test.ts`

- [ ] **Step 1: Write failing app integration tests**

Append these tests to `src/__tests__/app-render.test.ts`:

```ts
it("persists companion GIF theme selections from settings", async () => {
  const wrapper = mountApp();

  try {
    wrapper.getComponent(SettingsMenu).vm.$emit("gifTheme", "none", wrapper.getComponent(SettingsMenu).element as HTMLElement);
    await wrapper.vm.$nextTick();

    expect(wrapper.getComponent(SettingsMenu).props("companionGifTheme")).toBe("none");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").companionGifTheme).toBe("none");
    expect(wrapper.getComponent(CompanionBubble).props("gifTheme")).toBe("none");
  } finally {
    wrapper.unmount();
  }
});

it("shows guide bubble content without a GIF when GIF theme is none", async () => {
  vi.useFakeTimers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ companionGifTheme: "none" }));
  const wrapper = mountApp();

  try {
    await wrapper.get(".image-panel").trigger("click");
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".focus-companion img").exists()).toBe(false);
    expect(wrapper.find('[data-testid="companion-confirm"]').exists()).toBe(true);
  } finally {
    wrapper.unmount();
    vi.useRealTimers();
  }
});
```

In `src/__tests__/naive-components.test.ts`, update the companion test expectations:

```ts
expect(app).toContain(':gif-theme="state.companionGifTheme"');
expect(settings).toContain("companionGifTheme");
expect(settings).toContain("gifTheme");
expect(settings).toContain("GIF 主题");
expect(companion).toContain("gifTheme");
expect(companion).toContain("shouldRenderGif");
```

- [ ] **Step 2: Run focused integration tests and verify red**

Run:

```bash
npx vitest run src/__tests__/app-render.test.ts src/__tests__/naive-components.test.ts
```

Expected: FAIL because `App.vue` does not pass the theme state into `SettingsMenu` or `CompanionBubble`.

- [ ] **Step 3: Wire the selected theme through the app**

In `src/App.vue`, import the type:

```ts
import type { BoardState, CompanionGifTheme, DraggedTodo, GuideKey, LineItem, QuickButtonType, StoredImage, TodoPeriod, TodoStarChange } from "./types";
```

Add a handler near `handleThemeClick`:

```ts
function updateCompanionGifTheme(theme: CompanionGifTheme, anchor?: HTMLElement): void {
  state.companionGifTheme = theme;
  persistNow();
  showBubbleText(theme === "none" ? "已关闭 GIF" : "已切换 GIF 主题", anchor);
}
```

Pass the prop to `CompanionBubble`:

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
  :persistent="isMobileBlocked"
  :position="activeCompanionPosition"
  :theme="state.theme"
  :gif-theme="state.companionGifTheme"
  @yes="confirmCompanionAction"
  @no="cancelCompanionAction"
  @pause="pauseBubbleTimer"
  @resume="resumeBubbleTimer"
/>
```

Pass props and emit handler to `SettingsMenu`:

```vue
<SettingsMenu
  :app-version="appVersion"
  :update-available="versionPromptVisible"
  :companion-gif-theme="state.companionGifTheme"
  @export="exportData"
  @import="requestImport"
  @about="about"
  @suggest="suggestIssue"
  @update="updateStaticVersion"
  @gif-theme="updateCompanionGifTheme"
  @guide="handleGuideClick"
/>
```

If browser smoke testing shows content-only popovers lack a stable anchor, add this CSS to `src/styles.css` near `.focus-companion img`:

```css
.companion-popover-anchor {
  display: block;
  width: 0;
  height: 0;
}
```

- [ ] **Step 4: Run focused integration tests and verify green**

Run:

```bash
npx vitest run src/__tests__/app-render.test.ts src/__tests__/naive-components.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/App.vue src/styles.css src/__tests__/app-render.test.ts src/__tests__/naive-components.test.ts
git commit -m "feat: wire companion gif theme setting"
```

---

### Task 5: Final Verification and Browser Smoke

**Files:**
- Modify only files needed to fix issues found during verification.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS with all test files passing.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Vite chunk-size warnings are acceptable.

- [ ] **Step 3: Browser smoke test**

Run the local server:

```bash
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/` and verify:

- Settings menu contains `GIF 主题`.
- Selecting `无 GIF` persists after refresh.
- Clicking an empty area that shows Tips displays a bubble with no GIF image.
- Confirmation bubbles still render with action buttons when GIF is disabled.
- Selecting `默认 Hermes` restores the GIF image.

- [ ] **Step 4: Fix any verification issues**

If a test or browser smoke step fails, reproduce the failure with the smallest focused command, fix the root cause, and rerun the failing command before continuing.

- [ ] **Step 5: Commit verification fixes if any**

If Step 4 changed files, run:

```bash
git add src/App.vue src/components/CompanionBubble.vue src/components/SettingsMenu.vue src/styles.css src/types.ts src/state/companionGifThemes.ts src/state/defaults.ts src/state/storage.ts src/__tests__/app-render.test.ts src/__tests__/companion-bubble.test.ts src/__tests__/naive-components.test.ts src/__tests__/settings-menu.test.ts src/__tests__/state.test.ts
git commit -m "fix: complete companion gif theme verification"
```

If no files changed, do not create a commit.

---

## Self-Review

- Spec coverage: Task 1 covers persisted state and normalization. Task 2 covers the settings submenu and selected state. Task 3 covers Hermes and no-GIF companion behavior. Task 4 covers app persistence and settings wiring. Task 5 covers full verification and browser smoke.
- Placeholder scan: no `TBD`, `TODO`, or open-ended implementation steps remain.
- Type consistency: the plan uses `CompanionGifTheme`, `companionGifTheme`, `gifTheme`, and `gif-theme` consistently across types, props, emits, and template bindings.

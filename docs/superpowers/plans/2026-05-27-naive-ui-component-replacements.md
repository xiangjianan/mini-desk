# Naive UI Component Replacements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the requested custom controls with Naive UI `NDatePicker`, `NScrollbar`, `NEllipsis`, and `NUpload` while preserving existing todo board behavior.

**Architecture:** Keep state ownership in the current Vue components. `TodoPanel.vue` continues to emit notification timestamps, `SettingsMenu.vue` continues to emit custom GIF files, and CSS keeps the compact one-pixel line style. Tests drive each replacement before production code changes.

**Tech Stack:** Vue 3, TypeScript, Naive UI, Vitest, Vue Test Utils, Vite.

---

## File Structure

- Modify `src/state/deadlines.ts`: add a helper for today's default notification timestamp at 09:00.
- Modify `src/__tests__/deadlines.test.ts`: test the new default helper.
- Modify `src/components/TodoPanel.vue`: replace hand-built notification date/time editor with `NDatePicker`, wrap scrollable todo lists in `NScrollbar`, and use `NEllipsis` for reminder display text.
- Modify `src/__tests__/todo-panel.test.ts`: replace old hand-built calendar/time assertions with date picker behavior tests.
- Modify `src/components/SettingsMenu.vue`: replace native GIF file inputs with `NUpload`.
- Modify `src/__tests__/settings-menu.test.ts`: test upload-driven custom GIF selection.
- Modify `src/components/ImagePanel.vue`, `src/components/ImagePreview.vue`, `src/components/QuickButtons.vue`, `src/components/TextPanel.vue`, and `src/components/SpacePanel.vue`: apply `NScrollbar` to existing scroll regions.
- Modify `src/__tests__/naive-components.test.ts`: assert the requested Naive UI components are used.
- Modify `src/styles.css`: adjust Naive UI scrollbar, date picker, ellipsis display, upload dialog, and any wrappers needed for stable layout.

---

### Task 1: Default Notification Timestamp Helper

**Files:**
- Modify: `src/state/deadlines.ts`
- Modify: `src/__tests__/deadlines.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test in `src/__tests__/deadlines.test.ts`:

```ts
it("defaults new notification picker values to today at 09:00", () => {
  const value = getDefaultNotifyDateTimeValue(new Date(2026, 4, 25, 23, 30));

  expect(value).toBe(new Date(2026, 4, 25, 9, 0, 0, 0).getTime());
});
```

Update the import list:

```ts
import {
  NOTIFY_HOUR_OPTIONS,
  NOTIFY_MINUTE_OPTIONS,
  NOTIFY_TIME_OPTIONS,
  DEFAULT_NOTIFY_TIME,
  createNotifyAt,
  getDefaultNotifyDateTimeValue,
  getDefaultNotifySelection,
  getNotifyDisplay,
  getLocalDateInputValue,
} from "../state/deadlines";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/__tests__/deadlines.test.ts`

Expected: FAIL with an export error for `getDefaultNotifyDateTimeValue`.

- [ ] **Step 3: Implement the helper**

Add this function to `src/state/deadlines.ts`:

```ts
export function getDefaultNotifyDateTimeValue(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0).getTime();
}
```

- [ ] **Step 4: Verify the test passes**

Run: `npm test -- src/__tests__/deadlines.test.ts`

Expected: PASS.

---

### Task 2: Notification Editor Date Picker

**Files:**
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/__tests__/todo-panel.test.ts`
- Modify: `src/__tests__/naive-components.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing component/source tests**

In `src/__tests__/naive-components.test.ts`, add assertions that `TodoPanel.vue` imports and renders `NDatePicker`:

```ts
expect(todo).toContain("NDatePicker");
expect(todo).toContain('type="datetime"');
expect(todo).not.toContain("notify-calendar-grid");
expect(todo).not.toContain("notify-clock-options");
```

In `src/__tests__/todo-panel.test.ts`, update the notification editor test to assert date picker behavior instead of hand-built calendar buttons:

```ts
it("opens a Naive date picker notification editor with today 09:00 by default", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 25, 10));
  const wrapper = mountTodoPanelWithOneTodo();

  await wrapper.findAll(".dropdown-option").find((option) => option.text() === "设置通知时间")?.trigger("click");

  const picker = wrapper.getComponent({ name: "NDatePicker" });
  expect(picker.props("type")).toBe("datetime");
  expect(picker.props("value")).toBe(new Date(2026, 4, 25, 9).getTime());

  vi.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/todo-panel.test.ts src/__tests__/naive-components.test.ts`

Expected: FAIL because `NDatePicker` is not yet used and old calendar markup still exists.

- [ ] **Step 3: Implement the date picker editor**

In `src/components/TodoPanel.vue`:

```ts
import { NButton, NCheckbox, NDatePicker, NDropdown, NEllipsis, NIcon, NScrollbar } from "naive-ui";
```

Change the editor state to:

```ts
const notifyEditor = ref<{
  period: TodoPeriod;
  id: string;
  anchor: HTMLElement;
  value: number | null;
  x: number;
  y: number;
} | null>(null);
```

Use these helpers:

```ts
function getNotifyEditorValue(todo?: TodoItem): number {
  return isValidDeadlineAt(todo?.notifyAt) ? todo.notifyAt : getDefaultNotifyDateTimeValue();
}

function updateNotifyDateTime(value: number | null): void {
  if (!notifyEditor.value) return;
  notifyEditor.value = { ...notifyEditor.value, value };
}

function confirmNotifyEditor(): void {
  const editor = notifyEditor.value;
  if (!editor || editor.value === null) return;
  emit("notify", editor.period, editor.id, editor.value, editor.anchor);
  notifyEditor.value = null;
}
```

Replace the custom calendar/time template with:

```vue
<div class="notify-editor-body">
  <NDatePicker
    class="notify-date-picker"
    type="datetime"
    :value="notifyEditor.value"
    clearable
    format="yyyy-MM-dd HH:mm"
    value-format="timestamp"
    :actions="['clear', 'now', 'confirm']"
    @update:value="updateNotifyDateTime"
  />
</div>
<div class="deadline-editor-actions">
  <NButton size="small" quaternary class="deadline-ignore-button" @click="clearNotifyEditor">不设通知时间</NButton>
  <NButton size="small" quaternary class="deadline-cancel-button" @click="closeNotifyEditor">取消</NButton>
  <NButton size="small" type="primary" class="deadline-confirm-button" @click="confirmNotifyEditor">确定</NButton>
</div>
```

- [ ] **Step 4: Verify date picker tests pass**

Run: `npm test -- src/__tests__/todo-panel.test.ts src/__tests__/naive-components.test.ts`

Expected: PASS for updated notification editor assertions.

---

### Task 3: Naive Scrollbars and Ellipsis

**Files:**
- Modify: `src/components/ImagePanel.vue`
- Modify: `src/components/ImagePreview.vue`
- Modify: `src/components/QuickButtons.vue`
- Modify: `src/components/SpacePanel.vue`
- Modify: `src/components/TextPanel.vue`
- Modify: `src/components/TodoPanel.vue`
- Modify: `src/__tests__/naive-components.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing source tests**

Add to `src/__tests__/naive-components.test.ts`:

```ts
it("uses Naive scrollbars for scrollable app regions and ellipsis for reminder text", () => {
  const sources = [
    "src/components/ImagePanel.vue",
    "src/components/ImagePreview.vue",
    "src/components/QuickButtons.vue",
    "src/components/SpacePanel.vue",
    "src/components/TextPanel.vue",
    "src/components/TodoPanel.vue",
  ];

  for (const file of sources) {
    expect(read(file), file).toContain("NScrollbar");
  }

  const todo = read("src/components/TodoPanel.vue");
  expect(todo).toContain("NEllipsis");
  expect(todo).toContain("todo-text-ellipsis");
});
```

- [ ] **Step 2: Run the source test to verify it fails**

Run: `npm test -- src/__tests__/naive-components.test.ts`

Expected: FAIL because scrollbars and ellipsis are not yet used everywhere.

- [ ] **Step 3: Implement scrollbars and ellipsis**

Apply `NScrollbar` imports and wrappers:

```vue
<NScrollbar class="image-list-scrollbar">
  <div class="image-list">...</div>
</NScrollbar>
```

```vue
<NScrollbar class="text-editor-scrollbar">
  <textarea class="text-editor-textarea board-textarea large-textarea" />
</NScrollbar>
```

```vue
<NScrollbar class="todo-list-scrollbar">
  <TransitionGroup tag="ul" class="todo-list">...</TransitionGroup>
</NScrollbar>
```

For reminder text display in `TodoPanel.vue`, keep the input only when editable and use ellipsis otherwise:

```vue
<input v-if="isTodoEditable(list.id, entry.todo)" class="todo-input" ... />
<button v-else class="todo-input todo-input-display" type="button" @click="startTodoEdit($event, list.id, entry.todo.id)">
  <NEllipsis class="todo-text-ellipsis">{{ entry.todo.text }}</NEllipsis>
</button>
```

- [ ] **Step 4: Update CSS for wrapper sizing**

Add or adjust rules so wrapper elements inherit the previous scroll dimensions:

```css
.image-list-scrollbar,
.quick-buttons-scrollbar,
.todo-list-scrollbar,
.text-editor-scrollbar,
.space-tabs-scrollbar,
.preview-image-list-scrollbar {
  min-height: 0;
}

.todo-input-display {
  display: flex;
  align-items: center;
  min-width: 0;
  text-align: left;
}

.todo-text-ellipsis {
  min-width: 0;
  width: 100%;
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- src/__tests__/naive-components.test.ts src/__tests__/todo-panel.test.ts`

Expected: PASS.

---

### Task 4: GIF Upload Component

**Files:**
- Modify: `src/components/SettingsMenu.vue`
- Modify: `src/__tests__/settings-menu.test.ts`
- Modify: `src/__tests__/naive-components.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing upload tests**

Update the SettingsMenu custom GIF test to drive `NUpload` file list updates:

```ts
const light = new File(["light"], "light.gif", { type: "image/gif" });
const dark = new File(["dark"], "dark.gif", { type: "image/gif" });

await wrapper.find('[data-key="gif-theme:custom"]').trigger("click");
await wrapper.getComponent('[data-testid="gif-theme-light-upload"]').vm.$emit("update:file-list", [{ file: light }]);
await wrapper.getComponent('[data-testid="gif-theme-dark-upload"]').vm.$emit("update:file-list", [{ file: dark }]);
await wrapper.get(".gif-theme-custom-confirm").trigger("click");

expect(wrapper.emitted("customGif")?.[0]).toEqual([{ light, dark }, expect.any(HTMLElement)]);
```

Add source assertions:

```ts
expect(settings).toContain("NUpload");
expect(settings).not.toContain('type="file"');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/settings-menu.test.ts src/__tests__/naive-components.test.ts`

Expected: FAIL because native file inputs still exist.

- [ ] **Step 3: Implement `NUpload`**

In `SettingsMenu.vue`, import `NUpload` and `type UploadFileInfo`:

```ts
import { NBadge, NButton, NDropdown, NIcon, NUpload } from "naive-ui";
import type { UploadFileInfo } from "naive-ui";
```

Add handlers:

```ts
function handleCustomGifUpload(fileList: UploadFileInfo[], mode: "light" | "dark"): void {
  const file = fileList[0]?.file ?? undefined;
  if (mode === "light") customGifLightFile.value = file;
  else customGifDarkFile.value = file;
}
```

Replace each native input with:

```vue
<NUpload
  data-testid="gif-theme-light-upload"
  accept="image/gif,.gif"
  :max="1"
  :default-upload="false"
  @update:file-list="(files) => handleCustomGifUpload(files, 'light')"
>
  <NButton size="small">选择浅色 GIF</NButton>
</NUpload>
```

- [ ] **Step 4: Verify upload tests pass**

Run: `npm test -- src/__tests__/settings-menu.test.ts src/__tests__/naive-components.test.ts`

Expected: PASS.

---

### Task 5: Full Verification and Browser QA

**Files:**
- Modify only if verification exposes a bug.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Start the dev server**

Run: `npm run dev -- --port 5173`

Expected: Vite serves the app at `http://127.0.0.1:5173/`.

- [ ] **Step 4: Browser verification**

Open `http://127.0.0.1:5173/` and verify:

- Setting notification time opens the Naive date-time picker with today's 09:00 default.
- Todo list scrolling, image list scrolling, quick button scrolling, text panel scrolling, tabs, and preview sidebar scroll through Naive UI scrollbars.
- Long reminder text truncates without pushing notify/star buttons out of the row.
- Custom GIF uses upload controls and emits selected light/dark GIF files.

- [ ] **Step 5: Review diff**

Run: `git diff -- src docs/superpowers/plans/2026-05-27-naive-ui-component-replacements.md`

Expected: Only planned files changed.

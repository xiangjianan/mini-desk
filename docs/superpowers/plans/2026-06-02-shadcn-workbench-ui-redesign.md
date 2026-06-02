# Shadcn Workbench UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Vue todo board into a shadcn-style workbench with a left icon rail, top command bar, four-zone dashboard layout, Tailwind tokens, and gradual `shadcn-vue` adoption.

**Architecture:** Keep the existing Vue state and workflow components intact, then wrap them in a new workbench shell. Add Tailwind v4 and `shadcn-vue` foundation first, introduce focused shell/UI primitives, then migrate visual composition and Naive UI compatibility styling without changing data contracts.

**Tech Stack:** Vue 3, Vite, TypeScript, Vitest, Tailwind CSS v4, `shadcn-vue`, `lucide-vue-next`, retained Naive UI compatibility layer.

---

## Source References

- Spec: `docs/superpowers/specs/2026-06-02-shadcn-workbench-ui-redesign-design.md`
- shadcn-vue Vite install: `https://v3.shadcn-vue.com/docs/installation/vite`
- shadcn/ui Blocks visual reference: `https://ui.shadcn.com/blocks`
- shadcn/ui Sidebar visual reference: `https://ui.shadcn.com/docs/components/sidebar`
- Material Design navigation rail reference: `https://m3.material.io/components/navigation-rail/overview`

## File Structure

- Modify `package.json` and `package-lock.json`: add Tailwind, shadcn-vue runtime dependencies, and icon utilities.
- Modify `vite.config.ts`: add Tailwind Vite plugin and `@` path alias.
- Modify `tsconfig.json` and `tsconfig.node.json` if required by build: add path alias support for `@/*`.
- Create `components.json`: shadcn-vue component registry configuration.
- Create `src/lib/utils.ts`: shared `cn()` helper for shadcn-style class composition.
- Modify `src/styles.css`: add Tailwind import, shadcn semantic tokens, compatibility variables, and workbench layout styles.
- Create `src/components/WorkbenchShell.vue`: app chrome with rail, command bar, and slot-based work zones.
- Create `src/components/ui/*`: shadcn-vue source components installed through the CLI where possible.
- Modify `src/App.vue`: replace direct `.board` composition with `WorkbenchShell` slots and move top actions into the command bar.
- Modify `src/components/*.vue` styles only where panel internals need token alignment.
- Modify tests under `src/__tests__/`: add config and shell tests, then update app-render assertions.

---

## Task 1: Baseline And Worktree Setup

**Files:**
- Read: `package.json`
- Read: `docs/superpowers/specs/2026-06-02-shadcn-workbench-ui-redesign-design.md`

- [ ] **Step 1: Confirm isolated workspace**

Run:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
git rev-parse --show-superproject-working-tree 2>/dev/null
git branch --show-current
git status --short
```

Expected: either already in a linked worktree, or clean normal checkout on the current feature branch.

- [ ] **Step 2: Install current dependencies**

Run:

```bash
npm install
```

Expected: exits 0 and does not remove required dependencies.

- [ ] **Step 3: Run baseline tests**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0 before production code changes begin. If they fail, capture the failing test names or TypeScript errors and stop for review before changing UI code.

- [ ] **Step 4: Commit only if setup files changed**

Run:

```bash
git status --short
```

Expected: clean. If `package-lock.json` changed only from npm normalization, inspect `git diff package-lock.json` and commit it separately with:

```bash
git add package-lock.json
git commit -m "chore: normalize npm lockfile"
```

---

## Task 2: Tailwind And shadcn-vue Foundation

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Modify: `src/styles.css`
- Test: `src/__tests__/design-system-config.test.ts`

- [ ] **Step 1: Write failing config test**

Create `src/__tests__/design-system-config.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, "../../", path), "utf8")) as T;
}

describe("design system setup", () => {
  it("configures Tailwind and shadcn-vue for a Vue Vite app", () => {
    const packageJson = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>("package.json");
    const tsconfig = readJson<{ compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }>("tsconfig.json");
    const components = readJson<{ aliases: Record<string, string>; style: string; tailwind: { css: string } }>("components.json");
    const viteConfig = readFileSync(resolve(__dirname, "../../vite.config.ts"), "utf8");
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(packageJson.dependencies).toHaveProperty("lucide-vue-next");
    expect(packageJson.dependencies).toHaveProperty("tailwind-merge");
    expect(packageJson.dependencies).toHaveProperty("clsx");
    expect(packageJson.devDependencies).toHaveProperty("tailwindcss");
    expect(packageJson.devDependencies).toHaveProperty("@tailwindcss/vite");
    expect(tsconfig.compilerOptions?.baseUrl).toBe(".");
    expect(tsconfig.compilerOptions?.paths?.["@/*"]).toEqual(["./src/*"]);
    expect(components.aliases.components).toBe("@/components");
    expect(components.aliases.utils).toBe("@/lib/utils");
    expect(components.tailwind.css).toBe("src/styles.css");
    expect(components.style).toBe("new-york");
    expect(viteConfig).toContain("@tailwindcss/vite");
    expect(viteConfig).toContain("path.resolve(__dirname, \"./src\")");
    expect(styles).toContain("@import \"tailwindcss\"");
    expect(styles).toContain("--background:");
    expect(styles).toContain("--foreground:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/design-system-config.test.ts
```

Expected: FAIL because dependencies, `components.json`, alias, and Tailwind import are not configured yet.

- [ ] **Step 3: Install design-system dependencies**

Run:

```bash
npm install lucide-vue-next clsx tailwind-merge class-variance-authority
npm install -D tailwindcss @tailwindcss/vite
```

Expected: `package.json` and `package-lock.json` include the new dependencies.

- [ ] **Step 4: Add path alias and Tailwind plugin**

Replace `vite.config.ts` with:

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Update `tsconfig.json` by adding these keys inside `compilerOptions`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

- [ ] **Step 5: Add shadcn-vue config and utility helper**

Create `components.json`:

```json
{
  "$schema": "https://shadcn-vue.com/schema.json",
  "style": "new-york",
  "typescript": true,
  "tsConfigPath": "tsconfig.json",
  "tailwind": {
    "config": "",
    "css": "src/styles.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "composables": "@/composables",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib"
  },
  "iconLibrary": "lucide"
}
```

Create `src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Add Tailwind import and semantic tokens**

At the top of `src/styles.css`, add:

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted-surface);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input-token);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
}
```

Extend `:root` with:

```css
  --background: #ffffff;
  --foreground: #111827;
  --card: #ffffff;
  --card-foreground: #111827;
  --popover: #ffffff;
  --popover-foreground: #111827;
  --primary: #111827;
  --primary-foreground: #ffffff;
  --secondary: #f4f4f5;
  --secondary-foreground: #18181b;
  --muted-surface: #f4f4f5;
  --muted-foreground: #71717a;
  --accent: #f4f4f5;
  --accent-foreground: #18181b;
  --destructive: #b42318;
  --border: #e4e4e7;
  --input-token: #e4e4e7;
  --ring: #18181b;
  --radius: 8px;
```

Extend `html[data-theme="dark"]` with:

```css
  --background: #09090b;
  --foreground: #fafafa;
  --card: #111113;
  --card-foreground: #fafafa;
  --popover: #111113;
  --popover-foreground: #fafafa;
  --primary: #fafafa;
  --primary-foreground: #18181b;
  --secondary: #27272a;
  --secondary-foreground: #fafafa;
  --muted-surface: #27272a;
  --muted-foreground: #a1a1aa;
  --accent: #27272a;
  --accent-foreground: #fafafa;
  --destructive: #ff8b7f;
  --border: #27272a;
  --input-token: #3f3f46;
  --ring: #d4d4d8;
```

- [ ] **Step 7: Run test to verify it passes**

Run:

```bash
npm test -- src/__tests__/design-system-config.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json components.json src/lib/utils.ts src/styles.css src/__tests__/design-system-config.test.ts
git commit -m "feat: add shadcn vue design system foundation"
```

---

## Task 3: shadcn-vue Primitive Components

**Files:**
- Create: `src/components/ui/button/*`
- Create: `src/components/ui/badge/*`
- Create: `src/components/ui/tooltip/*`
- Create: `src/components/ui/separator/*`
- Create: `src/components/ui/tabs/*`
- Test: `src/__tests__/shadcn-components.test.ts`

- [ ] **Step 1: Write failing primitive import test**

Create `src/__tests__/shadcn-components.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";

describe("shadcn-vue primitives", () => {
  it("exports local source components used by the workbench shell", () => {
    const wrapper = mount({
      components: { Button, Badge, Separator },
      template: `
        <div>
          <Button variant="ghost" size="icon" aria-label="Icon action">A</Button>
          <Badge variant="secondary">已保存</Badge>
          <Separator />
        </div>
      `,
    });

    expect(wrapper.get("button").attributes("aria-label")).toBe("Icon action");
    expect(wrapper.text()).toContain("已保存");
    expect(wrapper.find('[data-slot="separator"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/shadcn-components.test.ts
```

Expected: FAIL because the local UI components do not exist.

- [ ] **Step 3: Install primitives through shadcn-vue CLI**

Run:

```bash
npx shadcn-vue@latest add button badge tooltip separator tabs
```

Expected: files are created under `src/components/ui/`. If the CLI asks to overwrite existing files, answer no unless the file is unchanged.

- [ ] **Step 4: Inspect generated files**

Run:

```bash
rg -n "from \"@/|from '@/|lucide" src/components/ui
```

Expected: imports use the configured `@/` alias and do not point to React packages.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- src/__tests__/shadcn-components.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/ui src/__tests__/shadcn-components.test.ts
git commit -m "feat: add shadcn vue primitives"
```

---

## Task 4: Workbench Shell Component

**Files:**
- Create: `src/components/WorkbenchShell.vue`
- Test: `src/__tests__/workbench-shell.test.ts`

- [ ] **Step 1: Write failing shell component test**

Create `src/__tests__/workbench-shell.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkbenchShell from "../components/WorkbenchShell.vue";

describe("WorkbenchShell", () => {
  it("renders rail, command bar, and four named work zones", () => {
    const wrapper = mount(WorkbenchShell, {
      props: {
        title: "今日工作台",
        saveStatusLabel: "已保存",
        theme: "light",
      },
      slots: {
        assets: "<div data-testid='assets-slot'>assets</div>",
        notes: "<div data-testid='notes-slot'>notes</div>",
        tasks: "<div data-testid='tasks-slot'>tasks</div>",
        workspace: "<div data-testid='workspace-slot'>workspace</div>",
        actions: "<button aria-label='设置'>settings</button>",
      },
    });

    expect(wrapper.get('[aria-label="应用导航"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="workbench-command-bar"]').text()).toContain("今日工作台");
    expect(wrapper.get('[data-testid="workbench-save-status"]').text()).toBe("已保存");
    expect(wrapper.get('[aria-label="素材"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="笔记与快捷动作"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="任务流"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="工作区与工具"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="assets-slot"]').text()).toBe("assets");
    expect(wrapper.get('[data-testid="notes-slot"]').text()).toBe("notes");
    expect(wrapper.get('[data-testid="tasks-slot"]').text()).toBe("tasks");
    expect(wrapper.get('[data-testid="workspace-slot"]').text()).toBe("workspace");
  });

  it("emits theme requests from the rail theme action", async () => {
    const wrapper = mount(WorkbenchShell, {
      props: {
        title: "今日工作台",
        saveStatusLabel: "已保存",
        theme: "dark",
      },
    });

    await wrapper.get('[data-testid="workbench-rail-theme"]').trigger("click");

    expect(wrapper.emitted("theme")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/workbench-shell.test.ts
```

Expected: FAIL because `WorkbenchShell.vue` does not exist.

- [ ] **Step 3: Create shell component**

Create `src/components/WorkbenchShell.vue`:

```vue
<script setup lang="ts">
import {
  BoxIcon,
  CheckSquareIcon,
  CircleHelpIcon,
  CommandIcon,
  MoonIcon,
  PanelLeftIcon,
  SettingsIcon,
  SparklesIcon,
  SunIcon,
  WrenchIcon,
} from "lucide-vue-next";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import type { ThemeMode } from "../types";

defineProps<{
  title: string;
  saveStatusLabel: string;
  theme: ThemeMode;
}>();

const emit = defineEmits<{
  theme: [];
}>();

const railItems = [
  { label: "工作台", icon: PanelLeftIcon, active: true },
  { label: "素材", icon: BoxIcon, active: false },
  { label: "任务", icon: CheckSquareIcon, active: false },
  { label: "工具", icon: WrenchIcon, active: false },
  { label: "帮助", icon: CircleHelpIcon, active: false },
];
</script>

<template>
  <main class="workbench-shell">
    <aside class="workbench-rail" aria-label="应用导航">
      <div class="workbench-mark" aria-hidden="true">T</div>
      <Button
        v-for="item in railItems"
        :key="item.label"
        :variant="item.active ? 'default' : 'ghost'"
        size="icon"
        class="workbench-rail-button"
        :aria-label="item.label"
        :aria-current="item.active ? 'page' : undefined"
      >
        <component :is="item.icon" data-icon="inline-start" />
      </Button>
      <div class="workbench-rail-spacer" />
      <Button
        variant="ghost"
        size="icon"
        class="workbench-rail-button"
        data-testid="workbench-rail-theme"
        :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
        @click="emit('theme')"
      >
        <SunIcon v-if="theme === 'dark'" data-icon="inline-start" />
        <MoonIcon v-else data-icon="inline-start" />
      </Button>
    </aside>

    <section class="workbench-main">
      <header class="workbench-command-bar" data-testid="workbench-command-bar">
        <div class="workbench-title-group">
          <SparklesIcon class="workbench-title-icon" aria-hidden="true" />
          <h1>{{ title }}</h1>
          <Badge variant="secondary" data-testid="workbench-save-status">{{ saveStatusLabel }}</Badge>
        </div>
        <div class="workbench-command-actions">
          <button class="workbench-command-button" type="button" aria-label="搜索或执行命令">
            <CommandIcon aria-hidden="true" />
            <span>搜索或执行命令</span>
            <kbd>⌘K</kbd>
          </button>
          <slot name="actions" />
          <Button variant="ghost" size="icon" aria-label="设置">
            <SettingsIcon data-icon="inline-start" />
          </Button>
        </div>
      </header>

      <div class="workbench-grid">
        <section class="workbench-zone workbench-zone-assets" aria-label="素材">
          <slot name="assets" />
        </section>
        <section class="workbench-zone workbench-zone-notes" aria-label="笔记与快捷动作">
          <slot name="notes" />
        </section>
        <section class="workbench-zone workbench-zone-tasks" aria-label="任务流">
          <slot name="tasks" />
        </section>
        <section class="workbench-zone workbench-zone-workspace" aria-label="工作区与工具">
          <slot name="workspace" />
        </section>
      </div>
    </section>
  </main>
</template>
```

- [ ] **Step 4: Add shell CSS**

Append to `src/styles.css`:

```css
.workbench-shell {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  width: 100vw;
  height: 100vh;
  background: var(--background);
  color: var(--foreground);
}

.workbench-rail {
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--card);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
}

.workbench-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 700;
}

.workbench-rail-spacer {
  flex: 1 1 auto;
}

.workbench-rail-button {
  width: 32px;
  height: 32px;
}

.workbench-main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr);
}

.workbench-command-bar {
  min-width: 0;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
}

.workbench-title-group,
.workbench-command-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.workbench-title-group h1 {
  font-size: 18px;
  font-weight: 650;
}

.workbench-title-icon {
  width: 16px;
  height: 16px;
}

.workbench-command-button {
  height: 32px;
  min-width: 220px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--muted-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
}

.workbench-command-button svg {
  width: 14px;
  height: 14px;
}

.workbench-command-button kbd {
  color: var(--foreground);
  font-size: 11px;
}

.workbench-grid {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(140px, 0.75fr) minmax(220px, 1.05fr) minmax(310px, 1.55fr) minmax(280px, 1.35fr);
  gap: 12px;
  padding: 12px;
}

.workbench-zone {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@media (max-width: 1180px) {
  .workbench-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- src/__tests__/workbench-shell.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/WorkbenchShell.vue src/styles.css src/__tests__/workbench-shell.test.ts
git commit -m "feat: add workbench shell"
```

---

## Task 5: Compose Existing App Into Workbench

**Files:**
- Modify: `src/App.vue`
- Modify: `src/__tests__/app-render.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Update failing app-render expectations first**

Modify the first test in `src/__tests__/app-render.test.ts` so the opening assertions include the new shell:

```ts
expect(wrapper.find('[aria-label="应用导航"]').exists()).toBe(true);
expect(wrapper.find('[data-testid="workbench-command-bar"]').text()).toContain("今日工作台");
expect(wrapper.find('[aria-label="素材"]').exists()).toBe(true);
expect(wrapper.find('[aria-label="笔记与快捷动作"]').exists()).toBe(true);
expect(wrapper.find('[aria-label="任务流"]').exists()).toBe(true);
expect(wrapper.find('[aria-label="工作区与工具"]').exists()).toBe(true);
expect(wrapper.find('[aria-label="Mini Desk"]').exists()).toBe(false);
expect(wrapper.text()).toContain("🎨 图床");
expect(wrapper.text()).toContain("🔧 工具");
expect(wrapper.text()).toContain("快捷动作");
expect(wrapper.text()).toContain("✅ 待办");
expect(wrapper.text()).toContain("工作空间");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts -t "renders the preserved board regions and primary controls"
```

Expected: FAIL because `App.vue` still renders `.board` without `WorkbenchShell`.

- [ ] **Step 3: Import and use WorkbenchShell**

In `src/App.vue`, add:

```ts
import WorkbenchShell from "./components/WorkbenchShell.vue";
```

Replace the desktop `<main v-if="!isMobileBlocked" class="board" ...>` block with:

```vue
<WorkbenchShell
  v-if="!isMobileBlocked"
  :title="state.language === 'en' ? 'Today Workbench' : '今日工作台'"
  :save-status-label="saveStatusLabel"
  :theme="state.theme"
  @theme="handleThemeClick"
  @dragover.prevent
  @drop.prevent="handleBoardDrop"
>
  <template #actions>
    <SettingsMenu
      :app-version="appVersion"
      :update-available="versionPromptVisible"
      :update-badge-visible="versionBadgeVisible"
      :companion-gif-theme="state.companionGifTheme"
      :language="state.language"
      @export="exportData"
      @import="requestImport"
      @about="about"
      @suggest="suggestIssue"
      @shortcut-help="shortcutHelpVisible = true"
      @update="updateStaticVersion"
      @language="updateLanguage"
      @gif-theme="updateCompanionGifTheme"
      @custom-gif="updateCustomCompanionGif"
      @guide="handleGuideClick"
    />
  </template>

  <template #assets>
    <ImagePanel
      :title="titles['image-title']"
      :images="state.images"
      :active-preview-id="activePreviewId"
      :language="state.language"
      @title-update="updateTitle"
      @preview="openImagePreview"
      @close-preview="activePreviewId = undefined"
      @copy="copyImage"
      @delete="deleteImage"
      @reorder="reorderImages"
      @paste="pasteImageFromClipboard"
      @drop-files="addImageFiles"
      @guide="handleGuideClick"
    />
  </template>

  <template #notes>
    <ToolPanel
      split
      class="note-panel"
      title-id="note-title"
      :title="titles['note-title']"
      :language="state.language"
      :theme="state.theme"
      @title-update="updateTitle"
      @message="showToolBubble"
      @dismiss-message="dismissToolBubble"
      @focus="handleGuideFocus('tools', $event)"
      @blur="handleCompanionBlur"
    />
    <QuickButtons
      :title="titles['quick-title']"
      :buttons="state.quickButtons"
      :show-hidden="state.showHiddenQuickButtons"
      :language="state.language"
      @title-update="updateTitle"
      @save="saveQuick"
      @delete="deleteQuick"
      @copy="handleQuickButton"
      @toggle-hidden="toggleQuickHidden"
      @toggle-show-hidden="state.showHiddenQuickButtons = !state.showHiddenQuickButtons; persistNow()"
      @reorder="reorderQuickButtons"
      @guide="handleGuideClick"
    />
  </template>

  <template #tasks>
    <TodoPanel
      :todo-lists="displayTodoLists"
      :edit-list-id="pendingEditTodoListId"
      :todos="state.todos"
      :titles="titles"
      :show-completed="state.showCompletedTodos"
      :language="state.language"
      @title-update="updateTitle"
      @create-list="createTodoList"
      @update-list-title="updateTodoListTitle"
      @toggle-list-collapsed="toggleTodoListCollapsed"
      @toggle-list-compact="toggleTodoListCompact"
      @delete-list="deleteTodoList"
      @reorder-lists="reorderTodoListSections"
      @create="createTodo"
      @create-from-text="createTodosFromText"
      @update="updateTodo"
      @split="splitTodo"
      @complete="complete"
      @star="toggleTodoStar"
      @notify="updateTodoNotify"
      @remove="removeTodo"
      @clear-completed="clearDone"
      @toggle-completed-visibility="toggleCompletedVisibility"
      @blur-empty="blurEmptyTodo"
      @blur="handleCompanionBlur"
      @move="moveTodo"
      @focus="handleGuideFocus('todos', $event)"
      @guide="handleGuideClick"
    />
  </template>

  <template #workspace>
    <SpacePanel
      class="workspace-panel"
      :spaces="displaySpaces"
      :active-space-id="state.activeSpaceId"
      :edit-space-id="pendingEditSpaceId"
      :language="state.language"
      @activate="activateSpace"
      @create="createSpace"
      @rename="renameSpace"
      @edit-done="finishSpaceEdit"
      @update="updateSpaceLines"
      @delete="deleteSpace"
      @reorder="reorderSpaces"
      @focus="(_, element) => handleGuideFocus('workspace', element)"
      @guide="(_, anchor, immediate) => handleGuideClick('workspace', anchor, immediate)"
      @blur="handleEditorBlur"
    />
  </template>
</WorkbenchShell>
```

Remove the old desktop `.top-actions` block because `SettingsMenu` now lives in the command bar and theme toggling lives in the rail.

- [ ] **Step 4: Adjust zone child panel borders**

Append to `src/styles.css`:

```css
.workbench-zone > .panel,
.workbench-zone > .space-panel,
.workbench-zone > .todo-panel,
.workbench-zone > .text-panel,
.workbench-zone > .tool-panel {
  flex: 1 1 auto;
  min-height: 0;
  border-right: 0;
  border-radius: 0;
}

.workbench-zone-notes {
  gap: 0;
}

.workbench-zone-notes > .note-panel,
.workbench-zone-notes > .quick-block {
  flex: 1 1 0;
  min-height: 0;
}
```

- [ ] **Step 5: Run focused test**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts -t "renders the preserved board regions and primary controls"
```

Expected: PASS.

- [ ] **Step 6: Run app render suite**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/App.vue src/styles.css src/__tests__/app-render.test.ts
git commit -m "feat: compose board in shadcn workbench shell"
```

---

## Task 6: Visual Compatibility Layer For Existing Panels

**Files:**
- Modify: `src/styles.css`
- Test: `src/__tests__/style-contract.test.ts`

- [ ] **Step 1: Write failing style contract test**

Create `src/__tests__/style-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workbench style contract", () => {
  it("normalizes retained Naive UI and panel internals through shared tokens", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

    expect(styles).toContain(".n-dropdown-menu");
    expect(styles).toContain("--n-border-radius: var(--radius)");
    expect(styles).toContain(".panel-header");
    expect(styles).toContain("border-bottom: 1px solid var(--border)");
    expect(styles).toContain(".todo-row");
    expect(styles).toContain("border-color: var(--border)");
    expect(styles).toContain(".quick-button");
    expect(styles).toContain("border-radius: var(--radius)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/style-contract.test.ts
```

Expected: FAIL until style selectors are normalized.

- [ ] **Step 3: Update Naive and panel token styles**

In `src/styles.css`, update the existing `.n-button`, `.n-input`, `.n-card`, `.n-dialog`, `.n-popover`, `.n-dropdown-menu`, `.n-dropdown-option`, `.n-base-selection`, and `.n-checkbox-box` block so it uses:

```css
.n-button,
.n-input,
.n-card,
.n-dialog,
.n-popover,
.n-dropdown-menu,
.n-dropdown-option,
.n-base-selection,
.n-checkbox-box {
  --n-border-radius: var(--radius) !important;
  --n-font-size: var(--app-font-size) !important;
  border-radius: var(--radius) !important;
}

.n-dropdown-menu,
.n-popover,
.n-dialog {
  border: 1px solid var(--border) !important;
  background: var(--popover) !important;
  color: var(--popover-foreground) !important;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.12) !important;
}
```

Update panel headers:

```css
.panel-header,
.todo-heading {
  min-height: 36px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}
```

Update row-like controls:

```css
.quick-button,
.todo-row,
.tool-row,
.space-tab,
.image-card {
  border-color: var(--border);
  border-radius: var(--radius);
}
```

- [ ] **Step 4: Run style contract test**

Run:

```bash
npm test -- src/__tests__/style-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run representative UI suites**

Run:

```bash
npm test -- src/__tests__/app-render.test.ts src/__tests__/todo-panel.test.ts src/__tests__/settings-menu.test.ts src/__tests__/quick-buttons.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/styles.css src/__tests__/style-contract.test.ts
git commit -m "style: align retained panels with shadcn tokens"
```

---

## Task 7: Browser Visual Verification And Polish

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/WorkbenchShell.vue`
- Modify: component styles only if screenshots show clipping or overlap

- [ ] **Step 1: Run full verification before browser**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`. Keep this session running until browser QA is complete.

- [ ] **Step 3: Open desktop viewport in Browser**

Use Browser/IAB to open:

```text
http://127.0.0.1:5173/
```

Expected visible result: left rail, top command bar, four work zones, no old floating `.top-actions`, no horizontal overflow, and no clipped primary controls.

- [ ] **Step 4: Verify medium viewport**

Set viewport near the pre-mobile threshold:

```text
1000x760
```

Expected: workbench grid collapses to two columns or remains coherent; text does not overlap; the todo region remains usable.

- [ ] **Step 5: Verify mobile-blocked state**

Set viewport:

```text
390x844
```

Expected: existing mobile handoff view appears; no desktop rail or command bar overlaps it.

- [ ] **Step 6: Verify dark theme**

Click the rail theme button.

Expected: `html[data-theme="dark"]` is applied; rail, command bar, panels, Naive popovers, and modal surfaces use dark tokens.

- [ ] **Step 7: Repair visible issues one at a time**

For each issue, write down the exact selector and patch only the smallest related style. Examples:

```css
.workbench-command-actions {
  min-width: 0;
  flex-wrap: nowrap;
}

.workbench-zone-tasks {
  min-width: 300px;
}
```

After each patch, reload the browser and rerun:

```bash
npm test -- src/__tests__/app-render.test.ts src/__tests__/workbench-shell.test.ts
npm run build
```

Expected: PASS after every patch.

- [ ] **Step 8: Capture final screenshots**

Capture desktop, medium, and mobile screenshots through Browser/IAB. Record their paths or embedded image references in the final handoff.

- [ ] **Step 9: Commit visual polish**

Run:

```bash
git status --short
git add src/styles.css src/components/WorkbenchShell.vue src/App.vue
git commit -m "style: polish shadcn workbench layout"
```

If no files changed during browser QA, skip the commit and record that no polish patch was needed.

---

## Task 8: Final Regression And Handoff

**Files:**
- Read: all changed files

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Inspect changed file list**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: working tree clean except intentional uncommitted screenshot artifacts if any. If screenshot artifacts exist under ignored paths, do not commit them.

- [ ] **Step 4: Summarize implementation**

Final response must include:

```text
Implemented: Tailwind/shadcn-vue foundation, local UI primitives, WorkbenchShell, App.vue composition, Naive compatibility styling.
Verified: npm test, npm run build, Browser/IAB desktop, medium, mobile-blocked, and dark theme checks.
Remaining intentional deviation: complex Naive UI controls are retained for this phase and visually normalized.
```

---

## Self-Review Notes

- Spec coverage: Tailwind/shadcn foundation is covered by Tasks 2 and 3; shell layout by Tasks 4 and 5; retained Naive compatibility by Task 6; browser verification by Task 7; final regression by Task 8.
- No React rewrite appears in the plan.
- Naive UI full removal is deliberately out of scope for this phase.
- Tests are written before implementation for each production change task.

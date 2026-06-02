<script setup lang="ts">
import {
  BoxIcon,
  CheckSquareIcon,
  CircleHelpIcon,
  CommandIcon,
  MoonIcon,
  PanelLeftIcon,
  SparklesIcon,
  SunIcon,
  WrenchIcon,
} from "lucide-vue-next";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import type { ThemeMode } from "../types";

defineProps<{
  title: string;
  saveStatusLabel: string;
  theme: ThemeMode;
}>();

const emit = defineEmits<{
  theme: [];
}>();

defineSlots<{
  actions?: () => unknown;
  assets?: () => unknown;
  notes?: () => unknown;
  tasks?: () => unknown;
  workspace?: () => unknown;
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
      <span
        v-for="item in railItems"
        :key="item.label"
        class="workbench-rail-button"
        role="img"
        :aria-label="item.label"
        :data-active="item.active ? 'true' : undefined"
      >
        <component :is="item.icon" data-icon="inline-start" />
      </span>
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

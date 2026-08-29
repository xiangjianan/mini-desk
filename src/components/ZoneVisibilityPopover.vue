<script setup lang="ts">
import { computed } from "vue";
import { NIcon, NPopover } from "naive-ui";
import { CheckmarkOutline, GridOutline } from "@vicons/ionicons5";
import { getUiText } from "../state/i18n";
import { CONTEXT_MENU_Z_INDEX } from "../utils/contextMenu";
import type { AppLanguage, ZoneKey, ZoneVisibility } from "../types";

const props = withDefaults(defineProps<{
  visibility: ZoneVisibility;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  toggle: [zone: ZoneKey];
}>();

const text = computed(() => getUiText(props.language));

// Canonical left-to-right zone order, matching the workbench grid.
const zones = computed(() => [
  { key: "assets" as const, label: text.value.zoneVisibility.assets, checked: props.visibility.assets },
  { key: "notes" as const, label: text.value.zoneVisibility.notes, checked: props.visibility.notes },
  { key: "tasks" as const, label: text.value.zoneVisibility.tasks, checked: props.visibility.tasks },
  { key: "workspace" as const, label: text.value.zoneVisibility.workspace, checked: props.visibility.workspace },
]);

function toggle(zone: ZoneKey): void {
  emit("toggle", zone);
}
</script>

<template>
  <NPopover trigger="click" placement="right-start" :z-index="CONTEXT_MENU_Z_INDEX">
    <template #trigger>
      <button
        type="button"
        class="workspace-switcher-action zone-visibility-trigger"
        data-testid="zone-visibility-trigger"
        :aria-label="text.zoneVisibility.title"
        @click.stop
      >
        <NIcon :component="GridOutline" size="12" />
      </button>
    </template>
    <div class="zone-visibility-popover" role="group" :aria-label="text.zoneVisibility.title">
      <p class="zone-visibility-title">{{ text.zoneVisibility.title }}</p>
      <ul class="zone-visibility-list">
        <li v-for="zone in zones" :key="zone.key">
          <button
            type="button"
            class="zone-visibility-option"
            :class="{ 'is-checked': zone.checked }"
            :data-testid="`zone-option-${zone.key}`"
            :aria-pressed="zone.checked"
            @click="toggle(zone.key)"
          >
            <span class="zone-visibility-check">
              <NIcon v-if="zone.checked" :component="CheckmarkOutline" size="14" />
            </span>
            <span class="zone-visibility-label">{{ zone.label }}</span>
          </button>
        </li>
      </ul>
    </div>
  </NPopover>
</template>

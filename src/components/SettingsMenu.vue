<script setup lang="ts">
import { computed, h, ref } from "vue";
import {
  CloudDownloadOutline,
  CloudUploadOutline,
  CreateOutline,
  InformationCircleOutline,
  SettingsOutline,
} from "@vicons/ionicons5";
import { NBadge, NButton, NDropdown, NIcon } from "naive-ui";
import type { Component } from "vue";
import type { GuideKey } from "../types";

const props = defineProps<{
  appVersion: string;
  updateAvailable: boolean;
}>();

const emit = defineEmits<{
  export: [anchor?: HTMLElement];
  import: [anchor?: HTMLElement];
  about: [anchor?: HTMLElement];
  suggest: [anchor?: HTMLElement];
  update: [];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();

const menuOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const options = computed(() => [
  { label: "数据导出", key: "export", icon: renderIcon(CloudDownloadOutline) },
  { label: "数据导入", key: "import", icon: renderIcon(CloudUploadOutline) },
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

function handleSelect(key: string): void {
  if (key === "export") emit("export", triggerRef.value ?? undefined);
  if (key === "import") emit("import", triggerRef.value ?? undefined);
  if (key === "suggest") emit("suggest", triggerRef.value ?? undefined);
  if (key === "about") emit("about", triggerRef.value ?? undefined);
  if (key === "version" && props.updateAvailable) emit("update");
}

function renderIcon(component: Component) {
  return () => h(NIcon, { component });
}
</script>

<template>
  <NDropdown
    trigger="click"
    placement="bottom-end"
    :options="options"
    @select="handleSelect"
    @update:show="menuOpen = $event"
  >
    <span ref="triggerRef" class="settings-trigger">
      <NBadge :show="updateAvailable && !menuOpen" dot>
        <NButton
          class="settings-btn icon-button"
          quaternary
          size="small"
          aria-label="设置"
          :data-update-available="updateAvailable && !menuOpen ? 'true' : undefined"
          @click="emit('guide', 'settings', $event.currentTarget as HTMLElement)"
        >
          <NIcon :component="SettingsOutline" />
        </NButton>
      </NBadge>
    </span>
  </NDropdown>
</template>

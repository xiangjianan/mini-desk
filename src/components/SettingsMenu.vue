<script setup lang="ts">
import { computed, h, ref } from "vue";
import {
  CheckmarkOutline,
  CloudDownloadOutline,
  CloudUploadOutline,
  CreateOutline,
  ImagesOutline,
  InformationCircleOutline,
  SettingsOutline,
} from "@vicons/ionicons5";
import { NBadge, NButton, NDropdown, NIcon } from "naive-ui";
import type { Component } from "vue";
import { COMPANION_GIF_THEME_OPTIONS } from "../state/companionGifThemes";
import type { CompanionGifTheme, GuideKey } from "../types";

const props = defineProps<{
  appVersion: string;
  updateAvailable: boolean;
  companionGifTheme: CompanionGifTheme;
}>();

const emit = defineEmits<{
  export: [anchor?: HTMLElement];
  import: [anchor?: HTMLElement];
  about: [anchor?: HTMLElement];
  suggest: [anchor?: HTMLElement];
  update: [];
  gifTheme: [theme: CompanionGifTheme, anchor?: HTMLElement];
  customGif: [files: { light?: File; dark?: File }, anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();

const menuOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const customGifDialogOpen = ref(false);
const customGifLightFile = ref<File | undefined>();
const customGifDarkFile = ref<File | undefined>();
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

function handleSelect(key: string): void {
  if (key === "export") emit("export", triggerRef.value ?? undefined);
  if (key === "import") emit("import", triggerRef.value ?? undefined);
  if (key === "suggest") emit("suggest", triggerRef.value ?? undefined);
  if (key === "about") emit("about", triggerRef.value ?? undefined);
  if (key === "version" && props.updateAvailable) emit("update");
  if (key === "gif-theme:custom") {
    customGifDialogOpen.value = true;
    return;
  }
  if (key.startsWith("gif-theme:")) {
    const theme = key.replace("gif-theme:", "") as CompanionGifTheme;
    emit("gifTheme", theme, triggerRef.value ?? undefined);
  }
}

function handleCustomGifFileChange(event: Event, mode: "light" | "dark"): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (mode === "light") customGifLightFile.value = file;
  else customGifDarkFile.value = file;
}

function confirmCustomGif(): void {
  if (!customGifLightFile.value && !customGifDarkFile.value) return;
  emit(
    "customGif",
    {
      light: customGifLightFile.value,
      dark: customGifDarkFile.value,
    },
    triggerRef.value ?? undefined,
  );
  customGifDialogOpen.value = false;
  customGifLightFile.value = undefined;
  customGifDarkFile.value = undefined;
}

function closeCustomGifDialog(): void {
  customGifDialogOpen.value = false;
  customGifLightFile.value = undefined;
  customGifDarkFile.value = undefined;
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
  <section v-if="customGifDialogOpen" class="gif-theme-custom-dialog" aria-label="自定义 GIF">
    <label>
      <span>浅色 GIF</span>
      <input class="gif-theme-light-input" type="file" accept="image/gif,.gif" @change="handleCustomGifFileChange($event, 'light')" />
    </label>
    <label>
      <span>深色 GIF</span>
      <input class="gif-theme-dark-input" type="file" accept="image/gif,.gif" @change="handleCustomGifFileChange($event, 'dark')" />
    </label>
    <div class="gif-theme-custom-actions">
      <button class="gif-theme-custom-cancel" type="button" @click="closeCustomGifDialog">取消</button>
      <button class="gif-theme-custom-confirm" type="button" @click="confirmCustomGif">确定</button>
    </div>
  </section>
</template>

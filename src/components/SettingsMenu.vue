<script setup lang="ts">
import { computed, h, ref } from "vue";
import {
  CheckmarkOutline,
  CloudDownloadOutline,
  CloudUploadOutline,
  CreateOutline,
  ImagesOutline,
  InformationCircleOutline,
  KeyOutline,
  SettingsOutline,
} from "@vicons/ionicons5";
import { NBadge, NButton, NDropdown, NIcon, NUpload } from "naive-ui";
import type { Component } from "vue";
import type { UploadFileInfo } from "naive-ui";
import { COMPANION_GIF_THEME_OPTIONS } from "../state/companionGifThemes";
import { getUiText, normalizeLanguage } from "../state/i18n";
import type { AppLanguage, CompanionGifTheme, GuideKey } from "../types";

const props = withDefaults(defineProps<{
  appVersion: string;
  updateAvailable: boolean;
  updateBadgeVisible?: boolean;
  companionGifTheme: CompanionGifTheme;
  language?: AppLanguage;
}>(), {
  language: "zh",
  updateBadgeVisible: false,
});

const emit = defineEmits<{
  export: [anchor?: HTMLElement];
  import: [anchor?: HTMLElement];
  about: [anchor?: HTMLElement];
  suggest: [anchor?: HTMLElement];
  shortcutHelp: [];
  update: [];
  language: [language: AppLanguage, anchor?: HTMLElement];
  gifTheme: [theme: CompanionGifTheme, anchor?: HTMLElement];
  customGif: [files: { light?: File; dark?: File }, anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();

const menuOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const customGifDialogOpen = ref(false);
const customGifLightFile = ref<File | undefined>();
const customGifDarkFile = ref<File | undefined>();
const text = computed(() => getUiText(props.language));
const options = computed(() => [
  { label: text.value.settings.export, key: "export", icon: renderIcon(CloudDownloadOutline) },
  { label: text.value.settings.import, key: "import", icon: renderIcon(CloudUploadOutline) },
  {
    label: text.value.settings.language,
    key: "language",
    icon: renderIcon(CheckmarkOutline),
    children: [
      {
        label: text.value.settings.chinese,
        key: "language:zh",
        icon: normalizeLanguage(props.language) === "zh" ? renderIcon(CheckmarkOutline) : undefined,
      },
      {
        label: text.value.settings.english,
        key: "language:en",
        icon: normalizeLanguage(props.language) === "en" ? renderIcon(CheckmarkOutline) : undefined,
      },
    ],
  },
  {
    label: text.value.settings.gifTheme,
    key: "gif-theme",
    icon: renderIcon(ImagesOutline),
    children: COMPANION_GIF_THEME_OPTIONS.map((option) => ({
      label: getCompanionGifThemeLabel(option.value),
      key: `gif-theme:${option.value}`,
      icon: option.value === props.companionGifTheme ? renderIcon(CheckmarkOutline) : undefined,
    })),
  },
  { label: text.value.settings.suggest, key: "suggest", icon: renderIcon(CreateOutline) },
  { label: text.value.settings.shortcutHelp, key: "shortcut-help", icon: renderIcon(KeyOutline) },
  { label: text.value.settings.about, key: "about", icon: renderIcon(InformationCircleOutline) },
  { type: "divider", key: "version-divider" },
  {
    label: () =>
      h("span", { class: "settings-version-item", "data-testid": "settings-version" }, [
        h("span", `v${props.appVersion}`),
        props.updateAvailable ? h("span", { class: "settings-version-dot", "aria-hidden": "true" }) : null,
        props.updateAvailable ? h("span", { class: "settings-version-action" }, text.value.settings.update) : null,
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
  if (key === "shortcut-help") {
    emit("shortcutHelp");
    return;
  }
  if (key === "version" && props.updateAvailable) emit("update");
  if (key.startsWith("language:")) {
    emit("language", normalizeLanguage(key.replace("language:", "")), triggerRef.value ?? undefined);
    return;
  }
  if (key === "gif-theme:custom") {
    customGifDialogOpen.value = true;
    return;
  }
  if (key.startsWith("gif-theme:")) {
    const theme = key.replace("gif-theme:", "") as CompanionGifTheme;
    emit("gifTheme", theme, triggerRef.value ?? undefined);
  }
}

function handleCustomGifUpload(fileList: UploadFileInfo[], mode: "light" | "dark"): void {
  const file = fileList[0]?.file ?? undefined;
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

function getCompanionGifThemeLabel(theme: CompanionGifTheme): string {
  if (normalizeLanguage(props.language) === "zh") {
    return COMPANION_GIF_THEME_OPTIONS.find((option) => option.value === theme)?.label ?? theme;
  }
  if (theme === "custom") return "Custom";
  if (theme === "none") return "Hidden";
  return theme;
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
      <NBadge :show="updateBadgeVisible && !menuOpen" dot>
        <NButton
          class="settings-btn icon-button"
          quaternary
          size="small"
          :aria-label="text.settings.button"
          :data-update-available="updateBadgeVisible && !menuOpen ? 'true' : undefined"
          @click="emit('guide', 'settings', $event.currentTarget as HTMLElement)"
        >
          <NIcon :component="SettingsOutline" />
        </NButton>
      </NBadge>
    </span>
  </NDropdown>
  <section v-if="customGifDialogOpen" class="gif-theme-custom-dialog" :aria-label="text.settings.customGif">
    <label>
      <span>{{ text.settings.lightGif }}</span>
      <NUpload
        accept="image/gif,.gif"
        :max="1"
        :default-upload="false"
        @update:file-list="(files) => handleCustomGifUpload(files, 'light')"
      >
        <NButton size="small" class="gif-theme-upload-button">{{ text.settings.chooseLightGif }}</NButton>
      </NUpload>
    </label>
    <label>
      <span>{{ text.settings.darkGif }}</span>
      <NUpload
        accept="image/gif,.gif"
        :max="1"
        :default-upload="false"
        @update:file-list="(files) => handleCustomGifUpload(files, 'dark')"
      >
        <NButton size="small" class="gif-theme-upload-button">{{ text.settings.chooseDarkGif }}</NButton>
      </NUpload>
    </label>
    <div class="gif-theme-custom-actions">
      <button class="gif-theme-custom-cancel" type="button" @click="closeCustomGifDialog">{{ text.common.cancel }}</button>
      <button class="gif-theme-custom-confirm" type="button" @click="confirmCustomGif">{{ text.common.confirm }}</button>
    </div>
  </section>
</template>

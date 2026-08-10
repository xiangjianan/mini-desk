<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref } from "vue";
import {
  AddOutline,
  CheckmarkOutline,
  CloudDownloadOutline,
  CloudUploadOutline,
  CreateOutline,
  GlobeOutline,
  GridOutline,
  HeartOutline,
  ImagesOutline,
  InformationCircleOutline,
  KeyOutline,
  ServerOutline,
  SettingsOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { NBadge, NButton, NDropdown, NIcon, NUpload } from "naive-ui";
import type { Component } from "vue";
import type { UploadFileInfo } from "naive-ui";
import { COMPANION_GIF_THEME_OPTIONS } from "../state/companionGifThemes";
import { getUiText, normalizeLanguage } from "../state/i18n";
import type { AppLanguage, CompanionCustomGif, CompanionGifTheme, GuideKey, ZoneKey, ZoneVisibility } from "../types";
import { CONTEXT_MENU_Z_INDEX } from "../utils/contextMenu";

const props = withDefaults(defineProps<{
  appVersion: string;
  updateAvailable: boolean;
  companionGifTheme: CompanionGifTheme;
  customCompanionGif?: CompanionCustomGif;
  hasCustomCompanionGif?: boolean;
  language?: AppLanguage;
  zoneVisibility?: ZoneVisibility;
}>(), {
  language: "zh",
  customCompanionGif: () => ({}),
  hasCustomCompanionGif: false,
  zoneVisibility: () => ({ assets: true, notes: true, tasks: true, workspace: true }),
});

const emit = defineEmits<{
  createWorkspace: [];
  exportWorkspace: [anchor?: HTMLElement];
  import: [anchor?: HTMLElement];
  clearData: [anchor?: HTMLElement];
  about: [anchor?: HTMLElement];
  suggest: [anchor?: HTMLElement];
  support: [anchor?: HTMLElement];
  shortcutHelp: [];
  update: [];
  language: [language: AppLanguage, anchor?: HTMLElement];
  gifTheme: [theme: CompanionGifTheme, anchor?: HTMLElement];
  customGif: [files: { light?: File; dark?: File }, anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement];
  updateZoneVisibility: [visibility: ZoneVisibility];
}>();

// Temporarily disabled — the QR-code "支持作者" flow is hidden until re-enabled.
const SUPPORT_AUTHOR_ENABLED = false;

const menuOpen = ref(false);
// Toggling a zone checkbox should NOT close the dropdown (unlike theme/language).
// Set before emit; the imminent close is vetoed in handleDropdownShow.
let suppressZoneClose = false;
const triggerRef = ref<HTMLElement | null>(null);
const customGifDialogOpen = ref(false);
const customGifLightFile = ref<File | undefined>();
const customGifDarkFile = ref<File | undefined>();
const customGifLightPreviewSrc = ref<string | undefined>();
const customGifDarkPreviewSrc = ref<string | undefined>();
const text = computed(() => getUiText(props.language));
const customGifLightPreview = computed(() => customGifLightPreviewSrc.value ?? props.customCompanionGif.light);
const customGifDarkPreview = computed(() => customGifDarkPreviewSrc.value ?? props.customCompanionGif.dark);
const zoneChildren = computed(() => [
  { key: "zone:assets" as const, label: text.value.zoneVisibility.assets, checked: props.zoneVisibility.assets },
  { key: "zone:notes" as const, label: text.value.zoneVisibility.notes, checked: props.zoneVisibility.notes },
  { key: "zone:tasks" as const, label: text.value.zoneVisibility.tasks, checked: props.zoneVisibility.tasks },
  { key: "zone:workspace" as const, label: text.value.zoneVisibility.workspace, checked: props.zoneVisibility.workspace },
]);
const options = computed(() => [
  {
    label: text.value.settings.configure,
    key: "configure",
    icon: renderIcon(GridOutline),
    children: zoneChildren.value.map((zone) => ({
      label: zone.label,
      key: zone.key,
      icon: renderZoneCheckIcon(zone.checked),
    })),
  },
  {
    label: text.value.settings.data,
    key: "data",
    icon: renderIcon(ServerOutline),
    children: [
      { label: text.value.settings.createWorkspace, key: "create-workspace", icon: renderIcon(AddOutline) },
      { label: text.value.settings.import, key: "import", icon: renderIcon(CloudUploadOutline) },
      { label: text.value.settings.exportCurrentWorkspace, key: "export-workspace", icon: renderIcon(CloudDownloadOutline) },
      { label: text.value.settings.clearData, key: "clear-data", icon: renderIcon(TrashOutline, true) },
    ],
  },
  {
    label: text.value.settings.language,
    key: "language",
    icon: renderIcon(GlobeOutline),
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
  ...(SUPPORT_AUTHOR_ENABLED
    ? [{ label: text.value.settings.support, key: "support", icon: renderIcon(HeartOutline) }]
    : []),
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
  if (key.startsWith("zone:")) {
    const zone = key.replace("zone:", "") as ZoneKey;
    // Keep the menu open so the user can toggle multiple zones in one go. The
    // close NDropdown emits right after select is vetoed in handleDropdownShow.
    suppressZoneClose = true;
    emit("updateZoneVisibility", { ...props.zoneVisibility, [zone]: !props.zoneVisibility[zone] });
    return;
  }
  if (key === "create-workspace") emit("createWorkspace");
  if (key === "export-workspace") emit("exportWorkspace", triggerRef.value ?? undefined);
  if (key === "import") emit("import", triggerRef.value ?? undefined);
  if (key === "clear-data") emit("clearData", triggerRef.value ?? undefined);
  if (key === "suggest") emit("suggest", triggerRef.value ?? undefined);
  if (key === "support") emit("support", triggerRef.value ?? undefined);
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
    if (props.hasCustomCompanionGif) {
      emit("gifTheme", "custom", triggerRef.value ?? undefined);
      customGifDialogOpen.value = true;
      return;
    }
    customGifDialogOpen.value = true;
    return;
  }
  if (key.startsWith("gif-theme:")) {
    const theme = key.replace("gif-theme:", "") as CompanionGifTheme;
    emit("gifTheme", theme, triggerRef.value ?? undefined);
  }
}

function handleDropdownShow(value: boolean): void {
  // Veto the close that follows a zone checkbox toggle so the menu stays open.
  if (!value && suppressZoneClose) {
    suppressZoneClose = false;
    return;
  }
  suppressZoneClose = false;
  menuOpen.value = value;
}

function handleCustomGifUpload(fileList: UploadFileInfo[], mode: "light" | "dark"): void {
  const file = fileList[0]?.file ?? undefined;
  if (mode === "light") {
    customGifLightFile.value = file;
    setCustomGifPreview("light", file);
    return;
  }
  customGifDarkFile.value = file;
  setCustomGifPreview("dark", file);
}

function confirmCustomGif(): void {
  if (!customGifLightFile.value && !customGifDarkFile.value) {
    if (props.hasCustomCompanionGif) {
      emit("gifTheme", "custom", triggerRef.value ?? undefined);
      customGifDialogOpen.value = false;
    }
    return;
  }
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
  clearCustomGifPreviews();
}

function closeCustomGifDialog(): void {
  customGifDialogOpen.value = false;
  customGifLightFile.value = undefined;
  customGifDarkFile.value = undefined;
  clearCustomGifPreviews();
}

function setCustomGifPreview(mode: "light" | "dark", file?: File): void {
  revokeCustomGifPreview(mode);
  const preview = file && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined;
  if (mode === "light") customGifLightPreviewSrc.value = preview;
  else customGifDarkPreviewSrc.value = preview;
}

function revokeCustomGifPreview(mode: "light" | "dark"): void {
  const preview = mode === "light" ? customGifLightPreviewSrc.value : customGifDarkPreviewSrc.value;
  if (preview && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(preview);
  if (mode === "light") customGifLightPreviewSrc.value = undefined;
  else customGifDarkPreviewSrc.value = undefined;
}

function clearCustomGifPreviews(): void {
  revokeCustomGifPreview("light");
  revokeCustomGifPreview("dark");
}

onBeforeUnmount(clearCustomGifPreviews);

function getCompanionGifThemeLabel(theme: CompanionGifTheme): string {
  if (normalizeLanguage(props.language) === "zh") {
    return COMPANION_GIF_THEME_OPTIONS.find((option) => option.value === theme)?.label ?? theme;
  }
  if (theme === "custom") return "Custom";
  if (theme === "none") return "Hidden";
  return theme;
}

function renderIcon(component: Component, danger = false) {
  return () => h(NIcon, { component, ...(danger ? { color: "var(--danger)" } : {}) });
}

// Always occupy the icon slot (transparent when unchecked) so the label column
// stays aligned whether or not any zone is checked — the text never jumps left.
function renderZoneCheckIcon(checked: boolean) {
  return () => h(NIcon, { component: CheckmarkOutline, ...(checked ? {} : { color: "transparent" }) });
}
</script>

<template>
  <NDropdown
    trigger="click"
    placement="bottom-end"
    :show="menuOpen"
    :z-index="CONTEXT_MENU_Z_INDEX"
    :options="options"
    @select="handleSelect"
    @update:show="handleDropdownShow"
  >
    <span ref="triggerRef" class="settings-trigger">
      <NBadge :show="updateAvailable && !menuOpen" dot>
        <NButton
          class="settings-btn icon-button"
          quaternary
          size="small"
          :aria-label="text.settings.button"
          :data-update-available="updateAvailable && !menuOpen ? 'true' : undefined"
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
      <span v-if="customGifLightPreview" class="gif-theme-custom-preview">
        <img :src="customGifLightPreview" alt="" />
      </span>
      <NUpload
        accept="image/gif,.gif"
        :max="1"
        :default-upload="false"
        :show-file-list="false"
        @update:file-list="(files) => handleCustomGifUpload(files, 'light')"
      >
        <NButton size="small" class="gif-theme-upload-button">{{ text.settings.chooseLightGif }}</NButton>
      </NUpload>
    </label>
    <label>
      <span>{{ text.settings.darkGif }}</span>
      <span v-if="customGifDarkPreview" class="gif-theme-custom-preview">
        <img :src="customGifDarkPreview" alt="" />
      </span>
      <NUpload
        accept="image/gif,.gif"
        :max="1"
        :default-upload="false"
        :show-file-list="false"
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

<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref } from "vue";
import {
  Plus as AddOutline,
  Check as CheckmarkOutline,
  CloudDownload as CloudDownloadOutline,
  CloudUpload as CloudUploadOutline,
  Mail as MailOutline,
  Globe as GlobeOutline,
  Heart as HeartOutline,
  Images as ImagesOutline,
  Info as InformationCircleOutline,
  KeyRound as KeyOutline,
  Database as ServerOutline,
  Settings as SettingsOutline,
  Sun,
  Moon,
  LayoutGrid as GridOutline,
  Trash2 as TrashOutline,
} from "lucide-vue-next";
import { NBadge, NButton, NDropdown, NIcon, NModal, NUpload } from "naive-ui";
import type { Component } from "vue";
import type { UploadFileInfo } from "naive-ui";
import { COMPANION_GIF_THEME_OPTIONS } from "../state/companionGifThemes";
import { getUiText, normalizeLanguage } from "../state/i18n";
import type { AppLanguage, CompanionCustomGif, CompanionGifTheme, GuideKey, ThemeMode, ZoneKey, ZoneVisibility } from "../types";
import { CONTEXT_MENU_Z_INDEX } from "../utils/contextMenu";
import { renderIcon } from "../utils/dropdownIcons";

const props = withDefaults(defineProps<{
  appVersion: string;
  updateAvailable: boolean;
  companionGifTheme: CompanionGifTheme;
  customCompanionGif?: CompanionCustomGif;
  hasCustomCompanionGif?: boolean;
  language?: AppLanguage;
  theme?: ThemeMode;
  zoneVisibility?: ZoneVisibility;
}>(), {
  language: "zh",
  theme: "light",
  zoneVisibility: () => ({ assets: true, notes: true, tasks: true, workspace: true }),
  customCompanionGif: () => ({}),
  hasCustomCompanionGif: false,
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
  changelog: [];
  language: [language: AppLanguage, anchor?: HTMLElement];
  theme: [theme: ThemeMode];
  toggleZone: [zone: ZoneKey];
  gifTheme: [theme: CompanionGifTheme, anchor?: HTMLElement];
  customGif: [files: { light?: File; dark?: File }, anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();

// Temporarily disabled — the QR-code "支持作者" flow is hidden until re-enabled.
const SUPPORT_AUTHOR_ENABLED = false;

const menuOpen = ref(false);
// NDropdown requests closure after every selection, even when its show is controlled.
let keepOpenAfterPreferenceSelect = false;
const triggerRef = ref<HTMLElement | null>(null);
const customGifDialogOpen = ref(false);
const customGifLightFile = ref<File | undefined>();
const customGifDarkFile = ref<File | undefined>();
const customGifLightPreviewSrc = ref<string | undefined>();
const customGifDarkPreviewSrc = ref<string | undefined>();
const text = computed(() => getUiText(props.language));
const customGifLightPreview = computed(() => customGifLightPreviewSrc.value ?? props.customCompanionGif.light);
const customGifDarkPreview = computed(() => customGifDarkPreviewSrc.value ?? props.customCompanionGif.dark);
const preferenceOpen = ref<"zones" | null>(null);
let keepPreferenceOpen = false;
const nextAppearance = computed<ThemeMode>(() => props.theme === "light" ? "dark" : props.theme === "dark" ? "auto" : "light");
function selectAppearance(): void {
  preferenceOpen.value = null;
  keepPreferenceOpen = false;
  menuOpen.value = false;
  emit("theme", nextAppearance.value);
}
const zoneOptions = computed(() => (["assets", "notes", "tasks", "workspace"] as const).map((zone) => ({
  label: text.value.zoneVisibility[zone], key: `zone:${zone}`,
  icon: props.zoneVisibility[zone] ? renderIcon(CheckmarkOutline) : undefined,
})));
function handlePreferenceShow(kind: "zones", show: boolean): void {
  if (!show && preferenceOpen.value !== kind) return;
  if (!show && keepPreferenceOpen) { keepPreferenceOpen = false; return; }
  keepPreferenceOpen = false;
  preferenceOpen.value = show ? kind : null;
  if (show) menuOpen.value = false;
}
function handlePreferenceSelect(key: string): void {
  keepPreferenceOpen = true;
  emit("toggleZone", key.slice(5) as ZoneKey);
}

const options = computed(() => [
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
  { type: "divider", key: "preferences-divider" },
  { label: text.value.settings.shortcutHelp, key: "shortcut-help", icon: renderIcon(KeyOutline) },
  { label: text.value.settings.suggest, key: "suggest", icon: renderIcon(MailOutline) },
  ...(SUPPORT_AUTHOR_ENABLED
    ? [{ label: text.value.settings.support, key: "support", icon: renderIcon(HeartOutline) }]
    : []),
  { label: text.value.settings.about, key: "about", icon: renderIcon(InformationCircleOutline) },
  { type: "divider", key: "version-divider" },
  {
    label: () =>
      h("span", { class: "settings-version-item", "data-testid": "settings-version" }, [
        h("span", `v${props.appVersion}`),
        props.updateAvailable
          ? h("span", { class: "settings-version-badge" }, text.value.settings.updateAvailable)
          : null,
      ]),
    key: "version",
  },
]);

function handleSelect(key: string): void {
  keepOpenAfterPreferenceSelect = key.startsWith("gif-theme:") && key !== "gif-theme:custom";
  if (!keepOpenAfterPreferenceSelect) menuOpen.value = false;
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
  if (key === "version") {
    emit("changelog");
    return;
  }
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
  if (value) { preferenceOpen.value = null; keepPreferenceOpen = false; }
  if (!value && keepOpenAfterPreferenceSelect) {
    keepOpenAfterPreferenceSelect = false;
    return;
  }
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

</script>

<template>
  <div class="settings-toolbar">
    <NDropdown trigger="click" placement="bottom-end" :show="preferenceOpen === 'zones'"
      :z-index="CONTEXT_MENU_Z_INDEX" :options="zoneOptions"
      @select="handlePreferenceSelect" @update:show="(show) => handlePreferenceShow('zones', show)">
      <button type="button" class="icon-button" data-testid="zone-visibility-trigger"
        :aria-label="text.zoneVisibility.title" :title="text.zoneVisibility.title"
        :aria-expanded="preferenceOpen === 'zones'">
        <NIcon :component="GridOutline" />
      </button>
    </NDropdown>
    <button type="button" class="icon-button appearance-button" data-testid="appearance-controls"
      :data-theme-mode="theme" :aria-label="`${text.settings.appearance}: ${text.settings[theme]}`"
      :title="`${text.settings[theme]} → ${text.settings[nextAppearance]}`" @click="selectAppearance">
      <svg v-if="theme === 'auto'" data-testid="appearance-system-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M12 4 A8 8 0 0 1 12 20 Z" fill="currentColor" />
      </svg>
      <NIcon v-else :component="theme === 'light' ? Sun : Moon" />
    </button>
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
  </div>
  <NModal :show="customGifDialogOpen" preset="card" class="quick-dialog gif-theme-custom-modal"
    :z-index="CONTEXT_MENU_Z_INDEX + 1" :mask-closable="false"
    :title="text.settings.customGif" :aria-label="text.settings.customGif"
    @close="closeCustomGifDialog" @esc="closeCustomGifDialog">
  <section class="gif-theme-custom-dialog">
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
  </NModal>
</template>

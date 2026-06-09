<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref } from "vue";
import type { Component, VNode } from "vue";
import { NDropdown, NIcon, NScrollbar } from "naive-ui";
import { ClipboardOutline, CloseOutline, CopyOutline, EyeOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
import type { DropdownOption } from "naive-ui";
import type { AppLanguage, GuideKey, StoredImage } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getUiText } from "../state/i18n";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  title: string;
  images: StoredImage[];
  activePreviewId?: string;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  preview: [id: string];
  closePreview: [];
  copy: [id: string];
  delete: [id: string, anchor?: HTMLElement];
  reorder: [dragId: string, targetId: string];
  paste: [anchor?: HTMLElement];
  dropFiles: [files: File[], anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
}>();

const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement } | null>(null);
const draggingId = ref<string | null>(null);
const isDragHover = ref(false);
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({ ...GUIDE_MENU_OPTION, label: uiText.value.common.tips }));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);
const isPreviewCloseMenuItem = computed(() => Boolean(menu.value?.id && props.activePreviewId));

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);

const menuOptions = computed<DropdownOption[]>(() =>
  menu.value?.id
    ? [
        { label: uiText.value.common.copy, key: "copy", icon: renderIcon(CopyOutline) },
        {
          label: isPreviewCloseMenuItem.value ? uiText.value.preview.close : uiText.value.common.preview,
          key: isPreviewCloseMenuItem.value ? "close-preview" : "preview",
          icon: renderIcon(isPreviewCloseMenuItem.value ? CloseOutline : EyeOutline),
        },
        { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) },
        { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
      ]
    : [{ label: uiText.value.images.pasteImage, key: "paste", icon: renderIcon(ClipboardOutline) }, { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) }],
);

function openMenu(event: MouseEvent, id?: string): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function openTitleMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea")) return;
  event.preventDefault();
  event.stopPropagation();
  titleRef.value?.openMenuAt(event.clientX, event.clientY, event);
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  const id = menu.value?.id;
  const anchor = menu.value?.anchor;
  closeMenu();
  if (key === "paste") emit("paste", anchor);
  if (key === "guide" && anchor) emit("guide", "images", anchor, true);
  if (!id) return;
  if (key === "preview") emit("preview", id);
  if (key === "close-preview") emit("closePreview");
  if (key === "copy") emit("copy", id);
  if (key === "delete") emit("delete", id, anchor);
}

function handleGuideClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .image-card")) return;
  emit("guide", "images", event.currentTarget as HTMLElement);
}

function handleExternalDrop(event: DragEvent): void {
  isDragHover.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  emit("dropFiles", files, event.currentTarget as HTMLElement);
}

function handleImageDragEnter(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    isDragHover.value = true;
  }
}

function handleImageDragLeave(): void {
  isDragHover.value = false;
}
</script>

<template>
  <section
    class="panel image-panel"
    :class="{ 'drag-hover': isDragHover }"
    aria-labelledby="image-title"
    tabindex="-1"
    @click="handleGuideClick"
    @dragover.prevent
    @drop.prevent.stop="handleExternalDrop"
    @dragenter="handleImageDragEnter"
    @dragleave="handleImageDragLeave"
    @dragend="handleImageDragLeave"
    @contextmenu="openMenu($event)"
  >
    <div class="panel-header" @contextmenu="openTitleMenu">
      <h1 id="image-title">
        <EditableTitle
          ref="titleRef"
          id="image-title"
          :value="title"
          :edit-label="uiText.common.rename"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </h1>
      <span class="count">{{ images.length }}</span>
    </div>

    <NScrollbar
      class="image-list-scrollbar"
      :aria-label="uiText.images.list"
      @click="closeMenu"
      @dragover.prevent
      @drop.prevent.stop="handleExternalDrop"
      @contextmenu.prevent.stop="openMenu($event)"
    >
      <TransitionGroup name="image-reorder" tag="div" class="image-list">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        class="image-card"
        :class="{ 'is-dragging': draggingId === image.id, 'is-active': image.id === activePreviewId }"
        type="button"
        draggable="true"
        @click="emit('preview', image.id)"
        @dblclick.stop.prevent="emit('copy', image.id)"
        @contextmenu.stop="openMenu($event, image.id)"
        @dragstart="draggingId = image.id"
        @dragover.prevent
        @drop="draggingId && draggingId !== image.id && emit('reorder', draggingId, image.id)"
        @dragend="draggingId = null"
      >
        <span class="image-index">{{ index + 1 }}</span>
        <img v-if="image.src" :src="image.src" :alt="uiText.images.thumbnailAlt" draggable="false" />
        <span v-else class="image-missing">{{ uiText.images.loading }}</span>
      </button>
      </TransitionGroup>
    </NScrollbar>

    <NDropdown
      v-if="menu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="menu.x"
      :y="menu.y"
      :z-index="CONTEXT_MENU_Z_INDEX"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="exclusiveMenu.handleClickOutside"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>

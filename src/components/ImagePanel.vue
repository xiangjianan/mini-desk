<script setup lang="ts">
import { computed, ref } from "vue";
import { NDropdown } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import type { GuideKey, StoredImage } from "../types";
import { EMPTY_HINTS } from "../state/defaults";
import EditableTitle from "./EditableTitle.vue";

defineProps<{
  title: string;
  images: StoredImage[];
}>();

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  preview: [id: string];
  copy: [id: string];
  delete: [id: string, anchor?: HTMLElement];
  reorder: [dragId: string, targetId: string];
  paste: [];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();

const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement } | null>(null);
const draggingId = ref<string | null>(null);

const menuOptions = computed<DropdownOption[]>(() =>
  menu.value?.id
    ? [
        { label: "预览", key: "preview" },
        { label: "复制", key: "copy" },
        { label: "删除", key: "delete" },
      ]
    : [{ label: "粘贴图片", key: "paste" }],
);

function openMenu(event: MouseEvent, id?: string): void {
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  const id = menu.value?.id;
  const anchor = menu.value?.anchor;
  closeMenu();
  if (key === "paste") emit("paste");
  if (!id) return;
  if (key === "preview") emit("preview", id);
  if (key === "copy") emit("copy", id);
  if (key === "delete") emit("delete", id, anchor);
}

function handleGuideClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .image-card")) return;
  emit("guide", "images", event.currentTarget as HTMLElement);
}
</script>

<template>
  <section class="panel image-panel" aria-labelledby="image-title" @click="handleGuideClick" @contextmenu="openMenu($event)">
    <div class="panel-header">
      <h1 id="image-title">
        <EditableTitle id="image-title" :value="title" @update="(id, value) => emit('titleUpdate', id, value)" />
      </h1>
      <span class="count">{{ images.length }}</span>
    </div>

    <div class="image-list" aria-label="图床图片列表" @click="closeMenu">
      <button v-if="images.length === 0" class="empty-hint image-empty" type="button" @click="emit('paste')">
        {{ EMPTY_HINTS.images }}
      </button>
      <button
        v-for="(image, index) in images"
        :key="image.id"
        class="image-card"
        type="button"
        draggable="true"
        @click="emit('preview', image.id)"
        @contextmenu.stop="openMenu($event, image.id)"
        @dragstart="draggingId = image.id"
        @dragover.prevent
        @drop="draggingId && draggingId !== image.id && emit('reorder', draggingId, image.id)"
        @dragend="draggingId = null"
      >
        <span class="image-index">{{ index + 1 }}</span>
        <img v-if="image.src" :src="image.src" alt="截图缩略图" draggable="false" />
        <span v-else class="image-missing">图片载入中</span>
      </button>
    </div>

    <NDropdown
      v-if="menu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="menu.x"
      :y="menu.y"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="closeMenu"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>

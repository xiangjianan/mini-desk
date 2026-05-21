<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CloseOutline } from "@vicons/ionicons5";
import { NButton, NDropdown, NIcon, NModal } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import type { StoredImage } from "../types";

const props = defineProps<{
  images: StoredImage[];
  activeId?: string;
}>();

const emit = defineEmits<{
  close: [];
  copy: [id: string];
  delete: [id: string, anchor?: HTMLElement];
  activate: [id: string];
}>();

const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
const start = ref({ x: 0, y: 0, ox: 0, oy: 0 });
const menu = ref<{ x: number; y: number; anchor?: HTMLElement } | null>(null);
const menuOptions: DropdownOption[] = [
  { label: "取消预览", key: "close" },
  { label: "复制", key: "copy" },
  { label: "删除", key: "delete" },
];

const active = computed(() => props.images.find((image) => image.id === props.activeId));

watch(
  () => props.activeId,
  () => {
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
  },
);

function wheel(event: WheelEvent): void {
  event.preventDefault();
  scale.value = Math.min(5, Math.max(0.3, scale.value + (event.deltaY > 0 ? -0.1 : 0.1)));
}

function down(event: MouseEvent): void {
  dragging.value = true;
  start.value = { x: event.clientX, y: event.clientY, ox: offset.value.x, oy: offset.value.y };
}

function move(event: MouseEvent): void {
  if (!dragging.value) return;
  offset.value = {
    x: start.value.ox + event.clientX - start.value.x,
    y: start.value.oy + event.clientY - start.value.y,
  };
}

function openMenu(event: MouseEvent): void {
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY, anchor: event.currentTarget as HTMLElement };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  if (!active.value) return;
  const anchor = menu.value?.anchor;
  closeMenu();
  if (key === "close") emit("close");
  if (key === "copy") emit("copy", active.value.id);
  if (key === "delete") emit("delete", active.value.id, anchor);
}
</script>

<template>
  <NModal
    v-if="active"
    :show="true"
    :mask-closable="false"
    :auto-focus="false"
    :trap-focus="false"
    :block-scroll="false"
    :mask-style="{ pointerEvents: 'none' }"
    @update:show="(show) => !show && emit('close')"
  >
    <div
      class="image-preview"
      aria-hidden="false"
      tabindex="0"
      @wheel="wheel"
      @mousemove="move"
      @mouseup="dragging = false"
      @mouseleave="dragging = false"
      @keydown.esc="emit('close')"
      @keydown.space.prevent="emit('close')"
      @keydown.delete="emit('delete', active.id)"
      @keydown.enter="emit('copy', active.id)"
      @contextmenu.prevent="openMenu"
    >
      <aside class="preview-sidebar">
        <div class="preview-sidebar-bar">
          <NButton
            quaternary
            size="small"
            class="preview-close-button icon-button"
            aria-label="取消预览"
            @click="emit('close')"
          >
            <NIcon :component="CloseOutline" />
          </NButton>
        </div>
        <div class="image-list preview-image-list" aria-label="预览图片列表">
          <button
            v-for="(image, index) in images"
            :key="image.id"
            class="image-card preview-thumb"
            :class="{ 'is-active': image.id === active.id }"
            type="button"
            @click="emit('activate', image.id)"
          >
            <span class="image-index">{{ index + 1 }}</span>
            <img v-if="image.src" :src="image.src" alt="预览缩略图" />
          </button>
        </div>
      </aside>
      <main class="preview-main">
        <div class="preview-stage" @mousedown="down">
          <img
            v-if="active.src"
            :src="active.src"
            alt="图片预览"
            draggable="false"
            :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }"
            @contextmenu.prevent.stop="openMenu"
          />
        </div>
        <div class="preview-actions">
          <span>方向键切换 · 滚轮缩放 · 拖动平移 · Enter 复制 · Delete 删除 · Space/Esc 关闭</span>
          <NButton size="small" @click="emit('close')">取消预览</NButton>
          <NButton size="small" @click="emit('copy', active.id)">复制</NButton>
          <NButton size="small" type="error" ghost @click="emit('delete', active.id, $event.currentTarget as HTMLElement)">
            删除
          </NButton>
        </div>
      </main>
      <NDropdown
        v-if="menu"
        placement="bottom-start"
        trigger="manual"
        :show="true"
        :x="menu.x"
        :y="menu.y"
        :options="menuOptions"
        :z-index="3100"
        @select="handleMenuSelect"
        @clickoutside="closeMenu"
      >
        <span
          class="dropdown-anchor"
          :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
          aria-hidden="true"
        />
      </NDropdown>
    </div>
  </NModal>
</template>

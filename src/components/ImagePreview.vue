<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { CloseOutline } from "@vicons/ionicons5";
import { NButton, NDropdown, NIcon, NModal, NScrollbar } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { getUiText } from "../state/i18n";
import type { AppLanguage, StoredImage } from "../types";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";

const props = withDefaults(defineProps<{
  images: StoredImage[];
  activeId?: string;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

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
const menu = ref<{ x: number; y: number; id: string; anchor?: HTMLElement } | null>(null);

const uiText = computed(() => getUiText(props.language));
const active = computed(() => props.images.find((image) => image.id === props.activeId));
const menuOptions = computed<DropdownOption[]>(() => [
  { label: uiText.value.common.copy, key: "copy" },
  { label: uiText.value.preview.close, key: "close" },
  { label: uiText.value.common.delete, key: "delete" },
]);
const exclusiveMenu = createExclusiveContextMenu(closeMenu);

onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);

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

function openMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  const current = menu.value;
  if (!current) return;
  closeMenu();
  if (key === "copy") emit("copy", current.id);
  if (key === "close") emit("close");
  if (key === "delete") emit("delete", current.id, current.anchor);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!active.value) return;
  if (event.key === "Escape" || event.key === " ") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    emit("copy", active.value.id);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    emit("delete", active.value.id);
  }
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
      @keydown="handleKeydown"
      @contextmenu.prevent="openMenu($event, active.id)"
    >
      <aside class="preview-sidebar">
        <div class="preview-sidebar-bar">
          <NButton
            quaternary
            size="small"
            class="preview-close-button icon-button"
            :aria-label="uiText.preview.close"
            @click="emit('close')"
          >
            <NIcon :component="CloseOutline" />
          </NButton>
        </div>
        <NScrollbar class="preview-image-list-scrollbar" :aria-label="uiText.preview.list">
          <div class="image-list preview-image-list">
            <button
              v-for="(image, index) in images"
              :key="image.id"
              class="image-card preview-thumb"
              :class="{ 'is-active': image.id === active.id }"
              type="button"
              @click.stop="emit('activate', image.id)"
            >
              <span class="image-index">{{ index + 1 }}</span>
              <img v-if="image.src" :src="image.src" :alt="uiText.preview.thumbnailAlt" />
            </button>
          </div>
        </NScrollbar>
      </aside>
      <main class="preview-main">
        <div class="preview-stage" @mousedown="down" @click.self="emit('close')">
          <img
            v-if="active.src"
            :key="active.id"
            :src="active.src"
            :alt="uiText.preview.imageAlt"
            draggable="false"
            :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }"
            @contextmenu.prevent="openMenu($event, active.id)"
          />
        </div>
        <div class="preview-actions">
          <span>{{ uiText.preview.help }}</span>
          <NButton size="small" @click="emit('close')">{{ uiText.preview.close }}</NButton>
          <NButton size="small" @click="emit('copy', active.id)">{{ uiText.common.copy }}</NButton>
          <NButton size="small" type="error" ghost @click="emit('delete', active.id, $event.currentTarget as HTMLElement)">
            {{ uiText.common.delete }}
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
    </div>
  </NModal>
</template>

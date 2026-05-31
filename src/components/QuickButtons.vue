<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { NButton, NCheckbox, NDropdown, NIcon, NInput, NModal, NScrollbar } from "naive-ui";
import { AddOutline, CopyOutline, CreateOutline, EyeOffOutline, EyeOutline, HelpCircleOutline, TrashOutline } from "@vicons/ionicons5";
import type { DropdownOption } from "naive-ui";
import type { AppLanguage, GuideKey, QuickButton, QuickButtonType } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getUiText } from "../state/i18n";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  title: string;
  buttons: QuickButton[];
  showHidden: boolean;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  save: [payload: { id?: string; title: string; value: string; type: QuickButtonType }];
  delete: [id: string, anchor?: HTMLElement];
  copy: [id: string, anchor?: HTMLElement];
  toggleHidden: [id: string];
  toggleShowHidden: [];
  reorder: [dragId: string, targetId: string];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
}>();

const dialogOpen = ref(false);
const editingId = ref<string | undefined>();
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
const form = reactive<{ title: string; value: string; type: QuickButtonType }>({
  title: "",
  value: "",
  type: "link",
});
const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement } | null>(null);
const draggingId = ref<string | null>(null);
const isDragHover = ref(false);
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({ ...GUIDE_MENU_OPTION, label: uiText.value.common.tips }));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);

const visibleButtons = computed(() =>
  props.buttons.filter((button) => props.showHidden || !button.hidden),
);
const canSubmit = computed(() => form.title.trim().length > 0 && form.value.trim().length > 0);
const menuOptions = computed<DropdownOption[]>(() => {
  const button = props.buttons.find((item) => item.id === menu.value?.id);
  if (!menu.value?.id) {
    return [
      { label: uiText.value.quick.add, key: "add", icon: renderIcon(AddOutline) },
      { label: props.showHidden ? uiText.value.quick.hideHidden : uiText.value.quick.showHidden, key: "toggle-show-hidden", icon: renderIcon(props.showHidden ? EyeOffOutline : EyeOutline) },
      { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
    ];
  }
  return [
    { label: uiText.value.common.edit, key: "edit", icon: renderIcon(CreateOutline) },
    { label: button?.hidden ? uiText.value.quick.show : uiText.value.quick.hide, key: "toggle-hidden", icon: renderIcon(button?.hidden ? EyeOutline : EyeOffOutline) },
    { label: uiText.value.common.delete, key: "delete", icon: renderIcon(TrashOutline) },
    { ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) },
  ];
});

watch(dialogOpen, (open) => {
  if (!open) editingId.value = undefined;
});

function openAdd(anchor?: HTMLElement): void {
  editingId.value = undefined;
  form.title = "";
  form.value = "";
  form.type = "link";
  dialogOpen.value = true;
  if (anchor) emit("guide", "addQuick", anchor);
}

function openEdit(id: string): void {
  const button = props.buttons.find((item) => item.id === id);
  if (!button) return;
  editingId.value = id;
  form.title = button.title;
  form.value = button.value;
  form.type = button.type;
  dialogOpen.value = true;
  menu.value = null;
}

function setQuickType(type: QuickButtonType): void {
  form.type = type;
}

function submit(): void {
  if (!canSubmit.value) return;

  emit("save", {
    id: editingId.value,
    title: form.title.trim(),
    value: form.value,
    type: form.type,
  });
  closeDialog();
}

function closeDialog(): void {
  dialogOpen.value = false;
}

function openMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function openAreaMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const button = target.closest("button");
  if (target.closest("input, textarea, .quick-button") || button) return;
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, anchor: event.currentTarget as HTMLElement };
}

function openHeaderMenu(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
  menu.value = { x: event.clientX, y: event.clientY, anchor: event.currentTarget as HTMLElement };
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
  if (!menu.value) return;
  const { id, anchor } = menu.value;
  closeMenu();
  if (key === "add") {
    openAdd(anchor);
    return;
  }
  if (key === "toggle-show-hidden") {
    handleToggleShowHidden(anchor);
    return;
  }
  if (key === "guide" && anchor) emit("guide", "quickButtons", anchor, true);
  if (!id) return;
  if (key === "edit") openEdit(id);
  if (key === "toggle-hidden") emit("toggleHidden", id);
  if (key === "delete") emit("delete", id, anchor);
}

function handleAreaClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .quick-button, .header-actions")) return;
  emit("guide", "quickButtons", event.currentTarget as HTMLElement);
}

function handleToggleShowHidden(anchor?: HTMLElement): void {
  emit("toggleShowHidden");
  if (anchor) emit("guide", "toggleHiddenQuick", anchor);
}

function handleQuickDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
    isDragHover.value = true;
  }
}

function handleQuickDragLeave(): void {
  isDragHover.value = false;
}

function handleQuickDrop(event: DragEvent): void {
  event.preventDefault();
  isDragHover.value = false;
  const text = event.dataTransfer?.getData("text/plain") ?? "";
  if (!text.trim()) return;

  const isUrl = /^https?:\/\//.test(text.trim());
  const title = isUrl
    ? (() => { try { return new URL(text.trim()).hostname; } catch { return text.trim().slice(0, 20); } })()
    : text.trim().slice(0, 20);
  const type: QuickButtonType = isUrl ? "link" : "text";

  emit("save", { title, value: text.trim(), type });
}
</script>

<template>
  <section
    class="split-block quick-block"
    :class="{ 'drag-hover': isDragHover }"
    @click="handleAreaClick"
    @contextmenu="openAreaMenu"
    @dragover="handleQuickDragOver"
    @dragleave="handleQuickDragLeave"
    @drop="handleQuickDrop"
    @dragend="handleQuickDragLeave"
  >
    <div class="panel-header" @contextmenu="openTitleMenu">
      <h2 id="quick-title">
        <EditableTitle
          ref="titleRef"
          id="quick-title"
          :value="title"
          :edit-label="uiText.common.rename"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </h2>
      <div class="header-actions">
        <button
          type="button"
          class="quick-menu-button icon-button"
          :aria-label="uiText.quick.menu"
          @click="openHeaderMenu"
        >
          ⋯
        </button>
      </div>
    </div>

    <NScrollbar class="quick-buttons-scrollbar" :aria-label="uiText.quick.list" @click="closeMenu" @contextmenu="openAreaMenu">
      <TransitionGroup name="quick-reorder" tag="div" class="quick-buttons">
        <button
          v-for="button in visibleButtons"
          :key="button.id"
          class="quick-button"
          :class="{ 'is-hidden': button.hidden, 'is-copy': button.type === 'text', 'is-dragging': draggingId === button.id }"
          type="button"
          draggable="true"
          @click="emit('copy', button.id, $event.currentTarget as HTMLElement)"
          @contextmenu.stop="openMenu($event, button.id)"
          @dragstart="draggingId = button.id"
          @dragover.prevent
          @drop="draggingId && draggingId !== button.id && emit('reorder', draggingId, button.id)"
          @dragend="draggingId = null"
        >
          <NIcon v-if="button.type === 'text'" class="quick-button-icon" :component="CopyOutline" />
          <span>{{ button.title }}</span>
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

    <NModal
      v-model:show="dialogOpen"
      preset="card"
      class="quick-dialog"
      :mask-closable="false"
      :title="editingId ? uiText.quick.dialogEdit : uiText.quick.dialogAdd"
    >
      <form class="quick-form" @submit.prevent="submit">
        <label>
          <span>{{ uiText.quick.title }}</span>
          <NInput v-model:value="form.title" autocomplete="off" />
        </label>
        <div class="quick-type-options">
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'link'" @update:checked="setQuickType('link')">{{ uiText.quick.linkType }}</NCheckbox>
          </label>
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'text'" @update:checked="setQuickType('text')">{{ uiText.quick.textType }}</NCheckbox>
          </label>
        </div>
        <label>
          <span>{{ form.type === "link" ? "URL" : uiText.quick.copyText }}</span>
          <NInput
            v-model:value="form.value"
            :type="form.type === 'text' ? 'textarea' : 'text'"
            autocomplete="off"
            :autosize="form.type === 'text' ? { minRows: 4, maxRows: 8 } : undefined"
          />
        </label>
        <div class="dialog-actions">
          <NButton v-if="editingId" ghost @click="closeDialog">{{ uiText.common.cancel }}</NButton>
          <NButton attr-type="submit" type="primary" :disabled="!canSubmit">{{ uiText.common.save }}</NButton>
        </div>
      </form>
    </NModal>
  </section>
</template>

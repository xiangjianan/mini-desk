<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { NButton, NCheckbox, NDropdown, NIcon, NInput, NModal } from "naive-ui";
import { AddOutline, CopyOutline, EyeOffOutline, EyeOutline } from "@vicons/ionicons5";
import type { DropdownOption } from "naive-ui";
import type { GuideKey, QuickButton, QuickButtonType } from "../types";
import { EMPTY_HINTS, GUIDE_MENU_OPTION } from "../state/defaults";
import EditableTitle from "./EditableTitle.vue";

const props = defineProps<{
  title: string;
  buttons: QuickButton[];
  showHidden: boolean;
}>();

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  save: [payload: { id?: string; title: string; value: string; type: QuickButtonType }];
  delete: [id: string, anchor?: HTMLElement];
  copy: [id: string, anchor?: HTMLElement];
  toggleHidden: [id: string];
  toggleShowHidden: [];
  reorder: [dragId: string, targetId: string];
  guide: [key: GuideKey, anchor: HTMLElement];
}>();

const dialogOpen = ref(false);
const editingId = ref<string | undefined>();
const form = reactive<{ title: string; value: string; type: QuickButtonType }>({
  title: "",
  value: "",
  type: "link",
});
const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement } | null>(null);
const draggingId = ref<string | null>(null);
const guideMenuOption: DropdownOption = { ...GUIDE_MENU_OPTION, label: GUIDE_MENU_OPTION.label || "使用指南" };

const visibleButtons = computed(() =>
  props.buttons.filter((button) => props.showHidden || !button.hidden),
);
const canSubmit = computed(() => form.title.trim().length > 0 && form.value.trim().length > 0);
const menuOptions = computed<DropdownOption[]>(() => {
  const button = props.buttons.find((item) => item.id === menu.value?.id);
  if (!menu.value?.id) return [guideMenuOption];
  return [
    { label: "编辑", key: "edit" },
    { label: button?.hidden ? "取消隐藏" : "隐藏", key: "toggle-hidden" },
    { label: "删除", key: "delete" },
    guideMenuOption,
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
  menu.value = { x: event.clientX, y: event.clientY, id, anchor: event.currentTarget as HTMLElement };
}

function openAreaMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const button = target.closest("button");
  if (target.closest("input, textarea, .quick-button") || (button && !button.classList.contains("empty-hint"))) return;
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY, anchor: event.currentTarget as HTMLElement };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  if (!menu.value) return;
  const { id, anchor } = menu.value;
  closeMenu();
  if (key === "guide" && anchor) emit("guide", "quickButtons", anchor);
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

function handleToggleShowHidden(event: MouseEvent): void {
  emit("toggleShowHidden");
  emit("guide", "toggleHiddenQuick", event.currentTarget as HTMLElement);
}
</script>

<template>
  <section class="split-block quick-block" @click="handleAreaClick">
    <div class="panel-header">
      <h2 id="quick-title">
        <EditableTitle id="quick-title" :value="title" @update="(id, value) => emit('titleUpdate', id, value)" />
      </h2>
      <div class="header-actions">
        <NButton
          quaternary
          size="tiny"
          class="icon-button"
          aria-label="新增快捷链接"
          @click="openAdd($event.currentTarget as HTMLElement)"
        >
          <NIcon :component="AddOutline" />
        </NButton>
        <NButton
          quaternary
          size="tiny"
          class="icon-button"
          :aria-label="showHidden ? '隐藏已隐藏快捷链接' : '显示全部快捷链接'"
          @click="handleToggleShowHidden"
        >
          <NIcon :component="showHidden ? EyeOffOutline : EyeOutline" />
        </NButton>
      </div>
    </div>

    <div class="quick-buttons" aria-label="快捷按钮列表" @click="closeMenu" @contextmenu="openAreaMenu">
      <button v-if="visibleButtons.length === 0" class="empty-hint" type="button" @click="openAdd($event.currentTarget as HTMLElement)">
        {{ EMPTY_HINTS.quickButtons }}
      </button>
      <button
        v-for="button in visibleButtons"
        :key="button.id"
        class="quick-button"
        :class="{ 'is-hidden': button.hidden, 'is-copy': button.type === 'text' }"
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

    <NModal
      v-model:show="dialogOpen"
      preset="card"
      class="quick-dialog"
      :mask-closable="false"
      :title="editingId ? '编辑快捷按钮' : '新增快捷按钮'"
    >
      <form class="quick-form" @submit.prevent="submit">
        <label>
          <span>标题</span>
          <NInput v-model:value="form.title" autocomplete="off" />
        </label>
        <div class="quick-type-options">
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'link'" @update:checked="setQuickType('link')">链接属性</NCheckbox>
          </label>
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'text'" @update:checked="setQuickType('text')">复制文本属性</NCheckbox>
          </label>
        </div>
        <label>
          <span>{{ form.type === "link" ? "URL" : "复制文本" }}</span>
          <NInput v-model:value="form.value" autocomplete="off" />
        </label>
        <div class="dialog-actions">
          <NButton v-if="editingId" type="error" ghost @click="emit('delete', editingId, $event.currentTarget as HTMLElement); closeDialog()">删除</NButton>
          <NButton attr-type="submit" type="primary" :disabled="!canSubmit">保存</NButton>
        </div>
      </form>
    </NModal>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { NButton, NCheckbox, NDropdown, NIcon, NInput, NModal, NScrollbar, NSelect } from "naive-ui";
import { AddOutline, CloudUploadOutline, CopyOutline, CreateOutline, EyeOffOutline, EyeOutline, HelpCircleOutline, PricetagsOutline, TrashOutline } from "@vicons/ionicons5";
import type { DropdownOption } from "naive-ui";
import type { AppLanguage, GuideKey, QuickApiBodyType, QuickApiHeader, QuickApiMethod, QuickButton, QuickButtonType, QuickTag } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getUiText } from "../state/i18n";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  title: string;
  buttons: QuickButton[];
  tags?: QuickTag[];
  showHidden: boolean;
  language?: AppLanguage;
}>(), {
  tags: () => [],
  language: "zh",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  save: [payload: { id?: string; title: string; value: string; type: QuickButtonType; tagTitle?: string; apiMethod?: QuickApiMethod; apiHeaders?: QuickApiHeader[]; apiBodyType?: QuickApiBodyType; apiBody?: string }];
  delete: [id: string, anchor?: HTMLElement];
  copy: [id: string, anchor?: HTMLElement];
  toggleHidden: [id: string];
  toggleShowHidden: [];
  reorder: [dragId: string, targetId: string];
  reorderTag: [dragId: string, targetId: string];
  moveToTag: [buttonId: string, tagId?: string, targetId?: string];
  saveTag: [payload: { id?: string; title: string }];
  deleteTag: [id: string, anchor?: HTMLElement];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
  declutter: [anchor: HTMLElement];
}>();

const dialogOpen = ref(false);
const tagManagerOpen = ref(false);
const editingId = ref<string | undefined>();
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
type QuickApiHeaderFormRow = QuickApiHeader & { id: string };
type QuickTagDraft = QuickTag & { titleDraft: string };

let headerRowId = 0;

function createHeaderRow(key = "", value = ""): QuickApiHeaderFormRow {
  headerRowId += 1;
  return { id: `header-${headerRowId}`, key, value };
}

function createHeaderRows(headers: QuickApiHeader[] | undefined): QuickApiHeaderFormRow[] {
  const rows = (headers ?? []).map((header) => createHeaderRow(header.key, header.value));
  return rows.length ? rows : [createHeaderRow()];
}

const form = reactive<{ title: string; value: string; tagTitle: string; type: QuickButtonType; apiMethod: QuickApiMethod; apiHeaders: QuickApiHeaderFormRow[]; apiBodyType: QuickApiBodyType; apiBody: string }>({
  title: "",
  value: "",
  tagTitle: "",
  type: "link",
  apiMethod: "GET",
  apiHeaders: [createHeaderRow()],
  apiBodyType: "none",
  apiBody: "",
});
const menu = ref<{ x: number; y: number; id?: string; anchor?: HTMLElement } | null>(null);
const tagDrafts = ref<QuickTagDraft[]>([]);
const newTagTitle = ref("");
const tagManagerAnchor = ref<HTMLElement | undefined>();
const draggingId = ref<string | null>(null);
const draggingTagId = ref<string | null>(null);
const isDragHover = ref(false);
const leavingHiddenIds = new Set<string>();
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({ ...GUIDE_MENU_OPTION, label: uiText.value.common.tips }));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);
const apiMethodOptions = computed(() =>
  ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => ({ label: method, value: method })),
);
const apiBodyTypeOptions = computed(() => [
  { label: uiText.value.quick.bodyNone, value: "none" },
  { label: uiText.value.quick.bodyJson, value: "json" },
  { label: uiText.value.quick.bodyText, value: "text" },
  { label: uiText.value.quick.bodyForm, value: "form" },
]);
const tagOptions = computed(() => [
  { label: uiText.value.quick.noTag, value: "" },
  ...props.tags.map((tag) => ({ label: tag.title, value: tag.title })),
]);

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);
watch(() => props.tags, refreshTagDrafts, { deep: true });

const visibleButtons = computed(() =>
  props.buttons.filter((button) => props.showHidden || !button.hidden),
);
const groupedButtons = computed(() => {
  const visible = visibleButtons.value;
  if (visible.length === 0) return [{ id: "__empty", title: "", buttons: [], reorderable: false }];
  const groups = props.tags
    .map((tag) => ({
      id: tag.id,
      title: tag.title,
      buttons: visible.filter((button) => button.tagId === tag.id),
      reorderable: true,
    }))
    .filter((group) => group.buttons.length > 0);
  const taggedIds = new Set(props.tags.map((tag) => tag.id));
  const otherButtons = visible.filter((button) => !button.tagId || !taggedIds.has(button.tagId));
  if (otherButtons.length > 0) {
    groups.push({ id: "__other", title: uiText.value.quick.otherTag, buttons: otherButtons, reorderable: false });
  }
  return groups.length > 0 ? groups : [{ id: "__empty", title: "", buttons: [], reorderable: false }];
});
const canSubmit = computed(() => {
  if (form.title.trim().length === 0 || form.value.trim().length === 0) return false;
  if (form.type !== "api") return true;
  return form.apiBodyType === "none" || form.apiBody.trim().length > 0;
});
const menuOptions = computed<DropdownOption[]>(() => {
  const button = props.buttons.find((item) => item.id === menu.value?.id);
  if (!menu.value?.id) {
    return [
      { label: uiText.value.quick.add, key: "add", icon: renderIcon(AddOutline) },
      { label: props.showHidden ? uiText.value.quick.hideHidden : uiText.value.quick.showHidden, key: "toggle-show-hidden", icon: renderIcon(props.showHidden ? EyeOffOutline : EyeOutline) },
      { label: uiText.value.quick.tagManage, key: "manage-tags", icon: renderIcon(PricetagsOutline) },
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

function openAdd(anchor?: HTMLElement): void {
  editingId.value = undefined;
  form.title = "";
  form.value = "";
  form.tagTitle = "";
  form.type = "link";
  form.apiMethod = "GET";
  form.apiHeaders = [createHeaderRow()];
  form.apiBodyType = "none";
  form.apiBody = "";
  dialogOpen.value = true;
  if (anchor) emit("guide", "addQuick", anchor);
}

function openEdit(id: string): void {
  const button = props.buttons.find((item) => item.id === id);
  if (!button) return;
  editingId.value = id;
  form.title = button.title;
  form.value = button.value;
  form.tagTitle = getQuickTagTitle(button.tagId);
  form.type = button.type;
  form.apiMethod = button.apiMethod ?? "GET";
  form.apiHeaders = createHeaderRows(button.apiHeaders);
  form.apiBodyType = button.apiBodyType ?? "none";
  form.apiBody = button.apiBody ?? "";
  dialogOpen.value = true;
  menu.value = null;
}

function refreshTagDrafts(): void {
  tagDrafts.value = props.tags.map((tag) => ({ ...tag, titleDraft: tag.title }));
}

function openTagManager(anchor?: HTMLElement): void {
  refreshTagDrafts();
  newTagTitle.value = "";
  tagManagerAnchor.value = anchor;
  tagManagerOpen.value = true;
}

function closeTagManager(): void {
  tagManagerOpen.value = false;
}

function addTag(): void {
  const title = newTagTitle.value.trim();
  if (!title) return;
  emit("saveTag", { title });
  newTagTitle.value = "";
}

function saveTag(draft: QuickTagDraft): void {
  const title = draft.titleDraft.trim();
  if (!title || title === draft.title) return;
  emit("saveTag", { id: draft.id, title });
}

function deleteTag(id: string, event: MouseEvent): void {
  emit("deleteTag", id, event.currentTarget as HTMLElement ?? tagManagerAnchor.value);
}

function getQuickTagTitle(tagId?: string): string {
  if (!tagId) return "";
  return props.tags.find((tag) => tag.id === tagId)?.title ?? "";
}

function setQuickType(type: QuickButtonType): void {
  form.type = type;
  if (type !== "api") {
    form.apiHeaders = [createHeaderRow()];
    form.apiBodyType = "none";
    form.apiBody = "";
  } else if (form.apiHeaders.length === 0) {
    form.apiHeaders = [createHeaderRow()];
  }
}

function addApiHeader(): void {
  form.apiHeaders.push(createHeaderRow());
}

function removeApiHeader(id: string): void {
  form.apiHeaders = form.apiHeaders.filter((header) => header.id !== id);
  if (form.apiHeaders.length === 0) form.apiHeaders = [createHeaderRow()];
}

function getApiHeadersPayload(): QuickApiHeader[] {
  return form.apiHeaders
    .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
    .filter((header) => header.key.length > 0);
}

function submit(): void {
  if (!canSubmit.value) return;

  emit("save", {
    id: editingId.value,
    title: form.title.trim(),
    value: form.value,
    type: form.type,
    tagTitle: form.tagTitle.trim(),
    ...(form.type === "api"
      ? { apiMethod: form.apiMethod, apiHeaders: getApiHeadersPayload(), apiBodyType: form.apiBodyType, apiBody: form.apiBody }
      : {}),
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
  if (key === "manage-tags") {
    openTagManager(anchor);
    return;
  }
  if (key === "guide" && anchor) emit("guide", "quickButtons", anchor, true);
  if (!id) return;
  if (key === "edit") openEdit(id);
  if (key === "toggle-hidden") {
    const btn = props.buttons.find((b) => b.id === id);
    if (btn && !btn.hidden) leavingHiddenIds.add(id);
    emit("toggleHidden", id);
  }
  if (key === "delete") emit("delete", id, anchor);
}

function handleAreaClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, .quick-button, .header-actions")) return;
  const anchor = event.currentTarget as HTMLElement;
  if (hasOverloadedVisibleGroup.value) {
    emit("declutter", anchor);
    return;
  }
  emit("guide", "quickButtons", anchor);
}

const hasOverloadedVisibleGroup = computed(() => {
  const tagIds = new Set(props.tags.map((tag) => tag.id));
  const counts = new Map<string, number>();
  props.buttons.forEach((button) => {
    if (button.hidden) return;
    const groupId = button.tagId && tagIds.has(button.tagId) ? button.tagId : "__other";
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  });
  return Array.from(counts.values()).some((count) => count > 12);
});

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

const MOVE_DURATION = 220;

function onQuickBeforeEnter(el: Element): void {
  const e = el as HTMLElement;
  e.style.opacity = "0";
}

function onQuickEnter(el: Element, done: () => void): void {
  const e = el as HTMLElement;
  requestAnimationFrame(() => {
    e.style.transition = `opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0, 0, 1)`;
    e.style.opacity = "1";
  });
  setTimeout(done, 220);
}

function onQuickAfterEnter(el: Element): void {
  const e = el as HTMLElement;
  e.style.transition = "";
  e.style.opacity = "";
}

function onQuickBeforeLeave(el: Element): void {
  const e = el as HTMLElement;
  const id = e.dataset.id;
  if (id && leavingHiddenIds.has(id)) {
    e.style.display = "none";
    leavingHiddenIds.delete(id);
  }
}

function onQuickLeave(el: Element, done: () => void): void {
  done();
}

function onQuickAfterLeave(el: Element): void {
  const e = el as HTMLElement;
  e.style.display = "";
}

function onQuickBeforeMove(el: Element): void {
  const e = el as HTMLElement;
  e.style.transition = `transform ${MOVE_DURATION}ms cubic-bezier(0.2, 0, 0, 1)`;
}

function onQuickMove(el: Element, done: () => void): void {
  setTimeout(done, MOVE_DURATION);
}

function onQuickAfterMove(el: Element): void {
  const e = el as HTMLElement;
  e.style.transition = "";
}

function onTagDrop(groupId: string): void {
  if (draggingId.value && isQuickButtonTargetGroup(groupId)) {
    const targetTagId = getGroupTagId(groupId);
    if (getQuickButtonTagId(draggingId.value) !== targetTagId) emit("moveToTag", draggingId.value, targetTagId);
    return;
  }
  if (!draggingTagId.value || draggingTagId.value === groupId || !isRealTagGroup(groupId)) return;
  emit("reorderTag", draggingTagId.value, groupId);
}

function handleTagDragOver(event: DragEvent, groupId: string): void {
  if (!isQuickButtonTargetGroup(groupId) && !isRealTagGroup(groupId)) return;
  if (!draggingId.value && !draggingTagId.value) return;
  if (draggingTagId.value && !isRealTagGroup(groupId)) return;
  event.preventDefault();
}

function getQuickButtonTagId(id: string): string | undefined {
  return props.buttons.find((button) => button.id === id)?.tagId;
}

function isRealTagGroup(groupId: string): boolean {
  return props.tags.some((tag) => tag.id === groupId);
}

function isQuickButtonTargetGroup(groupId: string): boolean {
  return groupId === "__other" || isRealTagGroup(groupId);
}

function getGroupTagId(groupId: string): string | undefined {
  return groupId === "__other" ? undefined : groupId;
}

function handleQuickButtonDrop(targetButtonId: string, targetGroupId: string): void {
  if (!draggingId.value || draggingId.value === targetButtonId) return;
  if (isQuickButtonTargetGroup(targetGroupId)) {
    const targetTagId = getGroupTagId(targetGroupId);
    if (getQuickButtonTagId(draggingId.value) !== targetTagId) {
      emit("moveToTag", draggingId.value, targetTagId, targetButtonId);
      return;
    }
  }
  emit("reorder", draggingId.value, targetButtonId);
}

function handleQuickGroupDrop(groupId: string): void {
  if (draggingId.value && isQuickButtonTargetGroup(groupId)) {
    const targetTagId = getGroupTagId(groupId);
    if (getQuickButtonTagId(draggingId.value) !== targetTagId) emit("moveToTag", draggingId.value, targetTagId);
    return;
  }
  onTagDrop(groupId);
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
      <div class="quick-tag-groups">
        <section
          v-for="group in groupedButtons"
          :key="group.id"
          class="quick-tag-group"
          :data-tag-id="group.id"
          @dragover="handleTagDragOver($event, group.id)"
          @drop.stop.prevent="handleQuickGroupDrop(group.id)"
        >
          <div
            v-if="group.title"
            class="quick-tag-heading"
            :class="{ 'is-dragging': draggingTagId === group.id, 'is-static': !group.reorderable }"
            :draggable="group.reorderable"
            @dragstart="group.reorderable && (draggingTagId = group.id)"
            @dragover="handleTagDragOver($event, group.id)"
            @drop.stop.prevent="onTagDrop(group.id)"
            @dragend="draggingTagId = null"
          >
            <span class="quick-tag-title">{{ group.title }}</span>
          </div>
          <TransitionGroup
            :css="false"
            tag="div"
            class="quick-buttons"
            @before-enter="onQuickBeforeEnter"
            @enter="onQuickEnter"
            @after-enter="onQuickAfterEnter"
            @before-leave="onQuickBeforeLeave"
            @leave="onQuickLeave"
            @after-leave="onQuickAfterLeave"
            @before-move="onQuickBeforeMove"
            @move="onQuickMove"
            @after-move="onQuickAfterMove"
          >
            <button
              v-for="button in group.buttons"
              :key="button.id"
              class="quick-button"
              :class="{ 'is-hidden': button.hidden, 'is-copy': button.type === 'text', 'is-api': button.type === 'api', 'is-dragging': draggingId === button.id }"
              :data-id="button.id"
              type="button"
              draggable="true"
              @click="emit('copy', button.id, $event.currentTarget as HTMLElement)"
              @contextmenu.stop="openMenu($event, button.id)"
              @dragstart="draggingId = button.id"
              @dragover.prevent
              @drop.stop.prevent="handleQuickButtonDrop(button.id, group.id)"
              @dragend="draggingId = null"
            >
              <NIcon v-if="button.type === 'text'" class="quick-button-icon" :component="CopyOutline" />
              <NIcon v-else-if="button.type === 'api'" class="quick-button-icon" :component="CloudUploadOutline" />
              <span>{{ button.title }}</span>
            </button>
          </TransitionGroup>
        </section>
      </div>
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
          <label class="checkbox-row">
            <NCheckbox :checked="form.type === 'api'" @update:checked="setQuickType('api')">{{ uiText.quick.apiType }}</NCheckbox>
          </label>
        </div>
        <label>
          <span>{{ form.type === "api" ? uiText.quick.requestUrl : form.type === "link" ? "URL" : uiText.quick.copyText }}</span>
          <NInput
            v-model:value="form.value"
            :type="form.type === 'text' ? 'textarea' : 'text'"
            autocomplete="off"
            :autosize="form.type === 'text' ? { minRows: 4, maxRows: 8 } : undefined"
          />
        </label>
        <label>
          <span>{{ uiText.quick.tag }}</span>
          <NSelect
            v-model:value="form.tagTitle"
            class="quick-tag-select"
            :options="tagOptions"
            filterable
            tag
            clearable
            :placeholder="uiText.quick.noTag"
          />
        </label>
        <template v-if="form.type === 'api'">
          <label>
            <span>{{ uiText.quick.requestMethod }}</span>
            <NSelect v-model:value="form.apiMethod" class="quick-api-method-select" :options="apiMethodOptions" />
          </label>
          <label>
            <span>{{ uiText.quick.requestHeaders }}</span>
            <div class="quick-api-headers">
              <div
                v-for="header in form.apiHeaders"
                :key="header.id"
                class="quick-api-header-row"
              >
                <NInput
                  v-model:value="header.key"
                  class="quick-api-header-key"
                  :placeholder="uiText.quick.requestHeaderKey"
                  autocomplete="off"
                />
                <NInput
                  v-model:value="header.value"
                  class="quick-api-header-value"
                  :placeholder="uiText.quick.requestHeaderValue"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="quick-api-remove-header icon-button"
                  :aria-label="uiText.quick.removeRequestHeader"
                  @click="removeApiHeader(header.id)"
                >
                  <NIcon :component="TrashOutline" />
                </button>
              </div>
              <NButton class="quick-api-add-header" type="default" @click="addApiHeader">{{ uiText.quick.addRequestHeader }}</NButton>
            </div>
          </label>
          <label>
            <span>{{ uiText.quick.requestBodyType }}</span>
            <NSelect v-model:value="form.apiBodyType" class="quick-api-body-type-select" :options="apiBodyTypeOptions" />
          </label>
          <label v-if="form.apiBodyType !== 'none'">
            <span>{{ uiText.quick.requestBody }}</span>
            <NInput
              v-model:value="form.apiBody"
              type="textarea"
              autocomplete="off"
              :autosize="{ minRows: 5, maxRows: 10 }"
            />
          </label>
        </template>
        <div class="dialog-actions">
          <NButton v-if="editingId" class="quick-dialog-action quick-dialog-cancel" type="default" @click="closeDialog">{{ uiText.common.cancel }}</NButton>
          <NButton class="quick-dialog-action quick-dialog-submit" attr-type="submit" type="default" :disabled="!canSubmit">{{ uiText.common.save }}</NButton>
        </div>
      </form>
    </NModal>

    <NModal
      v-model:show="tagManagerOpen"
      preset="card"
      class="quick-dialog quick-tag-manager"
      :mask-closable="false"
      :title="uiText.quick.tagManage"
    >
      <div class="quick-tag-manager-body">
        <div v-if="tagDrafts.length" class="quick-tag-manager-list">
          <div
            v-for="tag in tagDrafts"
            :key="tag.id"
            class="quick-tag-manager-row"
          >
            <NInput
              v-model:value="tag.titleDraft"
              class="quick-tag-name-input"
              :placeholder="uiText.quick.tagName"
              autocomplete="off"
              @keydown.enter.prevent="saveTag(tag)"
            />
            <NButton
              class="quick-tag-save"
              type="default"
              :disabled="tag.titleDraft.trim().length === 0 || tag.titleDraft.trim() === tag.title"
              @click="saveTag(tag)"
            >
              {{ uiText.quick.saveTag }}
            </NButton>
            <button
              type="button"
              class="quick-tag-delete icon-button"
              :aria-label="uiText.quick.deleteTag"
              @click="deleteTag(tag.id, $event)"
            >
              <NIcon :component="TrashOutline" />
            </button>
          </div>
        </div>
        <p v-else class="quick-tag-empty">{{ uiText.quick.emptyTags }}</p>
        <div class="quick-tag-add-row">
          <NInput
            v-model:value="newTagTitle"
            class="quick-tag-new-input"
            :placeholder="uiText.quick.newTag"
            autocomplete="off"
            @keydown.enter.prevent="addTag"
          />
          <NButton
            class="quick-tag-add"
            type="default"
            :disabled="newTagTitle.trim().length === 0"
            @click="addTag"
          >
            {{ uiText.quick.addTag }}
          </NButton>
        </div>
        <div class="dialog-actions">
          <NButton class="quick-dialog-action" type="default" @click="closeTagManager">{{ uiText.common.cancel }}</NButton>
        </div>
      </div>
    </NModal>
  </section>
</template>

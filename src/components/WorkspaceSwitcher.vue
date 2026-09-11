<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { NPopover, NIcon } from "naive-ui";
import { ChevronDownOutline, AddOutline, CreateOutline, TrashOutline, DownloadOutline, CloudUploadOutline, CheckmarkOutline, PhonePortraitOutline } from "@vicons/ionicons5";
import { getUiText } from "../state/i18n";
import { DEFAULT_BOARD_TITLE } from "../state/defaults";
import { getWorkspaceBoardTitle } from "../state/workspaces";
import type { AppLanguage, ThemeMode, WorkspaceData } from "../types";
import miniDeskLogo from "../../static/img/mini-desk-cat.png?url";
import miniDeskDarkLogo from "../../static/img/mini-desk-cat-dark.png?url";

const props = defineProps<{
  workspaces: WorkspaceData[];
  activeWorkspaceId: string;
  theme: ThemeMode;
  language: AppLanguage;
}>();

const emit = defineEmits<{
  switch: [id: string];
  create: [];
  rename: [id: string, title: string, slogan: string];
  delete: [id: string, anchor: HTMLElement];
  reorder: [dragId: string, targetId: string];
  exportWorkspace: [id: string, anchor: HTMLElement];
  import: [anchor: HTMLElement];
  pairInbox: [id: string];
}>();

const text = computed(() => getUiText(props.language));
const open = ref(false);
const dragId = ref<string | null>(null);
let outsideClickGuard: ((event: MouseEvent) => void) | null = null;

const activeWorkspace = computed<WorkspaceData>(
  () => props.workspaces.find((workspace) => workspace.id === props.activeWorkspaceId) ?? props.workspaces[0],
);
const logoSrc = computed(() => (props.theme === "dark" ? miniDeskDarkLogo : miniDeskLogo));
const activeTitle = computed(() =>
  activeWorkspace.value ? getWorkspaceBoardTitle(activeWorkspace.value) : DEFAULT_BOARD_TITLE,
);
const activeSlogan = computed(() => activeWorkspace.value?.customTitles["board-slogan"]?.trim() ?? "");

function toggleOpen(): void {
  if (open.value) close();
  else open.value = true;
}

function close(): void {
  open.value = false;
}

// Outside-click handling that survives event propagation being stopped. Many
// board surfaces (todo list blank space, context menus, drop targets, …) call
// event.stopPropagation() on click, so a bubble-phase document listener never
// sees those clicks and the dropdown would stay open. Listening in the CAPTURE
// phase fires before any such handler runs, so any click outside the trigger
// and popover content closes the dropdown reliably. We exclude the trigger +
// popover content so the trigger stays a true toggle (a second click collapses
// instead of re-opening) with no overlap.
function attachOutsideClickGuard(): void {
  if (outsideClickGuard) return;
  outsideClickGuard = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-testid="workspace-trigger"]')) return;
    if (target.closest(".workspace-switcher")) return;
    close();
  };
  document.addEventListener("click", outsideClickGuard, true);
}

function detachOutsideClickGuard(): void {
  if (!outsideClickGuard) return;
  document.removeEventListener("click", outsideClickGuard, true);
  outsideClickGuard = null;
}

watch(open, (isOpen) => {
  // nextTick avoids catching the opening click itself.
  if (isOpen) void nextTick(attachOutsideClickGuard);
  else detachOutsideClickGuard();
});

onUnmounted(detachOutsideClickGuard);

function handleSwitch(id: string): void {
  if (id === props.activeWorkspaceId) {
    close();
    return;
  }
  emit("switch", id);
  close();
}

function handleDelete(event: MouseEvent, id: string): void {
  event.stopPropagation();
  const anchor = event.currentTarget as HTMLElement;
  emit("delete", id, anchor);
  close();
}

function handleExport(event: MouseEvent, id: string): void {
  event.stopPropagation();
  const anchor = event.currentTarget as HTMLElement;
  emit("exportWorkspace", id, anchor);
  close();
}

function handlePair(event: MouseEvent, id: string): void {
  event.stopPropagation();
  emit("pairInbox", id);
  close();
}

function handleRename(event: MouseEvent, id: string): void {
  event.stopPropagation();
  const workspace = props.workspaces.find((item) => item.id === id);
  emit("rename", id, workspace?.customTitles["board-title"] ?? "", workspace?.customTitles["board-slogan"] ?? "");
  close();
}

function handleImport(event: MouseEvent): void {
  event.stopPropagation();
  const anchor = event.currentTarget as HTMLElement;
  emit("import", anchor);
  close();
}

function onDragStart(id: string): void {
  dragId.value = id;
}

function onDrop(targetId: string): void {
  if (dragId.value && dragId.value !== targetId) emit("reorder", dragId.value, targetId);
  dragId.value = null;
}
</script>

<template>
  <NPopover
    trigger="manual"
    placement="bottom-start"
    :show="open"
    :width="264"
    :to="false"
    class="workspace-switcher-popover"
  >
    <template #trigger>
      <button
        type="button"
        class="workspace-trigger"
        data-testid="workspace-trigger"
        :aria-label="text.app.workspaces"
        :aria-expanded="open"
        @click="toggleOpen"
      >
        <span class="workspace-trigger-tile" aria-hidden="true">
          <img class="workspace-trigger-logo" :src="logoSrc" alt="" width="18" height="18" />
        </span>
        <span class="workspace-trigger-title">{{ activeTitle }}</span>
        <NIcon class="workspace-trigger-chevron" :component="ChevronDownOutline" size="13" />
      </button>
    </template>

    <div class="workspace-switcher" role="listbox" :aria-label="text.app.workspaces">
      <div class="workspace-switcher-header">
        <span class="workspace-switcher-header-tile" aria-hidden="true">
          <img class="workspace-switcher-header-logo" :src="logoSrc" alt="" width="24" height="24" />
        </span>
        <span class="workspace-switcher-header-text">
          <span class="workspace-switcher-header-title">{{ activeTitle }}</span>
          <span v-if="activeSlogan" class="workspace-switcher-header-slogan">{{ activeSlogan }}</span>
        </span>
      </div>

      <p class="workspace-switcher-section">{{ text.app.workspaces }}</p>

      <ul class="workspace-switcher-list">
        <li
          v-for="workspace in workspaces"
          :key="workspace.id"
          class="workspace-switcher-item"
          :class="{ 'is-active': workspace.id === activeWorkspaceId }"
          :data-testid="`workspace-option-${workspace.id}`"
          draggable="true"
          role="option"
          :aria-selected="workspace.id === activeWorkspaceId"
          @click="handleSwitch(workspace.id)"
          @dragstart="onDragStart(workspace.id)"
          @dragover.prevent
          @drop="onDrop(workspace.id)"
        >
          <span class="workspace-switcher-check" aria-hidden="true">
            <NIcon v-if="workspace.id === activeWorkspaceId" :component="CheckmarkOutline" size="13" />
          </span>
          <span class="workspace-switcher-name">
            {{ getWorkspaceBoardTitle(workspace) }}
          </span>
          <!-- 每个空间的操作直接平铺在行内（不再经「⋯」二级菜单）：导出/配对/重命名/删除。 -->
          <span class="workspace-switcher-actions">
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-export-${workspace.id}`"
              :aria-label="text.app.workspaceExportSingle"
              :title="text.app.workspaceExportSingle"
              @click.stop="handleExport($event, workspace.id)"
            >
              <NIcon :component="DownloadOutline" size="14" />
            </button>
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-pair-${workspace.id}`"
              :aria-label="text.app.inboxPair"
              :title="text.app.inboxPair"
              @click.stop="handlePair($event, workspace.id)"
            >
              <NIcon :component="PhonePortraitOutline" size="14" />
            </button>
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-rename-${workspace.id}`"
              :aria-label="text.common.rename"
              :title="text.common.rename"
              @click.stop="handleRename($event, workspace.id)"
            >
              <NIcon :component="CreateOutline" size="14" />
            </button>
            <button
              type="button"
              class="workspace-switcher-action is-delete"
              :data-testid="`workspace-delete-${workspace.id}`"
              :aria-label="text.common.delete"
              :title="text.common.delete"
              @click.stop="handleDelete($event, workspace.id)"
            >
              <NIcon :component="TrashOutline" size="14" />
            </button>
          </span>
        </li>
      </ul>

      <div class="workspace-switcher-footer">
        <button type="button" class="workspace-switcher-create" data-testid="workspace-create-button" @click="emit('create')">
          <NIcon :component="AddOutline" size="14" />
          <span>{{ text.app.newWorkspace }}</span>
        </button>
        <button
          type="button"
          class="workspace-switcher-import"
          data-testid="workspace-import-button"
          :aria-label="text.app.workspaceImport"
          @click="handleImport($event)"
        >
          <NIcon :component="CloudUploadOutline" size="14" />
          <span>{{ text.app.workspaceImport }}</span>
        </button>
      </div>
    </div>
  </NPopover>
</template>

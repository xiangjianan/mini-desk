<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { NPopover, NIcon } from "naive-ui";
import { ChevronDownOutline, AddOutline, CreateOutline, TrashOutline, DownloadOutline, CloudUploadOutline } from "@vicons/ionicons5";
import { getUiText } from "../state/i18n";
import type { AppLanguage, ThemeMode, WorkspaceData, ZoneKey } from "../types";
import ZoneVisibilityPopover from "./ZoneVisibilityPopover.vue";
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
  toggleZone: [workspaceId: string, zone: ZoneKey];
}>();

const text = computed(() => getUiText(props.language));
const open = ref(false);
const dragId = ref<string | null>(null);
let outsideClickGuard: ((event: MouseEvent) => void) | null = null;

const activeWorkspace = computed<WorkspaceData>(
  () => props.workspaces.find((workspace) => workspace.id === props.activeWorkspaceId) ?? props.workspaces[0],
);
const logoSrc = computed(() => (props.theme === "dark" ? miniDeskDarkLogo : miniDeskLogo));
const activeTitle = computed(() => activeWorkspace.value?.customTitles["board-title"]?.trim() || "Mini Desk");

function toggleOpen(): void {
  open.value = !open.value;
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
    // The per-workspace zone-visibility popover teleports to <body>, so it lives
    // outside .workspace-switcher; keep the switcher open while interacting with it.
    if (target.closest(".zone-visibility-popover")) return;
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
    :width="248"
    :to="false"
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
        <img class="workspace-trigger-logo" :src="logoSrc" alt="" aria-hidden="true" width="20" height="20" />
        <span class="workspace-trigger-title">{{ activeTitle }}</span>
        <NIcon :component="ChevronDownOutline" size="14" />
      </button>
    </template>

    <div class="workspace-switcher" role="listbox" :aria-label="text.app.workspaces">
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
          <span class="workspace-switcher-name">
            {{ workspace.customTitles["board-title"]?.trim() || "Mini Desk" }}
          </span>
          <span class="workspace-switcher-actions">
            <ZoneVisibilityPopover
              :visibility="workspace.zoneVisibility"
              :language="language"
              @toggle="emit('toggleZone', workspace.id, $event)"
            />
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-export-${workspace.id}`"
              :aria-label="text.app.workspaceExportSingle"
              @click="handleExport($event, workspace.id)"
            >
              <NIcon :component="DownloadOutline" size="14" />
            </button>
            <button
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-rename-${workspace.id}`"
              :aria-label="text.common.rename"
              @click.stop="emit('rename', workspace.id, workspace.customTitles['board-title'] ?? '', workspace.customTitles['board-slogan'] ?? ''); close()"
            >
              <NIcon :component="CreateOutline" size="14" />
            </button>
            <button
              type="button"
              class="workspace-switcher-action is-delete"
              :data-testid="`workspace-delete-${workspace.id}`"
              :aria-label="text.common.delete"
              @click="handleDelete($event, workspace.id)"
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

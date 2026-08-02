<script setup lang="ts">
import { computed, ref } from "vue";
import { NPopover, NIcon } from "naive-ui";
import { ChevronDownOutline, AddOutline, CreateOutline, TrashOutline, DownloadOutline } from "@vicons/ionicons5";
import { getUiText } from "../state/i18n";
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
  create: [title: string, slogan: string];
  rename: [id: string, title: string, slogan: string];
  delete: [id: string, anchor: HTMLElement];
  reorder: [dragId: string, targetId: string];
  exportWorkspace: [id: string, anchor: HTMLElement];
}>();

const text = computed(() => getUiText(props.language));
const open = ref(false);
const creating = ref(false);
const draftTitle = ref("");
const draftSlogan = ref("");
const dragId = ref<string | null>(null);

const activeWorkspace = computed<WorkspaceData>(
  () => props.workspaces.find((workspace) => workspace.id === props.activeWorkspaceId) ?? props.workspaces[0],
);
const logoSrc = computed(() => (props.theme === "dark" ? miniDeskDarkLogo : miniDeskLogo));
const activeTitle = computed(() => activeWorkspace.value?.customTitles["board-title"]?.trim() || "Mini Desk");

function toggleOpen(): void {
  open.value = !open.value;
  if (!open.value) resetCreate();
}

function close(): void {
  open.value = false;
  resetCreate();
}

function resetCreate(): void {
  creating.value = false;
  draftTitle.value = "";
  draftSlogan.value = "";
}

function handleSwitch(id: string): void {
  if (id === props.activeWorkspaceId) {
    close();
    return;
  }
  emit("switch", id);
  close();
}

function startCreate(): void {
  creating.value = true;
}

function confirmCreate(): void {
  const title = draftTitle.value.trim();
  if (!title) return;
  emit("create", title, draftSlogan.value);
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
    @clickoutside="close"
  >
    <template #trigger>
      <button
        type="button"
        class="workspace-trigger"
        data-testid="workspace-trigger"
        :aria-label="text.app.workspaces"
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
              v-if="workspaces.length > 1"
              type="button"
              class="workspace-switcher-action"
              :data-testid="`workspace-delete-${workspace.id}`"
              :aria-label="text.common.delete"
              @click="handleDelete($event, workspace.id)"
            >
              <NIcon :component="TrashOutline" size="14" />
            </button>
          </span>
        </li>
      </ul>

      <div v-if="!creating" class="workspace-switcher-footer">
        <button type="button" class="workspace-switcher-create" data-testid="workspace-create-button" @click="startCreate">
          <NIcon :component="AddOutline" size="14" />
          <span>{{ text.app.newWorkspace }}</span>
        </button>
      </div>

      <div v-else class="workspace-switcher-form">
        <label class="workspace-switcher-field">
          <span>{{ text.app.workspaceTitle }}</span>
          <input
            v-model="draftTitle"
            type="text"
            class="workspace-switcher-input"
            data-testid="workspace-title-input"
            :placeholder="text.app.workspaceTitlePlaceholder"
          />
        </label>
        <label class="workspace-switcher-field">
          <span>{{ text.app.workspaceSlogan }}</span>
          <input
            v-model="draftSlogan"
            type="text"
            class="workspace-switcher-input"
            data-testid="workspace-slogan-input"
            :placeholder="text.app.workspaceSloganPlaceholder"
          />
        </label>
        <div class="workspace-switcher-form-actions">
          <button type="button" class="workspace-switcher-cancel" @click="resetCreate">{{ text.common.cancel }}</button>
          <button
            type="button"
            class="workspace-switcher-confirm"
            data-testid="workspace-create-confirm"
            :disabled="!draftTitle.trim()"
            @click="confirmCreate"
          >
            {{ text.common.confirm }}
          </button>
        </div>
      </div>
    </div>
  </NPopover>
</template>

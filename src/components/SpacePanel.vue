<script setup lang="ts">
import { computed } from "vue";
import type { GuideKey, LineItem, WorkspaceSpace } from "../types";
import TextPanel from "./TextPanel.vue";

const props = defineProps<{
  spaces: WorkspaceSpace[];
  activeSpaceId: string;
}>();

const emit = defineEmits<{
  activate: [id: string];
  create: [];
  rename: [id: string, title: string];
  update: [id: string, lines: LineItem[]];
  delete: [id: string];
  focus: [key: GuideKey, element: HTMLElement];
  blur: [];
  guide: [key: GuideKey, anchor: HTMLElement, immediate?: boolean];
}>();

const activeSpace = computed(() =>
  props.spaces.find((space) => space.id === props.activeSpaceId) ?? props.spaces[0],
);

const canDeleteActiveSpace = computed(() => props.spaces.length > 1);

function handleRename(_titleId: string, title: string): void {
  if (!activeSpace.value) return;
  emit("rename", activeSpace.value.id, title);
}

function handleUpdate(lines: LineItem[]): void {
  if (!activeSpace.value) return;
  emit("update", activeSpace.value.id, lines);
}
</script>

<template>
  <section class="panel space-panel" aria-label="空间">
    <div class="space-tabs" role="tablist" aria-label="空间列表">
      <button
        v-for="space in spaces"
        :key="space.id"
        class="space-tab"
        :class="{ 'is-active': space.id === activeSpaceId }"
        type="button"
        role="tab"
        :aria-selected="space.id === activeSpaceId"
        @click="emit('activate', space.id)"
      >
        {{ space.title }}
      </button>
      <button
        class="space-add-button icon-button"
        type="button"
        aria-label="新增空间"
        @click="emit('create')"
      >
        +
      </button>
    </div>

    <TextPanel
      v-if="activeSpace"
      :key="activeSpace.id"
      class="space-text-panel"
      :title-id="`space-${activeSpace.id}-title`"
      :title="activeSpace.title"
      :lines="activeSpace.lines"
      placeholder="记录当前工作、资料或草稿，双击开始写"
      @title-update="handleRename"
      @update="handleUpdate"
      @focus="emit('focus', 'workspace', $event)"
      @guide="(anchor, immediate) => emit('guide', 'workspace', anchor, immediate)"
      @blur="emit('blur')"
    >
      <template #actions>
        <button
          class="space-delete-button icon-button"
          type="button"
          aria-label="删除空间"
          :disabled="!canDeleteActiveSpace"
          @click="activeSpace && emit('delete', activeSpace.id)"
        >
          ×
        </button>
      </template>
    </TextPanel>
  </section>
</template>

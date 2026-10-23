<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { AddOutline, ChevronDownOutline, ChevronUpOutline, CloseOutline, CreateOutline, RemoveOutline, TrashOutline } from "@vicons/ionicons5";
import { getUiText } from "../state/i18n";
import { ZOOM_STEP } from "../composables/useImageTransform";
import type { AppLanguage } from "../types";

const props = withDefaults(defineProps<{
  language?: AppLanguage;
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  canEdit?: boolean;
}>(), { language: "zh", canEdit: true });
const emit = defineEmits<{ navigate: [direction: number]; zoom: [delta: number]; edit: []; delete: [event: MouseEvent]; close: [] }>();
const uiText = computed(() => getUiText(props.language));
</script>

<template>
  <div class="preview-actions" role="toolbar" :aria-label="uiText.preview.help">
    <button
      type="button"
      class="preview-toolbar-button preview-nav-button is-previous"
      :aria-label="uiText.preview.previous"
      :aria-disabled="!canNavigatePrevious"
      :disabled="!canNavigatePrevious"
      @click.stop.prevent="emit('navigate', -1)"
      @keydown.enter.stop.prevent="emit('navigate', -1)"
      @keydown.space.stop.prevent="emit('close')"
    >
      <NIcon size="20">
        <ChevronUpOutline />
      </NIcon>
    </button>
    <button
      type="button"
      class="preview-toolbar-button preview-nav-button is-next"
      :aria-label="uiText.preview.next"
      :aria-disabled="!canNavigateNext"
      :disabled="!canNavigateNext"
      @click.stop.prevent="emit('navigate', 1)"
      @keydown.enter.stop.prevent="emit('navigate', 1)"
      @keydown.space.stop.prevent="emit('close')"
    >
      <NIcon size="20">
        <ChevronDownOutline />
      </NIcon>
    </button>
    <button type="button" class="preview-toolbar-button preview-zoom-button is-zoom-out" :aria-label="uiText.preview.zoomOut" @click.stop.prevent="emit('zoom', -ZOOM_STEP)">
      <NIcon size="18">
        <RemoveOutline />
      </NIcon>
    </button>
    <button type="button" class="preview-toolbar-button preview-zoom-button is-zoom-in" :aria-label="uiText.preview.zoomIn" @click.stop.prevent="emit('zoom', ZOOM_STEP)">
      <NIcon size="18">
        <AddOutline />
      </NIcon>
    </button>
    <button v-if="canEdit" type="button" class="preview-toolbar-button is-edit" :aria-label="uiText.common.edit" @click.stop.prevent="emit('edit')">
      <NIcon size="18">
        <CreateOutline />
      </NIcon>
    </button>
    <button type="button" class="preview-toolbar-button is-delete" :aria-label="uiText.common.delete" @click.stop.prevent="emit('delete', $event)">
      <NIcon size="18">
        <TrashOutline />
      </NIcon>
    </button>
    <button
      type="button"
      class="preview-toolbar-button is-close"
      :aria-label="uiText.preview.close"
      @click.stop.prevent="emit('close')"
      @keydown.enter.stop.prevent="emit('close')"
      @keydown.space.stop.prevent="emit('close')"
    >
      <NIcon size="18">
        <CloseOutline />
      </NIcon>
    </button>
  </div>
</template>

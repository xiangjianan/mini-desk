<script setup lang="ts">
import { computed } from "vue";
import { NDropdown } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { CONTEXT_MENU_Z_INDEX, organizeContextMenu } from "../utils/contextMenu";
const props = defineProps<{ x: number; y: number; options: DropdownOption[] }>();
const emit = defineEmits<{ select: [key: string]; clickoutside: [event?: Event] }>();
const organizedOptions = computed(() => organizeContextMenu(props.options));
</script>

<template>
  <NDropdown placement="bottom-start" trigger="manual" :show="true"
    :x="x" :y="y" :z-index="CONTEXT_MENU_Z_INDEX" :options="organizedOptions"
    @select="(key: string) => emit('select', key)" @clickoutside="(event?: Event) => emit('clickoutside', event)">
    <span class="dropdown-anchor" :style="{ left: `${x}px`, top: `${y}px` }" aria-hidden="true" />
  </NDropdown>
</template>

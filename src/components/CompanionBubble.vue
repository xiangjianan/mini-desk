<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { NButton, NPopover } from "naive-ui";

const props = defineProps<{
  visible: boolean;
  message: string;
  confirm?: boolean;
  position?: {
    right: string;
    bottom: string;
  };
}>();

const emit = defineEmits<{
  yes: [];
  no: [];
}>();

const POPOVER_DELAY_MS = 200;
const delayedPopoverVisible = ref(false);
const popoverTimer = ref<number | undefined>();

const placementStyle = computed(() => {
  if (!props.position) return undefined;
  return {
    right: props.position.right,
    bottom: props.position.bottom,
  };
});

const popoverVisible = computed(() => props.visible && Boolean(props.message || props.confirm));
const popoverKey = computed(() => `${props.position?.right ?? "default"}:${props.position?.bottom ?? "default"}`);

watch(
  popoverVisible,
  (visible) => {
    window.clearTimeout(popoverTimer.value);
    if (!visible) {
      delayedPopoverVisible.value = false;
      return;
    }
    popoverTimer.value = window.setTimeout(() => {
      delayedPopoverVisible.value = true;
    }, POPOVER_DELAY_MS);
  },
  { immediate: true },
);

onUnmounted(() => {
  window.clearTimeout(popoverTimer.value);
});
</script>

<template>
  <div
    class="focus-companion"
    :class="{ 'is-visible': visible }"
    :style="placementStyle"
    data-testid="companion-bubble"
    :aria-hidden="!visible"
  >
    <NPopover
      :key="popoverKey"
      trigger="manual"
      placement="top-end"
      :show="delayedPopoverVisible"
      :show-arrow="true"
      :arrow-point-to-center="true"
      :animated="true"
      :z-index="3300"
      class="companion-popover-shell"
      arrow-class="companion-popover-arrow"
      :style="{ maxWidth: '240px', '--n-box-shadow': 'none' }"
    >
      <template #trigger>
        <img src="/static/video/hermes.gif" alt="" />
      </template>

      <div v-if="message || confirm" class="companion-popover" role="status" aria-live="polite" data-testid="companion-confirm">
        <span>{{ message }}</span>
        <div v-if="confirm" class="companion-actions">
          <NButton size="tiny" type="primary" data-testid="companion-yes" @click="emit('yes')">是</NButton>
          <NButton size="tiny" quaternary data-testid="companion-no" @click="emit('no')">否</NButton>
        </div>
      </div>
    </NPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { NButton, NPopover } from "naive-ui";
import hermesGif from "../../static/video/hermes.gif?url";
import hermesDarkGif from "../../static/video/hermes-dark.gif?url";

const props = defineProps<{
  visible: boolean;
  message: string;
  confirm?: boolean;
  confirmText?: string;
  cancelText?: string;
  actionText?: string;
  theme?: "light" | "dark";
  position?: {
    right: string;
    bottom?: string;
    top?: string;
  };
}>();

const emit = defineEmits<{
  yes: [];
  no: [];
  action: [];
}>();

const POPOVER_DELAY_MS = 200;
const POPOVER_HIDE_CONTENT_MS = 260;
const GIF_MAX_VISIBLE_MS = 10000;
const GIF_FADE_MS = 260;
const delayedPopoverVisible = ref(false);
const retainingPopoverContent = ref(false);
const gifVisible = ref(false);
const gifFading = ref(false);
const renderedMessage = ref("");
const renderedConfirm = ref(false);
const renderedConfirmText = ref("是");
const renderedCancelText = ref("否");
const renderedActionText = ref("");
const popoverTimer = ref<number | undefined>();
const contentTimer = ref<number | undefined>();
const gifTimer = ref<number | undefined>();
const gifFadeTimer = ref<number | undefined>();

const placementStyle = computed(() => {
  if (!props.position) return undefined;
  return {
    right: props.position.right,
    bottom: props.position.bottom,
    top: props.position.top,
  };
});

const surfaceVisible = computed(() => props.visible && (gifVisible.value || gifFading.value));
const popoverVisible = computed(() => props.visible && gifVisible.value && Boolean(props.message || props.confirm));
const visiblePopover = computed(() => (delayedPopoverVisible.value && popoverVisible.value) || retainingPopoverContent.value);
const popoverContentVisible = computed(() => visiblePopover.value || retainingPopoverContent.value);
const popoverKey = computed(() => `${props.position?.right ?? "default"}:${props.position?.bottom ?? "default"}`);
const gifSrc = computed(() => (props.theme === "dark" ? hermesDarkGif : hermesGif));

watch(
  popoverVisible,
  (visible) => {
    window.clearTimeout(popoverTimer.value);
    window.clearTimeout(contentTimer.value);
    if (!visible) {
      delayedPopoverVisible.value = false;
      retainingPopoverContent.value = Boolean(renderedMessage.value || renderedConfirm.value || renderedActionText.value);
      contentTimer.value = window.setTimeout(() => {
        retainingPopoverContent.value = false;
        renderedMessage.value = "";
        renderedConfirm.value = false;
        renderedConfirmText.value = "是";
        renderedCancelText.value = "否";
        renderedActionText.value = "";
      }, POPOVER_HIDE_CONTENT_MS);
      return;
    }
    renderedMessage.value = props.message;
    renderedConfirm.value = Boolean(props.confirm);
    renderedConfirmText.value = props.confirmText ?? "是";
    renderedCancelText.value = props.cancelText ?? "否";
    renderedActionText.value = "";
    retainingPopoverContent.value = false;
    popoverTimer.value = window.setTimeout(() => {
      delayedPopoverVisible.value = true;
    }, POPOVER_DELAY_MS);
  },
  { immediate: true },
);

watch(
  () => [props.visible, props.message, props.confirm, props.position?.right, props.position?.bottom, props.position?.top] as const,
  ([visible]) => {
    window.clearTimeout(gifTimer.value);
    window.clearTimeout(gifFadeTimer.value);
    if (!visible) {
      gifVisible.value = false;
      gifFading.value = false;
      return;
    }
    gifVisible.value = true;
    gifFading.value = false;
    gifTimer.value = window.setTimeout(() => {
      gifVisible.value = false;
      gifFading.value = true;
      gifFadeTimer.value = window.setTimeout(() => {
        gifFading.value = false;
      }, GIF_FADE_MS);
    }, GIF_MAX_VISIBLE_MS);
  },
  { immediate: true },
);

watch(
  () => [props.message, props.confirm, props.confirmText, props.cancelText, props.actionText] as const,
  () => {
    if (!popoverVisible.value) return;
    renderedMessage.value = props.message;
    renderedConfirm.value = Boolean(props.confirm);
    renderedConfirmText.value = props.confirmText ?? "是";
    renderedCancelText.value = props.cancelText ?? "否";
    renderedActionText.value = "";
  },
);

onUnmounted(() => {
  window.clearTimeout(popoverTimer.value);
  window.clearTimeout(contentTimer.value);
  window.clearTimeout(gifTimer.value);
  window.clearTimeout(gifFadeTimer.value);
});
</script>

<template>
  <div
    v-if="surfaceVisible"
    class="focus-companion"
    :class="{ 'is-visible': gifVisible, 'is-fading': gifFading }"
    :style="placementStyle"
    data-testid="companion-bubble"
    :aria-hidden="!surfaceVisible"
  >
    <NPopover
      :key="popoverKey"
      trigger="manual"
      placement="top-end"
      :show="visiblePopover"
      :show-arrow="true"
      :arrow-point-to-center="true"
      :animated="false"
      :z-index="3300"
      class="companion-popover-shell"
      arrow-class="companion-popover-arrow"
      :style="{ maxWidth: '240px', '--n-box-shadow': 'none' }"
    >
      <template #trigger>
        <img :src="gifSrc" alt="" />
      </template>

      <div
        v-if="popoverContentVisible"
        class="companion-popover"
        :class="{ 'is-popover-fading': retainingPopoverContent }"
        role="status"
        aria-live="polite"
        data-testid="companion-confirm"
      >
        <span>{{ renderedMessage }}</span>
        <div v-if="renderedConfirm" class="companion-actions">
          <NButton size="tiny" class="companion-action-button" data-testid="companion-yes" @click="emit('yes')">{{ renderedConfirmText }}</NButton>
          <NButton size="tiny" class="companion-action-button" data-testid="companion-no" @click="emit('no')">{{ renderedCancelText }}</NButton>
        </div>
        <div v-else-if="renderedActionText" class="companion-actions">
          <NButton size="tiny" class="companion-action-button" data-testid="companion-action" @click="emit('action')">{{ renderedActionText }}</NButton>
        </div>
      </div>
    </NPopover>
  </div>
</template>

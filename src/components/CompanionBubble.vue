<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { LogoGithub } from "@vicons/ionicons5";
import { CloseOutline, EyeOffOutline } from "@vicons/ionicons5";
import { NButton, NDropdown, NIcon, NPopover } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import type { AppLanguage, CompanionGifTheme } from "../types";
import { getCompanionGifSrc } from "../state/companionGifThemes";
import { getUiText } from "../state/i18n";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";

const props = withDefaults(defineProps<{
  visible: boolean;
  message: string;
  linkText?: string;
  linkHref?: string;
  signatureText?: string;
  confirm?: boolean;
  confirmDanger?: boolean;
  confirmText?: string;
  cancelText?: string;
  actionText?: string;
  clearSignal?: number;
  persistent?: boolean;
  theme?: "light" | "dark";
  language?: AppLanguage;
  gifTheme?: CompanionGifTheme;
  customGifLightSrc?: string;
  customGifDarkSrc?: string;
  position?: {
    right: string;
    bottom?: string;
    top?: string;
  };
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  yes: [];
  no: [];
  action: [];
  pause: [];
  resume: [];
  gifThemeChange: [theme: string];
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
const renderedLinkText = ref("");
const renderedLinkHref = ref("");
const renderedSignatureText = ref("");
const renderedConfirm = ref(false);
const renderedConfirmDanger = ref(false);
const renderedConfirmText = ref("");
const renderedCancelText = ref("");
const renderedActionText = ref("");
const popoverTimer = ref<number | undefined>();
const contentTimer = ref<number | undefined>();
const gifTimer = ref<number | undefined>();
const gifFadeTimer = ref<number | undefined>();
const gifRemainingMs = ref(GIF_MAX_VISIBLE_MS);
const gifTimerStartedAt = ref(0);
const hoveringCompanion = ref(false);
const surfaceRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const uiText = computed(() => getUiText(props.language));

const gifMenu = ref<{ x: number; y: number } | null>(null);
const exclusiveMenu = createExclusiveContextMenu(() => { gifMenu.value = null; });

function renderGifMenuIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

const gifMenuOptions = computed<DropdownOption[]>(() => [
  { label: "不显示", key: "hide", icon: renderGifMenuIcon(EyeOffOutline) },
]);

function openGifMenu(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(gifMenu.value) });
  gifMenu.value = { x: event.clientX, y: event.clientY };
}

function onSurfaceContextmenu(event: MouseEvent): void {
  if (!shouldRenderGif.value) return;
  openGifMenu(event);
}

function handleGifMenuSelect(key: string): void {
  gifMenu.value = null;
  if (key === "hide") {
    emit("gifThemeChange", "none");
  }
}

const placementStyle = computed(() => {
  if (!props.position) return undefined;
  return {
    right: props.position.right,
    bottom: props.position.bottom,
    top: props.position.top,
  };
});

const activeGifTheme = computed(() => props.gifTheme ?? "ikun");
const gifSrc = computed(() =>
  getCompanionGifSrc(activeGifTheme.value, props.theme ?? "light", {
    light: props.customGifLightSrc,
    dark: props.customGifDarkSrc,
  }),
);
const shouldRenderGif = computed(() => Boolean(gifSrc.value));
const hasPopoverPayload = computed(() => Boolean(props.message || props.confirm || props.linkText || props.signatureText));
const surfaceVisible = computed(() => {
  if (!props.visible) return false;
  if (shouldRenderGif.value) return gifVisible.value || gifFading.value;
  return hasPopoverPayload.value || retainingPopoverContent.value;
});
const popoverVisible = computed(() => {
  if (!props.visible || !hasPopoverPayload.value) return false;
  return shouldRenderGif.value ? gifVisible.value : true;
});
const visiblePopover = computed(() => (delayedPopoverVisible.value && popoverVisible.value) || retainingPopoverContent.value);
const popoverContentVisible = computed(() => visiblePopover.value || retainingPopoverContent.value);
const popoverKey = computed(() => `${props.position?.right ?? "default"}:${props.position?.bottom ?? "default"}`);

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
        renderedLinkText.value = "";
        renderedLinkHref.value = "";
        renderedSignatureText.value = "";
        renderedConfirm.value = false;
        renderedConfirmDanger.value = false;
        renderedConfirmText.value = uiText.value.common.yes;
        renderedCancelText.value = uiText.value.common.no;
        renderedActionText.value = "";
      }, POPOVER_HIDE_CONTENT_MS);
      return;
    }
    renderedMessage.value = props.message;
    renderedLinkText.value = props.linkText ?? "";
    renderedLinkHref.value = props.linkHref ?? "";
    renderedSignatureText.value = props.signatureText ?? "";
    renderedConfirm.value = Boolean(props.confirm);
    renderedConfirmDanger.value = Boolean(props.confirmDanger);
    renderedConfirmText.value = props.confirmText ?? uiText.value.common.yes;
    renderedCancelText.value = props.cancelText ?? uiText.value.common.no;
    renderedActionText.value = "";
    retainingPopoverContent.value = false;
    popoverTimer.value = window.setTimeout(() => {
      delayedPopoverVisible.value = true;
    }, POPOVER_DELAY_MS);
  },
  { immediate: true },
);

watch(
  () =>
    [
      props.visible,
      props.message,
      props.linkText,
      props.linkHref,
      props.signatureText,
      props.confirm,
      props.confirmDanger,
      props.persistent,
      props.theme,
      props.language,
      props.gifTheme,
      props.customGifLightSrc,
      props.customGifDarkSrc,
      props.position?.right,
      props.position?.bottom,
      props.position?.top,
    ] as const,
  ([visible]) => {
    window.clearTimeout(gifTimer.value);
    window.clearTimeout(gifFadeTimer.value);
    gifTimer.value = undefined;
    gifFadeTimer.value = undefined;
    gifRemainingMs.value = GIF_MAX_VISIBLE_MS;
    gifTimerStartedAt.value = 0;
    if (!visible || !shouldRenderGif.value) {
      hoveringCompanion.value = false;
      gifVisible.value = false;
      gifFading.value = false;
      return;
    }
    gifVisible.value = true;
    gifFading.value = false;
    if (props.persistent) return;
    if (!hoveringCompanion.value) startGifTimer(GIF_MAX_VISIBLE_MS);
  },
  { immediate: true },
);

watch(
  () => [props.message, props.linkText, props.linkHref, props.confirm, props.confirmDanger, props.confirmText, props.cancelText, props.actionText, props.language] as const,
  () => {
    if (!popoverVisible.value) return;
    renderedMessage.value = props.message;
    renderedLinkText.value = props.linkText ?? "";
    renderedLinkHref.value = props.linkHref ?? "";
    renderedSignatureText.value = props.signatureText ?? "";
    renderedConfirm.value = Boolean(props.confirm);
    renderedConfirmDanger.value = Boolean(props.confirmDanger);
    renderedConfirmText.value = props.confirmText ?? uiText.value.common.yes;
    renderedCancelText.value = props.cancelText ?? uiText.value.common.no;
    renderedActionText.value = "";
  },
);

watch(
  () => props.clearSignal,
  () => {
    window.clearTimeout(popoverTimer.value);
    window.clearTimeout(contentTimer.value);
    delayedPopoverVisible.value = false;
    retainingPopoverContent.value = false;
    renderedMessage.value = "";
    renderedLinkText.value = "";
    renderedLinkHref.value = "";
    renderedSignatureText.value = "";
    renderedConfirm.value = false;
    renderedConfirmDanger.value = false;
    renderedConfirmText.value = uiText.value.common.yes;
    renderedCancelText.value = uiText.value.common.no;
    renderedActionText.value = "";
  },
);

onMounted(() => {
  exclusiveMenu.mount();
  window.addEventListener("mousemove", handleWindowMousemove);
});

onUnmounted(() => {
  exclusiveMenu.unmount();
  window.removeEventListener("mousemove", handleWindowMousemove);
  window.clearTimeout(popoverTimer.value);
  window.clearTimeout(contentTimer.value);
  window.clearTimeout(gifTimer.value);
  window.clearTimeout(gifFadeTimer.value);
});

function startGifTimer(duration: number): void {
  window.clearTimeout(gifTimer.value);
  gifRemainingMs.value = duration;
  gifTimerStartedAt.value = Date.now();
  gifTimer.value = window.setTimeout(finishGifTimer, duration);
}

function finishGifTimer(): void {
  gifTimer.value = undefined;
  gifRemainingMs.value = 0;
  gifTimerStartedAt.value = 0;
  gifVisible.value = false;
  gifFading.value = true;
  gifFadeTimer.value = window.setTimeout(() => {
    gifFading.value = false;
  }, GIF_FADE_MS);
}

function pauseGifTimer(): void {
  if (props.persistent || !gifVisible.value || !gifTimer.value) return;
  window.clearTimeout(gifTimer.value);
  gifTimer.value = undefined;
  const elapsed = Date.now() - gifTimerStartedAt.value;
  gifRemainingMs.value = Math.max(0, gifRemainingMs.value - elapsed);
  gifTimerStartedAt.value = 0;
}

function resumeGifTimer(): void {
  if (props.persistent || !gifVisible.value || gifFading.value || gifTimer.value) return;
  if (gifRemainingMs.value <= 0) {
    finishGifTimer();
    return;
  }
  startGifTimer(gifRemainingMs.value);
}

function handleCompanionMouseenter(): void {
  if (hoveringCompanion.value) return;
  hoveringCompanion.value = true;
  pauseGifTimer();
  emit("pause");
}

function handleCompanionMouseleave(): void {
  if (!hoveringCompanion.value) return;
  hoveringCompanion.value = false;
  resumeGifTimer();
  emit("resume");
}

function handleCompanionMousemove(): void {
  handleCompanionMouseenter();
}

function handleWindowMousemove(event: MouseEvent): void {
  if (!hoveringCompanion.value) return;
  if (isPointInsideElement(event.clientX, event.clientY, surfaceRef.value)) return;
  if (isPointInsideElement(event.clientX, event.clientY, popoverRef.value)) return;
  handleCompanionMouseleave();
}

function isPointInsideElement(x: number, y: number, element: HTMLElement | null): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
</script>

<template>
  <div
    v-if="surfaceVisible"
    ref="surfaceRef"
    class="focus-companion"
    :class="{ 'is-visible': gifVisible || (!shouldRenderGif && popoverVisible), 'is-fading': gifFading }"
    :style="placementStyle"
    data-testid="companion-bubble"
    :aria-hidden="!surfaceVisible"
    @mouseenter="handleCompanionMouseenter"
    @mousemove="handleCompanionMousemove"
    @mouseleave="handleCompanionMouseleave"
    @contextmenu="onSurfaceContextmenu"
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
      :class="['companion-popover-shell', { 'is-popover-fading': retainingPopoverContent }]"
      arrow-class="companion-popover-arrow"
      :style="{ maxWidth: '240px', '--n-box-shadow': 'none' }"
    >
      <template #trigger>
        <img v-if="shouldRenderGif" :src="gifSrc" alt="" />
        <span v-else class="companion-popover-anchor" aria-hidden="true" />
      </template>

      <div
        v-if="popoverContentVisible"
        ref="popoverRef"
        class="companion-popover"
        role="status"
        aria-live="polite"
        data-testid="companion-confirm"
        @mouseenter="handleCompanionMouseenter"
        @mousemove="handleCompanionMousemove"
        @mouseleave="handleCompanionMouseleave"
      >
        <span v-if="renderedMessage">{{ renderedMessage }}</span>
        <div v-if="renderedLinkText || renderedSignatureText" class="companion-meta-row">
          <a
            v-if="renderedLinkText && renderedLinkHref"
            class="companion-link"
            :href="renderedLinkHref"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="companion-link"
          >
            <NIcon class="companion-link-icon" :component="LogoGithub" />
            {{ renderedLinkText }}
            <span
              v-if="renderedSignatureText"
              class="companion-signature"
              data-testid="companion-signature"
            >
              {{ renderedSignatureText }}
            </span>
          </a>
        </div>
        <div v-if="renderedConfirm" class="companion-actions">
          <NButton size="tiny" class="companion-action-button" :class="{ 'is-danger': renderedConfirmDanger }" data-testid="companion-yes" @click="emit('yes')">{{ renderedConfirmText }}</NButton>
          <NButton size="tiny" class="companion-action-button" data-testid="companion-no" @click="emit('no')">{{ renderedCancelText }}</NButton>
        </div>
        <div v-else-if="renderedActionText" class="companion-actions">
          <NButton size="tiny" class="companion-action-button" data-testid="companion-action" @click="emit('action')">{{ renderedActionText }}</NButton>
        </div>
      </div>
    </NPopover>
    <NDropdown
      v-if="gifMenu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="gifMenu.x"
      :y="gifMenu.y"
      :z-index="CONTEXT_MENU_Z_INDEX"
      :options="gifMenuOptions"
      @select="handleGifMenuSelect"
      @clickoutside="exclusiveMenu.handleClickOutside"
    >
      <span class="dropdown-anchor" :style="{ left: `${gifMenu.x}px`, top: `${gifMenu.y}px` }" aria-hidden="true" />
    </NDropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  AlertCircleOutline,
  DesktopOutline,
  LinkOutline,
  MoonOutline,
  PhonePortraitOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import { NIcon } from "naive-ui";
import { getUiText } from "../state/i18n";
import { getCompanionNotificationIconSrc } from "../state/companionGifThemes";
import { formatInboxCode, normalizeInboxCode } from "../sync/pairing";
import type { AppLanguage } from "../types";

/**
 * 手机端首页壳（OpenDesign 移动端首页原型的 Vue 实现，文案已按「尽量简洁」精简）：
 * 未配对 = 桌面优先叙事 Hero + 三步引导 + 12 位分组输码卡；
 * 已配对 = 连接状态卡 + 速记卡（slot 注入 MobileInboxCapture）+ 同步提示卡。
 * 配对校验/换码/复制等逻辑留在 App.vue，本组件只做交互壳（输码分组、sheet 二次确认）。
 */
const props = defineProps<{
  code: string | null;
  checking: boolean;
  error: string | null;
  language: AppLanguage;
  theme: "light" | "dark";
}>();

const emit = defineEmits<{
  submit: [code: string];
  "clear-error": [];
  "change-code": [];
  "copy-code": [];
  theme: [];
}>();

const app = computed(() => getUiText(props.language).app);
const common = computed(() => getUiText(props.language).common);

/* ---------- 12 位配对码：3 组 × 4 位，归一化规则同 normalizeInboxCode ---------- */
const CODE_GROUPS = 3;
const groups = ref<string[]>(["", "", ""]);
/** 非响应式引用数组：仅用于聚焦/选区操作，不参与渲染。 */
const groupInputs: (HTMLInputElement | undefined)[] = [];

function setGroupInput(index: number, el: unknown): void {
  groupInputs[index] = (el as HTMLInputElement | null) ?? undefined;
}

const rawCode = computed(() => groups.value.join(""));
const isComplete = computed(() => rawCode.value.length === CODE_GROUPS * 4);

const pairedCodeText = computed(() => (props.code ? formatInboxCode(props.code) : ""));

/** 左上角品牌 logo：Mini Desk 像素猫（通知图标素材），随明暗主题切换配色。 */
const logoSrc = computed(() => getCompanionNotificationIconSrc("cat", props.theme));

/** 组内输入：归一化（去空白/大写/IL→1、O→0）截到 4 位；填满自动跳下一组。 */
function onGroupInput(index: number, event: Event): void {
  const input = event.target as HTMLInputElement;
  const next = normalizeInboxCode(input.value).slice(0, 4);
  groups.value = groups.value.map((value, i) => (i === index ? next : value));
  emit("clear-error");
  if (next.length === 4 && index < CODE_GROUPS - 1) groupInputs[index + 1]?.focus();
}

/** 组首退格：回到上一组末尾，避免空组间反复点击。 */
function onGroupKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === "Backspace" && groups.value[index] === "" && index > 0) {
    event.preventDefault();
    const prev = groupInputs[index - 1];
    prev?.focus();
    prev?.setSelectionRange(4, 4);
  }
}

/** 任意组粘贴整段配对码：归一化后按 4 位重新分配到三组。 */
function onGroupPaste(event: ClipboardEvent): void {
  event.preventDefault();
  const text = event.clipboardData?.getData("text") ?? "";
  const code = normalizeInboxCode(text).slice(0, CODE_GROUPS * 4);
  if (!code) return;
  groups.value = Array.from({ length: CODE_GROUPS }, (_, i) => code.slice(i * 4, i * 4 + 4));
  groupInputs[Math.min(Math.floor(code.length / 4), CODE_GROUPS - 1)]?.focus();
  emit("clear-error");
}

function submitCode(): void {
  if (props.checking || !isComplete.value) return;
  emit("submit", rawCode.value);
}

/** 联网校验失败（unknown/revoked/格式错误）就近回焦第一组，便于直接重输。 */
watch(
  () => props.error,
  (error) => {
    if (!error) return;
    const first = groupInputs[0];
    first?.focus();
    first?.select();
  },
);

/** 配对成功回到输码初始态（换码后保持空组等待新码）。 */
watch(
  () => props.code,
  (code) => {
    if (code) groups.value = ["", "", ""];
  },
);

/* ---------- 配对步骤（一行一条，文案驱动，见 i18n） ---------- */
const pairSteps = computed(() => [app.value.mobilePairStep1, app.value.mobilePairStep2, app.value.mobilePairStep3]);

/* ---------- 更换配对码：底部 sheet 二次确认（替代 window.confirm） ---------- */
const sheetOpen = ref(false);
const sheetCancelButton = ref<HTMLElement | null>(null);
const changeCodeButton = ref<HTMLButtonElement | null>(null);

function openSheet(): void {
  sheetOpen.value = true;
  void nextTick(() => sheetCancelButton.value?.focus());
}

function closeSheet(): void {
  sheetOpen.value = false;
  changeCodeButton.value?.focus();
}

function confirmSheet(): void {
  sheetOpen.value = false;
  emit("change-code");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && sheetOpen.value) closeSheet();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <main class="mobile-handoff" :aria-label="app.mobileLabel">
    <div class="mobile-home-page">
      <header class="mobile-home-topbar">
        <img class="mobile-home-logo" :src="logoSrc" alt="" aria-hidden="true" />
        <span class="mobile-home-brand mobile-handoff-title">{{ app.mobileTitle }}</span>
        <button class="mobile-home-theme" type="button" :aria-label="app.theme" :title="app.theme" @click="emit('theme')">
          <NIcon :component="theme === 'dark' ? SunnyOutline : MoonOutline" aria-hidden="true" />
        </button>
      </header>

      <div class="mobile-home-main">
        <!-- ============ 已配对：速记工作台 ============ -->
        <section v-if="code" class="mobile-home-view" aria-labelledby="mobile-inbox-heading">
          <div class="mobile-home-paired-block">
            <div class="mobile-home-paired-status">
              <span class="mobile-home-link-badge">
                <NIcon :component="LinkOutline" aria-hidden="true" />
                <i class="mobile-home-link-dot" aria-hidden="true"></i>
              </span>
              <span class="mobile-home-ps-field">
                <span class="mobile-home-ps-title">{{ app.mobilePairedTitle }}</span>
                <button
                  type="button"
                  class="mobile-home-ps-code"
                  data-testid="mobile-inbox-paired-code"
                  :title="app.mobileInboxCodeCopyHint"
                  @click="emit('copy-code')"
                >
                  {{ pairedCodeText }}
                </button>
              </span>
              <button
                ref="changeCodeButton"
                type="button"
                class="mobile-home-btn-quiet mobile-home-btn-sm"
                data-testid="mobile-inbox-change-code"
                @click="openSheet"
              >
                {{ app.mobileInboxChangeCode }}
              </button>
            </div>
            <p class="mobile-home-ps-note">{{ app.mobilePairedNote }}</p>
          </div>

          <!-- 速记卡由 App.vue 经默认 slot 注入（MobileInboxCapture，携带真实发送链路）。 -->
          <slot></slot>

          <div class="mobile-home-sync">
            <div class="mobile-home-sync-icons" aria-hidden="true">
              <NIcon :component="PhonePortraitOutline" />
              <span class="mobile-home-sync-dots"><i></i><i></i><i></i></span>
              <NIcon :component="DesktopOutline" />
            </div>
            <p>{{ app.mobileSyncNote }}</p>
          </div>
        </section>

        <!-- ============ 未配对：桌面优先叙事 + 快速配对 ============ -->
        <section v-else class="mobile-home-view mobile-home-view-unpaired" aria-labelledby="mobile-home-hero-title">
          <div class="mobile-home-hero">
            <p class="mobile-home-eyebrow">{{ app.mobileHeroEyebrow }}</p>
            <h1 id="mobile-home-hero-title" class="mobile-home-hero-title">{{ app.mobileHeroTitle }}</h1>
            <p class="mobile-home-lede">{{ app.mobileHeroLede }}</p>
            <!-- 桌面四栏工作台微缩示意（纯 CSS，对应 workbench-grid 的真实分区） -->
            <figure class="mobile-home-desk" aria-hidden="true">
              <div class="mobile-home-desk-chrome">
                <i class="mobile-home-wdot"></i><i class="mobile-home-wdot"></i><i class="mobile-home-wdot"></i>
                <span class="mobile-home-desk-pill"></span>
              </div>
              <div class="mobile-home-desk-grid">
                <div class="mobile-home-desk-col">
                  <span class="mobile-home-zone-label"><i class="mobile-home-zone" style="--zone: #007aff"></i>{{ app.mobileDeskZoneAssets }}</span>
                  <span class="mobile-home-tile"></span>
                  <span class="mobile-home-tile"></span>
                </div>
                <div class="mobile-home-desk-col">
                  <span class="mobile-home-zone-label"><i class="mobile-home-zone" style="--zone: #30c46a"></i>{{ app.mobileDeskZoneNotes }}</span>
                  <span class="mobile-home-qchip"></span>
                  <span class="mobile-home-qchip mobile-home-w70"></span>
                  <span class="mobile-home-sk mobile-home-w90"></span>
                  <span class="mobile-home-sk mobile-home-w58"></span>
                </div>
                <div class="mobile-home-desk-col">
                  <span class="mobile-home-zone-label"><i class="mobile-home-zone" style="--zone: #ff9f0a"></i>{{ app.mobileDeskZoneTasks }}</span>
                  <span class="mobile-home-cb-row"><i class="mobile-home-cb"></i><i class="mobile-home-sk mobile-home-w66"></i></span>
                  <span class="mobile-home-cb-row"><i class="mobile-home-cb"></i><i class="mobile-home-sk mobile-home-w46"></i></span>
                  <span class="mobile-home-cb-row is-done"><i class="mobile-home-cb is-on"></i><i class="mobile-home-sk mobile-home-w58"></i></span>
                </div>
                <div class="mobile-home-desk-col">
                  <span class="mobile-home-zone-label"><i class="mobile-home-zone" style="--zone: #af52de"></i>{{ app.mobileDeskZoneSpaces }}</span>
                  <span class="mobile-home-tab"></span>
                  <span class="mobile-home-sk mobile-home-w88"></span>
                  <span class="mobile-home-sk mobile-home-w70"></span>
                  <span class="mobile-home-cardline"></span>
                </div>
              </div>
              <figcaption class="mobile-home-desk-caption">
                <NIcon :component="DesktopOutline" aria-hidden="true" />
                <span>{{ app.mobileMessage }}</span>
              </figcaption>
            </figure>
          </div>

          <section class="mobile-home-pair" aria-labelledby="mobile-home-pair-title">
            <h2 id="mobile-home-pair-title" class="mobile-home-pair-title">{{ app.mobilePairTitle }}</h2>
            <ol class="mobile-home-steps">
              <li v-for="(step, index) in pairSteps" :key="index" class="mobile-home-step">
                <span class="mobile-home-step-no" aria-hidden="true">{{ index + 1 }}</span>
                <span class="mobile-home-step-body">{{ step }}</span>
              </li>
            </ol>

            <form class="mobile-home-card mobile-home-code-card" novalidate @submit.prevent="submitCode">
              <label class="mobile-home-field-label" for="mobile-inbox-code-g0">{{ app.mobileInboxEnterCode }}</label>
              <div class="mobile-home-code-groups" :class="{ 'is-error': Boolean(error) }">
                <template v-for="(_, index) in CODE_GROUPS" :key="index">
                  <input
                    :id="`mobile-inbox-code-g${index}`"
                    :ref="(el) => setGroupInput(index, el)"
                    :value="groups[index]"
                    class="mobile-home-code-input"
                    data-testid="mobile-inbox-code-input"
                    type="text"
                    maxlength="4"
                    inputmode="text"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    :placeholder="app.mobileInboxCodePlaceholder"
                    :aria-label="app.mobileInboxCodeGroupAria.replace('{n}', () => String(index + 1))"
                    :aria-invalid="error ? 'true' : undefined"
                    :aria-describedby="error ? 'mobile-inbox-code-error' : undefined"
                    @input="onGroupInput(index, $event)"
                    @keydown="onGroupKeydown(index, $event)"
                    @paste="onGroupPaste"
                  />
                  <span v-if="index < CODE_GROUPS - 1" class="mobile-home-cg-sep" aria-hidden="true"></span>
                </template>
              </div>
              <p
                v-if="error"
                id="mobile-inbox-code-error"
                class="mobile-home-field-error"
                role="alert"
                data-testid="mobile-inbox-code-error"
              >
                <NIcon :component="AlertCircleOutline" aria-hidden="true" />
                <span>{{ error }}</span>
              </p>
              <button
                class="mobile-home-primary"
                type="submit"
                data-testid="mobile-inbox-code-confirm"
                :class="{ 'is-loading': checking }"
                :disabled="!isComplete || checking"
              >
                <span class="mobile-home-spinner" aria-hidden="true"></span>
                <span>{{ checking ? app.mobileInboxChecking : app.mobileInboxCodeConfirm }}</span>
              </button>
              <p class="mobile-home-field-help">{{ app.mobileInboxCodeHelp }}</p>
            </form>
          </section>
        </section>
      </div>

      <footer class="mobile-home-foot">{{ app.mobileFoot }}</footer>
    </div>

    <!-- 更换配对码：底部 sheet 二次确认（确认动作回抛 App.vue 执行换码） -->
    <div class="mobile-home-sheet-scrim" :class="{ open: sheetOpen }" aria-hidden="true" @click="closeSheet"></div>
    <div class="mobile-home-sheet" :class="{ open: sheetOpen }" role="dialog" aria-modal="true" aria-labelledby="mobile-home-sheet-title">
      <span class="mobile-home-sheet-grab" aria-hidden="true"></span>
      <h3 id="mobile-home-sheet-title">{{ app.mobileInboxChangeCode }}</h3>
      <p>{{ app.mobileInboxChangeCodeConfirm }}</p>
      <div class="mobile-home-sheet-actions">
        <button ref="sheetCancelButton" type="button" class="mobile-home-btn-quiet" data-testid="mobile-home-sheet-cancel" @click="closeSheet">
          {{ common.cancel }}
        </button>
        <button type="button" class="mobile-home-btn-danger" data-testid="mobile-home-sheet-confirm" @click="confirmSheet">
          {{ app.mobileSheetConfirm }}
        </button>
      </div>
    </div>
  </main>
</template>

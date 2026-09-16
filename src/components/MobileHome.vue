<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  AlertCircleOutline,
  DesktopOutline,
  MoonOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import { NIcon } from "naive-ui";
import { getUiText } from "../state/i18n";
import { getCompanionNotificationIconSrc } from "../state/companionGifThemes";
import { maskInboxCode, normalizeInboxCode } from "../sync/pairing";
import type { AppLanguage } from "../types";

/** Mobile companion: a compact connection row and a full-height writing surface. */
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

/** 已配对态码展示：中间四位打码（防旁人窥屏），点按仍复制完整码（App.vue 侧 formatInboxCode）。 */
const pairedCodeText = computed(() => (props.code ? maskInboxCode(props.code) : ""));

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
    <!-- 已配对态挂 is-fill：整页恰好一屏不滚动，速记 textarea 弹性撑满剩余高度（见 styles.css）。 -->
    <div class="mobile-home-page" :class="{ 'is-fill': Boolean(code) }">
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
              <span class="mobile-home-connection-dot" aria-hidden="true"></span>
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
          </div>

          <!-- 速记卡由 App.vue 经默认 slot 注入（MobileInboxCapture，携带真实发送链路）。 -->
          <slot></slot>

          <div class="mobile-home-sync">
            <p>{{ app.mobileSyncNote }}</p>
          </div>
        </section>

        <!-- 未配对：先输码，按需展开帮助。 -->
        <section v-else class="mobile-home-view mobile-home-view-unpaired" aria-labelledby="mobile-home-hero-title">
          <div class="mobile-home-hero">
            <p class="mobile-home-eyebrow">{{ app.mobileHeroEyebrow }}</p>
            <h1 id="mobile-home-hero-title" class="mobile-home-hero-title">{{ app.mobileHeroTitle }}</h1>
            <p class="mobile-home-intro">{{ app.mobileCaptureSubtitle }}</p>
          </div>

          <section class="mobile-home-pair" aria-labelledby="mobile-home-pair-title">
            <h2 id="mobile-home-pair-title" class="mobile-home-pair-title">{{ app.mobilePairTitle }}</h2>
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
            </form>
            <details class="mobile-home-help">
              <summary>{{ app.mobilePairHelp }}</summary>
              <ol class="mobile-home-steps">
                <li v-for="(step, index) in pairSteps" :key="index" class="mobile-home-step">
                  <span class="mobile-home-step-no" aria-hidden="true">{{ index + 1 }}</span>
                  <span class="mobile-home-step-body">{{ step }}</span>
                </li>
              </ol>
            </details>
            <p class="mobile-home-desktop-note"><NIcon :component="DesktopOutline" aria-hidden="true" />{{ app.mobileMessage }}</p>
          </section>
        </section>
      </div>

      <footer v-if="!code" class="mobile-home-foot">{{ app.mobileFoot }}</footer>
    </div>

    <!-- 更换配对码：底部 sheet 二次确认（确认动作回抛 App.vue 执行换码） -->
    <!-- scrim 关闭淡出后即卸载（v-if）：iOS standalone 会采样顶部 fixed 元素的背景色涂状态栏且无视
         opacity，常驻 DOM 的半透明遮罩会让状态栏在关闭 sheet 后一直发灰。 -->
    <Transition name="mobile-home-scrim">
      <div v-if="sheetOpen" class="mobile-home-sheet-scrim" aria-hidden="true" @click="closeSheet"></div>
    </Transition>
    <div class="mobile-home-sheet" :class="{ open: sheetOpen }" role="dialog" :inert="!sheetOpen" :aria-hidden="!sheetOpen" aria-modal="true" aria-labelledby="mobile-home-sheet-title">
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

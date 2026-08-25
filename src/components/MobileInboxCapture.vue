<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { getUiText } from "../state/i18n";
import { createId } from "../state/storage";
import { INBOX_PLAINTEXT_MAX_CHARS } from "../sync/config";
import { encryptInboxPayload, inboxKeyHash, type InboxPlainItem } from "../sync/crypto";
import { postInboxItem, type InboxPostFailure } from "../sync/inboxClient";
import type { AppLanguage } from "../types";

const props = defineProps<{
  code: string;
  language: AppLanguage;
}>();

const emit = defineEmits<{ "change-code": [] }>();

type CaptureStatus = "idle" | "sending" | "sent" | "error";

const app = computed(() => getUiText(props.language).app);
const kind = ref<InboxPlainItem["kind"]>("todo");
// 草稿上提到父级（App.vue）：换码导致组件卸载重挂后内容不丢。
const draft = defineModel<string>({ default: "" });
const status = ref<CaptureStatus>("idle");
const errorText = ref("");
/** 仅 code_revoked 时为 true：错误区据此渲染「去更换配对码」入口。 */
const codeRevoked = ref(false);
const sentCount = ref(0);
const sentText = computed(() => app.value.mobileInboxSent.replace("{count}", () => String(sentCount.value)));
const placeholder = computed(() => (kind.value === "todo" ? app.value.mobileInboxPlaceholderTodo : app.value.mobileInboxPlaceholderNote));

const SENT_RESET_MS = 2500;
let sentResetTimer: number | undefined;

/** 触觉反馈：不支持的机型（iOS Safari）静默忽略。 */
function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

function clearSentResetTimer(): void {
  if (sentResetTimer !== undefined) {
    window.clearTimeout(sentResetTimer);
    sentResetTimer = undefined;
  }
}

function errorTextFor(reason: InboxPostFailure): string {
  switch (reason) {
    case "rate_limited":
      return app.value.mobileInboxErrorRateLimited;
    case "queue_full":
      return app.value.mobileInboxErrorQueueFull;
    case "too_large":
      return app.value.mobileInboxErrorTooLarge;
    case "code_revoked":
      return app.value.mobileInboxErrorRevoked;
    case "bad_request":
      return app.value.mobileInboxErrorBadRequest;
    case "server":
      return app.value.mobileInboxErrorServer;
    case "network":
      return app.value.mobileInboxErrorNetwork;
    default: {
      // 穷尽性校验：InboxPostFailure 新增成员而未补映射时，在此编译期报错。
      const exhaustive: never = reason;
      void exhaustive;
      return app.value.mobileInboxErrorNetwork;
    }
  }
}

/** 发送中再次触发直接忽略（同步判定，先于任何 await 生效）。
 *  多行输入按行拆分：待办每行一条、便签每行落一行（与桌面行编辑器模型一致）；
 *  逐条加密串行发送，中途失败把未发送的行放回输入框供直接重试。 */
async function send(): Promise<void> {
  const lines = draft.value
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, INBOX_PLAINTEXT_MAX_CHARS))
    .filter((line) => line.length > 0);
  if (lines.length === 0 || status.value === "sending") return;
  status.value = "sending";
  codeRevoked.value = false;
  clearSentResetTimer();
  /** 失败即停：未发送的行（含当前失败行）放回输入框，直接重试不会重复已成功的行。 */
  const failAt = (index: number, reason: InboxPostFailure): void => {
    status.value = "error";
    vibrate([40, 60, 40]);
    codeRevoked.value = reason === "code_revoked";
    errorText.value = errorTextFor(reason);
    draft.value = lines.slice(index).join("\n");
  };
  try {
    const keyHash = await inboxKeyHash(props.code);
    for (let index = 0; index < lines.length; index += 1) {
      try {
        const payload = await encryptInboxPayload(props.code, { kind: kind.value, text: lines[index], createdAt: Date.now() });
        const result = await postInboxItem(keyHash, createId(), payload);
        if (!result.ok) {
          failAt(index, result.reason);
          return;
        }
      } catch {
        // 加密/哈希异常与网络异常同等对待。
        failAt(index, "network");
        return;
      }
    }
  } catch {
    failAt(0, "network");
    return;
  }
  sentCount.value = lines.length;
  status.value = "sent";
  draft.value = "";
  vibrate(20);
  sentResetTimer = window.setTimeout(() => {
    // 仍在 sent 态才复位：期间用户再次发送会重置定时器。
    if (status.value === "sent") {
      status.value = "idle";
      sentCount.value = 0;
    }
  }, SENT_RESET_MS);
}

onBeforeUnmount(clearSentResetTimer);
</script>

<template>
  <div class="mobile-inbox-wrap">
    <h2 id="mobile-inbox-heading" class="mobile-inbox-heading">{{ app.mobileInboxHeading }}</h2>

    <div class="mobile-inbox-toggle" role="group" :aria-label="app.mobileInboxHeading">
      <button
        type="button"
        class="mobile-inbox-tab"
        :class="{ 'is-active': kind === 'todo' }"
        :aria-pressed="kind === 'todo'"
        data-testid="mobile-inbox-kind-todo"
        @click="kind = 'todo'"
      >
        {{ app.mobileInboxTodo }}
      </button>
      <button
        type="button"
        class="mobile-inbox-tab"
        :class="{ 'is-active': kind === 'note' }"
        :aria-pressed="kind === 'note'"
        data-testid="mobile-inbox-kind-note"
        @click="kind = 'note'"
      >
        {{ app.mobileInboxNote }}
      </button>
    </div>

    <form class="mobile-inbox-form" @submit.prevent="send">
      <textarea
        v-model="draft"
        class="mobile-inbox-textarea"
        data-testid="mobile-inbox-text"
        :placeholder="placeholder"
        :aria-label="placeholder"
        rows="5"
      ></textarea>
      <!-- textarea 内 Enter 是换行，提交只能经由本按钮；@submit.prevent 仅兜底防止未来误触发整页刷新。 -->
      <button
        type="button"
        class="mobile-inbox-send"
        :class="{ 'is-sent': status === 'sent' }"
        data-testid="mobile-inbox-send"
        :disabled="status === 'sending'"
        @click="send"
      >
        {{ status === "sending" ? app.mobileInboxSending : status === "sent" ? `✓ ${app.mobileInboxSentButton}` : app.mobileInboxSend }}
      </button>
    </form>

    <p v-if="status === 'sent'" class="mobile-inbox-status is-slide-in" role="status" aria-live="polite" data-status="sent">
      {{ sentText }}
    </p>
    <p
      v-else-if="status === 'error'"
      class="mobile-inbox-status is-shake"
      role="status"
      aria-live="polite"
      data-status="error"
      data-testid="mobile-inbox-error"
    >
      {{ errorText }}
    </p>

    <button
      v-if="status === 'error' && codeRevoked"
      type="button"
      class="mobile-inbox-revoked-change"
      data-testid="mobile-inbox-revoked-change"
      @click="emit('change-code')"
    >
      {{ app.mobileInboxRevokedChange }}
    </button>
  </div>
</template>

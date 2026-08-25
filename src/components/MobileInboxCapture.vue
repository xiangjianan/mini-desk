<script setup lang="ts">
import { computed, ref } from "vue";
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

type CaptureStatus = "idle" | "sending" | "sent" | "error";

const app = computed(() => getUiText(props.language).app);
const kind = ref<InboxPlainItem["kind"]>("todo");
const draft = ref("");
const status = ref<CaptureStatus>("idle");
const errorText = ref("");
const sentCount = ref(0);
const sentText = computed(() => app.value.mobileInboxSent.replace("{count}", () => String(sentCount.value)));

function errorTextFor(reason: InboxPostFailure): string {
  switch (reason) {
    case "rate_limited":
      return app.value.mobileInboxErrorRateLimited;
    case "queue_full":
      return app.value.mobileInboxErrorQueueFull;
    case "too_large":
      return app.value.mobileInboxErrorTooLarge;
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
  /** 失败即停：未发送的行（含当前失败行）放回输入框，直接重试不会重复已成功的行。 */
  const failAt = (index: number, message: string): void => {
    status.value = "error";
    errorText.value = message;
    draft.value = lines.slice(index).join("\n");
  };
  try {
    const keyHash = await inboxKeyHash(props.code);
    for (let index = 0; index < lines.length; index += 1) {
      try {
        const payload = await encryptInboxPayload(props.code, { kind: kind.value, text: lines[index], createdAt: Date.now() });
        const result = await postInboxItem(keyHash, createId(), payload);
        if (!result.ok) {
          failAt(index, errorTextFor(result.reason));
          return;
        }
      } catch {
        // 加密/哈希异常与网络异常同等对待。
        failAt(index, app.value.mobileInboxErrorNetwork);
        return;
      }
    }
  } catch {
    failAt(0, app.value.mobileInboxErrorNetwork);
    return;
  }
  sentCount.value = lines.length;
  status.value = "sent";
  draft.value = "";
}
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
        :placeholder="app.mobileInboxPlaceholder"
        :aria-label="app.mobileInboxPlaceholder"
        rows="5"
      ></textarea>
      <!-- textarea 内 Enter 是换行，提交只能经由本按钮；@submit.prevent 仅兜底防止未来误触发整页刷新。 -->
      <button
        type="button"
        class="mobile-inbox-send"
        data-testid="mobile-inbox-send"
        :disabled="status === 'sending'"
        @click="send"
      >
        {{ status === "sending" ? app.mobileInboxSending : app.mobileInboxSend }}
      </button>
    </form>

    <p v-if="status === 'sent'" class="mobile-inbox-status" role="status" aria-live="polite" data-status="sent">
      {{ sentText }}
    </p>
    <p
      v-else-if="status === 'error'"
      class="mobile-inbox-status"
      role="status"
      aria-live="polite"
      data-status="error"
      data-testid="mobile-inbox-error"
    >
      {{ errorText }}
    </p>
  </div>
</template>

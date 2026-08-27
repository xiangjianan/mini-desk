<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { ClipboardOutline, CreateOutline, NotificationsOutline } from "@vicons/ionicons5";
import { NIcon } from "naive-ui";
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
type CaptureKind = InboxPlainItem["kind"];

const app = computed(() => getUiText(props.language).app);
// 草稿上提到父级（App.vue）：换码导致组件卸载重挂后内容不丢。
const draft = defineModel<string>({ default: "" });
const status = ref<CaptureStatus>("idle");
/** sending/sent 态修饰哪个按钮：发送中/成功反馈只落在实际使用的那个按钮上。 */
const activeKind = ref<CaptureKind | null>(null);
const errorText = ref("");
/** code_revoked / unknown_code 时为 true：错误区据此渲染「去更换配对码」入口。 */
const codeUnusable = ref(false);
const sentCount = ref(0);
const sentText = computed(() => app.value.mobileInboxSent.replace("{count}", () => String(sentCount.value)));

/** 输入中实时预览「按行拆分」的条数：发送到提醒/便签都会把每一行当作一条记录逐条发送。
 *  只有 ≥2 行时才提示（单行即单条，无需解释），帮助用户建立多行=多条的心智模型。 */
const splitCount = computed(() =>
  draft.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length,
);
const showSplitHint = computed(() => splitCount.value >= 2);
const splitHintText = computed(() => app.value.mobileInboxSplitHint.replace("{count}", () => String(splitCount.value)));

const SENT_RESET_MS = 2500;
let sentResetTimer: number | undefined;

/** 触觉反馈：不支持的机型（iOS Safari）静默忽略。 */
function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

/** 一键粘贴的短暂提示（与发送状态区相互独立，避免互相覆盖）。 */
const pasteNotice = ref("");
let pasteNoticeTimer: number | undefined;

function clearPasteNotice(): void {
  if (pasteNoticeTimer !== undefined) {
    window.clearTimeout(pasteNoticeTimer);
    pasteNoticeTimer = undefined;
  }
}

function showPasteNotice(message: string): void {
  clearPasteNotice();
  pasteNotice.value = message;
  pasteNoticeTimer = window.setTimeout(() => {
    pasteNotice.value = "";
    pasteNoticeTimer = undefined;
  }, 2000);
}

/** 一键粘贴剪贴板内容：只写入草稿、不聚焦输入框，因此不会弹出键盘。
 *  已有内容时用换行分隔追加；剪贴板为空或读取失败（权限/不支持）时给出针对性提示。
 *  粘贴的多行文本仍会按行拆分成多条，页面上的「按行拆分」提示会随之实时更新。 */
async function pasteFromClipboard(): Promise<void> {
  if (status.value === "sending") return;
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
    showPasteNotice(app.value.mobileInboxPasteFailed);
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      showPasteNotice(app.value.mobileInboxPasteEmpty);
      return;
    }
    const separator = draft.value.length > 0 && !draft.value.endsWith("\n") ? "\n" : "";
    draft.value = draft.value + separator + text;
    vibrate(20);
    showPasteNotice(app.value.mobileInboxPasteDone);
  } catch {
    showPasteNotice(app.value.mobileInboxPasteFailed);
  }
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
    case "unknown_code":
      return app.value.mobileInboxErrorUnknown;
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
async function send(kind: CaptureKind): Promise<void> {
  const lines = draft.value
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, INBOX_PLAINTEXT_MAX_CHARS))
    .filter((line) => line.length > 0);
  if (lines.length === 0 || status.value === "sending") return;
  status.value = "sending";
  activeKind.value = kind;
  codeUnusable.value = false;
  clearSentResetTimer();
  /** 失败即停：未发送的行（含当前失败行）放回输入框，直接重试不会重复已成功的行。 */
  const failAt = (index: number, reason: InboxPostFailure): void => {
    status.value = "error";
    activeKind.value = null;
    vibrate([40, 60, 40]);
    codeUnusable.value = reason === "code_revoked" || reason === "unknown_code";
    errorText.value = errorTextFor(reason);
    draft.value = lines.slice(index).join("\n");
  };
  try {
    const keyHash = await inboxKeyHash(props.code);
    for (let index = 0; index < lines.length; index += 1) {
      try {
        const payload = await encryptInboxPayload(props.code, { kind, text: lines[index], createdAt: Date.now() });
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
      activeKind.value = null;
      sentCount.value = 0;
    }
  }, SENT_RESET_MS);
}

/** 发送中/成功反馈只修饰本次使用的按钮，另一个按钮保持自身文案。 */
function buttonLabel(kind: CaptureKind): string {
  if (activeKind.value === kind) {
    if (status.value === "sending") return app.value.mobileInboxSending;
    if (status.value === "sent") return `✓ ${app.value.mobileInboxSentButton}`;
  }
  return kind === "todo" ? app.value.mobileInboxSendTodo : app.value.mobileInboxSendNote;
}

onBeforeUnmount(() => {
  clearSentResetTimer();
  clearPasteNotice();
});
</script>

<template>
  <div class="mobile-inbox-wrap">
    <h2 id="mobile-inbox-heading" class="mobile-inbox-heading">{{ app.mobileInboxHeading }}</h2>

    <form class="mobile-inbox-form" @submit.prevent>
      <textarea
        v-model="draft"
        class="mobile-inbox-textarea"
        data-testid="mobile-inbox-text"
        :placeholder="app.mobileInboxPlaceholder"
        :aria-label="app.mobileInboxPlaceholder"
        rows="8"
      ></textarea>
      <!-- 多行输入会被按行拆成多条记录：≥2 行时给出实时提示，避免用户误以为整段只发一条。 -->
      <p v-if="showSplitHint" class="mobile-inbox-hint" data-testid="mobile-inbox-split-hint" aria-live="polite">
        {{ splitHintText }}
      </p>
      <!-- 目标类型由按钮直接携带：点「发送到提醒」或「发送到便签」；textarea 内 Enter 是换行，两个按钮均为 type="button"，@submit.prevent 仅兜底防止未来误触发整页刷新。 -->
      <div class="mobile-inbox-actions">
        <button
          type="button"
          class="mobile-inbox-send"
          :class="{ 'is-sent': status === 'sent' && activeKind === 'todo' }"
          data-testid="mobile-inbox-send-todo"
          :disabled="status === 'sending'"
          @click="send('todo')"
        >
          <NIcon :component="NotificationsOutline" aria-hidden="true" /><span>{{ buttonLabel("todo") }}</span>
        </button>
        <button
          type="button"
          class="mobile-inbox-send"
          :class="{ 'is-sent': status === 'sent' && activeKind === 'note' }"
          data-testid="mobile-inbox-send-note"
          :disabled="status === 'sending'"
          @click="send('note')"
        >
          <NIcon :component="CreateOutline" aria-hidden="true" /><span>{{ buttonLabel("note") }}</span>
        </button>
      </div>
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
      v-if="status === 'error' && codeUnusable"
      type="button"
      class="mobile-inbox-revoked-change"
      data-testid="mobile-inbox-revoked-change"
      @click="emit('change-code')"
    >
      {{ app.mobileInboxRevokedChange }}
    </button>

    <!-- 粘贴入口放在卡片底部：拇指顺手可点，不干扰上方输入与主发送动作 -->
    <button
      type="button"
      class="mobile-inbox-paste"
      data-testid="mobile-inbox-paste"
      :title="app.mobileInboxPaste"
      :aria-label="app.mobileInboxPaste"
      :disabled="status === 'sending'"
      @click="pasteFromClipboard"
    >
      <NIcon :component="ClipboardOutline" aria-hidden="true" /><span>{{ app.mobileInboxPaste }}</span>
    </button>

    <Transition name="mobile-inbox-toast">
      <p
        v-if="pasteNotice"
        class="mobile-inbox-copy-toast"
        role="status"
        aria-live="polite"
        data-testid="mobile-inbox-paste-toast"
      >
        {{ pasteNotice }}
      </p>
    </Transition>
  </div>
</template>

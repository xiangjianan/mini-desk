<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NButton, NIcon, NModal, NSelect } from "naive-ui";
import { CheckmarkOutline, CloseCircleOutline, CopyOutline } from "@vicons/ionicons5";
import QRCode from "qrcode";
import { buildInboxAddress, generateInboxCode, isValidInboxCode } from "../sync/pairing";
import { getDisplaySpaceTitle, getDisplayTodoListTitle, getUiText } from "../state/i18n";
import { copyTextToClipboard } from "../utils/clipboard";
import type { AppLanguage, WorkspaceData, WorkspaceInbox } from "../types";

type InboxOption = { label: string; value: string };

const props = defineProps<{
  workspace: WorkspaceData;
  language: AppLanguage;
}>();

const emit = defineEmits<{
  update: [inbox: WorkspaceInbox | null];
  close: [];
}>();

const text = computed(() => getUiText(props.language));
const show = ref(true);
const canvasRef = ref<HTMLCanvasElement | null>(null);
// 编辑草稿以 props 里的既有配对为初值；保存/清除时一次性 emit，取消则原样丢弃。
// 轮换例外：confirm 已承诺「旧地址立即失效」，确认后立即 emit 生效，弹窗保持打开供抄录/扫码。
const code = ref(props.workspace.inbox?.code ?? "");
const todoListId = ref(props.workspace.inbox?.todoListId ?? props.workspace.todoLists[0]?.id ?? "");
const noteTarget = ref(props.workspace.inbox?.noteTarget ?? props.workspace.spaces[0]?.id ?? "");

const hasCode = computed(() => isValidInboxCode(code.value));
const address = computed(() => (hasCode.value ? buildInboxAddress(code.value) : ""));
const todoOptions = computed<InboxOption[]>(() =>
  props.workspace.todoLists.map((list) => ({ label: getDisplayTodoListTitle(list, props.language), value: list.id })),
);
const noteOptions = computed<InboxOption[]>(() =>
  props.workspace.spaces.map((space) => ({ label: getDisplaySpaceTitle(space, props.language), value: space.id })),
);

function renderQr(): void {
  const canvas = canvasRef.value;
  if (!canvas || !address.value) return;
  try {
    // jsdom 无 2d canvas 上下文：二维码渲染失败时静默降级，地址文本始终兜底。
    void QRCode.toCanvas(canvas, address.value, { width: 148 }).catch(() => undefined);
  } catch {
    // 同步抛出同样静默。
  }
}

onMounted(renderQr);
// flush: "post" 保证地址变化后先等 canvas 挂载/更新再重绘。
watch(address, renderQr, { flush: "post" });
onBeforeUnmount(clearCopyResetTimer);

function generate(): void {
  code.value = generateInboxCode();
}

function buildInbox(): WorkspaceInbox {
  // 目标清单/空间可能已被删除：与 storage 层 normalize 一致，回退第一个。
  const fallbackListId = props.workspace.todoLists[0]?.id ?? "";
  const listId = todoOptions.value.some((option) => option.value === todoListId.value) ? todoListId.value : fallbackListId;
  const fallbackSpaceId = props.workspace.spaces[0]?.id ?? "";
  const target = noteOptions.value.some((option) => option.value === noteTarget.value) ? noteTarget.value : fallbackSpaceId;
  return {
    code: code.value,
    todoListId: listId,
    noteTarget: target,
    lastSeenAt: props.workspace.inbox?.lastSeenAt ?? 0,
  };
}

function rotate(): void {
  if (!window.confirm(text.value.app.inboxRotateConfirm)) return;
  // 确认即兑现「旧地址立即失效」：立即 emit 新码，持久化不等「保存」；弹窗保持打开。
  code.value = generateInboxCode();
  emit("update", buildInbox());
}

/** 配对码一键复制：图标短暂切为成功/失败标记，超时自动还原。 */
const COPY_FEEDBACK_MS = 1800;
type CopyState = "idle" | "ok" | "fail";
const copyState = ref<CopyState>("idle");
let copyResetTimer: number | undefined;

function clearCopyResetTimer(): void {
  if (copyResetTimer !== undefined) {
    window.clearTimeout(copyResetTimer);
    copyResetTimer = undefined;
  }
}

const copyIcon = computed(() =>
  copyState.value === "ok" ? CheckmarkOutline : copyState.value === "fail" ? CloseCircleOutline : CopyOutline,
);
const copyLabel = computed(() => {
  if (copyState.value === "ok") return text.value.app.inboxCopied;
  if (copyState.value === "fail") return text.value.app.inboxCopyFailed;
  return text.value.app.inboxCopyCode;
});

async function copyCode(): Promise<void> {
  const ok = await copyTextToClipboard(code.value);
  clearCopyResetTimer();
  copyState.value = ok ? "ok" : "fail";
  copyResetTimer = window.setTimeout(() => {
    copyState.value = "idle";
    copyResetTimer = undefined;
  }, COPY_FEEDBACK_MS);
}

function clear(): void {
  if (!window.confirm(text.value.app.inboxClearConfirm)) return;
  emit("update", null);
  emit("close");
}

function save(): void {
  if (!hasCode.value) return;
  emit("update", buildInbox());
  // 保存即完成：紧随关闭弹窗。
  emit("close");
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="text.app.inboxDialogTitle"
    style="max-width: min(360px, 92vw)"
    :mask-closable="false"
    @update:show="emit('close')"
  >
    <p class="workspace-inbox-intro">{{ text.app.inboxDialogIntro }}</p>
    <p class="workspace-inbox-hint">{{ text.app.inboxSyncHint }}</p>

    <div v-if="!hasCode" class="workspace-inbox-empty">
      <NButton type="primary" data-testid="inbox-generate" @click="generate">{{ text.app.inboxGenerate }}</NButton>
    </div>

    <template v-else>
      <div class="workspace-inbox-field">
        <span class="workspace-inbox-label">{{ text.app.inboxCodeLabel }}</span>
        <span class="workspace-inbox-code-row">
          <span class="workspace-inbox-code-group">
            <span class="workspace-inbox-code" data-testid="inbox-code">{{ code }}</span>
            <span class="workspace-inbox-copy-wrap">
              <button
                type="button"
                class="workspace-inbox-copy"
                :class="{ 'is-ok': copyState === 'ok', 'is-fail': copyState === 'fail' }"
                data-testid="inbox-copy"
                :aria-label="copyLabel"
                :title="copyLabel"
                @click="copyCode"
              >
                <NIcon :component="copyIcon" :size="14" />
              </button>
              <!-- 原生 title 在指针已悬停时属性变化不会重新弹出，成功/失败反馈由本气泡自动浮现。 -->
              <span
                v-if="copyState !== 'idle'"
                class="workspace-inbox-copy-hint"
                :class="{ 'is-fail': copyState === 'fail' }"
                role="status"
                aria-live="polite"
                data-testid="inbox-copy-hint"
              >
                {{ copyState === "ok" ? text.app.inboxCopied : text.app.inboxCopyFailed }}
              </span>
            </span>
          </span>
          <button
            type="button"
            class="workspace-inbox-rotate"
            data-testid="inbox-rotate"
            @click="rotate"
          >
            {{ text.app.inboxRotate }}
          </button>
        </span>
      </div>

      <div class="workspace-inbox-field">
        <span class="workspace-inbox-label">{{ text.app.inboxAddressLabel }}</span>
        <span class="workspace-inbox-address" data-testid="inbox-address">{{ address }}</span>
      </div>

      <canvas
        ref="canvasRef"
        class="workspace-inbox-qr"
        width="148"
        height="148"
        role="img"
        :aria-label="text.app.inboxAddressLabel"
      ></canvas>

      <label class="workspace-inbox-field" for="inbox-todo-target">
        <span class="workspace-inbox-label">{{ text.app.inboxTodoTargetLabel }}</span>
        <NSelect
          v-model:value="todoListId"
          data-testid="inbox-todo-target"
          :options="todoOptions"
          :input-props="{ id: 'inbox-todo-target' }"
        />
      </label>

      <label class="workspace-inbox-field" for="inbox-note-target">
        <span class="workspace-inbox-label">{{ text.app.inboxNoteTargetLabel }}</span>
        <NSelect
          v-model:value="noteTarget"
          data-testid="inbox-note-target"
          :options="noteOptions"
          :input-props="{ id: 'inbox-note-target' }"
        />
      </label>
    </template>

    <div class="workspace-inbox-footer">
      <NButton v-if="hasCode" quaternary type="error" data-testid="inbox-clear" @click="clear">
        {{ text.app.inboxClear }}
      </NButton>
      <NButton quaternary data-testid="inbox-close" @click="emit('close')">{{ text.app.inboxCancel }}</NButton>
      <NButton type="primary" data-testid="inbox-save" :disabled="!hasCode" @click="save">
        {{ text.app.inboxSave }}
      </NButton>
    </div>
  </NModal>
</template>

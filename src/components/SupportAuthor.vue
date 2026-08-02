<script setup lang="ts">
import { computed, ref } from "vue";
import { NButton, NInput, NModal } from "naive-ui";
import { getUiText } from "../state/i18n";
import type { AppLanguage } from "../types";
import wechatQr from "../../static/img/wechat.jpg?url";
import alipayQr from "../../static/img/alipay.jpg?url";

const props = withDefaults(defineProps<{
  show: boolean;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{ close: [] }>();

const text = computed(() => getUiText(props.language));

// Preset tip amounts in CNY. Selecting one is purely informational — the actual
// payment happens by scanning the WeChat / Alipay QR code below.
const TIP_AMOUNTS = [1, 3, 5, 10, 20] as const;
const selectedAmount = ref<number | null>(5);
const customAmount = ref("");

const customValue = computed<number | null>(() => {
  const parsed = Number.parseFloat(customAmount.value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
});

const activeAmount = computed<number | null>(() => customValue.value ?? selectedAmount.value);

const thanksMessage = computed(() => {
  const amount = activeAmount.value;
  if (amount) return text.value.support.thanksWithAmount.replaceAll("{amount}", String(amount));
  return text.value.support.thankYou;
});

function selectAmount(amount: number): void {
  selectedAmount.value = amount;
  customAmount.value = "";
}

function handleCustomInput(value: string): void {
  // Keep only digits and a single decimal separator so the field stays numeric.
  const sanitized = value.replace(/[^\d.]/g, "").replace(/^(\d*\.\d*).*$/, "$1");
  customAmount.value = sanitized;
  if (sanitized) selectedAmount.value = null;
}

function closeDialog(): void {
  emit("close");
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="support-dialog"
    :title="text.support.title"
    style="max-width: 420px"
    :mask-closable="false"
    @update:show="(value: boolean) => { if (!value) closeDialog() }"
  >
    <div class="support-content">
      <p class="support-description">{{ text.support.description }}</p>

      <div class="support-section">
        <span class="support-label">{{ text.support.chooseAmount }}</span>
        <div class="support-amounts">
          <NButton
            v-for="amount in TIP_AMOUNTS"
            :key="amount"
            size="small"
            :type="selectedAmount === amount && !customValue ? 'primary' : 'default'"
            @click="selectAmount(amount)"
          >
            ¥{{ amount }}
          </NButton>
          <NInput
            :value="customAmount"
            size="small"
            class="support-custom-input"
            :placeholder="text.support.customPlaceholder"
            @update:value="handleCustomInput"
          >
            <template #prefix>¥</template>
          </NInput>
        </div>
      </div>

      <div class="support-section">
        <span class="support-label">{{ text.support.scanToPay }}</span>
        <div class="support-codes">
          <figure class="support-code">
            <img :src="wechatQr" :alt="text.support.wechat" class="support-qr" />
            <figcaption>{{ text.support.wechat }}</figcaption>
          </figure>
          <figure class="support-code">
            <img :src="alipayQr" :alt="text.support.alipay" class="support-qr" />
            <figcaption>{{ text.support.alipay }}</figcaption>
          </figure>
        </div>
      </div>

      <p class="support-thanks">{{ thanksMessage }}</p>
    </div>

    <template #footer>
      <div class="support-footer">
        <NButton size="small" @click="closeDialog">{{ text.common.close }}</NButton>
      </div>
    </template>
  </NModal>
</template>

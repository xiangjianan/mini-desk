<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { NButton, NCheckbox, NInput, NModal } from 'naive-ui';
import type { AppLanguage } from '../types';
import type { CapacityProblem } from '../state/capacity';
import { fillCapacity, getCapacityText } from '../state/capacityText';
import { CAPACITY_MEMBERSHIP_AMOUNT, checkMembershipOrder, createMembershipOrder, getMembershipOffer, membershipConfigured, restoreMembership } from '../state/membership';
import type { MembershipOffer, MembershipOrder } from '../state/membership';
export interface CapacityChoice { id: string; text: string; src?: string }
const props = defineProps<{ show: boolean; language: AppLanguage; problem: CapacityProblem; items: CapacityChoice[]; storageError?: boolean; input?: boolean; draftText?: string; busy?: boolean }>();
const emit = defineEmits<{ close: []; tidy: []; submit: [ids: string[]]; discard: []; input: [text: string]; unlocked: []; retry: [] }>();
const text = computed(() => getCapacityText(props.language));
const selected = ref<string[]>([]);
const discarding = ref(false);
const remaining = computed(() => props.problem.limit === Number.MAX_SAFE_INTEGER ? props.items.length : Math.max(0, props.problem.limit - props.problem.current));
const message = computed(() => props.problem.limit === Number.MAX_SAFE_INTEGER ? text.value.unlocked : fillCapacity(text.value.full, { kind: text.value.kinds[props.problem.kind], unit: text.value.units[props.problem.kind], count: props.problem.current, limit: props.problem.limit }));
const paymentOpen = ref(false);
const offer = ref<MembershipOffer>();
const order = ref<MembershipOrder>();
const qr = ref('');
const error = ref('');
const loading = ref(false);
const restoreCode = ref('');
const clock = ref(Date.now());
const timer = window.setInterval(() => { clock.value = Date.now(); }, 1000);
onUnmounted(() => window.clearInterval(timer));
let epoch = 0;
watch(() => props.show, () => { selected.value = []; error.value = ''; discarding.value = false; loading.value = false; epoch++; });
watch(() => props.items, () => { selected.value = []; });
function toggle(id: string, checked: boolean) {
  if (props.busy) return;
  if (!checked) selected.value = selected.value.filter(value => value !== id);
  else if (selected.value.length < remaining.value) selected.value = [...selected.value, id];
}
async function openPayment() {
  paymentOpen.value = true;
  if (!membershipConfigured() || offer.value) return;
  const token = epoch;
  loading.value = true; error.value = '';
  try { const result = await getMembershipOffer(); if (token === epoch) offer.value = result; }
  catch { if (token === epoch) error.value = text.value.paymentError; }
  finally { if (token === epoch) loading.value = false; }
}
async function generateOrder() {
  if (!offer.value || loading.value) return;
  loading.value = true; error.value = '';
  const token = epoch;
  try {
    if (order.value && order.value.expiresAt <= Date.now()) localStorage.removeItem('mini-desk-capacity-order-key-v1');
    const result = await createMembershipOrder(offer.value);
    if (token !== epoch) return;
    // Preserve the recovery code before showing a payable code.
    localStorage.setItem('mini-desk-capacity-order-v1', JSON.stringify(result));
    order.value = result;
    const QRCode = await import('qrcode');
    const image = await QRCode.toDataURL(result.qrUrl, { width: 220, margin: 2 });
    if (token === epoch) qr.value = image;
  } catch { if (token === epoch) error.value = text.value.paymentError; }
  finally { if (token === epoch) loading.value = false; }
}
async function verifyPayment(restore = false) {
  if (loading.value) return;
  loading.value = true; error.value = '';
  const token = epoch;
  try {
    const ok = restore ? await restoreMembership(restoreCode.value) : order.value && await checkMembershipOrder(order.value);
    if (token !== epoch) return;
    if (ok) emit('unlocked'); else error.value = text.value.waiting;
  } catch { if (token === epoch) error.value = text.value.paymentError; }
  finally { if (token === epoch) loading.value = false; }
}
watch(paymentOpen, async (show) => {
  if (!show || order.value) return;
  const token = epoch;
  try {
    const saved = JSON.parse(localStorage.getItem('mini-desk-capacity-order-v1') ?? 'null');
    if (saved && typeof saved.id === 'string' && typeof saved.recoveryCode === 'string' && typeof saved.expiresAt === 'number' && typeof saved.qrUrl === 'string' && /^(weixin:\/\/|https:\/\/)/.test(saved.qrUrl)) {
      order.value = saved;
      if (saved.expiresAt > Date.now()) {
        const QRCode = await import('qrcode');
        const image = await QRCode.toDataURL(saved.qrUrl, { width: 220, margin: 2 });
        if (token === epoch) qr.value = image;
      }
    }
  } catch { /* Recovery remains available by code. */ }
});

async function copy() { try { await navigator.clipboard.writeText(props.items.map(item => item.text).join('\n') || props.draftText || ''); error.value = text.value.copied; } catch { error.value = text.value.storageError; } }
function download() {
  const url = URL.createObjectURL(new Blob([props.items.map(item => item.text).join('\n') || props.draftText || ''], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'minidesk-draft.txt'; a.click(); URL.revokeObjectURL(url);
}
</script>
<template>
  <NModal :show="show" preset="card" :title="text.title" class="capacity-dialog" style="width: min(560px, calc(100vw - 32px))" :mask-closable="!busy" @update:show="value => { if (!value) emit('close'); }">
    <div class="capacity-content" data-testid="capacity-dialog">
      <p class="capacity-reason">{{ message }}</p>
      <section v-if="problem.limit !== Number.MAX_SAFE_INTEGER" class="capacity-advice"><strong>{{ text.developer }}</strong><p>{{ text.advice }}</p><p>{{ text.choice }}</p></section>
      <p v-if="storageError" class="capacity-error" role="alert">{{ text.storageError }}</p>
      <template v-if="input"><label for="capacity-input">{{ text.input }}</label><NInput id="capacity-input" type="textarea" :value="draftText" :placeholder="text.placeholder" @update:value="value => emit('input', value)" /><NButton :disabled="!draftText?.trim() || busy" @click="emit('submit', [])">{{ text.submit }}</NButton></template>
      <template v-if="items.length">
        <p>{{ remaining ? fillCapacity(text.batch, { remaining, count: items.length }) : fillCapacity(text.queued, { count: items.length }) }}</p>
        <div class="capacity-choices"><div v-for="item in items" :key="item.id" class="capacity-choice" @click="toggle(item.id, !selected.includes(item.id))"><NCheckbox v-if="remaining > 0" :aria-label="item.text" @click.stop :checked="selected.includes(item.id)" :disabled="busy || (!selected.includes(item.id) && selected.length >= remaining)" @update:checked="checked => toggle(item.id, checked)" /><img v-if="item.src" :src="item.src" alt="" /><span>{{ item.text }}</span></div></div>
        <p v-if="remaining > 0" aria-live="polite">{{ fillCapacity(text.select, { count: selected.length, limit: remaining }) }}</p>
        <NButton v-if="remaining > 0" :disabled="!selected.length || busy" @click="emit('submit', selected)">{{ fillCapacity(text.add, { count: selected.length }) }}</NButton>
        <p class="capacity-muted">{{ text.retained }}</p>
      </template>
      <NButton v-if="!items.length && !input && remaining > 0" :disabled="busy" @click="emit('retry')">{{ text.retry }}</NButton>
      <div class="capacity-actions"><NButton type="primary" :disabled="busy" @click="emit('tidy')">{{ text.tidyKinds[problem.kind] }}</NButton><NButton v-if="problem.limit !== Number.MAX_SAFE_INTEGER" :disabled="loading || busy" @click="openPayment">{{ text.buy }}</NButton></div>
      <section v-if="paymentOpen" class="capacity-payment" data-testid="capacity-payment">
        <template v-if="!membershipConfigured()"><p>{{ text.purchase }}</p><strong>{{ new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'CNY' }).format(CAPACITY_MEMBERSHIP_AMOUNT / 100) }} · {{ text.once }} · {{ text.channel }}</strong><div class="capacity-qr-pending" role="status">{{ text.qrPending }}</div><p>{{ text.unavailable }}</p></template>
        <template v-else>
          <p>{{ text.purchase }}</p><template v-if="offer"><p>{{ offer.description }}</p><strong>{{ new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: offer.currency }).format(offer.amount / 100) }}</strong><a :href="offer.supportUrl" target="_blank" rel="noopener noreferrer">{{ text.restore }}</a></template>
          <NButton v-if="offer && (!order || clock >= order.expiresAt)" :disabled="loading" @click="generateOrder">{{ order ? text.retry : text.buy }}</NButton>
          <template v-if="order"><p v-if="clock >= order.expiresAt">{{ text.expired }}</p><img v-else-if="qr" class="capacity-qr" :src="qr" :alt="text.purchase" /><p>{{ text.recovery }}: <code>{{ order.recoveryCode }}</code></p><NButton :disabled="loading" @click="verifyPayment()">{{ text.checkPayment }}</NButton></template>
          <NInput v-model:value="restoreCode" :placeholder="text.recovery" /><NButton :disabled="!restoreCode.trim() || loading" @click="verifyPayment(true)">{{ text.restore }}</NButton>
          <p v-if="loading" role="status">{{ text.loading }}</p>
        </template>
      </section>
      <p v-if="error" role="alert" class="capacity-error">{{ error }}</p>
      <div v-if="items.length || draftText" class="capacity-actions"><NButton size="small" @click="copy">{{ text.copy }}</NButton><NButton size="small" @click="download">{{ text.download }}</NButton><NButton size="small" :disabled="busy" @click="discarding = true">{{ text.discard }}</NButton></div>
      <div v-if="discarding" role="alert"><p>{{ text.confirmDiscard }}</p><NButton type="error" @click="discarding = false; emit('discard')">{{ text.discard }}</NButton><NButton @click="discarding = false">{{ text.close }}</NButton></div>
      <p class="capacity-motto">Do less, do it well.</p>
    </div>
  </NModal>
</template>
<style scoped>
.capacity-content { max-height: min(72vh, 760px); overflow: auto; line-height: 1.65; overflow-wrap: anywhere; }
.capacity-reason { margin-top: 0; font-weight: 500; }
.capacity-advice { background: color-mix(in srgb, var(--n-text-color) 5%, transparent); border-radius: 12px; padding: 16px; margin: 16px 0; }
.capacity-advice strong { font-size: 15px; }.capacity-advice p:last-child { margin-bottom: 0; }
.capacity-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.capacity-choices { max-height: 220px; overflow: auto; display: grid; gap: 8px; }
.capacity-choice { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid color-mix(in srgb, var(--n-text-color) 15%, transparent); border-radius: 8px; }
.capacity-choice img { width: 56px; height: 48px; object-fit: contain; }.capacity-choice span { min-width: 0; white-space: pre-wrap; }
.capacity-muted, .capacity-motto { font-size: 12px; opacity: .7; }.capacity-motto { margin-bottom: 0; }
.capacity-error { color: var(--n-color-error, #c14444); }.capacity-payment { border-top: 1px solid #8884; padding-top: 12px; display: grid; gap: 10px; }.capacity-qr { max-width: 220px; width: 100%; }
.capacity-qr-pending { display: grid; place-items: center; width: min(180px, 100%); aspect-ratio: 1; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); }
</style>

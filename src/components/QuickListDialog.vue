<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { NButton, NInput, NModal } from 'naive-ui';
import type { InputInst } from 'naive-ui';
import type { AppLanguage, QuickTag } from '../types';
import { getUiText } from '../state/i18n';
import { TITLE_MAX_LENGTH, limitTitle } from '../state/titleLimits';
import { nextQuickColor, QUICK_COLORS } from '../state/quickColors';

const props = defineProps<{ language: AppLanguage; tags: QuickTag[] }>();
const emit = defineEmits<{ confirm: [payload: { id?: string; title: string; backgroundColor: string | null }] }>();
const text = computed(() => getUiText(props.language));
const show = ref(false);
const input = ref<InputInst | null>(null);
const id = ref<string>();
const title = ref('');
const color = ref<string | null>(null);
const customColor = ref('#80aed5');
const attempted = ref(false);
const duplicate = computed(() => props.tags.some(tag => tag.id !== id.value && tag.title.trim() === limitTitle(title.value)));
async function open(_anchor?: HTMLElement, tag?: QuickTag) {
  id.value = tag?.id;
  title.value = tag?.title ?? '';
  color.value = tag ? tag.backgroundColor ?? null : nextQuickColor(props.tags);
  customColor.value = color.value ?? '#80aed5';
  attempted.value = false;
  show.value = true;
  await nextTick();
  input.value?.focus();
}
function confirm() {
  attempted.value = true;
  const name = limitTitle(title.value);
  if (!name || duplicate.value) { input.value?.focus(); return; }
  emit('confirm', { id: id.value, title: name, backgroundColor: color.value });
  show.value = false;
}
defineExpose({ open });
</script>
<template>
  <NModal v-model:show="show" preset="card" class="quick-dialog quick-list-dialog" :mask-closable="false" :title="id ? text.quick.editList : text.quick.newList" :aria-label="id ? text.quick.editList : text.quick.newList">
    <form class="quick-form" autocomplete="off" @submit.prevent="confirm">
      <label><span>{{ text.quick.tagName }}</span><NInput ref="input" v-model:value="title" :maxlength="TITLE_MAX_LENGTH" show-count :status="attempted && duplicate ? 'error' : undefined" /></label>
      <p v-if="attempted && duplicate" role="alert">{{ text.todo.duplicateList }}</p>
      <fieldset class="quick-list-colors"><legend>{{ text.quick.buttonColor }}</legend>
        <button type="button" class="quick-color-none" :class="{ selected: color === null }" :aria-label="text.quick.noColor" :title="text.quick.noColor" :aria-pressed="color === null" @click="color = null">∅</button>
        <button v-for="swatch in QUICK_COLORS" :key="swatch" type="button" class="quick-color-swatch" :class="{ selected: color === swatch }" :style="{ '--quick-list-color': swatch }" :aria-label="swatch" :aria-pressed="color === swatch" @click="color = swatch" />
        <label class="quick-color-custom">{{ text.quick.customColor }} <span class="quick-color-custom-preview" :style="{ '--quick-list-color': customColor }"><input v-model="customColor" type="color" :aria-label="text.quick.customColor" @input="color = ($event.target as HTMLInputElement).value" /></span></label>
      </fieldset>
      <div class="dialog-actions"><NButton @click="show = false">{{ text.common.cancel }}</NButton><NButton class="quick-dialog-submit" attr-type="submit">{{ text.common.save }}</NButton></div>
    </form>
  </NModal>
</template>

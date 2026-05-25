<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

const props = defineProps<{
  id: string;
  value: string;
}>();

const emit = defineEmits<{
  update: [id: string, value: string];
}>();

const editing = ref(false);
const draft = ref(props.value);
const inputRef = ref<HTMLInputElement | null>(null);
const composing = ref(false);

watch(
  () => props.value,
  (value) => {
    draft.value = value;
  },
);

async function startEditing(event: MouseEvent): Promise<void> {
  event.preventDefault();
  composing.value = false;
  editing.value = true;
  await nextTick();
  const input = inputRef.value;
  if (!input) return;
  const caret = input.value.length;
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
  window.setTimeout(() => {
    if (document.activeElement === input) input.setSelectionRange(caret, caret);
  });
}

function commit(): void {
  const value = draft.value.trim() || props.value;
  composing.value = false;
  editing.value = false;
  emit("update", props.id, value);
}

function cancel(): void {
  composing.value = false;
  editing.value = false;
}

function handleEnter(event: KeyboardEvent): void {
  if (composing.value || event.isComposing || event.key === "Process" || event.keyCode === 229) return;
  event.preventDefault();
  commit();
}
</script>

<template>
  <input
    v-if="editing"
    ref="inputRef"
    v-model="draft"
    class="title-edit-input"
    @compositionstart="composing = true"
    @compositionend="composing = false"
    @keydown.enter="handleEnter"
    @keydown.esc.prevent="cancel"
    @blur="commit"
  />
  <span v-else class="editable-title" @dblclick="startEditing">{{ value }}</span>
</template>

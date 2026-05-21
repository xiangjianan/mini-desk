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

watch(
  () => props.value,
  (value) => {
    draft.value = value;
  },
);

async function startEditing(event: MouseEvent): Promise<void> {
  event.preventDefault();
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
  editing.value = false;
  emit("update", props.id, value);
}
</script>

<template>
  <input
    v-if="editing"
    ref="inputRef"
    v-model="draft"
    class="title-edit-input"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="editing = false"
    @blur="commit"
  />
  <span v-else class="editable-title" @dblclick="startEditing">{{ value }}</span>
</template>

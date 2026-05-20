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

async function startEditing(): Promise<void> {
  editing.value = true;
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
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

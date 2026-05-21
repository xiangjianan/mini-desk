<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { LineItem } from "../types";
import { editorTextToLines, handleTextareaTab, insertIndentedLineBreak, textLinesToEditorText } from "../utils/textEditor";
import EditableTitle from "./EditableTitle.vue";

const props = defineProps<{
  titleId: string;
  title: string;
  lines: LineItem[];
  placeholder?: string;
  split?: boolean;
}>();

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  update: [lines: LineItem[]];
  focus: [element: HTMLElement];
  blur: [element: HTMLElement];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const text = ref(textLinesToEditorText(props.lines));
const focused = ref(false);
const editing = ref(false);

watch(
  () => props.lines,
  (lines) => {
    const next = textLinesToEditorText(lines);
    if (next !== text.value) text.value = next;
  },
  { deep: true },
);

const textPanelClasses = computed(() => ({
  panel: !props.split,
  "is-focused": focused.value,
  "split-block": props.split,
}));

function update(): void {
  if (!editing.value) return;
  emit("update", editorTextToLines(text.value));
}

function handleKeydown(event: KeyboardEvent): void {
  const textarea = textareaRef.value;
  if (!textarea) return;
  if (!editing.value) return;
  if (event.isComposing || event.key === "Process" || event.keyCode === 229) return;
  if (event.key === "Tab") {
    event.preventDefault();
    text.value = handleTextareaTab(textarea, event.shiftKey);
    update();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    text.value = insertIndentedLineBreak(textarea);
    nextTick(() => update());
  }
}

function handleFocus(event: FocusEvent): void {
  focused.value = true;
  emit("focus", event.currentTarget as HTMLElement);
}

function handleBlur(event: FocusEvent): void {
  focused.value = false;
  if (editing.value) update();
  editing.value = false;
  emit("blur", event.currentTarget as HTMLElement);
}

async function startEditing(): Promise<void> {
  editing.value = true;
  await nextTick();
  textareaRef.value?.focus();
}
</script>

<template>
  <section class="text-panel" :class="textPanelClasses">
    <div class="panel-header">
      <h2>
        <EditableTitle :id="titleId" :value="title" @update="(id, value) => emit('titleUpdate', id, value)" />
      </h2>
      <slot name="actions" />
    </div>
    <div class="text-editor-frame">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="text-editor-textarea board-textarea large-textarea"
        :placeholder="placeholder"
        :readonly="!editing"
        spellcheck="false"
        @input="update"
        @keydown="handleKeydown"
        @dblclick="startEditing"
        @focus="handleFocus"
        @blur="handleBlur"
      />
    </div>
  </section>
</template>

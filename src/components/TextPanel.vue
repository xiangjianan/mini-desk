<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { NDropdown } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import type { LineItem } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
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
  guide: [element: HTMLElement];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const text = ref(textLinesToEditorText(props.lines));
const focused = ref(false);
const editing = ref(false);
const lastCaret = ref<number | null>(null);
const menu = ref<{ x: number; y: number; anchor: HTMLElement } | null>(null);
const guideMenuOption: DropdownOption = { ...GUIDE_MENU_OPTION, label: GUIDE_MENU_OPTION.label || "使用指南" };
const menuOptions: DropdownOption[] = [guideMenuOption];

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

async function startEditing(event: MouseEvent): Promise<void> {
  event.preventDefault();
  const textarea = event.currentTarget as HTMLTextAreaElement;
  const caret = lastCaret.value ?? textarea.selectionStart ?? textarea.value.length;
  editing.value = true;
  await nextTick();
  textareaRef.value?.focus({ preventScroll: true });
  if (textareaRef.value) collapseSelection(textareaRef.value, caret);
}

function rememberCaret(event: MouseEvent): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (textarea.selectionStart !== textarea.selectionEnd) return;
  lastCaret.value = textarea.selectionStart ?? textarea.value.length;
}

function openGuideMenu(event: MouseEvent): void {
  event.preventDefault();
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    anchor: event.currentTarget as HTMLElement,
  };
}

function closeMenu(): void {
  menu.value = null;
}

function handleMenuSelect(key: string): void {
  const anchor = menu.value?.anchor;
  closeMenu();
  if (key === "guide" && anchor) emit("guide", anchor);
}

function collapseSelection(textarea: HTMLTextAreaElement, caret: number): void {
  const position = Math.max(0, Math.min(caret, textarea.value.length));
  textarea.setSelectionRange(position, position);
  window.setTimeout(() => {
    if (document.activeElement === textarea) textarea.setSelectionRange(position, position);
  });
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
    <div class="text-editor-frame" @contextmenu.prevent="openGuideMenu">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="text-editor-textarea board-textarea large-textarea"
        :placeholder="placeholder"
        :readonly="!editing"
        spellcheck="false"
        @input="update"
        @keydown="handleKeydown"
        @mouseup="rememberCaret"
        @dblclick="startEditing"
        @focus="handleFocus"
        @blur="handleBlur"
      />
    </div>
    <NDropdown
      v-if="menu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="menu.x"
      :y="menu.y"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="closeMenu"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>

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

const TOUCH_DOUBLE_TAP_MS = 360;

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  update: [lines: LineItem[]];
  focus: [element: HTMLElement];
  blur: [element: HTMLElement];
  guide: [element: HTMLElement, immediate?: boolean];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const text = ref(textLinesToEditorText(props.lines));
const focused = ref(false);
const editing = ref(false);
const lastCaret = ref<number | null>(null);
const lastTouchEndAt = ref<number | null>(null);
const lastTextSelection = ref<{ start: number; end: number } | null>(null);
const menu = ref<{
  x: number;
  y: number;
  anchor: HTMLElement;
  target?: HTMLTextAreaElement;
  canPaste?: boolean;
} | null>(null);
const guideMenuOption: DropdownOption = { ...GUIDE_MENU_OPTION, label: GUIDE_MENU_OPTION.label || "使用指南" };
const menuOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [];
  const target = menu.value?.target;
  if (target) {
    options.push({ label: "复制", key: "copy", disabled: !canCopyTextSelection(target) });
    options.push({ label: "粘贴", key: "paste", disabled: !menu.value?.canPaste });
  }
  options.push(guideMenuOption);
  return options;
});

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
  const textarea = event.currentTarget as HTMLTextAreaElement;
  startEditingFromTextarea(textarea);
  await nextTick();
  const caret = lastCaret.value ?? textarea.selectionStart ?? textarea.value.length;
  textareaRef.value?.focus({ preventScroll: true });
  if (textareaRef.value) collapseSelection(textareaRef.value, caret);
  lastTextSelection.value = null;
}

function handleTouchEnd(event: TouchEvent): void {
  const now = Date.now();
  const previousTouchEndAt = lastTouchEndAt.value;
  lastTouchEndAt.value = now;
  if (previousTouchEndAt === null || now - previousTouchEndAt >= TOUCH_DOUBLE_TAP_MS) return;
  startEditingFromTextarea(event.currentTarget as HTMLTextAreaElement);
}

function startEditingFromTextarea(textarea: HTMLTextAreaElement): void {
  const caret = lastCaret.value ?? textarea.selectionStart ?? textarea.value.length;
  editing.value = true;
  unlockTextareaForMobileKeyboard(textarea, caret);
}

function unlockTextareaForMobileKeyboard(textarea: HTMLTextAreaElement, caret: number): void {
  textarea.readOnly = false;
  textarea.removeAttribute("readonly");
  textarea.focus({ preventScroll: true });
  collapseSelection(textarea, caret);
}

function rememberCaret(event: MouseEvent): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (hasSelection(textarea)) {
    rememberTextSelection(textarea);
    return;
  }
  if (event.button !== 2) lastTextSelection.value = null;
  lastCaret.value = textarea.selectionStart ?? textarea.value.length;
}

function rememberSelection(event: Event): void {
  rememberTextSelection(event.currentTarget as HTMLTextAreaElement);
}

function openTextMenu(event: MouseEvent): void {
  event.preventDefault();
  const target = event.target instanceof HTMLTextAreaElement ? event.target : undefined;
  menu.value = {
    x: event.clientX,
    y: event.clientY,
    anchor: event.currentTarget as HTMLElement,
    target,
    canPaste: target ? canPasteText(target) : false,
  };
}

function closeMenu(): void {
  menu.value = null;
}

async function handleMenuSelect(key: string): Promise<void> {
  const current = menu.value;
  const anchor = current?.anchor;
  const target = current?.target;
  const canPaste = Boolean(current?.canPaste);
  closeMenu();
  if (key === "copy" && target) {
    if (!canCopyTextSelection(target)) return;
    await copyTextSelection(target);
    return;
  }
  if (key === "paste" && target) {
    if (!canPaste) return;
    await pasteTextFromClipboard(target);
    return;
  }
  if (key === "guide" && anchor) emit("guide", anchor, true);
}

function hasSelection(target: HTMLTextAreaElement | HTMLInputElement): boolean {
  return (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
}

function rememberTextSelection(target: HTMLTextAreaElement): void {
  if (!hasSelection(target)) return;
  lastTextSelection.value = {
    start: target.selectionStart ?? 0,
    end: target.selectionEnd ?? 0,
  };
}

function getTextSelectionRange(target: HTMLTextAreaElement): { start: number; end: number } {
  if (hasSelection(target)) {
    return {
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
    };
  }
  const fallback = lastTextSelection.value;
  if (fallback && fallback.start !== fallback.end && fallback.end <= target.value.length) return fallback;
  const caret = target.selectionStart ?? 0;
  return { start: caret, end: caret };
}

function canCopyTextSelection(target: HTMLTextAreaElement): boolean {
  const range = getTextSelectionRange(target);
  return range.start !== range.end;
}

function canPasteText(target: HTMLTextAreaElement): boolean {
  return editing.value && !target.readOnly;
}

async function copyTextSelection(target: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
  const { start, end } = target instanceof HTMLTextAreaElement
    ? getTextSelectionRange(target)
    : { start: target.selectionStart ?? 0, end: target.selectionEnd ?? target.selectionStart ?? 0 };
  const selectedText = target.value.slice(start, end);
  if (!selectedText) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(selectedText);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = selectedText;
  document.body.append(textarea);
  textarea.setSelectionRange(0, textarea.value.length);
  document.execCommand("copy");
  textarea.remove();
}

async function pasteTextFromClipboard(target: HTMLTextAreaElement): Promise<void> {
  const pastedText = await navigator.clipboard?.readText?.();
  if (!pastedText) return;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  target.setRangeText(pastedText, start, end, "end");
  text.value = target.value;
  emit("update", editorTextToLines(text.value));
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
    <div class="text-editor-frame" @contextmenu.prevent="openTextMenu">
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
        @touchend="handleTouchEnd"
        @select="rememberSelection"
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

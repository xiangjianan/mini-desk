<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Component, VNode } from "vue";
import { NDropdown, NIcon, NScrollbar } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import { ClipboardOutline, CopyOutline, HelpCircleOutline } from "@vicons/ionicons5";
import type { LineItem } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getUiText } from "../state/i18n";
import type { AppLanguage } from "../types";
import {
  editorTextToLines,
  handleTextareaTab,
  insertIndentedLineBreak,
  insertPlainLineBreak,
  outdentEmptyIndentedLine,
  renumberOrderedListText,
  textLinesToEditorText,
} from "../utils/textEditor";
import { CONTEXT_MENU_Z_INDEX, createExclusiveContextMenu } from "../utils/contextMenu";
import EditableTitle from "./EditableTitle.vue";

const props = withDefaults(defineProps<{
  titleId: string;
  title: string;
  lines: LineItem[];
  placeholder?: string;
  split?: boolean;
  hideHeader?: boolean;
  language?: AppLanguage;
}>(), {
  language: "zh",
});

const emit = defineEmits<{
  titleUpdate: [id: string, value: string];
  update: [lines: LineItem[]];
  focus: [element: HTMLElement];
  blur: [element: HTMLElement];
  guide: [element: HTMLElement, immediate?: boolean];
}>();

const isDragHover = ref(false);
const isLocalDrag = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const text = ref(textLinesToEditorText(props.lines));
const focused = ref(false);
const editing = ref(false);
const titleRef = ref<{ openMenuAt: (x: number, y: number, event?: Event) => void } | null>(null);
const undoStack = ref<string[]>([]);
const lastUndoText = ref(text.value);
const lastCaret = ref<number | null>(null);
const lastTextSelection = ref<{ start: number; end: number } | null>(null);
const menu = ref<{
  x: number;
  y: number;
  anchor: HTMLElement;
  target?: HTMLTextAreaElement;
  canPaste?: boolean;
} | null>(null);
const uiText = computed(() => getUiText(props.language));
const guideMenuOption = computed<DropdownOption>(() => ({
  ...GUIDE_MENU_OPTION,
  label: uiText.value.common.tips,
}));
const exclusiveMenu = createExclusiveContextMenu(closeMenu);
const canDragSelectedText = computed(() => {
  const selection = lastTextSelection.value;
  return Boolean(selection && selection.start !== selection.end);
});

onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, { size: 16 }, { default: () => h(icon) });
}

const menuOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [];
  const target = menu.value?.target;
  if (target) {
    options.push({ label: uiText.value.common.copy, key: "copy", disabled: !canCopyTextSelection(target), icon: renderIcon(CopyOutline) });
    options.push({ label: uiText.value.common.paste, key: "paste", disabled: !menu.value?.canPaste, icon: renderIcon(ClipboardOutline) });
  }
  options.push({ ...guideMenuOption.value, icon: renderIcon(HelpCircleOutline) });
  return options;
});

watch(
  () => props.lines,
  (lines) => {
    const next = textLinesToEditorText(lines);
    if (next !== text.value) {
      text.value = next;
      lastUndoText.value = next;
      undoStack.value = [];
    }
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
  const textarea = textareaRef.value;
  if (textarea) normalizeTextareaText(textarea);
  else recordUndoForText(text.value);
  emit("update", editorTextToLines(text.value));
}

function handleKeydown(event: KeyboardEvent): void {
  const textarea = textareaRef.value;
  if (!textarea) return;
  if (!editing.value) return;
  if (event.isComposing || event.key === "Process" || event.keyCode === 229) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastTextChange(textarea);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    applyEditorText(handleTextareaTab(textarea, event.shiftKey));
    update();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    applyEditorText(event.shiftKey ? insertPlainLineBreak(textarea) : insertIndentedLineBreak(textarea));
    nextTick(() => update());
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    const next = outdentEmptyIndentedLine(textarea);
    if (typeof next !== "string") return;
    event.preventDefault();
    applyEditorText(next);
    update();
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

function openTitleMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea")) return;
  event.preventDefault();
  event.stopPropagation();
  titleRef.value?.openMenuAt(event.clientX, event.clientY, event);
}

function handleDragEnter(event: DragEvent): void {
  if (isLocalDrag.value) return;
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") && !types.includes("Files")) {
    isDragHover.value = true;
  }
}

function handleDragLeaveClear(): void {
  isDragHover.value = false;
  isLocalDrag.value = false;
}

function getTextOffsetAtPoint(textarea: HTMLTextAreaElement, clientX: number, clientY: number): number {
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;

  const y = clientY - rect.top - paddingTop + textarea.scrollTop;
  const lines = textarea.value.split("\n");
  const lineIndex = Math.max(0, Math.min(Math.floor(y / lineHeight), lines.length - 1));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return textarea.value.length;
  ctx.font = `${style.fontSize} ${style.fontFamily}`;
  const lineText = lines[lineIndex];
  const x = clientX - rect.left - paddingLeft + textarea.scrollLeft;

  let col = 0;
  for (let i = 0; i < lineText.length; i++) {
    if (ctx.measureText(lineText.slice(0, i + 1)).width >= x) break;
    col = i + 1;
  }

  return lines.slice(0, lineIndex).reduce((sum, l) => sum + l.length + 1, 0) + col;
}

function handleDragOver(event: DragEvent): void {
  if (isLocalDrag.value) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    return;
  }
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("text/plain") || types.includes("text/uri-list")) {
    event.preventDefault();
    isDragHover.value = true;
  }
}

function handleTextareaDragOver(event: DragEvent): void {
  if (isLocalDrag.value) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    return;
  }
  event.preventDefault();
}

function handleTextareaDrop(event: DragEvent): void {
  if (isLocalDrag.value) {
    event.preventDefault();
    event.stopPropagation();
    isLocalDrag.value = false;
    return;
  }
}

function handleExternalTextDrop(event: DragEvent): void {
  isDragHover.value = false;
  const wasLocal = isLocalDrag.value;
  isLocalDrag.value = false;
  if (wasLocal) return;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) return;
  const dropped = event.dataTransfer?.getData("text/plain") ?? "";
  if (!dropped.trim()) return;
  event.preventDefault();
  event.stopPropagation();
  const textarea = textareaRef.value;
  if (textarea && !editing.value) startEditingFromTextarea(textarea);
  const current = text.value;
  const offset = textarea ? getTextOffsetAtPoint(textarea, event.clientX, event.clientY) : current.length;
  const before = current.slice(0, offset);
  const after = current.slice(offset);
  const next = before + dropped + after;
  applyEditorText(next);
  if (textarea) {
    const cursorPos = offset + dropped.length;
    textarea.setSelectionRange(cursorPos, cursorPos);
  }
  emit("update", editorTextToLines(text.value));
}

async function startEditing(event: MouseEvent): Promise<void> {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (editing.value) return;
  const preservedSelection = getRememberedSelection(textarea);
  startEditingFromTextarea(textarea);
  await nextTick();
  textareaRef.value?.focus({ preventScroll: true });
  if (textareaRef.value) {
    if (preservedSelection) {
      restoreSelection(textareaRef.value, preservedSelection);
    } else {
      const caret = lastCaret.value ?? textarea.selectionStart ?? textarea.value.length;
      collapseSelection(textareaRef.value, caret);
      lastTextSelection.value = null;
    }
  }
}

function handlePointerDown(event: PointerEvent): void {
  // Check if pointer is on selected text for drag prevention
  const textarea = event.currentTarget as HTMLTextAreaElement;
  const prev = lastTextSelection.value;
  if (prev && prev.start !== prev.end) {
    try {
      const offset = getTextOffsetAtPoint(textarea, event.clientX, event.clientY);
      const onSelection = offset >= prev.start && offset <= prev.end;
      textarea.draggable = onSelection;
    } catch {
      textarea.draggable = true;
    }
  } else {
    textarea.draggable = false;
  }

  if (event.pointerType !== "touch") return;
  unlockTextareaBeforeNativeFocus(textarea);
}

function handleTouchStart(event: TouchEvent): void {
  if (typeof window.PointerEvent !== "undefined") return;
  unlockTextareaBeforeNativeFocus(event.currentTarget as HTMLTextAreaElement);
}

function startEditingFromTextarea(textarea: HTMLTextAreaElement, keyboardFocus = false): void {
  const preservedSelection = getRememberedSelection(textarea);
  const caret = preservedSelection?.start ?? lastCaret.value ?? textarea.selectionStart ?? textarea.value.length;
  editing.value = true;
  undoStack.value = [];
  lastUndoText.value = text.value;
  unlockTextareaForMobileKeyboard(textarea, caret, keyboardFocus);
  if (preservedSelection) restoreSelection(textarea, preservedSelection);
}

function unlockTextareaBeforeNativeFocus(textarea: HTMLTextAreaElement): void {
  if (editing.value) return;
  editing.value = true;
  textarea.readOnly = false;
  textarea.removeAttribute("readonly");
  textarea.inputMode = "text";
  textarea.setAttribute("inputmode", "text");
}

function unlockTextareaForMobileKeyboard(textarea: HTMLTextAreaElement, caret: number, keyboardFocus = false): void {
  textarea.readOnly = false;
  textarea.removeAttribute("readonly");
  textarea.inputMode = "text";
  textarea.setAttribute("inputmode", "text");
  if (keyboardFocus) {
    if (document.activeElement === textarea) textarea.blur();
    textarea.focus();
  } else {
    textarea.focus({ preventScroll: true });
  }
  collapseSelection(textarea, caret);
}

function rememberCaret(event: MouseEvent): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (hasSelection(textarea)) {
    rememberTextSelection(textarea);
    return;
  }
  if (event.button !== 2) lastTextSelection.value = null;
  textarea.draggable = false;
  lastCaret.value = textarea.selectionStart ?? textarea.value.length;
}

function rememberSelection(event: Event): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  rememberTextSelection(textarea);
  textarea.draggable = hasSelection(textarea);
  if (hasSelection(textarea) && !editing.value) {
    startEditingFromTextarea(textarea);
    restoreSelection(textarea, getTextSelectionRange(textarea));
  }
}

function openTextMenu(event: MouseEvent): void {
  const target = event.target instanceof HTMLTextAreaElement ? event.target : undefined;
  if (target && !hasAsyncClipboard()) {
    closeMenu();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (target && hasSelection(target)) rememberTextSelection(target);
  exclusiveMenu.notifyOpen(event, { replacingExistingMenu: Boolean(menu.value) });
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

function handleTextDragStart(event: DragEvent): void {
  const target = event.currentTarget as HTMLTextAreaElement;
  const range = getTextSelectionRange(target);
  const selectedText = target.value.slice(range.start, range.end);
  if (!selectedText.trim() || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  isLocalDrag.value = true;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", selectedText);
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
  return Boolean(target && navigator.clipboard?.readText);
}

async function copyTextSelection(target: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
  const { start, end } = target instanceof HTMLTextAreaElement
    ? getTextSelectionRange(target)
    : { start: target.selectionStart ?? 0, end: target.selectionEnd ?? target.selectionStart ?? 0 };
  const selectedText = target.value.slice(start, end);
  if (!selectedText) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(selectedText);
      return;
    } catch {
      // Fall back below when async clipboard access is denied.
    }
  }
  copyTextWithBrowserCommand(selectedText);
}

function copyTextWithBrowserCommand(selectedText: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = selectedText;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.focus();
  textarea.setSelectionRange(0, textarea.value.length);
  document.execCommand?.("copy");
  textarea.remove();
}

async function pasteTextFromClipboard(target: HTMLTextAreaElement): Promise<void> {
  const range = getTextSelectionRange(target);
  if (!editing.value || target.readOnly) startEditingFromTextarea(target);
  target.setSelectionRange(range.start, range.end);
  let pastedText: string | undefined;
  if (navigator.clipboard?.readText) {
    try {
      pastedText = await navigator.clipboard.readText();
    } catch {
      pastedText = undefined;
    }
  }
  if (typeof pastedText === "string") {
    if (!pastedText) return;
    target.setRangeText(pastedText, range.start, range.end, "end");
  } else if (!pasteTextWithBrowserCommand(target, range)) {
    return;
  }
  normalizeTextareaText(target);
  emit("update", editorTextToLines(text.value));
}

function pasteTextWithBrowserCommand(target: HTMLTextAreaElement, range: { start: number; end: number }): boolean {
  const before = target.value;
  target.focus({ preventScroll: true });
  target.setSelectionRange(range.start, range.end);
  const pasted = Boolean(document.execCommand?.("paste"));
  return pasted && target.value !== before;
}

function hasAsyncClipboard(): boolean {
  return typeof navigator.clipboard?.readText === "function" && typeof navigator.clipboard?.writeText === "function";
}

function applyEditorText(next: string): void {
  recordUndoForText(next);
  text.value = next;
  if (textareaRef.value && textareaRef.value.value !== next) textareaRef.value.value = next;
}

function normalizeTextareaText(textarea: HTMLTextAreaElement): void {
  const raw = textarea.value;
  const normalized = renumberOrderedListText(raw);
  if (normalized === raw) {
    recordUndoForText(raw);
    text.value = raw;
    return;
  }

  const selectionStart = textarea.selectionStart ?? raw.length;
  const selectionEnd = textarea.selectionEnd ?? selectionStart;
  const nextSelectionStart = getAdjustedSelectionOffset(raw, normalized, selectionStart);
  const nextSelectionEnd = getAdjustedSelectionOffset(raw, normalized, selectionEnd);
  recordUndoForText(normalized);
  text.value = normalized;
  textarea.value = normalized;
  textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
}

function getAdjustedSelectionOffset(raw: string, normalized: string, offset: number): number {
  const prefixLength = getCommonPrefixLength(raw, normalized);
  if (prefixLength >= offset) return offset;
  const suffixLength = getCommonSuffixLength(raw, normalized, prefixLength);
  const rawChangedEnd = raw.length - suffixLength;
  const normalizedChangedEnd = normalized.length - suffixLength;
  if (offset >= rawChangedEnd) {
    return clampSelectionOffset(offset + normalized.length - raw.length, normalized.length);
  }
  return clampSelectionOffset(normalizedChangedEnd, normalized.length);
}

function getCommonPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;
  while (index < maxLength && left[index] === right[index]) index += 1;
  return index;
}

function getCommonSuffixLength(left: string, right: string, prefixLength: number): number {
  const maxLength = Math.min(left.length, right.length) - prefixLength;
  let index = 0;
  while (index < maxLength && left[left.length - 1 - index] === right[right.length - 1 - index]) index += 1;
  return index;
}

function clampSelectionOffset(offset: number, textLength: number): number {
  return Math.max(0, Math.min(offset, textLength));
}

function recordUndoForText(next: string): void {
  if (next === lastUndoText.value) return;
  undoStack.value = [...undoStack.value.slice(-49), lastUndoText.value];
  lastUndoText.value = next;
}

function undoLastTextChange(textarea: HTMLTextAreaElement): void {
  const previous = undoStack.value.at(-1);
  if (typeof previous !== "string") return;
  undoStack.value = undoStack.value.slice(0, -1);
  text.value = previous;
  textarea.value = previous;
  lastUndoText.value = previous;
  const caret = Math.min(previous.length, textarea.selectionStart ?? previous.length);
  textarea.setSelectionRange(caret, caret);
  emit("update", editorTextToLines(previous));
}

function collapseSelection(textarea: HTMLTextAreaElement, caret: number): void {
  const position = Math.max(0, Math.min(caret, textarea.value.length));
  textarea.setSelectionRange(position, position);
  window.setTimeout(() => {
    if (document.activeElement === textarea) textarea.setSelectionRange(position, position);
  });
}

function getRememberedSelection(textarea: HTMLTextAreaElement): { start: number; end: number } | null {
  const selection = lastTextSelection.value;
  if (!selection || selection.start === selection.end || selection.end > textarea.value.length) return null;
  if ((textarea.selectionStart ?? 0) !== selection.start || (textarea.selectionEnd ?? 0) !== selection.end) return null;
  return selection;
}

function restoreSelection(textarea: HTMLTextAreaElement, selection: { start: number; end: number }): void {
  textarea.setSelectionRange(selection.start, selection.end);
  window.setTimeout(() => {
    if (document.activeElement === textarea) textarea.setSelectionRange(selection.start, selection.end);
  });
}
</script>

<template>
  <section class="text-panel" :class="[textPanelClasses, { 'drag-hover': isDragHover }]" @dragenter="handleDragEnter" @dragleave="handleDragLeaveClear" @drop="handleDragLeaveClear" @dragend="handleDragLeaveClear">
    <div v-if="!hideHeader" class="panel-header" @contextmenu="openTitleMenu">
      <h2>
        <EditableTitle
          ref="titleRef"
          :id="titleId"
          :value="title"
          :edit-label="uiText.common.rename"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </h2>
      <slot name="actions" />
    </div>
    <div class="text-editor-frame" @contextmenu="openTextMenu" @dragover="handleDragOver" @drop="handleExternalTextDrop">
      <NScrollbar class="text-editor-scrollbar">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="text-editor-textarea board-textarea large-textarea"
        :placeholder="placeholder"
        :readonly="!editing"
        :inputmode="editing ? 'text' : 'none'"
        :draggable="canDragSelectedText"
        spellcheck="false"
        @input="update"
        @keydown="handleKeydown"
        @mouseup="rememberCaret"
        @pointerdown="handlePointerDown"
        @touchstart="handleTouchStart"
        @dragstart="handleTextDragStart"
        @dragover="handleTextareaDragOver"
        @drop="handleTextareaDrop"
        @select="rememberSelection"
        @click="startEditing"
        @dblclick="startEditing"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      </NScrollbar>
    </div>
    <NDropdown
      v-if="menu"
      placement="bottom-start"
      trigger="manual"
      :show="true"
      :x="menu.x"
      :y="menu.y"
      :z-index="CONTEXT_MENU_Z_INDEX"
      :options="menuOptions"
      @select="handleMenuSelect"
      @clickoutside="exclusiveMenu.handleClickOutside"
    >
      <span
        class="dropdown-anchor"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        aria-hidden="true"
      />
    </NDropdown>
  </section>
</template>

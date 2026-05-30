<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { NDropdown, NScrollbar } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import type { LineItem } from "../types";
import { GUIDE_MENU_OPTION } from "../state/defaults";
import { getUiText } from "../state/i18n";
import type { AppLanguage } from "../types";
import { renderMarkdownLite, type MarkdownLiteInline } from "../utils/markdownLite";
import {
  appendPlainTextToEditorText,
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
  createTodos: [texts: string[], anchor?: HTMLElement];
  createQuick: [payload: { title: string; value: string; type: "text" }, anchor?: HTMLElement];
  focus: [element: HTMLElement];
  blur: [element: HTMLElement];
  guide: [element: HTMLElement, immediate?: boolean];
}>();

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
  selectionText?: string;
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
const markdownBlocks = computed(() => renderMarkdownLite(text.value));
const showMarkdownPreview = computed(() => !editing.value && text.value.trim().length > 0);

onMounted(exclusiveMenu.mount);
onUnmounted(exclusiveMenu.unmount);
const menuOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [];
  const target = menu.value?.target;
  const workflowText = getMenuWorkflowText(menu.value);
  if (workflowText) {
    options.push({ label: uiText.value.note.createTodos, key: "create-todos" });
    options.push({ label: uiText.value.note.createQuick, key: "create-quick" });
  }
  if (target) {
    options.push({ label: uiText.value.common.copy, key: "copy", disabled: !canCopyTextSelection(target) });
    options.push({ label: uiText.value.common.paste, key: "paste", disabled: !menu.value?.canPaste });
  } else if (workflowText) {
    options.push({ label: uiText.value.common.copy, key: "copy" });
  }
  options.push(guideMenuOption.value);
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
    event.preventDefault();
    wrapSelectedText(textarea, "**");
    update();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "h") {
    event.preventDefault();
    wrapSelectedText(textarea, "==");
    update();
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

function handleExternalTextDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) return;
  const dropped = event.dataTransfer?.getData("text/plain") ?? "";
  if (!dropped.trim()) return;
  event.preventDefault();
  event.stopPropagation();
  const textarea = textareaRef.value;
  if (textarea && !editing.value) startEditingFromTextarea(textarea);
  const next = appendPlainTextToEditorText(text.value, dropped);
  applyEditorText(next);
  if (textarea) {
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
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

async function startEditingFromPreview(event?: MouseEvent, force = false): Promise<void> {
  if (!force && event?.currentTarget instanceof HTMLElement && hasPreviewSelection(event.currentTarget)) return;
  const textarea = textareaRef.value;
  if (!textarea) return;
  startEditingFromTextarea(textarea);
  await nextTick();
  textarea.focus({ preventScroll: true });
}

function hasPreviewSelection(root: HTMLElement): boolean {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return false;
  return root.contains(selection.anchorNode) && root.contains(selection.focusNode);
}

function handlePointerDown(event: PointerEvent): void {
  if (event.pointerType !== "touch") return;
  unlockTextareaBeforeNativeFocus(event.currentTarget as HTMLTextAreaElement);
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
  lastCaret.value = textarea.selectionStart ?? textarea.value.length;
}

function rememberSelection(event: Event): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  rememberTextSelection(textarea);
  if (hasSelection(textarea) && !editing.value) {
    startEditingFromTextarea(textarea);
    restoreSelection(textarea, getTextSelectionRange(textarea));
  }
}

function openTextMenu(event: MouseEvent): void {
  const target = event.target instanceof HTMLTextAreaElement ? event.target : undefined;
  const previewSelectionText = target ? "" : getPreviewSelectionText(event.target, event.currentTarget as HTMLElement);
  const hasWorkflowSelection = target ? getSelectedWorkflowText(target).length > 0 : previewSelectionText.length > 0;
  if (target && !hasAsyncClipboard() && !hasWorkflowSelection) {
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
    selectionText: previewSelectionText || undefined,
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
  if (key === "copy" && current?.selectionText) {
    copyTextWithBrowserCommand(current.selectionText);
    return;
  }
  if (key === "paste" && target) {
    if (!canPaste) return;
    await pasteTextFromClipboard(target);
    return;
  }
  if (key === "create-todos") {
    const texts = getWorkflowLinesFromText(getMenuWorkflowText(current));
    if (texts.length > 0) emit("createTodos", texts, anchor);
    return;
  }
  if (key === "create-quick") {
    const selectedText = getMenuWorkflowText(current);
    if (selectedText) {
      emit("createQuick", {
        title: deriveWorkflowTitle(selectedText),
        value: selectedText,
        type: "text",
      }, anchor);
    }
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

function getSelectedWorkflowText(target: HTMLTextAreaElement): string {
  const range = getTextSelectionRange(target);
  return target.value.slice(range.start, range.end).trim();
}

function getSelectedWorkflowLines(target: HTMLTextAreaElement): string[] {
  return getWorkflowLinesFromText(getSelectedWorkflowText(target));
}

function getMenuWorkflowText(current: typeof menu.value): string {
  if (!current) return "";
  if (current.selectionText?.trim()) return current.selectionText.trim();
  if (current.target) return getSelectedWorkflowText(current.target);
  return "";
}

function getWorkflowLinesFromText(value: string): string[] {
  return value
    .split("\n")
    .map((line) => stripWorkflowLineMarker(line))
    .filter(Boolean);
}

function getPreviewSelectionText(target: EventTarget | null, root: HTMLElement): string {
  const element = target instanceof HTMLElement ? target : undefined;
  const preview = element?.closest(".markdown-preview");
  if (!preview || !root.contains(preview)) return "";
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return "";
  if (!preview.contains(selection.anchorNode) || !preview.contains(selection.focusNode)) return "";
  return selection
    .toString()
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function deriveWorkflowTitle(value: string): string {
  return stripWorkflowLineMarker(value.split("\n").find((line) => line.trim()) ?? "").slice(0, 24) || uiText.value.quick.untitledText;
}

function stripWorkflowLineMarker(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*]|\d+\.)\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .trim();
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

function wrapSelectedText(textarea: HTMLTextAreaElement, marker: "**" | "=="): void {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end);
  const replacement = selected ? `${marker}${selected}${marker}` : `${marker}${marker}`;
  textarea.setRangeText(replacement, start, end, selected ? "select" : "end");
  if (selected) textarea.setSelectionRange(start, start + replacement.length);
  applyEditorText(textarea.value);
}

function inlineKey(inline: MarkdownLiteInline, index: number): string {
  return `${inline.type}-${index}-${inline.text}`;
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
  <section class="text-panel" :class="textPanelClasses">
    <div v-if="!hideHeader" class="panel-header" @contextmenu="openTitleMenu">
      <h2>
        <EditableTitle
          ref="titleRef"
          :id="titleId"
          :value="title"
          :edit-label="uiText.common.edit"
          @update="(id, value) => emit('titleUpdate', id, value)"
        />
      </h2>
      <slot name="actions" />
    </div>
    <div class="text-editor-frame" @contextmenu="openTextMenu" @dragover.prevent @drop="handleExternalTextDrop">
      <NScrollbar class="text-editor-scrollbar">
        <div
          v-if="showMarkdownPreview"
          class="markdown-preview"
          @click="startEditingFromPreview"
          @dblclick="startEditingFromPreview($event, true)"
        >
          <template v-for="(block, blockIndex) in markdownBlocks" :key="`block-${blockIndex}`">
            <component
              :is="`h${block.level}`"
              v-if="block.type === 'heading'"
              class="markdown-preview-heading"
              :class="`markdown-preview-heading-${block.level}`"
            >
              <template v-for="(inline, inlineIndex) in block.inlines" :key="inlineKey(inline, inlineIndex)">
                <strong v-if="inline.type === 'strong'">{{ inline.text }}</strong>
                <mark v-else-if="inline.type === 'mark'">{{ inline.text }}</mark>
                <span v-else>{{ inline.text }}</span>
              </template>
            </component>
            <component
              :is="block.ordered ? 'ol' : 'ul'"
              v-else-if="block.type === 'list'"
              class="markdown-preview-list"
              :class="{ 'is-ordered': block.ordered }"
            >
              <li
                v-for="(item, itemIndex) in block.items"
                :key="`item-${blockIndex}-${itemIndex}`"
                :class="{ 'has-check': typeof item.checked === 'boolean' }"
              >
                <span
                  v-if="typeof item.checked === 'boolean'"
                  class="markdown-preview-check"
                  role="checkbox"
                  :aria-checked="item.checked"
                />
                <span class="markdown-preview-line">
                  <template v-for="(inline, inlineIndex) in item.inlines" :key="inlineKey(inline, inlineIndex)">
                    <strong v-if="inline.type === 'strong'">{{ inline.text }}</strong>
                    <mark v-else-if="inline.type === 'mark'">{{ inline.text }}</mark>
                    <span v-else>{{ inline.text }}</span>
                  </template>
                </span>
              </li>
            </component>
            <p v-else class="markdown-preview-paragraph">
              <template v-for="(inline, inlineIndex) in block.inlines" :key="inlineKey(inline, inlineIndex)">
                <strong v-if="inline.type === 'strong'">{{ inline.text }}</strong>
                <mark v-else-if="inline.type === 'mark'">{{ inline.text }}</mark>
                <span v-else>{{ inline.text }}</span>
              </template>
            </p>
          </template>
        </div>
        <textarea
          ref="textareaRef"
          v-model="text"
          class="text-editor-textarea board-textarea large-textarea"
          :class="{ 'is-preview-hidden': showMarkdownPreview }"
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

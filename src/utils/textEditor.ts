import type { LineItem } from "../types";
import { serializeTextLines, textLinesToText } from "../state/storage";

export { serializeTextLines, textLinesToText };

const INDENT_UNIT = "    ";
const ORDERED_MARKER_PATTERN = /^(\d+)\.\s+(.*)$/;
const MAX_ORDERED_LIST_MARKER = 99;

export function textLinesToEditorText(lines: LineItem[]): string {
  return renumberOrderedListText(lines.map((line) => formatEditorLine(line.indent, line.text)).join("\n"));
}

export function editorTextToLines(value = ""): LineItem[] {
  const normalized = renumberOrderedListText(value);
  if (!normalized) return [];
  return normalized.split("\n").map((line) => {
    const indent = getIndentInfo(line);
    return {
      text: line.slice(indent.contentStart),
      indent: indent.depth,
    };
  });
}

export function appendPlainTextToEditorText(current: string, dropped: string): string {
  const normalizedDrop = dropped.replace(/\r\n?/g, "\n");
  if (!normalizedDrop.trim()) return current;
  if (!current) return normalizedDrop;
  return `${current}\n${normalizedDrop}`;
}

export function splitDroppedTodoText(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function renumberOrderedListText(value = ""): string {
  if (!value) return "";
  const counters = new Map<number, number>();
  const active = new Set<number>();

  return value.split("\n").map((line) => {
    const indentText = line.match(/^[ \t]*/)?.[0] ?? "";
    const indent = indentText.length;
    for (const counterIndent of counters.keys()) {
      if (counterIndent <= indent) continue;
      counters.delete(counterIndent);
      active.delete(counterIndent);
    }
    const content = line.slice(indent);
    const match = ORDERED_MARKER_PATTERN.exec(content);

    if (!match) {
      counters.delete(indent);
      active.delete(indent);
      return line;
    }

    const markerNumber = Number(match[1]);
    const startsList = markerNumber === 1 || (active.has(indent) && markerNumber <= MAX_ORDERED_LIST_MARKER);
    if (!startsList) {
      counters.delete(indent);
      active.delete(indent);
      return line;
    }

    const nextNumber = active.has(indent) ? (counters.get(indent) ?? 0) + 1 : 1;
    counters.set(indent, nextNumber);
    active.add(indent);
    return `${indentText}${nextNumber}. ${match[2]}`;
  }).join("\n");
}

export function handleTextareaTab(textarea: HTMLTextAreaElement, outdent = false): string {
  const { selectionStart, selectionEnd, value } = textarea;
  const isCollapsedSelection = selectionStart === selectionEnd;
  const range = getSelectedLineRange(value, selectionStart, selectionEnd);
  const selected = value.slice(range.start, range.end);
  const lines = selected.split("\n");
  const firstLineIndentDelta = outdent ? -getRemovedIndentLength(lines[0] ?? "") : INDENT_UNIT.length;
  const transformed = lines
    .map((line) => (outdent ? removeOneIndentUnit(line) : `${INDENT_UNIT}${line}`))
    .join("\n");

  textarea.setRangeText(transformed, range.start, range.end, "preserve");
  const delta = transformed.length - selected.length;
  if (isCollapsedSelection) {
    const cursor = Math.max(range.start, selectionStart + firstLineIndentDelta);
    textarea.setSelectionRange(cursor, cursor);
    return textarea.value;
  }

  textarea.setSelectionRange(
    Math.max(range.start, selectionStart + firstLineIndentDelta),
    Math.max(range.start, selectionEnd + delta),
  );
  return textarea.value;
}

export function insertIndentedLineBreak(textarea: HTMLTextAreaElement): string {
  const { selectionStart, value } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  if (isEmptyListLine(line)) {
    textarea.setRangeText("", lineStart, lineEnd, "end");
    return textarea.value;
  }
  if (isEmptyIndentedLine(line)) {
    textarea.setRangeText("", lineStart, lineEnd, "end");
    return textarea.value;
  }
  const previousLine = value.slice(lineStart, selectionStart);
  textarea.setRangeText(`\n${getContinuationPrefix(previousLine)}`, textarea.selectionStart, textarea.selectionEnd, "end");
  return textarea.value;
}

export function insertPlainLineBreak(textarea: HTMLTextAreaElement): string {
  const { selectionEnd, value } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionEnd - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  textarea.setRangeText(`\n${getContinuationPrefix(line)}`, lineEnd, lineEnd, "end");
  return textarea.value;
}

export function outdentEmptyIndentedLine(textarea: HTMLTextAreaElement): string | undefined {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd) return undefined;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  const indent = getIndentInfo(line);
  if (indent.depth === 0) return undefined;
  const content = line.slice(indent.contentStart);
  if (content.trim().length > 0 && !isEmptyListContent(content)) return undefined;

  const nextLine = formatEditorLine(indent.depth - 1, content);
  textarea.setRangeText(nextLine, lineStart, lineEnd, "end");
  return textarea.value;
}

function formatEditorLine(indent: number, text: string): string {
  return `${INDENT_UNIT.repeat(Math.max(0, indent))}${text}`;
}

function isEmptyIndentedLine(line: string): boolean {
  const indent = getIndentInfo(line);
  if (indent.depth === 0) return false;
  return line.slice(indent.contentStart).trim().length === 0;
}

function isEmptyListLine(line: string): boolean {
  return isEmptyListContent(line.slice(line.match(/^[ \t]*/)?.[0].length ?? 0));
}

function isEmptyListContent(content: string): boolean {
  return /^(\d+\.|[-*])\s*$/.test(content);
}

function getContinuationPrefix(lineBeforeCaret: string): string {
  const indent = lineBeforeCaret.match(/^[ \t]*/)?.[0] ?? "";
  const content = lineBeforeCaret.slice(indent.length);
  const numbered = content.match(/^(\d+)\.\s+/);
  if (numbered) return `${indent}${Number(numbered[1]) + 1}. `;
  const unordered = content.match(/^([-*])\s+/);
  if (unordered) return `${indent}${unordered[1]} `;
  return indent;
}

function getSelectedLineRange(value: string, start: number, end: number): { start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  return {
    start: lineStart,
    end: nextBreak === -1 ? value.length : nextBreak,
  };
}

function getIndentInfo(line: string): { depth: number; contentStart: number } {
  let depth = 0;
  let index = 0;
  while (index < line.length) {
    if (line[index] === "\t") {
      depth += 1;
      index += 1;
      continue;
    }
    if (line.slice(index, index + INDENT_UNIT.length) === INDENT_UNIT) {
      depth += 1;
      index += INDENT_UNIT.length;
      continue;
    }
    break;
  }
  return { depth, contentStart: index };
}

function getRemovedIndentLength(line: string): number {
  if (line.startsWith("\t")) return 1;
  if (line.startsWith(INDENT_UNIT)) return INDENT_UNIT.length;
  return 0;
}

function removeOneIndentUnit(line: string): string {
  return line.slice(getRemovedIndentLength(line));
}

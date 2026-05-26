import type { LineItem } from "../types";
import { serializeTextLines, textLinesToText } from "../state/storage";

export { serializeTextLines, textLinesToText };

const LINE_MARKER = "- ";
const ORDERED_MARKER_PATTERN = /^(\d+)\.\s+(.*)$/;
const MAX_ORDERED_LIST_MARKER = 99;

export function textLinesToEditorText(lines: LineItem[]): string {
  return renumberOrderedListText(lines.map((line) => formatEditorLine(line.indent, line.text)).join("\n"));
}

export function editorTextToLines(value = ""): LineItem[] {
  const normalized = renumberOrderedListText(value);
  if (!normalized) return [];
  return normalized.split("\n").map((line) => {
    const tabs = line.match(/^\t*/)?.[0].length ?? 0;
    const content = line.slice(tabs);
    return {
      text: tabs > 0 ? stripLineMarker(content) : content,
      indent: tabs,
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
    const indentText = line.match(/^\t*/)?.[0] ?? "";
    const indent = indentText.length;
    for (const counterIndent of counters.keys()) {
      if (counterIndent <= indent) continue;
      counters.delete(counterIndent);
      active.delete(counterIndent);
    }
    const content = line.slice(indent);
    const markerPrefix = content.startsWith(LINE_MARKER) ? LINE_MARKER : "";
    const text = markerPrefix ? content.slice(LINE_MARKER.length) : content;
    const match = ORDERED_MARKER_PATTERN.exec(text);

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
    return `${indentText}${markerPrefix}${nextNumber}. ${match[2]}`;
  }).join("\n");
}

export function handleTextareaTab(textarea: HTMLTextAreaElement, outdent = false): string {
  const { selectionStart, selectionEnd, value } = textarea;
  const isCollapsedSelection = selectionStart === selectionEnd;
  const range = getSelectedLineRange(value, selectionStart, selectionEnd);
  const selected = value.slice(range.start, range.end);
  const lines = selected.split("\n");
  const transformed = lines
    .map((line) => {
      const indent = line.match(/^\t*/)?.[0].length ?? 0;
      const text = stripLineMarker(line.slice(indent));
      const nextIndent = outdent ? Math.max(0, indent - 1) : indent + 1;
      return formatEditorLine(nextIndent, text);
    })
    .join("\n");

  textarea.setRangeText(transformed, range.start, range.end, "preserve");
  const delta = transformed.length - selected.length;
  if (isCollapsedSelection) {
    const cursor = Math.max(range.start, selectionStart + delta);
    textarea.setSelectionRange(cursor, cursor);
    return textarea.value;
  }

  textarea.setSelectionRange(
    Math.max(range.start, selectionStart + (outdent ? -1 : 1)),
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
  const indent = previousLine.match(/^\t*/)?.[0] ?? "";
  const marker = getContinuationMarker(previousLine.slice(indent.length)) ?? (indent.length > 0 ? LINE_MARKER : "");
  textarea.setRangeText(`\n${indent}${marker}`, textarea.selectionStart, textarea.selectionEnd, "end");
  return textarea.value;
}

export function insertPlainLineBreak(textarea: HTMLTextAreaElement): string {
  const { selectionEnd, value } = textarea;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  textarea.setRangeText("\n", lineEnd, lineEnd, "end");
  return textarea.value;
}

export function outdentEmptyIndentedLine(textarea: HTMLTextAreaElement): string | undefined {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd) return undefined;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  const indent = line.match(/^\t*/)?.[0].length ?? 0;
  if (indent === 0) return undefined;
  if (stripLineMarker(line.slice(indent)).trim().length > 0) return undefined;

  const nextLine = indent - 1 > 0 ? formatEditorLine(indent - 1, "") : "";
  textarea.setRangeText(nextLine, lineStart, lineEnd, "end");
  return textarea.value;
}

function formatEditorLine(indent: number, text: string): string {
  const prefix = "\t".repeat(indent);
  return indent > 0 ? `${prefix}${LINE_MARKER}${text}` : text;
}

function stripLineMarker(content: string): string {
  if (content.startsWith(LINE_MARKER)) return content.slice(LINE_MARKER.length);
  if (content === "-") return "";
  return content;
}

function isEmptyIndentedLine(line: string): boolean {
  const indent = line.match(/^\t*/)?.[0].length ?? 0;
  if (indent === 0) return false;
  return stripLineMarker(line.slice(indent)).trim().length === 0;
}

function isEmptyListLine(line: string): boolean {
  const content = line.slice(line.match(/^\t*/)?.[0].length ?? 0);
  return /^(\d+\.|[-*])\s*$/.test(content);
}

function getContinuationMarker(contentBeforeCaret: string): string | undefined {
  const numbered = contentBeforeCaret.match(/^(\d+)\.\s+/);
  if (numbered) return `${Number(numbered[1]) + 1}. `;
  const unordered = contentBeforeCaret.match(/^([-*])\s+/);
  if (unordered) return `${unordered[1]} `;
  return undefined;
}

function getSelectedLineRange(value: string, start: number, end: number): { start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  return {
    start: lineStart,
    end: nextBreak === -1 ? value.length : nextBreak,
  };
}

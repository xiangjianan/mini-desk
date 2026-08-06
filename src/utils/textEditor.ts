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

const BULLET_MARKER = "- ";
const ORDERED_LINE_PATTERN = /^(\d+)(\.\s+)(.*)$/;
const UNORDERED_LINE_PATTERN = /^([-*])\s+/;
const NUMBERED_LINE_PATTERN = /^\s*\d+\.\s+/;

interface LineSlice {
  start: number;
  end: number;
  text: string;
}

function getLineAt(value: string, caret: number): LineSlice {
  const start = value.lastIndexOf("\n", caret - 1) + 1;
  const nextBreak = value.indexOf("\n", caret);
  const end = nextBreak === -1 ? value.length : nextBreak;
  return { start, end, text: value.slice(start, end) };
}

/** Closest preceding non-empty line at the given indent depth, or null. */
function getPreviousLineAtDepth(value: string, lineStart: number, depth: number): string | null {
  let end = lineStart - 1;
  while (end >= 0) {
    const start = value.lastIndexOf("\n", end - 1) + 1;
    const text = value.slice(start, end);
    if (text.trim() && getIndentInfo(text).depth === depth) return text;
    if (start === 0) return null;
    end = start - 1;
  }
  return null;
}

/**
 * Tab turns a line into an indented bullet ("- "):
 *  - a numbered line ("1. ") with the caret at the line head or right after the
 *    marker becomes a bullet (the number is replaced);
 *  - a root-level plain line with the caret at the line head becomes a bullet.
 * Returns null when the regular indent behavior should apply instead.
 */
function tryTabConvertToBullet(value: string, caret: number): { text: string; caret: number } | null {
  const { start: lineStart, end: lineEnd, text: line } = getLineAt(value, caret);
  const caretInLine = caret - lineStart;
  const indentMatch = line.match(/^[ \t]*/)?.[0] ?? "";
  const indent = indentMatch.length;
  const body = line.slice(indent);

  const ordered = ORDERED_LINE_PATTERN.exec(body);
  if (ordered) {
    const markerEnd = indent + ordered[1].length + ordered[2].length;
    // Convert when the caret sits anywhere on the marker (line head through the
    // end of the "N. "); once it is inside the item text, fall back to indent.
    if (caretInLine > markerEnd) return null;
    const prefix = `${indentMatch}${INDENT_UNIT}${BULLET_MARKER}`;
    return {
      text: `${value.slice(0, lineStart)}${prefix}${ordered[3]}${value.slice(lineEnd)}`,
      caret: lineStart + indent + INDENT_UNIT.length + BULLET_MARKER.length,
    };
  }

  if (caretInLine === 0 && indent === 0 && !UNORDERED_LINE_PATTERN.test(body)) {
    const prefix = `${INDENT_UNIT}${BULLET_MARKER}`;
    return {
      text: `${value.slice(0, lineStart)}${prefix}${body}${value.slice(lineEnd)}`,
      caret: lineStart + prefix.length,
    };
  }

  return null;
}

/**
 * Shift+Tab on a bullet line outdents one level. The bullet is only reverted
 * once the line reaches the root (no indentation left):
 *  - at the root, with a numbered line at the same (root) level above — even
 *    across nested bullets in between — it becomes a numbered marker again
 *    ("1. ", renumbered by the editor);
 *  - at the root with no numbered line above, the bullet is removed (plain);
 *  - while still nested it stays a bullet (just outdented).
 * The caret keeps its offset within the item text and always lands after the
 * marker. Returns null for regular outdent.
 */
function tryShiftTabOnBulletLine(value: string, caret: number): { text: string; caret: number } | null {
  const { start: lineStart, end: lineEnd, text: line } = getLineAt(value, caret);
  const caretInLine = caret - lineStart;
  const indentMatch = line.match(/^[ \t]*/)?.[0] ?? "";
  const indent = indentMatch.length;
  const body = line.slice(indent);

  const bullet = UNORDERED_LINE_PATTERN.exec(body);
  if (!bullet) return null;

  const markerLen = bullet[0].length;
  const textContent = body.slice(markerLen);
  // Preserve the caret's offset within the item text; if it was on the indent
  // or marker, drop it just after the marker.
  const textOffset = Math.max(0, caretInLine - (indent + markerLen));

  const outdentedIndent = removeOneIndentUnit(indentMatch);
  const reachedRoot = outdentedIndent.length === 0;

  let prefix: string;
  let newTextStart: number;
  if (reachedRoot) {
    const previousRootLine = getPreviousLineAtDepth(value, lineStart, 0);
    const toNumbered = Boolean(previousRootLine && NUMBERED_LINE_PATTERN.test(previousRootLine));
    prefix = toNumbered ? "1. " : "";
    newTextStart = prefix.length;
  } else {
    prefix = `${outdentedIndent}${bullet[0]}`;
    newTextStart = outdentedIndent.length + markerLen;
  }

  return {
    text: `${value.slice(0, lineStart)}${prefix}${textContent}${value.slice(lineEnd)}`,
    caret: lineStart + newTextStart + textOffset,
  };
}

export function handleTextareaTab(textarea: HTMLTextAreaElement, outdent = false): string {
  const { selectionStart, selectionEnd, value } = textarea;
  const isCollapsedSelection = selectionStart === selectionEnd;
  if (isCollapsedSelection) {
    const bullet = outdent
      ? tryShiftTabOnBulletLine(value, selectionStart)
      : tryTabConvertToBullet(value, selectionStart);
    if (bullet) {
      textarea.value = bullet.text;
      textarea.setSelectionRange(bullet.caret, bullet.caret);
      return bullet.text;
    }
  }
  const range = getSelectedLineRange(value, selectionStart, selectionEnd);
  const selected = value.slice(range.start, range.end);
  const lines = selected.split("\n");
  const firstLineIndentDelta = outdent ? -getRemovedIndentLength(lines[0] ?? "") : INDENT_UNIT.length;
  const transformed = lines
    .map((line, index) => {
      const shifted = outdent ? removeOneIndentUnit(line) : `${INDENT_UNIT}${line}`;
      if (outdent || index > 0) return shifted;
      return shifted.replace(/^(\s*)\d+(\.\s+)/, (_match, indent: string, suffix: string) => `${indent}1${suffix}`);
    })
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

/**
 * Cmd/Ctrl+Left and Cmd/Ctrl+Right jump to the start/end of the current line.
 * On a list line the "start" is the left edge of the item text — just past the
 * leading marker ("1. " / "- ") — so the first press lands at the text; when the
 * caret is already there it collapses to the absolute line head. Plain lines go
 * to the line head. A selection collapses to the chosen edge. Returns the new
 * caret offset; the caller owns preventDefault.
 */
export function moveCaretToLineBoundary(textarea: HTMLTextAreaElement, edge: "start" | "end"): number {
  const { selectionStart, selectionEnd, value } = textarea;
  const caret = edge === "start" ? Math.min(selectionStart, selectionEnd) : Math.max(selectionStart, selectionEnd);
  const { start: lineStart, end: lineEnd } = getLineAt(value, caret);
  let target: number;
  if (edge === "end") {
    target = lineEnd;
  } else {
    const textStart = lineStart + getLineTextStartOffset(value.slice(lineStart, lineEnd));
    // First press lands at the item text; a second press collapses to the line head.
    target = caret > textStart ? textStart : lineStart;
  }
  textarea.setSelectionRange(target, target);
  return target;
}

/** Offset of the item text within a line: leading indent + list marker, else 0. */
function getLineTextStartOffset(line: string): number {
  const indent = line.match(/^[ \t]*/)?.[0] ?? "";
  const body = line.slice(indent.length);
  const ordered = body.match(/^\d+\.\s+/);
  if (ordered) return indent.length + ordered[0].length;
  const unordered = UNORDERED_LINE_PATTERN.exec(body);
  if (unordered) return indent.length + unordered[0].length;
  return 0;
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

import type { LineItem } from "../types";
import { serializeTextLines, textLinesToText } from "../state/storage";

export { serializeTextLines, textLinesToText };

const LINE_MARKER = "- ";

export function textLinesToEditorText(lines: LineItem[]): string {
  return lines.map((line) => formatEditorLine(line.indent, line.text)).join("\n");
}

export function editorTextToLines(value = ""): LineItem[] {
  if (!value) return [];
  return value.split("\n").map((line) => {
    const tabs = line.match(/^\t*/)?.[0].length ?? 0;
    const content = line.slice(tabs);
    return {
      text: stripLineMarker(content),
      indent: tabs,
    };
  });
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
  const line = value.slice(lineStart, selectionStart);
  const indent = line.match(/^\t*/)?.[0] ?? "";
  const marker = indent.length > 0 ? LINE_MARKER : "";
  textarea.setRangeText(`\n${indent}${marker}`, textarea.selectionStart, textarea.selectionEnd, "end");
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

function getSelectedLineRange(value: string, start: number, end: number): { start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  return {
    start: lineStart,
    end: nextBreak === -1 ? value.length : nextBreak,
  };
}

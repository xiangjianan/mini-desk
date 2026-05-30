export type MarkdownLiteInline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "mark"; text: string };

export interface MarkdownLiteListItem {
  checked?: boolean;
  inlines: MarkdownLiteInline[];
}

export type MarkdownLiteBlock =
  | { type: "heading"; level: 1 | 2 | 3; inlines: MarkdownLiteInline[] }
  | { type: "paragraph"; inlines: MarkdownLiteInline[] }
  | { type: "list"; ordered: boolean; items: MarkdownLiteListItem[] };

const INLINE_TOKEN_PATTERN = /(\*\*[^*\n]+\*\*|==[^=\n]+==)/g;

export function renderMarkdownLite(value: string): MarkdownLiteBlock[] {
  const blocks: MarkdownLiteBlock[] = [];

  value.replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        inlines: parseMarkdownLiteInlines(heading[2]),
      });
      return;
    }

    const ordered = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    if (ordered) {
      pushListItem(blocks, true, { inlines: parseMarkdownLiteInlines(ordered[2]) });
      return;
    }

    const checkbox = /^(?:[-*]\s+)?\[([ xX])\]\s+(.+)$/.exec(trimmed);
    if (checkbox) {
      pushListItem(blocks, false, {
        checked: checkbox[1].toLowerCase() === "x",
        inlines: parseMarkdownLiteInlines(checkbox[2]),
      });
      return;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    if (unordered) {
      pushListItem(blocks, false, { inlines: parseMarkdownLiteInlines(unordered[1]) });
      return;
    }

    blocks.push({ type: "paragraph", inlines: parseMarkdownLiteInlines(trimmed) });
  });

  return blocks;
}

export function parseMarkdownLiteInlines(value: string): MarkdownLiteInline[] {
  const segments: MarkdownLiteInline[] = [];
  let cursor = 0;

  value.replace(INLINE_TOKEN_PATTERN, (token, _match, offset: number) => {
    if (offset > cursor) segments.push({ type: "text", text: value.slice(cursor, offset) });
    if (token.startsWith("**")) {
      segments.push({ type: "strong", text: token.slice(2, -2) });
    } else {
      segments.push({ type: "mark", text: token.slice(2, -2) });
    }
    cursor = offset + token.length;
    return token;
  });

  if (cursor < value.length) segments.push({ type: "text", text: value.slice(cursor) });
  return segments.length ? segments : [{ type: "text", text: value }];
}

function pushListItem(blocks: MarkdownLiteBlock[], ordered: boolean, item: MarkdownLiteListItem): void {
  const previous = blocks.at(-1);
  if (previous?.type === "list" && previous.ordered === ordered) {
    previous.items.push(item);
    return;
  }
  blocks.push({ type: "list", ordered, items: [item] });
}

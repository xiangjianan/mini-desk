export interface HighlightSegment {
  text: string;
  match: boolean;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesSearch(text: string, normalized: string): boolean {
  if (!normalized) return false;
  return text.toLowerCase().includes(normalized.toLowerCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitHighlightSegments(text: string, normalized: string): HighlightSegment[] {
  if (!normalized) return [{ text, match: false }];
  const pattern = new RegExp(`(${escapeRegExp(normalized)})`, "gi");
  const parts = text.split(pattern);
  const segments: HighlightSegment[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === "") continue;
    segments.push({ text: part, match: index % 2 === 1 });
  }
  return segments.length ? segments : [{ text, match: false }];
}

import type { PolishTodoItem } from '../sync/polishClient';
import type { QuickApiBodyType, QuickApiHeader, QuickApiMethod, QuickButtonType } from '../types';
export interface QuickDraft { id?: string; title: string; value: string; type: QuickButtonType; tagTitle?: string; apiMethod?: QuickApiMethod; apiHeaders?: QuickApiHeader[]; apiBodyType?: QuickApiBodyType; apiBody?: string }
export type CapacityDraft = { workspaceId: string } & (
  | { kind: 'todos'; target: string; items: PolishTodoItem[]; afterId?: string }
  | { kind: 'quick'; items: QuickDraft[] }
  | { kind: 'list' | 'tag'; title: string }
  | { kind: 'input'; target: string; text: string }
);
const KEY = 'mini-desk-capacity-drafts-v1';
export function loadCapacityDrafts(): CapacityDraft[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is CapacityDraft => {
      if (!item || typeof item !== 'object' || typeof item.workspaceId !== 'string') return false;
      if (item.kind === 'input') return typeof item.target === 'string' && typeof item.text === 'string';
      if (item.kind === 'list' || item.kind === 'tag') return typeof item.title === 'string';
      if (!Array.isArray(item.items)) return false;
      if (item.kind === 'todos') return typeof item.target === 'string' && item.items.every((v: PolishTodoItem) => v && typeof v.text === 'string');
      return item.kind === 'quick' && item.items.every((v: QuickDraft) => v && typeof v.title === 'string' && typeof v.value === 'string' && ['text', 'link', 'api', 'app'].includes(v.type));
    });
  } catch { return []; }
}
export function saveCapacityDrafts(drafts: CapacityDraft[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(drafts)); return true; } catch { return false; }
}

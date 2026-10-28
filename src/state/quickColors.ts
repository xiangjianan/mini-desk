import type { QuickTag } from '../types';

export const QUICK_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#ef4444', '#6366f1'];
export function normalizeQuickColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}
export function nextQuickColor(tags: QuickTag[]): string {
  const counts = QUICK_COLORS.map(color => tags.filter(tag => tag.backgroundColor === color).length);
  return QUICK_COLORS[counts.indexOf(Math.min(...counts))];
}

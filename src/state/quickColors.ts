import type { QuickTag } from '../types';

export const QUICK_COLORS = ['#e88d82', '#e8b65f', '#82b89a', '#80aed5', '#aa96d3', '#d68eb3', '#75babb', '#c3a17d'];
export function normalizeQuickColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}
export function nextQuickColor(tags: QuickTag[]): string {
  const counts = QUICK_COLORS.map(color => tags.filter(tag => tag.backgroundColor === color).length);
  return QUICK_COLORS[counts.indexOf(Math.min(...counts))];
}

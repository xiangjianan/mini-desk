import type { WorkspaceData } from '../types';

export const CAPACITY_LIMITS = { images: 10, quick: 12, tags: 4, todos: 7, lists: 3 } as const;
export type CapacityKind = keyof typeof CAPACITY_LIMITS;
export interface CapacityProblem { kind: CapacityKind; target?: string; current: number; limit: number; requested: number }
export function capacityCount(workspace: WorkspaceData, kind: CapacityKind, target?: string): number {
  if (kind === 'images') return workspace.images.length;
  if (kind === 'tags') return workspace.quickTags.length;
  if (kind === 'lists') return workspace.todoLists.length;
  if (kind === 'todos') return (workspace.todos[target ?? ''] ?? []).filter(item => !item.done).length;
  const validTags = new Set(workspace.quickTags.map(tag => tag.id));
  return workspace.quickButtons.filter(item => !item.hidden && (item.tagId && validTags.has(item.tagId) ? item.tagId : undefined) === target).length;
}
export function checkCapacity(workspace: WorkspaceData, kind: CapacityKind, requested = 1, target?: string, unlocked = false): CapacityProblem | undefined {
  const current = capacityCount(workspace, kind, target);
  const limit = CAPACITY_LIMITS[kind];
  return !unlocked && requested > 0 && current + requested > limit ? { kind, target, current, limit, requested } : undefined;
}
/** Only net growth is gated: legacy data, shrinking, edits and undo remain usable. */
export function checkWorkspaceGrowth(before: WorkspaceData, after: WorkspaceData, unlocked = false): CapacityProblem | undefined {
  const groups: [CapacityKind, string?][] = [['images'], ['tags'], ['lists'], ...after.todoLists.map(list => ['todos', list.id] as [CapacityKind, string]), ['quick'], ...after.quickTags.map(tag => ['quick', tag.id] as [CapacityKind, string])];
  for (const [kind, target] of groups) {
    const increase = capacityCount(after, kind, target) - capacityCount(before, kind, target);
    const problem = checkCapacity(before, kind, increase, target, unlocked);
    if (problem) return problem;
  }
}

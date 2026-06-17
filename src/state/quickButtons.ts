import type { QuickButton, QuickTag } from "../types";

export interface QuickButtonGroup {
  id: string;
  title: string;
  buttons: QuickButton[];
  reorderable: boolean;
}

export const QUICK_BUTTON_EMPTY_GROUP_ID = "__empty";
export const QUICK_BUTTON_OTHER_GROUP_ID = "__other";

export function buildVisibleQuickButtonGroups(
  buttons: QuickButton[],
  tags: QuickTag[],
  showHidden: boolean,
  otherTitle: string,
): QuickButtonGroup[] {
  const taggedButtons = new Map(tags.map((tag) => [tag.id, [] as QuickButton[]]));
  const otherButtons: QuickButton[] = [];

  for (const button of buttons) {
    if (!showHidden && button.hidden) continue;
    const group = button.tagId ? taggedButtons.get(button.tagId) : undefined;
    if (group) group.push(button);
    else otherButtons.push(button);
  }

  const groups = tags.flatMap((tag): QuickButtonGroup[] => {
    const groupButtons = taggedButtons.get(tag.id) ?? [];
    return groupButtons.length > 0
      ? [{ id: tag.id, title: tag.title, buttons: groupButtons, reorderable: true }]
      : [];
  });

  if (otherButtons.length > 0) {
    groups.push({
      id: QUICK_BUTTON_OTHER_GROUP_ID,
      title: otherTitle,
      buttons: otherButtons,
      reorderable: false,
    });
  }

  return groups.length > 0
    ? groups
    : [{ id: QUICK_BUTTON_EMPTY_GROUP_ID, title: "", buttons: [], reorderable: false }];
}

export function hasOverloadedVisibleQuickButtonGroup(
  buttons: QuickButton[],
  tags: QuickTag[],
  threshold: number,
): boolean {
  const tagIds = new Set(tags.map((tag) => tag.id));
  const counts = new Map<string, number>();

  for (const button of buttons) {
    if (button.hidden) continue;
    const groupId = button.tagId && tagIds.has(button.tagId) ? button.tagId : QUICK_BUTTON_OTHER_GROUP_ID;
    const count = (counts.get(groupId) ?? 0) + 1;
    if (count > threshold) return true;
    counts.set(groupId, count);
  }

  return false;
}

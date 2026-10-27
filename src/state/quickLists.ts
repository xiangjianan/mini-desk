import type { AppLanguage, QuickButton, QuickTag } from "../types";
import { getUiText } from "./i18n";
import { createId } from "./storage/shared";

export const DEFAULT_QUICK_LIST_ID = "quick-general";

/** Upgrade the implicit untagged bucket to an ordinary, persisted list. */
export function normalizeQuickLists(tags: QuickTag[], buttons: QuickButton[], language: AppLanguage, otherCollapsed = false): { quickTags: QuickTag[]; quickButtons: QuickButton[] } {
  const ids = new Set(tags.map(tag => tag.id));
  const orphaned = buttons.some(button => !button.tagId || !ids.has(button.tagId));
  if (tags.length && !orphaned) return { quickTags: tags, quickButtons: buttons };
  const title = getUiText(language).quick.otherTag;
  let general = tags.find(tag => tag.title === title);
  let quickTags = tags;
  if (!general) {
    let id = DEFAULT_QUICK_LIST_ID;
    while (ids.has(id)) id = createId();
    general = { id, title, collapsed: otherCollapsed, column: 0 };
    quickTags = [...tags, general];
  }
  const generalId = general.id;
  return {
    quickTags,
    quickButtons: buttons.map(button => button.tagId && ids.has(button.tagId) ? button : { ...button, tagId: generalId }),
  };
}

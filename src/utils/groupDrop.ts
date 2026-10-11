/** Match row sorting: drop above a heading midpoint to insert before,
 * below it (including its content) to insert after the group. */
export function isGroupDropBefore(event: DragEvent, groupSelector: string, headingSelector: string): boolean {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return true;
  const group = target.closest(groupSelector);
  const heading = group?.querySelector(headingSelector);
  if (!heading) return true;
  const bounds = heading.getBoundingClientRect();
  if (!bounds.height || !Number.isFinite(event.clientY)) return true;
  return event.clientY < bounds.top + bounds.height / 2;
}

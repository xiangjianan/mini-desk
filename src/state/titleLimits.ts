/** Shared limit for user-authored tag, reminder list, notebook and workspace names.
 * Match native input maxlength (UTF-16 units) without splitting an emoji. */
export const TITLE_MAX_LENGTH = 20;

export function limitTitle(value: string): string {
  return value.trim().slice(0, TITLE_MAX_LENGTH).replace(/[\uD800-\uDBFF]$/, "");
}

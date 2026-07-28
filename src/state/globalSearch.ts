import { computed, ref } from "vue";
import { normalizeSearchQuery } from "../utils/searchHighlight";

export const globalSearchQuery = ref("");
export const globalSearchNormalized = computed(() => normalizeSearchQuery(globalSearchQuery.value));
export const isGlobalSearchActive = computed(() => globalSearchNormalized.value.length > 0);

export function setGlobalSearch(value: string): void {
  globalSearchQuery.value = value;
}

export function clearGlobalSearch(): void {
  globalSearchQuery.value = "";
}

/** Test-only: clear module state for isolation between tests. */
export function resetGlobalSearch(): void {
  globalSearchQuery.value = "";
}

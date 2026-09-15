import { h } from "vue";
import type { Component, VNode } from "vue";
import { NIcon } from "naive-ui";

/**
 * Shared dropdown-option icon renderer (naive-ui DropdownOption `icon` slot).
 * `danger` tints the icon with the destructive-action color; `size` defaults to
 * the 16px menu standard (smaller only for deliberate accents).
 */
export function renderIcon(icon: Component, danger = false, size = 16): () => VNode {
  return () => h(NIcon, { size, ...(danger ? { color: "var(--danger)" } : {}) }, { default: () => h(icon) });
}

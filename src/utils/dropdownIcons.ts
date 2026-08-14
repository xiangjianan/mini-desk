import { h } from "vue";
import type { Component, VNode } from "vue";
import { NIcon } from "naive-ui";

/**
 * Shared dropdown-option icon renderer (naive-ui DropdownOption `icon` slot).
 * `danger` tints the icon with the destructive-action color.
 */
export function renderIcon(icon: Component, danger = false): () => VNode {
  return () => h(NIcon, { size: 16, ...(danger ? { color: "var(--danger)" } : {}) }, { default: () => h(icon) });
}

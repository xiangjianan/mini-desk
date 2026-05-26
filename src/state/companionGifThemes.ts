import type { CompanionGifTheme } from "../types";

export const DEFAULT_COMPANION_GIF_THEME: CompanionGifTheme = "hermes";

export const COMPANION_GIF_THEME_OPTIONS: Array<{
  value: CompanionGifTheme;
  label: string;
}> = [
  { value: "hermes", label: "默认 Hermes" },
  { value: "custom", label: "自定义 GIF" },
  { value: "none", label: "无 GIF" },
];

export function normalizeCompanionGifTheme(value: unknown): CompanionGifTheme {
  return value === "none" || value === "custom" || value === "hermes" ? value : DEFAULT_COMPANION_GIF_THEME;
}

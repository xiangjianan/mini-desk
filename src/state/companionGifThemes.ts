import type { CompanionGifTheme } from "../types";

export const DEFAULT_COMPANION_GIF_THEME: CompanionGifTheme = "ikun";

export const COMPANION_GIF_THEME_OPTIONS: Array<{
  value: CompanionGifTheme;
  label: string;
}> = [
  { value: "ikun", label: "ikun" },
  { value: "hermes", label: "云霞" },
  { value: "custom", label: "自定义" },
  { value: "none", label: "不显示" },
];

export function normalizeCompanionGifTheme(value: unknown): CompanionGifTheme {
  return value === "ikun" || value === "none" || value === "custom" || value === "hermes" ? value : DEFAULT_COMPANION_GIF_THEME;
}

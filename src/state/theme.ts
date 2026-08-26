import type { ThemeMode } from "../types";

/** 解析后的实际渲染主题：仅明/暗两态，供视觉决策（data-theme、Naive 主题、GIF/logo 等）。 */
export type ResolvedTheme = Exclude<ThemeMode, "auto">;

/** 主题按钮的循环顺序：浅色 → 深色 → 跟随系统 → 浅色。 */
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "auto"] as const;

/** 依据用户偏好与系统明暗解析出实际渲染主题。 */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === "auto") return systemDark ? "dark" : "light";
  return mode;
}

/** 点击主题按钮时的下一个模式。 */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_MODES.indexOf(mode);
  const next = THEME_MODES[index + 1] ?? THEME_MODES[0];
  return next;
}

/** 持久化/导入时的主题值归一：显式三态直接保留，未知/缺失回退为跟随系统（auto）。 */
export function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === "light" || value === "dark" || value === "auto") return value;
  return "auto";
}

import type { ThemeMode } from "../types";

/** 解析后的实际渲染主题：仅明/暗两态，供视觉决策（data-theme、Naive 主题、GIF/logo 等）。 */
export type ResolvedTheme = Exclude<ThemeMode, "auto">;

/** 依据用户偏好与系统明暗解析出实际渲染主题。auto 仅表示「尚未手动选择」：跟随系统。 */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === "auto") return systemDark ? "dark" : "light";
  return mode;
}

/** 点击主题按钮：切到当前实际主题的反色，并固化为显式明/暗 —— 一经手动选择即脱离跟随系统。 */
export function nextManualTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  return resolveTheme(mode, systemDark) === "dark" ? "light" : "dark";
}

/** 持久化/导入时的主题值归一：显式值直接保留，未知/缺失回退为 auto（首次打开跟随系统）。 */
export function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === "light" || value === "dark" || value === "auto") return value;
  return "auto";
}

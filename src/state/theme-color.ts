/**
 * standalone 窗口标题栏（meta theme-color）与应用主题的联动取色。
 * 值需与 public/theme-boot.js 中的映射保持一致——该脚本在首帧渲染前执行，
 * 无法共享本模块（有测试守护两处一致性）。
 */
export const THEME_COLOR_META = {
  light: "#f5f5f7",
  dark: "#1c1c1e",
} as const;

export type ThemeName = keyof typeof THEME_COLOR_META;

export function applyThemeColor(theme: ThemeName): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR_META[theme];
}

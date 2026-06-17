import type { CompanionCustomGif, CompanionGifTheme, ThemeMode } from "../types";
import catGif from "../../static/video/mini-desk-cat.gif?url";
import catDarkGif from "../../static/video/mini-desk-cat-dark.gif?url";
import ikunGif from "../../static/video/kun.gif?url";
import ikunDarkGif from "../../static/video/kun-dark.gif?url";
import hermesGif from "../../static/video/yunxia.gif?url";
import hermesDarkGif from "../../static/video/yunxia-dark.gif?url";
import catNotificationIcon from "../../static/img/mini-desk-cat.png?url";
import catDarkNotificationIcon from "../../static/img/mini-desk-cat-dark.png?url";
import ikunNotificationIcon from "../../static/img/kun.jpg?url";
import ikunDarkNotificationIcon from "../../static/img/kun-dark.jpg?url";
import hermesNotificationIcon from "../../static/img/yunxia.jpg?url";
import hermesDarkNotificationIcon from "../../static/img/yunxia-dark.jpg?url";

export const DEFAULT_COMPANION_GIF_THEME: CompanionGifTheme = "cat";

export const COMPANION_GIF_THEME_OPTIONS: Array<{
  value: CompanionGifTheme;
  label: string;
}> = [
  { value: "cat", label: "像素猫" },
  { value: "hermes", label: "云霞" },
  { value: "ikun", label: "ikun" },
  { value: "custom", label: "自定义" },
  { value: "none", label: "不显示" },
];

export function normalizeCompanionGifTheme(value: unknown): CompanionGifTheme {
  return value === "cat" || value === "ikun" || value === "none" || value === "custom" || value === "hermes" ? value : DEFAULT_COMPANION_GIF_THEME;
}

export function getCompanionGifSrc(theme: CompanionGifTheme | undefined, mode: ThemeMode, customGif: CompanionCustomGif = {}): string {
  const activeTheme = theme ?? DEFAULT_COMPANION_GIF_THEME;
  if (activeTheme === "none") return "";
  if (activeTheme === "custom") {
    return mode === "dark" ? customGif.dark || "" : customGif.light || "";
  }
  if (activeTheme === "cat") return mode === "dark" ? catDarkGif : catGif;
  if (activeTheme === "hermes") return mode === "dark" ? hermesDarkGif : hermesGif;
  return mode === "dark" ? ikunDarkGif : ikunGif;
}

export function getCompanionNotificationIconSrc(theme: CompanionGifTheme | undefined, mode: ThemeMode, customGif: CompanionCustomGif = {}): string {
  const activeTheme = theme ?? DEFAULT_COMPANION_GIF_THEME;
  if (activeTheme === "none") return "";
  if (activeTheme === "custom") return getCompanionGifSrc(activeTheme, mode, customGif);
  if (activeTheme === "cat") return mode === "dark" ? catDarkNotificationIcon : catNotificationIcon;
  if (activeTheme === "hermes") return mode === "dark" ? hermesDarkNotificationIcon : hermesNotificationIcon;
  return mode === "dark" ? ikunDarkNotificationIcon : ikunNotificationIcon;
}

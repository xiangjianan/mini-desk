import type { AppLanguage } from "../types";

/**
 * A curated quick-launch preset for the "app" quick-button type. Selecting one
 * auto-fills the button title and URL scheme; users may also type any custom
 * scheme. Whether a preset actually launches depends on the app being installed
 * and having registered its scheme with the OS.
 */
export interface QuickAppPreset {
  title: { zh: string; en: string };
  scheme: string;
}

export const QUICK_APP_PRESETS: readonly QuickAppPreset[] = [
  { title: { zh: "微信", en: "WeChat" }, scheme: "wechat://" },
  { title: { zh: "钉钉", en: "DingTalk" }, scheme: "dingtalk://" },
  { title: { zh: "飞书", en: "Lark" }, scheme: "lark://" },
  { title: { zh: "企业微信", en: "WeCom" }, scheme: "wxwork://" },
  { title: { zh: "VS Code", en: "VS Code" }, scheme: "vscode://" },
  { title: { zh: "Xcode", en: "Xcode" }, scheme: "xcode://" },
  { title: { zh: "App Store", en: "App Store" }, scheme: "macappstore://" },
  { title: { zh: "系统设置", en: "System Settings" }, scheme: "x-apple.systempreferences:" },
  { title: { zh: "Slack", en: "Slack" }, scheme: "slack://" },
  { title: { zh: "Spotify", en: "Spotify" }, scheme: "spotify://" },
  { title: { zh: "Telegram", en: "Telegram" }, scheme: "tg://" },
  { title: { zh: "Figma", en: "Figma" }, scheme: "figma://" },
  { title: { zh: "Notion", en: "Notion" }, scheme: "notion://" },
];

/** Resolve a preset's display title for the active language. */
export function getQuickAppPresetTitle(preset: QuickAppPreset, language: AppLanguage): string {
  return preset.title[language] ?? preset.title.zh;
}

/** Find the preset whose scheme matches the given value (exact, trimmed). */
export function findQuickAppPresetByScheme(scheme: string): QuickAppPreset | undefined {
  const trimmed = scheme.trim();
  return QUICK_APP_PRESETS.find((preset) => preset.scheme === trimmed);
}

/** A custom URL scheme looks like `name://` or `name:` (not a plain web URL). */
export function isQuickAppScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.\-]*:/i.test(value.trim()) && !/^https?:\/\//i.test(value.trim());
}

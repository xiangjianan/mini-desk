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
  /** Short hint shown in parentheses in the picker: what (if anything) to append
      after the scheme. Omit when no deep link is known. */
  hint?: { zh: string; en: string };
}

export const QUICK_APP_PRESETS: readonly QuickAppPreset[] = [
  // "im:" opens WeLink; append the target's employee number, e.g. im:10012345.
  { title: { zh: "WeLink", en: "WeLink" }, scheme: "im:", hint: { zh: "工号", en: "employee ID" } },
  { title: { zh: "微信", en: "WeChat" }, scheme: "wechat://", hint: { zh: "仅启动", en: "launch only" } },
  { title: { zh: "钉钉", en: "DingTalk" }, scheme: "dingtalk://", hint: { zh: "仅启动", en: "launch only" } },
  { title: { zh: "飞书", en: "Lark" }, scheme: "lark://", hint: { zh: "仅启动", en: "launch only" } },
  { title: { zh: "企业微信", en: "WeCom" }, scheme: "wxwork://", hint: { zh: "message?userid=", en: "message?userid=" } },
  // "sms:" opens iMessage; append the recipient's phone number, e.g. sms:13800138000.
  { title: { zh: "iMessage", en: "iMessage" }, scheme: "sms:", hint: { zh: "手机号", en: "phone number" } },
  { title: { zh: "VS Code", en: "VS Code" }, scheme: "vscode://", hint: { zh: "file/路径", en: "file/path" } },
  { title: { zh: "Xcode", en: "Xcode" }, scheme: "xcode://", hint: { zh: "仅启动", en: "launch only" } },
  { title: { zh: "App Store", en: "App Store" }, scheme: "macappstore://", hint: { zh: "应用链接", en: "app URL" } },
  { title: { zh: "系统设置", en: "System Settings" }, scheme: "x-apple.systempreferences:", hint: { zh: "面板ID", en: "pane id" } },
  { title: { zh: "Slack", en: "Slack" }, scheme: "slack://", hint: { zh: "channel?...", en: "channel?..." } },
  { title: { zh: "Spotify", en: "Spotify" }, scheme: "spotify://", hint: { zh: "track:ID", en: "track:ID" } },
  { title: { zh: "Telegram", en: "Telegram" }, scheme: "tg://", hint: { zh: "resolve?domain=", en: "resolve?domain=" } },
  { title: { zh: "Figma", en: "Figma" }, scheme: "figma://", hint: { zh: "file/KEY", en: "file/KEY" } },
  { title: { zh: "Notion", en: "Notion" }, scheme: "notion://", hint: { zh: "页面链接", en: "page URL" } },
];

/** Resolve a preset's display title for the active language. */
export function getQuickAppPresetTitle(preset: QuickAppPreset, language: AppLanguage): string {
  return preset.title[language] ?? preset.title.zh;
}

/** Resolve the short append-hint for the active language ("" when none). */
export function getQuickAppPresetHint(preset: QuickAppPreset, language: AppLanguage): string {
  return preset.hint ? (preset.hint[language] ?? preset.hint.zh) : "";
}

/** Find the preset whose scheme matches the given value (exact, trimmed). */
export function findQuickAppPresetByScheme(scheme: string): QuickAppPreset | undefined {
  const trimmed = scheme.trim();
  return QUICK_APP_PRESETS.find((preset) => preset.scheme === trimmed);
}

/**
 * Schemes that execute script or read local/user resources when activated via
 * an anchor click. They must never be launchable from a quick button, because
 * imported workspace files can plant them (stored XSS).
 */
const DANGEROUS_QUICK_APP_SCHEMES = new Set([
  "javascript",
  "data",
  "vbscript",
  "blob",
  "file",
  "filesystem",
  "view-source",
  "about",
  "chrome",
  "chrome-extension",
  "moz-extension",
  "edge",
  "resource",
  "jar",
  "ws",
  "wss",
]);

/** Extract the scheme token of a URL-like value ("" when none), ignoring the
    whitespace browsers strip inside anchors (a classic filter bypass: an anchor
    with href "jav\tascript:x" navigates to "javascript:x"). */
function getUrlScheme(value: string): string {
  const sanitized = value.replace(/[\t\n\r]/g, "").trim();
  const match = /^[a-z][a-z0-9+.\-]*:/i.exec(sanitized);
  return match ? match[0].slice(0, -1).toLowerCase() : "";
}

/** A custom URL scheme looks like `name://` or `name:` (not a plain web URL,
    not a web URL, and not a scheme that executes script or reads local files). */
export function isQuickAppScheme(value: string): boolean {
  const scheme = getUrlScheme(value);
  return scheme !== "" && scheme !== "http" && scheme !== "https" && !DANGEROUS_QUICK_APP_SCHEMES.has(scheme);
}

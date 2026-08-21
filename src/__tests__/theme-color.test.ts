import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { applyThemeColor, THEME_COLOR_META } from "../state/theme-color";

function themeColorMeta(): HTMLMetaElement | null {
  return document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
}

describe("theme-color meta (src/state/theme-color.ts)", () => {
  beforeEach(() => {
    themeColorMeta()?.remove();
  });

  it("maps the light theme to the app's light canvas color", () => {
    applyThemeColor("light");

    expect(themeColorMeta()?.content).toBe(THEME_COLOR_META.light);
    expect(themeColorMeta()?.content).toBe("#f5f5f7");
  });

  it("maps the dark theme to the app's dark canvas color", () => {
    applyThemeColor("dark");

    expect(themeColorMeta()?.content).toBe(THEME_COLOR_META.dark);
    expect(themeColorMeta()?.content).toBe("#1c1c1e");
  });

  it("creates the meta tag when the document does not have one yet", () => {
    expect(themeColorMeta()).toBeNull();

    applyThemeColor("dark");

    expect(themeColorMeta()).not.toBeNull();
    expect(themeColorMeta()?.content).toBe("#1c1c1e");
  });

  it("keeps the standalone title bar in sync from applyTheme in App.vue", () => {
    const app = readFileSync("src/App.vue", "utf8");

    expect(app).toContain("applyThemeColor(state.theme)");
  });

  it("keeps the static fallback and boot script aligned with the runtime mapping", () => {
    const index = readFileSync("index.html", "utf8");
    const manifest = readFileSync("public/manifest.webmanifest", "utf8");
    const boot = readFileSync("public/theme-boot.js", "utf8");

    // 静态回退色 = 浅色默认值；theme-boot 无法共享模块，值必须与运行时映射一致。
    expect(index).toContain('<meta name="theme-color" content="#f5f5f7"');
    expect(manifest).toContain('"theme_color": "#f5f5f7"');
    expect(boot).toContain(THEME_COLOR_META.dark);
    expect(boot).toContain(THEME_COLOR_META.light);
  });
});

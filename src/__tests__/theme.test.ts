import { describe, expect, it } from "vitest";
import { nextManualTheme, normalizeThemeMode, resolveTheme } from "../state/theme";
import { defaultState } from "../state/defaults";

describe("theme mode helpers (src/state/theme.ts)", () => {
  it("resolveTheme pins explicit modes regardless of the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("resolveTheme follows the system preference in auto mode", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });

  it("nextManualTheme 切到当前实际主题的反色，并固化为显式明/暗（不再回到跟随系统）", () => {
    expect(nextManualTheme("light", true)).toBe("dark");
    expect(nextManualTheme("dark", true)).toBe("light");
    // auto：按系统解析后取反色；一经手动点击即脱离跟随系统。
    expect(nextManualTheme("auto", true)).toBe("light");
    expect(nextManualTheme("auto", false)).toBe("dark");
  });

  it("normalizeThemeMode keeps explicit modes and falls back to auto for unknown/missing", () => {
    expect(normalizeThemeMode("light")).toBe("light");
    expect(normalizeThemeMode("dark")).toBe("dark");
    expect(normalizeThemeMode("auto")).toBe("auto");
    expect(normalizeThemeMode("future-theme")).toBe("auto");
    expect(normalizeThemeMode(undefined)).toBe("auto");
  });

  it("default state follows the system (auto) theme", () => {
    expect(defaultState().theme).toBe("auto");
  });
});

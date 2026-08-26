import { describe, expect, it } from "vitest";
import { nextThemeMode, normalizeThemeMode, resolveTheme } from "../state/theme";
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

  it("nextThemeMode cycles light → dark → auto → light", () => {
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("auto");
    expect(nextThemeMode("auto")).toBe("light");
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

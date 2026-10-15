import { describe, expect, it } from "vitest";
import { limitTitle, TITLE_MAX_LENGTH } from "../state/titleLimits";

describe("user-authored title limits", () => {
  it("trims and caps Chinese and English names at the shared input limit", () => {
    expect(limitTitle("  工作空间  ")).toBe("工作空间");
    for (const text of ["标".repeat(30), "a".repeat(30)]) {
      expect(limitTitle(text)).toBe(text.slice(0, TITLE_MAX_LENGTH));
    }
    expect(limitTitle("   ")).toBe("");
  });

  it("does not leave half an emoji at the limit", () => {
    expect(limitTitle("a".repeat(19) + "😀")).toBe("a".repeat(19));
    expect(limitTitle("a".repeat(18) + "😀")).toBe("a".repeat(18) + "😀");
  });
});

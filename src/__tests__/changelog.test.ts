import { describe, expect, it } from "vitest";
import { CHANGELOG } from "../state/changelog";
import { FALLBACK_APP_VERSION } from "../state/version";

describe("changelog", () => {
  it("每条记录都带版本号、日期和中英分点说明", () => {
    for (const entry of CHANGELOG) {
      expect(typeof entry.version).toBe("string");
      expect(entry.version.length).toBeGreaterThan(0);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.notes.zh.length).toBeGreaterThan(0);
      expect(entry.notes.en.length).toBeGreaterThan(0);
      for (const note of [...entry.notes.zh, ...entry.notes.en]) {
        expect(note.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("按版本从新到旧排列（newest-first）", () => {
    const versions = CHANGELOG.map((entry) => entry.version);
    const sorted = [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    expect(versions).toEqual(sorted);
  });

  it("版本号唯一", () => {
    const versions = CHANGELOG.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("包含当前应用版本", () => {
    expect(CHANGELOG.map((entry) => entry.version)).toContain(FALLBACK_APP_VERSION);
  });
});

import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearchQuery, splitHighlightSegments } from "../utils/searchHighlight";

describe("searchHighlight", () => {
  it("normalizes by trimming and lowercasing", () => {
    expect(normalizeSearchQuery("  Foo  ")).toBe("foo");
    expect(normalizeSearchQuery("GitHub")).toBe("github");
  });

  it("matches substring case-insensitively, false on empty query", () => {
    expect(matchesSearch("Deploy prod", "prod")).toBe(true);
    expect(matchesSearch("Deploy prod", "PROD")).toBe(true);
    expect(matchesSearch("Deploy prod", "")).toBe(false);
    expect(matchesSearch("Deploy prod", "xyz")).toBe(false);
  });

  it("splits into alternating non-match/match segments", () => {
    expect(splitHighlightSegments("GitHub", "gi")).toEqual([
      { text: "Gi", match: true },
      { text: "tHub", match: false },
    ]);
  });

  it("returns one non-match segment when query is empty", () => {
    expect(splitHighlightSegments("GitHub", "")).toEqual([{ text: "GitHub", match: false }]);
  });

  it("returns one non-match segment when nothing matches", () => {
    expect(splitHighlightSegments("GitHub", "zzz")).toEqual([{ text: "GitHub", match: false }]);
  });

  it("handles multiple matches", () => {
    expect(splitHighlightSegments("aa-bb-aa", "aa")).toEqual([
      { text: "aa", match: true },
      { text: "-bb-", match: false },
      { text: "aa", match: true },
    ]);
  });

  it("escapes regex-special characters in the query", () => {
    expect(splitHighlightSegments("a.b()d", "(")).toEqual([
      { text: "a.b", match: false },
      { text: "(", match: true },
      { text: ")d", match: false },
    ]);
  });
});

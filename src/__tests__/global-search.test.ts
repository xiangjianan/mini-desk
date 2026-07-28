import { afterEach, describe, expect, it } from "vitest";
import {
  clearGlobalSearch,
  globalSearchNormalized,
  globalSearchQuery,
  isGlobalSearchActive,
  resetGlobalSearch,
  setGlobalSearch,
} from "../state/globalSearch";

afterEach(() => {
  resetGlobalSearch();
});

describe("globalSearch", () => {
  it("starts empty and inactive", () => {
    expect(globalSearchQuery.value).toBe("");
    expect(globalSearchNormalized.value).toBe("");
    expect(isGlobalSearchActive.value).toBe(false);
  });

  it("setGlobalSearch updates query, normalized, and active flag", () => {
    setGlobalSearch("  Foo  ");
    expect(globalSearchQuery.value).toBe("  Foo  ");
    expect(globalSearchNormalized.value).toBe("foo");
    expect(isGlobalSearchActive.value).toBe(true);
  });

  it("clearGlobalSearch resets to empty/inactive", () => {
    setGlobalSearch("foo");
    clearGlobalSearch();
    expect(globalSearchQuery.value).toBe("");
    expect(isGlobalSearchActive.value).toBe(false);
  });

  it("whitespace-only query is inactive", () => {
    setGlobalSearch("   ");
    expect(isGlobalSearchActive.value).toBe(false);
  });
});

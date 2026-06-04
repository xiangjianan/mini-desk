import { describe, expect, it } from "vitest";
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from "../state/defaults";
import { loadState, saveState } from "../state/storage";

describe("storage key migration", () => {
  it("stores board state under the mini-desk key", () => {
    const storage = localStorage;
    storage.clear();

    const state = loadState(storage);
    state.language = "en";
    saveState(state, storage);

    expect(STORAGE_KEY).toBe("mini-desk-state-v1");
    expect(storage.getItem(STORAGE_KEY)).toContain('"language":"en"');
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("loads board state from the legacy todo-board key", () => {
    const storage = localStorage;
    storage.clear();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ language: "en", theme: "dark" }));

    expect(loadState(storage)).toMatchObject({
      language: "en",
      theme: "dark",
    });
  });
});

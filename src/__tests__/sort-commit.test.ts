import { afterEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { suppressSortCommitMotion } from "../utils/sortCommit";

afterEach(() => vi.unstubAllGlobals());
it("suppresses motion through Vue commit and transition hooks, then restores normal motion", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  const root = document.createElement("div");
  suppressSortCommitMotion(root);
  expect(root.classList.contains("is-sort-committing")).toBe(true);
  await nextTick();
  frames.shift()!(0);
  expect(root.classList.contains("is-sort-committing")).toBe(true);
  frames.shift()!(16);
  expect(root.classList.contains("is-sort-committing")).toBe(false);
});

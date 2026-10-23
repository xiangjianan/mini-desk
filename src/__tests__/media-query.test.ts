import { afterEach, describe, expect, it, vi } from "vitest";
import { observeMediaQuery } from "../utils/mediaQuery";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("media query subscription", () => {
  it.each([false, true])("reports the initial value and removes the same listener (legacy=%s)", (legacy) => {
    const add = vi.fn();
    const remove = vi.fn();
    const media = {
      matches: true,
      ...(legacy ? { addListener: add, removeListener: remove } : { addEventListener: add, removeEventListener: remove }),
    } as unknown as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockReturnValue(media);
    const changed = vi.fn();
    const dispose = observeMediaQuery("(max-width: 940px)", changed);
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    const listener = add.mock.calls[0][legacy ? 0 : 1];
    listener({ matches: false });
    expect(changed).toHaveBeenLastCalledWith(false);
    dispose();
    expect(remove.mock.calls[0]).toEqual(legacy ? [listener] : ["change", listener]);
  });

  it("supports environments without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    const changed = vi.fn();
    expect(() => observeMediaQuery("(prefers-color-scheme: dark)", changed)()).not.toThrow();
    expect(changed).not.toHaveBeenCalled();
  });
});

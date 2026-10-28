import { describe, expect, it, vi } from "vitest";
import { preventNativeContextMenu } from "../utils/contextMenu";

describe("native context menu suppression", () => {
  it("prevents the browser menu while allowing custom handlers to run, including inside menus", () => {
    const container = document.createElement("div");
    const menuItem = document.createElement("button");
    container.append(menuItem);
    document.body.append(container);
    const customHandler = vi.fn((event: Event) => event.stopPropagation());
    menuItem.addEventListener("contextmenu", customHandler);
    document.addEventListener("contextmenu", preventNativeContextMenu, true);
    try {
      for (const target of [container, menuItem, document.body]) {
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
      expect(customHandler).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener("contextmenu", preventNativeContextMenu, true);
      container.remove();
    }
  });
});

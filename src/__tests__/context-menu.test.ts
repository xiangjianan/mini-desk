import { describe, expect, it, vi } from "vitest";
import { createExclusiveContextMenu } from "../utils/contextMenu";

function eventAt(timeStamp: number): Event {
  return { timeStamp } as Event;
}

describe("exclusive context menus", () => {
  it("closes an initially opened menu on the first outside event", () => {
    const close = vi.fn();
    const menu = createExclusiveContextMenu(close);

    menu.notifyOpen(eventAt(20));
    menu.handleClickOutside(eventAt(21));

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not let the pending outside event from a replaced menu close the fresh menu", () => {
    const close = vi.fn();
    const menu = createExclusiveContextMenu(close);

    menu.notifyOpen(eventAt(20), { replacingExistingMenu: true });
    menu.handleClickOutside(eventAt(21));

    expect(close).not.toHaveBeenCalled();

    menu.handleClickOutside(eventAt(40));

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes a previous menu when another exclusive menu opens", () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const first = createExclusiveContextMenu(closeFirst);
    const second = createExclusiveContextMenu(closeSecond);
    first.mount();
    second.mount();

    first.notifyOpen(eventAt(1));
    closeFirst.mockClear();
    closeSecond.mockClear();
    second.notifyOpen(eventAt(2));

    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).not.toHaveBeenCalled();

    first.unmount();
    second.unmount();
  });
});

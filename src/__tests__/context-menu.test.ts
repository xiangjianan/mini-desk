import { describe, expect, it, vi } from "vitest";
import { organizeContextMenu, createExclusiveContextMenu } from "../utils/contextMenu";

function eventAt(timeStamp: number): Event {
  return { timeStamp } as Event;
}

describe("exclusive context menus", () => {
  it("lets toolbar trigger clicks reach the toggle handler, including nested icons", () => {
    const close = vi.fn();
    const anchor = document.createElement("button");
    const icon = anchor.appendChild(document.createElement("span"));
    const menu = createExclusiveContextMenu(close, () => anchor);
    menu.handleClickOutside({ target: icon } as unknown as Event);
    expect(close).not.toHaveBeenCalled();
    menu.handleClickOutside({ target: document.body } as unknown as Event);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not protect a heading used as a broad right-click anchor", () => {
    const close = vi.fn();
    const anchor = document.createElement("div");
    const title = anchor.appendChild(document.createElement("h3"));
    const menu = createExclusiveContextMenu(close, () => anchor);
    menu.handleClickOutside({ target: title } as unknown as Event);
    expect(close).toHaveBeenCalledTimes(1);
  });

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


describe("context menu sections", () => {
  it("groups common actions before editing and movement, with deletion and tips last", () => {
    const children = [{ key: "target", label: "Target", disabled: true }];
    const result = organizeContextMenu([
      { key: "edit", label: "Edit" }, { key: "guide", label: "Tips" },
      { key: "delete", label: "Delete", disabled: true },
      { key: "move-item", label: "Move", children }, { key: "copy", label: "Copy" },
    ]);
    expect(result.filter((item) => item.type !== "divider").map((item) => item.key))
      .toEqual(["copy", "edit", "move-item", "delete", "guide"]);
    expect(result.filter((item) => item.type === "divider")).toHaveLength(4);
    expect(result.find((item) => item.key === "move-item")?.children).toBe(children);
    expect(result.find((item) => item.key === "delete")?.disabled).toBe(true);
    expect(organizeContextMenu([])).toEqual([]);
  });
});

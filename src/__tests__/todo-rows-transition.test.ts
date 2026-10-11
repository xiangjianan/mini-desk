import { describe, expect, it, vi } from "vitest";
import { createTodoLeaveHooks } from "../components/TodoRowsTransition";

describe("reminder row leave layout", () => {
  it("animates the released height and cancels an interrupted shrink", () => {
    const list = document.createElement("ul");
    const row = list.appendChild(document.createElement("li"));
    let height = 100;
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
    const animation = { cancel: vi.fn(), finished: new Promise(() => {}) };
    const animate = vi.fn(() => animation as unknown as Animation);
    list.animate = animate;
    const hooks = createTodoLeaveHooks();
    hooks.onBeforeLeave(row);
    row.remove();
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({ height: list.style.minHeight ? 100 : 58 }) as DOMRect);
    hooks.onAfterLeave(row);
    expect(animate).toHaveBeenCalledWith(
      [{ height: "100px" }, { height: "58px" }],
      { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({ height: 80 }) as DOMRect);
    list.appendChild(row);
    hooks.onBeforeLeave(row);
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(list.style.minHeight).toBe("80px");
    hooks.dispose();
    expect(list.style.minHeight).toBe("");
    expect(row.style.top).toBe("");
  });

  it.each([1, 3])("holds list height while its last row fades with %i rows", (count) => {
    const list = document.createElement("ul");
    const rows = Array.from({ length: count }, () => list.appendChild(document.createElement("li")));
    list.style.minHeight = "12px";
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue({ height: count * 42 + 16 } as DOMRect);
    const row = rows.at(-1)!;
    Object.defineProperty(row, "offsetTop", { value: (count - 1) * 42 + 8 });
    const hooks = createTodoLeaveHooks();
    hooks.onBeforeLeave(row);
    expect(list.style.minHeight).toBe(`${count * 42 + 16}px`);
    expect(row.style.top).toBe(`${(count - 1) * 42 + 8}px`);
    row.remove();
    hooks.onAfterLeave(row);
    expect(list.style.minHeight).toBe("12px");
    expect(row.style.top).toBe("");
  });

  it("releases the height only after every leaving row finishes or cancels", () => {
    const list = document.createElement("ul");
    const first = list.appendChild(document.createElement("li"));
    const last = list.appendChild(document.createElement("li"));
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue({ height: 100 } as DOMRect);
    const hooks = createTodoLeaveHooks();
    hooks.onBeforeLeave(first);
    hooks.onBeforeLeave(last);
    hooks.onAfterLeave(first);
    expect(list.style.minHeight).toBe("100px");
    hooks.onLeaveCancelled(last);
    expect(list.style.minHeight).toBe("");
  });
});

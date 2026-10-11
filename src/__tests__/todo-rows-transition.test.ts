import { describe, expect, it, vi } from "vitest";
import { createTodoLeaveHooks } from "../components/TodoRowsTransition";

describe("reminder row leave layout", () => {
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

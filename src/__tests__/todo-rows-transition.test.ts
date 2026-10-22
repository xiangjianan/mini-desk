import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import TodoRowsTransition, { createTodoLeaveHooks } from "../components/TodoRowsTransition";

describe("reminder row leave layout", () => {
  it("grows immediately when the first reminder replaces a hidden empty marker", () => {
    const list = document.createElement("ul");
    const marker = list.appendChild(document.createElement("li"));
    marker.className = "todo-empty-hint";
    marker.style.display = "none";
    let height = 0;
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => {}) }) as unknown as Animation);
    list.animate = animate;
    const hooks = createTodoLeaveHooks();
    hooks.beforeUpdate(list);
    hooks.onBeforeLeave(marker);
    height = 50;
    hooks.afterUpdate(list);
    expect(list.style.height).toBe("");
    expect(list.style.minHeight).toBe("");
    expect(animate).toHaveBeenCalledWith(
      [{ height: "0px" }, { height: "50px" }],
      expect.objectContaining({ duration: 220 }),
    );
    hooks.onAfterLeave(marker);
    expect(animate).toHaveBeenCalledOnce();
    hooks.dispose();
  });

  it("holds a single row height until fading ends, then grows to the taller empty placeholder", () => {
    const list = document.createElement("ul");
    const row = list.appendChild(document.createElement("li"));
    let naturalHeight = 58;
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({
      height: list.style.height ? Number.parseFloat(list.style.height) : naturalHeight,
    }) as DOMRect);
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => {}) }) as unknown as Animation);
    list.animate = animate;
    const hooks = createTodoLeaveHooks();
    hooks.beforeUpdate(list);
    hooks.onBeforeLeave(row);
    list.appendChild(document.createElement("li")).className = "todo-empty-hint";
    naturalHeight = 106;
    hooks.afterUpdate(list);
    expect(list.getBoundingClientRect().height).toBe(58);
    expect(animate).not.toHaveBeenCalled();
    row.remove();
    hooks.onAfterLeave(row);
    expect(list.style.height).toBe("");
    expect(animate).toHaveBeenCalledWith(
      [{ height: "58px" }, { height: "106px" }],
      expect.objectContaining({ duration: 220 }),
    );
    hooks.dispose();
  });

  it("connects height measurement and expansion to memoized list updates", async () => {
    const wrapper = mount(TodoRowsTransition, {
      props: { memo: [1], tag: "ul" },
      slots: { default: () => h("li", "Reminder") },
      global: { stubs: { "transition-group": false } },
    });
    const list = wrapper.get("ul").element as HTMLElement;
    vi.spyOn(list, "getBoundingClientRect")
      .mockReturnValueOnce({ height: 58 } as DOMRect)
      .mockReturnValue({ height: 100 } as DOMRect);
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => {}) }) as unknown as Animation);
    list.animate = animate;
    await wrapper.setProps({ memo: [2] });
    expect(animate).toHaveBeenCalledWith([{ height: "58px" }, { height: "100px" }], expect.objectContaining({ duration: 220 }));
    wrapper.unmount();
  });

  it("animates growth from the height before insertion and continues from an interrupted animation", () => {
    const list = document.createElement("ul");
    let height = 58;
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
    const animation = { cancel: vi.fn(), finished: new Promise(() => {}) };
    const animate = vi.fn(() => animation as unknown as Animation);
    list.animate = animate;
    const hooks = createTodoLeaveHooks();
    hooks.beforeUpdate(list);
    height = 100;
    hooks.afterUpdate(list);
    expect(animate).toHaveBeenLastCalledWith(
      [{ height: "58px" }, { height: "100px" }],
      { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    height = 80;
    hooks.beforeUpdate(list);
    expect(animation.cancel).toHaveBeenCalledOnce();
    height = 142;
    hooks.afterUpdate(list);
    expect(animate).toHaveBeenLastCalledWith([{ height: "80px" }, { height: "142px" }], expect.objectContaining({ duration: 220 }));
    hooks.dispose();
  });

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


it("does not pin or animate list height when a drag commits into its reserved gap", () => {
  const root = document.createElement("section");
  root.className = "is-sort-committing";
  const list = root.appendChild(document.createElement("ul"));
  const row = list.appendChild(document.createElement("li"));
  let height = 100;
  vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
  const animate = vi.fn();
  list.animate = animate;
  const hooks = createTodoLeaveHooks();
  hooks.beforeUpdate(list);
  hooks.onBeforeLeave(row);
  height = 50;
  hooks.afterUpdate(list);
  expect(list.style.height).toBe("");
  expect(list.style.minHeight).toBe("");
  expect(animate).not.toHaveBeenCalled();
  hooks.dispose();
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { installScrollActivity, SCROLLBAR_IDLE_MS } from "../utils/scrollActivity";

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers();
  const root = document.createElement("div");
  root.innerHTML = `<section class="workbench-zone">
    <div class="n-scrollbar"><div class="n-scrollbar-container"></div></div>
    <div class="todo-column"></div><textarea class="text-editor-textarea"></textarea>
    <div class="text-mirror"></div>
  </section><div class="outside"></div>`;
  document.body.append(root);
  const dispose = installScrollActivity(root);
  disposers.push(dispose);
  return { root, dispose };
}

function scroll(target: Element) { target.dispatchEvent(new Event("scroll")); }

describe("desk scrollbar activity", () => {
  it("captures native scrolls and keeps the Naive UI rail visible until scrolling stops", () => {
    const { root } = setup();
    const container = root.querySelector(".n-scrollbar-container")!;
    const wrapper = root.querySelector(".n-scrollbar")!;
    expect(wrapper.classList.contains("is-scrolling")).toBe(false);
    scroll(container);
    expect(wrapper.classList.contains("is-scrolling")).toBe(true);
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS - 1);
    scroll(container);
    vi.advanceTimersByTime(SCROLLBAR_IDLE_MS - 1);
    expect(wrapper.classList.contains("is-scrolling")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(wrapper.classList.contains("is-scrolling")).toBe(false);
    expect(container.classList.contains("is-scrolling")).toBe(false);
  });

  it("tracks independent columns and newly mounted editors without showing on hover", () => {
    const { root } = setup();
    const column = root.querySelector(".todo-column")!;
    column.dispatchEvent(new MouseEvent("mouseenter"));
    expect(column.classList.contains("is-scrolling")).toBe(false);
    scroll(column);
    vi.advanceTimersByTime(400);
    const editor = document.createElement("textarea");
    root.querySelector(".workbench-zone")!.append(editor);
    scroll(editor);
    vi.advanceTimersByTime(400);
    expect(column.classList.contains("is-scrolling")).toBe(false);
    expect(editor.classList.contains("is-scrolling")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(editor.classList.contains("is-scrolling")).toBe(false);
  });

  it("ignores mirror synchronization and scrolls outside the desk regions", () => {
    const { root } = setup();
    scroll(root.querySelector(".text-mirror")!);
    scroll(root.querySelector(".outside")!);
    expect(root.querySelector(".is-scrolling")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes pending timers, active classes and the capture listener on unmount", () => {
    const { root, dispose } = setup();
    const column = root.querySelector(".todo-column")!;
    scroll(column);
    dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(root.querySelector(".is-scrolling")).toBeNull();
    scroll(column);
    expect(column.classList.contains("is-scrolling")).toBe(false);
  });
});

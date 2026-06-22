import { mount } from "@vue/test-utils";
import { readFileSync } from "fs";
import { resolve } from "path";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImagePanel from "../components/ImagePanel.vue";
import type { StoredImage } from "../types";

const dropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: `
    <div>
      <slot />
      <button
        v-for="option in options"
        :key="option.key"
        class="dropdown-option"
        type="button"
        @click="$emit('select', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  `,
};

function mountImagePanel(images: StoredImage[] = [], props = {}) {
  return mount(ImagePanel, {
    props: {
      title: "截图",
      images,
      ...props,
    },
    global: {
      stubs: {
        Dropdown: dropdownStub,
        NDropdown: dropdownStub,
      },
    },
  });
}

function readSource(path: string): string {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

function dispatchPointer(target: EventTarget, type: string, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  Object.defineProperty(event, "pointerId", { configurable: true, value: 1 });
  Object.defineProperty(event, "pointerType", { configurable: true, value: "mouse" });
  target.dispatchEvent(event);
  return event;
}

function mockRect(element: Element, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
      bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      toJSON: () => undefined,
    }),
  });
}

describe("ImagePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds usage guidance to the blank image-list context menu", async () => {
    const wrapper = mountImagePanel();

    await wrapper.get(".image-list").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["粘贴图片", "Tips"]);

    await wrapper.findAll(".dropdown-option")[0].trigger("click");

    expect(wrapper.emitted("paste")?.[0]).toEqual([{
      placement: "append",
      anchor: expect.any(HTMLElement),
    }]);

    await wrapper.get(".image-list").trigger("contextmenu");

    await wrapper.findAll(".dropdown-option")[1].trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["images", expect.any(HTMLElement), true]);
    wrapper.unmount();
  });

  it("opens the title edit menu from any blank point in the header bar", async () => {
    const wrapper = mountImagePanel();

    await wrapper.get(".panel-header").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["重命名"]);

    await wrapper.get(".dropdown-option").trigger("click");

    expect(wrapper.find(".title-edit-input").exists()).toBe(true);
    wrapper.unmount();
  });

  it("keeps an empty image area visually blank without rendering an empty box", async () => {
    const wrapper = mountImagePanel();

    expect(wrapper.find(".image-empty").exists()).toBe(false);

    await wrapper.get(".image-list").trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["images", expect.any(HTMLElement)]);
    expect(wrapper.emitted("paste")).toBeUndefined();
    wrapper.unmount();
  });

  it("adds contextual paste actions to image item menus", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
      { id: "c", src: "data:image/png;base64,c", createdAt: 3 },
    ]);

    await wrapper.findAll(".image-card")[1].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "预览",
      "复制",
      "编辑",
      "删除",
      "粘贴图片到上方",
      "粘贴图片到下方",
      "粘贴替换当前图片",
      "置顶",
      "置底",
      "Tips",
    ]);

    expect(wrapper.text()).not.toContain("取消置顶");

    for (const [label, placement] of [
      ["粘贴图片到上方", "before"],
      ["粘贴图片到下方", "after"],
      ["粘贴替换当前图片", "replace"],
    ] as const) {
      await wrapper.findAll(".image-card")[1].trigger("contextmenu");
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === label)?.trigger("click");
      expect(wrapper.emitted("paste")?.at(-1)).toEqual([{
        placement,
        targetId: "b",
        anchor: expect.any(HTMLElement),
      }]);
    }

    wrapper.unmount();
  });

  it("lets the browser lazy-load and asynchronously decode image thumbnails", () => {
    const wrapper = mountImagePanel([
      { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
    ]);
    const thumbnail = wrapper.get(".image-card img");

    expect(thumbnail.attributes("loading")).toBe("lazy");
    expect(thumbnail.attributes("decoding")).toBe("async");
    wrapper.unmount();
  });

  it("emits reorder to move an image to the top from the context menu", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
      { id: "c", src: "data:image/png;base64,c", createdAt: 3 },
    ]);

    await wrapper.findAll(".image-card")[1].trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置顶")?.trigger("click");

    expect(wrapper.emitted("reorder")?.[0]).toEqual(["b", "a"]);
    wrapper.unmount();
  });

  it("emits moveToBottom to move an image to the bottom from the context menu", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
      { id: "c", src: "data:image/png;base64,c", createdAt: 3 },
    ]);

    await wrapper.findAll(".image-card")[1].trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置底")?.trigger("click");

    expect(wrapper.emitted("moveToBottom")?.[0]).toEqual(["b"]);
    wrapper.unmount();
  });

  it("emits edit from the image item context menu", async () => {
    const wrapper = mountImagePanel([
      { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
    ]);

    await wrapper.get(".image-card").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑")?.trigger("click");

    expect(wrapper.emitted("edit")?.[0]).toEqual(["img-1"]);
    wrapper.unmount();
  });

  it("opens editing from a focused image card when Enter is pressed", async () => {
    const wrapper = mountImagePanel([
      { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
    ]);

    await wrapper.get(".image-card").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("edit")?.[0]).toEqual(["img-1"]);
    expect(wrapper.emitted("copy")).toBeUndefined();
    wrapper.unmount();
  });

  it("shows cancel preview for the active preview image context menu", async () => {
    const wrapper = mountImagePanel(
      [
        { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
        { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
      ],
      { activePreviewId: "img-2" },
    );

    await wrapper.findAll(".image-card")[1].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "取消预览",
      "复制",
      "编辑",
      "删除",
      "粘贴图片到上方",
      "粘贴图片到下方",
      "粘贴替换当前图片",
      "置顶",
      "置底",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "取消预览")?.trigger("click");

    expect(wrapper.emitted("closePreview")?.[0]).toEqual([]);
    expect(wrapper.emitted("preview")).toBeUndefined();
    wrapper.unmount();
  });

  it("shows cancel preview for inactive image context menus while preview is open", async () => {
    const wrapper = mountImagePanel(
      [
        { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
        { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
      ],
      { activePreviewId: "img-2" },
    );

    await wrapper.findAll(".image-card")[0].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "取消预览",
      "复制",
      "编辑",
      "删除",
      "粘贴图片到上方",
      "粘贴图片到下方",
      "粘贴替换当前图片",
      "置顶",
      "置底",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "取消预览")?.trigger("click");

    expect(wrapper.emitted("closePreview")?.[0]).toEqual([]);
    expect(wrapper.emitted("preview")).toBeUndefined();
    wrapper.unmount();
  });

  it("emits preview from the shared image list and highlights the active preview image", async () => {
    const wrapper = mountImagePanel(
      [
        { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
        { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
      ],
      { activePreviewId: "img-2" },
    );

    expect(wrapper.findAll(".image-card")[0].classes()).not.toContain("is-active");
    expect(wrapper.findAll(".image-card")[1].classes()).toContain("is-active");
    await wrapper.findAll(".image-card")[1].trigger("click");

    expect(wrapper.emitted("preview")?.[0]).toEqual(["img-2"]);
    wrapper.unmount();
  });

  it("smoothly scrolls the active preview image into the middle of the shared image list", async () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(scrollIntoView);
    const wrapper = mountImagePanel([
      { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
      { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
      { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
    ]);

    expect(scrollIntoView).not.toHaveBeenCalled();

    await wrapper.setProps({ activePreviewId: "img-2" });
    await nextTick();

    expect(wrapper.findAll(".image-card")[1].classes()).toContain("is-active");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth", inline: "nearest" });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ activePreviewId: "img-3" });
    await nextTick();

    expect(wrapper.findAll(".image-card")[2].classes()).toContain("is-active");
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "center", behavior: "smooth", inline: "nearest" });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("does not recenter the active preview image when drag sorting changes image order", async () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(scrollIntoView);
    const wrapper = mountImagePanel(
      [
        { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
        { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
        { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
      ],
      { activePreviewId: "img-2" },
    );

    await nextTick();
    expect(scrollIntoView).not.toHaveBeenCalled();

    await wrapper.setProps({
      images: [
        { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
        { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
        { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
      ],
    });
    await nextTick();

    expect(wrapper.findAll(".image-card")[0].classes()).toContain("is-active");
    expect(scrollIntoView).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("emits copy when an image card is double-clicked", async () => {
    const wrapper = mountImagePanel([{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }]);

    await wrapper.get(".image-card").trigger("dblclick");

    expect(wrapper.emitted("copy")?.[0]).toEqual(["img-1"]);
    wrapper.unmount();
  });

  it("emits copy from the real image item dropdown menu", async () => {
    const wrapper = mount(ImagePanel, {
      attachTo: document.body,
      props: {
        title: "截图",
        images: [{ id: "img-1", src: "data:image/png;base64,iVBORw0KGgo=", createdAt: 1 }],
      },
    });

    await wrapper.get(".image-card").trigger("contextmenu");
    await nextTick();
    await nextTick();

    const copyOption = Array.from(document.body.querySelectorAll<HTMLElement>(".n-dropdown-option")).find((option) =>
      option.textContent?.includes("复制"),
    );
    expect(copyOption).toBeTruthy();

    copyOption?.querySelector<HTMLElement>(".n-dropdown-option-body")?.click();
    await nextTick();

    expect(wrapper.emitted("copy")?.[0]).toEqual(["img-1"]);
    wrapper.unmount();
  });

  it("emits browser-external dropped files from the image list", async () => {
    const wrapper = mountImagePanel();
    const image = new File(["img"], "screen.png", { type: "image/png" });
    const text = new File(["note"], "note.txt", { type: "text/plain" });

    await wrapper.get(".image-list").trigger("drop", {
      dataTransfer: {
        files: [image, text],
      },
    });

    expect(wrapper.emitted("dropFiles")?.[0]).toEqual([[image, text], expect.any(HTMLElement)]);
    wrapper.unmount();
  });

  it("puts image file data on native thumbnail drags for browser-external drops", async () => {
    const wrapper = mountImagePanel([{ id: "img-1", src: "data:image/png;base64,aW1n", createdAt: 1 }]);
    const setData = vi.fn();
    const add = vi.fn();
    const setDragImage = vi.fn();
    const dataTransfer = {
      effectAllowed: "",
      items: { add },
      setData,
      setDragImage,
    };

    await wrapper.get(".image-card img").trigger("dragstart", { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(setData).toHaveBeenCalledWith("DownloadURL", "image/png:mini-desk-image-1.png:data:image/png;base64,aW1n");
    expect(setData).toHaveBeenCalledWith("text/uri-list", "data:image/png;base64,aW1n");
    expect(setData).toHaveBeenCalledWith("text/plain", "data:image/png;base64,aW1n");
    expect(add).toHaveBeenCalledWith(expect.any(File));
    expect(add.mock.calls[0][0].name).toBe("mini-desk-image-1.png");
    expect(add.mock.calls[0][0].type).toBe("image/png");
    expect(setDragImage).toHaveBeenCalledWith(wrapper.get(".image-card img").element, 0, 0);
    wrapper.unmount();
  });

  it("keeps custom pointer drag for image sorting while thumbnails support native browser drag", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
    ]);
    const source = readSource("components/ImagePanel.vue");
    const styles = readSource("styles.css");

    expect(source).toContain('<TransitionGroup name="image-reorder" tag="div" class="image-list"');
    expect(source).toContain('@pointerdown="handleImagePointerDown($event, image)"');
    expect(source).toContain('draggable="true"');
    expect(source).toContain("@dragstart.stop=\"handleImageNativeDragStart($event, image, index)\"");
    expect(styles).toMatch(/\.image-reorder-move,[\s\S]*?\.image-reorder-enter-active,[\s\S]*?\.image-reorder-leave-active\s*\{[^}]*transform 0\.22s/s);
    expect(styles).toMatch(/\.image-card\.is-dragging\s*\{[^}]*opacity: 0\.45/s);

    const cards = wrapper.findAll(".image-card");
    mockRect(cards[0].element, { left: 20, top: 100, width: 220, height: 74 });
    mockRect(cards[1].element, { left: 20, top: 190, width: 220, height: 74 });

    dispatchPointer(cards[0].element, "pointerdown", { clientX: 40, clientY: 120 });
    dispatchPointer(window, "pointermove", { clientX: 42, clientY: 132 });
    await nextTick();

    expect(wrapper.findAll(".image-card")[0].classes()).toContain("is-dragging");
    expect(wrapper.find(".image-drag-preview").exists()).toBe(true);

    dispatchPointer(window, "pointerup", { clientX: 40, clientY: 210 });
    await nextTick();

    expect(wrapper.findAll(".image-card")[0].classes()).not.toContain("is-dragging");
    expect(wrapper.find(".image-drag-preview").exists()).toBe(false);
    expect(wrapper.emitted("reorder")?.[0]).toEqual(["a", "b"]);

    await cards[0].trigger("click");

    expect(wrapper.emitted("preview")).toBeUndefined();
    wrapper.unmount();
  });

  it("smoothly auto-scrolls the image list while dragging near the top or bottom edge", async () => {
    vi.useFakeTimers();
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
      { id: "c", src: "data:image/png;base64,c", createdAt: 3 },
    ]);
    const scrollbar = wrapper.get(".image-list-scrollbar").element as HTMLElement;
    const scrollContainer = scrollbar.querySelector<HTMLElement>(".n-scrollbar-container");
    expect(scrollContainer).toBeTruthy();
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 200 });
    mockRect(scrollContainer!, { left: 0, top: 100, width: 240, height: 200 });
    const cards = wrapper.findAll(".image-card");
    mockRect(cards[1].element, { left: 20, top: 170, width: 220, height: 74 });

    try {
      scrollContainer!.scrollTop = 120;
      dispatchPointer(cards[1].element, "pointerdown", { clientX: 40, clientY: 190 });
      dispatchPointer(window, "pointermove", { clientX: 42, clientY: 108 });
      expect(scrollContainer!.scrollTop).toBe(120);
      await vi.advanceTimersByTimeAsync(16);
      expect(scrollContainer!.scrollTop).toBe(112);

      scrollContainer!.scrollTop = 120;
      dispatchPointer(window, "pointermove", { clientX: 42, clientY: 292 });
      await vi.advanceTimersByTimeAsync(16);
      expect(scrollContainer!.scrollTop).toBe(128);

      dispatchPointer(window, "pointerup", { clientX: 42, clientY: 292 });
      scrollContainer!.scrollTop = 120;
      await vi.advanceTimersByTimeAsync(32);
      expect(scrollContainer!.scrollTop).toBe(120);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("scrolls the image list from window wheel events while dragging and pauses edge auto-scroll to avoid jitter", async () => {
    vi.useFakeTimers();
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
    ]);
    const scrollbar = wrapper.get(".image-list-scrollbar").element as HTMLElement;
    const scrollContainer = scrollbar.querySelector<HTMLElement>(".n-scrollbar-container");
    expect(scrollContainer).toBeTruthy();
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 200 });
    mockRect(scrollContainer!, { left: 0, top: 100, width: 240, height: 200 });
    const cards = wrapper.findAll(".image-card");
    mockRect(cards[0].element, { left: 20, top: 120, width: 220, height: 74 });
    const idleWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });

    try {
      scrollContainer!.scrollTop = 120;
      window.dispatchEvent(idleWheel);
      expect(idleWheel.defaultPrevented).toBe(false);
      expect(scrollContainer!.scrollTop).toBe(120);

      dispatchPointer(cards[0].element, "pointerdown", { clientX: 40, clientY: 140 });
      dispatchPointer(window, "pointermove", { clientX: 42, clientY: 108 });
      await vi.advanceTimersByTimeAsync(16);
      expect(scrollContainer!.scrollTop).toBe(112);

      scrollContainer!.scrollTop = 120;
      const draggingWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
      window.dispatchEvent(draggingWheel);

      expect(draggingWheel.defaultPrevented).toBe(true);
      expect(scrollContainer!.scrollTop).toBe(200);

      const upwardWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -40 });
      window.dispatchEvent(upwardWheel);

      expect(upwardWheel.defaultPrevented).toBe(true);
      expect(scrollContainer!.scrollTop).toBe(160);

      scrollContainer!.scrollTop = 120;
      dispatchPointer(window, "pointermove", { clientX: 42, clientY: 108 });
      await vi.advanceTimersByTimeAsync(16);
      expect(scrollContainer!.scrollTop).toBe(120);

      await vi.advanceTimersByTimeAsync(160);
      dispatchPointer(window, "pointermove", { clientX: 42, clientY: 108 });
      await vi.advanceTimersByTimeAsync(16);
      expect(scrollContainer!.scrollTop).toBe(112);

      dispatchPointer(window, "pointerup", { clientX: 42, clientY: 108 });
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not move image cards on hover or keyboard focus", () => {
    const styles = readSource("styles.css");
    const hoverRules = Array.from(styles.matchAll(/\.image-card:hover,\s*\.image-card:focus-visible\s*\{([^}]*)\}/g)).map((match) => match[1]);

    expect(hoverRules.length).toBeGreaterThan(0);
    expect(hoverRules.join("\n")).not.toMatch(/transform\s*:\s*translate/);
  });
});

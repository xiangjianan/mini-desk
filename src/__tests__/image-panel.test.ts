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

describe("ImagePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds usage guidance to the blank image-list context menu", async () => {
    const wrapper = mountImagePanel();

    await wrapper.get(".image-list").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["粘贴图片", "Tips"]);

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

  it("keeps image item context menus focused on preview, copy, delete, and guide actions", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
      { id: "c", src: "data:image/png;base64,c", createdAt: 3 },
    ]);

    await wrapper.findAll(".image-card")[1].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "预览",
      "复制",
      "删除",
      "Tips",
    ]);

    expect(wrapper.text()).not.toContain("置顶");
    expect(wrapper.text()).not.toContain("取消置顶");
    expect(wrapper.text()).not.toContain("置底");

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
      "删除",
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
      "删除",
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

  it("keeps image reorder movement animated during drag sorting", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
    ]);
    const source = readSource("components/ImagePanel.vue");
    const styles = readSource("styles.css");

    expect(source).toContain('<TransitionGroup name="image-reorder" tag="div" class="image-list"');
    expect(source).toContain('@dragover.prevent="scrollImageListDuringDrag"');
    expect(styles).toMatch(/\.image-reorder-move,[\s\S]*?\.image-reorder-enter-active,[\s\S]*?\.image-reorder-leave-active\s*\{[^}]*transform 0\.22s/s);
    expect(styles).toMatch(/\.image-card\.is-dragging\s*\{[^}]*opacity: 0\.45/s);

    await wrapper.findAll(".image-card")[0].trigger("dragstart");
    expect(wrapper.findAll(".image-card")[0].classes()).toContain("is-dragging");

    await wrapper.findAll(".image-card")[0].trigger("dragend");
    expect(wrapper.findAll(".image-card")[0].classes()).not.toContain("is-dragging");
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
    Object.defineProperty(scrollContainer!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 100,
        left: 0,
        top: 100,
        right: 240,
        bottom: 300,
        width: 240,
        height: 200,
        toJSON: () => undefined,
      }),
    });

    try {
      scrollContainer!.scrollTop = 120;
      await wrapper.findAll(".image-card")[1].trigger("dragstart");
      await wrapper.get(".image-list").trigger("dragover", { clientY: 108 });
      expect(scrollContainer!.scrollTop).toBe(120);
      await vi.advanceTimersByTimeAsync(16);
      expect(scrollContainer!.scrollTop).toBe(112);

      scrollContainer!.scrollTop = 120;
      await wrapper.get(".image-list").trigger("dragover", { clientY: 292 });
      await vi.advanceTimersByTimeAsync(16);
      expect(scrollContainer!.scrollTop).toBe(128);

      await wrapper.findAll(".image-card")[1].trigger("dragend");
      scrollContainer!.scrollTop = 120;
      await vi.advanceTimersByTimeAsync(32);
      expect(scrollContainer!.scrollTop).toBe(120);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("prevents wheel scrolling while an image is being dragged", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
    ]);
    const list = wrapper.get(".image-list").element;
    const idleWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });

    list.dispatchEvent(idleWheel);
    expect(idleWheel.defaultPrevented).toBe(false);

    await wrapper.findAll(".image-card")[0].trigger("dragstart");
    const draggingWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
    list.dispatchEvent(draggingWheel);

    expect(draggingWheel.defaultPrevented).toBe(true);

    await wrapper.findAll(".image-card")[0].trigger("dragend");
    wrapper.unmount();
  });

  it("does not move image cards on hover or keyboard focus", () => {
    const styles = readSource("styles.css");
    const hoverRules = Array.from(styles.matchAll(/\.image-card:hover,\s*\.image-card:focus-visible\s*\{([^}]*)\}/g)).map((match) => match[1]);

    expect(hoverRules.length).toBeGreaterThan(0);
    expect(hoverRules.join("\n")).not.toMatch(/transform\s*:\s*translate/);
  });
});

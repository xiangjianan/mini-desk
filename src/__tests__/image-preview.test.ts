import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ImagePreview from "../components/ImagePreview.vue";

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

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

const modalStub = {
  props: ["show"],
  template: '<section v-if="show" class="n-modal"><slot /></section>',
};

describe("ImagePreview", () => {
  it("keeps the preview open when clicking blank preview space or the image", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".preview-stage img").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    try {
      await wrapper.get(".preview-stage").trigger("click");
      expect(wrapper.get(".image-preview").classes()).not.toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("shows a floating toolbar close action in the preview surface", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    expect(wrapper.find(".preview-sidebar").exists()).toBe(false);
    expect(wrapper.find(".preview-close-button").exists()).toBe(false);
    const closeButton = wrapper.get(".preview-toolbar-button.is-close");
    expect(closeButton.attributes("aria-label")).toBe("取消预览");

    try {
      await closeButton?.trigger("click");
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("does not render a duplicate thumbnail list inside the preview", () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    expect(wrapper.find(".preview-main").exists()).toBe(true);
    expect(wrapper.find(".preview-sidebar").exists()).toBe(false);
    expect(wrapper.find(".preview-image-list").exists()).toBe(false);
    expect(wrapper.find(".preview-thumb").exists()).toBe(false);

    wrapper.unmount();
  });

  it("does not navigate when wheel events happen outside the preview stage", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -80 });

    wrapper.get(".image-preview").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1)");
    expect(wrapper.emitted("navigate")).toBeUndefined();
    wrapper.unmount();
  });

  it("does not navigate from wheel events inside the preview stage", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const wheelEvent = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 1600 });

    try {
      wrapper.get(".preview-stage").element.dispatchEvent(wheelEvent);
      await wrapper.vm.$nextTick();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(wheelEvent.defaultPrevented).toBe(true);
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1)");
      expect(wrapper.emitted("navigate")).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("renders navigation controls in the liquid floating toolbar", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
          { id: "img-4", src: "data:image/png;base64,four", createdAt: 4 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const previous = wrapper.get(".preview-nav-button.is-previous");
    const next = wrapper.get(".preview-nav-button.is-next");
    const toolbar = wrapper.get(".preview-actions");

    expect(previous.attributes("aria-label")).toBe("上一张图片");
    expect(next.attributes("aria-label")).toBe("下一张图片");
    expect(wrapper.find(".preview-nav-stack").exists()).toBe(false);
    expect(toolbar.findAll(".preview-nav-button").map((button) => button.attributes("aria-label"))).toEqual([
      "上一张图片",
      "下一张图片",
    ]);

    await previous.trigger("click");
    await next.trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([[-1], [1]]);
    wrapper.unmount();
  });

  it("keeps the transformed image state while closing", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      await wrapper.get(".preview-zoom-button.is-zoom-in").trigger("click");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1.1)");

      await wrapper.get(".preview-toolbar-button.is-close").trigger("click");

      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1.1)");
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("keeps both stacked navigation controls visible and disables unavailable edge actions", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    expect(wrapper.find(".preview-actions").exists()).toBe(true);
    expect(wrapper.find(".preview-nav-stack").exists()).toBe(false);
    const previous = wrapper.get(".preview-nav-button.is-previous");
    const next = wrapper.get(".preview-nav-button.is-next");

    expect(previous.attributes("disabled")).toBeDefined();
    expect(previous.attributes("aria-disabled")).toBe("true");
    expect(next.attributes("disabled")).toBeUndefined();

    await previous.trigger("click");
    await next.trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([[1]]);
    wrapper.unmount();
  });

  it("disables the next stacked navigation control at the final image", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-3",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const previous = wrapper.get(".preview-nav-button.is-previous");
    const next = wrapper.get(".preview-nav-button.is-next");

    expect(previous.attributes("disabled")).toBeUndefined();
    expect(next.attributes("disabled")).toBeDefined();
    expect(next.attributes("aria-disabled")).toBe("true");

    await previous.trigger("click");
    await next.trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([[-1]]);
    wrapper.unmount();
  });

  it("renders a liquid floating toolbar with navigation zoom delete and close actions", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const toolbar = wrapper.get(".preview-actions");
    expect(toolbar.attributes("role")).toBe("toolbar");
    const buttons = toolbar.findAll("button");
    expect(buttons).toHaveLength(6);
    expect(buttons.map((button) => button.text())).toEqual(["", "", "", "", "", ""]);
    expect(buttons.map((button) => button.attributes("aria-label"))).toEqual([
      "上一张图片",
      "下一张图片",
      "缩小图片",
      "放大图片",
      "删除",
      "取消预览",
    ]);

    try {
      await wrapper.get(".preview-zoom-button.is-zoom-in").trigger("click");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1.1)");

      await wrapper.get(".preview-zoom-button.is-zoom-out").trigger("click");
      expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1)");

      await wrapper.get(".preview-toolbar-button.is-delete").trigger("click");
      expect(wrapper.emitted("delete")?.[0]?.[0]).toBe("img-1");
      expect(wrapper.emitted("copy")).toBeUndefined();

      await wrapper.get(".preview-toolbar-button.is-close").trigger("click");
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      await vi.advanceTimersByTimeAsync(220);
      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("toggles image zoom on double click", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    const image = wrapper.get(".preview-stage img");
    Object.defineProperty(image.element, "getBoundingClientRect", {
      value: () => ({
        x: 50,
        y: 50,
        left: 50,
        top: 50,
        right: 250,
        bottom: 150,
        width: 200,
        height: 100,
        toJSON: () => undefined,
      }),
    });

    await image.trigger("dblclick", { clientX: 200, clientY: 125 });
    expect(wrapper.get(".preview-stage img").attributes("style")).toContain("translate(-50px, -25px) scale(2)");

    await wrapper.get(".preview-stage img").trigger("dblclick");
    expect(wrapper.get(".preview-stage img").attributes("style")).toContain("translate(0px, 0px) scale(1)");
    wrapper.unmount();
  });

  it("closes the preview when pressing Space", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      await wrapper.get(".image-preview").trigger("keydown", { key: " " });

      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("closes the preview when Space is pressed after a navigation button keeps focus", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      const next = wrapper.get(".preview-nav-button.is-next");
      await next.trigger("click");
      await next.trigger("keydown", { key: " " });

      expect(wrapper.emitted("navigate")).toEqual([[1]]);
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("returns focus to the preview surface after pointer navigation so Enter does not repeat it", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(ImagePreview, {
      attachTo: host,
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    try {
      const next = wrapper.get(".preview-nav-button.is-next");
      next.element.focus();
      expect(document.activeElement).toBe(next.element);

      await next.trigger("click");
      expect(document.activeElement).toBe(wrapper.get(".image-preview").element);

      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("navigate")).toEqual([[1]]);
      expect(wrapper.emitted("copy")).toEqual([["img-1"]]);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  it("opens a compact context menu over preview images", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 16, clientY: 18 });

    wrapper.get(".preview-stage img").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "取消预览",
      "复制",
      "删除",
      "Tips",
    ]);

    try {
      await wrapper.findAll(".dropdown-option").find((option) => option.text() === "取消预览")?.trigger("click");
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("routes preview keyboard shortcuts to the active image", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ImagePreview, {
      props: {
        images: [{ id: "img-1", src: "data:image/png;base64,one", createdAt: 1 }],
        activeId: "img-1",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: "Enter" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "5" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "Backspace" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "Delete" });
    try {
      await wrapper.get(".image-preview").trigger("keydown", { key: "Escape" });

      expect(wrapper.emitted("copy")).toEqual([["img-1"], ["img-1"]]);
      expect(wrapper.emitted("delete")?.map((event) => event[0])).toEqual(["img-1", "img-1"]);
      expect(wrapper.get(".image-preview").classes()).toContain("is-closing");
      expect(wrapper.emitted("close")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(220);

      expect(wrapper.emitted("close")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("uses WASD keys to navigate images", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
          { id: "img-3", src: "data:image/png;base64,three", createdAt: 3 },
        ],
        activeId: "img-2",
      },
      global: {
        stubs: {
          Button: buttonStub,
          Dropdown: dropdownStub,
          Modal: modalStub,
          NButton: buttonStub,
          NDropdown: dropdownStub,
          NModal: modalStub,
        },
      },
    });

    await wrapper.get(".image-preview").trigger("keydown", { key: "w" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "A" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "s" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "D" });

    expect(wrapper.emitted("navigate")).toEqual([[-1], [-1], [1], [1]]);
    wrapper.unmount();
  });
});

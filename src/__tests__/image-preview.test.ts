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

  it("shows a top-right icon close action in the preview surface", async () => {
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
    const closeButton = wrapper.get(".preview-close-button");
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

  it("does not zoom when wheel events happen outside the preview stage", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
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

  it("navigates by wheel direction from the right-side preview stage without zooming", async () => {
    const wrapper = mount(ImagePreview, {
      props: {
        images: [
          { id: "img-1", src: "data:image/png;base64,one", createdAt: 1 },
          { id: "img-2", src: "data:image/png;base64,two", createdAt: 2 },
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

    wrapper.get(".preview-stage").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.get(".preview-stage img").attributes("style")).toContain("scale(1)");
    expect(wrapper.emitted("navigate")).toEqual([[-1]]);
    wrapper.unmount();
  });

  it("renders side navigation controls and emits previous or next requests", async () => {
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

    await wrapper.get(".preview-nav-button.is-previous").trigger("click");
    await wrapper.get(".preview-nav-button.is-next").trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([[-1], [1]]);
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
      "复制",
      "取消预览",
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
    await wrapper.get(".image-preview").trigger("keydown", { key: "Backspace" });
    await wrapper.get(".image-preview").trigger("keydown", { key: "Delete" });
    try {
      await wrapper.get(".image-preview").trigger("keydown", { key: "Escape" });

      expect(wrapper.emitted("copy")?.[0]).toEqual(["img-1"]);
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
});

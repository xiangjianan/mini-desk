import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
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
  it("keeps preview open when clicking blank preview space and closes from the cancel button", async () => {
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

    await wrapper.get(".preview-stage").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    await wrapper.findAll("button").find((button) => button.text() === "取消预览")?.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);

    wrapper.unmount();
  });

  it("shows a top close button in the preview sidebar", async () => {
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

    const closeButton = wrapper.get(".preview-close-button");
    expect(closeButton.attributes("aria-label")).toBe("取消预览");

    await closeButton.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);

    wrapper.unmount();
  });

  it("keeps preview thumbnails in the same image-list flow as the normal sidebar", () => {
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

    expect(wrapper.get(".preview-image-list").classes()).toContain("image-list");
    expect(wrapper.get(".preview-thumb").classes()).toContain("image-card");
    expect(wrapper.get(".preview-sidebar").element.firstElementChild?.classList.contains("preview-sidebar-bar")).toBe(true);

    wrapper.unmount();
  });

  it("closes the preview when pressing Space", async () => {
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

    await wrapper.get(".image-preview").trigger("keydown", { key: " " });

    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("uses only the custom preview context menu over preview images", async () => {
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
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["取消预览", "复制", "删除"]);
    wrapper.unmount();
  });
});

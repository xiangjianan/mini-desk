import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ImagePreview from "../components/ImagePreview.vue";

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

const dropdownStub = {
  template: "<div><slot /></div>",
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
});

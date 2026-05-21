import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ImagePanel from "../components/ImagePanel.vue";

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

function mountImagePanel() {
  return mount(ImagePanel, {
    props: {
      title: "截图",
      images: [],
    },
    global: {
      stubs: {
        Dropdown: dropdownStub,
        NDropdown: dropdownStub,
      },
    },
  });
}

describe("ImagePanel", () => {
  it("adds usage guidance to the blank image-list context menu", async () => {
    const wrapper = mountImagePanel();

    await wrapper.get(".image-list").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["粘贴图片", "使用指南"]);

    await wrapper.findAll(".dropdown-option")[1].trigger("click");

    expect(wrapper.emitted("guide")?.[0]?.[0]).toBe("images");
    wrapper.unmount();
  });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
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

function mountImagePanel(images: StoredImage[] = []) {
  return mount(ImagePanel, {
    props: {
      title: "截图",
      images,
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

    expect(wrapper.emitted("guide")?.[0]).toEqual(["images", expect.any(HTMLElement), true]);
    wrapper.unmount();
  });

  it("adds top and bottom actions to image item context menus", async () => {
    const wrapper = mountImagePanel([
      { id: "a", src: "data:image/png;base64,a", createdAt: 1 },
      { id: "b", src: "data:image/png;base64,b", createdAt: 2 },
      { id: "c", src: "data:image/png;base64,c", createdAt: 3 },
    ]);

    await wrapper.findAll(".image-card")[1].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "预览",
      "复制",
      "置顶",
      "置底",
      "删除",
      "使用指南",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置顶")?.trigger("click");
    expect(wrapper.emitted("moveTop")?.[0]).toEqual(["b"]);

    await wrapper.findAll(".image-card")[1].trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "置底")?.trigger("click");
    expect(wrapper.emitted("moveBottom")?.[0]).toEqual(["b"]);

    wrapper.unmount();
  });
});

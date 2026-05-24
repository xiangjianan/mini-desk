import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
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

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["粘贴图片", "Tips"]);

    await wrapper.findAll(".dropdown-option")[1].trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["images", expect.any(HTMLElement), true]);
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
      "复制",
      "预览",
      "删除",
      "Tips",
    ]);

    expect(wrapper.text()).not.toContain("置顶");
    expect(wrapper.text()).not.toContain("取消置顶");
    expect(wrapper.text()).not.toContain("置底");

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
});

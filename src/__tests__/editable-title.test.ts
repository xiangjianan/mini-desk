import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import EditableTitle from "../components/EditableTitle.vue";

describe("EditableTitle", () => {
  it("enters edit mode and focuses the input when autoEdit is enabled", async () => {
    const wrapper = mount(EditableTitle, {
      props: {
        id: "todo-list",
        value: "未命名列表",
        autoEdit: true,
      },
      attachTo: document.body,
    });

    await nextTick();

    const input = wrapper.find(".title-edit-input");
    expect(input.exists()).toBe(true);
    expect(document.activeElement).toBe(input.element);

    wrapper.unmount();
  });

  it("does not save while Chinese IME composition is confirming with Enter", async () => {
    const wrapper = mount(EditableTitle, {
      props: {
        id: "note-title",
        value: "便签",
      },
    });

    await wrapper.get(".editable-title").trigger("dblclick");
    await wrapper.get(".title-edit-input").setValue("bianqian");
    await wrapper.get(".title-edit-input").trigger("compositionstart");
    await wrapper.get(".title-edit-input").trigger("keydown.enter", { isComposing: true, keyCode: 229 });

    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.find(".title-edit-input").exists()).toBe(true);

    await wrapper.get(".title-edit-input").trigger("compositionend");
    await wrapper.get(".title-edit-input").trigger("keydown.enter");

    expect(wrapper.emitted("update")?.[0]).toEqual(["note-title", "bianqian"]);
  });
});

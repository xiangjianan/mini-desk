import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EditableTitle from "../components/EditableTitle.vue";

describe("EditableTitle", () => {
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

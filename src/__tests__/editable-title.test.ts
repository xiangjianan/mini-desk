import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import EditableTitle from "../components/EditableTitle.vue";

describe("EditableTitle", () => {
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

  it("opens a right-click edit menu before entering title edit mode", async () => {
    const wrapper = mount(EditableTitle, {
      props: {
        id: "note-title",
        value: "便签",
        editLabel: "编辑",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    await wrapper.get(".editable-title").trigger("contextmenu");

    expect(wrapper.find(".title-edit-input").exists()).toBe(false);
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["编辑"]);

    await wrapper.get(".dropdown-option").trigger("click");

    expect(wrapper.find(".title-edit-input").exists()).toBe(true);
  });

  it("lets parent header bars open the title edit menu at a pointer position", async () => {
    const wrapper = mount(EditableTitle, {
      props: {
        id: "note-title",
        value: "便签",
        editLabel: "编辑",
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    (wrapper.vm as unknown as { openMenuAt: (x: number, y: number) => void }).openMenuAt(20, 24);
    await nextTick();

    expect(wrapper.find(".title-edit-input").exists()).toBe(false);
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["编辑"]);
  });

  it("closes the previous right-click title menu when another one opens", async () => {
    const Host = defineComponent({
      components: { EditableTitle },
      template: `
        <div>
          <EditableTitle id="first" value="第一个" edit-label="编辑 A" />
          <EditableTitle id="second" value="第二个" edit-label="编辑 B" />
        </div>
      `,
    });
    const wrapper = mount(Host, {
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    await wrapper.findAll(".editable-title")[0].trigger("contextmenu");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["编辑 A"]);

    await wrapper.findAll(".editable-title")[1].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["编辑 B"]);
  });

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

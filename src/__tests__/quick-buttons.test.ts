import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuickButtons from "../components/QuickButtons.vue";

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

const checkboxStub = {
  props: ["checked"],
  emits: ["update:checked"],
  template: '<button class="checkbox-stub" type="button" :data-checked="checked ? \'true\' : \'false\'" @click="$emit(\'update:checked\', !checked)"><slot /></button>',
};

const inputStub = {
  props: ["value"],
  emits: ["update:value"],
  template: `<input v-bind="$attrs" :value="value" @input="$emit('update:value', $event.target.value)" />`,
};

const modalStub = {
  props: ["show", "title"],
  template: '<section v-if="show" class="quick-dialog"><h2>{{ title }}</h2><slot /></section>',
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

function mountQuickButtons() {
  return mount(QuickButtons, {
    props: {
      title: "快捷链接",
      buttons: [],
      showHidden: false,
    },
    global: {
      stubs: {
        Button: buttonStub,
        Checkbox: checkboxStub,
        Dropdown: dropdownStub,
        Icon: true,
        Input: inputStub,
        Modal: modalStub,
        NButton: buttonStub,
        NCheckbox: checkboxStub,
        NDropdown: dropdownStub,
        NIcon: true,
        NInput: inputStub,
        NModal: modalStub,
      },
    },
    attachTo: document.body,
  });
}

async function openDialog(wrapper: ReturnType<typeof mountQuickButtons>) {
  await wrapper.get(".empty-hint").trigger("click");
  await wrapper.vm.$nextTick();
}

describe("QuickButtons", () => {
  it("keeps the add/edit dialog open when clicking outside the modal card", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    wrapper.unmount();
  });

  it("does not save a quick link when the title is empty", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    await wrapper.findAll("input")[1].setValue("https://example.com");
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    wrapper.unmount();
  });

  it("does not save a quick link when the link text is empty", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    await wrapper.findAll("input")[0].setValue("示例链接");
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    wrapper.unmount();
  });

  it("shows mutually exclusive link and text type checkboxes with link selected by default", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);

    const options = wrapper.findAll(".checkbox-stub");
    expect(options.map((option) => option.text())).toEqual(["链接属性", "复制文本属性"]);
    expect(options[0].attributes("data-checked")).toBe("true");
    expect(options[1].attributes("data-checked")).toBe("false");

    await options[1].trigger("click");
    await wrapper.vm.$nextTick();

    expect(options[0].attributes("data-checked")).toBe("false");
    expect(options[1].attributes("data-checked")).toBe("true");

    wrapper.unmount();
  });

  it("opens the usage guide from the blank quick-button area context menu", async () => {
    const wrapper = mountQuickButtons();

    await wrapper.get(".quick-buttons").trigger("contextmenu");
    await wrapper.get(".dropdown-option").trigger("click");

    expect(wrapper.emitted("guide")?.[0]?.[0]).toBe("quickButtons");
    wrapper.unmount();
  });
});

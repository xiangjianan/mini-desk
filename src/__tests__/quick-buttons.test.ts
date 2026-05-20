import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuickButtons from "../components/QuickButtons.vue";

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
};

const inputStub = {
  template: '<input v-bind="$attrs" />',
};

const modalStub = {
  props: ["show", "title"],
  template: '<section v-if="show" class="quick-dialog"><h2>{{ title }}</h2><slot /></section>',
};

const dropdownStub = {
  template: "<div><slot /></div>",
};

describe("QuickButtons", () => {
  it("keeps the add/edit dialog open when clicking outside the modal card", async () => {
    const wrapper = mount(QuickButtons, {
      props: {
        title: "快捷链接",
        buttons: [],
        showHidden: false,
      },
      global: {
        stubs: {
          Modal: modalStub,
          NButton: buttonStub,
          NCheckbox: buttonStub,
          NDropdown: dropdownStub,
          NIcon: true,
          NInput: inputStub,
          NModal: modalStub,
        },
      },
      attachTo: document.body,
    });

    await wrapper.get(".empty-hint").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".quick-dialog").exists()).toBe(true);

    wrapper.unmount();
  });
});

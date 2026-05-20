import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuickButtons from "../components/QuickButtons.vue";

const buttonStub = {
  template: '<button v-bind="$attrs"><slot /></button>',
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
  template: "<div><slot /></div>",
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
});

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
  props: ["value", "type"],
  emits: ["update:value"],
  template: `
    <textarea
      v-if="type === 'textarea'"
      v-bind="$attrs"
      :value="value"
      @input="$emit('update:value', $event.target.value)"
    />
    <input
      v-else
      v-bind="$attrs"
      :value="value"
      @input="$emit('update:value', $event.target.value)"
    />
  `,
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

function mountQuickButtons(options: Partial<InstanceType<typeof QuickButtons>["$props"]> = {}) {
  return mount(QuickButtons, {
    props: {
      title: "快捷链接",
      buttons: [],
      showHidden: false,
      ...options,
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

  it("uses a multiline editor for copy-text quick buttons", async () => {
    const wrapper = mountQuickButtons();

    await openDialog(wrapper);
    await wrapper.findAll(".checkbox-stub")[1].trigger("click");
    await wrapper.findAll("input")[0].setValue("片段");
    await wrapper.get("textarea").setValue("第一行\n第二行");
    await wrapper.get("form").trigger("submit.prevent");

    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      title: "片段",
      value: "第一行\n第二行",
      type: "text",
    });

    wrapper.unmount();
  });

  it("opens the usage guide from the blank quick-button area context menu", async () => {
    const wrapper = mountQuickButtons();

    await wrapper.get(".quick-buttons").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["quickButtons", expect.any(HTMLElement), true]);
    wrapper.unmount();
  });

  it("opens the usage guide from the quick-link panel context menu", async () => {
    const wrapper = mountQuickButtons();

    await wrapper.get(".panel-header").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "Tips")?.trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual(["quickButtons", expect.any(HTMLElement), true]);
    wrapper.unmount();
  });

  it("moves add and hidden visibility actions into a compact area menu", async () => {
    const wrapper = mountQuickButtons({
      buttons: [{ id: "hidden-1", title: "隐藏项", value: "value", type: "text", hidden: true }],
      showHidden: false,
    });

    expect(wrapper.find('[aria-label="新增快捷链接"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="显示全部快捷链接"]').exists()).toBe(false);

    await wrapper.get(".quick-menu-button").trigger("click");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "新增",
      "显示隐藏项",
      "Tips",
    ]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "显示隐藏项")?.trigger("click");
    expect(wrapper.emitted("toggleShowHidden")).toHaveLength(1);

    await wrapper.setProps({ showHidden: true });
    await wrapper.get(".quick-menu-button").trigger("click");
    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "新增",
      "收起隐藏项",
      "Tips",
    ]);

    wrapper.unmount();
  });

  it("uses compact quick-button context menu labels without a copy action", async () => {
    const wrapper = mountQuickButtons({
      buttons: [{ id: "quick-1", title: "片段", value: "第一行\n第二行", type: "text", hidden: false }],
    });

    await wrapper.get(".quick-button").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual([
      "编辑",
      "隐藏",
      "删除",
      "Tips",
    ]);

    expect(wrapper.findAll(".dropdown-option").some((option) => option.text() === "复制")).toBe(false);

    wrapper.unmount();
  });
});

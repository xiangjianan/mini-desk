import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ShortcutHelp from "../components/ShortcutHelp.vue";

const modalStub = {
  props: ["show", "title"],
  emits: ["update:show"],
  template: `
    <section v-if="show" class="n-modal shortcut-help-modal">
      <h3>{{ title }}</h3>
      <slot />
      <button data-testid="modal-close" type="button" @click="$emit('update:show', false)">close</button>
    </section>
  `,
};

const scrollbarStub = {
  template: '<div class="shortcut-help-content"><slot /></div>',
};

function mountShortcutHelp(language: "zh" | "en" = "zh") {
  return mount(ShortcutHelp, {
    props: {
      show: true,
      language,
    },
    global: {
      stubs: {
        NModal: modalStub,
        Modal: modalStub,
        NScrollbar: scrollbarStub,
        Scrollbar: scrollbarStub,
      },
    },
  });
}

describe("ShortcutHelp", () => {
  it("shows concise Chinese help tips and shortcuts together", () => {
    const wrapper = mountShortcutHelp("zh");

    expect(wrapper.text()).toContain("帮助与快捷键");
    expect(wrapper.findAll(".shortcut-section")).toHaveLength(5);
    expect(wrapper.text()).toContain("双击任意区域标题可以改名");
    expect(wrapper.text()).toContain("右键空白处可以新增提醒列表");
    expect(wrapper.text()).toContain("工具栏可以配置显示哪些工具");
    expect(wrapper.text()).toContain("Ctrl + S");
    expect(wrapper.text()).toContain("Esc / Space");
    expect(wrapper.findAll(".shortcut-section-icon").map((icon) => icon.text())).toEqual(["⌘", "🖼️", "⏱️", "📝", "⚡"]);
  });

  it("keeps English help copy available", () => {
    const wrapper = mountShortcutHelp("en");

    expect(wrapper.text()).toContain("Help & Shortcuts");
    expect(wrapper.text()).toContain("Double-click section titles to rename them");
    expect(wrapper.text()).toContain("Notification time works without starring");
    expect(wrapper.text()).toContain("Tool menu");
  });

  it("emits close when the modal is dismissed", async () => {
    const wrapper = mountShortcutHelp("zh");

    await wrapper.get('[data-testid="modal-close"]').trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});

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
    expect(wrapper.text()).toContain("快捷动作可以按标签分组");
    expect(wrapper.text()).not.toContain("工具栏");
    expect(wrapper.text()).toContain("Ctrl + S");
    expect(wrapper.text()).toContain("Esc / Space");
    expect(wrapper.findAll(".shortcut-section-icon").map((icon) => icon.text())).toEqual(["⌘", "🖼️", "⏱️", "📝", "⚡"]);
  });

  it("keeps English help copy available", () => {
    const wrapper = mountShortcutHelp("en");

    expect(wrapper.text()).toContain("Help & Shortcuts");
    expect(wrapper.text()).toContain("Double-click section titles to rename them");
    expect(wrapper.text()).toContain("Notification time works without starring");
    expect(wrapper.text()).toContain("Drag action");
    expect(wrapper.text()).not.toContain("Tool menu");
    expect(wrapper.text()).not.toContain("tool panel");
  });

  it("shows keyboard shortcuts on a shared keyboard layout", () => {
    const wrapper = mountShortcutHelp("zh");

    expect(wrapper.findAll(".shortcut-keyboard-diagram")).toHaveLength(1);
    expect(wrapper.find(".shortcut-keyboard-diagram").classes()).toContain("shortcut-keyboard-diagram--shared");
    expect(wrapper.findAll(".shortcut-keyboard-row").map((row) => row.attributes("data-row"))).toEqual([
      "system",
      "numbers",
      "letters-top",
      "letters-home",
      "letters-bottom",
      "controls",
      "arrows",
    ]);
    expect(wrapper.find(".shortcut-keycap--ctrl").classes()).toContain("shortcut-keycap--active");
    expect(wrapper.find(".shortcut-keycap--s").classes()).toContain("shortcut-keycap--active");

    expect(wrapper.find(".shortcut-keycap--arrow-up").text()).toBe("↑");
    expect(wrapper.find(".shortcut-keycap--arrow-up").classes()).toContain("shortcut-keycap--active");
    expect(wrapper.find(".shortcut-keycap--arrow-left").text()).toBe("←");
    expect(wrapper.find(".shortcut-keycap--arrow-left").classes()).toContain("shortcut-keycap--active");

    const dragRow = wrapper.findAll(".shortcut-row").find((row) => row.text().includes("从外部创建提醒"));
    expect(dragRow?.find(".shortcut-gesture-pill").text()).toBe("拖入文本");
    expect(dragRow?.find(".shortcut-keyboard-diagram").exists()).toBe(false);
  });

  it("emits close when the modal is dismissed", async () => {
    const wrapper = mountShortcutHelp("zh");

    await wrapper.get('[data-testid="modal-close"]').trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});

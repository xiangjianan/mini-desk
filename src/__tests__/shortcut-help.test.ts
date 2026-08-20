import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ShortcutHelp from "../components/ShortcutHelp.vue";
import { SHORTCUT_HELP } from "../state/i18n";

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
    expect(wrapper.text()).toContain("右键空白处可以新增提醒事项列表");
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

describe("SHORTCUT_HELP 快捷键条目", () => {
  it("钉死提醒事项的 Ctrl+←/→ 与 Ctrl+↑/↓ 快捷键条目", () => {
    const zhSection = SHORTCUT_HELP.zh.find((section) => section.area === "提醒事项");
    expect(zhSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ←/→", desc: "跳到行首 / 行尾" });
    expect(zhSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ↑/↓", desc: "上移 / 下移提醒顺序" });

    const enSection = SHORTCUT_HELP.en.find((section) => section.area === "Reminders");
    expect(enSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ←/→", desc: "Jump to line start / end" });
    expect(enSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ↑/↓", desc: "Move reminder up / down" });
  });

  it("钉死便签 Tab 的短横线补全文案", () => {
    const zhSection = SHORTCUT_HELP.zh.find((section) => section.area === "工作空间与文本");
    expect(zhSection?.shortcuts).toContainEqual({ key: "Tab", desc: "缩进；未标记的行自动补 -" });

    const enSection = SHORTCUT_HELP.en.find((section) => section.area === "Spaces & Text");
    expect(enSection?.shortcuts).toContainEqual({ key: "Tab", desc: "Indent; unmarked lines get a dash" });
  });

  it("帮助面板实际渲染新增的两条提醒快捷键与 Tab 短横线文案", () => {
    const wrapper = mountShortcutHelp("zh");
    const rowTexts = wrapper.findAll(".shortcut-row").map((row) => row.text());

    expect(rowTexts.some((text) => text.includes("Ctrl/⌘ + ←/→") && text.includes("跳到行首 / 行尾"))).toBe(true);
    expect(rowTexts.some((text) => text.includes("Ctrl/⌘ + ↑/↓") && text.includes("上移 / 下移提醒顺序"))).toBe(true);
    expect(rowTexts.some((text) => text.includes("Tab") && text.includes("缩进；未标记的行自动补 -"))).toBe(true);
  });

  it("zh/en 的快捷键条目一一对应，纯键位逐字一致", () => {
    expect(SHORTCUT_HELP.en).toHaveLength(SHORTCUT_HELP.zh.length);
    SHORTCUT_HELP.zh.forEach((zhSection, index) => {
      const enSection = SHORTCUT_HELP.en[index];
      expect(enSection.icon).toBe(zhSection.icon);
      expect(enSection.tips).toHaveLength(zhSection.tips.length);
      expect(enSection.shortcuts).toHaveLength(zhSection.shortcuts.length);
      zhSection.shortcuts.forEach((zhItem, shortcutIndex) => {
        // 键名不含汉字即为纯键位（Ctrl/Tab/方向键…），与语言无关，必须逐字一致；
        // 含汉字的（「拖入文本」等手势描述）按语言本地化，仅受上面的条目数对齐约束。
        if (/[一-鿿]/.test(zhItem.key)) return;
        expect(enSection.shortcuts[shortcutIndex].key).toBe(zhItem.key);
      });
    });
  });
});

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

type ShortcutHelpSections = typeof SHORTCUT_HELP.zh;

// 剥离本地化描述后比较组合键骨架；纯符号键（⌘ ← ↑ ↓）走严格比较。
function keyBinding(key: string): string {
  return key.split(" / ")[0].replace(/[一-鿿]/g, "").trim();
}

function collectKeyBindingMismatches(zh: ShortcutHelpSections, en: ShortcutHelpSections): string[] {
  const mismatches: string[] = [];
  zh.forEach((zhSection, sectionIndex) => {
    zhSection.shortcuts.forEach((zhItem, shortcutIndex) => {
      const enKey = en[sectionIndex]?.shortcuts[shortcutIndex]?.key ?? "<missing>";
      if (!/[一-鿿]/.test(zhItem.key)) {
        if (enKey !== zhItem.key) mismatches.push(`[${zhSection.area}] ${zhItem.key} ≠ ${enKey}`);
        return;
      }
      // 混合键里「 / 」之后是本地化手势（拖拽图片 / Drag image），允许各自表述；
      // 之前的前缀组合键（Ctrl + V）语言无关，漂移必须报出。骨架剥空即纯手势，跳过。
      const binding = keyBinding(zhItem.key);
      if (!binding) return;
      if (keyBinding(enKey) !== binding) mismatches.push(`[${zhSection.area}] ${binding} ≠ ${keyBinding(enKey)}`);
    });
  });
  return mismatches;
}

describe("SHORTCUT_HELP entries", () => {
  it("pins the reminder Ctrl+←/→ and Ctrl+↑/↓ shortcut entries", () => {
    const zhSection = SHORTCUT_HELP.zh.find((section) => section.area === "提醒事项");
    expect(zhSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ←/→", desc: "跳到行首 / 行尾" });
    expect(zhSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ↑/↓", desc: "上移 / 下移提醒顺序" });

    const enSection = SHORTCUT_HELP.en.find((section) => section.area === "Reminders");
    expect(enSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ←/→", desc: "Jump to line start / end" });
    expect(enSection?.shortcuts).toContainEqual({ key: "Ctrl/⌘ + ↑/↓", desc: "Move reminder up / down" });
  });

  it("pins the Tab dash-autofill copy for notes", () => {
    const zhSection = SHORTCUT_HELP.zh.find((section) => section.area === "工作空间与文本");
    expect(zhSection?.shortcuts).toContainEqual({ key: "Tab", desc: "缩进；未标记的行自动补 -" });

    const enSection = SHORTCUT_HELP.en.find((section) => section.area === "Spaces & Text");
    expect(enSection?.shortcuts).toContainEqual({ key: "Tab", desc: "Indent; unmarked lines get a dash" });
  });

  it("renders the new reminder shortcuts and the Tab dash copy in the panel", () => {
    const wrapper = mountShortcutHelp("zh");
    const rowTexts = wrapper.findAll(".shortcut-row").map((row) => row.text());

    expect(rowTexts.some((text) => text.includes("Ctrl/⌘ + ←/→") && text.includes("跳到行首 / 行尾"))).toBe(true);
    expect(rowTexts.some((text) => text.includes("Ctrl/⌘ + ↑/↓") && text.includes("上移 / 下移提醒顺序"))).toBe(true);
    expect(rowTexts.some((text) => text.includes("Tab") && text.includes("缩进；未标记的行自动补 -"))).toBe(true);
  });

  it("keeps zh/en shortcut entries aligned with identical key bindings", () => {
    expect(SHORTCUT_HELP.en).toHaveLength(SHORTCUT_HELP.zh.length);
    SHORTCUT_HELP.zh.forEach((zhSection, index) => {
      const enSection = SHORTCUT_HELP.en[index];
      expect(enSection.icon).toBe(zhSection.icon);
      expect(enSection.tips).toHaveLength(zhSection.tips.length);
      expect(enSection.shortcuts).toHaveLength(zhSection.shortcuts.length);
    });
    expect(collectKeyBindingMismatches(SHORTCUT_HELP.zh, SHORTCUT_HELP.en)).toEqual([]);
  });

  it("flags drift in the ASCII binding half of a mixed-language key", () => {
    const drifted = JSON.parse(JSON.stringify(SHORTCUT_HELP.zh)) as ShortcutHelpSections;
    const pasteEntry = drifted
      .find((section) => section.area === "图床与预览")
      ?.shortcuts.find((item) => item.key === "Ctrl + V / 拖拽图片");
    expect(pasteEntry).toBeDefined();
    pasteEntry!.key = "⌘ + V / 拖拽图片";

    const mismatches = collectKeyBindingMismatches(drifted, SHORTCUT_HELP.en);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain("Ctrl + V");
    expect(mismatches[0]).toContain("⌘ + V");
  });
});

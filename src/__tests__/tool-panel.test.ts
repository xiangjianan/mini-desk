import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ToolPanel from "../components/ToolPanel.vue";

const ACTIVE_TOOL_STORAGE_KEY = "todo-board-active-tool";

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
        :data-key="option.key"
        type="button"
        @click="$emit('select', option.key)"
      >
        <span v-if="option.icon" class="dropdown-option-icon"></span>
        {{ option.label }}
      </button>
    </div>
  `,
};

function mountToolPanel(props = {}) {
  return mount(ToolPanel, {
    props: {
      titleId: "tools-title",
      title: "🔧 工具",
      language: "zh",
      ...props,
    },
    global: {
      stubs: {
        NDropdown: dropdownStub,
        Dropdown: dropdownStub,
        "n-dropdown": dropdownStub,
      },
    },
  });
}

describe("ToolPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders icon-only square tabs, starts closed, closes from the tab menu, and persists the selected tool", async () => {
    const wrapper = mountToolPanel();

    expect(wrapper.find(".tool-panel").exists()).toBe(true);
    expect(wrapper.get(".tool-tabs").attributes("role")).toBe("tablist");
    expect(wrapper.findAll(".tool-tab-icon")).toHaveLength(5);
    expect(wrapper.findAll(".tool-tab").map((tab) => tab.text().trim())).toEqual(["", "", "", "", ""]);
    expect(wrapper.findAll(".tool-tab").map((tab) => tab.attributes("aria-label"))).toEqual([
      "计算器",
      "进制转换",
      "取色板",
      "编解码",
      "随机密码生成",
    ]);
    expect(wrapper.get(".tool-content").text().trim()).toBe("");
    expect(wrapper.get(".tool-panel-header .count").text().trim()).toBe("");

    await wrapper.findAll(".tool-tab")[3].trigger("click");

    expect(wrapper.get(".tool-content").text()).toContain("Base64 编码");
    expect(wrapper.findAll(".tool-tab")[3].attributes("aria-selected")).toBe("true");
    expect(wrapper.get(".tool-panel-header .count").text()).toContain("编解码");
    expect(localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY)).toBe("codec");

    wrapper.unmount();
    const persisted = mountToolPanel();

    expect(persisted.get(".tool-content").text()).toContain("Base64 编码");
    expect(persisted.findAll(".tool-tab")[3].attributes("aria-selected")).toBe("true");

    await persisted.findAll(".tool-tab")[3].trigger("contextmenu", { clientX: 12, clientY: 16 });

    expect(persisted.get(".dropdown-option").text()).toContain("关闭");
    expect(persisted.find(".dropdown-option-icon").exists()).toBe(true);

    await persisted.get(".dropdown-option").trigger("click");

    expect(persisted.get(".tool-content").text().trim()).toBe("");
    expect(persisted.findAll(".tool-tab")[3].attributes("aria-selected")).toBe("false");
    expect(localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY)).toBe("");
  });

  it("opens the close menu from the tool work area and uses the narrow tool scrollbar", async () => {
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[2].trigger("click");
    await wrapper.get(".tool-content").trigger("contextmenu", { clientX: 44, clientY: 52 });

    expect(wrapper.get(".dropdown-option").text()).toContain("关闭");

    await wrapper.get(".dropdown-option").trigger("click");

    expect(wrapper.get(".tool-content").text().trim()).toBe("");
    expect(localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY)).toBe("");
    expect(wrapper.find(".tool-content-scrollbar").exists()).toBe(true);

    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    expect(styles).toMatch(/\.tool-content-scrollbar\s*\{[^}]*--n-scrollbar-width: var\(--scrollbar-size\) !important/s);
  });

  it("opens the close menu only from each selected tool page blank area without intercepting content or controls", async () => {
    const wrapper = mountToolPanel();
    const toolPaneSelectors = [".calculator-tool", ".base-tool", ".color-tool", ".codec-tool", ".password-tool"];

    for (const [index, selector] of toolPaneSelectors.entries()) {
      await wrapper.findAll(".tool-tab")[index].trigger("click");
      await wrapper.get(selector).trigger("contextmenu", { clientX: 64 + index, clientY: 72 + index });

      expect(wrapper.get(".dropdown-option").text()).toContain("关闭");

      await wrapper.get(".dropdown-option").trigger("click");
      expect(wrapper.get(".tool-content").text().trim()).toBe("");
    }

    await wrapper.findAll(".tool-tab")[0].trigger("click");
    await wrapper.get('[data-testid="calculator-expression"]').trigger("contextmenu", { clientX: 80, clientY: 92 });

    expect(wrapper.find(".dropdown-option").exists()).toBe(false);
    expect(wrapper.findAll(".tool-tab")[0].attributes("aria-selected")).toBe("true");

    await wrapper.findAll(".tool-tab")[1].trigger("click");
    await wrapper.get('[data-testid="base-result-10"]').trigger("contextmenu", { clientX: 140, clientY: 160 });

    expect(wrapper.find(".dropdown-option").exists()).toBe(false);
    expect(wrapper.findAll(".tool-tab")[1].attributes("aria-selected")).toBe("true");

    await wrapper.get(".tool-workbench").trigger("contextmenu", { clientX: 220, clientY: 260 });

    expect(wrapper.get(".dropdown-option").text()).toContain("关闭");

    await wrapper.get(".dropdown-option").trigger("click");
    await wrapper.findAll(".tool-tab")[1].trigger("click");
    await wrapper.get(".tool-content-scrollbar").trigger("contextmenu", { clientX: 228, clientY: 280 });

    expect(wrapper.get(".dropdown-option").text()).toContain("关闭");
  });

  it("emits a tool tips message when clicking the empty tool area before selecting a tab", async () => {
    const wrapper = mountToolPanel();

    await wrapper.get(".tool-content.is-empty").trigger("click");

    expect(wrapper.emitted("message")?.[0][0]).toMatch(/^可用工具：计算器、进制转换、取色板、编解码、随机密码生成。点击左侧图标打开工具。 .+$/);
  });

  it("keeps calculator and base conversion as separate tools", async () => {
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[0].trigger("click");
    await wrapper.get('[data-testid="calculator-key-1"]').trigger("click");
    await wrapper.get('[data-testid="calculator-key-2"]').trigger("click");
    await wrapper.get('[data-testid="calculator-key-add"]').trigger("click");
    await wrapper.get('[data-testid="calculator-key-5"]').trigger("click");
    await wrapper.get('[data-testid="calculator-key-equals"]').trigger("click");

    expect((wrapper.get('[data-testid="calculator-expression"]').element as HTMLInputElement).value).toBe("17");
    expect(wrapper.find('[data-testid="base-source"]').exists()).toBe(false);

    await wrapper.findAll(".tool-tab")[1].trigger("click");

    expect(wrapper.find('[data-testid="calculator-expression"]').exists()).toBe(false);
    expect(wrapper.get(".base-source-row").find('[data-testid="base-from"]').exists()).toBe(true);
    expect(wrapper.get(".base-source-row").find('[data-testid="base-source"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="base-from"]').findAll("option").map((option) => option.text())).toEqual([
      "二进制",
      "八进制",
      "十进制",
      "十六进制",
    ]);

    await wrapper.get('[data-testid="base-source"]').setValue("ff");
    await wrapper.get('[data-testid="base-from"]').setValue("16");

    expect(wrapper.get('[data-testid="base-result-2"]').text()).toContain("二进制");
    expect(wrapper.get('[data-testid="base-result-2"]').text()).toContain("11111111");
    expect(wrapper.get('[data-testid="base-result-8"]').text()).toContain("八进制");
    expect(wrapper.get('[data-testid="base-result-8"]').text()).toContain("377");
    expect(wrapper.get('[data-testid="base-result-10"]').text()).toContain("十进制");
    expect(wrapper.get('[data-testid="base-result-10"]').text()).toContain("255");
    expect(wrapper.get('[data-testid="base-result-16"]').text()).toContain("十六进制");
    expect(wrapper.get('[data-testid="base-result-16"]').text()).toContain("ff");
  });

  it("copies base conversion values", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[1].trigger("click");
    await wrapper.get('[data-testid="base-source"]').setValue("ff");
    await wrapper.get('[data-testid="base-from"]').setValue("16");
    await wrapper.get('[data-testid="copy-base-2"]').trigger("click");

    expect(writeText).toHaveBeenCalledWith("11111111");
    expect(wrapper.emitted("message")?.at(-1)?.[0]).toMatch(/^复制成功 .+$/);
  });

  it("emits tool prompts for the app message bubble instead of rendering inline text", async () => {
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[0].trigger("click");
    await wrapper.get('[data-testid="calculator-expression"]').setValue("1+");
    await wrapper.get('[data-testid="calculator-key-equals"]').trigger("click");

    expect(wrapper.find(".tool-message").exists()).toBe(false);
    expect(wrapper.emitted("message")?.[0][0]).toMatch(/^表达式无效 .+$/);

    await wrapper.findAll(".tool-tab")[1].trigger("click");
    await wrapper.get('[data-testid="base-source"]').setValue("ff");
    await wrapper.get('[data-testid="base-source"]').trigger("blur");

    expect(wrapper.find(".tool-message").exists()).toBe(false);
    expect(wrapper.emitted("message")?.at(-1)?.[0]).toMatch(/^当前进制无法识别该值 .+$/);
  });

  it("asks the app to dismiss fading tool messages when switching tools", async () => {
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[2].trigger("click");
    await wrapper.findAll(".tool-tab")[3].trigger("click");

    expect(wrapper.emitted("dismissMessage")).toBeTruthy();
  });

  it("uses the EyeDropper API when available and mirrors the picked color values", async () => {
    const open = vi.fn().mockResolvedValue({ sRGBHex: "#336699" });
    class MockEyeDropper {
      open = open;
    }
    vi.stubGlobal("EyeDropper", MockEyeDropper);
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[2].trigger("click");
    await wrapper.get('[data-testid="eyedropper"]').trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(open).toHaveBeenCalled();
    expect((wrapper.get('[data-testid="color-value"]').element as HTMLInputElement).value).toBe("#336699");
    expect(wrapper.get('[data-testid="color-rgb"]').text()).toContain("rgb(51, 102, 153)");
    expect(wrapper.emitted("message")?.at(-1)?.[0]).toMatch(/^已拾取颜色 .+$/);

    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    expect(styles).toMatch(/\.eyedropper-button\s*\{[^}]*animation: eyedropper-flow 10s linear infinite/s);
    expect(styles).toMatch(/\.eyedropper-button\s*\{[^}]*linear-gradient\(100deg/s);
    expect(styles).toMatch(/\.eyedropper-button\s*\{[^}]*#ef4444 0%[\s\S]*#ef4444 50%[\s\S]*#ef4444 100%/s);
    expect(styles).toMatch(/\.eyedropper-button\s*\{[^}]*background-size: 1000% 100%/s);
    expect(styles).toMatch(/@keyframes eyedropper-flow\s*\{[\s\S]*?from\s*\{[^}]*background-position: 0% 50%[\s\S]*?to\s*\{[^}]*background-position: -100% 50%/s);
  });

  it("keeps color picking usable in Safari by falling back to the color input", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[2].trigger("click");
    const eyedropper = wrapper.get('[data-testid="eyedropper"]');

    expect(eyedropper.attributes("disabled")).toBeUndefined();
    expect(eyedropper.find(".eyedropper-icon").exists()).toBe(true);

    await eyedropper.trigger("click");

    expect(click).toHaveBeenCalled();
    expect(wrapper.emitted("message")?.at(-1)?.[0]).toMatch(/^当前浏览器已切换为系统颜色选择器。 .+$/);
    click.mockRestore();
  });

  it("parses HEX, RGB, and HSL color input and copies color values", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[2].trigger("click");
    expect(wrapper.get(".color-pick-row").find('input[type="color"]').exists()).toBe(true);
    expect(wrapper.get(".color-pick-row").find('[data-testid="eyedropper"]').exists()).toBe(true);
    expect((wrapper.get('[data-testid="color-value"]').element as HTMLInputElement).value).toBe("#ffffff");
    expect(wrapper.get('[data-testid="color-rgb"]').text()).toContain("rgb(255, 255, 255)");

    await wrapper.get('[data-testid="color-value"]').setValue("rgb(51, 102, 153)");
    await wrapper.get('[data-testid="color-value"]').trigger("blur");

    expect((wrapper.get('[data-testid="color-value"]').element as HTMLInputElement).value).toBe("#336699");
    expect(wrapper.get('[data-testid="color-rgb"]').text()).toContain("rgb(51, 102, 153)");

    await wrapper.get('[data-testid="color-value"]').setValue("hsl(210, 50%, 40%)");
    await wrapper.get('[data-testid="color-value"]').trigger("blur");

    expect((wrapper.get('[data-testid="color-value"]').element as HTMLInputElement).value).toBe("#336699");

    await wrapper.get('[data-testid="copy-color-rgb"]').trigger("click");

    expect(writeText).toHaveBeenCalledWith("rgb(51, 102, 153)");
  });

  it("uses white as the default color in light mode and black in dark mode", async () => {
    const light = mountToolPanel({ theme: "light" });
    await light.findAll(".tool-tab")[2].trigger("click");

    expect((light.get('[data-testid="color-value"]').element as HTMLInputElement).value).toBe("#ffffff");
    expect(light.get('[data-testid="color-rgb"]').text()).toContain("rgb(255, 255, 255)");

    const dark = mountToolPanel({ theme: "dark" });
    await dark.findAll(".tool-tab")[2].trigger("click");

    expect((dark.get('[data-testid="color-value"]').element as HTMLInputElement).value).toBe("#000000");
    expect(dark.get('[data-testid="color-rgb"]').text()).toContain("rgb(0, 0, 0)");
  });

  it("encodes and decodes Base64 and URL text", async () => {
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[3].trigger("click");
    await wrapper.get('[data-testid="codec-input"]').setValue("你好 Codex");
    await wrapper.get('[data-testid="base64-encode"]').trigger("click");
    const encoded = (wrapper.get('[data-testid="codec-output"]').element as HTMLTextAreaElement).value;
    expect(encoded).toBe("5L2g5aW9IENvZGV4");

    await wrapper.get('[data-testid="codec-input"]').setValue(encoded);
    await wrapper.get('[data-testid="base64-decode"]').trigger("click");
    expect((wrapper.get('[data-testid="codec-output"]').element as HTMLTextAreaElement).value).toBe("你好 Codex");

    await wrapper.get('[data-testid="codec-input"]').setValue("a b&c=1");
    await wrapper.get('[data-testid="url-encode"]').trigger("click");
    expect((wrapper.get('[data-testid="codec-output"]').element as HTMLTextAreaElement).value).toBe("a%20b%26c%3D1");

    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    expect(styles).toMatch(/\.codec-actions\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(/\.codec-tool,[\s\S]*?\.password-tool textarea\s*\{[^}]*font-size: 12px/s);
  });

  it("generates a random password from editable special characters and can reset them", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mountToolPanel();

    await wrapper.findAll(".tool-tab")[4].trigger("click");
    expect((wrapper.get('[data-testid="password-symbols"]').element as HTMLInputElement).checked).toBe(true);

    const slider = wrapper.getComponent({ name: "Slider" });
    slider.vm.$emit("update:value", 20);
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="password-uppercase"]').setValue(false);
    await wrapper.get('[data-testid="password-lowercase"]').setValue(false);
    await wrapper.get('[data-testid="password-numbers"]').setValue(false);
    await wrapper.get('[data-testid="password-symbol-set"]').setValue("~");

    expect(wrapper.find(".password-symbol-options").exists()).toBe(false);
    expect(wrapper.find('[data-testid="password-custom-symbols"]').exists()).toBe(false);

    await wrapper.get('[data-testid="password-generate"]').trigger("click");

    const password = (wrapper.get('[data-testid="password-output"]').element as HTMLInputElement).value;
    expect(password).toHaveLength(20);
    expect(password).toMatch(/^~+$/);

    await wrapper.get('[data-testid="password-symbol-reset"]').trigger("click");

    const resetSymbols = (wrapper.get('[data-testid="password-symbol-set"]').element as HTMLTextAreaElement).value;
    expect(resetSymbols).toContain("_");
    expect(resetSymbols).not.toContain("~");
    expect(wrapper.get('[data-testid="password-symbol-reset"]').text().trim()).toBe("");

    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    expect(styles).toMatch(/\.password-options\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(styles).toMatch(/\.note-panel\.tool-panel \.codec-actions,[\s\S]*?\.note-panel\.tool-panel \.password-options\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);

    await wrapper.get('[data-testid="copy-password"]').trigger("click");

    expect(writeText).toHaveBeenCalledWith(password);
  });
});

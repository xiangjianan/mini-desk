import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TextPanel from "../components/TextPanel.vue";

const tooltipStub = {
  template: '<span><slot name="trigger" /><slot /></span>',
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
        :data-key="option.key"
        :disabled="option.disabled"
        type="button"
        @click="!option.disabled && $emit('select', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  `,
};

describe("TextPanel", () => {
  it("renders dash markers only for indented lines inside the editable text flow", () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [
          { text: "root", indent: 0 },
          { text: "child", indent: 2 },
        ],
      },
    });

    expect(wrapper.get("textarea").element.value).toBe("root\n\t\t- child");
    expect(wrapper.find(".text-bullet-layer").exists()).toBe(false);
  });

  it("stores text lines without the visual dash marker", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [],
      },
    });

    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").setValue("root\n\t- child");

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
      { text: "root", indent: 0 },
      { text: "child", indent: 1 },
    ]);
  });

  it("keeps the dash marker with the inherited indent when pressing Enter", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "child", indent: 1 }],
      },
    });
    const textarea = wrapper.get("textarea").element;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });

    expect(textarea.value).toBe("\t- child\n\t- ");
  });

  it("does not insert a dash marker when pressing Enter on a root line", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });

    expect(textarea.value).toBe("root\n");
  });

  it("exits indentation when pressing Enter on an empty indented marker line", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "", indent: 2 }],
      },
    });
    const textarea = wrapper.get("textarea").element;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();

    expect(textarea.value).toBe("");
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([]);
  });

  it("keeps the caret collapsed when indenting a root line", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").trigger("keydown", { key: "Tab" });

    expect(textarea.value).toBe("\t- root");
    expect(textarea.selectionStart).toBe(textarea.selectionEnd);
    expect(textarea.selectionStart).toBe("\t- root".length);
  });

  it("does not intercept Enter while Chinese IME composition is active", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "ni", indent: 0 }],
      },
      global: {
        stubs: {
          NTooltip: tooltipStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element;
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "isComposing", { value: true });

    textarea.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("keeps the text area readonly until it is double-clicked", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea");

    expect(textarea.attributes("readonly")).toBeDefined();

    await textarea.trigger("keydown", { key: "Tab" });
    expect((textarea.element as HTMLTextAreaElement).value).toBe("root");

    await textarea.trigger("dblclick");

    expect(textarea.attributes("readonly")).toBeUndefined();
  });

  it("does not prevent the native mobile focus when double-click editing starts", async () => {
    const wrapper = mount(TextPanel, {
      attachTo: document.body,
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    const event = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    });

    textarea.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(textarea.readOnly).toBe(false);
    expect(document.activeElement).toBe(textarea);

    wrapper.unmount();
  });

  it("starts mobile editing from the second touchstart so mobile keyboards can open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const wrapper = mount(TextPanel, {
      attachTo: document.body,
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    const focusSpy = vi.spyOn(textarea, "focus");

    textarea.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();

    expect(textarea.readOnly).toBe(true);
    expect(document.activeElement).not.toBe(textarea);

    await vi.advanceTimersByTimeAsync(120);
    textarea.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true }));

    expect(focusSpy).toHaveBeenCalled();
    expect(textarea.readOnly).toBe(false);

    await wrapper.vm.$nextTick();

    expect(textarea.readOnly).toBe(false);
    expect(document.activeElement).toBe(textarea);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("collapses the caret instead of selecting text when double-click editing starts", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    textarea.setSelectionRange(1, 5);
    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.vm.$nextTick();

    expect(textarea.selectionStart).toBe(textarea.selectionEnd);
  });

  it("keeps the caret at the original clicked position when double-click editing starts", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    textarea.setSelectionRange(6, 6);
    await wrapper.get("textarea").trigger("mouseup");
    textarea.setSelectionRange(1, 5);
    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.vm.$nextTick();

    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(6);
  });

  it("opens the usage guide from a text panel context menu", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    await wrapper.get(".text-editor-frame").trigger("contextmenu");
    await wrapper.get(".dropdown-option").trigger("click");

    expect(wrapper.emitted("guide")?.[0]).toEqual([expect.any(HTMLElement), true]);
  });

  it("shows copy and paste actions when right-clicking selected editable text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue(" pasted");
    Object.assign(navigator, { clipboard: { writeText, readText } });
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(0, 4);
    await wrapper.get("textarea").trigger("select");
    await wrapper.get("textarea").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["编辑", "复制", "粘贴", "使用指南"]);

    textarea.setSelectionRange(4, 4);
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "复制")?.trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("root");
    wrapper.unmount();
  });

  it("keeps copy and paste visible but disabled when the text state cannot use them", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    textarea.setSelectionRange(0, 0);
    await wrapper.get("textarea").trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["编辑", "复制", "粘贴", "使用指南"]);
    expect(wrapper.get('[data-key="copy"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-key="paste"]').attributes("disabled")).toBeDefined();

    await wrapper.get('[data-key="copy"]').trigger("click");

    expect(wrapper.emitted("guide")).toBeUndefined();
    wrapper.unmount();
  });

  it("starts editing from the text panel context menu", async () => {
    const wrapper = mount(TextPanel, {
      attachTo: document.body,
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    expect(textarea.readOnly).toBe(true);

    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "编辑")?.trigger("click");
    await wrapper.vm.$nextTick();

    expect(textarea.readOnly).toBe(false);
    expect(document.activeElement).toBe(textarea);
    wrapper.unmount();
  });

  it("enables copy for selected readonly text while paste stays disabled until editing is active", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    textarea.setSelectionRange(0, 4);
    await wrapper.get("textarea").trigger("select");
    await wrapper.get("textarea").trigger("contextmenu");

    expect(wrapper.get('[data-key="copy"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.get('[data-key="paste"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("pastes clipboard text into the editable text panel from the context menu", async () => {
    const readText = vi.fn().mockResolvedValue(" pasted");
    Object.assign(navigator, { clipboard: { readText, writeText: vi.fn() } });
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "粘贴")?.trigger("click");
    await Promise.resolve();

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([{ text: "root pasted", indent: 0 }]);
    wrapper.unmount();
  });

  it("still pastes from the context menu after the editor blurs to the menu", async () => {
    const readText = vi.fn().mockResolvedValue(" pasted");
    Object.assign(navigator, { clipboard: { readText, writeText: vi.fn() } });
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.get("textarea").trigger("blur");
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "粘贴")?.trigger("click");
    await Promise.resolve();

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([{ text: "root pasted", indent: 0 }]);
    wrapper.unmount();
  });
});

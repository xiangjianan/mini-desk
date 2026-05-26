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

  it("inserts a new line after the current line when pressing Shift+Enter", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "child text", indent: 1 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    const caret = textarea.value.indexOf(" text");
    textarea.setSelectionRange(caret, caret);

    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(caret, caret);
    await wrapper.get("textarea").trigger("keydown", { key: "Enter", shiftKey: true });

    expect(textarea.value).toBe("\t- child text\n");
    expect(textarea.selectionStart).toBe("\t- child text\n".length);
    expect(textarea.selectionEnd).toBe("\t- child text\n".length);
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
      { text: "child text", indent: 1 },
      { text: "", indent: 0 },
    ]);
  });

  it("continues numbered lists when pressing Enter", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "1. 第一项", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });

    expect(textarea.value).toBe("1. 第一项\n2. ");
  });

  it("continues unordered root lists when pressing Enter", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "- 第一项", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });

    expect(textarea.value).toBe("- 第一项\n- ");
  });

  it("exits empty numbered or unordered root lists when pressing Enter", async () => {
    const numbered = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "2. ", indent: 0 }],
      },
    });
    const numberedTextarea = numbered.get("textarea").element;
    numberedTextarea.setSelectionRange(numberedTextarea.value.length, numberedTextarea.value.length);

    await numbered.get("textarea").trigger("dblclick");
    await numbered.get("textarea").trigger("keydown", { key: "Enter" });

    expect(numberedTextarea.value).toBe("");
    numbered.unmount();

    const unordered = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "- ", indent: 0 }],
      },
    });
    const unorderedTextarea = unordered.get("textarea").element;
    unorderedTextarea.setSelectionRange(unorderedTextarea.value.length, unorderedTextarea.value.length);

    await unordered.get("textarea").trigger("dblclick");
    await unordered.get("textarea").trigger("keydown", { key: "Enter" });

    expect(unorderedTextarea.value).toBe("");
    unordered.unmount();
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

  it("undoes the latest text edit with Ctrl+Z inside the current editor", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("click");
    await wrapper.get("textarea").setValue("root changed");
    await wrapper.get("textarea").trigger("keydown", { key: "z", ctrlKey: true });

    expect(textarea.value).toBe("root");
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([{ text: "root", indent: 0 }]);
  });

  it("outdents an empty indented line when pressing Backspace or Delete", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "", indent: 2 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("click");
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("keydown", { key: "Backspace" });

    expect(textarea.value).toBe("\t- ");
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([{ text: "", indent: 1 }]);

    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("keydown", { key: "Delete" });

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

  it("starts editing from a single click", async () => {
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

    await textarea.trigger("click");

    expect(textarea.attributes("readonly")).toBeUndefined();
  });

  it("does not prevent the native focus when click editing starts", async () => {
    const wrapper = mount(TextPanel, {
      attachTo: document.body,
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    const event = new MouseEvent("click", {
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

  it("unlocks mobile touch editing before the native focus step", async () => {
    const PointerEventStub = window.PointerEvent;
    vi.stubGlobal("PointerEvent", undefined);
    const wrapper = mount(TextPanel, {
      attachTo: document.body,
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    const firstTouch = new TouchEvent("touchstart", { bubbles: true, cancelable: true });
    textarea.dispatchEvent(firstTouch);
    await wrapper.vm.$nextTick();

    expect(firstTouch.defaultPrevented).toBe(false);
    expect(textarea.readOnly).toBe(false);
    expect(textarea.inputMode).toBe("text");

    wrapper.unmount();
    vi.stubGlobal("PointerEvent", PointerEventStub);
  });

  it("unlocks mobile pointer editing before the native focus step", async () => {
    const wrapper = mount(TextPanel, {
      attachTo: document.body,
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    const firstTap = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(firstTap, "pointerType", { value: "touch" });
    textarea.dispatchEvent(firstTap);
    await wrapper.vm.$nextTick();

    expect(firstTap.defaultPrevented).toBe(false);
    expect(textarea.readOnly).toBe(false);
    expect(textarea.inputMode).toBe("text");

    wrapper.unmount();
  });

  it("starts click editing with a collapsed caret", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    textarea.setSelectionRange(1, 5);
    await wrapper.get("textarea").trigger("click");
    await wrapper.vm.$nextTick();

    expect(textarea.selectionStart).toBe(textarea.selectionEnd);
  });

  it("does not override text selection after the editor is already active", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    await wrapper.get("textarea").trigger("click");
    textarea.setSelectionRange(1, 5);
    await wrapper.get("textarea").trigger("mouseup");
    await wrapper.get("textarea").trigger("click");
    await wrapper.vm.$nextTick();

    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(5);
  });

  it("preserves a mouse text selection when readonly text starts editing", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "root text", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;

    textarea.setSelectionRange(1, 5);
    await wrapper.get("textarea").trigger("mouseup");
    await wrapper.get("textarea").trigger("click");
    await wrapper.vm.$nextTick();

    expect(textarea.readOnly).toBe(false);
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(5);
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

  it("keeps the native textarea context menu when async clipboard APIs are unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined });
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
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 16,
    });

    textarea.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.find(".dropdown-option").exists()).toBe(false);
    wrapper.unmount();
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

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["复制", "粘贴", "Tips"]);

    textarea.setSelectionRange(4, 4);
    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "复制")?.trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("root");
    wrapper.unmount();
  });

  it("keeps copy disabled without a selection while paste can start editing from the context menu", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue(" pasted"), writeText: vi.fn() } });
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

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["复制", "粘贴", "Tips"]);
    expect(wrapper.get('[data-key="copy"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-key="paste"]').attributes("disabled")).toBeUndefined();

    await wrapper.get('[data-key="copy"]').trigger("click");

    expect(wrapper.emitted("guide")).toBeUndefined();
    wrapper.unmount();
  });

  it("enables copy and paste for selected readonly text from the context menu", async () => {
    Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue(" pasted"), writeText: vi.fn() } });
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
    expect(wrapper.get('[data-key="paste"]').attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("enters editing mode immediately after text selection", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "可以被选中的文本", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);

    await wrapper.get("textarea").trigger("select");

    expect(textarea.readOnly).toBe(false);
    expect(textarea.getAttribute("inputmode")).toBe("text");
  });

  it("copies a readonly mouse selection from the context menu after editing starts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } });
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
    await wrapper.get("textarea").trigger("mouseup");
    await wrapper.get("textarea").trigger("click");
    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.get('[data-key="copy"]').trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("root");
    wrapper.unmount();
  });

  it("falls back to the browser copy command when async clipboard writing fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } });
    Object.assign(document, { execCommand });
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
    await wrapper.get('[data-key="copy"]').trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("root");
    expect(execCommand).toHaveBeenCalledWith("copy");
    wrapper.unmount();
  });

  it("pastes clipboard text from the context menu before the text panel is focused", async () => {
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

    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("contextmenu");
    expect(wrapper.get('[data-key="paste"]').attributes("disabled")).toBeUndefined();

    await wrapper.get('[data-key="paste"]').trigger("click");
    await Promise.resolve();

    expect(textarea.readOnly).toBe(false);
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([{ text: "root pasted", indent: 0 }]);
    wrapper.unmount();
  });

  it("falls back to the browser paste command when async clipboard reading fails", async () => {
    const readText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.assign(navigator, { clipboard: { readText, writeText: vi.fn() } });
    const wrapper = mount(TextPanel, {
      attachTo: document.body,
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
    const execCommand = vi.fn((command: string) => {
      if (command !== "paste") return false;
      textarea.setRangeText(" fallback", textarea.selectionStart ?? textarea.value.length, textarea.selectionEnd ?? textarea.value.length, "end");
      return true;
    });
    Object.assign(document, { execCommand });

    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await wrapper.get("textarea").trigger("contextmenu");
    await wrapper.get('[data-key="paste"]').trigger("click");
    await Promise.resolve();

    expect(readText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("paste");
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([{ text: "root fallback", indent: 0 }]);
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

  it("normalizes visible pasted ordered lists before emitting updates", async () => {
    const readText = vi.fn().mockResolvedValue("\n10. 第四项");
    Object.assign(navigator, { clipboard: { readText, writeText: vi.fn() } });
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "1. 第一项", indent: 0 }],
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

    expect(textarea.value).toBe("1. 第一项\n2. 第四项");
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
      { text: "1. 第一项", indent: 0 },
      { text: "2. 第四项", indent: 0 },
    ]);
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

  it("renumbers root ordered lists after a middle item is removed", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "note-title",
        title: "备忘录",
        lines: [
          { text: "1. 第一项", indent: 0 },
          { text: "2. 第二项", indent: 0 },
          { text: "4. 第四项", indent: 0 },
        ],
      },
    });

    expect(wrapper.get("textarea").element.value).toBe("1. 第一项\n2. 第二项\n3. 第四项");

    await wrapper.get("textarea").trigger("click");
    await wrapper.get("textarea").setValue("1. 第一项\n3. 第四项");

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
      { text: "1. 第一项", indent: 0 },
      { text: "2. 第四项", indent: 0 },
    ]);
  });

  it("adjusts the caret when auto-renumbering shortens text before it", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "note-title",
        title: "备忘录",
        lines: [{ text: "1. 第一项", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    const raw = "1. 第一项\n10. 第四项";
    const expected = "1. 第一项\n2. 第四项";
    const rawCaret = raw.indexOf("第四项");
    const expectedCaret = expected.indexOf("第四项");

    await wrapper.get("textarea").trigger("click");
    textarea.value = raw;
    textarea.setSelectionRange(rawCaret, rawCaret);
    await wrapper.get("textarea").trigger("input");

    expect(textarea.value).toBe(expected);
    expect(textarea.selectionStart).toBe(expectedCaret);
    expect(textarea.selectionEnd).toBe(expectedCaret);
  });

  it("renumbers ordered lists independently by indentation level", () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [
          { text: "1. 父项", indent: 0 },
          { text: "1. 子项 A", indent: 1 },
          { text: "7. 子项 B", indent: 1 },
          { text: "9. 父项 B", indent: 0 },
        ],
      },
    });

    expect(wrapper.get("textarea").element.value).toBe("1. 父项\n\t- 1. 子项 A\n\t- 2. 子项 B\n2. 父项 B");
  });

  it("resets nested ordered list counters under separate root items", () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [
          { text: "1. Parent A", indent: 0 },
          { text: "1. Child A", indent: 1 },
          { text: "2. Parent B", indent: 0 },
          { text: "1. Child B", indent: 1 },
        ],
      },
    });

    expect(wrapper.get("textarea").element.value).toBe("1. Parent A\n\t- 1. Child A\n2. Parent B\n\t- 1. Child B");
  });

  it("does not renumber dates or versions as ordered lists", () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "note-title",
        title: "备忘录",
        lines: [
          { text: "2026.05 发布", indent: 0 },
          { text: "1.0.18 版本", indent: 0 },
          { text: "散落 2. 文字", indent: 0 },
        ],
      },
    });

    expect(wrapper.get("textarea").element.value).toBe("2026.05 发布\n1.0.18 版本\n散落 2. 文字");
  });

  it("does not renumber year-like prose inside an active ordered list", () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "note-title",
        title: "备忘录",
        lines: [
          { text: "1. Meeting notes", indent: 0 },
          { text: "2026. 05 launch window", indent: 0 },
        ],
      },
    });

    expect(wrapper.get("textarea").element.value).toBe("1. Meeting notes\n2026. 05 launch window");
  });

  it("emits appended lines when external text is dropped", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "已有内容", indent: 0 }],
      },
    });
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "新增 A\n新增 B" : ""),
      },
    });

    await wrapper.get(".text-editor-frame").element.dispatchEvent(event);

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual([
      { text: "已有内容", indent: 0 },
      { text: "新增 A", indent: 0 },
      { text: "新增 B", indent: 0 },
    ]);
  });

  it("preserves existing and dropped text whitespace when external text is dropped", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "已有内容  ", indent: 0 }],
      },
    });
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "  新增 A  " : ""),
      },
    });

    await wrapper.get(".text-editor-frame").element.dispatchEvent(event);

    expect(wrapper.get("textarea").element.value).toBe("已有内容  \n  新增 A  ");
  });

  it("moves the caret to the end after external text is dropped", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "已有内容", indent: 0 }],
      },
    });
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "新增 A" : ""),
      },
    });

    await wrapper.get(".text-editor-frame").element.dispatchEvent(event);

    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(textarea.selectionEnd).toBe(textarea.value.length);
  });

  it("ignores external text drops that include files", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "已有内容", indent: 0 }],
      },
    });
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [{}],
        getData: (type: string) => (type === "text/plain" ? "新增 A" : ""),
      },
    });

    await wrapper.get(".text-editor-frame").element.dispatchEvent(event);

    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("ignores empty external text drops", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "已有内容", indent: 0 }],
      },
    });
    const event = new Event("drop") as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? "   \n\t  " : ""),
      },
    });

    await wrapper.get(".text-editor-frame").element.dispatchEvent(event);

    expect(wrapper.emitted("update")).toBeUndefined();
  });
});

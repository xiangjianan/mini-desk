import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TextPanel from "../components/TextPanel.vue";

const tooltipStub = {
  template: '<span><slot name="trigger" /><slot /></span>',
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
});

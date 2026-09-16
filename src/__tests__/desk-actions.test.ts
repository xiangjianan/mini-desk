import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NModal } from "naive-ui";
import SpacePanel from "../components/SpacePanel.vue";
import TodoPanel from "../components/TodoPanel.vue";
import QuickButtons from "../components/QuickButtons.vue";
import { DEFAULT_TITLES } from "../state/defaults";
import type { PolishResult } from "../sync/polishClient";

const wrappers: ReturnType<typeof mount>[] = [];
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

function mountPastePanel(polish: (kind: "todo" | "note", text: string) => Promise<PolishResult>, raw = "clipboard draft") {
  const readText = vi.fn().mockResolvedValue(raw);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
  const wrapper = mount(SpacePanel, { props: {
    spaces: [{ id: "notes", title: "Notes", lines: [{ text: "Keep the first line", indent: 0 }, { text: "Last line", indent: 0 }] }],
    activeSpaceId: "notes", polish,
  }, attachTo: document.body });
  wrappers.push(wrapper);
  return { wrapper, readText };
}

describe("visible workbench actions", () => {
  it("adds to the selected reminder list without opening a context menu", async () => {
    const wrapper = mount(TodoPanel, { props: {
      titles: DEFAULT_TITLES,
      todos: { morning: [], noon: [], evening: [] },
      todoLists: [{ id: "morning", title: "Morning", collapsed: false, compact: true }, { id: "noon", title: "Noon", collapsed: false, compact: true }],
    }});
    wrappers.push(wrapper);
    await wrapper.findAll('[aria-label="添加提醒"]')[1].trigger("click");
    expect(wrapper.emitted("create")).toEqual([["noon"]]);
  });

  it("opens the existing quick-action editor from the header", async () => {
    const wrapper = mount(QuickButtons, { props: {
      title: "Actions", buttons: [], showHidden: false, language: "en",
    }});
    wrappers.push(wrapper);
    await wrapper.get(".quick-add-button").trigger("click");
    expect(wrapper.findComponent(NModal).props("show")).toBe(true);
    expect(wrapper.emitted("save")).toBeUndefined();
  });

  it("smart paste appends below the last line instead of replacing the selection", async () => {
    const polish = vi.fn(async (): Promise<PolishResult> => ({ items: ["Organized line"] }));
    const { wrapper } = mountPastePanel(polish);
    const textarea = wrapper.get("textarea");
    textarea.element.setSelectionRange(0, 7);
    await textarea.trigger("select");
    await wrapper.get('[aria-label="智能粘贴"]').trigger("click");
    await flushPromises();
    expect(polish).toHaveBeenCalledWith("note", "clipboard draft", undefined);
    expect(textarea.element.value).toBe("Keep the first line\nLast line\nOrganized line");
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe("notes");
  });

  it("appends raw clipboard text on service failure without losing notes", async () => {
    const { wrapper } = mountPastePanel(vi.fn(async () => null));
    await wrapper.get('[aria-label="智能粘贴"]').trigger("click");
    await flushPromises();
    expect(wrapper.get("textarea").element.value).toBe("Keep the first line\nLast line\nclipboard draft");
  });

  it("does not duplicate requests while a paste is pending", async () => {
    let finish!: (result: PolishResult) => void;
    const polish = vi.fn(() => new Promise<PolishResult>((resolve) => { finish = resolve; }));
    const { wrapper, readText } = mountPastePanel(polish);
    const button = wrapper.get('[aria-label="智能粘贴"]');
    await button.trigger("click");
    await flushPromises();
    expect(button.attributes("disabled")).toBeDefined();
    await button.trigger("click");
    expect(readText).toHaveBeenCalledTimes(1);
    finish({ items: ["Done"] });
    await flushPromises();
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("discards a result after switching to another note space", async () => {
    let finish!: (result: PolishResult) => void;
    const { wrapper } = mountPastePanel(() => new Promise<PolishResult>((resolve) => { finish = resolve; }));
    await wrapper.get('[aria-label="智能粘贴"]').trigger("click");
    await flushPromises();
    await wrapper.setProps({ spaces: [{ id: "other", title: "Other", lines: [{ text: "Do not touch", indent: 0 }] }], activeSpaceId: "other" });
    finish({ items: ["Late result"] });
    await flushPromises();
    expect(wrapper.get("textarea").element.value).toBe("Do not touch");
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("does not overwrite edits made while polishing is pending", async () => {
    let finish!: (result: PolishResult) => void;
    const { wrapper } = mountPastePanel(() => new Promise<PolishResult>((resolve) => { finish = resolve; }));
    await wrapper.get('[aria-label="智能粘贴"]').trigger("click");
    await flushPromises();
    await wrapper.get("textarea").setValue("Changed while waiting");
    finish({ items: ["Late result"] });
    await flushPromises();
    expect(wrapper.get("textarea").element.value).toBe("Changed while waiting");
  });

  it("leaves notes untouched for an empty clipboard", async () => {
    const polish = vi.fn(async () => null);
    const { wrapper } = mountPastePanel(polish, "  ");
    await wrapper.get('[aria-label="智能粘贴"]').trigger("click");
    await flushPromises();
    expect(polish).not.toHaveBeenCalled();
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.get('[aria-label="智能粘贴"]').attributes("disabled")).toBeUndefined();
  });
});

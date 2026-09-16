import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NDropdown, NModal } from "naive-ui";
import SpacePanel from "../components/SpacePanel.vue";
import TextPanel from "../components/TextPanel.vue";
import TodoPanel from "../components/TodoPanel.vue";
import QuickButtons from "../components/QuickButtons.vue";
import { DEFAULT_TITLES } from "../state/defaults";

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); });

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

  it("preserves a note selection when the AI toolbar opens and does not send content", async () => {
    const polish = vi.fn();
    const wrapper = mount(SpacePanel, { props: {
      spaces: [{ id: "notes", title: "Notes", lines: [{ text: "Rewrite only this part", indent: 0 }] }],
      activeSpaceId: "notes", language: "en", polish,
    }, attachTo: document.body });
    wrappers.push(wrapper);
    const textarea = wrapper.get("textarea");
    textarea.element.setSelectionRange(0, 7);
    await textarea.trigger("select");
    await wrapper.get('[aria-label="AI assistant"]').trigger("mousedown");
    await wrapper.get('[aria-label="AI assistant"]').trigger("click");
    const menu = wrapper.findComponent(TextPanel).findComponent(NDropdown);
    const options = menu.props("options") as { key: string; disabled?: boolean }[];
    expect(options.map((option) => option.key)).toEqual(["smart-paste", "smart-polish"]);
    expect(options.find((option) => option.key === "smart-polish")?.disabled).toBe(false);
    expect(textarea.element.selectionStart).toBe(0);
    expect(textarea.element.selectionEnd).toBe(7);
    expect(polish).not.toHaveBeenCalled();
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("disables selection polishing when no text is selected", async () => {
    const wrapper = mount(SpacePanel, { props: {
      spaces: [{ id: "notes", title: "Notes", lines: [] }],
      activeSpaceId: "notes", polish: vi.fn(),
    }});
    wrappers.push(wrapper);
    await wrapper.get('[aria-label="AI 助手"]').trigger("click");
    const options = wrapper.findComponent(TextPanel).findComponent(NDropdown).props("options") as { key: string; disabled?: boolean }[];
    expect(options.find((option) => option.key === "smart-polish")?.disabled).toBe(true);
  });
});

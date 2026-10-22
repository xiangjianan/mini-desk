import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NModal } from "naive-ui";
import SpacePanel from "../components/SpacePanel.vue";
import TodoPanel from "../components/TodoPanel.vue";
import QuickButtons from "../components/QuickButtons.vue";
import { DEFAULT_TITLES } from "../state/defaults";

const wrappers: ReturnType<typeof mount>[] = [];
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

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
});

describe("ordinary header paste actions", () => {
  function setClipboard(text: string) {
    const readText = vi.fn().mockResolvedValue(text);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
    return readText;
  }

  it.each(["zh", "en"] as const)("keeps a plain note-header paste button in %s", async language => {
    const readText = setClipboard(" pasted text");
    const wrapper = mount(SpacePanel, { props: {
      spaces: [{ id: "notes", title: "Notes", lines: [{ text: "Keep", indent: 0 }] }], activeSpaceId: "notes", language,
    }, attachTo: document.body });
    wrappers.push(wrapper);
    const button = wrapper.get('.panel-header .space-paste-button');
    expect(button.attributes("aria-label")).toBe(language === "zh" ? "粘贴" : "Paste");
    wrapper.get("textarea").element.setSelectionRange(0, 4);
    await button.trigger("click");
    await flushPromises();
    expect(readText).toHaveBeenCalledTimes(1);
    expect(wrapper.get("textarea").element.value).toBe("Keep pasted text");
    expect(button.classes()).not.toContain("desk-ai-button");
  });

  it("pastes raw reminder lines into the selected list from its heading", async () => {
    setClipboard("First raw line\nSecond raw line");
    const wrapper = mount(TodoPanel, { props: {
      titles: DEFAULT_TITLES, todos: { morning: [], noon: [], evening: [] },
      todoLists: [{ id: "morning", title: "Morning", collapsed: false, compact: true }, { id: "noon", title: "Noon", collapsed: false, compact: true }],
    }});
    wrappers.push(wrapper);
    await wrapper.findAll('.todo-heading-actions .todo-paste-button')[1].trigger("click");
    await flushPromises();
    expect(wrapper.emitted("createFromText")).toEqual([["noon", ["First raw line", "Second raw line"]]]);
    expect(wrapper.emitted("create")).toBeUndefined();
    await wrapper.get('.panel-header .todo-area-paste-button').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("createFromText")?.at(-1)).toEqual(["morning", ["First raw line", "Second raw line"]]);
  });

  it("creates ordinary quick actions in the header or tag destination", async () => {
    setClipboard("https://example.com/path");
    const wrapper = mount(QuickButtons, { props: {
      title: "Actions", buttons: [{ id: "existing", title: "Existing", type: "text", value: "Keep", hidden: false, tagId: "work" }], tags: [{ id: "work", title: "Work" }], showHidden: false,
    }});
    wrappers.push(wrapper);
    await wrapper.get('.panel-header .quick-paste-button').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("save")?.at(-1)?.[0]).toMatchObject({ type: "link", value: "https://example.com/path", tagTitle: "" });
    await wrapper.get('[data-tag-id="work"] .quick-tag-paste-button').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("save")?.at(-1)?.[0]).toMatchObject({ type: "link", value: "https://example.com/path", tagTitle: "Work" });
  });
});

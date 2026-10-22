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

  it("opens list creation from the header", async () => {
    const wrapper = mount(QuickButtons, { props: {
      title: "Actions", buttons: [], showHidden: false, language: "en",
    }});
    wrappers.push(wrapper);
    await wrapper.get(".quick-add-button").trigger("click");
    expect(wrapper.findAllComponents(NModal).find(modal => modal.props("show"))?.props("title")).toBe("New list");
    expect(wrapper.emitted("save")).toBeUndefined();
  });
});

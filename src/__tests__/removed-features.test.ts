import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp } from "./helpers/mount-app";
import SpacePanel from "../components/SpacePanel.vue";
import { defaultState, STORAGE_KEY } from "../state/defaults";
import { loadState, getSerializableState } from "../state/storage";

vi.mock("naive-ui", async () => {
  const { createNaiveUiStubModule } = await import("./helpers/naive-ui-mock");
  return createNaiveUiStubModule();
});

afterEach(() => { window.location.hash = ""; vi.restoreAllMocks(); });

describe("removed AI and mobile capture features", () => {
  it("loads legacy board content while dropping pairing and AI configuration", () => {
    const legacy = defaultState();
    legacy.workspaces[0]!.spaces[0]!.lines = [{ text: "Keep this note", indent: 0 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...legacy, polishCode: "AB2CDE4FGHJK", workspaces: legacy.workspaces.map(w => ({ ...w, inbox: { code: "AB2CDE4FGHJK", todoListId: "morning", noteTarget: w.spaces[0]!.id, lastSeenAt: 0 } })) }));
    const state = loadState();
    expect(state.workspaces[0]!.spaces[0]!.lines[0]!.text).toBe("Keep this note");
    const serialized = JSON.stringify(getSerializableState(state));
    expect(serialized).not.toMatch(/polishCode|"inbox"/);
  });

  it("keeps ordinary note paste available and appends clipboard text", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { read: undefined, readText: vi.fn().mockResolvedValue("\nSecond line") } });
    const wrapper = mount(SpacePanel, { props: { spaces: [{ id: "notes", title: "Notes", lines: [{ text: "First line", indent: 0 }] }], activeSpaceId: "notes" }, attachTo: document.body });
    try {
      expect(wrapper.find('[aria-label="智能粘贴"]').exists()).toBe(false);
      const panel = wrapper.findComponent({ name: "TextPanel" });
      await (panel.vm as unknown as { appendPaste(): Promise<void> }).appendPaste();
      await flushPromises();
      expect(wrapper.get("textarea").element.value).toBe("First line\nSecond line");
      expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe("notes");
    } finally { wrapper.unmount(); if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor); else Reflect.deleteProperty(navigator, "clipboard"); }
  });

  it("shows desktop guidance on small screens even with an old pairing link", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(query => ({ matches: query === "(max-width: 940px)", media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    window.location.hash = "#inbox=AB2CDE4FGHJK";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const wrapper = mountApp();
    try {
      await flushPromises();
      await vi.dynamicImportSettled();
      await flushPromises();
      expect(wrapper.get(".mobile-desktop-guide").text()).toContain("完整工作台，请在电脑端打开");
      expect(wrapper.find("textarea").exists()).toBe(false);
      expect(wrapper.find(".workbench-shell").exists()).toBe(false);
      expect(fetchSpy.mock.calls.some(([url]) => /inbox|polish|relay/.test(String(url)))).toBe(false);
    } finally { wrapper.unmount(); window.matchMedia = original; }
  });
});

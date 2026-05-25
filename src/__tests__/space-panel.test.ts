import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SpacePanel from "../components/SpacePanel.vue";
import TextPanel from "../components/TextPanel.vue";
import type { WorkspaceSpace } from "../types";

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

function mountSpacePanel(spaces: WorkspaceSpace[], activeSpaceId = spaces[0].id) {
  return mount(SpacePanel, {
    props: {
      spaces,
      activeSpaceId,
    },
    global: {
      stubs: {
        Dropdown: dropdownStub,
        NDropdown: dropdownStub,
      },
    },
  });
}

describe("SpacePanel", () => {
  it("renders tabs, switches spaces, and creates new spaces", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ]);

    expect(wrapper.findAll(".space-tab").map((tab) => tab.text())).toEqual(["工作空间", "项目"]);

    await wrapper.findAll(".space-tab")[1].trigger("click");
    await wrapper.get(".space-add-button").trigger("click");

    expect(wrapper.emitted("activate")?.[0]).toEqual(["project"]);
    expect(wrapper.emitted("create")?.[0]).toEqual([]);
  });

  it("renames and updates the active space", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    wrapper.getComponent(TextPanel).vm.$emit("update", [{ text: "记录", indent: 0 }]);

    expect(wrapper.emitted("update")?.[0]).toEqual(["workspace", [{ text: "记录", indent: 0 }]]);
  });

  it("edits a space name from the tab double click", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    await wrapper.get(".space-tab").trigger("dblclick");
    await wrapper.get(".space-tab-edit-input").setValue("资料");
    await wrapper.get(".space-tab-edit-input").trigger("keydown.enter");

    expect(wrapper.emitted("rename")?.[0]).toEqual(["workspace", "资料"]);
  });

  it("starts editing a newly created active space name", async () => {
    const wrapper = mount(SpacePanel, {
      attachTo: document.body,
      props: {
        activeSpaceId: "new",
        editSpaceId: "new",
        spaces: [
          { id: "old", title: "旧空间", lines: [] },
          { id: "new", title: "新空间", lines: [] },
        ],
      },
      global: {
        stubs: {
          Dropdown: dropdownStub,
          NDropdown: dropdownStub,
        },
      },
    });

    await wrapper.vm.$nextTick();

    const input = wrapper.get(".space-tab-edit-input").element as HTMLInputElement;
    expect(input.value).toBe("新空间");
    expect(document.activeElement).toBe(input);
    wrapper.unmount();
  });

  it("does not save a space name while Chinese IME composition is confirming", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    await wrapper.get(".space-tab").trigger("dblclick");
    await wrapper.get(".space-tab-edit-input").setValue("ziliao");
    await wrapper.get(".space-tab-edit-input").trigger("compositionstart");
    await wrapper.get(".space-tab-edit-input").trigger("keydown.enter", { isComposing: true, keyCode: 229 });

    expect(wrapper.emitted("rename")).toBeUndefined();
    expect(wrapper.find(".space-tab-edit-input").exists()).toBe(true);

    await wrapper.get(".space-tab-edit-input").trigger("compositionend");
    await wrapper.get(".space-tab-edit-input").trigger("keydown.enter");

    expect(wrapper.emitted("rename")?.[0]).toEqual(["workspace", "ziliao"]);
  });

  it("opens tab context actions for editing and deleting", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
    ], "project");

    await wrapper.findAll(".space-tab")[1].trigger("contextmenu");

    expect(wrapper.findAll(".dropdown-option").map((option) => option.text())).toEqual(["编辑", "删除"]);

    await wrapper.findAll(".dropdown-option").find((option) => option.text() === "删除")?.trigger("click");

    expect(wrapper.emitted("delete")?.[0]).toEqual(["project"]);
  });

  it("prevents deleting the final remaining space from the tab context menu", async () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    await wrapper.get(".space-tab").trigger("contextmenu");

    expect(wrapper.get('[data-key="delete"]').attributes("disabled")).toBeDefined();

    await wrapper.get('[data-key="delete"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
  });

  it("does not repeat the active space title or show a permanent delete button above the editor", () => {
    const wrapper = mountSpacePanel([{ id: "workspace", title: "工作空间", lines: [] }]);

    expect(wrapper.find(".space-text-panel .panel-header").exists()).toBe(false);
    expect(wrapper.find(".space-delete-button").exists()).toBe(false);
  });

  it("emits tab reorder while keeping the add button fixed", async () => {
    const wrapper = mountSpacePanel([
      { id: "workspace", title: "工作空间", lines: [] },
      { id: "project", title: "项目", lines: [] },
      { id: "notes", title: "资料", lines: [] },
    ]);

    await wrapper.findAll(".space-tab")[0].trigger("dragstart");
    await wrapper.findAll(".space-tab")[2].trigger("drop");
    await wrapper.findAll(".space-tab")[0].trigger("dragend");

    expect(wrapper.emitted("reorder")?.[0]).toEqual(["workspace", "notes"]);
    expect(wrapper.find(".space-add-button").exists()).toBe(true);
  });

  it("translates mouse wheel movement into horizontal tab scrolling", async () => {
    const wrapper = mountSpacePanel(
      Array.from({ length: 8 }, (_, index) => ({
        id: `space-${index}`,
        title: `空间 ${index + 1}`,
        lines: [],
      })),
    );
    const tabs = wrapper.get(".space-tabs").element as HTMLElement;
    Object.defineProperty(tabs, "scrollWidth", { value: 900, configurable: true });
    Object.defineProperty(tabs, "clientWidth", { value: 240, configurable: true });
    tabs.scrollLeft = 0;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 72 });

    tabs.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(tabs.scrollLeft).toBe(72);
    wrapper.unmount();
  });

  it("does not reserve an empty horizontal scrollbar gutter for workspace tabs", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const workspaceTabsRule = styles.match(/\.workspace-panel \.space-tabs \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(workspaceTabsRule).toContain("overflow-x: auto");
    expect(workspaceTabsRule).not.toContain("overflow-x: scroll");
    expect(workspaceTabsRule).not.toContain("scrollbar-gutter: stable");
  });
});
